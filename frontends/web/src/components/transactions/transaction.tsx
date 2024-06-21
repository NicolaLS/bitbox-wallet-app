/**
 * Copyright 2018 Shift Devices AG
 * Copyright 2021-2024 Shift Crypto AG
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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as accountApi from '../../api/account';
import { AddressOrTxID } from './components/address-or-txid';
import parentStyle from './transactions.module.css';
import style from './transaction.module.css';
import { Arrow } from './components/arrow';
import { TxDate } from './components/date';
import { TxNote } from './components/note';
import { TxStatus } from './components/status';
import { TxAmount } from './components/amount';
import { ShowDetailsButton } from './components/show-details-button';
import { TxFiat } from './components/fiat';
import { TxDetails } from './components/details';

type Props = {
  accountCode: accountApi.AccountCode;
  index: number;
  explorerURL: string;
} & accountApi.ITransaction;

export const Transaction = ({
  accountCode,
  index,
  internalID,
  explorerURL,
  type,
  amount,
  feeRatePerKb,
  numConfirmations,
  numConfirmationsComplete,
  time,
  addresses,
  status,
  note = '',
}: Props) => {
  const { i18n, t } = useTranslation();
  const [transactionDialog, setTransactionDialog] = useState<boolean>(false);

  const sign = ((type === 'send') && '−') || ((type === 'receive') && '+') || '';
  const typeClassName = (status === 'failed' && style.failed) || (type === 'send' && style.send) || (type === 'receive' && style.receive) || '';

  return (
    <div className={`${style.container}${index === 0 ? ' ' + style.first : ''}`}>
      <div className={`${parentStyle.columns} ${style.row}`}>
        <div className={parentStyle.columnGroup}>
          <Arrow
            txStatus={status}
            txType={type}
          />
          <TxDate
            time={time}
            label={t('transaction.details.date')}
            lang={i18n.language}
          />
          { note ? (
            <TxNote
              note={note}
            />
          ) : (
            <AddressOrTxID
              addresses={addresses}
              label={t(type === 'receive' ? 'transaction.tx.received' : 'transaction.tx.sent')}
            />
          )}
          <ShowDetailsButton
            onClick={() => setTransactionDialog(true)}
            expand={!transactionDialog}
            hideOnMedium
          />
        </div>
        <div className={parentStyle.columnGroup}>
          < TxStatus
            status={status}
            numConfirmations={numConfirmations}
            numConfirmationsComplete={numConfirmationsComplete}
          />
          <TxFiat
            amount={amount}
            sign={sign}
            typeClassName={typeClassName}
          />
          <TxAmount
            amount={amount}
            sign={sign}
            typeClassName={typeClassName}
          />
          <ShowDetailsButton
            onClick={() => setTransactionDialog(true)}
            expand={!transactionDialog}
          />
        </div>
      </div>
      <TxDetails
        open={transactionDialog}
        onClose={() => setTransactionDialog(false)}
        accountCode={accountCode}
        internalID={internalID}
        note={note}
        status={status}
        type={type}
        numConfirmations={numConfirmations}
        numConfirmationsComplete={numConfirmationsComplete}
        time={time}
        amount={amount}
        sign={sign}
        typeClassName={typeClassName}
        feeRatePerKb={feeRatePerKb}
        explorerURL={explorerURL}
      />
    </div>
  );
};
