import { useCallback, useContext, useEffect, useState } from 'react';
import { CoinCode, Fiat, IBalance } from '@/api/account';
import { Column, Grid, } from '@/components/layout';
import { TxProposalContext } from '@/contexts/TxProposalContext';
import { CoinInput } from './components/inputs/coin-input';
import { FiatInput } from './components/inputs/fiat-input';
import { convertFromCurrency, convertToCurrency } from '@/api/coins';

type TProps = {
  activeCurrency: Fiat;
  balance?: IBalance;
  coinCode: CoinCode;
}
export const AmountInputs = ({
  activeCurrency,
  balance,
  coinCode,
}: TProps) => {
  const { txInput, proposal, updateTxInput, errorHandling } = useContext(TxProposalContext);
  // NOTE: Just realized that all sub-components should probably not have
  // copies but use it directly.
  // TODO: see if there are other sub-comps that do that wrong.
  // const [amount, setAmount] = useState('');
  const [fiatAmount, setFiatAmount] = useState('');
  // same here..
  // const [sendAll, setSendAll] = useState(false);

  const inputAmount = txInput.amount ? txInput.amount : '';
  const proposedAmount = proposal?.success ? proposal.amount : undefined;

  const hasSelectedUTXOs = () => {
    // always remember txInput is PARTIAL so all are optional
    if (!txInput.selectedUTXOs) {
      return false;
    }
    return txInput.selectedUTXOs.length > 0;
  };

  const convertToFiat = useCallback(async (amount: string | undefined) => {
    if (amount) {
      const data = await convertToCurrency({
        amount,
        coinCode,
        fiatUnit: activeCurrency,
      });
      if (data.success) {
        setFiatAmount(data.fiatAmount);
      } else {
        // TODO: amount error update
        // this.setState({ amountError: this.props.t('send.error.invalidAmount') });
      }
    } else {
      setFiatAmount('');
    }
  }, [activeCurrency, coinCode]);

  const convertFromFiat = async (amount: string) => {
    if (amount) {
      const data = await convertFromCurrency({
        amount,
        coinCode,
        fiatUnit: activeCurrency,
      });
      if (data.success) {
        updateTxInput('amount', data.amount);
      } else {
        // TODO: Add updateErrors to context!
        // this.setState({ amountError: this.props.t('send.error.invalidAmount') });
      }
    } else {
      updateTxInput('amount', '');
    }
  };

  const handleFiatInput = (fiatAmount: string) => {
    // NOTE: We don't use useeffect because we
    // only want to calculate and set amount if fiat was typed
    // but fiat might get changed by an effect
    setFiatAmount(fiatAmount);
    convertFromFiat(fiatAmount);
  };

  useEffect(() => {
    // HACK..these problems come from dublicate state in sub-comps
    // ie amount in QR (receive address) and also here..we need to sync them but don\t want to update fiat if it was set by handleFiatInput
    convertToFiat(txInput.amount);
  }, [convertToFiat, txInput.amount, proposal]);

  return (
    <Grid>
      <Column>
        <CoinInput
          balance={balance}
          onAmountChange={(amount) => {
            updateTxInput('amount', amount);
          }}
          onSendAllChange={(sendAll) => {
            updateTxInput('sendAll', sendAll);
          }}
          sendAll={txInput.sendAll}
          amountError={errorHandling?.amountError}
          proposedAmount={proposedAmount}
          amount={inputAmount}
          hasSelectedUTXOs={hasSelectedUTXOs()}
        />
      </Column>
      <Column>
        <FiatInput
          onFiatChange={handleFiatInput}
          disabled={txInput.sendAll === 'yes'}
          error={errorHandling?.amountError}
          fiatAmount={fiatAmount}
          label={activeCurrency}
        />
      </Column>
    </Grid>
  );
};
