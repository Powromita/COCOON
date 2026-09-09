import { mockProjects } from "@/mock/projects";
import type { ProjectSummary } from "@/types/catalog";

export const getProjects = (): ProjectSummary[] => mockProjects;
