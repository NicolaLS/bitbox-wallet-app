import style from '../transaction.module.css';

type TProps = React.PropsWithChildren<{
  label: string;
}>;

export const TxDetail = ({ label, children }: TProps) => {
  return (
    <div className={style.detail}>
      <label>{label}</label>
      <p>
        {children}
      </p>
    </div>
  );
};
