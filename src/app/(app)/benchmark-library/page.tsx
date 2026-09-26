import type { Metadata } from "next";
import EmptyState from "@/components/layout/EmptyState";
import InDevelopmentNotice from "@/components/layout/InDevelopmentNotice";
import PageHeader from "@/components/layout/PageHeader";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";

export const metadata: Metadata = { title: "Benchmark Library" };

// Reference figures quoted on the Mission Control dashboard (Reference Baseline Delta card).
const BASELINE = [
  { label: "Fuel demand", value: "48.2", unit: "L/day kerosene", tone: "text-critical" },
  { label: "Envelope", value: "50", unit: "mm glass-wool", tone: "text-ink" },
  { label: "ΔT (ext vs int)", value: "+24.0", unit: "K", tone: "text-critical" },
  { label: "SHGC", value: "0.22", unit: "(110 W/m²)", tone: "text-ink" },
];

export default function BenchmarkLibraryPage() {
  return (
    <div className="w-full px-gutter-lg py-space-xl">
      <div className="max-w-[1720px] mx-auto flex flex-col gap-space-xl">
        <PageHeader
          eyebrow={
            <>
              <Badge tone="plum">REFERENCE BASELINES</Badge>
              <span className="font-label-mono-sm text-[10px] uppercase text-ink-muted">ASHRAE 55 · MIL-STD-810H</span>
            </>
          }
          title="Benchmark Library"
          description="Validated legacy shelters and field-measured references that every generative candidate is scored against."
          actions={
            <Button variant="secondary" icon="upload_file" disabled>
              Import Reference
            </Button>
          }
        />

        <InDevelopmentNotice module="MOD-BML" eta="SIH 2026 · PHASE 2">
          <T>The reference library is in development. The 1984 Quonset baseline below is the only catalogued reference; importing field telemetry and additional legacy shelters is coming soon.</T>
        </InDevelopmentNotice>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter-lg">
          <Card
            className="lg:col-span-2"
            title="BASE-QUONSET-1984-REF · Arctic Quonset Bunkhouse"
            actions={
              <>
                <Badge tone="navy">Validated by ANSYS</Badge>
                <Badge>Archived (Ref)</Badge>
              </>
            }
          >
            <p className="font-body-md text-body-md text-ink-body mb-space-lg">
              <T>Single-skin corrugated galvanized iron arch with 50mm glass-wool insulation, deployed at the DBO Main Logistics Depot.
              Serves as the legacy comparison for the dashboard&rsquo;s fuel-demand delta.</T>
            </p>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
              {BASELINE.map((m) => (
                <div key={m.label} className="flex flex-col gap-0.5 p-space-sm rounded-xl bg-surface-container-low">
                  <dt className="font-body-sm text-body-sm text-ink-muted">
                    <T>{m.label}</T>
                  </dt>
                  <dd className="flex items-baseline gap-1">
                    <span className={`font-data text-[14px] font-medium ${m.tone}`}>{m.value}</span>
                    <span className="font-data text-[11px] text-ink-muted">{m.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Best Candidate vs Baseline" actions={<Badge tone="equilibrium">-68.4%</Badge>}>
            <div className="flex flex-col gap-space-md">
              <div>
                <div className="flex justify-between font-label-mono-sm text-[11px] mb-1">
                  <span className="text-ink-muted"><T>Legacy 1984 Quonset</T></span>
                  <span className="text-critical font-data">48.2 L/day</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
                  <div className="h-full bg-critical w-full" />
                </div>
              </div>
              <div>
                <div className="flex justify-between font-label-mono-sm text-[11px] mb-1">
                  <span className="text-ink-muted"><T>COCOON GEN-4 V3</T></span>
                  <span className="text-equilibrium font-data">15.2 L/day</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
                  <div className="h-full bg-equilibrium" style={{ width: "31.6%" }} />
                </div>
              </div>
              <Button href={ROUTES.candidateDetail("C-8042-4")} variant="secondary" size="sm" icon="compare_arrows">
                <T>Open candidate dossier</T>
              </Button>
            </div>
          </Card>
        </div>

        <EmptyState icon="library_books" title="More references on the way">
          <T>Field telemetry from Siachen and Galwan posts and additional legacy shelter types will be catalogued here.</T>
        </EmptyState>
      </div>
    </div>
  );
}
