# COCOON Frontend

Area-Specific Thermal Shelter Design & Multi-Physics Simulation Platform for Extreme Cold Environments (DRDO Problem Statement 26051).

---

## 🛠️ Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with custom military design tokens
- **Typography & Icons**: Google Fonts (Inter, JetBrains Mono, Space Grotesk) & Material Symbols

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build for Production
```bash
npm run build
npm start
```

---

## 📁 Directory Structure
```text
frontend/
├── public/                 # Static assets, site imagery, icons
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── (app)/
│   │   │   ├── dashboard/                  # Platform Overview & Stats
│   │   │   ├── projects/                   # Shelter Project Workspaces
│   │   │   ├── shelter-configurator/       # 5-Step Input Wizard
│   │   │   │   ├── step-1/                 # Location & Boundary Conditions
│   │   │   │   ├── step-2/                 # Geometry, Dimensions & Materials
│   │   │   │   ├── step-3/                 # Glazing, Troops & Loads
│   │   │   │   ├── step-4/                 # Auxiliary Heating & Objectives
│   │   │   │   └── step-5/                 # Review & Solver Launch
│   │   │   └── candidate-telemetry/        # DRDO Results & 3D Cutaway
│   │   │       └── [id]/                   # Interactive Candidate 3D Twin
│   │   ├── globals.css     # Global styles & design system tokens
│   │   └── layout.tsx      # Root layout
│   ├── components/         # Reusable UI components & form fields
│   │   ├── configurator/   # Stepper, wizard providers, form inputs
│   │   ├── layout/         # AppHeader, PageHeader, EmptyState
│   │   └── ui/             # Badge, Button, Card components
│   └── lib/                # Routes, i18n translation, mock data, contracts
│       ├── routes.ts       # Single source of truth for all routes
│       ├── mock-data.ts    # DRDO simulation datasets & telemetry
│       ├── i18n.ts         # Multi-language translation engine
│       └── configurator/   # Requirements validation schemas
├── tailwind.config.ts      # Custom theme colors, typography & spacing
├── tsconfig.json           # TypeScript configuration
└── next.config.ts          # Next.js configuration
```
