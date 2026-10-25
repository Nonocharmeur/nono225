import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type JobStatus = "queued" | "processing" | "completed" | "failed";
export type VideoStyle = "realistic" | "anime" | "cinematic" | "3d";
export type VideoFormat = "landscape" | "portrait" | "square";

export type VideoJob = {
  id: string;
  owner: string;
  prompt: string;
  language: "fr" | "en";
  style: VideoStyle;
  format: VideoFormat;
  duration: number;
  status: JobStatus;
  progress: number;
  createdAt: string;
  error?: string;
  videoPath?: string;
  imagePath?: string;
  watermark: boolean;
};

type JobRow = Omit<VideoJob, "watermark"> & {
  watermark: number;
  error: string | null;
  videoPath: string | null;
  imagePath: string | null;
};

const dataDir = path.resolve(process.env.DATA_DIR || "./data");
const globalDatabase = globalThis as typeof globalThis & {
  nonoVideoDatabase?: InstanceType<typeof Database>;
};

function getDatabase() {
  if (globalDatabase.nonoVideoDatabase) return globalDatabase.nonoVideoDatabase;
  mkdirSync(dataDir, { recursive: true });
  const database = new Database(path.join(dataDir, "jobs.sqlite"));
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      prompt TEXT NOT NULL,
      language TEXT NOT NULL,
      style TEXT NOT NULL,
      format TEXT NOT NULL,
      duration INTEGER NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      error TEXT,
      videoPath TEXT,
      imagePath TEXT,
      watermark INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_owner_created ON jobs(owner, createdAt);
  `);
  database.prepare(`
    UPDATE jobs
    SET status = 'failed', progress = 0, error = ?
    WHERE status IN ('queued', 'processing')
  `).run("Le serveur a redémarré avant la fin de cette génération. Relancez-la.");
  globalDatabase.nonoVideoDatabase = database;
  return database;
}

function fromRow(row: JobRow): VideoJob {
  return {
    ...row,
    watermark: Boolean(row.watermark),
    error: row.error || undefined,
    videoPath: row.videoPath || undefined,
    imagePath: row.imagePath || undefined
  };
}

export function getOwner(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(address).digest("hex");
}

export function createJob(
  input: Omit<VideoJob, "id" | "status" | "progress" | "createdAt">,
  limit: number
) {
  const database = getDatabase();
  const today = new Date().toISOString().slice(0, 10);
  const create = database.transaction(() => {
    const used = (database.prepare(`
      SELECT COUNT(*) AS used FROM jobs
      WHERE owner = ? AND substr(createdAt, 1, 10) = ? AND status != 'failed'
    `).get(input.owner, today) as { used: number }).used;
    if (used >= limit) throw new Error("DAILY_LIMIT");
    const job: VideoJob = {
      ...input,
      id: randomUUID(),
      status: "queued",
      progress: 3,
      createdAt: new Date().toISOString()
    };
    database.prepare(`
      INSERT INTO jobs (id, owner, prompt, language, style, format, duration, status, progress, createdAt, error, videoPath, imagePath, watermark)
      VALUES (@id, @owner, @prompt, @language, @style, @format, @duration, @status, @progress, @createdAt, @error, @videoPath, @imagePath, @watermark)
    `).run({ ...job, error: null, videoPath: job.videoPath || null, imagePath: job.imagePath || null, watermark: Number(job.watermark) });
    return { job, remaining: Math.max(0, limit - used - 1) };
  });
  return create();
}

export function listJobs(owner: string) {
  const database = getDatabase();
  const today = new Date().toISOString().slice(0, 10);
  const limit = Math.max(1, Number.parseInt(process.env.DAILY_GENERATION_LIMIT || "3", 10) || 3);
  const used = (database.prepare(`
    SELECT COUNT(*) AS used FROM jobs
    WHERE owner = ? AND substr(createdAt, 1, 10) = ? AND status != 'failed'
  `).get(owner, today) as { used: number }).used;
  const rows = database.prepare("SELECT * FROM jobs WHERE owner = ? ORDER BY createdAt DESC").all(owner) as JobRow[];
  return {
    jobs: rows.map((row) => publicJob(fromRow(row))),
    remaining: Math.max(0, limit - used),
    limit
  };
}

function publicJob(job: VideoJob) {
  const { owner: _owner, videoPath: _videoPath, imagePath: _imagePath, ...visible } = job;
  return { ...visible, videoUrl: job.status === "completed" ? `/api/jobs/${job.id}/video` : undefined };
}

export function updateJob(id: string, update: Partial<VideoJob>) {
  const database = getDatabase();
  const change = database.transaction(() => {
    const row = database.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    if (!row) return null;
    const job = { ...fromRow(row), ...update };
    database.prepare(`
      UPDATE jobs
      SET status = ?, progress = ?, error = ?, videoPath = ?, imagePath = ?, watermark = ?
      WHERE id = ?
    `).run(job.status, job.progress, job.error || null, job.videoPath || null, job.imagePath || null, Number(job.watermark), id);
    return job;
  });
  return change();
}

export function getOwnedJob(id: string, owner: string) {
  const row = getDatabase().prepare("SELECT * FROM jobs WHERE id = ? AND owner = ?").get(id, owner) as JobRow | undefined;
  return row ? fromRow(row) : null;
}

export function removeJob(id: string, owner: string) {
  const database = getDatabase();
  const remove = database.transaction(() => {
    const row = database.prepare("SELECT * FROM jobs WHERE id = ? AND owner = ?").get(id, owner) as JobRow | undefined;
    if (!row) return null;
    const job = fromRow(row);
    if (job.status === "processing") throw new Error("JOB_PROCESSING");
    database.prepare("DELETE FROM jobs WHERE id = ? AND owner = ?").run(id, owner);
    return job;
  });
  return remove();
}

export function getDataPath(...parts: string[]) {
  return path.join(dataDir, ...parts);
}
