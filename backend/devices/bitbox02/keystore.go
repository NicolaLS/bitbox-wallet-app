// Copyright 2018 Shift Devices AG
// Copyright 2020 Shift Crypto AG
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package bitbox02

import (
	"bytes"
	"math/big"
	"sync"

	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/accounts"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/coins/btc"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/coins/btc/blockchain"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/coins/btc/types"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/coins/btc/util"
	coinpkg "github.com/BitBoxSwiss/bitbox-wallet-app/backend/coins/coin"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/coins/eth"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/coins/ltc"
	keystorePkg "github.com/BitBoxSwiss/bitbox-wallet-app/backend/keystore"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/signing"
	"github.com/BitBoxSwiss/bitbox-wallet-app/util/errp"
	"github.com/BitBoxSwiss/bitbox02-api-go/api/firmware"
	"github.com/BitBoxSwiss/bitbox02-api-go/api/firmware/messages"
	"github.com/BitBoxSwiss/bitbox02-api-go/util/semver"
	"github.com/btcsuite/btcd/btcutil"
	"github.com/btcsuite/btcd/btcutil/hdkeychain"
	"github.com/btcsuite/btcd/chaincfg"
	ethTypes "github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/params"
	"github.com/sirupsen/logrus"
)

type keystore struct {
	device *Device
	log    *logrus.Entry

	rootFingerMu sync.Mutex
	rootFinger   []byte // cached result of RootFingerprint
}

// Type implements keystore.Keystore.
func (keystore *keystore) Type() keystorePkg.Type {
	return keystorePkg.TypeHardware
}

// Name implements keystore.Keystore.
func (keystore *keystore) Name() (string, error) {
	info, err := keystore.device.DeviceInfo()
	if err != nil {
		return "", errp.WithStack(err)
	}
	return info.Name, nil
}

// RootFingerprint implements keystore.Keystore.
func (keystore *keystore) RootFingerprint() ([]byte, error) {
	keystore.rootFingerMu.Lock()
	defer keystore.rootFingerMu.Unlock()
	if keystore.rootFinger != nil {
		return keystore.rootFinger, nil
	}
	res, err := keystore.device.RootFingerprint()
	if err != nil {
		return nil, err
	}
	keystore.rootFinger = res
	return res, nil
}

// SupportsCoin implements keystore.Keystore.
func (keystore *keystore) SupportsCoin(coin coinpkg.Coin) bool {
	switch specificCoin := coin.(type) {
	case *btc.Coin:
		if (coin.Code() == coinpkg.CodeLTC || coin.Code() == coinpkg.CodeTLTC) && !keystore.device.SupportsLTC() {
			return false
		}
		return true
	case *eth.Coin:
		if specificCoin.ERC20Token() != nil {
			return keystore.device.SupportsERC20(specificCoin.ERC20Token().ContractAddress().String())
		}
		return keystore.device.SupportsETH(specificCoin.ChainID())
	default:
		return false
	}
}

// SupportsAccount implements keystore.Keystore.
func (keystore *keystore) SupportsAccount(coin coinpkg.Coin, meta interface{}) bool {
	if !keystore.SupportsCoin(coin) {
		return false
	}
	switch coin.(type) {
	case *btc.Coin:
		scriptType := meta.(signing.ScriptType)
		if scriptType == signing.ScriptTypeP2TR {
			// Taproot available since v9.10.0.
			switch coin.Code() {
			case coinpkg.CodeBTC, coinpkg.CodeTBTC, coinpkg.CodeRBTC:
				return keystore.device.Version().AtLeast(semver.NewSemVer(9, 10, 0))
			default:
				return false
			}
		}
		return scriptType != signing.ScriptTypeP2PKH
	default:
		return true
	}
}

// SupportsUnifiedAccounts implements keystore.Keystore.
func (keystore *keystore) SupportsUnifiedAccounts() bool {
	return true
}

// SupportsMultipleAccounts implements keystore.Keystore.
func (keystore *keystore) SupportsMultipleAccounts() bool {
	return true
}

