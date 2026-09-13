export interface SessionRecord {
  sessionId: string;
  startedAt: string;
}

export function sessionRoot(root: string, sessionId: string): string {
  return `${root}/sessions/${sessionId}`;
}

export function sessionActivePath(root: string, sessionId: string): string {
  return `${sessionRoot(root, sessionId)}/active`;
}
