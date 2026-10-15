# Glampro Suite — improvement tracker

## Resume in a new session

Reliable first prompt:

> Read /home/tuangpi/Documents/Aridient/Glampros/glampro_suite/TASKS.md and /home/tuangpi/Documents/Aridient/Glampros/glampro_suite/docs/STATE.md, inspect the working tree, then continue the next unblocked task. Ask about unclear scope; preserve existing work and leave the design folder unchanged.

Once those documents are loaded, `next` or `what next?` resumes in-progress work,
then selects the next unblocked setup/P0 task. `task P0-03` or `task TK2610-0007`
selects a specific task. `session summary` updates the handoff. In plan mode,
investigate only; in act mode, implement one bounded slice and verify it.
Without automatic agent configuration, a bare `next` in a fresh chat is not guaranteed
to load these documents; use the explicit prompt above.

## Sources and scope

- Product scope: /home/tuangpi/Documents/Aridient/Glampros/glampro_suite/docs/Glampro_Product_Review_and_Roadmap_v1_0_2026-10-15.docx
- External task IDs/schedule: /home/tuangpi/Documents/Aridient/Glampros/glampro_suite/docs/PJ2610-0026.pdf
- Improve existing code; no rewrite. No Docker or GitHub Actions work.
- Leave the design folder and original DOCX/PDF unchanged.
- Retain useful architecture decisions; review conflicts rather than discarding history.
- Dates in the PDF are October 16–23, 2026 plans, not delivery guarantees.
  P1/P2 overlap P0 in that schedule; dependencies and UAT govern readiness.

## Status and completion reminders

Statuses: Not assessed / Not started / In progress / Testing / Blocked /
Ready for UAT / Done. Assess existing code before assuming a feature is absent.
Calendar, discounts/voids and shift-related work already exist in this working tree.
A completed slice is not a completed task. Mark Ready for UAT only after full scope
and validation; mark Done after user acceptance. Parent phases and milestones need
all children and explicit sign-off. Record evidence and remaining scope in STATE.md.

At every session end, explicitly remind the user either:
- PJ2610-0026 update: TK2610-XXXX / Pn-NN is ready for acceptance; after UAT mark it complete in your task system.
- PJ2610-0026 update: no external task is ready to mark complete; state remaining scope.

Record user confirmation. Reminders occur during sessions, not in the background.
Do not edit the PDF or mark its tasks complete automatically. Trademark checks,
grant submission and provider onboarding require external evidence, not only code.

## Setup tasks (not extra PDF tasks)

| ID | Scope | Status | Next action / evidence |
| --- | --- | --- | --- |
| SETUP-01 | Tracker and session handoff | Testing | Verify task coverage and documentation references. |
| SETUP-02 | Missing root tooling / baseline health | Blocked | Ask whether deleted root package.json, lockfile, tsconfig and formatting configuration were intentional before restoring/replacing. App scripts use npm workspaces, not evidence of pnpm. |
| SETUP-03 | Glampro Suite web branding | Testing | Five web source/test files updated; focused test/typecheck required. Does not complete P2-06 trademark/domain checks. |
| SETUP-04 | GitHub rename and local origin | Done | User confirmed rename 2026-10-15; API verified Tuangpi/glampro_suite with unchanged ID 1396845545. Updated this clone's origin; SSH ls-remote origin HEAD passed (exit 0). Other clones/integrations remain separate if present. |
| SETUP-05 | Reported database rename | Not assessed | Confirm environment, backup/data preservation, actual DB name and secret-safe connection configuration. No reset/reseed. |
| SETUP-06 | Documentation audit | In progress | Remove deleted agent-configuration dependencies; review remaining broken legacy links and Docker instructions incrementally. Preserve historical ADR meaning. |

## PDF task mapping — one row per task

All product tasks are Not assessed, not asserted missing or completed. The original
DOCX says Not started; the reviewed demo may differ from this working tree.
Consult the original PDF for per-task dates and the DOCX for full acceptance scope.
Phase 1: October 16–20; Phase 2: October 19–22; Phase 3: October 19–23, 2026.

