---
name: Cocoon Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#444651'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#904d00'
  on-secondary: '#ffffff'
  secondary-container: '#fe932c'
  on-secondary-container: '#663500'
  tertiary: '#003120'
  on-tertiary: '#ffffff'
  tertiary-container: '#004a32'
  on-tertiary-container: '#4ac08f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#ffdcc3'
  secondary-fixed-dim: '#ffb77d'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6e3900'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  display-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  mono-metric-lg:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.03em
  mono-metric-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  mono-metric-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  grid-unit: 0.5rem
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  card-padding: 1.5rem
  panel-gutter: 1rem
---

## Brand & Style

This design system is engineered for mission-critical thermal simulation software operating in extreme sub-zero environments, specifically calibrated for defense, infrastructure, and high-altitude deployments in Himalayan regions.

### Design Personality
The visual character is rooted in precision engineering, uncompromising reliability, and institutional clarity. The interface draws inspiration from computational modeling suites (COMSOL Multiphysics, ANSYS Fluent, MATLAB) while preserving the low-cognitive-load ergonomics of modern specialized SaaS. It projects absolute stability and mathematical accuracy.

### Emotional Response
- **Trustworthiness:** Critical decisions rely on absolute metric readability without visual ambiguity.
- **Calm Authority:** Clean, neutral structural components maintain user composure during complex parametric modeling.
- **Extreme Precision:** Every border, line stroke, and metric reading aligns to strict mathematical increments, eliminating decorative distraction.

### Visual Aesthetic
Minimalist technical utilitarianism. It eschews glow effects, gaming skeuomorphism, and superfluous gradients in favor of high-legibility typographic hierarchy, crisp 1px structural framing, neutral canvases, and context-strictly semantic accent hues.

## Colors

The color palette enforces a strict semantic division between physical thermal domains, structural frames, and system metrics. Color is never purely decorative; it communicates physical thermal states, boundaries, and simulation logic.

### Structural Foundations
- **Base Canvas:** `#F7F8FA` — A low-glare, ultra-light neutral ground that minimizes eye strain during extended analytical shifts.
- **Surface Elevation (Cards, Panels, Modals):** `#FFFFFF` — Pure white, providing high contrast against data plots and canvas elements.
- **Structural Borders:** `#E2E8F0` — 1px technical demarcation lines providing rigid modular isolation between analytical docks.
- **Sub-borders & Inactive Dividers:** `#EDF2F7` — Soft secondary separation lines.

### Primary Accent: Sub-Zero / Structural Baseline
- **Primary Navy:** `#1E3A8A` (Hover/Active: `#1E40AF`, Inactive Tint: `#EFF6FF`)
- **Semantic Mapping:** Ambient environmental temperatures, freezing atmospheric boundaries, primary interface interactions, standard tab bars, structural boundary vectors, and external Himalayan meteorological line series.

### Secondary Accent: Thermal Output & Insolation
- **Thermal Amber / Orange:** `#D97706` (Accent Glow/Secondary Line: `#EA580C`, Light Tint: `#FFFBEB`)
- **Semantic Mapping:** Strictly reserved for internal heating dynamics, active thermal generation units, metabolic heat release, solar radiant fluxes, and indoor temperature curves. It must never be applied to generic UI buttons or alerts.

### Tertiary Accent: Human Life-Support & Comfort Envelope
- **Equilibrium Green:** `#059669` (Surface Fill: `#ECFDF5`, Border Accent: `#10B981`)
- **Semantic Mapping:** Designates acceptable human thermal equilibrium zones (18°C–22°C safe habitable envelope in defense shelters), validated computational runs, and non-critical system status.

### Neutrals & Type Scale Colors
- **Text Headings / Metrics:** `#0F172A` (Slate 900)
- **Text Body & Secondary Readings:** `#334155` (Slate 700)
- **Muted Metadata & Units:** `#64748B` (Slate 500)
- **Subtle Legends & Disabled States:** `#94A3B8` (Slate 400)

## Typography

The typographical framework employs a dual-font configuration: **Inter** handles all narrative hierarchy, standard operational controls, and navigational UI, while **JetBrains Mono** is strictly implemented for tabular telemetry, simulation output matrices, engineering units ($W/m^2$, $K$, $\Delta T$, $Pa$), coordinate axes, and numerical inputs.

### Typographic Implementation Rules
- **Mathematical Scannability:** All numerical metric displays must implement tabular lining figures (`font-variant-numeric: tabular-nums`) to prevent horizontal jitter during real-time data streaming.
- **Mono Pairing:** Never set body copy or narrative explanations in JetBrains Mono. Confine mono to input fields, coordinates, terminal outputs, formula parameters, and card telemetry metrics.
- **Label Capitalization:** Structural dock labels, status markers, and chart axis identifiers utilize `label-caps` in uppercase format with wide tracking (`0.04em`) to establish visual separation against dense parameter fields.

## Layout & Spacing

This design system uses a strict **8px base grid** with a sub-unit of 4px for compact analytical controls. The spatial hierarchy mirrors multi-viewport CAD/CAE tools, balancing dense structural telemetry with breathing room for graphical plots.

