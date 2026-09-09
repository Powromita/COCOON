import type { ProjectSummary } from "@/types/catalog";

export const mockProjects: ProjectSummary[] = [
  { id: "leh-family-shelter", name: "Leh family shelter", region: "Leh, India", status: "ready", updatedAt: "Today" },
  { id: "ladakh-field-lab", name: "Ladakh field lab", region: "Ladakh Field Lab", status: "draft", updatedAt: "Yesterday" },
  { id: "siachen-cabin", name: "Siachen cabin", region: "Siachen Basin", status: "simulated", updatedAt: "2 days ago" },
];
