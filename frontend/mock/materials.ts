import type { MaterialOption } from "@/types/catalog";

export const materialCatalog: MaterialOption[] = [
  { id: "adobe-insulation", category: "wall", name: "Adobe + insulation", description: "Thermal mass paired with a lightweight insulation layer.", rValue: 4.8 },
  { id: "rammed-earth", category: "wall", name: "Rammed earth", description: "High thermal mass for slower interior temperature swings.", rValue: 3.9 },
  { id: "puf-composite", category: "wall", name: "PUF composite", description: "Lightweight high-performance insulated panel.", rValue: 6.2 },
  { id: "stone-eps", category: "wall", name: "Stone + EPS", description: "Durable stone shell with a continuous EPS layer.", rValue: 5.4 },
  { id: "insulated-panel", category: "roof", name: "Insulated panel", description: "Low-loss roof assembly for cold-weather operation.", rValue: 6.8 },
  { id: "metal-liner", category: "roof", name: "Metal roof + liner", description: "Reflective outer skin with an insulated interior liner.", rValue: 4.4 },
  { id: "earth-roof", category: "roof", name: "Earth roof", description: "Mass-heavy roof profile that moderates peak loads.", rValue: 4.1 },
  { id: "dual-layer-membrane", category: "roof", name: "Dual-layer membrane", description: "Lightweight layered membrane for rapid deployment.", rValue: 5.1 },
];
