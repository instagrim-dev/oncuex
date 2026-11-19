# Submission packet

Everything an organizer or judge needs, in the order they would look for it.

**Assembled 2026-11-18 15:35 PST.** Verify each item before transmitting; see [Verification](#verification) for what was checked and by what method.

## The entry

| Field | Value |
| --- | --- |
| Event | OnCueX challenge, Converge AI Stanford |
| Submission | OnCueX — event readiness that keeps approval tied to its evidence |
| Live application | <https://d606ece3407d419a80272571af62bfd2.prod.enter.pro> |
| Demo video | <https://youtu.be/4r6gBrXQnpM> — **currently private on YouTube; must be set to unlisted or public before submission** |
| Source repository | <https://github.com/instagrim-dev/oncuex> |
| Required platform | Enter (Converge.AI) — satisfied; the app is built and published on Enter |
| Demo Day | 20 November 2026 |
| Submission status | **Not yet transmitted** — this packet is the assembly, not the receipt |

## Artifacts

| Artifact | Path | State |
| --- | --- | --- |
| Live application | the URL above | Reachable, renders, interactive |
| Demo video | youtu.be/4r6gBrXQnpM | **Private — not viewable by a judge until visibility changes** |
| Demo deck (PowerPoint) | [oncuex-demo.pptx](oncuex-demo.pptx) | 16 slides, native shapes, speaker notes |
| Demo deck (HTML) | [demo-slides.html](demo-slides.html) | Same argument, browser-native, no assets |
| One-page overview | [overview.md](overview.md) | Written for the shipped product |
| Product screenshots | [screenshots/](screenshots/) | Six, from the live deployment |
| Contract specification | [../docs/](../docs/) | Four documents, 24 behavioural checks |
| Prior-work disclosure | [../PREEXISTING.md](../PREEXISTING.md) | No pre-event code reused |
| Readiness plan | [readiness-plan.md](readiness-plan.md) | Open items and their owners |

## The argument in one paragraph

A launch plan is not ready because its tasks are checked off. Readiness is computed from current, attributable evidence against one snapshot, and it reports named gaps rather than a score. Acceptance is not computed: it exists only as a record made by a named project manager against one revision, one requirement set and one evidence set. When the venue moves, impact is derived from what each commitment actually depends on, so six requirements lose their support while a photographer deliverable that binds to no venue field stays valid. The earlier acceptance becomes history, and reverting the venue does not revive it.

## What a reviewer can check in five minutes

1. Open the live URL. No account, no credentials.
2. Read the Overview tab — the launch, the next work, the team, the budget.
3. Open **Event settings → Move the venue to Pier 9 Loft**, then the Checklist. Six rows go stale; photography stays valid.
4. Open **Sign off**. It lists the questions still open with the client rather than showing a clean state.
5. Export the project from settings and re-import it. Decisions keep the currentness they were recorded with.

Steps 3 and 4 are the product's claim. If they behave as described, the claim holds.

## Verification

| Check | Method | Result |
| --- | --- | --- |
| Live URL responds | HTTP request | 200, 1.6s |
| Bundle integrity | fetched JS and CSS | 200, 925 KB and 68 KB |
| Renders with content | browser, no prior session | full interface, no placeholder |
| Tab interaction | clicked each tab | all five switch |
| Venue change | drove it in the browser | six requirements reopened |
| Sign-off dialog | opened it | names open client questions |
| Deck renders | LibreOffice → PDF → rasterise | 16 pages, no overflow |
| Deck geometry | shape bounds inspection | no shape off-slide |
| Reference suites | executed | 0 / 95 / 102 / 40, end-to-end passes |
| App harnesses | executed | 33 / 33 and 39 / 39 |

## Limitations stated plainly

- **One synthetic launch.** A result on this fixture is a result on this fixture. No savings claim is made, and no comparison against a manual baseline was measured.
- **No authentication.** The project-manager role is a simulated identity. The record lives in the reviewer's browser; nothing is shared between users.
- **The system checks records, not reality.** Access windows, capacity and cost are compared as recorded values. Permits, accessibility and physical safety remain with qualified people.
- **The AI proposes; it cannot write.** Extraction and drafting are allowlisted and schema-validated. No model output reaches the authoritative record without a separate human command.
- **All data is fictional.** People, venues, vendors and prices were authored for this submission.

## Before transmitting

- [ ] **Set the demo video to unlisted or public** — it is private now, so judges cannot open it
- [ ] Open the live URL and confirm it loads in your own browser
- [ ] Confirm the deck opens in the presentation software you will use — fonts are Georgia and Courier New, both standard
- [ ] Confirm the deadline: the event page states Nov 18, 5:00 PM PT
- [ ] Decide the Supabase anon key question — see [readiness-plan.md](readiness-plan.md)
- [ ] Record the actual submission channel, time and any receipt below

## Submission record

| Field | Value |
| --- | --- |
| Submitted at | — |
| Submitted by | — |
| Channel | — |
| Receipt or confirmation | — |
| Candidate release | `a3d7d7b` plus the deck refinement commit |
| Deviations | — |

This row is filled in only after transmission. It is not a plan.