| PDF task | Roadmap item / scope | Phase | Priority | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| TK2610-0001 | Phase 1 – P0 Launch blockers | Phase 1 | Program | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0004 | P0-07 Remove developer copy & system-status panel | Phase 1 | P0 – Launch blocker | In progress | Dashboard diagnostics/polling and developer copy removed; regression tests updated but blocked by missing tools. Settings, Sale, internal module labels and other screens still need audit. |
| TK2610-0005 | P0-09 Security hardening | Phase 1 | P0 – Launch blocker | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0006 | P0-08 Localisation: S$, DD/MM/YYYY, timezone/locale | Phase 1 | P0 – Launch blocker | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0007 | P0-03 Business hours / outlet operating hours | Phase 1 | P0 – Launch blocker | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0008 | P0-05 Enable Packages & Gift cards in demo | Phase 1 | P0 – Launch blocker | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0009 | P0-01 GST settings, tax line on sales & tax reports | Phase 1 | P0 – Launch blocker | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0010 | P0-02 Receipts: thermal print + email/WhatsApp e-receipt | Phase 1 | P0 – Launch blocker | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0011 | P0-04 Local payment methods | Phase 1 | P0 – Launch blocker | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0012 | P0-06 Reports: Z-report, sales by staff/service, package liability | Phase 1 | P0 – Launch blocker | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0013 | MILESTONE – P0 UAT & sales-demo readiness sign-off (20 Oct) | Phase 1 | Program | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0002 | Phase 2 – P1 Competitive parity | Phase 2 | Program | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0014 | P1-09 Clean up duplicate staff names in performer picker | Phase 2 | P1 – Competitive | Done | User accepted the delivered picker-only scope on 2026-10-15. Sale and appointment pickers deduplicate repeated account IDs and distinguish matching names by email (ID fallback), without merging staff records or changing eligibility. Web suite: 40 files / 354 tests passed; web typecheck, lint, scoped Prettier and production build passed. No database access. External task-system completion remains a user action. |
| TK2610-0015 | P1-06 PDPA consent + marketing opt-in | Phase 2 | P1 – Competitive | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0016 | P1-05 Customer profile page | Phase 2 | P1 – Competitive | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0017 | P1-07 POS upgrades | Phase 2 | P1 – Competitive | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0018 | P1-01 Calendar view: day/week, staff columns, drag-and-drop | Phase 2 | P1 – Competitive | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0019 | P1-08 Staff: rosters, working hours, commission, POS PIN | Phase 2 | P1 – Competitive | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0021 | P1-04 WhatsApp/SMS reminders, confirmations, rebooking | Phase 2 | P1 – Competitive | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0020 | P1-02 Multi-service & recurring bookings, rooms/equipment | Phase 2 | P1 – Competitive | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0022 | P1-03 Online booking page + deposits / no-show fee | Phase 2 | P1 – Competitive | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0023 | MILESTONE – Final launch readiness review (22 Oct) | Phase 2 | Program | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0003 | Phase 3 – P2 Vertical, differentiators & go-to-market | Phase 3 | Program | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0024 | P2-06 Rebrand from Glampro Salon; trademark & domain checks | Phase 3 | P2 – Go-to-market | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0026 | P2-05 PSG pre-approved listing – prepare & submit application | Phase 3 | P2 – Go-to-market | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0025 | P2-01 Aesthetics/spa module | Phase 3 | P2 – Vertical | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0027 | P2-03 Family/shared prepaid credit, package transfer, expiry rules | Phase 3 | P2 – Differentiator | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0028 | P2-02 Multi-outlet: shared customers, packages, stock across branches | Phase 3 | P2 – Differentiator | Not assessed | Audit current implementation against DOCX scope. |
| TK2610-0029 | P2-04 AI assistant: owner summary, rebooking nudges, slow-day promos | Phase 3 | P2 – Differentiator | Not assessed | Audit current implementation against DOCX scope. |

## Working and verification rules

- Inspect current code/tests first and preserve existing uncommitted work.
- Keep tenant isolation and shared contracts; never expose secrets.
- Do not hand-edit generated Prisma clients or compiled output.
- Use reviewed SQL migrations for schema changes; no destructive data commands.
- No commit, push, production account removal, reset or reseed without approval.
- Ask about payment integration versus manual recording, messaging provider,
  tax/receipt policy, owner 2FA/recovery and other unclear product decisions.
- Keep full scope: P0-02 includes GST-number e-receipts; P0-04 includes
  package/prepaid credit payment; P0-05 includes hiding Add for disabled modules;
  P1-05 includes visits, balances, notes and photos; P1-07 includes discounts,
  vouchers, refunds/voids, tips, side-by-side cart and barcode scanning;
  P1-08 includes POS PIN without email; P2-01 includes consent, photos,
  treatment records, session tracking and package expiry.
- Run available formatter/lint/typecheck/tests; record exact results and blockers.
  Root npm run verify is unavailable while the root manifest is missing.
- End every session by updating /home/tuangpi/Documents/Aridient/Glampros/glampro_suite/docs/STATE.md
  with changed files, verification, remaining scope, blockers and next action.
