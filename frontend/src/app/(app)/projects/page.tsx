"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { RECENT_RUNS } from "@/lib/mock-data";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";
import Badge from "@/components/ui/Badge";

export default function ProjectsPage() {
  const [filterSite, setFilterSite] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const projects = useMemo(() => {
    return [
      {
        id: "PRJ-LDK-8042",
        name: "Eastern Ladakh Forward Post – 12-Man Vault",
        site: "Daulat Beg Oldi (DBO) Sector",
        coordinates: "35.318° N, 77.922° E (5,065m AMSL)",
        archetype: "12-Man Vaulted Stratified Quonset (GEN-4 V3)",
        dimensions: "12.0m × 4.5m × 2.8m (54.0 m²)",
        materials: "VIP Panels (60mm) + Bio-PCM (35mm) + Ti-Zinc",
        deltaT: "+59.0 K",
        status: "Converged",
        verification: "ANSYS FEA Validated",
        candidateId: "C-8042-4",
        lastUpdated: "Today, 14:32",
        troops: "12 Troops",
      },
      {
        id: "PRJ-NYM-4109",
        name: "Nyoma Advanced Landing Ground Garrison",
        site: "Nyoma Sub-Sector",
        coordinates: "33.200° N, 78.716° E (4,180m AMSL)",
        archetype: "Multi-Zone Modular Monopitch Habitat",
        dimensions: "14.5m × 5.2m × 3.0m (75.4 m²)",
        materials: "Basalt Rockbed + Aerogel Blanket + Quad Glazing",
        deltaT: "+48.5 K",
        status: "Solving (Iter 842)",
        verification: "RC Quick-Solve Active",
        candidateId: "C-4109-2",
        lastUpdated: "Yesterday, 18:10",
        troops: "16 Troops",
      },
      {
        id: "PRJ-SCN-2201",
        name: "Siachen Glacier Base Logistics Depot",
        site: "Siachen North Glacier",
        coordinates: "35.500° N, 77.000° E (5,400m AMSL)",
        archetype: "Hemispherical Cold-Climate Geodesic Dome",
        dimensions: "8.0m Diameter × 3.6m Apex (50.3 m²)",
        materials: "Double-Skin VIP Aerogel + PCM Thermal Battery",
        deltaT: "+62.4 K",
        status: "Converged",
        verification: "ANSYS FEA Validated",
        candidateId: "C-2201-1",
        lastUpdated: "3 days ago",
        troops: "8 Troops",
      },
    ];
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchSite =
        filterSite === "all" ||
        p.site.toLowerCase().includes(filterSite.toLowerCase());
      const matchQuery =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.site.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.archetype.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSite && matchQuery;
    });
  }, [projects, filterSite, searchQuery]);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto flex flex-col gap-6">
      {/* 1. HEADER SECTION */}
      <section className="bg-surface-container-lowest rounded-2xl border border-line p-5 sm:p-6 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-navy text-[24px]">folder_special</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-navy tracking-tight">
              <T>Shelter Projects</T>
            </h1>
            <Badge tone="teal">{projects.length} Active Sites</Badge>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant">
            Manage high-altitude thermal shelter design programmes, site locations, and simulation runs.
          </p>
        </div>

        <Link
          href={ROUTES.shelterConfigurator.step1}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-hover transition-colors shadow-sm hover-lift self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <T>New Shelter Project</T>
        </Link>
      </section>

      {/* 2. STATS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-line shadow-card flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-on-surface-variant">Total Projects</span>
          <span className="text-2xl font-bold text-navy font-data mt-1">{projects.length}</span>
          <span className="text-[11px] text-on-surface-variant mt-1">Eastern Ladakh &amp; Siachen</span>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl border border-line shadow-card flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-teal">Deployment Sites</span>
          <span className="text-2xl font-bold text-teal font-data mt-1">3</span>
          <span className="text-[11px] text-on-surface-variant mt-1">DBO, Nyoma &amp; Siachen</span>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl border border-line shadow-card flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-equilibrium">ANSYS Validated</span>
          <span className="text-2xl font-bold text-equilibrium font-data mt-1">2</span>
          <span className="text-[11px] text-equilibrium font-medium mt-1">FEA Solves Converged</span>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl border border-line shadow-card flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-thermal">Solving in Progress</span>
          <span className="text-2xl font-bold text-thermal font-data mt-1">1</span>
          <span className="text-[11px] text-thermal font-medium mt-1">RC Solver Running</span>
        </div>
      </div>

      {/* 3. SEARCH & FILTERS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest p-4 rounded-xl border border-line shadow-card">
        <div className="relative flex-1 max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search projects by name, location, or archetype..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-line rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-on-surface-variant shrink-0">Filter Site:</span>
          {["all", "Daulat Beg Oldi", "Nyoma", "Siachen"].map((site) => (
            <button
              key={site}
              type="button"
              onClick={() => setFilterSite(site)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                filterSite === site
                  ? "bg-navy text-white"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              {site === "all" ? "All Sites" : site}
            </button>
          ))}
        </div>
      </div>

      {/* 4. PROJECTS LIST */}
      <div className="flex flex-col gap-4">
        {filteredProjects.map((proj) => (
          <div
            key={proj.id}
            className="bg-surface-container-lowest rounded-2xl border border-line p-5 sm:p-6 shadow-card hover:shadow-card-hover transition-all flex flex-col gap-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-surface-container pb-4">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-data font-bold text-xs text-navy bg-primary-fixed px-2.5 py-0.5 rounded-full">
                    {proj.id}
                  </span>
                  <Badge tone="teal">{proj.troops}</Badge>
                  <Badge tone={proj.status === "Converged" ? "equilibrium" : "thermal"} dot>
                    {proj.status}
                  </Badge>
                  <span className="text-xs text-ink-muted">Updated: {proj.lastUpdated}</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-navy mt-0.5">
                  {proj.name}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-teal text-[15px]">location_on</span>
                    {proj.site}
                  </span>
                  <span>•</span>
                  <span>{proj.coordinates}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-auto">
                <Link
                  href={ROUTES.candidateTelemetry}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-hover transition-colors shadow-xs hover-lift"
                >
                  <span className="material-symbols-outlined text-[16px]">analytics</span>
                  <T>View Simulation Results</T>
                </Link>
                <Link
                  href={ROUTES.candidateDetail(proj.candidateId)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors hover-lift"
                >
                  <span className="material-symbols-outlined text-[16px]">view_in_ar</span>
                  <T>3D Twin</T>
                </Link>
              </div>
            </div>

            {/* Project Specifications Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 bg-surface-container-low rounded-xl border border-line">
                <span className="text-[10px] uppercase font-bold text-on-surface-variant">Archetype</span>
                <p className="text-xs font-semibold text-navy mt-0.5">{proj.archetype}</p>
              </div>

              <div className="p-3 bg-surface-container-low rounded-xl border border-line">
                <span className="text-[10px] uppercase font-bold text-on-surface-variant">Dimensions &amp; Area</span>
                <p className="text-xs font-semibold text-navy mt-0.5 font-data">{proj.dimensions}</p>
              </div>

              <div className="p-3 bg-surface-container-low rounded-xl border border-line">
                <span className="text-[10px] uppercase font-bold text-on-surface-variant">Materials Selected</span>
                <p className="text-xs font-semibold text-navy mt-0.5 truncate" title={proj.materials}>
                  {proj.materials}
                </p>
              </div>

              <div className="p-3 bg-surface-container-low rounded-xl border border-line flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant">Thermal Lift (ΔT)</span>
                  <p className="text-base font-bold text-equilibrium font-data mt-0.5">{proj.deltaT}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-navy bg-primary-fixed px-2 py-1 rounded-md">
                  <span className="material-symbols-outlined text-[13px]">verified</span>
                  {proj.verification}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
