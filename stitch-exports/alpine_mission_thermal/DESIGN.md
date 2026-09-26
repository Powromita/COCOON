---
name: Alpine Mission Thermal
colors:
  surface: '#f8f9ff'
  surface-dim: '#ccdbf4'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dde9ff'
  surface-container-highest: '#d5e3fd'
  on-surface: '#0d1c2f'
  on-surface-variant: '#444651'
  inverse-surface: '#233144'
  inverse-on-surface: '#ebf1ff'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#006878'
  on-secondary: '#ffffff'
  secondary-container: '#94eafe'
  on-secondary-container: '#006b7b'
  tertiary: '#442100'
  on-tertiary: '#ffffff'
  tertiary-container: '#653400'
  on-tertiary-container: '#fc922b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#a7eeff'
  secondary-fixed-dim: '#7dd3e7'
  on-secondary-fixed: '#001f25'
  on-secondary-fixed-variant: '#004e5b'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f8f9ff'
  on-background: '#0d1c2f'
  surface-variant: '#d5e3fd'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.005em
  label-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  label-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.005em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0em
  label-mono-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 12px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.75rem
  gutter-lg: 1.5rem
  margin: 1.5rem
  margin-sm: 1rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system serves high-stakes thermal engineering, structural simulation, and mission-readiness planning under extreme Himalayan operational constraints (sub-zero environments down to -40°C, 3,000m to 6,000m AMSL). The interface embodies calm institutional authority, uncompromising mathematical fidelity, and functional legibility.

Synthesizing the analytical rigor of multi-physics simulation suites (COMSOL, ANSYS) with the polished ergonomic clarity of Stripe and Linear, the aesthetic is rooted in high-density data presentation, crystalline layout boundaries, and total absence of gratuitous decoration. Every visual artifact maps to a verifiable physical condition or system state. 

Visual characteristics include:
- Razor-sharp 1px hairpins establishing clear modular containers.
- Strict data-to-ink ratio with high-contrast neutral backgrounds ensuring visibility in glare-heavy, cold-weather tactical tablets or high-resolution command monitors.
- Distinct split-typography architecture: pure rational humanist sans for contextual framing, coupled with monospaced tabular figures for all mission telemetry, coordinates, and physical units.

## Colors

The palette operates under a strict categorical mandate: color must never be used purely for decoration. Every hue conveys a designated thermodynamic or operational domain.

### Surface and Structural Palette
- **Canvas Base (`#F7F8FA`):** Low-glare foundational viewport providing optical contrast against white structural cards.
- **Card / Surface (`#FFFFFF`):** Work surfaces, parameter panels, and simulation viewport headers.
- **Structural Borders (`#E2E8F0`):** Outer card peripheries, major panel splitters, and persistent divider lines.
- **Sub-Borders (`#EDF2F7`):** Table row separators, internal micro-dividers, and nested grid markers.

### Text Hierarchy
- **Display & Headings (`#0F172A`):** Deep charcoal slate for critical titles, view designations, and high-impact structural readouts.
- **Body & Labels (`#334155`):** High-legibility neutral for parameter descriptions, control labels, and system narrative.
- **Muted Telemetry (`#64748B`):** Secondary metadata, inactive states, unit suffixes (`W/m²`, `AMSL`), and axis indices.
- **Disabled State (`#94A3B8`):** Locked parameter fields and unavailable simulation actions.

### Dedicated Semantic Spectrum
- **Primary Navy (`#1E3A8A` | Hover: `#1E40AF` | Active: `#172554`):** Primary action execution, global navigation active anchors, focus rings, ambient exterior boundary conditions, and cold-side structural envelopes.
- **Thermal Amber (`#D97706` | Tint: `#FFFBEB`):** Thermal load accretion, metabolic human heat gain, solar irradiation, active thermal generation runs, and solver computing states.
- **Equilibrium Green (`#059669` | Tint: `#ECFDF5`):** Converged solutions, validated design parameters, and the core human survival/comfort equilibrium band (18°C–22°C).
- **Slate Teal (`#0F7A8C` | Tint: `#ECFBFC`):** Atmospheric barometric pressure, high-altitude wind vectors, geodetic coordinates, and permafrost ground boundaries.
- **Muted Plum (`#6B4C9A` | Tint: `#F3EEFA`):** Logistics payloads, airframe lift capacity, CAPEX/OPEX metrics, and life-cycle supply allocations.
- **Critical Red (`#BA1A1A` | Tint: `#FEF2F2`):** Structural shear boundaries, acute hypothermia/freezing risks, non-convergent solver run terminations, and destructive actions.

