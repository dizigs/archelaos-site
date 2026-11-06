/**
 * Read-only shape adapters for currently independent provider PRs.
 * These methods DO NOT authenticate a provider, reserve funds, create a PR,
 * grant merge permission or invoke the remote adapters.
 */
import {
  IntegrationBlocked, REPOSITORY, REQUIRED_JOBS,
  confirmBrainReceipt, normalizeIntent, safePath
} from './index.mjs';

const A_MODELS = new Set(['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite']);
const B_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const SHA = /^[a-f0-9]{40}$/;
const stop = code => { throw new IntegrationBlocked(code); };
const validString = (v, limit, nonempty = true) =>
  typeof v === 'string' && v.length <= limit && (!nonempty || v.trim().length > 0);
const safeFile = (p, task) => safePath(p) && task.paths.some(scope =>
  scope.endsWith('/') ? p.startsWith(scope) : p === scope);
const unique = entries => new Set(entries.map(e => e.path)).size === entries.length;

/**
 * Parse concrete #214 Gemini and #211 Gemma outputs into one immutable
 * REVIEW-ONLY suggestion. Brain approval readback is mandatory, but output
 * provenance and ledger settlement MUST be checked independently by the
 * trusted runner. Neither a provider response nor this object is a draft PR.
 * #211 currently omits commitSha from its output. Build B is deliberately
 * BLOCKED until its owner supplies an attested exact-SHA result; do not infer
 * SHA from the untrusted task object.
 */
export function normalizeNativeProposal(taskInput, receipt, providerOutput, now = Date.now()) {
  const task = normalizeIntent(taskInput);
  confirmBrainReceipt(task, receipt, now);
  if (task.type !== 'build') stop('NOT_A_BUILD_INTENT');
  const out = providerOutput;
  if (!out || typeof out !== 'object' || Array.isArray(out)) stop('INVALID_PROVIDER_OUTPUT');
  let modelId, changes, summary, testNotes, risks;
  if (task.lane === 'A') {
    if (out.status !== 'DRAFT_REVIEW_REQUIRED' || out.provider !== 'gemini' ||
        !A_MODELS.has(out.modelId) || out.taskId !== task.taskId ||
        out.commitSha !== task.commitSha || out.githubWritesPerformed !== false ||
        out.testsExecuted !== false || out.mergeAllowed !== false ||
        out.deployAllowed !== false || !validString(out.reservationId, 128) ||
        !out.proposal || !Array.isArray(out.proposal.changes) ||
        !Array.isArray(out.proposal.testNotes) || !Array.isArray(out.proposal.risks))
      stop('GEMINI_OUTPUT_CONTRACT_MISMATCH');
    modelId = out.modelId;
    summary = out.proposal.summary;
    changes = out.proposal.changes.map(c => ({
      path: c?.path, content: c?.content, rationale: c?.rationale
    }));
    testNotes = out.proposal.testNotes;
    risks = out.proposal.risks;
    if (changes.length < 1 || changes.length > 3 ||
        changes.some(c => !validString(c.rationale, 400) || !validString(c.content, 6000, false)))
      stop('GEMINI_OUTPUT_CONTRACT_MISMATCH');
  } else if (task.lane === 'B') {
    if (out.status !== 'proposed' || out.modelId !== B_MODEL ||
        out.eventId !== task.taskId || out.commitSha !== task.commitSha ||
        out.writesPerformed !== false ||
        out.mergeAllowed !== false || out.deployAllowed !== false ||
        !out.proposal || !Array.isArray(out.proposal.files) ||
        !Array.isArray(out.proposal.tests) || !['low','medium','high'].includes(out.proposal.risk))
      stop('GEMMA_OUTPUT_CONTRACT_MISMATCH');
    modelId = out.modelId;
    summary = out.proposal.summary;
    changes = out.proposal.files.map(f => ({
      path: f?.path, content: f?.replacement, rationale: f?.reason
    }));
    testNotes = out.proposal.tests;
    risks = [out.proposal.risk];
    if (changes.length < 1 || changes.length > 8 ||
        changes.some(c => !validString(c.rationale, 1000) || !validString(c.content, 16000)))
      stop('GEMMA_OUTPUT_CONTRACT_MISMATCH');
  } else stop('UNSUPPORTED_BUILD_LANE');
  if (!validString(summary, 2000) || !unique(changes) ||
      changes.some(c => !safeFile(c.path, task)) ||
      testNotes.length > 8 || testNotes.some(v => !validString(v, 500)) ||
      risks.length > 8 || risks.some(v => !validString(v, 500)))
    stop('UNSAFE_OR_OUT_OF_SCOPE_PROPOSAL');
  return Object.freeze({
    status: 'PROPOSAL_REVIEW_ONLY', repository: REPOSITORY,
    taskId: task.taskId, receiptId: task.receiptId, commitSha: task.commitSha,
    lane: task.lane, modelId, summary,
    changes: Object.freeze(changes.map(c => Object.freeze({ ...c }))),
    testNotes: Object.freeze([...testNotes]), risks: Object.freeze([...risks]),
    draftPrCreated: false, testsPassed: false, ledgerReconciled: false,
    mergeAllowed: false, deployAllowed: false
  });
}

/**
 * #212 returns workflow path, run ID, job names and state, but omits run_attempt
 * and repository evidence in its public report. Do NOT invent those fields to
 * satisfy evaluateTestingGate. Instead request independent GitHub readback.
 */
export function inspectNativeTestingReport(taskInput, receipt, report, now = Date.now()) {
  const task = normalizeIntent(taskInput);
  confirmBrainReceipt(task, receipt, now);
  if (task.type !== 'testing') stop('NOT_A_TESTING_INTENT');
  if (!report || report.sha !== task.commitSha || !SHA.test(report.sha || '') ||
      !Array.isArray(report.checks) || report.checks.length > 50 ||
      !['passed','blocked'].includes(report.status))
    stop('TEST_REPORT_CONTRACT_MISMATCH');
  const issues = [];
  for (const [name, requiredJobs] of Object.entries(REQUIRED_JOBS)) {
    const matches = report.checks.filter(c => c?.workflow === '.github/workflows/' + name);
    if (matches.length !== 1) { issues.push(name + ':missing_or_duplicate'); continue; }
    const c = matches[0];
    if (!Number.isSafeInteger(c.runId) || c.runId <= 0 ||
        c.state !== 'passed' || c.conclusion !== 'success' ||
        !Array.isArray(c.jobs) || requiredJobs.some(job =>
          c.jobs.filter(j => j?.name === job && j?.status === 'completed' &&
            j?.conclusion === 'success').length !== 1) ||
        c.jobs.some(j => j?.status !== 'completed' || j?.conclusion !== 'success'))
      issues.push(name + ':not_successful');
  }
  if (report.status !== 'passed') issues.push('native_executor_blocked');
  return Object.freeze({
    status: issues.length ? 'TESTING_BLOCKED' : 'NEEDS_AUTHORITATIVE_RUN_ATTEMPT_READBACK',
    repository: REPOSITORY, commitSha: task.commitSha, issues: Object.freeze(issues),
    testingGatePassed: false, mergeAllowed: false, deployAllowed: false
  });
}