// CanVerifyAddress implements keystore.Keystore.
func (keystore *keystore) CanVerifyAddress(coin coinpkg.Coin) (bool, bool, error) {
	const optional = false
	switch coin.(type) {
	case *btc.Coin:
		_, ok := btcMsgCoinMap[coin.Code()]
		return ok, optional, nil
	case *eth.Coin:
		return true, optional, nil
	}
	return false, false, nil
}

// VerifyAddress implements keystore.Keystore.
func (keystore *keystore) VerifyAddress(
	configuration *signing.Configuration, coin coinpkg.Coin) error {
	canVerifyAddress, _, err := keystore.CanVerifyAddress(coin)
	if err != nil {
		return err
	}
	if !canVerifyAddress {
		panic("CanVerifyAddress must be true")
	}
	switch specificCoin := coin.(type) {
	case *btc.Coin:
		msgScriptType, ok := btcMsgScriptTypeMap[configuration.ScriptType()]
		if !ok {
			panic("unsupported scripttype")
		}
		_, err = keystore.device.BTCAddress(
			btcMsgCoinMap[coin.Code()],
			configuration.AbsoluteKeypath().ToUInt32(),
			firmware.NewBTCScriptConfigSimple(msgScriptType),
			true,
		)
		if firmware.IsErrorAbort(err) {
			// No special action on user abort.
			return nil
		}
		if err != nil {
			return err
		}
	case *eth.Coin:
		// No contract address, displays 'Ethereum' etc. depending on `msgCoin`.
		contractAddress := []byte{}
		if specificCoin.ERC20Token() != nil {
			// Displays the erc20 unit based on the contract.
			contractAddress = specificCoin.ERC20Token().ContractAddress().Bytes()
		}
		_, err := keystore.device.ETHPub(
			specificCoin.ChainID(), configuration.AbsoluteKeypath().ToUInt32(),
			messages.ETHPubRequest_ADDRESS, true, contractAddress)
		if firmware.IsErrorAbort(err) {
			// No special action on user abort.
			return nil
		}
		if err != nil {
			return err
		}
	default:
		return errp.New("unsupported coin")
	}
	return nil
}

// CanVerifyExtendedPublicKey implements keystore.Keystore.
func (keystore *keystore) CanVerifyExtendedPublicKey() bool {
	return true
}

func (keystore *keystore) VerifyExtendedPublicKey(
	coin coinpkg.Coin, configuration *signing.Configuration) error {
	if !keystore.CanVerifyExtendedPublicKey() {
		panic("CanVerifyExtendedPublicKey must be true")
	}
	switch specificCoin := coin.(type) {
	case *btc.Coin:
		msgCoin, ok := btcMsgCoinMap[coin.Code()]
		if !ok {
			return errp.New("unsupported coin")
		}
		var msgXPubType messages.BTCPubRequest_XPubType
		switch specificCoin.Net().Net {
		case chaincfg.MainNetParams.Net, ltc.MainNetParams.Net:
			msgXPubTypes := map[signing.ScriptType]messages.BTCPubRequest_XPubType{
				signing.ScriptTypeP2WPKHP2SH: messages.BTCPubRequest_YPUB,
				signing.ScriptTypeP2WPKH:     messages.BTCPubRequest_ZPUB,
			}
			msgXPubType, ok = msgXPubTypes[configuration.ScriptType()]
			if !ok {
				msgXPubType = messages.BTCPubRequest_XPUB
			}
		case chaincfg.TestNet3Params.Net, ltc.TestNet4Params.Net:
			msgXPubType = messages.BTCPubRequest_TPUB
		default:
			msgXPubType = messages.BTCPubRequest_XPUB
		}
		_, err := keystore.device.BTCXPub(
			msgCoin, configuration.AbsoluteKeypath().ToUInt32(), msgXPubType, true)
		if firmware.IsErrorAbort(err) {
			// No special action taken on user abort.
			return nil
		}
		if err != nil {
			return err
		}
	case *eth.Coin:
		return errp.New("unsupported operation")
	}
	return nil
}

