import { randomUUID } from 'crypto';
import type { StudyModel } from '../types/study';

// In-memory build-job registry. The /api/build pipeline runs for minutes (one
// skeleton call + many throttled per-form enrichment calls), which is far longer
// than a hosting proxy (e.g. Railway/Envoy) will hold an HTTP connection open —
// so we run the build in the background and let the client poll for the result.
//
// NOTE: jobs live in this process's memory. This matches the rest of the build
// path (Azure calls + local embeddings all run in-process), so the deployment is
// expected to be a SINGLE replica. With multiple replicas a poll could land on
// an instance that doesn't hold the job; use one replica or a shared store.

export type JobStatus = 'pending' | 'done' | 'error';

export interface BuildJob {
  id: string;
  status: JobStatus;
  study?: StudyModel;
  /** Generic payload for non-build jobs (e.g. eSource template analysis). */
  result?: unknown;
  memoryUsed?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, BuildJob>();

// How long a finished (or stale) job is retained before cleanup.
const JOB_TTL_MS = 30 * 60 * 1000;

function sweep(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > JOB_TTL_MS) jobs.delete(id);
  }
}

export function createJob(): BuildJob {
  sweep();
  const now = Date.now();
  const job: BuildJob = { id: randomUUID(), status: 'pending', createdAt: now, updatedAt: now };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): BuildJob | undefined {
  return jobs.get(id);
}

export function completeJob(id: string, study: StudyModel, memoryUsed: number): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'done';
  job.study = study;
  job.memoryUsed = memoryUsed;
  job.updatedAt = Date.now();
}

export function completeJobResult(id: string, result: unknown): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'done';
  job.result = result;
  job.updatedAt = Date.now();
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'error';
  job.error = error;
  job.updatedAt = Date.now();
}
