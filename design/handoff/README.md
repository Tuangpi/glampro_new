# Salon Pro Redesign — Developer & Designer Handoff

This package contains everything needed to build the recommended Salon
Pro (glamproplus.com) redesign into the live system: implementation-ready
HTML/CSS for the full set of app screens, the extracted design tokens
(colors, type, spacing, radii), and the icon set as standalone SVGs.

It accompanies two other deliverables already shared:
- **Salon Pro - UX Walkthrough and Recommendations.docx** — the full
  audit, click-count analysis and prioritized recommendation list for
  the original 4-screen redesign (Sale, Confirmation, New Appointment,
  Quick-win fixes).
- **Salon Pro Redesign** (Claude Design canvas, published link) — the
  original four screens on an editable, pan/zoom canvas for designers
  to tweak visually.

**Screens 01–04** are the original audit-driven redesign, unchanged.
**Screens 05–11** extend that same visual system to the rest of the
app so the whole product has a consistent, implementation-ready spec
— these are new pages proposed to complete the redesign (standard
salon-POS structure: Dashboard, Calendar, Customers, Products,
Staff, Reports, Settings), not screens pulled from an audit of the
current app, since only the four original screens were audited.
Check each against your actual current app before building, and
adjust names/fields/permissions to match your real data model.

This package is the **build-from** version: plain, dependency-free
HTML/CSS a developer can open directly, view-source, and port into
whatever the current stack is (React, Vue, plain templates, etc). It
is static markup with sample data, not the live application — treat
it as a visual/structural spec, not a drop-in replacement.

## What's inside

```
screens/    11 standalone .html files (open directly in any browser) +
            a .png of each original-4 screen for quick reference /
            pasting into tickets
tokens/     tokens.css (CSS custom properties) and tokens.json (same
            values, for a JS/Tailwind/SCSS theme config)
icons/      40 standalone .svg icons used across the screens —
            stroke-based, 24x24 viewBox, stroke="currentColor" so they
            inherit text color and recolor with CSS
```

## Screens

### Original 4 (audit-driven — see the Word doc for full rationale)

| File | Replaces (current Salon Pro flow) | Key change |
|---|---|---|
| `01-sale-browse-cart.html` | Sale screen's 3 dropdowns + 5 separate "+Product/+Package/+Value Package/+Service/+Gift Card" buttons, each opening a full-screen picker modal | One tab row + an always-visible, searchable item grid; customer search added at the top; live cart with inline qty steppers and per-line employee assignment |
| `02-sale-confirmation.html` | The separate "Proceed to Payment" screen + separate receipt/print screen | Tapping a payment button on screen 01 leads straight here — one confirmation step instead of two screens |
| `03-new-appointment.html` | The "+ New Appointment" modal, which asked for 7 required fields (Customer Type, Customer Name, Employee, Service, Date, Time, Duration hour + minutes) all at once | A guided 4-section flow (Who / What / When / With): picking a service auto-fills duration; only staff who perform that service are shown; a live summary ticket shows what's been picked so far |
| `04-quick-win-fixes.html` | Three specific current-app issues found during the audit (see the Word report, Section 4–5) | Reference sheet, not a full screen: a "live" Dashboard tile indicator, a de-emphasized/confirmed Delete on Today Sale rows, and an open-cart badge on the Sale nav icon |

### New — rest of the app, same design system

| File | Page | What's on it |
|---|---|---|
| `05-dashboard.html` | Home / Dashboard | Income + appointment KPI tiles (with the "live" indicator from screen 04), today's appointment list, today's sales feed, top-selling items |
| `06-appointments-calendar.html` | Appointments | Day-view scheduler, one column per staff member, colour-coded by status, current-time indicator, view/date switcher, "+ New appointment" opens screen 03 |
| `07-customers.html` | Customers | Searchable customer list with tier badges, side profile panel with contact info, lifetime stats, and tabbed visit history / packages / notes |
| `08-products-inventory.html` | Products & Inventory | Catalogue table (same Product/Service/Package/Gift Card tabs as screen 01) with price, member price, cost, live stock level and status toggle; low-stock/out-of-stock summary tiles |
| `09-staff.html` | Staff | Staff card grid — shift status dot, today's shift time, bookings/revenue/rating stats, skill tags |
| `10-reports.html` | Reports | Revenue/transaction/ticket/repeat-rate KPIs, weekly revenue bar chart, payment-method donut, top services and top staff leaderboards |
| `11-settings.html` | Settings | Settings category nav (General, Business hours, Tax & receipt, Notifications, Users & permissions, Integrations) with the General panel and Business hours built out as the pattern to follow for the rest |

