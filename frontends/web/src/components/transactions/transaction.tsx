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
import * as accountApi from '@/api/account';
import { FiatConversion } from '@/components/rates/rates';
import { Amount } from '@/components/amount/amount';
import { Arrow } from './components/arrow';
import { TxDate } from './components/date';
import { TxStatus } from './components/status';
import { ShowDetailsButton } from './components/show-details-button';
import { TxAddress } from './components/address-or-txid';
import { TxDetailsDialog } from './components/details';
import parentStyle from './transactions.module.css';
import style from './transaction.module.css';

type TBaseProps = {
  accountCode: accountApi.AccountCode;
  explorerURL: string;
} & accountApi.ITransaction;

type TPropsNormal = TBaseProps & {
  addressIndex: number;
  type: 'send' | 'receive' | 'send_to_self';
}

type TPropsCollaborative = TBaseProps & {
  addressIndex: null;
  type: 'collaborative_send' | 'collaborative_receive';
}

type TProps = TPropsNormal | TPropsCollaborative;

export const Transaction = ({
  accountCode,
  addressIndex,
  internalID,
  explorerURL,
  type,
  amount,
  numConfirmations,
  numConfirmationsComplete,
  time,
  addresses,
  status,
  note = '',
}: TProps) => {
  const { t } = useTranslation();
  const [transactionDialog, setTransactionDialog] = useState<boolean>(false);

  const sign = ((type === 'send') && '−') || ((type === 'receive') && '+') || '';
  // TODO: Fix this mess.
  const typeClassName = (status === 'failed' && style.failed) || ((type === 'send' || type === 'collaborative_send') && style.send) || ((type === 'receive' || type === 'collaborative_receive') && style.receive) || '';

  return (
    <div className={style.container}>
      <div className={`${parentStyle.columns} ${style.row}`}>
        <div className={parentStyle.columnGroup}>
          <div className={parentStyle.type}>
            <Arrow
              status={status}
              type={type}
            />
          </div>
          <TxDate time={time} />
          {note ? (
            <div className={parentStyle.activity}>
              <span className={style.address}>
                {note}
              </span>
            </div>
          ) : (addressIndex ? (
            <TxAddress
              label={t(type === 'receive' ? 'transaction.tx.received' : 'transaction.tx.sent')}
              addresses={[addresses[addressIndex].address]}
            />
          ) : ('todo-translate: Collaborative:')
          )}
          <ShowDetailsButton
            onClick={() => setTransactionDialog(true)}
            expand={!transactionDialog}
            hideOnMedium
          />
        </div>
        <div className={parentStyle.columnGroup}>
          <TxStatus
            status={status}
            numConfirmations={numConfirmations}
            numConfirmationsComplete={numConfirmationsComplete}
          />
          <div className={parentStyle.fiat}>
            <span className={`${style.fiat} ${typeClassName}`}>
              <FiatConversion amount={amount} sign={sign} noAction />
            </span>
          </div>
          <div className={`${parentStyle.currency} ${typeClassName}`}>
            <span
              className={`${style.amount} ${style.amountOverflow}`}
              data-unit={` ${amount.unit}`}>
              {sign}
              <Amount amount={amount.amount} unit={amount.unit}/>
              <span className={style.currencyUnit}>&nbsp;{amount.unit}</span>
            </span>
          </div>
          <ShowDetailsButton
            onClick={() => setTransactionDialog(true)}
            expand={!transactionDialog}
          />
        </div>
      </div>
      <TxDetailsDialog
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
        explorerURL={explorerURL}
        addressIndex={addressIndex}
      />
    </div>
  );
};
