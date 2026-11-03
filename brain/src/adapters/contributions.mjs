import { AdapterBlocked, deliver, enabled, metadataEvent } from './common.mjs';

export async function handleContributionReceipt(input, config, deps, now = Date.now()) {
  enabled(config, deps, ['verifyBackendReceipt', 'enqueue']);
  // Browser success, form fields and client-side consent are not server receipts.
  const receipt = await deps.verifyBackendReceipt(input.receiptReference);
  if (receipt?.verified !== true || receipt.status !== 'UPLOAD_COMMITTED' || receipt.purpose !== 'archive_contribution' || receipt.processingConsent !== true || receipt.malwareScan !== 'PASS' || typeof receipt.id !== 'string' || typeof receipt.revision !== 'string') throw new AdapterBlocked('CONTRIBUTION_PRIVATE_REVIEW_REQUIRED');
  const event = await metadataEvent('site', receipt.id, receipt.revision, receipt.id, receipt.metadata, now);
  event.eventType = 'site.contribution.received';
  const result = await deliver(event, deps);
  return { status: 'PRIVATE_REVIEW', reason: 'PUBLIC_RELEASE_REQUIRES_INDEPENDENT_APPROVAL', ...result };
}
