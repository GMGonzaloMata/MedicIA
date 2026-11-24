---
name: MedicIA Clinical Admin
colors:
  surface: '#051424'
  surface-dim: '#051424'
  surface-bright: '#2c3a4c'
  surface-container-lowest: '#010f1f'
  surface-container-low: '#0d1c2d'
  surface-container: '#122131'
  surface-container-high: '#1c2b3c'
  surface-container-highest: '#273647'
  on-surface: '#d4e4fa'
  on-surface-variant: '#bcc9c6'
  inverse-surface: '#d4e4fa'
  inverse-on-surface: '#233143'
  outline: '#879391'
  outline-variant: '#3d4947'
  surface-tint: '#6bd8cb'
  primary: '#6bd8cb'
  on-primary: '#003732'
  primary-container: '#29a195'
  on-primary-container: '#00302b'
  inverse-primary: '#006a61'
  secondary: '#adc6ff'
  on-secondary: '#002e6a'
  secondary-container: '#0566d9'
  on-secondary-container: '#e6ecff'
  tertiary: '#3cddc7'
  on-tertiary: '#003731'
  tertiary-container: '#00a392'
  on-tertiary-container: '#00302a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#62fae3'
  tertiary-fixed-dim: '#3cddc7'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#005047'
  background: '#051424'
  on-background: '#d4e4fa'
  surface-variant: '#273647'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
  metric-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
  metric-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style
The brand voice combines high-precision clinical rigor with the calm, modern clarity seen in platforms like Apple Health, Stripe, and Linear. Tailored for the Argentine healthcare ecosystem—serving clinic directors, medical coordinators, triage leads, and administrative auditors—the experience prioritizes legibility, cognitive composure under high operational pressure, and uncompromised precision.

The aesthetic philosophy centers on **Precision Modernism**:
- Deep, calm dark canvases paired with pristine light states.
- Razor-sharp, low-contrast structural boundaries (1px subtle ghost borders) rather than heavy drop shadows.
- Utilitarian density that eliminates decorative noise, harsh saturated neon glows, and steep gradients in favor of refined, subdued surface hierarchies.
- Clear semantic communication: clinical indicators and triage states balance color with unambiguous, localized Argentine Spanish text labels (`En espera`, `En curso`, `Completado`, `Crítico`, `Derivado`).

## Colors
The system is built on a dual-palette architecture default-tuned to a low-fatigue dark environment, while retaining an enterprise-grade light mode.

### Palette Architecture
- **Primary Teal:** `#0D9488` in light contexts, dynamically switching to `#2DD4BF` in dark contexts for luminance balance and WCAG AA conformance. Used for primary actions, active clinical flows, and system confirms.
- **Accent Blue:** `#3B82F6` serves as operational navigation, secondary highlights, diagnostic filters, and interactive metadata tags.
- **Dark Spectrum:**
  - Base Canvas: `#0B0F15`
  - Sidebars & Structural Panels: `#111722`
  - Cards & Content Surfaces: `#18202F`
  - Elevated Popovers & Dialogs: `#1E293B`
  - Subtle Border: `1px solid #1E293B`
  - Primary Text: `#F1F5F9`
  - Muted / Secondary Text: `#94A3B8`
- **Light Spectrum:**
  - Canvas: `#F8FAFC`
  - Panels & Cards: `#FFFFFF`
  - Elevated Popovers: `#FFFFFF` (anchored with soft ring)
  - Subtle Border: `1px solid #E2E8F0`
  - Primary Text: `#0F172A`
  - Secondary Text: `#475569`
- **Clinical Status System:**
  - Standard Green: `#10B981` (dark: `#34D399`) — `Estable` / `Completado`
  - Warning Amber: `#F59E0B` (dark: `#FBBF24`) — `Atención` / `Triaje moderado`
  - Critical Red: `#EF4444` (dark: `#F87171`) — `Urgencia` / `Alerta crítica`
  - All status tokens must always pair with explicit text labels to prevent information loss for color-blind practitioners.

## Typography
The system bifurcates typographic responsibilities:
1. **Plus Jakarta Sans** delivers humanist clarity and warmth across clinical reports, patient narratives, section headings, and diagnostic summaries.
2. **Inter** provides tabular, monoline structure for operational data points, vital metrics (DNI, matrícula, saturación de O₂, frecuencia cardíaca, dosis), status badges, column headers, and dense data tables.

All metric displays (`metric-lg`, `metric-md`) leverage Inter's tabular figures (`font-variant-numeric: tabular-nums`) to prevent shifting alignment during live telemetric streaming.

## Layout & Spacing
The layout employs an adaptive fluid grid optimized for data-dense dashboards, electronic health records (HCE), and split-screen medical charts.

- **Breakpoints:**
  - Mobile (`< 768px`): 4 columns, `margin: 1rem`, `gutter: 1rem`. Bottom navigation replaces sidebars; tables collapse into modular medical cards.
  - Tablet (`768px - 1199px`): 8 columns, `margin: 1.5rem`, `gutter: 1rem`. Sidebar transitions to an icon rail or collapsible overlay.
  - Desktop (`>= 1200px`): 12 columns, `margin: 2rem`, `gutter: 1.5rem`. Fixed left navigation (240px or 64px rail) paired with multi-pane master-detail workspaces.
