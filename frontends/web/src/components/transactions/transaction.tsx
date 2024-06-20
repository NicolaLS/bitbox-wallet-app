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
import { A } from '../anchor/anchor';
import { Dialog } from '../dialog/dialog';
import { ExpandIcon } from '../icon/icon';
import { ProgressRing } from '../progressRing/progressRing';
import { FiatConversion } from '../rates/rates';
import { Amount } from '../../components/amount/amount';
import parentStyle from './transactions.module.css';
import style from './transaction.module.css';
import { Arrow } from './components/arrow';
import { TxDate } from './components/date';
import { TxNote } from './components/note';
import { AddressOrTxID } from './components/address-or-txid';

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
  const [transactionInfo, setTransactionInfo] = useState<accountApi.ITransaction>();

  const showDetails = () => {
    accountApi.getTransaction(accountCode, internalID).then(transaction => {
      if (!transaction) {
        console.error('Unable to retrieve transaction ' + internalID);
        return null;
      }
      setTransactionInfo(transaction);
      setTransactionDialog(true);
    })
      .catch(console.error);
  };

  const sign = ((type === 'send') && '−') || ((type === 'receive') && '+') || '';
  const typeClassName = (status === 'failed' && style.failed) || (type === 'send' && style.send) || (type === 'receive' && style.receive) || '';
  const statusText = t(`transaction.status.${status}`);
  const progress = numConfirmations < numConfirmationsComplete ? (numConfirmations / numConfirmationsComplete) * 100 : 100;

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
          <div className={`${parentStyle.action} ${parentStyle.hideOnMedium}`}>
            <button type="button" className={style.action} onClick={showDetails}>
              <ExpandIcon expand={!transactionDialog} />
            </button>
          </div>
        </div>
        <div className={parentStyle.columnGroup}>
          <div className={parentStyle.status}>
            <span className={style.columnLabel}>
              {t('transaction.details.status')}:
            </span>
            <ProgressRing
              className="m-right-quarter"
              width={14}
              value={progress}
              isComplete={numConfirmations >= numConfirmationsComplete}
            />
            <span className={style.status}>{statusText}</span>
          </div>
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
              <Amount amount={amount.amount} unit={amount.unit} />
              <span className={style.currencyUnit}>&nbsp;{amount.unit}</span>
            </span>
          </div>
          <div className={`${parentStyle.action} ${parentStyle.showOnMedium}`}>
            <button type="button" className={style.action} onClick={showDetails}>
              <ExpandIcon expand={!transactionDialog} />
            </button>
          </div>
        </div>
      </div>
      {/*
        Amount and Confirmations info are displayed using props data
        instead of transactionInfo because they are live updated.
      */}
      <Dialog
        open={transactionDialog}
        title={t('transaction.details.title')}
        onClose={() => setTransactionDialog(false)}
        slim
        medium>
        {transactionInfo && (
          <>
            <TxNote
              accountCode={accountCode}
              internalID={internalID}
              note={note}
              details
            />
            <Arrow
              txStatus={status}
              txType={type}
              label={t('transaction.details.type')}
              details
            />
            <div className={style.detail}>
              <label>{t('transaction.confirmation')}</label>
              <p>{numConfirmations}</p>
            </div>
            <div className={style.detail}>
              <label>{t('transaction.details.status')}</label>
              <p className="flex flex-items-center">
                <ProgressRing
                  className="m-right-quarter"
                  width={14}
                  value={progress}
                  isComplete={numConfirmations >= numConfirmationsComplete}
                />
                <span className={style.status}>
                  {statusText} {
                    status === 'pending' && (
                      <span>({numConfirmations}/{numConfirmationsComplete})</span>
                    )
                  }
                </span>
              </p>
            </div>
            <TxDate
              time={time}
              label={t('transaction.details.date') + ':'}
              lang={i18n.language}
              detail
            />
            <div className={style.detail}>
              <label>{t('transaction.details.fiat')}</label>
              <p>
                <span className={`${style.fiat} ${typeClassName}`}>
                  <FiatConversion amount={amount} sign={sign} noAction />
                </span>
              </p>
            </div>
            <div className={style.detail}>
              <label>{t('transaction.details.fiatAtTime')}</label>
              <p>
                <span className={`${style.fiat} ${typeClassName}`}>
                  {transactionInfo.amountAtTime ?
                    <FiatConversion amount={transactionInfo.amountAtTime} sign={sign} noAction />
                    :
                    <FiatConversion noAction />
                  }
                </span>
              </p>
            </div>
            <div className={style.detail}>
              <label>{t('transaction.details.amount')}</label>
              <p className={typeClassName}>
                <span className={style.amount}>
                  {sign}
                  <Amount amount={amount.amount} unit={amount.unit} />
                </span>
                {' '}
                <span className={style.currencyUnit}>{transactionInfo.amount.unit}</span>
              </p>
            </div>
            <div className={style.detail}>
              <label>{t('transaction.fee')}</label>
              {
                transactionInfo.fee && transactionInfo.fee.amount ? (
                  <p title={feeRatePerKb.amount ? feeRatePerKb.amount + ' ' + feeRatePerKb.unit + '/Kb' : ''}>
                    <Amount amount={transactionInfo.fee.amount} unit={transactionInfo.fee.unit} />
                    {' '}
                    <span className={style.currencyUnit}>{transactionInfo.fee.unit}</span>
                  </p>
                ) : (
                  <p>---</p>
                )
              }
            </div>
            <AddressOrTxID
              label={t('transaction.details.address')}
              addresses={transactionInfo.addresses}
              detail
            />
            {
              transactionInfo.gas ? (
                <div className={style.detail}>
                  <label>{t('transaction.gas')}</label>
                  <p>{transactionInfo.gas}</p>
                </div>
              ) : null
            }
            {
              transactionInfo.nonce !== null ? (
                <div className={style.detail}>
                  <label>Nonce</label>
                  <p>{transactionInfo.nonce}</p>
                </div>
              ) : null
            }
            {
              transactionInfo.weight ? (
                <div className={style.detail}>
                  <label>{t('transaction.weight')}</label>
                  <p>
                    {transactionInfo.weight}
                    {' '}
                    <span className={style.currencyUnit}>WU</span>
                  </p>
                </div>
              ) : null
            }
            {
              transactionInfo.vsize ? (
                <div className={style.detail}>
                  <label>{t('transaction.vsize')}</label>
                  <p>
                    {transactionInfo.vsize}
                    {' '}
                    <span className={style.currencyUnit}>b</span>
                  </p>
                </div>
              ) : null
            }
            {
              transactionInfo.size ? (
                <div className={style.detail}>
                  <label>{t('transaction.size')}</label>
                  <p>
                    {transactionInfo.size}
                    {' '}
                    <span className={style.currencyUnit}>b</span>
                  </p>
                </div>
              ) : null
            }

            <AddressOrTxID
              label={t('transaction.explorer')}
              txid={transactionInfo.txID}
              detail
            />
            <div className={`${style.detail} flex-center`}>
              <A
                href={explorerURL + transactionInfo.txID}
                title={`${t('transaction.explorerTitle')}\n${explorerURL}${transactionInfo.txID}`}>
                {t('transaction.explorerTitle')}
              </A>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
};
