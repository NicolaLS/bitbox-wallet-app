import { useTranslation } from 'react-i18next';
import { ProgressRing } from '../../progressRing/progressRing';
import parentStyle from '../transactions.module.css';
import style from '../transaction.module.css';

type TProps = {
  status: string;
  numConfirmations: number;
  numConfirmationsComplete: number;
  details?: boolean;
}

export const TxStatus = ({ status, numConfirmations, numConfirmationsComplete, details }: TProps) => {
  const { t } = useTranslation();
  const statusText = t(`transaction.status.${status}`);
  const progress = numConfirmations < numConfirmationsComplete ? (numConfirmations / numConfirmationsComplete) * 100 : 100;
  const isComplete = numConfirmations >= numConfirmationsComplete;
  return (
    <div className={details ? style.detail : parentStyle.status}>
      {details ? (
        <>
          <label>{t('transaction.details.status')}</label>
          <p className="flex flex-items-center">
            <ProgressRing
              className="m-right-quarter"
              width={14}
              value={progress}
              isComplete={isComplete}
            />
            <span className={style.status}>
              {statusText}{status === 'pending' && <span> {`(${numConfirmations}/${numConfirmationsComplete})`}</span>}
            </span>
          </p>
        </>
      ) : (
        <>
          <span className={style.columnLabel}>
            {t('transaction.details.status')}:
          </span>
          <ProgressRing
            className="m-right-quarter"
            width={14}
            value={progress}
            isComplete={isComplete}
          />
          <span className={style.status}>{statusText}</span>
        </>
      )}
    </div>
  );
};