- **Rhythm & Touch Standards:**
  - Minimum touch and click target bounding box is strictly `44px` across all devices.
  - Compact data grids use `space-xs` and `space-sm` for dense cell contents, while page scaffolds utilize `space-xl` and `space-2xl` to ensure cognitive decompression.

## Elevation & Depth
In alignment with the Linear/Stripe design paradigm, depth is established via surface color tiering and precision ghost borders, avoiding heavy blurred drop shadows:

- **Level 0 (Canvas):** Dark `#0B0F15` / Light `#F8FAFC`. Base backdrop.
- **Level 1 (Panels & Shell):** Dark `#111722` / Light `#FFFFFF`. Outlined by `1px solid #1E293B` (dark) or `1px solid #E2E8F0` (light).
- **Level 2 (Cards & Data Units):** Dark `#18202F` / Light `#FFFFFF`. Outlined with standard border. No shadow in dark; light receives an ambient tint of `0 1px 3px rgba(15, 23, 42, 0.05)`.
- **Level 3 (Modals, Slide-overs & Flyouts):** Dark `#1E293B` / Light `#FFFFFF`. Elevated above lower tiers with `0 12px 32px rgba(0, 0, 0, 0.35)` (dark) and `0 12px 32px rgba(15, 23, 42, 0.08)` (light), retaining the crisp 1px perimeter border.
- **Focus Indication:** Active controls receive a dual-ring focus state: `box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px #3B82F6` ensuring universal accessibility against all adjacent surface shades.

## Shapes
The geometric language adheres to a disciplined hierarchical progression:
- **Interactive Controls (4px / `rounded-sm`):** Buttons, text fields, selects, segmented controllers, checkboxes, and table row selections rely on a tight 4px radius for an engineered, clinical feel.
- **Cards & Data Modules (8px / `rounded-md`):** Patient encounter cards, diagnostic metric tiles, triage alerts, and charts employ an 8px radius.
- **Panels & Overlays (12px / `rounded-lg`):** Slide-out clinical charts, flyout triage inspectors, modal dialogues, and root navigation frames feature a 12px radius.
- **Status Tags & Badges (Pill / `9999px`):** Reserved exclusively for clinical triage badges, status indicators, and micro avatar pills.

## Components

### Buttons
- **Primary:** Background `#0D9488` (Dark: `#2DD4BF`, text: `#0B0F15`), radius 4px, height 44px (minimum clickable area), font `Inter` label-lg. Hover: 90% luminance.
- **Secondary / Outlined:** Transparent surface with 1px border (`#1E293B` dark / `#E2E8F0` light), text `#F1F5F9` (dark) or `#0F172A` (light). Active/Hover: Surface tint dark `#18202F` / light `#F1F5F9`.
- **Destructive:** Background `#EF4444`, text `#FFFFFF`, radius 4px.

### Clinical Chips & Status Badges
- Pill-shaped (`9999px`), padding `2px 10px`, typography `Inter` label-sm uppercase.
- Always include an explicit dot or status icon alongside text:
  - *Estable:* Muted green fill (10% alpha), green border, green label text.
  - *En Triaje:* Muted amber fill (10% alpha), amber border, amber label text.
  - *Urgencia:* Muted red fill (15% alpha), red border, red label text.

### Form Inputs & Selects
- Height 44px, radius 4px.
- Dark: Surface `#111722`, border `1px solid #1E293B`, placeholder `#94A3B8`.
- Light: Surface `#FFFFFF`, border `1px solid #E2E8F0`, placeholder `#94A3B8`.
- Focus: Highlighted with Accent Blue `#3B82F6` border + 2px offset ring. Clear validation messaging rendered in `Inter` body-sm directly underneath the field.

### Checkboxes & Radios
- Size 20x20px housed inside a 44x44px centered touch target box. Radius 4px for checkboxes, full circle for radios.
- Checked state fills with `#0D9488` (Dark: `#2DD4BF`) with high-contrast icon.

### Cards & Clinical Dossiers
- Background `#18202F` (dark) / `#FFFFFF` (light), radius 8px, padding `1rem` to `1.5rem`.
- 1px boundary line. Card headers separate metadata using standard `Inter` labels and headline levels in `Plus Jakarta Sans`.

### Data Tables (Historia Clínica & Turnos)
- Sticky table headers using `#111722` (dark) / `#F8FAFC` (light), font `Inter` label-md with uppercase tracking.
- Row heights set to 52px for high touch precision; zebra-free layout leveraging subtle `1px solid #1E293B` dividers.
- Vital metrics and national IDs (DNI) render in tabular monospace Inter.

### Medical Telemetry Tile (Custom Component)
- Compact tile showing patient vitals with real-time waveform or numerical data. Radius 8px, background `#18202F` (dark), housing `metric-lg` value with clear unit label (`bpm`, `mmHg`, `SpO₂`) in `label-sm`.