/*
 * Copyright 2024 Shift Crypto AG
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

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AccountCode, proposeTx, TTxInput, TTxProposalResult } from '@/api/account';
import { TxProposalContext } from './TxProposalContext';
import { TProposalError, txProposalErrorHandling } from '@/routes/account/send/services';

type TProps = {
    accountCode: AccountCode;
    children: ReactNode;
}

export const TxProposalProvider = ({
  accountCode,
  children
}: TProps) => {
  const [txInput, setTxInput] = useState<Partial<TTxInput>>({});
  const [proposal, setProposal] = useState<TTxProposalResult>();
  const [errorHandling, setErrorHandling] = useState<TProposalError>();
  // IMPORTANT: we start with false; no proposal yet = false, invalid proposal = false, isupdating = undefined
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const proposeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // in case there are multiple parallel tx proposals we can ignore all other but the last one
  const lastProposalRef = useRef<Promise<TTxProposalResult> | null >();

  const updateTxInput: <K extends keyof TTxInput>(key: K, value: TTxInput[K]) => void = useCallback(
    <K extends keyof TTxInput>(key: K, value: TTxInput[K]) => {
      setTxInput((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const txInputIsComplete = useCallback((): boolean => {
    return !(
      !txInput.address
      || !txInput.feeTarget
      || (!txInput.sendAll && !txInput.amount)
      || (txInput.feeTarget === 'custom' && !txInput.customFee)
    );
  }, [txInput]);

  // Remember watch proposal.amount and convert to fiat if it changes.
  // Also remember you will be using local amount state NOT txInput.amount
  // in the sub-components. We can't set txInput.amount from here (loop)
  // but we'll set local amount = proposal.amount in the sub-components.
  useEffect(() => {
    // Reset errors and proposed values even if not enough data for submit.
    setErrorHandling(undefined);
    setProposal(undefined);
    if (!txInputIsComplete()) {
      return;
    }
    const completeTxInput = txInput as TTxInput;
    setIsUpdating(true);
    if (proposeTimeoutRef.current) {
      clearTimeout(proposeTimeoutRef.current);
      proposeTimeoutRef.current = null;
    }
    // defer the transaction proposal
    proposeTimeoutRef.current = setTimeout(async () => {
      const proposePromise = proposeTx(accountCode, completeTxInput);
      // keep this as the last known proposal
      lastProposalRef.current = proposePromise;
      try {
        const result = await proposePromise;
        // continue only if this is the most recent proposal
        if (proposePromise === lastProposalRef.current) {
          if (result.success) {
            // remember we don't need to update fiat, it will update
            // automatically when it sees proposal.amount change.
            setErrorHandling(undefined);
            setProposal(result);
          } else {
            const errors = txProposalErrorHandling(result.errorCode);
            setErrorHandling(errors);
          }
        }
        setIsUpdating(false);
      } catch (error) {
        setIsUpdating(false);
        console.error('Failed to propose transaction:', error);
      } finally {
        // cleanup regardless of success or failure
        if (proposePromise === lastProposalRef.current) {
          lastProposalRef.current = null;
        }
      }
    }, 400); // Delay the proposal by 400 ms
  }, [txInput, txInputIsComplete, accountCode]);

  return (
    <TxProposalContext.Provider value={{ txInput, proposal, isUpdating, updateTxInput, errorHandling }}>
      {children}
    </TxProposalContext.Provider>
  );
};