### Structural Shell & Grids
- **Operational Interface:** Dense three-column workstation layout.
  - **Left Rail (Fixed 280px / 320px):** Layer hierarchy, envelope material attributes, thermal node selector.
  - **Center Viewport (Fluid):** Primary graphical rendering canvas, thermal gradient heatmap, or multi-axis time-series plot.
  - **Right Inspector (Fixed 340px):** Parametric boundary input tables, finite element mesh controls, and continuous simulation logs.
- **Analytical Cards:** Consistent 24px (`1.5rem`) internal padding ensures standard spacing around complex data sets, graphs, and metric lists.
- **Component Padding:** Internal element padding scales in multiples of 4px/8px: buttons adhere to 8px vertical by 16px horizontal; dense data tables adhere to 6px vertical by 12px horizontal.

## Elevation & Depth

Visual depth is achieved through structural line work and micro-diffused ambient shadows rather than intense vertical elevations. The interface reads as an engineered instrument console: sharp, stable, and flat.

### Depth Architecture
1. **Canvas Base (Level 0):** Background `#F7F8FA`. Static, completely non-elevated foundation.
2. **Structural Panels & Data Cards (Level 1):** Solid white `#FFFFFF` surface combined with a 1px solid border (`#E2E8F0`) and an ultra-subtle, low-opacity ambient drop shadow:
   `box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.02);`
3. **Floating Overlays & Model Modals (Level 2):** Context menus, coordinate tooltips, and floating computational progress prompts:
   `box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04);` paired with a crisp 1px border (`#CBD5E1`).

### Prohibitions
- No high-blur spread shadows (>12px).
- No saturated colored drop shadows or neon boundary glows.
- No glassmorphic blurs over data grids; critical metric visibility must remain uncompromised.

## Shapes

The shape system balances structural rigidity with ergonomic micro-curvatures. To convey industrial and mathematical discipline, elements use compact, restrained radius tokens:

- **Input Controls & Small Buttons:** `0.25rem` (4px). Matches the compact 4px baseline sub-unit for tight engineering forms.
- **Cards, Simulation Viewports & Master Panels (`rounded-lg`):** `0.5rem` (8px). Softens boundaries without reducing spatial efficiency.
- **Modals & Dialogues (`rounded-xl`):** `0.75rem` (12px).
- **Pill Badges (Exclusive to Status Indicators):** Fully rounded (`9999px`) to immediately distinguish system health states from rectangular technical inputs.

## Components

### Buttons
- **Primary Operational:** Deep Navy Blue (`#1E3A8A`), text white, 4px corner radius, font Inter semi-bold (14px). Hover: `#1E40AF`. Active: `#172554`. Focus: 2px offset ring `#93C5FD`.
- **Secondary / Calibration:** White background, 1px border `#E2E8F0`, text `#334155`. Hover: background `#F8FAFC`, border `#CBD5E1`.
- **Danger / Abort Run:** Destructive actions only. Background white, 1px border `#FCA5A5`, text `#DC2626`. Hover: `#FEF2F2`.

### Cards & Data Panels
- Background pure white (`#FFFFFF`), border 1px solid `#E2E8F0`, border-radius 8px (`rounded-lg`), padding 24px (`space-card-padding`).
- **Header Section:** Bottom divider 1px solid `#F1F5F9`, 16px bottom margin, displaying `headline-sm` title with monospace telemetry tags right-aligned.

### Input Fields & Parameter Steppers
- Height: 36px (compact). Background: `#FFFFFF`. Border: 1px solid `#CBD5E1`. Radius: 4px.
- Typography: JetBrains Mono (13px), `#0F172A`.
- Unit Affix: Background `#F1F5F9`, border-left 1px solid `#CBD5E1`, text `#64748B`, font JetBrains Mono (11px).
- States: Focus border `#1E3A8A` with a 1px inset boundary.

### Checkboxes & Radio Selection
- Checkbox: 16x16px square, 3px border-radius, border 1px solid `#94A3B8`. Checked: `#1E3A8A` with white checkmark icon.
- Radio: 16x16px circle. Selected: white inner core (6px) surrounded by `#1E3A8A`.

### Status Indicators & Habitability Chips
- **Comfort Band Status Badge:** Background `#ECFDF5`, border 1px solid `#A7F3D0`, text `#065F46`, font JetBrains Mono (11px, weight 500), border-radius 9999px. Includes a 6px solid `#059669` status dot.
- **Active Solar/Thermal Flux Badge:** Background `#FFFBEB`, border 1px solid `#FDE68A`, text `#92400E`.

### Data Grids & Inspection Tables
- Header Row: Background `#F8FAFC`, text `#64748B`, font Inter (11px, uppercase, tracked).
- Cell Padding: 8px vertical, 12px horizontal.
- Numerical Cells: Aligned right, JetBrains Mono (12px), text `#1E293B`.
- Row Division: Border-bottom 1px solid `#F1F5F9`. Hover state: `#F8FAFC`.

### Specialized Domain Component: Thermal Comfort Band (Graph Layer)
- Background fill for habitable zones (18°C–22°C): `#ECFDF5` at 50% opacity.
- Delimiting threshold lines: 1px dashed `#059669`.
- Ambient Himalayan exterior curve: 2px solid `#1E3A8A`.
- Internal active heating curve: 2px solid `#D97706`.