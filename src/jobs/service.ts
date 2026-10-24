import { reviewStorage } from "./storage";
import type { Bindings } from "../server/types";
import {
  checksEnabled,
  readSettings,
  taskActionable,
  taskOutbox,
} from "../server/settings";
import { createBackup } from "./backup";
import { dubaiDay } from "../shared/domain";
import type { Job } from "../shared/management";
export type JobMessage = { id: string };
const later = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toISOString();
const backoff = (attempt: number) =>
  Math.min(3600, 30 * 2 ** Math.min(attempt, 7));
export async function failJob(
  env: Bindings,
  id: string,
  token: string,
  error: string,
) {
  const settings = await readSettings(env.DB);
  const job = await env.DB.prepare(
    "SELECT attempts,dispatch_attempts FROM scheduled_actions WHERE id=? AND token=?",
  )
    .bind(id, token)
    .first<{ attempts: number; dispatch_attempts: number }>();
  if (!job) return;
  const exhausted =
    job.attempts >= settings.maxAttempts ||
    job.dispatch_attempts >= settings.maxAttempts;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE scheduled_actions SET status=?,last_error=?,next_retry_at=?,lease_until=NULL,updated_at=? WHERE id=? AND token=? AND status IN ('processing','queued')",
    ).bind(
      exhausted ? "failed" : "pending",
      error,
      later(backoff(Math.max(job.attempts, job.dispatch_attempts))),
      new Date().toISOString(),
      id,
      token,
    ),
    env.DB.prepare(
      "INSERT INTO job_attempts(id,job_id,phase,at,outcome,error) VALUES(?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      id,
      "processing",
      new Date().toISOString(),
      exhausted ? "failed" : "retry",
      error,
    ),
  ]);
}
export async function processJob(env: Bindings, id: string) {
  const settings = await readSettings(env.DB);
  const now = new Date().toISOString();
  if (settings.jobsPaused || settings.recoveryHold) {
    await env.DB.prepare(
      "UPDATE scheduled_actions SET status='held',lease_until=NULL,updated_at=? WHERE id=? AND status IN ('pending','queued','processing')",
    )
      .bind(now, id)
      .run();
    return;
  }
  const token = crypto.randomUUID();
  const claimed = await env.DB.prepare(
    `UPDATE scheduled_actions SET status='processing',token=?,attempts=attempts+1,lease_until=?,updated_at=? WHERE id=? AND status IN ('pending','queued') AND attempts<? AND next_retry_at<=? AND (kind='backup' OR due_at<=?) AND ${checksEnabled}`,
  )
    .bind(
      token,
      later(300),
      now,
      id,
      settings.maxAttempts,
      now,
      new Date(Date.now() + settings.reminderMinutes * 60000).toISOString(),
    )
    .run();
  if (claimed.meta.changes !== 1) return;
  const job = await env.DB.prepare("SELECT * FROM scheduled_actions WHERE id=?")
    .bind(id)
    .first<Job>();
  if (!job) return;
  try {
    if (job.kind === "backup") {
      const complete = await createBackup(env, id, token);
      if (!complete) {
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE scheduled_actions SET status='pending',attempts=0,dispatch_attempts=0,next_retry_at=?,lease_until=NULL,last_error=NULL,updated_at=? WHERE id=? AND token=? AND status='processing'",
          ).bind(new Date().toISOString(), new Date().toISOString(), id, token),
          env.DB.prepare(
            "INSERT INTO job_attempts(id,job_id,phase,at,outcome) SELECT ?,id,'processing',?,'progress saved' FROM scheduled_actions WHERE id=? AND token=?",
          ).bind(crypto.randomUUID(), new Date().toISOString(), id, token),
        ]);
        try {
          await env.JOBS_QUEUE.send({ id });
        } catch {
          await env.DB.prepare(
            "UPDATE scheduled_actions SET last_error='Backup continuation handoff failed; outbox retry pending.' WHERE id=? AND token=? AND status='pending'",
          )
            .bind(id, token)
            .run();
        }
        return;
      }
      await env.DB.prepare(
        "UPDATE scheduled_actions SET status='succeeded',lease_until=NULL,last_error=NULL,updated_at=? WHERE id=? AND token=? AND status='processing'",
      )
        .bind(new Date().toISOString(), id, token)
        .run();
    } else {
      // Recheck task, owner, stage and pause state in the same atomic batch as the effect.
      const effect = `EXISTS(SELECT 1 FROM scheduled_actions WHERE id=? AND token=? AND status='processing' AND ${taskActionable}) AND ${checksEnabled}`;
      await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO in_app_notifications(id,job_id,enquiry_id,task_id,owner_id,created_at) SELECT ?,j.id,j.enquiry_id,j.task_id,e.owner_id,? FROM scheduled_actions j JOIN enquiries e ON e.id=j.enquiry_id WHERE j.id=? AND ${effect}`,
        ).bind(crypto.randomUUID(), now, id, id, token),
        env.DB.prepare(
          `UPDATE scheduled_actions SET status=CASE WHEN NOT ${checksEnabled} THEN 'held' WHEN EXISTS(SELECT 1 FROM in_app_notifications WHERE job_id=scheduled_actions.id) THEN 'succeeded' ELSE 'cancelled' END,lease_until=NULL,last_error=NULL,updated_at=? WHERE id=? AND token=? AND status='processing'`,
        ).bind(now, id, token),
      ]);
    }
    await env.DB.prepare(
      "INSERT INTO job_attempts(id,job_id,phase,at,outcome) SELECT ?,id,?,?,status FROM scheduled_actions WHERE id=? AND token=?",
    )
      .bind(
        crypto.randomUUID(),
        "processing",
        new Date().toISOString(),
        id,
        token,
      )
      .run();
  } catch {
    await failJob(
      env,
      id,
      token,
      job.kind === "backup"
        ? "Private backup failed; inspect backup status and retry."
        : "In-app due check failed; retry is scheduled.",
    );
  }
}
async function sweepWork(
  env: Bindings,
  { includeDailyBackup = true }: { includeDailyBackup?: boolean } = {},
) {
  const settings = await readSettings(env.DB);
  const now = new Date().toISOString();
  if (settings.jobsPaused || settings.recoveryHold)
    return { paused: true, dispatched: 0 };
  await env.DB.batch([
    taskOutbox(env.DB, undefined, undefined, now),
    env.DB.prepare(
      `UPDATE scheduled_actions SET status='cancelled',lease_until=NULL,updated_at=? WHERE kind='task_due' AND status IN ('pending','queued','processing','held') AND NOT ${taskActionable}`,
    ).bind(now),
    env.DB.prepare(
      `UPDATE scheduled_actions SET status='pending',token=NULL,lease_until=NULL,updated_at=? WHERE (status='held' OR (status IN ('queued','processing') AND lease_until<?)) AND attempts<? AND dispatch_attempts<?`,
    ).bind(now, now, settings.maxAttempts, settings.maxAttempts),
    env.DB.prepare(
      "UPDATE scheduled_actions SET status='failed',last_error=COALESCE(last_error,'Retry budget exhausted.'),updated_at=? WHERE status IN ('pending','queued','processing') AND (attempts>=? OR dispatch_attempts>=?) AND (lease_until IS NULL OR lease_until<?)",
    ).bind(now, settings.maxAttempts, settings.maxAttempts, now),
  ]);
  if (includeDailyBackup) {
    const id = `backup:daily:${dubaiDay()}`;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO scheduled_actions(id,kind,due_at,status,next_retry_at,created_at,updated_at) VALUES(?,'backup',?,'pending',?,?,?)",
    )
      .bind(id, now, now, now, now)
      .run();
  }
  const jobs = await env.DB.prepare(
    "SELECT * FROM scheduled_actions WHERE status='pending' AND next_retry_at<=? AND (kind='backup' OR due_at<=?) ORDER BY due_at LIMIT 6",
  )
    .bind(
      now,
      new Date(Date.now() + settings.reminderMinutes * 60000).toISOString(),
    )
    .all<Job>();
  let dispatched = 0;
  for (const job of jobs.results) {
    const token = crypto.randomUUID();
    const claim = await env.DB.prepare(
      `UPDATE scheduled_actions SET status='queued',token=?,dispatch_attempts=dispatch_attempts+1,lease_until=?,updated_at=? WHERE id=? AND status='pending' AND ${checksEnabled}`,
    )
      .bind(token, later(300), now, job.id)
      .run();
    if (claim.meta.changes !== 1) continue;
    try {
      await env.JOBS_QUEUE.send({ id: job.id });
      dispatched++;
      await env.DB.prepare(
        "INSERT INTO job_attempts(id,job_id,phase,at,outcome) VALUES(?,?,?,?,?)",
      )
        .bind(crypto.randomUUID(), job.id, "dispatch", now, "queued")
        .run();
    } catch {
      await failJob(
        env,
        job.id,
        token,
        "Queue handoff failed; the outbox will retry.",
      );
    }
  }
  await reviewStorage(env);
  return { paused: false, dispatched };
}
export async function consume(batch: MessageBatch<JobMessage>, env: Bindings) {
  for (const message of batch.messages) {
    if (!message.body || typeof message.body.id !== "string") {
      message.ack();
      continue;
    }
    try {
      await processJob(env, message.body.id);
      message.ack();
    } catch {
      message.retry({ delaySeconds: 60 });
    }
  }
}

export async function sweep(
  env: Bindings,
  options: { includeDailyBackup?: boolean } = {},
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO service_status(id,last_started) VALUES('due_checks',?) ON CONFLICT(id) DO UPDATE SET last_started=excluded.last_started",
  )
    .bind(now)
    .run();
  try {
    const result = await sweepWork(env, options);
    await env.DB.prepare(
      "UPDATE service_status SET last_success=?,last_error=NULL WHERE id='due_checks'",
    )
      .bind(new Date().toISOString())
      .run();
    return result;
  } catch (error) {
    await env.DB.prepare(
      "UPDATE service_status SET last_error='Due-check sweep failed; inspect jobs and retry.' WHERE id='due_checks'",
    ).run();
    throw error;
  }
}
