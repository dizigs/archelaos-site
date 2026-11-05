# Policy review boundary — 2026-11-03

**Current official policies could not be independently retrieved in this
environment. No compliance certification is made.** The direct request to
`https://support.google.com/grants/answer/9042207` failed with
`curl: (56) CONNECT tunnel failed, response 403`. Captured headers identify
`server: envoy`: destination network denial before an HTTPS Google response.
This is not evidence of missing Google/GitHub credentials or an Ads rejection.
No unchanged failing request was repeated; no proxy bypass was attempted.

Reference pages to verify through an authorized available browser:

| Official source | Intended review | Local verification |
| --- | --- | --- |
| https://support.google.com/grants/answer/9042207 | Account-management policy, keywords, CTR and account structure | Retrieval blocked as above |
| https://support.google.com/nonprofits/answer/1332166?hl=en | Ad Grants programme information | Reference recorded in repository Issue #41; not independently fetched here |
| https://support.google.com/nonprofits/answer/9314402?hl=en | Ad Grants setup reference used by #41 | Reference only; not independently fetched here |
| https://www.google.com/about/company/user-consent-policy/ | EU user-consent policy | Not verified in this session |
| https://developers.google.com/tag-platform/security/guides/consent | Consent Mode guidance | Not verified in this session |
| https://developers.google.com/google-ads/scripts/docs/start | Scripts runtime, Preview and AdsApp reference | Runtime/API compatibility pending real authorized Preview |

The draft's **provisional monitoring thresholds** reflect the requirements
previously identified in #41 and conventional Ad Grants preparation. Revalidate
each against current official policy before treating a finding as a violation:

- Flag disapproved enabled ads for review. A limited/pending ad is not blindly
  treated as disapproved; policy reasons require the actual Ads account evidence.
- Flag quality score 1–2 and non-exempt single-word keywords. Scores absent or
  invalid are unknown. Only this organisation's brand forms are excepted in the
  initial narrow checker; this is not a complete policy exception catalogue.
- Calculate the 5% CTR review threshold over each of the last two **complete**
  account-local calendar months. One low month is a warning; two indicate a
  potential sustained-policy issue. Zero impressions/missing data are unknown.
  Partial current-month CTR never triggers a two-month conclusion.
- Use mission-related Search drafts, local presence targeting, two groups,
  multiple relevant RSA drafts and at least two sitelinks as preparation checks.
  Passing those checks is not proof of Google approval or programme eligibility.
- Require meaningful verified conversions and current privacy/consent compliance.
  Page visits are not automatically counted as primary lead conversions.

The script never auto-pauses a keyword/ad to alter CTR, changes a bid strategy,
sets a budget, resets a security baseline or suppresses a finding. #41 records
programme/account setup and administrative deadlines; no invitation, terms,
payments, logo or external service is changed here. The JSON budget remains
null. Official policy, actual account configuration and eligibility remain
authoritative; monitor thresholds do not replace them.
