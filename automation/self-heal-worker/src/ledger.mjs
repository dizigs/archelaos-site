import { REPOSITORY, SITE_PATHS, FINDING_CODES, classification, idFor, parseFinding } from './policy.mjs';
import { REVIEWED_RECIPES, CATALOG_REVISION } from './recipes.mjs';

// Own SQLite-backed Durable Object; never share or migrate the brain's existing DB.
// This is a bounded incident *mirror*, not a replacement for trusted GitHub Issue comments.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, code TEXT NOT NULL, resource TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, observation_count INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, source TEXT NOT NULL, evidence_id TEXT NOT NULL, commit_sha TEXT NOT NULL, observed_at TEXT NOT NULL, received_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS observations_incident ON observations(incident_id,received_at)',
  'CREATE TABLE IF NOT EXISTS reviewed_recipes (id TEXT PRIMARY KEY,incident_code TEXT NOT NULL,status TEXT NOT NULL,target TEXT NOT NULL,description TEXT NOT NULL,mode TEXT NOT NULL,revision TEXT NOT NULL,production_verified INTEGER NOT NULL DEFAULT 0)'
];
const MAX_INCIDENTS = 1000;
const MAX_OBSERVATIONS = 10000;

export class HealerLedger {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    for (const ddl of SCHEMA) this.sql.exec(ddl);
    for (const recipe of REVIEWED_RECIPES) this.sql.exec(
      'INSERT OR IGNORE INTO reviewed_recipes(id,incident_code,status,target,description,mode,revision,production_verified) VALUES(?,?,?,?,?,?,?,?)',
      recipe.id, recipe.incidentCode, recipe.status, recipe.target, recipe.description,
      recipe.mode, CATALOG_REVISION, recipe.productionVerified ? 1 : 0);
  }
  reviewedRecipe(recipeId) {
    if (!recipeId) return null;
    if (!REVIEWED_RECIPES.some(recipe => recipe.id === recipeId)) throw new TypeError('UNREVIEWED_RECIPE');
    const row = [...this.sql.exec('SELECT id,status,target,description,mode,revision,production_verified FROM reviewed_recipes WHERE id=?', recipeId)][0];
    return row ? { id: row.id, status: row.status, target: row.target, description: row.description,
      mode: row.mode, revision: row.revision, productionVerified: row.production_verified === 1,
      executable: false } : null;
  }
  async record(value, now = Date.now()) {
    const finding = parseFinding(value, now);
    const incidentId = await idFor(REPOSITORY + '|' + finding.code + '|' + finding.resource);
    const observationId = await idFor(finding.source + '|' + finding.evidenceId + '|' +
      finding.commit + '|' + finding.code + '|' + finding.resource);
    const diagnosis = classification(finding.code);
    return this.storage.transactionSync(() => {
      const existing = [...this.sql.exec('SELECT id FROM observations WHERE id=?', observationId)][0];
      if (existing) {
        const incident = [...this.sql.exec('SELECT observation_count FROM incidents WHERE id=?', incidentId)][0];
        return { status: 'DUPLICATE', incidentId, observationCount: incident?.observation_count ?? 0, diagnosis };
      }
      const totals = [...this.sql.exec(
        'SELECT (SELECT COUNT(*) FROM incidents) AS incidents, (SELECT COUNT(*) FROM observations) AS observations'
      )][0];
      const row = [...this.sql.exec('SELECT id FROM incidents WHERE id=?', incidentId)][0];
      if ((!row && totals.incidents >= MAX_INCIDENTS) || totals.observations >= MAX_OBSERVATIONS)
        throw new Error('HEALER_LEDGER_CAPACITY_REACHED');
      this.sql.exec(
        'INSERT INTO incidents(id,code,resource,first_seen,last_seen,observation_count) VALUES(?,?,?,?,?,1) ' +
        'ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,observation_count=observation_count+1',
        incidentId, finding.code, finding.resource, now, now
      );
      this.sql.exec('INSERT INTO observations(id,incident_id,source,evidence_id,commit_sha,observed_at,received_at) VALUES(?,?,?,?,?,?,?)',
        observationId, incidentId, finding.source, finding.evidenceId, finding.commit, finding.observedAt, now);
      const incident = [...this.sql.exec('SELECT observation_count FROM incidents WHERE id=?', incidentId)][0];
      return { status: 'RECORDED', incidentId, observationCount: incident.observation_count, diagnosis };
    });
  }
  find(code, resource) {
    if (!Object.hasOwn(FINDING_CODES, code) ||
      !(SITE_PATHS.has(resource) || resource === '/ci' || resource === '/deployment'))
      throw new TypeError('INVALID_INCIDENT_QUERY');
    const row = [...this.sql.exec('SELECT id,first_seen,last_seen,observation_count FROM incidents WHERE code=? AND resource=?', code, resource)][0];
    return { status: row ? 'FOUND' : 'NOT_FOUND', incidentId: row?.id ?? null,
      firstSeen: row?.first_seen ?? null, lastSeen: row?.last_seen ?? null,
      observationCount: row?.observation_count ?? 0, diagnosis: classification(code),
      reviewedRecipe: this.reviewedRecipe(classification(code).recipe) };
  }
  status() {
    const totals = [...this.sql.exec(
      'SELECT (SELECT COUNT(*) FROM incidents) AS incidents, (SELECT COUNT(*) FROM observations) AS observations, (SELECT COUNT(*) FROM reviewed_recipes) AS recipes'
    )][0];
    return { status: 'READY_READ_ONLY', schemaVersion: 1,
      incidentCount: totals.incidents, observationCount: totals.observations,
      reviewedRecipeCount: totals.recipes, catalogRevision: CATALOG_REVISION,
      autoRepairAllowed: false, outboundAccessEnabled: false };
  }
}