## Typography

The type system prioritizes high-density data parsing and zero-ambiguity character differentiation.

### Dual Engine Application
1. **Primary Humanist Sans (`Inter`):** Applied to structural headers, context narratives, form labels, control labels, navigation anchors, and status tooltips. Inter delivers high legibility at micro scales while retaining neutral authority.
2. **Precision Monospaced (`JetBrains Mono`):** Non-negotiable for all scientific values, solver parameters, physical units (`W/m²`, `K`, `ΔT`, `Pa`, `m AMSL`), geodetic data, and tabular output matrices. Must be configured with OpenType tabular figures (`tnum`) and slashed zeros (`zero`) to prevent horizontal jitter during real-time telemetry streaming.

### Usage Standards
- Headings never exceed `30px` to maintain high screen density on tactical engineering displays.
- All metric outputs combine a `label-mono` numeric string paired immediately with a `label-mono` muted unit signifier.
- Capitalization: Sentence case across system controls and titles; strict uppercase for physical acronyms and status flags (`AMSL`, `CFD`, `U-VALUE`, `HEATING ON`).

## Layout & Spacing

The layout is built upon an 8px base rhythm with 4px sub-intervals for dense input controls. The composition follows a dense 12-column grid within primary dashboard workspaces, supplemented by collapsible dual-dock sidebars (parameter tree on the left, telemetry inspector on the right).

### Layout Rules
- **Desktop (≥ 1440px):** 12-column workspace, fixed left parameter panel (320px), central CAD/CFD viewport (fluid), right-hand analytical telemetry dock (360px). Gutter: `1.5rem` (`24px`), Canvas Margin: `1.5rem` (`24px`).
- **Laptop / Compact Workstation (1024px – 1439px):** 12-column workspace, parameter tree collapses into drawer or iconified dock, analytical telemetry dock collapses to 300px. Gutter: `1rem` (`16px`), Canvas Margin: `1rem` (`16px`).
- **Tactical Field Slate / Tablet (< 1024px):** Single-column stacked workflow. Viewport maintains fixed 16:9 or 4:3 canvas ratios with slide-over control trays. Gutter: `0.75rem` (`12px`), Canvas Margin: `1rem` (`16px`).

Panels and internal cards minimize extraneous padding to preserve data density: default container padding uses `space-lg` (`16px`), with compact data table cells utilizing `space-xs` (`4px`) vertical by `space-sm` (`8px`) horizontal intervals.

## Elevation & Depth

Visual hierarchy is maintained through high-contrast structural lineation and crisp, shallow offsets rather than soft ambient blur. Deep drop shadows are discarded to keep the interface clinical and accurate.

### Depth Mechanics
- **Base Canvas (`#F7F8FA`):** Ground level. No shadow, 0px elevation.
- **Card & Data Panels (`#FFFFFF`):** Framed by a 1px solid border in `#E2E8F0` and elevated via a micro-offset: `box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04)`.
- **Active / Focused Containers:** Border shifts to `#1E3A8A` or `#64748B`, with shadow elevated strictly to `box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06)`.
- **Flyouts, Menus, & Solver Modals:** Crisp float layer featuring a 1px border in `#CBD5E1` and an engineering shadow: `box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)`.
- **Viewport Overlays (HUD elements over CFD visualizer):** Translucent backing `#FFFFFF` at 92% opacity with `backdrop-filter: blur(8px)` and a 1px `#E2E8F0` boundary, creating an analytical overlay without occluding mesh topology.

## Shapes

The design system enforces a precise, disciplined shape language that reinforces an engineering toolset. Sharp edges convey structural stability, while targeted corner radiuses eliminate visual friction.

### Radius Assignments
- **Containers, Modules, & Surface Cards:** Exact `8px` (`0.5rem`) corner radius.
- **Input Controls, Buttons, Selectors, and Badges:** Exact `4px` (`0.25rem`) corner radius.
- **Micro Tags, Status Indicators, and Unit Pills:** Exact `4px` (`0.25rem`) corner radius.
- **Context Menus & Modals:** Exact `6px` (`0.375rem`) corner radius.

