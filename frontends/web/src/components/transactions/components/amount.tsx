import { IAmount } from '../../../api/account';
import { Amount } from '../../../components/amount/amount';
import parentStyle from '../transactions.module.css';
import style from '../transaction.module.css';

// no-detail:
//     content =       <span
//              className={`${style.amount} ${style.amountOverflow}`}
//              data-unit={` ${amount.unit}`}>
//              {sign}
//              <Amount amount={amount.amount} unit={amount.unit} />
//              <span className={style.currencyUnit}>&nbsp;{amount.unit}</span>
//            </span>
//
//          <div className={`${parentStyle.currency} ${typeClassName}`}>
//          </div>
// detail:
//             <div className={style.detail}>
//              <label>{t('transaction.details.amount')}</label>
//              <p className={typeClassName}>
//                <span className={style.amount}>
//                  {sign}
//                  <Amount amount={amount.amount} unit={amount.unit} />
//                </span>
//                {' '}
//                <span className={style.currencyUnit}>{transactionInfo.amount.unit}</span>
//              </p>
//            </div>

type TProps = {
  amount: IAmount;
  sign: string;
  typeClassName: string;
  label?: string;
  details?: boolean;
}

export const TxAmount = ({ amount, sign, typeClassName, label, details }: TProps) => {
  return (
    details ? (
      <div className={style.detail}>
        <label>{label}</label>
        <p className={typeClassName}>
          <span className={style.amount}>
            {sign}
            <Amount amount={amount.amount} unit={amount.unit} />
          </span>
          {' '}
          <span className={style.currencyUnit}>{amount.unit}</span>
        </p>
      </div>
    ) : (
      <div className={`${parentStyle.currency} ${typeClassName}`}>
        <span
          className={`${style.amount} ${style.amountOverflow}`}
          data-unit={` ${amount.unit}`}>
          {sign}
          <Amount amount={amount.amount} unit={amount.unit} />
          <span className={style.currencyUnit}>&nbsp;{amount.unit}</span>
        </span>
      </div>
    )
  );
};

