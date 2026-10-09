# 0008 — The sign-in screen is composed from the delivered system

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** Engineering (with product sign-off to proceed without a new design)
- **Related:** [`AGENTS.md`](../../AGENTS.md) rule 2,
  [`roadmap.md`](../roadmap.md) Phase 3,
  [`STATE.md`](../STATE.md) §3 (closes **Q24**),
  [`design/HANDOFF.md`](../design/HANDOFF.md) §4,
  [ADR 0006](0006-snap-handoff-values-to-tokens.md)

## Context

`roadmap.md`'s Phase 3 acceptance criterion is that _unauthenticated visitors
land on the login screen_. `design/handoff/` ships eleven screens — the sale,
the confirmation, the appointment flow, the quick-win sheet, the dashboard, the
calendar, customers, products, staff, reports and settings — and **none of them
is a sign-in screen**.

This is the one screen in the rebuild with no drawing behind it. The standing
rule is that the handoff is the source of truth and that nothing is invented
inside a component, so something has to be decided rather than improvised in a
commit.

Two facts decided it.

**The handoff anticipated the surface anyway.** `design/handoff/icons/` ships
`lock.svg`, `mail.svg`, `user.svg` and `log-out.svg`, and all four are already
ported and exported from `apps/web/src/components/icons/`. `Lock` is the mark on
the sign-in screen; `LogOut` is the rail's sign-out control, which Phase 1 had
already drawn as an inert button. The design system contains the vocabulary for
authentication; only the arrangement was never drawn.

**Every value the screen needs already exists.** `Input`, `Button` and `Card` are
built, tested and reconciled against the rendered handoff. Colours, radii,
spacing and control heights are tokens. A sign-in form is a card with two inputs
and a button, and all three of those are Phase 1 deliverables.

## Decision

**The sign-in screen is a composition of the delivered primitives and the
delivered icon set, laid out on tokens. The layout is a deliberate invention and
is recorded here as one, exactly as ADR 0006 records the handoff's internal
contradictions.**

- A single centred `Card` on the app background (`--sp-bg`), no rail and no top
  bar, because the rail's affordances are all unreachable before signing in.
- The brand mark is the ported `Lock` glyph in the handoff's purple gradient,
  matching the rail's existing logo tile so the two read as one product.
- Both controls are `Input` (which already wires label, hint, `aria-invalid` and
  `aria-describedby`) and one full-width `Button`.
- **No new token values, no hand-written hex or px.** `cmp` between
  `design/handoff/tokens/tokens.css` and `apps/web/src/styles/tokens.css` keeps
  passing.

### The read-only tone is purple, not amber

A suspended salon is told it can sign in but not change anything
([`saas/TENANCY.md`](../saas/TENANCY.md) §6). That needed a third notice tone
besides error and neutral, and amber — the obvious choice — **had no token** at the
time: `.status.progress` and `.tier.gold` use `#FFF4DE` on `#B9740A`, which was Q23
and was unresolved when this screen was written.

So the read-only notice uses `--sp-purple-bg` / `--sp-purple`, the brand surface.
This was a deliberate choice over three alternatives:

| Alternative                           | Why not                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| Introduce an amber surface/text token | Adds a colour to the handoff token file for one screen, pre-empting Q23's decision |
| Reuse the danger tone for suspended   | A suspended salon is not a failure, and it would train staff to ignore red         |
| Reuse the neutral surface             | Then read-only looks like ordinary information and nobody notices it               |

Purple is on-system, distinguishable from both neutral and red, and reversible
when Q23 lands.

**Update (2026-10-04):** Q23 has since been answered by
[ADR 0009](0009-amber-joins-the-handoff-token-file.md), which added
`--sp-amber-bg` / `--sp-amber-text` to the handoff token file. The banner is
**still purple** — nothing required changing it — but the reason it was purple was
the missing token, and that reason no longer holds. Switching it is a one-line
change if the amber tone is wanted.

**Update (2026-10-08): the screen is now a split layout, and the mark changed.**
The decision above stands — the screen is still a composition, still an
invention, still tokens only — but two things about it were revisited when the
page was modernised.