// ExtendedPublicKey implements keystore.Keystore.
func (keystore *keystore) ExtendedPublicKey(
	coin coinpkg.Coin, keyPath signing.AbsoluteKeypath) (*hdkeychain.ExtendedKey, error) {
	switch specificCoin := coin.(type) {
	case *btc.Coin:
		msgCoin, ok := btcMsgCoinMap[coin.Code()]
		if !ok {
			return nil, errp.New("unsupported coin")
		}
		xpubStr, err := keystore.device.BTCXPub(
			msgCoin, keyPath.ToUInt32(),
			messages.BTCPubRequest_XPUB, false)
		if err != nil {
			return nil, err
		}
		return hdkeychain.NewKeyFromString(xpubStr)
	case *eth.Coin:
		// The BitBox02 only accepts four-element keypaths to get the xpub, e.g.
		// m/44'/60'/0'/0.
		//
		// In Ethereum, the element defining the account is the fifth element, e.g. the 10th account
		// is at m/44'/60'/0'/0/9.
		//
		// To get the xpub at the account-level keypath, we workaround this by getting the base xpub
		// and deriving the last step here.
		keypathUint32 := keyPath.ToUInt32()
		if len(keypathUint32) == 5 {
			xpubStr, err := keystore.device.ETHPub(
				specificCoin.ChainID(), keypathUint32[:4], messages.ETHPubRequest_XPUB, false, []byte{})
			if err != nil {
				return nil, err
			}
			xpub, err := hdkeychain.NewKeyFromString(xpubStr)
			if err != nil {
				return nil, err
			}
			return xpub.Derive(keypathUint32[4])
		}
		xpubStr, err := keystore.device.ETHPub(
			specificCoin.ChainID(), keypathUint32, messages.ETHPubRequest_XPUB, false, []byte{})
		if err != nil {
			return nil, err
		}
		return hdkeychain.NewKeyFromString(xpubStr)
	default:
		return nil, errp.New("unsupported coin")
	}
}

