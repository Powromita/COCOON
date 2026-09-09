import { materialCatalog } from "@/mock/materials";

export const getMaterials = (category?: "wall" | "roof") =>
  category ? materialCatalog.filter((material) => material.category === category) : materialCatalog;
