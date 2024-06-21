import { useTranslation } from 'react-i18next';
import * as accountApi from '../../../api/account';
import { A } from '../../anchor/anchor';
import { AddressOrTxID } from './address-or-txid';
import { Amount } from '../../../components/amount/amount';
import { Arrow } from './arrow';
import { TxDate } from './date';
import { TxNote } from './note';
import { TxStatus } from './status';
import { TxAmount } from './amount';
import { TxFiat } from './fiat';
import { Dialog } from '../../dialog/dialog';
import style from '../transaction.module.css';
import { useEffect, useRef } from 'react';
import { TxDetail } from './tx-detail';

type TProps = {
  open: boolean;
  onClose: (open: boolean) => void;
  accountCode: string;
  internalID: string;
  note: string;
  status: accountApi.TTxStatus;
  type: accountApi.TTxType;
  numConfirmations: number;
  numConfirmationsComplete: number;
  time: string | null;
  amount: accountApi.IAmount;
  sign: string;
  typeClassName: string;
  feeRatePerKb: accountApi.IAmount;
  explorerURL: string;
}
export const TxDetails = ({
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
  feeRatePerKb,
  explorerURL,
}: TProps) => {
  const { i18n, t } = useTranslation();

  const transactionInfo = useRef<accountApi.ITransaction | null>();

  useEffect(() => {
    if (!transactionInfo.current) {
      accountApi.getTransaction(accountCode, internalID).then(transaction => {
        if (!transaction) {
          console.error('Unable to retrieve transaction ' + internalID);
        }
        transactionInfo.current = transaction;
      }).catch(console.error);
    }
  }, [accountCode, internalID]);

  // Amount and Confirmations info are displayed using props data
  // instead of transactionInfo because they are live updated.
  return (
    <Dialog
      open={open && !!transactionInfo.current}
      title={t('transaction.details.title')}
      onClose={() => onClose(false)}
      slim
      medium>
      {transactionInfo.current && (
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
          <TxDetail label={t('transaction.confirmation')}>
            {numConfirmations}
          </TxDetail>
          <TxStatus
            status={status}
            numConfirmations={numConfirmations}
            numConfirmationsComplete={numConfirmationsComplete}
            details
          />
          <TxDate
            time={time}
            label={t('transaction.details.date') + ':'}
            lang={i18n.language}
            detail
          />

          <TxFiat
            amount={amount}
            sign={sign}
            typeClassName={typeClassName}
            label={t('transaction.details.fiat')}
            details
          />
          <TxFiat
            amountAtTime={transactionInfo.current.amountAtTime}
            sign={sign}
            typeClassName={typeClassName}
            label={t('transaction.details.fiatAtTime')}
            details
          />
          <TxAmount
            amount={amount}
            sign={sign}
            label={t('transaction.details.amount')}
            typeClassName={typeClassName}
            details
          />
          <TxDetail label={t('transaction.fee')}>
            {
              transactionInfo.current.fee && transactionInfo.current.fee.amount ? (
                <p title={feeRatePerKb.amount ? feeRatePerKb.amount + ' ' + feeRatePerKb.unit + '/Kb' : ''}>
                  <Amount amount={transactionInfo.current.fee.amount} unit={transactionInfo.current.fee.unit} />
                  {' '}
                  <span className={style.currencyUnit}>{transactionInfo.current.fee.unit}</span>
                </p>
              ) : (
                <p>---</p>
              )
            }
          </TxDetail>
          <AddressOrTxID
            label={t('transaction.details.address')}
            addresses={transactionInfo.current.addresses}
            detail
          />
          { transactionInfo.current.gas ? (
            <TxDetail label={t('transaction.gas')}>
              {transactionInfo.current.gas}
            </TxDetail>
          ) : (null)
          }
          { transactionInfo.current.nonce ? (
            <TxDetail label="Nonce">
              {transactionInfo.current.nonce}
            </TxDetail>
          ) : (null)
          }
          { transactionInfo.current.weight ? (
            <TxDetail label={t('transaction.weight')}>
              {transactionInfo.current.weight}
              {' '}
              <span className={style.currencyUnit}>WU</span>
            </TxDetail>
          ) : (null)
          }
          { transactionInfo.current.vsize ? (
            <TxDetail label={t('transaction.vsize')}>
              {transactionInfo.current.vsize}
              {' '}
              <span className={style.currencyUnit}>b</span>
            </TxDetail>
          ) : (null)
          }
          { transactionInfo.current.size ? (
            <TxDetail label={t('transaction.size')}>
              {transactionInfo.current.size}
              {' '}
              <span className={style.currencyUnit}>b</span>
            </TxDetail>
          ) : (null)
          }
          <AddressOrTxID
            label={t('transaction.explorer')}
            txid={transactionInfo.current.txID}
            detail
          />
          <div className={`${style.detail} flex-center`}>
            <A
              href={explorerURL + transactionInfo.current.txID}
              title={`${t('transaction.explorerTitle')}\n${explorerURL}${transactionInfo.current.txID}`}>
              {t('transaction.explorerTitle')}
            </A>
          </div>
        </>
      )}
    </Dialog>
  );
};
