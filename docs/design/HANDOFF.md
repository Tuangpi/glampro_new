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
- **The icon directory holds 41 SVGs while the README says 40** (at its lines 41 and 112).
  Settled: the directory is the list. Its 41 SVGs are all distinct — there is no duplicate
  file to name — and all 41 are ported to `../../apps/web/src/components/icons/` one-for-one,
  so nothing is missing. The README's "40" is an undercount in prose. `design/handoff/` is
  vendored reference material kept exactly as delivered, so that README is **not** edited and
  this line is the reconciliation of record.

## 2. Frame geometry

Every screen paints a fixed frame on the `--sp-bg` background. The frames are
**not** all 1280 × 900, and the container class differs between the two groups:

| Screen(s) | Container | Frame      | Rail                               |
| --------- | --------- | ---------- | ---------------------------------- |
| 01        | `.root`   | 1280 × 832 | no                                 |
| 02        | `.root`   | 900 × 832  | no                                 |
| 03        | `.root`   | 1280 × 900 | no                                 |
| 04        | `.root`   | 1280 × 620 | no — reference sheet, not a screen |
| 05–11     | `.app`    | 1280 × 900 | yes                                |

Inside the full frame:

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

### The rail, measured

Screens 05–11 share one shell block ("identical markup/CSS across every main-nav
screen" per the file's own comment). Phase 1's screen pass rendered that shell and
read the computed values back out of the browser rather than eyeballing the markup,
which caught four things the app had wrong:

| Element                | Handoff (measured)                                      | App now                                   |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------- |
| `.nav-item`            | `54 × 50`, `border-radius:14px`                         | `70 × 50`, `14px` — see the width note    |
| `.nav-item` icon→label | `gap:4px`                                               | `4px`                                     |
| `.side-nav` item→item  | `gap:6px`                                               | `6px`                                     |
| `.nav-item .lbl`       | `8.5px`, `700`, `letter-spacing:.01em`                  | `8.5px`, `700`, `.01em`                   |
| `.nav-item.active`     | `background:#6144E4` + `0 4px 10px rgba(97,68,228,.35)` | `--sp-purple` + `--sp-shadow-purple-btn`  |
| Rail icon              | 19 × 19, `stroke-width:1.8`                             | `19px` from `--app-rail-icon`             |
| `.side-logo`           | `40 × 40`, `border-radius:12px`, `margin-bottom:22px`   | `40 × 40`, `12px`, `--sp-space-10` (22px) |
| `.sidebar` padding     | `20px 0 16px`                                           | `20px 0 16px`                             |

What was wrong, and is now fixed: the two gaps were applied the wrong way round (4px
between items, 6px inside them); the active item was painted as a
`--sp-navy-tint-14` wash instead of the handoff's solid purple, which made the
current page nearly invisible on the rail; the label was 10px, which made
"Appointments" measure 74.3px and clip against its own item; and the logo's 24px
margin and the rail's symmetric 20px padding were both off the handoff's values.

**The one deliberate deviation is item width.** The handoff's 54px is sized for its
own longest label — "Customers", which measures 46.4px at 8.5px, leaving ~3.8px of
side padding. This app's longest rail label is "Appointments", 61.7px at the same
size, so a 54px item would clip it; the item is therefore 70px, which keeps the
handoff's padding proportion. The label size is _not_ widened to compensate: 8.5px
is what the designer drew, and the app now renders "Customers" at 46.4px — the same
value the handoff produces — so the label metrics match exactly. The derivation is
written into `--app-rail-item-w` in
[`../../apps/web/src/styles/app-chrome.css`](../../apps/web/src/styles/app-chrome.css).

Two rail differences are **not** geometry and are left to their own phases: the
handoff's open-cart badge (16 × 16, `--sp-red` fill, 2px navy ring) is not drawn
because the counter is live data, and the handoff's `.side-foot` groups Settings
with Log out at the bottom where this app keeps one flat nav — the app's nav is
role-filtered, so a signed-out user sees fewer entries than the handoff draws.

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

### Resolved in Phase 1: the copy is byte-identical

`apps/web/src/styles/tokens.css` is now a byte-for-byte copy of
`design/handoff/tokens/tokens.css` (verified with `cmp`). The previous deviation — a
rewritten header, re-formatted declarations, lower-cased colours, `0.10` instead of
`.10` — is gone, and the copy rule in [`../../AGENTS.md`](../../AGENTS.md) now holds
literally.

The two values the handoff token file does not define, `--sp-rail-w: 84px` and
`--sp-topbar-h: 76px` (the frame geometry in §2), moved to
`apps/web/src/styles/app-chrome.css`, which `index.css` imports next to the token copy.
That file also carries the handful of app-only values the handoff has no token for —
rail item width and icon size, top-bar search width, toast width, loading placeholder
height — each with a comment saying where the value came from. They are `--app-*` so they
cannot be mistaken for handoff tokens. `index.css` keeps the `--spacing-rail` /
`--spacing-topbar` mappings, so `w-rail`, `pl-rail` and `h-topbar` work as before.

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
- The icon-only control carries its accessible name on the button (`aria-label`), never on
  the icon. `AppShell`'s sign-out button is the example to follow.

**Landed in Phase 1.** All **41** SVGs are ported to `apps/web/src/components/icons/` as
one component each, re-exported from that directory's `index.ts`. The count is settled:
the directory holds 41 files and all 41 are ported, so the README's "40" is the number
that is wrong. Geometry is verbatim, and each component sets `width`/`height` to `1em` so
the existing `text-*` utilities still size them.

The stand-ins are gone — `react-icons` is no longer a dependency. Four Feather symbols had
no handoff equivalent and were mapped to the nearest handoff icon, worth knowing when a
screen review compares them:

| Stand-in                             | Used now      | Why                                                         |
| ------------------------------------ | ------------- | ----------------------------------------------------------- |
| `FiInfo` (toast info)                | `Bell`        | No info/question icon ships; a bell is the neutral notice   |
| `FiLoader` (spinning, `PageLoading`) | `Settings`    | No spinner ships; a gear reads as "working" while it spins  |
| `FiRefreshCw` (re-check status)      | `Eye`         | No refresh/rotate icon ships; the eye reads as "look again" |
| `FiArrowLeft` (404 back link)        | `ChevronLeft` | No arrow-left ships; the chevron points the same way        |

One gap in the set is worth knowing: it ships `chevron-down` and `chevron-left` but **no
right-pointing chevron**. Forward steps — pagination's Next, a drawer opened from the left —
use `ArrowRight` rather than mirroring `ChevronLeft` with a CSS flip, so the icon drawn is always
one the designer actually delivered. If a later screen needs a right chevron as a distinct shape,
add it to the handoff icons first and re-copy.

## 5. Screens → routes

The nav in [`../../apps/web/src/constants/navigation.ts`](../../apps/web/src/constants/navigation.ts)
has eight entries and is the source of the route names below. There is no Services entry:
the handoff rail draws seven destinations plus Settings in its foot, and services are reached
from the Products tab row and from the sale and appointment flows
([ADR 0005](../decisions/0005-rail-has-no-services-destination.md)).

| Screen                    | Route / surface           | Phase | Notes                                                                                                                                                                     |
| ------------------------- | ------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 sale browse + cart     | `/sale`                   | 5     | One tab row plus a searchable item grid; cart visible at all times                                                                                                        |
| 02 sale confirmation      | step inside `/sale`       | 5     | Confirmation _is_ the receipt: the sale carries its `payments[]`, so the legacy `pay-by-cash` / `pay-by-card` / `split-pay` trio collapses into one call                  |
| 03 new appointment        | flow over `/appointments` | 6     | Guided Who / What / When / With; duration comes from the service                                                                                                          |
| 04 quick-win fixes        | —                         | —     | Reference sheet: live dashboard tile, de-emphasised delete, cart badge                                                                                                    |
| 05 dashboard              | `/`                       | 7     | Income tile, today's sales, low-stock and open-cart indicators                                                                                                            |
| 06 appointments calendar  | `/appointments`           | 6     |                                                                                                                                                                           |
| 07 customers              | `/customers`              | 4     |                                                                                                                                                                           |
| 08 products and inventory | `/products`               | 4     |                                                                                                                                                                           |
| 09 staff                  | `/staff`                  | 4     | Rail entry added in Phase 1 — screens 05–11 all draw Staff beside Customers/Products (see §4). It follows the other not-yet-built routes until Phase 4 builds the screen. |
| 10 reports                | `/reports`                | 7     | Admin-only in the nav today                                                                                                                                               |
| 11 settings               | `/settings`               | 8     | Admin-only in the nav today                                                                                                                                               |

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
