import { defaultSettings, type WorkspaceSettings } from "../shared/management";
export async function readSettings(db: D1Database): Promise<WorkspaceSettings> {
  const row = await db
    .prepare("SELECT version,data FROM workspace_settings WHERE id='workspace'")
    .first<{ version: number; data: string }>();
  return row
    ? { ...JSON.parse(row.data), version: row.version }
    : structuredClone(defaultSettings);
}
export const checksEnabled =
  "EXISTS(SELECT 1 FROM workspace_settings WHERE id='workspace' AND json_extract(data,'$.jobsPaused')=0 AND json_extract(data,'$.recoveryHold')=0)";
export const taskActionable =
  "EXISTS(SELECT 1 FROM tasks t JOIN enquiries e ON e.id=t.enquiry_id JOIN users u ON u.id=e.owner_id WHERE t.id=scheduled_actions.task_id AND t.status='pending' AND t.due_at=scheduled_actions.expected_due AND e.stage NOT IN ('CONFIRMED','LOST','NOT_SUITABLE','ON_HOLD') AND u.active=1)";
export function taskOutbox(
  db: D1Database,
  enquiryId?: string,
  guard?: { id: string; token: string },
  eligibleAt = new Date().toISOString(),
) {
  const condition = guard
    ? " AND EXISTS(SELECT 1 FROM enquiries WHERE id=? AND write_token=?)"
    : "";
  return db
    .prepare(
      `INSERT OR IGNORE INTO scheduled_actions(id,kind,enquiry_id,task_id,due_at,expected_due,status,next_retry_at,created_at,updated_at) SELECT 'task:'||t.id,'task_due',e.id,t.id,t.due_at,t.due_at,'pending',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM tasks t JOIN enquiries e ON e.id=t.enquiry_id WHERE t.status='pending' AND e.stage NOT IN ('CONFIRMED','LOST','NOT_SUITABLE','ON_HOLD')${enquiryId ? " AND e.id=?" : ""}${condition}`,
    )
    .bind(
      eligibleAt,
      ...(enquiryId ? [enquiryId] : []),
      ...(guard ? [guard.id, guard.token] : []),
    );
}
