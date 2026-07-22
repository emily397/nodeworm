// Reactive token refresh for flow execution. A step that gets an auth rejection
// retries ONCE with a renewed access token, so a long-lived connection stops dying
// silently when its token expires. Pure decision here; the I/O lives in the caller
// (lib/flow/effects.ts) so it stays testable.

export function shouldRefresh(status: number, refreshToken: string | undefined): boolean {
  if (!refreshToken) return false;
  return status === 401 || status === 403;
}
