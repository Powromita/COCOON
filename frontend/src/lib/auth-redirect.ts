import { ROUTES } from "./routes";

export function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return ROUTES.dashboard;
  return value;
}
