import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/layout/EmptyState";
import InDevelopmentNotice from "@/components/layout/InDevelopmentNotice";
import PageHeader from "@/components/layout/PageHeader";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { CANDIDATES } from "@/lib/mock-data";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";

export const metadata: Metadata = { title: "Reports & History" };

const ARTIFACTS = [
  { kind: "Spec Pack", format: "PDF", icon: "picture_as_pdf" },
  { kind: "3D Geometry", format: "STEP / IFC", icon: "deployed_code" },
];

export default function ReportsPage() {
  return (
    <div className="w-full px-gutter-lg py-space-xl">
      <div className="max-w-[1720px] mx-auto flex flex-col gap-space-xl">
        <PageHeader
          eyebrow={
            <>
              <Badge tone="navy">AUDIT TRAIL</Badge>
              <span className="font-label-mono-sm text-[10px] uppercase text-ink-muted">RUN #EXP-LDK-8042</span>
            </>
          }
          title="Reports & History"
          description="Exported mission packs, CAD deliverables and the procurement audit trail for every shortlisted candidate."
          actions={
            <Button href={ROUTES.candidateTelemetry} variant="secondary" icon="monitoring">
              View Solver Run
            </Button>
          }
        />

        <InDevelopmentNotice module="MOD-RPT" eta="SIH 2026 · PHASE 2">
          <T>Report generation and audit history are in development. Deliverable shortcuts below open each candidate dossier, where exports will be produced.</T>
        </InDevelopmentNotice>

        <Card title="Candidate Deliverables" actions={<Badge tone="teal">{CANDIDATES.length} Candidates</Badge>} flush>
          <ul className="divide-y divide-surface-container">
            {CANDIDATES.map((c) => (
              <li key={c.id} className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm px-5 py-4">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-space-sm">
                    <Link href={ROUTES.candidateDetail(c.id)} className="font-data text-[12px] font-medium text-navy hover:underline">
                      #{c.id}
                    </Link>
                    <Badge tone="equilibrium"><T>{c.rank}</T></Badge>
                  </div>
                  <span className="font-body-sm text-body-sm text-ink-muted">
                    <T>{c.archetype}</T> · <T>{c.envelope}</T>
                  </span>
                </div>
                <div className="flex items-center gap-space-xs">
                  {ARTIFACTS.map((a) => (
                    <Button key={a.kind} href={ROUTES.candidateDetail(c.id)} variant="secondary" size="sm" icon={a.icon}>
                      <T>{a.kind}</T> ({a.format})
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <EmptyState icon="history" title="No exported reports yet">
          <T>Spec packs and procurement pushes generated from a candidate dossier will be logged here with their SHA-256 digest.</T>
        </EmptyState>
      </div>
    </div>
  );
}
