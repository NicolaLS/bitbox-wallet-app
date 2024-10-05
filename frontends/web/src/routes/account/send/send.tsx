/**
 * Copyright 2018 Shift Devices AG
 * Copyright 2023-2024 Shift Crypto AG
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { connectKeystore, FeeTargetCode, Fiat, getBalance, IAccount, IBalance, ISendTx, proposeTx, sendTx, TTxInput, TTxProposalResult } from '@/api/account';
import { syncdone } from '@/api/accountsync';
import { convertFromCurrency, convertToCurrency, parseExternalBtcAmount } from '@/api/coins';
import { isBitcoinBased } from '@/routes/account/utils';
import { Column, ColumnButtons, Grid, GuideWrapper, GuidedContent, Header, Main } from '@/components/layout';
import { HideAmountsButton } from '@/components/hideamountsbutton/hideamountsbutton';
import { View, ViewContent } from '@/components/view/view';
import { BackButton } from '@/components/backbutton/backbutton';
import { alertUser } from '@/components/alert/Alert';
import { Balance } from '@/components/balance/balance';
import { Button } from '@/components/forms';
import { ReceiverAddressInput } from './components/inputs/receiver-address-input';
import { MessageWaitDialog } from './components/dialogs/message-wait-dialog';
import { ConfirmSend } from './components/confirm/confirm';
import { CoinInput } from './components/inputs/coin-input';
import { FiatInput } from './components/inputs/fiat-input';
import { NoteInput } from './components/inputs/note-input';
import { TProposalError, txProposalErrorHandling } from './services';
import { FeeTargets } from './feetargets';
import { TSelectedUTXOs } from './utxos';
import { SendGuide } from './send-guide';
import { CoinControl } from './coin-control';
import style from './send.module.css';


type TProps = {
  account: IAccount;
  // undefined if bb02 is connected.
  bb01Paired: boolean | undefined;
  activeCurrency: Fiat;
}

export const Send = ({
  account,
  bb01Paired,
  activeCurrency,
}: TProps) => {
  const { t } = useTranslation();

  const [balance, setBalance] = useState<IBalance>();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isUpdatingProposal, setIsUpdatingProposal] = useState(false);

  // in case there are multiple parallel tx proposals we can ignore all other but the last one
  const lastProposalRef = useRef<Promise<TTxProposalResult> | null>(null);
  const proposeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [amount, setAmount] = useState('');
  const [fiatAmount, setFiatAmount] = useState('');
  const [sendAll, setSendAll] = useState(false);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [feeTarget, setFeeTarget] = useState<FeeTargetCode>();
  const [customFee, setCustomFee] = useState('');

  const selectedUTXOsRef = useRef<TSelectedUTXOs>({});
  // default true, false when amount was calculatedFromFiat.
  const updateFiatRef = useRef(true);

  const [errorHandling, setErrorHandling] = useState<TProposalError>({});

  const [proposalResult, setProposalResult] = useState<TTxProposalResult>();
  const [valid, setValid] = useState(false);

  const [sendResult, setSendResult] = useState<ISendTx>();
  const [note, setNote] = useState('');

  const send = async () => {
    const code = account.code;
    const connectResult = await connectKeystore(code);
    if (!connectResult.success) {
      return;
    }

    setIsConfirming(true);
    try {
      const result = await sendTx(code, note);
      setSendResult(result);
      setIsConfirming(false);
      setTimeout(() => setSendResult(undefined), 5000);
      if (result.success) {
        setSendAll(false);
        setIsConfirming(false);
        setRecipientAddress('');
        setFiatAmount('');
        setAmount('');
        setNote('');
        setCustomFee('');
        setProposalResult(undefined);
        selectedUTXOsRef.current = {};
      }
    } catch (err) {
      console.error(err);
    } finally {
      // The following method allows pressing escape again.
      setIsConfirming(false);
    }
  };

  const getValidTxInputData = useCallback((): Required<TTxInput> | false => {
    if (
      !recipientAddress
      || feeTarget === undefined
      || (!sendAll && !amount)
      || (feeTarget === 'custom' && !customFee)
    ) {
      return false;
    }
    return {
      address: recipientAddress,
      amount: amount,
      feeTarget: feeTarget,
      customFee: customFee,
      sendAll: (sendAll ? 'yes' : 'no'),
      selectedUTXOs: Object.keys(selectedUTXOsRef.current),
      paymentRequest: null,
    };
  }, [amount, customFee, feeTarget, recipientAddress, sendAll]);

  const convertToFiat = useCallback(async (amount: string) => {
    if (amount) {
      const coinCode = account.coinCode;
      const data = await convertToCurrency({
        amount,
        coinCode,
        fiatUnit: activeCurrency,
      });
      if (data.success) {
        setFiatAmount(data.fiatAmount);
      } else {
        setErrorHandling({ amountError: t('send.error.invalidAmount') });
      }
    } else {
      setFiatAmount('');
    }
  }, [account.coinCode, activeCurrency, t]);

  const txProposal = useCallback((result: TTxProposalResult) => {
    setValid(result.success);
    if (result.success) {
      setErrorHandling({});
      setProposalResult(result);
      if (updateFiatRef.current) {
        convertToFiat(result.amount.amount);
      }
      // set it back to default = true
      updateFiatRef.current = true;
    } else {
      const errorHandling = txProposalErrorHandling(result.errorCode);
      setErrorHandling(errorHandling);
      if (errorHandling.amountError
        || Object.keys(errorHandling).length === 0) {
        setProposalResult(undefined);
      }
    }
  }, [convertToFiat]);

  const validateAndDisplayFee = useCallback(() => {
    setErrorHandling({});
    const txInput = getValidTxInputData();
    if (!txInput) {
      return;
    }
    if (proposeTimeoutRef.current) {
      clearTimeout(proposeTimeoutRef.current);
      proposeTimeoutRef.current = null;
    }
    setIsUpdatingProposal(true);
    // defer the transaction proposal
    proposeTimeoutRef.current = setTimeout(async () => {
      const proposePromise = proposeTx(account.code, txInput);
      // keep this as the last known proposal
      lastProposalRef.current = proposePromise;
      try {
        const result = await proposePromise;
        // continue only if this is the most recent proposal
        if (proposePromise === lastProposalRef.current) {
          txProposal(result);
        }
      } catch (error) {
        setValid(false);
        console.error('Failed to propose transaction:', error);
      } finally {
        setIsUpdatingProposal(false);
        // cleanup regardless of success or failure
        if (proposePromise === lastProposalRef.current) {
          lastProposalRef.current = null;
        }
      }
    }, 400); // Delay the proposal by 400 ms
  }, [account.code, getValidTxInputData, txProposal]);

  const handleNoteInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setNote(event.target.value);
  }, []);

  const convertFromFiat = useCallback(async (amount: string) => {
    updateFiatRef.current = false;
    if (amount) {
      const coinCode = account.coinCode;
      const data = await convertFromCurrency({
        amount,
        coinCode,
        fiatUnit: activeCurrency,
      });
      if (data.success) {
        setAmount(data.amount);
      } else {
        setErrorHandling({ amountError: t('send.error.invalidAmount') });
      }
    } else {
      setAmount('');
    }
  }, [account.coinCode, activeCurrency, t]);

  const handleFiatInput = useCallback((fiatAmount: string) => {
    setFiatAmount(fiatAmount);
    convertFromFiat(fiatAmount);
  }, [convertFromFiat]);

  const feeTargetChange = useCallback((feeTarget: FeeTargetCode) => {
    setFeeTarget(feeTarget);
    setCustomFee('');
  }, []);

  const onSelectedUTXOsChange = useCallback((selectedUTXOs: TSelectedUTXOs) => {
    selectedUTXOsRef.current = selectedUTXOs;
    validateAndDisplayFee();
  }, [validateAndDisplayFee]);

  const hasSelectedUTXOs = useCallback((): boolean => {
    return Object.keys(selectedUTXOsRef.current).length !== 0;
  }, []);

  const parseQRResult = useCallback(async (uri: string) => {
    let address;
    let amount = '';
    try {
      const url = new URL(uri);
      if (url.protocol !== 'bitcoin:' && url.protocol !== 'litecoin:' && url.protocol !== 'ethereum:') {
        alertUser(t('invalidFormat'));
        return;
      }
      address = url.pathname;
      if (isBitcoinBased(account.coinCode)) {
        amount = url.searchParams.get('amount') || '';
      }
    } catch {
      address = uri;
    }
    const coinCode = account.coinCode;
    if (amount) {
      if (coinCode === 'btc' || coinCode === 'tbtc') {
        const result = await parseExternalBtcAmount(amount);
        if (result.success) {
          setAmount(result.amount);
        } else {
          setErrorHandling({ amountError: t('send.error.invalidAmount') });
          return;
        }
      } else {
        setAmount(amount);
      }
    }
    setRecipientAddress(address);
    setSendAll(false);
  }, [account.coinCode, t]);

  const onReceiverAddressInputChange = (recipientAddress: string) => {
    setRecipientAddress(recipientAddress);
  };

  const onCoinAmountChange = (amount: string) => {
    setAmount(amount);
    convertToFiat(amount);
  };

  const onSendAllChange = (sendAll: boolean) => {
    if (!sendAll) {
      convertToFiat(amount);
    }
    setSendAll(sendAll);
  };

  useEffect(() => {
    validateAndDisplayFee();
    // transitive dependency on all state relevant for txInput.
  }, [validateAndDisplayFee]);

  useEffect(() => {
    const updateBalance = (code: string) => getBalance(code).then(setBalance).catch(console.error);
    updateBalance(account.code);
    return syncdone((code) => {
      if (account.code === code) {
        updateBalance(code);
      }
    });
  }, [account.code]);

  const {
    fee: proposedFee,
    amount: proposedAmount,
    total: proposedTotal,
  } = proposalResult?.success ? proposalResult : { fee: undefined, amount: undefined, total: undefined };

  const waitDialogTransactionDetails = {
    proposedFee,
    proposedAmount,
    proposedTotal,
    customFee,
    feeTarget,
    recipientAddress,
    activeCurrency,
  };

  return (
    <GuideWrapper>
      <GuidedContent>
        <Main>
          <Header
            title={<h2>{t('send.title', { accountName: account.coinName })}</h2>}
          >
            <HideAmountsButton />
          </Header>
          <View>
            <ViewContent>
              <div>
                <label className="labelXLarge">{t('send.availableBalance')}</label>
              </div>
              <Balance balance={balance} noRotateFiat/>
              <div className={`flex flex-row flex-between ${style.container}`}>
                <label className="labelXLarge">{t('send.transactionDetails')}</label>
                <CoinControl
                  account={account}
                  onSelectedUTXOsChange={onSelectedUTXOsChange}
                />
              </div>
              <Grid col="1">
                <Column>
                  <ReceiverAddressInput
                    accountCode={account.code}
                    addressError={errorHandling.addressError}
                    onInputChange={onReceiverAddressInputChange}
                    recipientAddress={recipientAddress}
                    parseQRResult={parseQRResult}
                  />
                </Column>
              </Grid>
              <Grid>
                <Column>
                  <CoinInput
                    balance={balance}
                    onAmountChange={onCoinAmountChange}
                    onSendAllChange={onSendAllChange}
                    sendAll={sendAll}
                    amountError={errorHandling.amountError}
                    proposedAmount={proposedAmount}
                    amount={amount}
                    hasSelectedUTXOs={hasSelectedUTXOs()}
                  />
                </Column>
                <Column>
                  <FiatInput
                    onFiatChange={handleFiatInput}
                    disabled={sendAll}
                    error={errorHandling.amountError}
                    fiatAmount={fiatAmount}
                    label={activeCurrency}
                  />
                </Column>
              </Grid>
              <Grid>
                <Column>
                  <FeeTargets
                    accountCode={account.code}
                    coinCode={account.coinCode}
                    disabled={!amount && !sendAll}
                    fiatUnit={activeCurrency}
                    proposedFee={proposedFee}
                    customFee={customFee}
                    showCalculatingFeeLabel={isUpdatingProposal}
                    onFeeTargetChange={feeTargetChange}
                    onCustomFee={setCustomFee}
                    error={errorHandling.feeError} />
                </Column>
                <Column>
                  <NoteInput
                    note={note}
                    onNoteChange={handleNoteInput}
                  />
                  <ColumnButtons
                    className="m-top-default m-bottom-xlarge"
                    inline>
                    <Button
                      primary
                      onClick={send}
                      disabled={!getValidTxInputData() || !valid || isUpdatingProposal}>
                      {t('send.button')}
                    </Button>
                    <BackButton
                      enableEsc>
                      {t('button.back')}
                    </BackButton>
                  </ColumnButtons>
                </Column>
              </Grid>
            </ViewContent>
            <ConfirmSend
              bb01Paired={bb01Paired}
              baseCurrencyUnit={activeCurrency}
              note={note}
              hasSelectedUTXOs={hasSelectedUTXOs()}
              isConfirming={isConfirming}
              selectedUTXOs={Object.keys(selectedUTXOsRef.current)}
              coinCode={account.coinCode}
              transactionDetails={waitDialogTransactionDetails}
            />
            <MessageWaitDialog result={sendResult}/>
          </View>
        </Main>
      </GuidedContent>
      <SendGuide coinCode={account.coinCode} />
    </GuideWrapper>
  );
};
