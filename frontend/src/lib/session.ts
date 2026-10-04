/**
 * Signed-in user stub until the auth service exists. Role gates Mode C (Engineering
 * Optimization) controls such as candidate count and the Advanced step.
 */
export type Role = "operator" | "engineer" | "admin";

export const CURRENT_USER: { name: string; email: string; role: Role } = {
  name: "Lt. Col. Vikramaditya Rathore",
  email: "v.rathore@dhadi.gov.in",
  role: "engineer",
};

export function canUseEngineeringMode(role: Role) {
  return role === "engineer" || role === "admin";
}