Circular (`50%` / pill-shaped) radiuses are strictly limited to tiny status dots (e.g., green convergence beacon) and avatar nodes. Fully rounded pill buttons are prohibited.

## Components

### Buttons & Trigger Elements
- **Standard Height:** `36px` across default interactive elements (`28px` for compact table-row action bars).
- **Primary Button:** Background `#1E3A8A`, foreground `#FFFFFF`, border `1px solid transparent`, radius `4px`.
  - *Hover:* Background `#1E40AF`.
  - *Active:* Background `#172554`.
  - *Focus:* Box-shadow `0 0 0 2px #FFFFFF, 0 0 0 4px #1E3A8A`.
- **Secondary Button:** Background `#FFFFFF`, foreground `#0F172A`, border `1px solid #E2E8F0`, radius `4px`.
  - *Hover:* Background `#F8FAFC`, border `#CBD5E1`.
  - *Active:* Background `#F1F5F9`.
- **Destructive Button:** Background `#BA1A1A`, foreground `#FFFFFF`, radius `4px`.
  - *Hover:* Background `#991B1B`.

### Input Fields & Select Controls
- **Height & Form:** `36px` height, `4px` radius, background `#FFFFFF`, border `1px solid #E2E8F0`, typography `label-mono-md`.
- **Inner Padding:** `0 10px`.
- **Affixes & Units:** Fixed right-side micro-labels (`label-mono-sm`, `#64748B`) inside the input container for units (`W/m²`, `K`, `Pa`).
- **Focus State:** Border `#1E3A8A`, outline `none`, shadow `0 0 0 1px #1E3A8A`.

### Status Badges & Chips
- **Geometry:** Height `22px`, radius `4px`, padding `0 6px`. Text rendered in `label-mono-xs` font weight 500, uppercase.
- **Equilibrium Badge:** Background `#ECFDF5`, text `#059669`, border `1px solid rgba(5, 150, 105, 0.2)`.
- **Thermal Amber Badge:** Background `#FFFBEB`, text `#D97706`, border `1px solid rgba(217, 119, 6, 0.2)`.
- **Teal Telemetry Badge:** Background `#ECFBFC`, text `#0F7A8C`, border `1px solid rgba(15, 122, 140, 0.2)`.
- **Plum Cost/Logistics Badge:** Background `#F3EEFA`, text `#6B4C9A`, border `1px solid rgba(107, 76, 154, 0.2)`.
- **Hazard Badge:** Background `#FEF2F2`, text `#BA1A1A`, border `1px solid rgba(186, 26, 26, 0.2)`.

### Checkboxes & Segmented Controls
- **Checkboxes:** `16px × 16px`, `3px` radius, border `1.5px solid #64748B`. Checked state: background `#1E3A8A`, checkmark icon in `#FFFFFF`.
- **Segmented View Mode Switcher:** Container height `32px`, padding `2px`, background `#F1F5F9`, border `1px solid #E2E8F0`, radius `4px`. Active segment: background `#FFFFFF`, text `#0F172A`, shadow `0 1px 2px rgba(15,23,42,0.08)`.

### Data Cards & Telemetry Blocks
- **Card Shell:** Background `#FFFFFF`, border `1px solid #E2E8F0`, radius `8px`, shadow `0 1px 3px rgba(15, 23, 42, 0.04)`.
- **Header:** Height `40px`, border-bottom `1px solid #EDF2F7`, horizontal padding `12px`, featuring an `Inter` 13px weight 600 title paired with right-aligned `label-mono` status tags.
- **Metric Metric Display Block:** Stacked micro-layout: Top label in `body-sm` muted (`#64748B`), value in `label-mono-lg` (`#0F172A`), delta indicator below in `Equilibrium Green` or `Critical Red`.

### Domain-Specific Components
- **Thermal Mesh Gradient Legend:** Compact horizontal ribbon (`12px` height, `2px` radius) transitioning across multi-point color stops (`#1E3A8A` extreme cold -> `#0F7A8C` ambient -> `#059669` comfort 20°C -> `#D97706` high dissipation -> `#BA1A1A` thermal breakdown) with mono-spaced tick indicators positioned below.
- **Convergence Solver Progress Bar:** Height `6px`, background `#EDF2F7`, radius `3px`. Continuous fill in `#D97706` switching to `#059669` upon converged solution status.