func (keystore *keystore) signBTCTransaction(btcProposedTx *btc.ProposedTransaction) error {
	tx := btcProposedTx.TXProposal.Transaction

	// scriptConfigs represent the script configurations of a specific account and include the
	// script type (e.g. p2wpkh, p2tr..) and the account keypath
	scriptConfigs := []*messages.BTCScriptConfigWithKeypath{}
	// addScriptConfig returns the index of the scriptConfig in scriptConfigs, adding it if it isn't
	// present. Must be a Simple configuration.
	addScriptConfig := func(scriptConfig *messages.BTCScriptConfigWithKeypath) int {
		for i, sc := range scriptConfigs {
			if sc.ScriptConfig.Config.(*messages.BTCScriptConfig_SimpleType_).SimpleType == scriptConfig.ScriptConfig.Config.(*messages.BTCScriptConfig_SimpleType_).SimpleType {
				return i
			}
		}
		scriptConfigs = append(scriptConfigs, scriptConfig)
		return len(scriptConfigs) - 1
	}

	coin := btcProposedTx.TXProposal.Coin.(*btc.Coin)
	msgCoin, ok := btcMsgCoinMap[coin.Code()]
	if !ok {
		return errp.Newf("coin not supported: %s", coin.Code())
	}

	// iterate over the tx inputs to add the related scriptconfigs and translate into `firmware.BTCTxInput` format.
	inputs := make([]*firmware.BTCTxInput, len(tx.TxIn))
	for inputIndex, txIn := range tx.TxIn {
		prevOut, ok := btcProposedTx.TXProposal.PreviousOutputs[txIn.PreviousOutPoint]
		if !ok {
			keystore.log.Error("There needs to be exactly one output being spent per input.")
			return errp.New("There needs to be exactly one output being spent per input.")
		}

		inputAddress := prevOut.Address

		accountConfiguration := inputAddress.AccountConfiguration
		msgScriptType, ok := btcMsgScriptTypeMap[accountConfiguration.ScriptType()]
		if !ok {
			return errp.Newf("Unsupported script type %s", accountConfiguration.ScriptType())
		}
		scriptConfigIndex := addScriptConfig(&messages.BTCScriptConfigWithKeypath{
			ScriptConfig: firmware.NewBTCScriptConfigSimple(msgScriptType),
			Keypath:      accountConfiguration.AbsoluteKeypath().ToUInt32(),
		})

		var bip352Pubkey []byte
		if btcProposedTx.TXProposal.SilentPaymentAddress != "" {
			var err error
			bip352Pubkey, err = inputAddress.BIP352Pubkey()
			if err != nil {
				return err
			}
		}
		inputs[inputIndex] = &firmware.BTCTxInput{
			Input: &messages.BTCSignInputRequest{
				PrevOutHash:       txIn.PreviousOutPoint.Hash[:],
				PrevOutIndex:      txIn.PreviousOutPoint.Index,
				PrevOutValue:      uint64(prevOut.TxOut.Value),
				Sequence:          txIn.Sequence,
				Keypath:           inputAddress.Configuration.AbsoluteKeypath().ToUInt32(),
				ScriptConfigIndex: uint32(scriptConfigIndex),
			},
			BIP352Pubkey: bip352Pubkey,
		}
	}

	txChangeAddress := btcProposedTx.TXProposal.ChangeAddress

	// outputScriptConfigs represent the script configurations of a specific account and include the
	// script type (e.g. p2wpkh, p2tr..) and the account keypath
	outputScriptConfigs := []*messages.BTCScriptConfigWithKeypath{}
	// addOutputScriptConfig returns the index of the scriptConfig in outputScriptConfigs, adding it if it isn't
	// present. Must be a Simple configuration.
	addOutputScriptConfig := func(scriptConfig *messages.BTCScriptConfigWithKeypath) uint32 {
		for i, sc := range outputScriptConfigs {
			if sc.ScriptConfig.Config.(*messages.BTCScriptConfig_SimpleType_).SimpleType == scriptConfig.ScriptConfig.Config.(*messages.BTCScriptConfig_SimpleType_).SimpleType {
				return uint32(i)
			}
		}
		outputScriptConfigs = append(outputScriptConfigs, scriptConfig)
		return uint32(len(outputScriptConfigs) - 1)
	}

	// iterate over tx outputs to add the related scriptconfigs, flag internal addresses and build
	// the output signing requests.
	outputs := make([]*messages.BTCSignOutputRequest, len(tx.TxOut))
	for index, txOut := range tx.TxOut {
		var msgOutputType messages.BTCOutputType
		var payload []byte
		var silentPayment *messages.BTCSignOutputRequest_SilentPayment
		isSilentPaymentOutput := index == btcProposedTx.TXProposal.OutIndex && btcProposedTx.TXProposal.SilentPaymentAddress != ""
		if isSilentPaymentOutput {
			silentPayment = &messages.BTCSignOutputRequest_SilentPayment{
				Address: btcProposedTx.TXProposal.SilentPaymentAddress,
			}
		} else {
			outputAddress, err := util.AddressFromPkScript(txOut.PkScript, coin.Net())
			if err != nil {
				return err
			}
			switch outputAddress.(type) {
			case *btcutil.AddressPubKeyHash:
				msgOutputType = messages.BTCOutputType_P2PKH
			case *btcutil.AddressScriptHash:
				msgOutputType = messages.BTCOutputType_P2SH
			case *btcutil.AddressWitnessPubKeyHash:
				msgOutputType = messages.BTCOutputType_P2WPKH
			case *btcutil.AddressWitnessScriptHash:
				msgOutputType = messages.BTCOutputType_P2WSH
			case *btcutil.AddressTaproot:
				msgOutputType = messages.BTCOutputType_P2TR
			default:
				return errp.Newf("unsupported output type: %v", outputAddress)
			}
			payload = outputAddress.ScriptAddress()
		}

		// Could also determine change using `outputAccountAddress != nil AND second-to-last keypath element of outputAddress is 1`.
		isChange := txChangeAddress != nil && bytes.Equal(
			txChangeAddress.PubkeyScript(),
			txOut.PkScript,
		)

		// outputAddress represents the same address as outputAddress, but embeds the account configuration.
		// It is nil if the address is external.
		outputAddress, sameAccount, err := btcProposedTx.GetKeystoreAddress(btcProposedTx.SendingAccount, blockchain.NewScriptHashHex(txOut.PkScript))
		if err != nil {
			return errp.Newf("failed to get address: %v", err)
		}

		isOurs := outputAddress != nil
		if !isChange && !keystore.device.Version().AtLeast(semver.NewSemVer(9, 15, 0)) {
			// For firmware older than 9.15.0, non-change outputs cannot be marked internal.
			isOurs = false
		}

		var keypath []uint32
		var scriptConfigIndex int
		var outputScriptConfigIndex *uint32
		if isOurs {
			accountConfiguration := outputAddress.AccountConfiguration
			msgScriptType, ok := btcMsgScriptTypeMap[accountConfiguration.ScriptType()]
			if !ok {
				return errp.Newf("Unsupported script type %s", accountConfiguration.ScriptType())
			}
			switch {
			case sameAccount:
				keypath = outputAddress.Configuration.AbsoluteKeypath().ToUInt32()
				scriptConfigIndex = addScriptConfig(&messages.BTCScriptConfigWithKeypath{
					ScriptConfig: firmware.NewBTCScriptConfigSimple(msgScriptType),
					Keypath:      accountConfiguration.AbsoluteKeypath().ToUInt32(),
				})
			case keystore.device.Version().AtLeast(semver.NewSemVer(9, 22, 0)):
				keypath = outputAddress.Configuration.AbsoluteKeypath().ToUInt32()
				outputScriptConfigIdx := addOutputScriptConfig(&messages.BTCScriptConfigWithKeypath{
					ScriptConfig: firmware.NewBTCScriptConfigSimple(msgScriptType),
					Keypath:      accountConfiguration.AbsoluteKeypath().ToUInt32(),
				})
				outputScriptConfigIndex = &outputScriptConfigIdx
			default:
				isOurs = false
			}
		}

		outputs[index] = &messages.BTCSignOutputRequest{
			Ours:                    isOurs,
			Type:                    msgOutputType,
			Value:                   uint64(txOut.Value),
			Payload:                 payload,
			Keypath:                 keypath,
			ScriptConfigIndex:       uint32(scriptConfigIndex),
			SilentPayment:           silentPayment,
			OutputScriptConfigIndex: outputScriptConfigIndex,
		}
	}

	// Provide the previous transaction for each input if needed.
	if firmware.BTCSignNeedsPrevTxs(scriptConfigs) {
		for inputIndex, txIn := range tx.TxIn {
			keystore.log.Infof("getting prevTx of input %d/%d", inputIndex+1, len(tx.TxIn))
			prevTx, err := btcProposedTx.GetPrevTx(txIn.PreviousOutPoint.Hash)
			if err != nil {
				keystore.log.WithError(err).Errorf("getting prevTx of input failed for input %d/%d", inputIndex+1, len(tx.TxIn))
				return err
			}
			inputs[inputIndex].PrevTx = firmware.NewBTCPrevTxFromBtcd(prevTx)
		}
	}

	// Handle displaying formatting in btc or sats.
	formatUnit := messages.BTCSignInitRequest_DEFAULT
	if btcProposedTx.FormatUnit == coinpkg.BtcUnitSats {
		formatUnit = messages.BTCSignInitRequest_SAT
	}

	// Payment request handling
	newBTCPaymentRequest := func(txPaymentRequest *accounts.PaymentRequest) *messages.BTCPaymentRequestRequest {
		memos := []*messages.BTCPaymentRequestRequest_Memo{}
		for _, m := range txPaymentRequest.Memos {
			memo := messages.BTCPaymentRequestRequest_Memo{
				Memo: &messages.BTCPaymentRequestRequest_Memo_TextMemo_{
					TextMemo: &messages.BTCPaymentRequestRequest_Memo_TextMemo{
						Note: m.Note,
					},
				},
			}
			memos = append(memos, &memo)
		}

		return &messages.BTCPaymentRequestRequest{
			RecipientName: txPaymentRequest.RecipientName,
			Nonce:         txPaymentRequest.Nonce,
			TotalAmount:   txPaymentRequest.TotalAmount,
			Signature:     txPaymentRequest.Signature,
			Memos:         memos,
		}
	}

	var btcPaymentRequests []*messages.BTCPaymentRequestRequest
	paymentRequest := btcProposedTx.TXProposal.PaymentRequest
	if paymentRequest != nil {
		btcPaymentRequests = []*messages.BTCPaymentRequestRequest{
			newBTCPaymentRequest(paymentRequest),
		}
		prIndex := uint32(0)
		outputs[btcProposedTx.TXProposal.OutIndex].PaymentRequestIndex = &prIndex
	}

	signResult, err := keystore.device.BTCSign(
		msgCoin,
		scriptConfigs,
		outputScriptConfigs,
		&firmware.BTCTx{
			Version:         uint32(tx.Version),
			Inputs:          inputs,
			Outputs:         outputs,
			Locktime:        tx.LockTime,
			PaymentRequests: btcPaymentRequests,
		},
		formatUnit,
	)
	if firmware.IsErrorAbort(err) {
		return errp.WithStack(keystorePkg.ErrSigningAborted)
	}
	if err != nil {
		return err
	}
	for index, generatedOutput := range signResult.GeneratedOutputs {
		isSilentPaymentOutput := index == btcProposedTx.TXProposal.OutIndex && btcProposedTx.TXProposal.SilentPaymentAddress != ""
		if !isSilentPaymentOutput {
			return errp.New("expected silent payment output")
		}
		btcProposedTx.TXProposal.Transaction.TxOut[index].PkScript = generatedOutput
	}
	for index, signature := range signResult.Signatures {
		btcProposedTx.Signatures[index] = &types.Signature{
			R: big.NewInt(0).SetBytes(signature[:32]),
			S: big.NewInt(0).SetBytes(signature[32:]),
		}
	}
	return nil
}

