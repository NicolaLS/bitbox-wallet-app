import parentStyle from '../transactions.module.css';
import style from '../transaction.module.css';

const parseTimeShort = (time: string, lang: string) => {
  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  } as Intl.DateTimeFormatOptions;
  return new Date(Date.parse(time)).toLocaleString(lang, options);
};

type TProps = {
  time: string | null;
  label: string;
  lang: string;
  detail?: boolean;
};

export const TxDate = ({ time, label, lang, detail }: TProps) => {
  const shortDate = time ? parseTimeShort(time, lang) : '---';
  return (
    detail ? (
      <div className={style.detail}>
        <label>{label}</label>
        <p>{shortDate}</p>
      </div>
    ) : (
      <div className={parentStyle.date}>
        <span className={style.columnLabel}>
          {label}:
        </span>
        <span className={style.date}>{shortDate}</span>
      </div>
    )
  );
};
