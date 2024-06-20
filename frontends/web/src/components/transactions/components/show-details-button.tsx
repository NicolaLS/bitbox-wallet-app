import { ExpandIcon } from '../../icon/icon';
import parentStyle from '../transactions.module.css';
import style from '../transaction.module.css';

type TProps = {
  onClick: () => void;
  expand: boolean;
  hideOnMedium?: boolean;

}
// NOTE: Since no other components but this are using ExpandIcon, it could be moved here from
// ../../icon/icon and replace this component.
export const ShowDetailsButton = ({ onClick, expand, hideOnMedium }: TProps) => {
  return (
    <div className={`${parentStyle.action} ${hideOnMedium ? parentStyle.hideOnMedium : ''}`}>
      <button type="button" className={style.action} onClick={onClick}>
        <ExpandIcon expand={expand} />
      </button>
    </div>
  );
};