func (keystore *keystore) signETHTransaction(txProposal *eth.TxProposal) error {
	var signature []byte
	var err error
	tx := txProposal.Tx
	recipient := tx.To()
	if recipient == nil {
		return errp.New("contract creation not supported")
	}
	txType := tx.Type()
	switch { // version bytes defined in EIP2718 https://eips.ethereum.org/EIPS/eip-2718
	case txType == 2:
		signature, err = keystore.device.ETHSignEIP1559(
			txProposal.Coin.ChainID(),
			txProposal.Keypath.ToUInt32(),
			tx.Nonce(),
			tx.GasTipCap(),
			tx.GasFeeCap(),
			tx.Gas(),
			*recipient,
			tx.Value(),
			tx.Data(),
			firmware.ETHIdentifyCase(txProposal.RecipientAddress),
		)
	case txType == 0:
		signature, err = keystore.device.ETHSign(
			txProposal.Coin.ChainID(),
			txProposal.Keypath.ToUInt32(),
			tx.Nonce(),
			tx.GasPrice(),
			tx.Gas(),
			*recipient,
			tx.Value(),
			tx.Data(),
			firmware.ETHIdentifyCase(txProposal.RecipientAddress),
		)
	default:
		return errp.New("unsupported transaction type")
	}
	if firmware.IsErrorAbort(err) {
		return errp.WithStack(keystorePkg.ErrSigningAborted)
	}
	if err != nil {
		return err
	}
	signedTx, err := txProposal.Tx.WithSignature(txProposal.Signer, signature)
	if err != nil {
		return err
	}
	txProposal.Tx = signedTx
	return nil
}

