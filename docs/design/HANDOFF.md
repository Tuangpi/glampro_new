# Design handoff — frames, tokens and icons

The vendored Salon Pro redesign package lives in
[`../../design/handoff/`](../../design/handoff/) and is **read-only source material**:
screens, tokens and icons that the rebuild is measured against. This document is the
build-side ruleset for using it — where values come from, what must not be
hand-written, and how the frames and icons are reproduced.

| Reference                                      | What it is                                   |
| ---------------------------------------------- | -------------------------------------------- |
| Handoff package (`design/handoff/`)            | Screens, tokens, icons — the source of truth |
| [`../CONTEXT.md`](../CONTEXT.md)               | Vocabulary the screens must use in the UI    |
| [`../architecture.md`](../architecture.md) §12 | Which phase builds which screen              |
| [`../roadmap.md`](../roadmap.md)               | Phase 1 acceptance criteria for this work    |

---

## 1. What is in the package

| Path                       | Contents                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `design/handoff/README.md` | The designer's own notes: what each screen replaces and which screens were audited      |
| `design/handoff/screens/`  | 11 standalone `.html` files, plus a `.png` of screens 01–04 only                        |
| `design/handoff/tokens/`   | `tokens.css` (custom properties) and `tokens.json` (the same values for a theme config) |
| `design/handoff/icons/`    | 41 standalone SVG icons, 24×24 viewBox, stroke-based, `stroke="currentColor"`           |

Two things about the package matter before copying anything out of it:

- **Screens 01–04 are audit-driven** — they come from the UX audit of the current app
  and its Word report. **Screens 05–11 are proposals**: the README states they extend
  the same visual system to the rest of the app and were _not_ audited against the live
  product. Their field lists, names and permissions are a starting point to check
  against the real data model, not a specification to implement literally. Screen 04 is
  a reference sheet of three fixes, not a page to build.
- **The icon directory holds 41 SVGs while the README says 40.** Treat the directory as
  the list and reconcile the count while porting in Phase 1.

## 2. Frame geometry

Every screen paints a fixed frame, `.app { width: 1280px; height: 900px }`, on the
`--sp-bg` background. Inside it:

| Element            | Size / value                                           | Token               |
| ------------------ | ------------------------------------------------------ | ------------------- |
| App frame          | 1280 × 900                                             | —                   |
| Navy icon rail     | 84px wide, `--sp-navy` fill, icon column centred       | `--sp-rail-w`       |
| White top bar      | 76px tall, 1px `--sp-border` bottom border, 28px sides | `--sp-topbar-h`     |
| Page background    | `--sp-bg`                                              | `--sp-bg`           |
| Minimum tap target | 44px                                                   | `--sp-control-h-md` |

Screens 01–04 are flow/modal screens without the rail; screens 05–11 use the full
frame. This is a desktop product: the frame is fixed and no breakpoint work is
expected beyond letting the frame scroll sensibly in a smaller window.

Typography is Plus Jakarta Sans, loaded from Google Fonts in both the handoff screens
and [`../../apps/web/index.html`](../../apps/web/index.html) (preconnected). The
CSS fallback stack is part of `--sp-font-family`.

## 3. Tokens

Values enter the app in exactly one direction:

```
design/handoff/tokens/tokens.css
  → apps/web/src/styles/tokens.css        (the copy)
  → @theme in apps/web/src/index.css      (Tailwind namespaces)
  → utilities in components              (bg-surface, text-ink-muted, h-control…)
```

- `apps/web/src/styles/tokens.css` is a **copy of the handoff file**. It is listed in
  [`.prettierignore`](../../.prettierignore) so no formatter rewrites it. Change a value
  in the handoff package, then re-copy it — never edit the copy in place, never edit a
  value in `@theme`, and never introduce a hex or px literal in a component.
- `apps/web/src/index.css` maps tokens onto Tailwind namespaces in one `@theme` block,
  so components can write utilities instead of `var()` everywhere.

| Tailwind namespace | Backed by                                                                             |
| ------------------ | ------------------------------------------------------------------------------------- |
| `--color-*`        | surfaces, text, brand and semantic colours — `bg-surface`, `text-navy`, `text-danger` |
| `--font-sans`      | `--sp-font-family`                                                                    |
| `--text-*`         | the type scale, `--sp-text-2xs` … `--sp-text-display`                                 |
| `--radius-*`       | `--sp-radius-sm` … `--sp-radius-2xl`                                                  |
| `--spacing-*`      | `control-sm` / `control` / `control-lg`, plus `rail` and `topbar`                     |
| `--shadow-*`       | button, tile and menu elevation                                                       |

