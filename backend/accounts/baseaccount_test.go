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

package accounts

import (
	"bytes"
	"errors"
	"os"
	"path"
	"testing"
	"time"

	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/accounts/types"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/coins/coin"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/coins/coin/mocks"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/config"
	"github.com/BitBoxSwiss/bitbox-wallet-app/backend/signing"
	"github.com/BitBoxSwiss/bitbox-wallet-app/util/logging"
	"github.com/BitBoxSwiss/bitbox-wallet-app/util/observable"
	"github.com/BitBoxSwiss/bitbox-wallet-app/util/test"
	"github.com/btcsuite/btcd/btcutil/hdkeychain"
	"github.com/stretchr/testify/require"
)

func TestBaseAccount(t *testing.T) {
	events := make(chan types.Event, 100)
	checkEvent := func() types.Event {
		select {
		case ev := <-events:
			return ev
		case <-time.After(time.Second):
			require.Fail(t, "expected event was not fired")
		}
		panic("can't reach")
	}

	derivationPath, err := signing.NewAbsoluteKeypath("m/84'/1'/0'")
	require.NoError(t, err)
	const xpub = "tpubDCxoQyC5JaGydxN3yprM6sgqgu65LruN3JBm1fnSmGxXR3AcuNwr" +
		"E7J2CVaCvuLPJtJNySjshNsYbR96Y7yfEdcywYqWubzUQLVGh2b4mF9"
	extendedPublicKey, err := hdkeychain.NewKeyFromString(xpub)
	require.NoError(t, err)

	const accountIdentifier = "test-account-identifier"
	cfg := &AccountConfig{
		Config: &config.Account{
			Code: "test",
			Name: "Test",
			SigningConfigurations: signing.Configurations{
				signing.NewBitcoinConfiguration(signing.ScriptTypeP2PKH, []byte{1, 2, 3, 4}, derivationPath, extendedPublicKey),
				signing.NewBitcoinConfiguration(signing.ScriptTypeP2WPKH, []byte{1, 2, 3, 4}, derivationPath, extendedPublicKey),
				signing.NewBitcoinConfiguration(signing.ScriptTypeP2WPKHP2SH, []byte{1, 2, 3, 4}, derivationPath, extendedPublicKey),
			},
		},
		DBFolder:        test.TstTempDir("baseaccount_test_dbfolder"),
		NotesFolder:     test.TstTempDir("baseaccount_test_notesfolder"),
		RateUpdater:     nil,
		GetNotifier:     nil,
		GetSaveFilename: func(suggestedFilename string) string { return suggestedFilename },
	}
	// The long ID in the filename is the legacy hash of the configurations above (unified and split).
	// This tests notes migration from v4.27.0 to v4.28.0.
	require.NoError(t,
		os.WriteFile(
			path.Join(cfg.NotesFolder, "test-account-identifier.json"),
			[]byte(`{"transactions": { "conflict": "conflict note new" }}`),
			0666,
		),
	)

	legacyNotesFilename1 := path.Join(cfg.NotesFolder, "account-54b4597c3a5c48177ef2b12c97e0cb30b6fef0b431e7821675b17704c330ce5d-tbtc.json")
	legacyNotesFilename2 := path.Join(cfg.NotesFolder, "account-989b84ec36f0b84e7926f9f5715e4b59a0592993b1fa4b70836addbcb0cb6e09-tbtc-p2pkh.json")
	legacyNotesFilename3 := path.Join(cfg.NotesFolder, "account-e60b99507ba983d522f15932dbe1214e99de13c56e2bea75ed9c285f7c013117-tbtc-p2wpkh.json")
	legacyNotesFilename4 := path.Join(cfg.NotesFolder, "account-9e779e0d49e77236f0769e0bab2fd656958d3fd023dce2388525ee66fead88bb-tbtc-p2wpkh-p2sh.json")
	require.NoError(t,
		os.WriteFile(
			legacyNotesFilename1,
			[]byte(`{"transactions": { "legacy-1": "legacy note in unified account", "conflict": "conflict note old" }}`),
			0666,
		),
	)
	require.NoError(t,
		os.WriteFile(
			legacyNotesFilename2,
			[]byte(`{"transactions": { "legacy-2": "legacy note in split account, p2pkh" }}`),
			0666,
		),
	)
	require.NoError(t,
		os.WriteFile(
			legacyNotesFilename3,
			[]byte(`{"transactions": { "legacy-3": "legacy note in split account, p2wpkh" }}`),
			0666,
		),
	)
	require.NoError(t,
		os.WriteFile(
			legacyNotesFilename4,
			[]byte(`{"transactions": { "legacy-4": "legacy note in split account, p2wpkh-p2sh" }}`),
			0666,
		),
	)

	mockCoin := &mocks.CoinMock{
		CodeFunc: func() coin.Code {
			return coin.CodeTBTC
		},
		SmallestUnitFunc: func() string {
			return "satoshi"
		},
	}
	account := NewBaseAccount(cfg, mockCoin, logging.Get().WithGroup("baseaccount_test"))
	account.Observe(func(event observable.Event) {
		events <- types.Event(event.Subject)
	})
	require.NoError(t, account.Initialize(accountIdentifier))

	t.Run("config", func(t *testing.T) {
		require.Equal(t, cfg, account.Config())

	})

	t.Run("synchronizer", func(t *testing.T) {
		require.False(t, account.Synced())
		done := account.Synchronizer.IncRequestsCounter()
		require.False(t, account.Synced())
		done()
		require.Equal(t, types.EventStatusChanged, checkEvent()) // synced changed
		require.Equal(t, types.EventSyncDone, checkEvent())
		require.True(t, account.Synced())

		// no status changed event when syncing again (syncing is already true)
		done = account.Synchronizer.IncRequestsCounter()
		done()
		require.Equal(t, types.EventSyncDone, checkEvent())

		account.ResetSynced()
		require.False(t, account.Synced())
		account.ResetSynced()
		require.False(t, account.Synced())
	})

	t.Run("offline", func(t *testing.T) {
		require.NoError(t, account.Offline())
		account.SetOffline(errors.New("error"))
		require.Error(t, account.Offline())
		require.Equal(t, types.EventStatusChanged, checkEvent())
		account.SetOffline(nil)
		require.NoError(t, account.Offline())
		require.Equal(t, types.EventStatusChanged, checkEvent())
	})

	t.Run("notes", func(t *testing.T) {
		// Legacy note files have been deleted after migration.
		for _, filename := range []string{
			legacyNotesFilename1,
			legacyNotesFilename2,
			legacyNotesFilename3,
			legacyNotesFilename4,
		} {
			_, err := os.Stat(filename)
			require.True(t, os.IsNotExist(err))
		}

		require.NoError(t, account.SetTxNote("test-tx-id", "another test note"))
		require.Equal(t, types.EventStatusChanged, checkEvent())
		require.Equal(t, "another test note", account.TxNote("test-tx-id"))

		// Test notes migration from v4.27.0 to v4.28.0
		require.Equal(t, "conflict note new", account.TxNote("conflict"))
		require.Equal(t, "legacy note in unified account", account.TxNote("legacy-1"))
		require.Equal(t, "legacy note in split account, p2pkh", account.TxNote("legacy-2"))
		require.Equal(t, "legacy note in split account, p2wpkh", account.TxNote("legacy-3"))
		require.Equal(t, "legacy note in split account, p2wpkh-p2sh", account.TxNote("legacy-4"))
		// Setting a note sets it in the main notes file, and wipes it out in legacy note files.
		require.NoError(t, account.SetTxNote("legacy-1", "updated legacy note"))
		require.Equal(t, "updated legacy note", account.TxNote("legacy-1"))
	})

	// Setup export tests
	export := func(account *BaseAccount, transactions []*TransactionData) string {
		var result bytes.Buffer
		require.NoError(t, account.ExportCSV(&result, transactions))
		return result.String()
	}

	const header = "Time,Type,Amount,Unit,Fee,Fee Unit,Address,Transaction ID,Note\n"
	fee := coin.NewAmountFromInt64(101)
	timestamp := time.Date(2020, 2, 30, 16, 44, 20, 0, time.UTC)

	t.Run("exportCSV with BTC", func(t *testing.T) {

		require.Equal(t, header, export(account, nil))

		require.NoError(t, account.SetTxNote("some-internal-tx-id", "some note, with a comma"))
		require.Equal(t,
			header+
				`2020-03-01T16:44:20Z,sent,123,satoshi,101,satoshi,some-address,some-tx-id,"some note, with a comma"
2020-03-01T16:44:20Z,sent_to_yourself,456,satoshi,,,another-address,some-tx-id,"some note, with a comma"
2020-03-01T16:44:20Z,received,789,satoshi,,,some-address-2,some-tx-id-2,
`,
			export(account, []*TransactionData{
				{
					Type:       TxTypeSend,
					TxID:       "some-tx-id",
					InternalID: "some-internal-tx-id",
					Fee:        &fee,
					Timestamp:  &timestamp,
					Addresses: []AddressAndAmount{
						{
							Address: "some-address",
							Amount:  coin.NewAmountFromInt64(123),
							Ours:    false,
						},
						{
							Address: "another-address",
							Amount:  coin.NewAmountFromInt64(456),
							Ours:    true,
						},
					},
				},
				{
					Type:       TxTypeReceive,
					TxID:       "some-tx-id-2",
					InternalID: "some-internal-tx-id-2",
					Fee:        nil,
					Timestamp:  &timestamp,
					Addresses: []AddressAndAmount{
						{
							Address: "some-address-2",
							Amount:  coin.NewAmountFromInt64(789),
							Ours:    false,
						},
					},
				},
			}))

	})

	t.Run("exportCSV with ERC20", func(t *testing.T) {
		mockCoin := &mocks.CoinMock{
			CodeFunc: func() coin.Code {
				return "eth-erc20-usdt"
			},
			SmallestUnitFunc: func() string {
				return "wei"
			},
			UnitFunc: func(isFee bool) string {
				if isFee {
					return "wei"
				}
				return "USDT"
			},
			FormatAmountFunc: func(amount coin.Amount, isFee bool) string {
				return amount.BigInt().String()
			},
		}
		account := NewBaseAccount(cfg, mockCoin, logging.Get().WithGroup("baseaccount_test"))
		require.NoError(t, account.Initialize(accountIdentifier))

		require.NoError(t, account.SetTxNote("some-internal-tx-id", "some note, with a comma"))
		require.Equal(t,
			header+
				`2020-03-01T16:44:20Z,sent,123,USDT,101,wei,some-address,some-tx-id,"some note, with a comma"
2020-03-01T16:44:20Z,sent_to_yourself,456,USDT,,,another-address,some-tx-id,"some note, with a comma"
2020-03-01T16:44:20Z,received,789,USDT,,,some-address-2,some-tx-id-2,
`,
			export(account, []*TransactionData{
				{
					Type:       TxTypeSend,
					TxID:       "some-tx-id",
					InternalID: "some-internal-tx-id",
					Fee:        &fee,
					Timestamp:  &timestamp,
					IsErc20:    true,
					Addresses: []AddressAndAmount{
						{
							Address: "some-address",
							Amount:  coin.NewAmountFromInt64(123),
							Ours:    false,
						},
						{
							Address: "another-address",
							Amount:  coin.NewAmountFromInt64(456),
							Ours:    true,
						},
					},
				},
				{
					Type:       TxTypeReceive,
					TxID:       "some-tx-id-2",
					InternalID: "some-internal-tx-id-2",
					Fee:        nil,
					Timestamp:  &timestamp,
					IsErc20:    true,
					Addresses: []AddressAndAmount{
						{
							Address: "some-address-2",
							Amount:  coin.NewAmountFromInt64(789),
							Ours:    false,
						},
					},
				},
			}))
	})
}