// SignTransaction implements keystore.Keystore.
func (keystore *keystore) SignTransaction(proposedTx interface{}) error {
	switch specificProposedTx := proposedTx.(type) {
	case *btc.ProposedTransaction:
		return keystore.signBTCTransaction(specificProposedTx)
	case *eth.TxProposal:
		return keystore.signETHTransaction(specificProposedTx)
	default:
		panic("unknown proposal type")
	}
}

// CanSignMessage implements keystore.Keystore.
func (keystore *keystore) CanSignMessage(code coinpkg.Code) bool {
	return code == coinpkg.CodeBTC || code == coinpkg.CodeETH
}

// SignBTCMessage implements keystore.Keystore.
func (keystore *keystore) SignBTCMessage(message []byte, keypath signing.AbsoluteKeypath, scriptType signing.ScriptType) ([]byte, error) {
	sc, ok := btcMsgScriptTypeMap[scriptType]
	if !ok {
		return nil, errp.Newf("scriptType not supported: %s", scriptType)
	}
	signResult, err := keystore.device.BTCSignMessage(
		messages.BTCCoin_BTC,
		&messages.BTCScriptConfigWithKeypath{
			ScriptConfig: firmware.NewBTCScriptConfigSimple(sc),
			Keypath:      keypath.ToUInt32(),
		},
		message,
	)
	return signResult.ElectrumSig65, err
}

