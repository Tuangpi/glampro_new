# 0005 — The rail has no Services destination

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Product (scope) · Engineering (labels, sequencing)
- **Related:** [`design/HANDOFF.md`](../design/HANDOFF.md) §4, §5,
  [`roadmap.md`](../roadmap.md) Phase 4, [`CONTEXT.md`](../CONTEXT.md) §5,
  [`STATE.md`](../STATE.md) §4.2 Q21,
  [`design/handoff/README.md`](../../design/handoff/README.md)

## Context

`apps/web/src/constants/navigation.ts` shipped a `Services` entry (`/services`, the
`Scissors` icon) as part of Phase 0's scaffold, before any handoff screen had been read.
Nothing has ever contradicted it inside the code, so it survived into the rail.

Three independent sources say services is not a top-level destination:

1. **The rail itself.** Screens 05–11 render one shared sidebar block whose destinations
   are Home, Sale, Calendar, Customers, Products, Staff and Reports, with Settings and Log
   out held in `.side-foot`. There is no Services entry in any of them.
2. **Screen 08.** Services appears as a **tab** beside Products, Packages and Gift cards on
   the products-and-inventory screen, and `design/handoff/README.md` explains the tabs
   exist because they "need their own column sets (e.g. services need duration, not
   stock)".
3. **The roadmap.** Phase 4 already states: "There is no separate services screen; services
   are managed from the same list pattern (and appear in the sale flow and the appointment
   flow)."

Where the count came from: the designer's summary says screens 05–11 introduce "a
persistent **left sidebar** (Home, Sale, Calendar, Customers, Products, Staff, Reports,
Settings, Log out)" — **nine sidebar items**, of which only seven are destinations in
`.side-nav`, the other two sitting in `.side-foot`. Reading that sentence as "nine nav
entries" is how the scaffold's extra entry survived review: the numbers agreed, so nobody
compared the lists.

Services is nonetheless a real domain, not a discarded one: `CONTEXT.md` §5 lists
`services` as a core module ("Service catalogue and pricing"), and it is reached from the
sale flow (screen 01) and the appointment flow (screen 03). "Not a rail destination" is not
"not a feature".

The divergence was invisible until Phase 1 rendered the screens. Within `docs/`,
[`design/HANDOFF.md`](../design/HANDOFF.md) §5 had absorbed the scaffold's bug: it claimed
the nav "has nine entries", which matched `navigation.ts` rather than the handoff.

## Decision

1. `navigation.ts` carries **eight** entries: Dashboard, Sale, Appointments, Customers,
   Products, Staff, Reports\*, Settings\* (\* admin roles only).
2. Services has **no rail entry and no `/services` route of its own**.
3. Services is reached from the Products surface's tab row and as a step inside the sale
   and appointment flows.
4. Labels stay as the app has them (`Dashboard`, `Appointments`) rather than the
   proposal's informal `Home` and `Calendar`. `CONTEXT.md` §5 makes module labels UI copy
   that "may change freely", and the app's labels match the module codes.
5. The `.side-foot` placement of Settings and Log out, and the label differences in rule 4,
   are **not settled by this ADR** — they are recorded as open questions in
   [`STATE.md`](../STATE.md) §4.2.

## Why not the alternatives

| Alternative                                                      | Why it was rejected                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep `Services` in the rail                                      | Inventing a ninth destination the design never drew and the roadmap never planned, to serve a surface Phase 4 already delivers as a Products tab — and it makes "Products" and "Services" read as separate catalogues |
| Keep the entry but point it at `/products`                       | A rail entry whose label does not match the screen it opens. The active-state logic in `navigation.ts` highlights by longest path prefix, so the two entries would fight over one route                               |
| Give Services its own `/services` screen                         | Duplicates the product list pattern for a second entity — the exact cost the roadmap's Phase 4 wording exists to avoid                                                                                                |
| Delete the Services domain entirely                              | It is a core module ([`CONTEXT.md`](../CONTEXT.md) §5, "Service catalogue and pricing") and is sold in the sale and appointment flows. Removing its rail entry is not removing the feature                            |
| Adopt the proposal's `Home`/`Calendar` labels while here         | Out of scope for this change and recorded as an open question; renaming routes to match informal screen copy is a separate decision with its own blast radius                                                         |
| Fix `navigation.ts` but leave `design/HANDOFF.md` §5 saying nine | Leaves the document that generated the bug describing the bug's own state, so the next reader re-derives the wrong answer. ADR rule: the ADR wins, the document is fixed in the same commit                           |

## Consequences

- **Positive.** The rail matches the handoff exactly: eight entries, seven of them visible
  to every signed-in user. Nav and roadmap stop contradicting each other.
  `design/HANDOFF.md` §5's "nine" becomes eight.
- **Negative / accepted.** Services becomes reachable only from inside other surfaces, so it
  needs a real tab row on the Products screen and a place in the sale and appointment flows
  before it feels discoverable. Those surfaces are Phase 4 and Phase 5/6 work. The `Scissors`
  icon stays in `components/icons` but is no longer used by the rail.
- **Neutral.** No route was ever registered for `/services` (the entry in `navigation.ts`
  was ahead of `routes.tsx`), so removing the entry changes no route and cannot 404
  anything.
- **Neutral.** The `.side-foot` placement and the `Home`/`Calendar` label differences are
  explicitly left open in [`STATE.md`](../STATE.md) §4.2, so this ADR must not be read as a
  statement that the rail is now identical to the proposal in every respect.

## Enforcement

- A regression test in `apps/web/src/constants/navigation.test.ts` asserts that no
  `navItems` entry has the label `"Services"` or a path beginning `/services`, so re-adding
  it by hand fails the suite.
- [`design/HANDOFF.md`](../design/HANDOFF.md) §5's entry count is corrected in the same
  commit that changes the nav, which is the rule this ADR's own context broke.
- The Phase 4 screen is not enforced by anything yet: no test can assert that a screen built
  in a later phase keeps the Services tab. Phase 4's acceptance criteria are where that is
  checked.
