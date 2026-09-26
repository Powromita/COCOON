import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/layout/EmptyState";
import InDevelopmentNotice from "@/components/layout/InDevelopmentNotice";
import PageHeader from "@/components/layout/PageHeader";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { RECENT_RUNS } from "@/lib/mock-data";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";

export const metadata: Metadata = { title: "Projects" };

// Until the projects API exists, each deployment site with a live candidate is treated as a project.
const PROJECTS = RECENT_RUNS.filter((r) => r.candidateId).map((r) => ({
  site: r.site,
  lead: r.archetype,
  runId: r.id,
  candidateId: r.candidateId!,
  status: r.status,
}));

export default function ProjectsPage() {
  return (
    <div className="w-full px-gutter-lg py-space-xl">
      <div className="max-w-[1720px] mx-auto flex flex-col gap-space-xl">
        <PageHeader
          eyebrow={
            <>
              <Badge tone="teal">EASTERN LADAKH</Badge>
              <span className="font-label-mono-sm text-[10px] uppercase text-ink-muted">{PROJECTS.length} ACTIVE DEPLOYMENT SITES</span>
            </>
          }
          title="Projects"
          description="Shelter programmes grouped by forward deployment site. Each project tracks its configurator drafts, solver runs and shortlisted candidates."
          actions={
            <Button href={ROUTES.shelterConfigurator.step1} icon="add_box">
              New Shelter Project
            </Button>
          }
        />

        <InDevelopmentNotice module="MOD-PRJ" eta="SIH 2026 · PHASE 2">
          <T>Project workspaces — per-site drafts, team access and solver quotas — are in development. The deployment-site list below is read-only and links into live solver runs.</T>
        </InDevelopmentNotice>

        <Card title="Deployment Sites" actions={<Badge tone="navy">{PROJECTS.length} Projects</Badge>} flush>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-container bg-surface-container-low font-label-mono-sm text-[10px] uppercase tracking-wider text-ink-muted">
                  <th className="px-5 py-3 font-medium"><T>Site</T></th>
                  <th className="px-5 py-3 font-medium"><T>Lead Archetype</T></th>
                  <th className="px-5 py-3 font-medium"><T>Latest Run</T></th>
                  <th className="px-5 py-3 font-medium"><T>Status</T></th>
                  <th className="px-5 py-3 font-medium text-right"><T>Actions</T></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {PROJECTS.map((p) => (
                  <tr key={p.runId} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-1 font-sans text-[13px] font-medium text-ink">
                        <span className="material-symbols-outlined text-[14px] text-teal">location_on</span>
                        {p.site}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-label-mono-sm text-[12px] text-ink-body">{p.lead}</td>
                    <td className="px-5 py-3.5">
                      <Link href={ROUTES.candidateDetail(p.candidateId)} className="font-data text-[12px] font-medium text-navy hover:underline">
                        {p.runId}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      {p.status.kind === "solving" ? (
                        <Badge tone="thermal" dot>
                          <T>Solving · Iter</T> {p.status.iter}
                        </Badge>
                      ) : (
                        <Badge tone="equilibrium" dot>
                          <T>Converged</T>
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Button href={ROUTES.candidateDetail(p.candidateId)} variant="secondary" size="sm">
                        <T>Open</T>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <EmptyState icon="folder_open" title="Project workspaces are coming next">
          <T>Per-project drafts, team access and solver quotas will live here once the projects service is connected.</T>
        </EmptyState>
      </div>
    </div>
  );
}
