/**
 * Copyright 2018 Shift Devices AG
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

import { ChangeEvent, Component } from 'react';
import * as accountApi from '@/api/account';
import { syncdone } from '@/api/accountsync';
import { convertFromCurrency, convertToCurrency } from '@/api/coins';
import { View, ViewContent } from '@/components/view/view';
import { TDevices, hasMobileChannel } from '@/api/devices';
import { getDeviceInfo } from '@/api/bitbox01';
import { alertUser } from '@/components/alert/Alert';
import { Balance } from '@/components/balance/balance';
import { HideAmountsButton } from '@/components/hideamountsbutton/hideamountsbutton';
import { Button } from '@/components/forms';
import { BackButton } from '@/components/backbutton/backbutton';
import { Column, ColumnButtons, Grid, GuideWrapper, GuidedContent, Header, Main } from '@/components/layout';
import { Status } from '@/components/status/status';
import { translate, TranslateProps } from '@/decorators/translate';
import { FeeTargets } from './feetargets';
import { isBitcoinBased } from '@/routes/account/utils';
import { ConfirmSend } from './components/confirm/confirm';
import { SendGuide } from './send-guide';
import { MessageWaitDialog } from './components/dialogs/message-wait-dialog';
import { ReceiverAddressInput } from './components/inputs/receiver-address-input';
import { NoteInput } from './components/inputs/note-input';
import { TSelectedUTXOs } from './utxos';
import { TProposalError } from './services';
import { ContentWrapper } from '@/components/contentwrapper/contentwrapper';
import { CoinControl } from './coin-control';
import style from './send.module.css';
import { TxProposalProvider } from '@/contexts/TxProposalProvider';
import { AmountInputs } from './amount-inputs';

interface SendProps {
    account: accountApi.IAccount;
    devices: TDevices;
    deviceIDs: string[];
    activeCurrency: accountApi.Fiat;
}

type Props = SendProps & TranslateProps;

export type State = {
    account?: accountApi.IAccount;
    balance?: accountApi.IBalance;
    recipientAddress: string;
    amount: string;
    fiatAmount: string;
    sendAll: boolean;
    feeTarget?: accountApi.FeeTargetCode;
    customFee: string;
    isConfirming: boolean;
    sendResult?: accountApi.ISendTx;
    // wil be removed when we create sub-compnent for inputs.
    amountError?: TProposalError['amountError'];
    paired?: boolean;
    noMobileChannelError?: boolean;
    note: string;
}

class Send extends Component<Props, State> {
  private selectedUTXOs: TSelectedUTXOs = {};
  private unsubscribe?: () => void;

  public readonly state: State = {
    recipientAddress: '',
    amount: '',
    fiatAmount: '',
    sendAll: false,
    isConfirming: false,
    noMobileChannelError: false,
    note: '',
    customFee: '',
  };

  public componentDidMount() {
    const updateBalance = (code: string) => accountApi.getBalance(code)
      .then(balance => this.setState({ balance }))
      .catch(console.error);

    updateBalance(this.props.account.code);

    if (this.props.deviceIDs.length > 0 && this.props.devices[this.props.deviceIDs[0]] === 'bitbox') {
      hasMobileChannel(this.props.deviceIDs[0])().then((mobileChannel: boolean) => {
        return getDeviceInfo(this.props.deviceIDs[0])
          .then(({ pairing }) => {
            const paired = mobileChannel && pairing;
            const noMobileChannelError = pairing && !mobileChannel && isBitcoinBased(this.props.account.coinCode);
            this.setState(prevState => ({ ...prevState, paired, noMobileChannelError }));
          });
      }).catch(console.error);
    }

    this.unsubscribe = syncdone((code) => {
      if (this.props.account.code === code) {
        updateBalance(code);
      }
    });
  }

  public componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  // Sorry have to convert amount inputs because otherwise using the context is a pain in the ass..
  /*
   * -> don't forget to update fiat and amont when createing the sub-component.
  public componentDidUpdate() {
    const proposal = this.props.txProposalContext.proposal;
    if (!proposal) {
      return;
    }
    if (proposal.success) {
      // Update fiat and set amount.
      this.setState({ amount: proposal.amount.amount }, () => {
        this.convertToFiat(this.state.amount);
      });
    }
  }
  */


  private send = async () => {
    if (this.state.noMobileChannelError) {
      alertUser(this.props.t('warning.sendPairing'));
      return;
    }
    const code = this.props.account.code;
    const connectResult = await accountApi.connectKeystore(code);
    if (!connectResult.success) {
      return;
    }

    this.setState({ isConfirming: true });
    try {
      const result = await accountApi.sendTx(code, this.state.note);
      this.setState({ sendResult: result, isConfirming: false });
      setTimeout(() => this.setState({ sendResult: undefined }), 5000);
      if (result.success) {
        this.setState({
          sendAll: false,
          isConfirming: false,
          recipientAddress: '',
          fiatAmount: '',
          amount: '',
          note: '',
          customFee: '',
        });
        this.selectedUTXOs = {};
      }
    } catch (err) {
      console.error(err);
    } finally {
      // The following method allows pressing escape again.
      this.setState({ isConfirming: false, });
    }
  };

  private getValidTxInputData = (): Required<accountApi.TTxInput> | false => {
    if (
      !this.state.recipientAddress
      || this.state.feeTarget === undefined
      || (!this.state.sendAll && !this.state.amount)
      || (this.state.feeTarget === 'custom' && !this.state.customFee)
    ) {
      return false;
    }
    return {
      address: this.state.recipientAddress,
      amount: this.state.amount,
      feeTarget: this.state.feeTarget,
      customFee: this.state.customFee,
      sendAll: (this.state.sendAll ? 'yes' : 'no'),
      selectedUTXOs: Object.keys(this.selectedUTXOs),
      paymentRequest: null,
    };
  };

  private handleNoteInput = (event: ChangeEvent<HTMLInputElement>) => {
    const target = event.target;
    this.setState({
      'note': target.value,
    });
  };

  private handleFiatInput = (fiatAmount: string) => {
    this.setState({ fiatAmount });
    this.convertFromFiat(fiatAmount);
  };

  // Put this in utils file, because both qr and inputs need it.
  private convertToFiat = async (amount: string) => {
    if (amount) {
      const coinCode = this.props.account.coinCode;
      const data = await convertToCurrency({
        amount,
        coinCode,
        fiatUnit: this.props.activeCurrency,
      });
      if (data.success) {
        this.setState({ fiatAmount: data.fiatAmount });
      } else {
        this.setState({ amountError: this.props.t('send.error.invalidAmount') });
      }
    } else {
      this.setState({ fiatAmount: '' });
    }
  };

  private convertFromFiat = async (amount: string) => {
    if (amount) {
      const coinCode = this.props.account.coinCode;
      const data = await convertFromCurrency({
        amount,
        coinCode,
        fiatUnit: this.props.activeCurrency,
      });
      if (data.success) {
        this.setState({ amount: data.amount }, () => this.props.txProposalContext.updateTxInput('amount', data.amount));
      } else {
        this.setState({ amountError: this.props.t('send.error.invalidAmount') });
      }
    } else {
      this.setState({ amount: '' });
    }
  };

  private feeTargetChange = (feeTarget: accountApi.FeeTargetCode) => {
    this.setState(
      { feeTarget, customFee: '' },
      () => {
        this.props.txProposalContext.updateTxInput('feeTarget', feeTarget);
        this.props.txProposalContext.updateTxInput('customFee', '');
      },
    );
  };

  private hasSelectedUTXOs = (): boolean => {
    return Object.keys(this.selectedUTXOs).length !== 0;
  };


  private onCoinAmountChange = (amount: string) => {
    this.convertToFiat(amount);
    this.setState({ amount }, () => {
      this.props.txProposalContext.updateTxInput('amount', this.state.amount);
    });
  };

  private onSendAllChange = (sendAll: boolean) => {
    if (!sendAll) {
      this.convertToFiat(this.state.amount);
    }
    this.setState({ sendAll }, () => {
      this.props.txProposalContext.updateTxInput('sendAll', this.state.sendAll ? 'yes' : 'no');
    });
  };

  public render() {
    const {
      account,
      activeCurrency,
      t,
      txProposalContext
    } = this.props;
    const {
      balance,
      recipientAddress,
      amount,
      /* data, */
      fiatAmount,
      sendAll,
      feeTarget,
      customFee,
      isConfirming,
      sendResult,
      amountError,
      paired,
      note,
    } = this.state;

    const {
      proposal,
      isUpdating,
    } = txProposalContext;

    const {
      fee: proposedFee,
      amount: proposedAmount,
      total: proposedTotal,
    } = proposal?.success ? proposal : { fee: undefined, amount: undefined, total: undefined };


    const waitDialogTransactionDetails = {
      proposedFee,
      proposedAmount,
      proposedTotal,
      customFee,
      feeTarget,
      recipientAddress,
      activeCurrency,
    };

    const device = this.props.deviceIDs.length > 0 && this.props.devices[this.props.deviceIDs[0]];

    return (
      <GuideWrapper>
        <GuidedContent>
          <Main>
            <ContentWrapper>
              <Status type="warning" hidden={paired !== false}>
                {t('warning.sendPairing')}
              </Status>
            </ContentWrapper>
            <Header
              title={<h2>{t('send.title', { accountName: account.coinName })}</h2>}
            >
              <HideAmountsButton />
            </Header>
            <TxProposalProvider accountCode={account.code}>
              <View>
                <ViewContent>
                  <div>
                    <label className="labelXLarge">{t('send.availableBalance')}</label>
                  </div>
                  <Balance balance={balance} noRotateFiat/>
                  <div className={`flex flex-row flex-between ${style.container}`}>
                    <label className="labelXLarge">{t('send.transactionDetails')}</label>
                    <CoinControl account={account} />
                  </div>
                  <Grid col="1">
                    <Column>
                      <ReceiverAddressInput
                        accountCode={account.code}
                        accountCoinCode={account.coinCode}
                      />
                    </Column>
                  </Grid>
                  <AmountInputs
                    balance={balance}
                  />
                  <Grid>
                    <Column>
                      <FeeTargets
                        accountCode={account.code}
                        coinCode={account.coinCode}
                        disabled={!amount && !sendAll}
                        fiatUnit={activeCurrency}
                        proposedFee={proposedFee}
                        customFee={customFee}
                        showCalculatingFeeLabel={isUpdating}
                        onFeeTargetChange={this.feeTargetChange}
                        onCustomFee={customFee => this.setState({ customFee }, () => {
                          this.props.txProposalContext.updateTxInput('customFee', this.state.customFee);
                        })} />
                    </Column>
                    <Column>
                      <NoteInput
                        note={note}
                        onNoteChange={this.handleNoteInput}
                      />
                      <ColumnButtons
                        className="m-top-default m-bottom-xlarge"
                        inline>
                        <Button
                          primary
                          onClick={this.send}
                          disabled={!this.getValidTxInputData() || !proposal?.success || isUpdating}>
                          {t('send.button')}
                        </Button>
                        <BackButton
                          enableEsc>
                          {t('button.back')}
                        </BackButton>
                      </ColumnButtons>
                    </Column>
                  </Grid>
                </ViewContent>

                {device && (
                  <ConfirmSend
                    device={device}
                    baseCurrencyUnit={activeCurrency}
                    note={note}
                    hasSelectedUTXOs={this.hasSelectedUTXOs()}
                    isConfirming={isConfirming}
                    selectedUTXOs={Object.keys(this.selectedUTXOs)}
                    coinCode={account.coinCode}
                    transactionDetails={waitDialogTransactionDetails}
                  />
                )}

                <MessageWaitDialog result={sendResult}/>
              </View>
            </TxProposalProvider>
          </Main>
        </GuidedContent>
        <SendGuide coinCode={account.coinCode} />
      </GuideWrapper>

    );
  }
}

const TranslatedSend = translate()(Send);
export { TranslatedSend as Send };
