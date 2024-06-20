import { CopyableInput } from '../../copy/Copy';
import parentStyle from '../transactions.module.css';
import style from '../transaction.module.css';
//
type TOnlyAdresses = {
  addresses: string[];
  txid?: never;
}

type TOnlyTxID = {
  addresses?: never;
  txid: string;
}

type TProps = (TOnlyAdresses | TOnlyTxID) & {
  label: string;
  detail?: boolean;
}

export const AddressOrTxID = ({
  label,
  addresses,
  txid,
  detail,
}: TProps) => {
  const containerClass = detail ? `${style.detail} ${style.addresses}` : parentStyle.activity;
  const labelElement = detail ? <label>{label}</label> : <span className={style.label}>{label}</span>;

  return (
    <div className={containerClass}>
      {labelElement}
      { addresses ? (
        <Addresses
          addresses={addresses}
          detail={detail}
        />
      ) : (
        <AddrOrTxID values={[txid]} />
      )}
    </div>
  );
};

type TAddressesProps = {
  addresses: string[];
  detail?: boolean;
}
const Addresses = ({ addresses, detail }: TAddressesProps) => {
  return (
    detail ? (
      <AddrOrTxID values={addresses} />
    ) : (
      <span className={style.address}>
        {addresses[0]}
        {addresses.length > 1 && (
          <span className={style.badge}>
                    (+{addresses.length - 1})
          </span>
        )}
      </span>
    )
  );
};

type TAddrOrTxIDProps = {
  values: string[]
}

const AddrOrTxID = ({ values }: TAddrOrTxIDProps) => {
  return (
    <div className={style.detailAddresses}>
      {values.map((add_or_txid) => (
        <CopyableInput
          key={add_or_txid}
          alignRight
          borderLess
          flexibleHeight
          className={style.detailAddress}
          value={add_or_txid} />
      ))}
    </div>
  );
};
