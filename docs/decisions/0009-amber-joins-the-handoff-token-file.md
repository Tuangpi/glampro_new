# 0009 — The amber badge tone joins the handoff token file

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Engineering (product confirmed the source-file route)
- **Related:** [`AGENTS.md`](../../AGENTS.md) rule 2,
  [`roadmap.md`](../roadmap.md) Phase 4,
  [`STATE.md`](../STATE.md) §4.1 (closes **Q23**),
  [`design/HANDOFF.md`](../design/HANDOFF.md) §4,
  [ADR 0006](0006-snap-handoff-values-to-tokens.md),
  [ADR 0008](0008-login-screen-shape.md)

## Context

The handoff's screens need a fifth badge tone that the token file never exposed.
`.status.progress` (screen 05, the dashboard's in-progress appointment status) and
`.tier.gold` (screen 07, the customers' Gold tier) are both:

```css
background: #fff4de;
color: #b9740a;
```

`--sp-amber-grad-a` / `--sp-amber-grad-b` exist, but they are the **dashboard income
tile's gradient stops**, not a surface and a text colour. So the pair had no token
to snap to, and [ADR 0006](0006-snap-handoff-values-to-tokens.md) sends a value
further than 1px from every token to a question rather than to an invented
approximation.

That became **Q23**, and it stopped being cosmetic: `Badge` shipped with only
`neutral · success · danger · purple`, so **screen 07 could not be built as drawn**
and neither could the dashboard's status tile. Phase 4 opens on the customers
screen, so the question blocked the phase rather than trailing it.

[ADR 0008](0008-login-screen-shape.md) had already felt the cost. It needed a third
notice tone for a suspended salon and deliberately used purple instead of amber,
recording that the choice "does not answer" Q23 and is reversible when it lands.

## Decision

**`--sp-amber-bg` and `--sp-amber-text` are added to
`design/handoff/tokens/tokens.css`, carrying the values the handoff's own CSS
already uses, and the copy in `apps/web/src/styles/tokens.css` is re-taken.**
`Badge` gains a `warning` variant built from them.

- The source of truth is the handoff file, per `AGENTS.md` rule 2 — the change is
  made **to the source and re-copied**, never made to the copy in place.
- The values are `#FFF4DE` and `#B9740A`, which are the designer's, not a
  nearest-token approximation of them.
- The copy stays byte-identical; `cmp design/handoff/tokens/tokens.css
apps/web/src/styles/tokens.css` still exits 0.
- `--sp-amber-grad-a/b` are untouched. A gradient stop and a surface/text pair are
  different jobs and now have separate names.
- `warning` is exposed as `--color-warning` (`text-warning`) and
  `--color-warning-soft` (`bg-warning-soft`), matching how `success` /
  `success-soft` / `success-text` are already mapped.

This is the option that leaves no deviation to record: the screen renders the
handoff's own colours.

## Why not the alternatives

| Alternative                                             | Why it was rejected                                                                                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accept the nearest existing tones, record the deviation | Shipped screen 07 in colours the designer did not draw, and pre-committed the same substitution for the dashboard tile in Phase 7 — two deviations for one gap |
| Map Gold onto `purple` for now, leave Q23 open          | Fastest to the screen, but it makes the handoff's Gold read as the brand's "New" tier. Two tiers in one column become indistinguishable                        |
| Invent amber as `--app-*` in `styles/app-chrome.css`    | A second token namespace for values the real palette now owns, and the opposite of the "copy, don't invent" rule                                               |
| Drop the tier/status column from the screen             | Removes a feature the handoff is explicit about, to dodge a colour question                                                                                    |
| Derive the tones from the gradient stops                | `#FFC94D`/`#FFB020` are saturated stops chosen to sit under white text on a large tile; as a badge surface at body size they fail contrast                     |

## Consequences

- **Positive.** Q23 closes. Screens 05 and 07 can be built as drawn, and `Badge`
  has the tone both of them specify.
- **Positive.** Phase 4's customers screen is no longer blocked on a design
  question.
- **Positive.** The read-only banner in [ADR 0008](0008-login-screen-shape.md) can
  move from purple to amber when that is wanted; the token now exists. It has
  **not** been changed here — purple remains a recorded choice, not an oversight.
- **Negative / accepted.** The handoff token file is now one pair larger than
  delivered. ADR 0006 listed "edit the designer's file" as the rejected option, and
  this reverses that for one specific, designer-originated gap. The difference from
  what ADR 0006 rejected is that these values are **theirs**, transcribed from
  their own CSS — not invented on their behalf — but the file is no longer
  untouched, and a future reader is entitled to object.
- **Negative / accepted.** Nothing enforces that `--sp-amber-*` stays equal to the
  hexes in `design/handoff/screens/*.html`. They agree today because both were read
  from the same CSS.

## Enforcement

- `apps/web/src/components/ui/__tests__/Badge.test.tsx` pins the `warning` variant
  to `bg-warning-soft text-warning`, pins the dot to `bg-warning`, and asserts the
  five tones resolve to five distinct class sets — so a dropped token fails the
  suite instead of silently inheriting the body colour.
- `cmp design/handoff/tokens/tokens.css apps/web/src/styles/tokens.css` keeps the
  copy rule honest.
- `Badge.tsx`'s header comment names Q23 and the source file, so the variant's
  origin is visible from the component rather than only from this ADR.
