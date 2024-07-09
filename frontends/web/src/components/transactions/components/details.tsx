/**
 * Copyright 2024 Shift Crypto AG
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

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ITransaction, IAmount, getTransaction } from '@/api/account';
import { A } from '@/components/anchor/anchor';
import { Dialog } from '@/components/dialog/dialog';
import { FiatConversion } from '@/components/rates/rates';
import { Amount } from '@/components/amount/amount';
import { Note } from '@/components/transactions/note';
import { TxDetail } from './detail';
import { Arrow } from './arrow';
import { TxDateDetail } from './date';
import { TxStatusDetail } from './status';
import { TxDetailCopyableValues } from './address-or-txid';
import parentStyle from '@/components/transactions/transaction.module.css';

const getAddresses = (txInfo: ITransaction, idx: number | null) => {
  // TODO:  Actually this kind of the wrong place for the todo label but I should figure out if we
  // want to display only our own address no matter if its a collaborative tx or not, or in case of
  // collaborative tx. we just show all output addresses ? Consider:
  // A) Pay someone using a coinjoin (one input ours, many other inputs -> many outputs, none ours.
  // -> we have no idea what output(s) we paid..only the user knows but the wallet can't really know.
  // -> it does really not make sense to just dump all of the addresses, just say "not assignable" or something like this.
  // B) Participate in coin join (one input ours, maybe a change output, -> many output one output ours)
  // -> the wallet could infer that this was a coinjoin and that only our output is relevant here.
  // -> but this would be a guess...technically we don't know who paid who so maybe just do the same as above ?
  if (!idx) {
    return txInfo.addresses.map(addressAndAmount => addressAndAmount.address);
  }
  return [txInfo.addresses[idx].address];
};

type TProps = {
  open: boolean;
  onClose: () => void;
  accountCode: string;
  internalID: string;
  note: string;
  status: ITransaction['status'];
  type: ITransaction['type'];
  numConfirmations: number;
  numConfirmationsComplete: number;
  time: string | null;
  amount: IAmount;
  sign: string;
  typeClassName: string;
  explorerURL: string;
  addressIndex: number | null;
}

export const TxDetailsDialog = ({
  open,
  onClose,
  accountCode,
  internalID,
  note,
  status,
  type,
  numConfirmations,
  numConfirmationsComplete,
  time,
  amount,
  sign,
  typeClassName,
  explorerURL,
  addressIndex
}: TProps) => {
  const { t } = useTranslation();

  const [transactionInfo, setTransactionInfo] = useState<ITransaction | null>(null);

  useEffect(() => {
    if (!transactionInfo && open) {
      getTransaction(accountCode, internalID).then(transaction => {
        if (!transaction) {
          console.error(`Unable to retrieve transaction ${internalID}`);
        }
        setTransactionInfo(transaction);
      }).catch(console.error);
    }
  }, [accountCode, internalID, open, transactionInfo]);

  // Amount and Confirmations info are displayed using props data
  // instead of transactionInfo because they are live updated.
  return (
    <Dialog
      open={open && !!transactionInfo}
      title={t('transaction.details.title')}
      onClose={onClose}
      slim
      medium>
      {transactionInfo && (
        <>
          <Note
            accountCode={accountCode}
            internalID={internalID}
            note={note}
          />
          <TxDetail label={t('transaction.details.type')}>
            <Arrow
              status={status}
              type={type}
            />
          </TxDetail>
          <TxDetail label={t('transaction.confirmation')}>{numConfirmations}</TxDetail>
          <TxStatusDetail
            status={status}
            numConfirmations={numConfirmations}
            numConfirmationsComplete={numConfirmationsComplete}
          />
          <TxDateDetail time={time} />
          <TxDetail label={t('transaction.details.fiat')}>
            <span className={`${parentStyle.fiat} ${typeClassName}`}>
              <FiatConversion amount={amount} sign={sign} noAction />
            </span>
          </TxDetail>
          <TxDetail label={t('transaction.details.fiatAtTime')}>
            <span className={`${parentStyle.fiat} ${typeClassName}`}>
              {transactionInfo.amountAtTime ?
                <FiatConversion amount={transactionInfo.amountAtTime} sign={sign} noAction />
                :
                <FiatConversion noAction />
              }
            </span>
          </TxDetail>
          <TxDetail label={t('transaction.details.amount')}>
            <span className={`${parentStyle.amount} ${typeClassName}`}>
              {sign}
              <Amount amount={amount.amount} unit={amount.unit} />
            </span>
            {' '}
            <span className={`${parentStyle.currencyUnit} ${typeClassName}`}>{transactionInfo.amount.unit}</span>
          </TxDetail>
          {
            transactionInfo.fee && transactionInfo.fee.amount ? (
              <TxDetail label={t('transaction.fee')}>
                <Amount amount={transactionInfo.fee.amount} unit={transactionInfo.fee.unit} />
                {' '}
                <span className={parentStyle.currencyUnit}>{transactionInfo.fee.unit}</span>
              </TxDetail>
            ) : (
              <TxDetail label={t('transaction.fee')}>---</TxDetail>
            )
          }
          <TxDetailCopyableValues
            label={t('transaction.details.address')}
            values={getAddresses(transactionInfo, addressIndex)}
          />
          {
            transactionInfo.gas ? (
              <TxDetail label={t('transaction.gas')}>{transactionInfo.gas}</TxDetail>
            ) : null
          }
          {
            transactionInfo.nonce ? (
              <TxDetail label="Nonce">{transactionInfo.nonce}</TxDetail>
            ) : null
          }
          {
            transactionInfo.weight ? (
              <TxDetail label={t('transaction.weight')}>
                {transactionInfo.weight}
                {' '}
                <span className={parentStyle.currencyUnit}>WU</span>
              </TxDetail>
            ) : null
          }
          {
            transactionInfo.vsize ? (
              <TxDetail label={t('transaction.vsize')}>
                {transactionInfo.vsize}
                {' '}
                <span className={parentStyle.currencyUnit}>b</span>
              </TxDetail>
            ) : null
          }
          {
            transactionInfo.size ? (
              <TxDetail label={t('transaction.size')}>
                {transactionInfo.size}
                {' '}
                <span className={parentStyle.currencyUnit}>b</span>
              </TxDetail>
            ) : null
          }
          <TxDetailCopyableValues
            label={t('transaction.explorer')}
            values={[transactionInfo.txID]}
          />
          <div className={`${parentStyle.detail} flex-center`}>
            <A
              href={explorerURL + transactionInfo.txID}
              title={`${t('transaction.explorerTitle')}\n${explorerURL}${transactionInfo.txID}`}>
              {t('transaction.explorerTitle')}
            </A>
          </div>
        </>
      )}
    </Dialog>
  );
};