Screens 05–11 introduce a persistent **left sidebar** (Home, Sale,
Calendar, Customers, Products, Staff, Reports, Settings, Log out) —
the same navy sidebar previewed in screen 04's "open-cart badge"
mock — since these are top-level destinations a user switches
between, unlike 01–03 which are focused, full-screen flows entered
from that nav.

Full rationale, the click-count math, and the priority/effort table
for the original 4 screens are in the companion Word document.

## Using the screens

Each `screens/*.html` file is fully self-contained: inline CSS, Google
Font link (Plus Jakarta Sans), inline SVG icons. Open it in a browser
to see it full-size, or view-source to lift markup and styles
directly. They're built at these frame sizes (typical POS tablet /
desktop widths — check against your actual target device before
building):

- `01-sale-browse-cart.html` — 1280 × 832
- `02-sale-confirmation.html` — 900 × 832
- `03-new-appointment.html` — 1280 × 900
- `04-quick-win-fixes.html` — 1280 × 620 (reference sheet, not a real screen)
- `05-dashboard.html` through `11-settings.html` — 1280 × 900 (full app shell, sidebar included)

They are **not** responsive/mobile-optimized and **not** wired up —
buttons, tabs and inputs are visual states only, no JavaScript. All
names, phone numbers, prices, schedules, and catalogue items are
illustrative sample data, not real records.

## Using the tokens

`tokens/tokens.css` defines everything as CSS custom properties
(`--sp-*`) — colors, type scale, radii, spacing, shadows, and minimum
control heights (44px, meeting standard touch-target guidance).
`tokens/tokens.json` mirrors the same values in JSON for a
Tailwind `theme.extend`, a styled-components theme, or any other
config-driven system. Pull from these rather than re-reading hex
values out of the screen files, so a future color change only happens
in one place.

## Using the icons

All 40 icons in `icons/` are plain, dependency-free SVG files —
stroke-based (no fills), 24×24 viewBox, `stroke="currentColor"` so
each one inherits whatever CSS `color` is set on its container or an
inline `style="color: ..."`. Drop them into an existing icon
component/sprite system, or reference them directly with `<img
src="icons/search.svg">` (note: `currentColor` inheritance only works
inlined as `<svg>`, not via `<img src>` — inline the ones that need to
change color with context).

## Typography

Plus Jakarta Sans, loaded from Google Fonts in each screen file:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
```

Fallback stack: `system-ui, -apple-system, 'Segoe UI', sans-serif`.
Self-host the font file if the production environment can't reach
Google Fonts.

## Known gaps to fill in during implementation

These mockups intentionally leave out things that only make sense
once wired to real data and a real framework:

- Loading, empty, and error states for the item grid, cart,
  appointment picker, customer list, product table, and calendar
- Real validation (e.g. disabling "Create appointment" until every
  required field is set)
- Keyboard navigation and screen-reader labelling (the icons have no
  `aria-label`s yet — add them per icon's function once wired up)
- Responsive behavior below the tablet widths used here
- The actual customer-search and item-search logic (shown here as a
  static placeholder state)
- `06-appointments-calendar.html` positions appointment blocks with
  hand-computed `top`/`height` pixel offsets (9:00–19:00, 1.2px per
  minute) rather than real event data — replace with a proper
  scheduler component or computed positioning once wired to bookings
- `08-products-inventory.html` shows only the Products tab populated;
  Services/Packages/Gift cards tabs need their own column sets (e.g.
  services need duration, not stock)
- `11-settings.html` only builds out the General and Business Hours
  panels as the pattern to follow — Tax & Receipt, Notifications,
  Users & Permissions and Integrations are nav entries only
- Screens 05–11 are new pages proposed to extend the redesign's
  design system across the whole app; unlike 01–04 they weren't
  built from an audit of the current Salon Pro app, so confirm field
  names, staff roles, and permissions against the real system before
  building