Not every token needs a utility. The weight scale (`--sp-weight-*`), the numeric
spacing scale (`--sp-space-*`) and the navy tint overlays (`--sp-navy-tint-10`,
`-14`) are used through `var(--sp-…)`. Rule of thumb: a value used by more than one
component earns a utility; a value used once may stay a `var()`.

### Open deviation, to settle in Phase 1

The repo copy is _equivalent but not byte-identical_ to the handoff file:

| Difference           | Detail                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Header comment       | Rewritten to describe the copy rule, instead of the handoff's own description                 |
| Formatting           | One declaration per line instead of column-aligned                                            |
| Colour literals      | Lower-cased (`#F3F4FA` → `#f3f4fa`)                                                           |
| Alpha literals       | `.10` → `0.10`                                                                                |
| Two tokens **added** | `--sp-rail-w: 84px` and `--sp-topbar-h: 76px`, which the handoff `tokens.css` does not define |

The added values are correct — 84px rail and 76px top bar are what the screens use — but
the file is no longer the "verbatim copy" that `.prettierignore` and
[`../../AGENTS.md`](../../AGENTS.md) claim. Phase 1 must either re-copy the handoff file
byte-for-byte and move the two app-chrome tokens into a file of their own, or record the
deviation in an ADR. Tracked in [`../STATE.md`](../STATE.md).

## 4. Icons

The handoff ships each icon as a standalone SVG: 24×24 viewBox, stroke-based,
`stroke="currentColor"`, no fills, so colour comes from the text colour and the size
from the font size.

Port rules for Phase 1:

- One React component per icon, in `apps/web/src/components/icons/`, generated from the
  SVG in the handoff directory — **path data verbatim**, no redrawing and no re-export
  from another library.
- `aria-hidden` by default, `focusable={false}`, and a `className` passthrough so the
  Tailwind sizing and colour utilities apply.
- An icon-only control always carries an accessible name on the button
  (`aria-label`), never on the icon. `AppShell`'s sign-out button is the existing
  example to follow.
- Until the port lands, components use Feather icons from `react-icons/fi` as
  stand-ins (see `AppShell.tsx` / `navigation.ts`). Phase 1 replaces those with the
  handoff set; it does not keep both.

## 5. Screens → routes

The nav in [`../../apps/web/src/constants/navigation.ts`](../../apps/web/src/constants/navigation.ts)
has eight entries and is the source of the route names below.

| Screen                    | Route / surface           | Phase | Notes                                                                                                                                                    |
| ------------------------- | ------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 sale browse + cart     | `/sale`                   | 5     | One tab row plus a searchable item grid; cart visible at all times                                                                                       |
| 02 sale confirmation      | step inside `/sale`       | 5     | Confirmation _is_ the receipt: the sale carries its `payments[]`, so the legacy `pay-by-cash` / `pay-by-card` / `split-pay` trio collapses into one call |
| 03 new appointment        | flow over `/appointments` | 6     | Guided Who / What / When / With; duration comes from the service                                                                                         |
| 04 quick-win fixes        | —                         | —     | Reference sheet: live dashboard tile, de-emphasised delete, cart badge                                                                                   |
| 05 dashboard              | `/`                       | 7     | Income tile, today's sales, low-stock and open-cart indicators                                                                                           |
| 06 appointments calendar  | `/appointments`           | 6     |                                                                                                                                                          |
| 07 customers              | `/customers`              | 4     |                                                                                                                                                          |
| 08 products and inventory | `/products`               | 4     |                                                                                                                                                          |
| 09 staff                  | _undecided_               | 4     | No staff entry in the nav yet — its own route or a Settings section is a Phase 4 decision                                                                |
| 10 reports                | `/reports`                | 7     | Admin-only in the nav today                                                                                                                              |
| 11 settings               | `/settings`               | 8     | Admin-only in the nav today                                                                                                                              |

## 6. Checklist before a screen is called done

1. Every colour, radius, shadow and control height comes from a token or a utility —
   no hex, no magic px.
2. The frame matches §2: 1280×900 layout, 84px rail, 76px top bar, from the tokens.
3. Icons come from the ported set, sized and coloured by utilities, decorative by
   default, with names on the controls that need them.
4. Every control is at least 44px tall unless it is a documented small stepper.
5. Field names, permissions and states were checked against the real data model —
   screens 05–11 are proposals, so a mismatch with the API is expected and the screen
   is what changes.
6. `npm run verify` exits 0.
