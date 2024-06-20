import { IAmount } from '../../../api/account';
import { FiatConversion } from '../../rates/rates';
import parentStyle from '../transactions.module.css';
import style from '../transaction.module.css';

type TFiat = {
  amount: IAmount;
  amountAtTime?: never;
}


type TFiatAtTime = {
  amount?: never;
  amountAtTime: IAmount | null;
}
type TGenericProps = {
  sign: string;
  typeClassName: string;
  details?: boolean;
  label?: string;
}

type TProps = TGenericProps & TFiat | TGenericProps & TFiatAtTime;

export const TxFiat = ({
  amount,
  sign,
  typeClassName,
  amountAtTime,
  label,
  details
}: TProps) => {
  return (
    details ? (
      <div className={style.detail}>
        <label>{label}</label>
        <p>
          <span className={`${style.fiat} ${typeClassName}`}>
            { amountAtTime !== null && amountAtTime !== undefined ? (
              <FiatConversion amount={amountAtTime} sign={sign} noAction />
            ) : amount ? (
              <FiatConversion amount={amount} sign={sign} noAction />
            ) : (
              // transaction.amountAtTime is undefined.
              <FiatConversion noAction />
            )}
          </span>
        </p>
      </div>
    ) : (
      <div className={parentStyle.fiat}>
        <span className={`${style.fiat} ${typeClassName}`}>
          <FiatConversion amount={amount} sign={sign} noAction />
        </span>
      </div>
    )
  );

};
