/**
 * RBAC — Role-Based Access Control
 *
 * 5 roles: owner > admin > operator > viewer > tenant_user
 * 9 resources × CRUD actions
 */

export type UserRole = "owner" | "admin" | "operator" | "viewer" | "tenant_user";

export type Resource =
  | "agents"
  | "workflows"
  | "crons"
  | "security"
  | "costs"
  | "settings"
  | "users"
  | "audit"
  | "infrastructure";

export type Action = "create" | "read" | "update" | "delete";

const ROLE_RANK: Record<UserRole, number> = {
  owner: 5,
  admin: 4,
  operator: 3,
  viewer: 2,
  tenant_user: 1,
};

/**
 * Minimum role required for each resource × action.
 * Unlisted combinations default to "owner" (deny by default).
 */
const PERMISSIONS: Record<string, UserRole> = {
  // Agents
  "agents:read": "viewer",
  "agents:create": "admin",
  "agents:update": "operator",   // kill, pause, resume
  "agents:delete": "admin",

  // Workflows
  "workflows:read": "viewer",
  "workflows:create": "operator",
  "workflows:update": "operator",
  "workflows:delete": "admin",

  // Crons
  "crons:read": "viewer",
  "crons:create": "operator",
  "crons:update": "operator",
  "crons:delete": "admin",

  // Security
  "security:read": "viewer",
  "security:update": "operator",  // dismiss, purge threats
  "security:delete": "admin",

  // Costs
  "costs:read": "viewer",
  "costs:create": "admin",
  "costs:update": "admin",

  // Settings
  "settings:read": "admin",
  "settings:update": "owner",

  // Users
  "users:read": "admin",
  "users:create": "owner",
  "users:update": "owner",
  "users:delete": "owner",

  // Audit
  "audit:read": "admin",

  // Infrastructure
  "infrastructure:read": "viewer",
  "infrastructure:update": "admin",

  // Tenant user can only read their own tenant's agents, costs, and security
  // (enforced at query level, not here)
};

export function hasPermission(role: UserRole, resource: Resource, action: Action): boolean {
  const key = `${resource}:${action}`;
  const required = PERMISSIONS[key] ?? "owner";
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[required] ?? 99);
}

export function requireRole(actual: UserRole, minimum: UserRole): boolean {
  return (ROLE_RANK[actual] ?? 0) >= (ROLE_RANK[minimum] ?? 99);
}
