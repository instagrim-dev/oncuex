# Submission readiness plan

**Written 2026-11-18 13:37 PST. Conservative cutoff 17:00 PST — 3h 22m remaining.**
Second cutoff 23:59 PST — 10h 21m remaining if organizer clarification arrives.

This document is a decision agenda, not a status report. It states what blocks submission, in order, and what each choice costs.

## The blocker that outranks everything

**No judge can open this application.** There is no Enter preview URL anywhere in the repository. `app/README.md` line 21 still holds the literal placeholder:

```
**Live app:** https://<project-id>-latest.preview.enter.pro
```

Every other item below is secondary to this. A submission without a working link fails regardless of engine quality — the code is unreviewable by an organizer, and the challenge requires a Converge.AI-hosted product.

Resolving it means deploying `app/` to Enter and recording the resulting URL. That requires an Enter account with build credit. The prior Converge workspace note (`submissions/converge-ai/README.md`) recorded 85.39 credits remaining and confirmed `enter-cli` authentication on November 11. That is the only plausible path and it has not been attempted since.

Estimated 20–40 minutes if credentials and credits hold. If they do not, no amount of remaining work produces a submittable artifact.

## Blocking defects in the public repository

These are visible to any reviewer opening the repo right now.

### 1. Malformed README (2 minutes)

Line 70 is an orphaned table row appended after a paragraph, breaking the Reference implementation section:

```
...byte-identical.
| [tools/validate_fixtures.py](../tools/validate_fixtures.py) | Mechanical enforcement... |
```

Fix: delete line 70 or fold it into the Specification table.

### 2. README denies the application exists (3 minutes)

Line 59 states:

> `oncuex/` is a headless engine... **It has no UI and no platform adapter.**

`app/` has held a full React operator interface since `3a3fe5f` and the authoritative Enter workspace since `eedcf8f`. The README is describing the state from six commits ago. This is the single most damaging inaccuracy: it tells a reviewer not to look at the part that took the most work.

Fix: replace that sentence, add an `app/` row to the Specification table, and state the run command.

### 3. No documentation of the app at all (15 minutes)

`grep` for `app/` across `docs/` returns nothing. The 24 verification checks in `docs/verification.md` describe the Python reference, while the app carries its own 33 self-checks plus 16 source-review checks. A reviewer cannot tell that the shipped artifact satisfies the written contract.

Fix: one short section stating the relationship — Python reference is normative, the app ports it, both harnesses run, and the parity checks are named. Do not duplicate the check list.

### 4. Overview describes the pre-redesign product (20 minutes)

`submission/overview.md` describes brief-paste → extraction → adoption → evidence → readiness → acceptance. That path still exists underneath, but the shipped UI is now Overview / Checklist / Itinerary / Budget / Partners with sign-off in the header and a source-review inbox. The overview promises a screen the reviewer will not find.

Fix: revise the "What it does" section to match the five-tab shape and name source review, while keeping the existing readiness/acceptance distinction, which remains accurate and is the actual differentiator.

## Risk that needs an explicit decision

**A live Supabase anon key is committed to a public repository.**

`app/src/integrations/supabase/client.ts` line 7 contains a JWT with `role: anon` and a far-future expiry, pointing at `br-gutsy-dory-01ed5c3c.supabase.aidap-global.ap-southeast-1.bytepluses.com`.

Anon keys are designed to be public — row-level security is the actual boundary — so this is not automatically a leak. Two conditions make it worth a decision rather than a shrug:

1. The key belongs to a live hosted instance, not a local development stack.
2. The repository is public and the AI function depends on that instance, so a judge running the app exercises real infrastructure with your quota.

Options: leave it and confirm RLS is enabled; rotate and move to env config; or disable the AI path for submission and let it degrade visibly. The third is safest if RLS state is unknown and time is short — the AI is a supporting feature, not the core claim.

## Prior-work disclosure

`PREEXISTING.md` was deleted during the rewrite from planning documents to specification. The event rules ask for disclosure of actually reused pre-event code. Nothing in `app/` predates November 17 as far as the commit history shows, but the file that would state this plainly is gone.

Cost: 10 minutes to restore a short disclosure. Risk if skipped: an organizer question at judging with no written answer.

## What is genuinely ready

Do not rebuild these. They are verified and passing as of this writing.

| Asset | State |
| --- | --- |
| Contract specification (4 documents) | Complete, internally consistent |
| Reference scenario with 3 states | Validated: 0 errors, 0 warnings |
| Schema checks | 95/95 |
| Core semantics | 102/102 |
| Oracle differential | 40/40 |
| End-to-end path (change → recovery → acceptance → reload) | Passes |
| App typecheck, lint, production build | Clean |
| App self-check + source review | 33/33 and 16/16 |
| Verified parity between Python reference and app engine | Confirmed load-bearing by reverting each guard |

The engineering is not the risk. The packaging is.

## Sequence at the conservative cutoff

Ordered by risk removed per minute. Each item lists its stop condition.

| # | Action | Time | Stop condition |
| --- | --- | --- | --- |
| 1 | Attempt Enter deployment; record preview URL in README | 20–40m | Fails → go to #2 for the 23:59 window, and prepare a clearly labeled local-run instruction as fallback |
| 2 | Fix README: delete orphan row, correct the "no UI" claim | 5m | — |
| 3 | Review the Supabase key decision with the AI owner | 5m | RLS unconfirmed → disable AI path for submission |
| 4 | Add the app section to docs and a Specification row | 15m | — |
| 5 | Revise `overview.md` to the five-tab shape | 20m | — |
| 6 | Restore prior-work disclosure | 10m | — |
| 7 | Verify the link from a clean browser profile | 5m | Broken → treat as #1 failure |
| 8 | Record actual submission status | 5m | — |

Items 2–6 are documentation only. None require a code change, a rebuild, or a re-run of the suites.

## What is not in this plan, deliberately

- **A demo video.** Not verifiable in the time available, and a rushed recording is worse than an honest absence. If the event requires one, that is a scope decision for the submission owner, not an engineering task I can complete unreviewed.
- **Merging or deleting `enter-app`.** It sits at `3a3fe5f`, two integrations stale. Housekeeping, not readiness.
- **Further engine work.** Three integrations have now reapplied the same two parity fixes upstream. If those are to survive, they belong in `enter-Oncuex`, not downstream — but that is a post-submission concern.

## The honest assessment

The product is in better shape than the repository describes it. The failure mode in the next three hours is not a defect — it is a reviewer opening a README that says there is no UI, following a link that does not exist, and stopping.

Deployment first. Everything else is fifteen-minute increments that make the existing work legible.
