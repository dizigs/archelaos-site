// Reuse the canonical Brain Durable Object budget tables and reserve/claim/settle logic.
// IMPORTANT: Pass the SAME BrainCoordinator ctx.storage; never create a separate ledger.
import { reserveBudget, settleBudget, claimBudgetCall, MAX_MONTHLY_MICRO_EUR } from '../../brain/src/budget.mjs';

export function createBrainLedgerAdapter(storage, costConfig, clock = Date.now) {
  if (!storage || typeof storage.transactionSync !== 'function' || !storage.sql)
    throw new Error('CANONICAL_BRAIN_DURABLE_STORAGE_REQUIRED');
  if (!costConfig || costConfig.coverageConfirmed !== true ||
      (costConfig.capMicroEur ?? MAX_MONTHLY_MICRO_EUR) !== MAX_MONTHLY_MICRO_EUR)
    throw new Error('SHARED_AI_BUDGET_NOT_VERIFIED');
  return Object.freeze({
    reserve: async charge => storage.transactionSync(() => reserveBudget(storage.sql, charge, costConfig, clock())),
    claim: async id => storage.transactionSync(() => claimBudgetCall(storage.sql, id)),
    settle: async (id, actualMicroEur) =>
      storage.transactionSync(() => settleBudget(storage.sql, id, actualMicroEur))
  });
}
