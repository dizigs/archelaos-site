# Bounded central-site self-heal controller

## Scope and current boundary

The central site is the only deployment target. Department sites do not exist yet;
this work adds reusable interfaces, not new pages, domains, DNS or hosting services.
Draft #90 remains the owner of the registry, sport policy and future prototypes.
The controller reads that policy at an immutable reviewed commit if main does not
contain it, validates it and enforces additional compiled ceilings. It neither
executes unmerged prototype code nor creates another policy or cron schedule.

The initial integration is an **isolated manual Actions drill** in the existing
`site-watch-and-repair.yml` workflow. The existing main monitoring implementation
remains active while the replacement adapter is verified. Full production
controller activation is a separate remaining integration step; do not describe
this draft as a fully deployed autonomous system.

## Durable decisions

An incident key is the #90-compatible first 12 hex characters of SHA-256 over
`sportKey|failureClass|resource`. Trusted append-only GitHub Issue comments persist
the reservation, tests, publication authority and exact proposed Draft PR.
Only comments by the repository owner or the numeric GitHub Actions bot identity
are accepted. Malformed trusted events, incomplete pagination and ambiguous
containers stop execution. Closed incidents are also checked.

The caller serializes writers using the existing workflow concurrency group.
Reservation is durable **before** repair. A crash does not silently release it.
Identical conditions permit one attempt; changed conditions still require a
minimum 180-minute cooldown and have a three-attempt total ceiling. Repeated
unresolved observations escalate. Unknown faults are diagnosed without a fix.
An API timeout has unknown outcome and is never retried automatically.

Publication is limited to one attempt per authority. If Actions lacks PR-create
permissions, an already configured runtime identity may reconcile the same tested
candidate once under a changed authority. It must recheck source bytes, candidate
bytes, remote guard, PR ownership and existing PRs; it cannot repeat the repair.
There is no merge, deployment, arbitrary ref update or permissions API in the
publisher. Main cannot be a mutation target.

## Actual drill

`tools/self_heal_fixture.py --prepare-case CASE --source-commit FULL_SHA` creates
one isolated `codex/self-heal-staging-CASE` ref containing a deliberately faulty
`self-heal-fixtures/news-head.html`. It refuses a source missing current main.
Dispatch the existing site-watch workflow on that staging ref. The source run,
repository, event, workflow path, branch and full commit are verified before writes.

The existing `repair_news_head` implementation is reused. The actual independent
HTML guard runs in separate Python processes: exit 1 on the injected fault, exit 0
after repair, and idempotence is required. The publisher rereads the remote bytes
and compares the complete PR file list before proposing one Draft PR **against the
staging branch**. No real article or historical record is changed. A fresh journal
adapter immediately replays the observation and must make zero write attempts.

The CLI emits sanitized JSON and a check annotation containing source/run/incident,
actual red/green results, proposed PR, replay counters and exact known access
failure evidence. It never emits credentials, raw stderr or private records.
An isolated drill is not a production outage, a merged change or provider proof.

For an explicit permissions failure only, a configured runtime identity can use:

```sh
python tools/self_heal_fixture.py --source-commit FULL_SHA \
  --branch codex/self-heal-staging-CASE --run-id SOURCE_RUN \
  --resume-issue INCIDENT_NUMBER
```

GitHub-token-created refs/PRs may not trigger further CI automatically. Such a PR
remains Draft until the exact head has actual required CI evidence. Never treat
an offline guard as proof of the complete browser/release suite.

## Checks and remaining work

Run `python -m unittest discover -s tests -p 'test_self_heal_*.py' -v` and the
repository's pinned actionlint. The tests cover real guard subprocess failures,
unknown body faults, forged events, interrupted reservations, retry ceilings,
durable JSON reload, API failures, source confinement and draft-only publication.
Network writes are tested separately by the controlled Actions drill; offline
fakes are not represented as GitHub integration evidence.

Remaining gates: real staged run and deduplicated Draft PR, exact-head CI, replacement
of the legacy main adapter without duplicate issues/PRs, foundation review, normal
protected merge, then exact-production-SHA verification using #101's real
Cloudflare stage/log/HTTP gate. Security Rating A on main remains independent #66.
No department launch, advertising activation or automatic merge is enabled.
