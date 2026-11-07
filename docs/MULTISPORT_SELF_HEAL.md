# Multisport launch and self-heal foundations

## Scope
The draft foundation describes how each sport site could expand safely, **without activating a new site or second scheduler**.

### Launch gates (fail closed)
`config/sport-launch-readiness.json` tracks ten release gates per department. All release gates begin **unverified**; the approved archery palette is captured separately in the design registry. A GitHub draft PR is not independent evidence of production readiness. `tools/audit_sport_launch.py` is an offline validator, not a network or Cloudflare check.

Required: approved identity, real DNS routing, Cloudflare production SHA+logs, SEO, Search Console, GA4+consent, privacy/security, mobile/a11y, lawful sourced data, and canonical Hall/history links.

### Self-heal lifecycle
`config/sport-self-heal-policy.json` is a proposed policy, **not active automation**:
1. Observe via existing live-health and automation-health workflows (reuse, do not duplicate cron).
2. Classify errors with concrete run/resource/time/status evidence.
3. Deduplicate using `(sportKey, failureClass, resource)`, apply cooldown and attempt limits.
4. If an issue is verifiable, propose minimal corrective change in a scoped draft PR and test it.
5. Promote only through required branch protection, reviews, real deployment logs and consent/ownership checks.

No self-heal should alter DNS, tokens, consent, production deployments, canonical Hall IDs, or historical evidence autonomously. No endless retry loops. Where another owner (Codex) works, log a handoff instead of racing their PR.

### Existing workflows, observed in main
- `.github/workflows/live-health.yml`: scheduled public HTTP checks (every six hours), read-only.
- `.github/workflows/automation-health.yml`: scheduled GitHub schedule-evidence checks (every six hours), read-only.

This PR deliberately **does not modify either workflow**, because the owner already maintains site-health/self-heal automation and competing schedules are undesirable.

### Scale-out
Once archery is tested and released, the same architecture can be applied to wrestling and other departments, but each needs separate visual approval and all ten independent release gates. No auto-replication or blanket theme inheritance.
