"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { listProjects, type ProjectSummary } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function projectName(project: ProjectSummary) {
  const mission = project.mission.type?.replaceAll("_", " ") ?? "Shelter";
  return `${mission.replace(/\b\w/g, (letter) => letter.toUpperCase())} Simulation`;
}

function validationLabel(project: ProjectSummary) {
  const state = project.validation?.state;
  if (state === "VALIDATED_BY_ANSYS") return "ANSYS validated";
  if (state === "RC_ONLY_ANSYS_NOT_REQUESTED") return "RC validated";
  if (state === "RC_ONLY_ANSYS_FAILED") return "ANSYS review required";
  if (project.status === "running") return project.phase_message ?? "Simulation running";
  if (project.status === "queued") return "Queued";
  if (project.status === "failed") return "Simulation failed";
  return "Result available";
}

function statusTone(status: ProjectSummary["status"]) {
  return status === "completed" ? "equilibrium" : status === "failed" ? "thermal" : "teal";
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then(({ projects: saved }) => { if (!cancelled) setProjects(saved); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load projects."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => [
      project.project_id,
      projectName(project),
      project.design.template,
      project.recommended_design_id,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [projects, searchQuery]);

  const validated = projects.filter((project) => project.validation?.state === "VALIDATED_BY_ANSYS").length;
  const running = projects.filter((project) => project.status === "queued" || project.status === "running").length;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto flex flex-col gap-6">
      <section className="bg-surface-container-lowest rounded-2xl border border-line p-5 sm:p-6 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-navy text-[24px]">folder_special</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-navy tracking-tight"><T>Shelter Projects</T></h1>
            <Badge tone="teal">{projects.length} Active Projects</Badge>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1">Each card is linked to its latest persisted simulation result.</p>
        </div>
        <Link href={ROUTES.shelterConfigurator.step1} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-hover transition-colors shadow-sm self-start sm:self-auto">
          <span className="material-symbols-outlined text-[18px]">add_circle</span><T>New Shelter Project</T>
        </Link>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric label="Total Projects" value={projects.length} detail="Persisted simulation projects" tone="text-navy" />
        <Metric label="ANSYS Validated" value={validated} detail="Final RC-to-ANSYS checks passed" tone="text-equilibrium" />
        <Metric label="Solving in Progress" value={running} detail="Queued or actively running" tone="text-thermal" />
      </div>

      <div className="bg-surface-container-lowest p-4 rounded-xl border border-line shadow-card">
        <div className="relative max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-[18px]">search</span>
          <input type="text" placeholder="Search by project, structure, or design ID..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-line rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary" />
        </div>
      </div>

      {loading && <p className="text-sm text-on-surface-variant">Loading saved projects…</p>}
      {error && <p className="text-sm text-thermal">{error}</p>}
      {!loading && !error && filteredProjects.length === 0 && (
        <section className="bg-surface-container-lowest rounded-2xl border border-line p-8 text-center text-sm text-on-surface-variant">No saved projects yet. Start a simulation to create one.</section>
      )}

      <div className="flex flex-col gap-4">
        {filteredProjects.map((project) => {
          const resultUrl = `${ROUTES.candidateTelemetry}?opt=${encodeURIComponent(project.optimization_id)}`;
          const site = project.site.elevation_m == null ? "Site details unavailable" : `${project.site.elevation_m.toLocaleString()} m AMSL`;
          const materials = project.design.materials.length ? project.design.materials.join(" + ") : "Awaiting final design";
          return (
            <section key={project.project_id} className="bg-surface-container-lowest rounded-2xl border border-line p-5 sm:p-6 shadow-card flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-surface-container pb-4">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-data font-bold text-xs text-navy bg-primary-fixed px-2.5 py-0.5 rounded-full">{project.project_id}</span>
                    <Badge tone="teal">{project.mission.occupants ?? "—"} occupants</Badge>
                    <Badge tone={statusTone(project.status)} dot>{project.status}</Badge>
                    <span className="text-xs text-ink-muted">Updated: {formatDate(project.updated_at ?? project.finished_at ?? project.created_at)}</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-navy mt-0.5">{projectName(project)}</h2>
                  <p className="text-xs text-on-surface-variant">{site} · {project.candidate_count ?? "—"} candidates · latest run {project.optimization_id}</p>
                </div>
                <Link href={resultUrl} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-hover transition-colors shadow-xs self-start">
                  <span className="material-symbols-outlined text-[16px]">analytics</span><T>View Simulation Results</T>
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Detail label="Recommended structure" value={project.recommended_design_id ?? "Awaiting optimization"} mono />
                <Detail label="Design template" value={project.design.template ?? "Awaiting final report"} />
                <Detail label="Materials selected" value={materials} />
                <Detail label="Validation" value={validationLabel(project)} highlight={project.validation?.state === "VALIDATED_BY_ANSYS"} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) {
  return <div className="bg-surface-container-lowest p-4 rounded-xl border border-line shadow-card"><span className="text-[10px] uppercase font-bold text-on-surface-variant">{label}</span><span className={`block text-2xl font-bold font-data mt-1 ${tone}`}>{value}</span><span className="text-[11px] text-on-surface-variant mt-1 block">{detail}</span></div>;
}

function Detail({ label, value, mono = false, highlight = false }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return <div className="p-3 bg-surface-container-low rounded-xl border border-line"><span className="text-[10px] uppercase font-bold text-on-surface-variant">{label}</span><p className={`text-xs font-semibold mt-0.5 truncate ${mono ? "font-data" : ""} ${highlight ? "text-equilibrium" : "text-navy"}`} title={value}>{value}</p></div>;
}