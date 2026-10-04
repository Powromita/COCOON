"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { listProjects, deleteProject, renameProject, type ProjectSummary } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { T, useT } from "@/lib/i18n";
import Badge from "@/components/ui/Badge";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import RenameProjectModal from "@/components/ui/RenameProjectModal";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function projectName(project: ProjectSummary) {
  if (project.name && project.name.trim()) return project.name.trim();
  if (project.project_name && project.project_name.trim()) return project.project_name.trim();
  const elev = project.site.elevation_m;
  const loc = elev ? `${elev.toLocaleString()}m AMSL Post` : "Ladakh Post";
  const mission = project.mission.type?.replaceAll("_", " ") ?? "Shelter";
  return `${loc} – ${mission.replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
}

function formatLocation(site: ProjectSummary["site"]) {
  const parts: string[] = [];
  if (site.latitude_deg != null && site.longitude_deg != null) {
    parts.push(`${site.latitude_deg.toFixed(2)}°N, ${site.longitude_deg.toFixed(2)}°E`);
  }
  if (site.elevation_m != null) {
    parts.push(`${site.elevation_m}m`);
  }
  return parts.length > 0 ? parts.join(" • ") : "Site Pending";
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

function statusTone(status: ProjectSummary["status"]): "equilibrium" | "thermal" | "teal" {
  return status === "completed" ? "equilibrium" : status === "failed" ? "thermal" : "teal";
}

export default function DashboardPage() {
  const t = useT();
  const [selectedWorkflowStep, setSelectedWorkflowStep] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [projectToRename, setProjectToRename] = useState<ProjectSummary | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  async function handleDeleteProject() {
    if (!projectToDelete) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteProject(projectToDelete.project_id);
      setProjects((prev) => prev.filter((p) => p.project_id !== projectToDelete.project_id));
      setProjectToDelete(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleRenameProject(newName: string) {
    if (!projectToRename) return;
    setRenameLoading(true);
    setRenameError(null);
    try {
      await renameProject(projectToRename.project_id, newName);
      setProjects((prev) =>
        prev.map((p) =>
          p.project_id === projectToRename.project_id
            ? { ...p, name: newName, project_name: newName }
            : p
        )
      );
      setProjectToRename(null);
      setRenameError(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Failed to rename project");
    } finally {
      setRenameLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then(({ projects: saved }) => {
        if (!cancelled) setProjects(saved);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load projects.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dynamic greeting based on current local time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const latestProject = projects[0] ?? null;

  // Real statistics derived dynamically from project records
  const stats = useMemo(() => {
    const totalProjects = projects.length;
    const candidatesEvaluated = projects.reduce((acc, p) => acc + (p.candidate_count ?? 0), 0);
    const completedRuns = projects.filter((p) => p.status === "completed").length;
    const ansysValidated = projects.filter((p) => p.validation?.state === "VALIDATED_BY_ANSYS").length;
    const runningRuns = projects.filter((p) => p.status === "running" || p.status === "queued").length;
    return {
      totalProjects,
      candidatesEvaluated,
      completedRuns,
      ansysValidated,
      runningRuns,
    };
  }, [projects]);

  // Visual workflow pipeline
  const workflowSteps = [
    {
      step: 1,
      title: "Climate",
      desc: "Latitude, elevation & weather data",
      icon: "wb_sunny",
      href: ROUTES.shelterConfigurator.step1,
    },
    {
      step: 2,
      title: "Requirements",
      desc: "Mission, occupancy & target temp",
      icon: "assignment",
      href: ROUTES.shelterConfigurator.step2,
    },
    {
      step: 3,
      title: "Shelter Design",
      desc: "Footprint, envelope & materials",
      icon: "architecture",
      href: ROUTES.shelterConfigurator.step3,
    },
    {
      step: 4,
      title: "Thermal Analysis",
      desc: "Diurnal RC & surrogate predictions",
      icon: "insights",
      href: latestProject ? ROUTES.candidateDetail(latestProject.optimization_id) : ROUTES.candidateTelemetry,
    },
    {
      step: 5,
      title: "Compare",
      desc: "Multi-candidate trade-off frontier",
      icon: "balance",
      href: latestProject ? ROUTES.candidateDetail(latestProject.optimization_id) : ROUTES.candidateTelemetry,
    },
    {
      step: 6,
      title: "3D Viz",
      desc: "Interactive geometry & thermal mesh",
      icon: "deployed_code",
      href: latestProject ? ROUTES.candidateDetail(latestProject.optimization_id) : ROUTES.candidateTelemetry,
    },
    {
      step: 7,
      title: "ANSYS",
      desc: "FEA verification & solver check",
      icon: "verified_user",
      href: latestProject ? ROUTES.candidateDetail(latestProject.optimization_id) : ROUTES.candidateTelemetry,
    },
    {
      step: 8,
      title: "Report",
      desc: "Technical dossier & CAD deliverables",
      icon: "summarize",
      href: latestProject?.has_report ? ROUTES.reports : ROUTES.candidateTelemetry,
    },
  ];

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto flex flex-col gap-8">
      {/* 1. HERO / WELCOME SECTION */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-container via-[#172554] to-primary text-on-primary p-6 sm:p-10 shadow-feature">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 rounded-full bg-secondary-container opacity-15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-64 h-64 rounded-full bg-surface-tint opacity-20 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur text-white text-xs font-semibold tracking-wider uppercase font-sans">
              Area-Specific Thermal Shelter Design
            </span>
            <span className="text-white/60 text-xs">•</span>
            <span className="text-white/80 text-xs font-sans font-medium">
              Design • Predict • Compare • Validate
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
            COCOON
          </h1>

          <p className="text-sm sm:text-base lg:text-lg text-white/90 leading-relaxed max-w-3xl">
            COCOON helps engineers evaluate shelter configurations for extreme climates using climate data, materials, thermal analysis, lifecycle economics, 3D visualization, and optional ANSYS validation.
          </p>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <Link
              href={ROUTES.shelterConfigurator.step1}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-primary font-semibold text-sm hover:bg-slate-100 transition-all shadow-md hover-lift"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <T>Design a New Shelter</T>
            </Link>

            <Link
              href={ROUTES.candidateTelemetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-medium text-sm transition-all border border-white/20 backdrop-blur hover-lift"
            >
              <span className="material-symbols-outlined text-[18px]">history_edu</span>
              <T>View Simulation Results</T>
            </Link>
          </div>
        </div>
      </section>

      {/* 2. DASHBOARD GREETING & REAL STATISTICS */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs uppercase tracking-wider text-on-surface-variant font-medium">
              Dashboard Overview
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-on-surface">
              {greeting}, welcome back
            </h2>
            <p className="text-sm text-on-surface-variant">
              Manage your shelter designs, monitor thermal runs, and inspect simulation results.
            </p>
          </div>

          {/* New Project button: single plus icon */}
          <Link
            href={ROUTES.shelterConfigurator.step1}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-hover transition-colors shadow-sm self-start sm:self-auto hover-lift"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <T>New Project</T>
          </Link>
        </div>

        {/* 4 Dynamic Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-container-lowest p-5 rounded-xl border border-line shadow-card flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Projects</span>
              <span className="material-symbols-outlined text-navy text-[20px]">folder</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-on-surface font-data">
                {loading ? "…" : stats.totalProjects}
              </span>
              {stats.runningRuns > 0 && (
                <span className="text-xs text-equilibrium font-medium">
                  {stats.runningRuns} active
                </span>
              )}
            </div>
            <p className="text-xs text-on-surface-variant mt-2">Active design workspaces</p>
          </div>

          <div className="bg-surface-container-lowest p-5 rounded-xl border border-line shadow-card flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Designs Generated</span>
              <span className="material-symbols-outlined text-teal text-[20px]">architecture</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-on-surface font-data">
                {loading ? "…" : stats.candidatesEvaluated}
              </span>
              <span className="text-xs text-on-surface-variant">Pareto evaluated</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-2">Multi-zone generated configurations</p>
          </div>

          <div className="bg-surface-container-lowest p-5 rounded-xl border border-line shadow-card flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Thermal Analyses</span>
              <span className="material-symbols-outlined text-thermal text-[20px]">insights</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-on-surface font-data">
                {loading ? "…" : stats.completedRuns}
              </span>
              <span className="text-xs text-equilibrium font-medium">Completed</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-2">RC network thermal simulations</p>
          </div>

          <div className="bg-surface-container-lowest p-5 rounded-xl border border-line shadow-card flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">ANSYS Validations</span>
              <span className="material-symbols-outlined text-secondary text-[20px]">verified</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-on-surface font-data">
                {loading ? "…" : stats.ansysValidated}
              </span>
              <span className="text-xs text-on-surface-variant">MAPDL FEA</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-2">Converged multi-physics solves</p>
          </div>
        </div>
      </section>

      {/* 3. CURRENT PROJECT STATUS TRACKER (DYNAMIC) */}
      {latestProject ? (
        <section className="bg-surface-container-lowest rounded-xl border border-line p-5 shadow-card flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-container pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="material-symbols-outlined text-navy text-[20px]">flag</span>
              <h3 className="text-base font-bold text-on-surface">
                <T>Current Project:</T> {projectName(latestProject)}
              </h3>
              <Badge tone="teal">{formatLocation(latestProject.site)}</Badge>
              <Badge tone={statusTone(latestProject.status)} dot>
                {latestProject.status.toUpperCase()}
              </Badge>
            </div>
            <Link
              href={ROUTES.candidateDetail(latestProject.optimization_id)}
              className="group inline-flex items-center gap-1.5 text-xs font-semibold text-navy no-underline"
            >
              <span className="group-hover:underline"><T>Open Results</T></span>
              <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
            </Link>
          </div>

          {/* Dynamic Milestones for Latest Project */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-equilibrium/10 border border-equilibrium/20">
              <span className="w-5 h-5 rounded-full bg-equilibrium text-white flex items-center justify-center text-xs font-bold shrink-0">
                ✓
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-on-surface truncate">Requirements</span>
                <span className="text-[10px] text-equilibrium font-medium">
                  {latestProject.mission.occupants ? `${latestProject.mission.occupants} Occupants` : "Defined"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-equilibrium/10 border border-equilibrium/20">
              <span className="w-5 h-5 rounded-full bg-equilibrium text-white flex items-center justify-center text-xs font-bold shrink-0">
                ✓
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-on-surface truncate">Materials</span>
                <span className="text-[10px] text-equilibrium font-medium truncate">
                  {latestProject.design.materials.length > 0
                    ? `${latestProject.design.materials.length} Materials`
                    : "Configured"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-equilibrium/10 border border-equilibrium/20">
              <span className="w-5 h-5 rounded-full bg-equilibrium text-white flex items-center justify-center text-xs font-bold shrink-0">
                ✓
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-on-surface truncate">Configuration</span>
                <span className="text-[10px] text-equilibrium font-medium truncate">
                  {latestProject.design.template
                    ? latestProject.design.template.replaceAll("_", " ")
                    : `${latestProject.design.floors ?? 1}-Floor`}
                </span>
              </div>
            </div>

            <div className={`flex items-center gap-2.5 p-3 rounded-lg ${
              latestProject.status === "completed"
                ? "bg-equilibrium/10 border border-equilibrium/20"
                : latestProject.status === "running"
                ? "bg-thermal/10 border border-thermal/30"
                : "bg-surface-container-low border border-line"
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                latestProject.status === "completed"
                  ? "bg-equilibrium text-white"
                  : latestProject.status === "running"
                  ? "bg-thermal text-white animate-pulse"
                  : "bg-outline-variant text-ink-muted"
              }`}>
                {latestProject.status === "completed" ? "✓" : latestProject.status === "running" ? "⏳" : "○"}
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-on-surface truncate">Simulation</span>
                <span className="text-[10px] text-on-surface-variant font-medium truncate">
                  {latestProject.status === "completed"
                    ? `${latestProject.candidate_count ?? 0} Solved`
                    : latestProject.phase_message ?? latestProject.status}
                </span>
              </div>
            </div>

            <div className={`flex items-center gap-2.5 p-3 rounded-lg ${
              latestProject.validation?.state === "VALIDATED_BY_ANSYS"
                ? "bg-equilibrium/10 border border-equilibrium/20"
                : "bg-surface-container-low border border-line"
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                latestProject.validation?.state === "VALIDATED_BY_ANSYS"
                  ? "bg-equilibrium text-white"
                  : "bg-outline-variant text-ink-muted"
              }`}>
                {latestProject.validation?.state === "VALIDATED_BY_ANSYS" ? "✓" : "○"}
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-on-surface truncate">Validation</span>
                <span className="text-[10px] text-ink-muted truncate">
                  {validationLabel(latestProject)}
                </span>
              </div>
            </div>

            <div className={`flex items-center gap-2.5 p-3 rounded-lg ${
              latestProject.has_report
                ? "bg-equilibrium/10 border border-equilibrium/20"
                : "bg-surface-container-low border border-line"
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                latestProject.has_report ? "bg-equilibrium text-white" : "bg-outline-variant text-ink-muted"
              }`}>
                {latestProject.has_report ? "✓" : "○"}
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-on-surface truncate">Report</span>
                <span className="text-[10px] text-ink-muted truncate">
                  {latestProject.has_report ? "Dossier Ready" : "Pending Report"}
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : !loading ? (
        <section className="bg-surface-container-lowest rounded-xl border border-line p-6 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-navy text-[20px]">flag</span>
              <T>No Active Projects</T>
            </h3>
            <p className="text-xs sm:text-sm text-on-surface-variant">
              Configure your first shelter to begin thermal analysis, candidate screening, and validation.
            </p>
          </div>
          <Link
            href={ROUTES.shelterConfigurator.step1}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-hover transition-colors shadow-xs shrink-0 self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <T>Create New Shelter</T>
          </Link>
        </section>
      ) : null}

      {/* 4. VISUAL WORKFLOW: HOW COCOON WORKS */}
      <section className="bg-surface-container-lowest rounded-xl border border-line p-6 shadow-card flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-navy text-[22px]">route</span>
              <T>How COCOON Works</T>
            </h3>
            <p className="text-xs sm:text-sm text-on-surface-variant">
              End-to-end design &amp; simulation workflow for frontline cold-arid shelters.
            </p>
          </div>
          <span className="text-xs text-ink-muted font-medium">
            Click any step to open its workspace
          </span>
        </div>

        {/* Step-by-step Interactive Pipeline */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-2">
          {workflowSteps.map((s) => (
            <Link
              key={s.step}
              href={s.href}
              className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all hover-lift group ${
                selectedWorkflowStep === s.step
                  ? "bg-primary-container text-white border-primary"
                  : "bg-surface-container-low hover:bg-surface-container border-line"
              }`}
              onMouseEnter={() => setSelectedWorkflowStep(s.step)}
              onMouseLeave={() => setSelectedWorkflowStep(null)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  selectedWorkflowStep === s.step ? "bg-white text-primary" : "bg-navy text-white"
                }`}>
                  {s.step}
                </span>
                <span className={`material-symbols-outlined text-[18px] transition-colors ${
                  selectedWorkflowStep === s.step ? "text-white" : "text-navy group-hover:text-primary"
                }`}>
                  {s.icon}
                </span>
              </div>
              <div>
                <h4 className={`text-xs font-bold leading-snug ${
                  selectedWorkflowStep === s.step ? "text-white" : "text-on-surface"
                }`}>
                  <T>{s.title}</T>
                </h4>
                <p className={`text-[10px] leading-tight mt-1 line-clamp-2 ${
                  selectedWorkflowStep === s.step ? "text-white/80" : "text-on-surface-variant"
                }`}>
                  <T>{s.desc}</T>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. RECENT PROJECTS TABLE (DYNAMIC) */}
      <section className="bg-surface-container-lowest rounded-xl border border-line shadow-card overflow-hidden flex flex-col">
        <div className="p-5 border-b border-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-navy text-[22px]">history</span>
              <T>Recent Projects</T>
            </h3>
            <p className="text-xs text-on-surface-variant">
              Active shelter designs and their latest thermal &amp; ANSYS validation status.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={ROUTES.shelterConfigurator.step1}
              className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <T>New Design</T>
            </Link>
            <Link
              href={ROUTES.candidateTelemetry}
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">monitoring</span>
              <T>View Simulation Results</T>
            </Link>
          </div>
        </div>

        {loading && (
          <div className="p-8 text-center text-xs text-on-surface-variant">
            Loading projects…
          </div>
        )}

        {error && (
          <div className="p-6 text-center text-xs text-thermal">
            {error}
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="p-8 text-center text-xs text-on-surface-variant">
            No projects found. Launch your first simulation in the Shelter Configurator.
          </div>
        )}

        {!loading && !error && projects.length > 0 && (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/70 border-b border-surface-container text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                  <th className="py-3.5 px-5"><T>Project Name</T></th>
                  <th className="py-3.5 px-4"><T>Location</T></th>
                  <th className="py-3.5 px-4"><T>Project ID</T></th>
                  <th className="py-3.5 px-4"><T>Last Updated</T></th>
                  <th className="py-3.5 px-4"><T>Status</T></th>
                  <th className="py-3.5 px-4"><T>Validation</T></th>
                  <th className="py-3.5 px-5 text-right"><T>Action</T></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container text-xs text-on-surface">
                {projects.map((proj) => (
                  <tr key={proj.project_id} className="hover:bg-surface-container-low/40 transition-colors">
                    <td className="py-3.5 px-5 font-medium">
                      <div className="flex flex-col">
                        <span className="font-semibold text-navy text-[13px]">{projectName(proj)}</span>
                        <span className="text-on-surface-variant text-[11px]">
                          {proj.design.template ? proj.design.template.replaceAll("_", " ") : "Custom Configuration"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-on-surface-variant">
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-teal">location_on</span>
                        {formatLocation(proj.site)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-data text-ink-muted">
                      {proj.project_id}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-on-surface-variant">
                      {formatDate(proj.updated_at || proj.created_at)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <Badge tone={statusTone(proj.status)} dot>
                        <T>{proj.status}</T>
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-navy bg-primary-fixed px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined text-[13px]">
                          {proj.validation?.state === "VALIDATED_BY_ANSYS" ? "verified" : "task_alt"}
                        </span>
                        <T>{validationLabel(proj)}</T>
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setProjectToRename(proj)}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:text-navy hover:bg-surface-container border border-transparent transition-colors"
                          title="Rename project"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setProjectToDelete(proj)}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/20 border border-transparent hover:border-error/30 transition-colors"
                          title="Delete project"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                        <Link
                          href={ROUTES.candidateDetail(proj.optimization_id)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded bg-navy text-white text-xs font-semibold hover:bg-navy-hover transition-colors shadow-xs hover-lift"
                        >
                          <T>Open Project</T>
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 6. ABOUT COCOON SECTION */}
      <section className="bg-surface-container-low rounded-xl border border-line p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1 max-w-3xl">
          <span className="text-xs uppercase tracking-wider font-semibold text-navy">
            Platform Overview
          </span>
          <h4 className="text-base font-bold text-on-surface">
            <T>What is COCOON?</T>
          </h4>
          <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
            COCOON is a thermal shelter design and simulation platform that helps users evaluate shelter configurations and materials using simulation-based analysis. Built to ensure rapid survivability, energy balance, and lifecycle economics in high-altitude sub-zero regions.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href={ROUTES.candidateTelemetry}
            className="px-4 py-2 rounded-lg bg-surface-container-lowest border border-line text-on-surface text-xs font-semibold hover:bg-surface-container transition-colors hover-lift"
          >
            <T>View Results</T>
          </Link>
          <Link
            href={ROUTES.shelterConfigurator.step1}
            className="px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-hover transition-colors hover-lift"
          >
            <T>Get Started</T>
          </Link>
        </div>
      </section>

      <RenameProjectModal
        isOpen={Boolean(projectToRename)}
        currentName={projectToRename ? projectName(projectToRename) : ""}
        projectId={projectToRename?.project_id ?? ""}
        errorMessage={renameError}
        loading={renameLoading}
        onSave={handleRenameProject}
        onCancel={() => {
          setProjectToRename(null);
          setRenameError(null);
        }}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(projectToDelete)}
        title="Delete Project"
        itemName={projectToDelete ? `${projectName(projectToDelete)} (${projectToDelete.project_id})` : undefined}
        itemType="project"
        errorMessage={deleteError}
        loading={deleteLoading}
        onConfirm={handleDeleteProject}
        onCancel={() => {
          setProjectToDelete(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
