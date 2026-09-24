/**
 * Who may change things.
 *
 * An ALLOW-list, never `role !== "pending"`. The deny-list form was in two
 * places and would have handed write access to every role added afterwards —
 * including "viewer", the read-only account a wall-mounted screen runs as.
 * That screen sits where anyone can touch it, so it is exactly the account
 * that must not inherit permissions by default.
 *
 * This mirrors WRITE_ROLES in backend/services/auth_service.py. The backend is
 * the enforcement; this only decides what the UI offers, so the two must agree
 * or the UI will show controls that the API then refuses.
 */
export const WRITE_ROLES = ["owner", "developer"] as const;

export function canWrite(role: string | undefined | null): boolean {
  return !!role && (WRITE_ROLES as readonly string[]).includes(role);
}

/** Read-only roles, for telling a reader why a control is missing. */
export function isDisplayAccount(role: string | undefined | null): boolean {
  return role === "viewer";
}
