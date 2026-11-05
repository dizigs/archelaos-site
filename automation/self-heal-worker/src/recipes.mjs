// Reviewed reference data copied from docs/self-heal/error-solution-catalog.json
// (revision 2026-11-03). NO executable commands. Any update requires a reviewed PR.
export const CATALOG_REVISION = '2026-11-03';
export const REVIEWED_RECIPES = Object.freeze([
  Object.freeze({
    id: 'ARCH-HTML-ESCAPES-001', incidentCode: 'HTML_ESCAPED_TEXT',
    status: 'ISOLATED_REPAIR_VERIFIED', target: '/news.html',
    description: 'Known escaped HTML text: stage fixture guard failed before, passed after.',
    mode: 'DRAFT_PR_ONLY', productionVerified: false
  }),
  Object.freeze({
    id: 'ARCH-LIVE-HEALTH-UNKNOWN-001', incidentCode: 'LIVE_HEALTH_FAILURE',
    status: 'DIAGNOSE_ONLY', target: '/',
    description: 'Public-site health failure requires exact production logs and independent HTTP proof.',
    mode: 'NO_AUTOMATIC_REPAIR', productionVerified: false
  }),
  Object.freeze({
    id: 'ARCH-SONAR-SECURITY-C-001', incidentCode: 'SONAR_SECURITY_FINDING',
    status: 'DIAGNOSE_ONLY', target: '/ci',
    description: 'Security quality gate requires fresh verified findings and reviewed source-level changes.',
    mode: 'NO_AUTOMATIC_REPAIR', productionVerified: false
  })
]);
