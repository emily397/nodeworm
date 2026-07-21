// Shared visibility rules for flows + integrations once workspaces exist.
// Pure. The prior single-user semantics are preserved exactly: anonymous
// records stay reachable (unkeyed single-tenant mode), owners keep their
// records, and the only NEW grant is workspace membership.

export interface Sharable {
  userId?: string;
  workspaceId?: string;
}

export function canAccess(rec: Sharable, uid: string | undefined, memberWs: string[]): boolean {
  if (!rec.userId) return true; // anonymous record: pre-workspace behaviour
  if (rec.userId === uid) return true;
  return Boolean(uid && rec.workspaceId && memberWs.includes(rec.workspaceId));
}

// List semantics differ from the per-record guard on purpose (unchanged from
// before): signed-in users never see anonymous records in their lists, and
// signed-out sessions see only anonymous ones.
export function visibleList<T extends Sharable>(all: T[], uid: string | undefined, memberWs: string[]): T[] {
  if (!uid) return all.filter((r) => !r.userId);
  return all.filter((r) => r.userId === uid || (r.workspaceId && memberWs.includes(r.workspaceId)));
}
