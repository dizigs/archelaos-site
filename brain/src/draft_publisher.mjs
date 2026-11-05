import { HEX } from './contract.mjs';

export function planDraftPullRequest(draft) {
  if (draft?.status !== 'DRAFT_REQUIRES_REVIEW' || !HEX.test(draft.draftId) || !['history', 'hall', 'stories', 'news'].includes(draft.target) || draft.publicPublishingAllowed !== false || !Array.isArray(draft.facts) || draft.facts.length < 1 || draft.facts.some(fact => fact.provenance?.confidence !== 'VERIFIED_REGISTRY_FACT')) throw new Error('Only independently verified review drafts may be planned');
  return { mode: 'DRY_RUN', repository: 'dizigs/archelaos-site', branch: 'bot/brain/' + draft.draftId.slice(0, 16), base: 'main', draft: true,
    path: 'brain-output/drafts/' + draft.target + '/' + draft.draftId + '.json', content: JSON.stringify(draft, null, 2) + '\n',
    idempotencyKey: draft.draftId, requiredChecksAndReviewBeforeMerge: true, automaticMerge: false, sourceFileMutation: false };
}
export async function proposeDraftPullRequest(draft, integration, mode = 'dry-run') {
  const plan = planDraftPullRequest(draft);
  if (mode === 'dry-run') return { status: 'PR_PLAN_ONLY', plan, remoteMutationPerformed: false };
  // Explicit injected test-double boundary. Production adapters cannot be
  // activated by passing ordinary event fields or a source-document instruction.
  if (mode !== 'synthetic-test-double' || integration?.syntheticOnly !== true) throw new Error('Live content publication is not authorized or configured');
  const existing = await integration.lookupById(plan.idempotencyKey);
  if (existing) return { status: 'SIMULATED_DRAFT_REUSED', reference: existing.reference, remoteMutationPerformed: false };
  await integration.assertNoOtherOwner(plan.path);
  const proposal = await integration.createDraft(plan);
  if (proposal?.draft !== true || typeof proposal.reference !== 'string' || !proposal.reference.startsWith('mock://')) throw new Error('Synthetic publisher returned invalid evidence');
  return { status: 'SIMULATED_DRAFT_CREATED', reference: proposal.reference, remoteMutationPerformed: false };
}
