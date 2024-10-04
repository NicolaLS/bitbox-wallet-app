/**
 * Copyright 2023-2024 Shift Crypto AG
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

import { ChangeEvent, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CoinCode, getReceiveAddressList } from '@/api/account';
import { debug } from '@/utils/env';
import { DarkModeContext } from '@/contexts/DarkmodeContext';
import { Input } from '@/components/forms';
import { QRCodeLight, QRCodeDark } from '@/components/icon';
import { ScanQRDialog } from '@/routes/account/send/components/dialogs/scan-qr-dialog';
import style from './receiver-address-input.module.css';
import { TxProposalContext } from '@/contexts/TxProposalContext';
import { alertUser } from '@/components/alert/Alert';
import { isBitcoinBased } from '@/routes/account/utils';
import { parseExternalBtcAmount } from '@/api/coins';

type TToggleScanQRButtonProps = {
    onClick: () => void;
}

type TReceiverAddressInputProps = {
    accountCode?: string;
    accountCoinCode: CoinCode;
}

export const ScanQRButton = ({ onClick }: TToggleScanQRButtonProps) => {
  const { isDarkMode } = useContext(DarkModeContext);
  return (
    <button type="button" onClick={onClick} className={style.qrButton}>
      {isDarkMode ? <QRCodeLight /> : <QRCodeDark />}
    </button>);
};

export const ReceiverAddressInput = ({
  accountCode,
  accountCoinCode
}: TReceiverAddressInputProps) => {
  const { t } = useTranslation();
  const { errorHandling, updateTxInput } = useContext(TxProposalContext);

  const [activeScanQR, setActiveScanQR] = useState(false);
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');

  const parseQRResult = async (uri: string) => {
    let qrAddress;
    let qrAmount = '';
    try {
      const url = new URL(uri);
      if (url.protocol !== 'bitcoin:' && url.protocol !== 'litecoin:' && url.protocol !== 'ethereum:') {
        alertUser(t('invalidFormat'));
        return;
      }
      qrAddress = url.pathname;
      if (isBitcoinBased(accountCoinCode)) {
        qrAmount = url.searchParams.get('amount') || '';
      }
    } catch {
      qrAddress = uri;
    }
    if (qrAmount) {
      if (accountCoinCode === 'btc' || accountCoinCode === 'tbtc') {
        const result = await parseExternalBtcAmount(qrAmount);
        if (result.success) {
          // Important to always show proposal.amount!!
          // FIXME: MAKE SURE TO USE proposal.address, proposal.amount
          // etc. in sub-components. I think I have this wrong in a few.
          // I MEANT txInput.XX txInput.amount NOT proposal lol.
          setAmount(result.amount);
        } else {
          // TODO: Add updateErrors to the context, so other compnents
          // can edit the error like below!
          // updateState['amountError'] = this.props.t('send.error.invalidAmount');
          return;
        }
      } else {
        setAmount(qrAmount);
      }
    }
    setAddress(qrAddress);
  };

  const onReceiverAddressInputChange = useCallback((recipientAddress: string) => {
    setAddress(recipientAddress);
  }, []);

  const handleSendToSelf = useCallback(async () => {
    if (!accountCode) {
      return;
    }
    try {
      const receiveAddresses = await getReceiveAddressList(accountCode)();
      if (receiveAddresses && receiveAddresses.length > 0 && receiveAddresses[0].addresses.length > 1) {
        onReceiverAddressInputChange(receiveAddresses[0].addresses[0].address);
      }
    } catch (e) {
      console.error(e);
    }
  }, [accountCode, onReceiverAddressInputChange]);

  const toggleScanQR = () => {
    setActiveScanQR(activeScanQR => !activeScanQR);
  };

  useEffect(() => {
    updateTxInput('address', address);
    updateTxInput('address', amount);
  }, [updateTxInput, address, amount]);

  return (
    <>
      {activeScanQR && (
        <ScanQRDialog
          toggleScanQR={toggleScanQR}
          onChangeActiveScanQR={setActiveScanQR}
          parseQRResult={parseQRResult}
        />
      )}
      <Input
        label={t('send.address.label')}
        placeholder={t('send.address.placeholder')}
        id="recipientAddress"
        error={errorHandling?.addressError}
        onInput={(e: ChangeEvent<HTMLInputElement>) => onReceiverAddressInputChange(e.target.value)}
        value={address}
        className={style.inputWithIcon}
        labelSection={debug ? (
          <span id="sendToSelf" className={style.action} onClick={handleSendToSelf}>
            Send to self
          </span>
        ) : undefined}
        autoFocus>
        <ScanQRButton onClick={toggleScanQR} />
      </Input>
    </>
  );
};