// SignETHMessage implements keystore.Keystore.
func (keystore *keystore) SignETHMessage(message []byte, keypath signing.AbsoluteKeypath) ([]byte, error) {
	signature, err := keystore.device.ETHSignMessage(params.MainnetChainConfig.ChainID.Uint64(), keypath.ToUInt32(), message)
	if firmware.IsErrorAbort(err) {
		return nil, errp.WithStack(keystorePkg.ErrSigningAborted)
	}
	if err != nil {
		return nil, err
	}
	return signature, nil
}

// SignETHTypedMessage implements keystore.Keystore.
func (keystore *keystore) SignETHTypedMessage(chainId uint64, data []byte, keypath signing.AbsoluteKeypath) ([]byte, error) {
	signature, err := keystore.device.ETHSignTypedMessage(chainId, keypath.ToUInt32(), data)
	if firmware.IsErrorAbort(err) {
		return nil, errp.WithStack(keystorePkg.ErrSigningAborted)
	}
	if err != nil {
		return nil, err
	}
	return signature, nil
}

// SignETHWalletConnectTransaction implements keystore.Keystore.
func (keystore *keystore) SignETHWalletConnectTransaction(chainId uint64, tx *ethTypes.Transaction, keypath signing.AbsoluteKeypath) ([]byte, error) {
	signature, err := keystore.device.ETHSign(
		chainId,
		keypath.ToUInt32(),
		tx.Nonce(),
		tx.GasPrice(),
		tx.Gas(),
		*tx.To(),
		tx.Value(),
		tx.Data(),
		messages.ETHAddressCase_ETH_ADDRESS_CASE_MIXED,
	)
	if firmware.IsErrorAbort(err) {
		return nil, errp.WithStack(keystorePkg.ErrSigningAborted)
	}
	if err != nil {
		return nil, err
	}
	return signature, nil
}

// SupportsEIP1559 implements keystore.Keystore.
func (keystore *keystore) SupportsEIP1559() bool {
	return keystore.device.Version().AtLeast(semver.NewSemVer(9, 16, 0))
}

// SupportsPaymentRequests implements keystore.Keystore.
func (keystore *keystore) SupportsPaymentRequests() error {
	if keystore.device.Version().AtLeast(semver.NewSemVer(9, 20, 0)) {
		return nil
	}
	return keystorePkg.ErrFirmwareUpgradeRequired
}
