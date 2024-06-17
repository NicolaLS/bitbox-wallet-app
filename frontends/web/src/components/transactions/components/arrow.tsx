import { TTxStatus, TTxType } from '../../../api/account';
import { ArrowIn, ArrowOut, ArrowSelf } from './icons';
import { Warning } from '../../icon/icon';
import parentStyle from '../transactions.module.css';
import style from '../transaction.module.css';

type TProps = {
  txStatus: TTxStatus;
  txType: TTxType;
  label?: string;
  details?: boolean;
}

export const Arrow = ({ txStatus, txType, label, details }: TProps) => {
  let arrow = <ArrowSelf />;
  if (txStatus === 'failed') {
    arrow = <Warning style={{ maxWidth: '18px' }} />;
  } else if (txType === 'receive') {
    arrow =
        <ArrowIn />;
  } else if (txType === 'send') {
    arrow =
        <ArrowOut />;
  }
  return (
    <div className={details ? style.detail : parentStyle.type }>
      { label && <label>{label}</label>}
      { details ? (<p>{arrow}</p>) : (arrow) }
    </div>
  );
};
