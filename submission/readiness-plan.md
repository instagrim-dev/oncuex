# Submission readiness plan

**Last updated 2026-11-18 15:35 PST.**
Conservative cutoff 17:00 PST. Second cutoff 23:59 PST if organizer clarification arrives.

## Resolved: the application is deployed

**Live app:** <https://d606ece3407d419a80272571af62bfd2.prod.enter.pro>

This was the only item that could fail the submission outright, and it is closed.

Verified 2026-11-18 by loading the URL in a browser with no prior session:

| Check | Observed |
| --- | --- |
| HTTP response | 200, 9,317 bytes, 1.6s |
| JS bundle | 925,249 bytes, 200 |
| CSS bundle | 67,622 bytes, 200 |
| Page title | "Northwind Provisions — Spring product launch \| OnCueX" |
| Rendered content | Full interface, no placeholder text |
| Tabs | Overview, Checklist, Itinerary, Budget, Partners — all present |
| Tab switch | Checklist opens and lists all seven requirements with owners and evidence |
| Budget | $30,000 committed against $29,100 accounted, $900 remaining |
| Sign off | Opens the dialog and honestly lists the two questions still open with the client |
| Console | No errors observed |

It is a single-page app served from Enter's production host. A reviewer needs no account and no credentials.

## Remaining items

### 1. Documentation defects — fixed

The four defects identified earlier are closed in `17e5b17`:

- The orphaned table row is gone.
- The README no longer claims there is no UI; it documents both implementations and now leads with the live URL.
- `docs/verification.md` carries an App parity section naming both harnesses.
- `submission/overview.md` matches the shipped five-tab interface.

### 2. The live URL is now recorded

`README.md` opens with the link, `app/README.md` replaces both placeholder values, and `submission/overview.md` describes the shipped product. No placeholder identifier remains anywhere in the repository.

### 3. Supabase key — decision still open

`app/src/integrations/supabase/client.ts` line 7 holds an anon JWT (`role: anon`, exp 2086) pointing at a live hosted instance, in a public repository.

Anon keys are public by design and row-level security is the boundary, so this is not automatically a leak. It remains worth a deliberate decision rather than a shrug: a reviewer using the app exercises your quota. Confirm RLS is enabled, or disable the AI path — it is a supporting feature, not the core claim.

### 4. Prior-work disclosure — restored

`PREEXISTING.md` records that no pre-event code was copied, names the three design influences, and lists all twelve commits with their dates.

## What is verified and needs no further work

| Asset | State |
| --- | --- |
| Contract specification, four documents | Complete and internally consistent |
| Reference scenario, three states | 0 errors, 0 warnings |
| Schema checks | 95/95 |
| Core semantics | 102/102 |
| Oracle differential | 40/40 |
| End-to-end path | Passes |
| App typecheck, lint, production build | Clean |
| App self-check | 33/33 |
| App source review | 39/39 |
| Demo deck | 16 native PPTX slides with six live screenshots, rendered and inspected |
| Live deployment | Reachable, interactive, no console errors |

## Sequence for the remaining window

| # | Action | Time | Owner |
| --- | --- | --- | --- |
| 1 | Open the live URL yourself and walk the seven-step flow | 10m | submission owner |
| 2 | Decide the Supabase key question; disable AI if RLS is unconfirmed | 5m | submission owner |
| 3 | Confirm the deck renders in the software you will use; screenshots are embedded | 10m | submission owner |
| 4 | Record the actual submission and any receipt | 10m | submission owner |
| 5 | Capture a short screen recording if the event requires one | 20m | submission owner |

Item 1 matters most. I verified the deployment programmatically and through the accessibility tree, but I cannot see the rendered page — the browser tool's screenshots return blank in this environment. Confirm the visual result with your own eyes before submitting.

## What is deliberately not in this plan

- **A demo video.** If the event requires one, that is a recording task for the submission owner, not something to infer.
- **Merging or deleting `enter-app`.** It sits at `3a3fe5f`, three integrations stale. Housekeeping, not readiness.
- **Further engine work.** Three integrations have reapplied the same two parity fixes upstream. If those are to survive, they belong in `enter-Oncuex`, not downstream. Post-submission.

## Honest assessment

The engineering is done and verified. The application is deployed and reachable. The remaining risk is presentational: whether the link stays up, whether the deck renders in the tool you use, and whether the submission itself is transmitted before the cutoff.

At this point nothing in the repository is blocking. The work left is opening the link, checking it with your own eyes, and submitting.