**The layout is two columns from `lg` up.** A navy brand panel sits `aria-hidden`
beside the form, which keeps the heading, the one-line summary, the notice tones
and the "Trouble signing in?" line it already had. Below `lg` the panel is hidden
and the form draws the mark itself, so a tablet loses the decoration and none of
the meaning. The panel is `aria-hidden` because it is decoration: the page keeps
exactly one `h1`, and the panel is built from `--sp-navy`, the handoff's own
`--sp-text-on-dark-muted` / `--sp-text-on-dark-accent` pair, and
`--sp-navy-tint-14` for its icon chips.

- The panel's width is `--app-auth-panel-w` in
  `apps/web/src/styles/app-chrome.css` — the file that exists for frame geometry
  the handoff omits, and which already carries `--app-search-w` and
  `--app-rail-item-w`. Nothing was added to `tokens.css`, so `cmp` between
  `design/handoff/tokens/tokens.css` and
  `apps/web/src/styles/tokens.css` still exits 0. That is the rule that mattered
  in the decision above, and it is why the width lives there.
- The form sits in `rounded-card border border-line bg-surface p-6` — the recipe
  the dashboard's and settings' sections already use — rather than in `Card`.
  `Card`'s body padding is sized for a table (`px-3 pt-1.5 pb-3`) and would
  crowd the first control of a form. `Card` itself is unchanged, so no other
  screen's spacing moved.

**The mark is the shared "G" tile, not the ported `Lock` glyph.** The gradient
tile that `AppShell`'s rail and `favicon.svg` draw _is_ the product's mark, so
reusing that exact one is stronger evidence of "one product" than reusing a
different icon from the same set. `Lock` is untouched and still exported — the
41-icon port stays one-for-one, per [`design/HANDOFF.md`](../design/HANDOFF.md)
§4 — it is simply no longer this page's subject: a purple "G" reads as this
product, a padlock reads as any sign-in form.

**Password reveal was added without touching a shared primitive.** The password
control is now `Field` + `CONTROL_CLASS` — precisely what `Input` itself renders —
so a 44px `IconButton` holding the ported `Eye` docks inside the control. The
alternative, teaching `Input` about trailing buttons, would have changed a
primitive every other screen composes in order to serve one screen.

The layout is still not pixel-matched to anything, and this update does not
change that: it is a second deliberate invention, in the same file, recorded the
same way.

## Why not the alternatives

| Alternative                                        | Why it was rejected                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do not build the screen until a design arrives     | Blocks Phase 3 outright, and Phases 4–9 all sit behind an authenticated shell — the whole product waits on one missing drawing                                            |
| Copy the legacy Laravel login page                 | A different product on a different framework; `design/HANDOFF.md` is the visual source of truth, and the legacy app is reference material, never a donor, per `AGENTS.md` |
| Hand-roll a bespoke form instead of the primitives | Duplicates label, error and focus behaviour Phase 1 already tested, and would drift from every other screen                                                               |
| Add a token for anything the composition lacks     | Nothing was missing except the amber tone, which was avoided rather than invented                                                                                         |

## Consequences

- **Positive.** Phase 3 closes and the login page exists, built from tested parts rather than from scratch.
- **Positive.** A real design can replace this page without touching the auth layer: the context, the guard and the refresh queue are independent of how the form looks.
- **Negative / accepted.** The screen is not pixel-matched to anything, so it carries no visual-fidelity claim. It is a composition, not a reproduction.
- **Negative / accepted.** At the time, Q23 blocked the dashboard's in-progress badge and the customers' tier column. Using purple here did not answer it. **Q23 is now closed** by [ADR 0009](0009-amber-joins-the-handoff-token-file.md); the banner remains purple by choice.
- **Maintenance.** If a sign-in design arrives, `pages/Login.tsx` is the only file it replaces.

## Enforcement

- `pages/__tests__/Login.test.tsx` pins the behaviour the layout exists to serve: returning to `?next=`, and refusing an off-origin `?next=` so the screen cannot be used as an open redirect.
- That suite also pins the error-code branching, so `TENANT_SUSPENDED` cannot quietly become an error and `TENANT_EXPIRED` cannot quietly become a suggestion to retry.
- It also pins the 2026-10-08 redraw: the reveal flips the password control's `type` while keeping its value and its label, and the submit reports `aria-busy` and `disabled` while the credentials are in flight. A redesign that drops either fails the gate.
- `navigation.test.ts` asserts every `NavItem.module` is a real `ModuleCode`, so the entitlement field cannot be a typo that `requireModule` would later reject.
