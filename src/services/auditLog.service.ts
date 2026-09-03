import { AuditLogDoc } from '../models/AuditLog.model';

export interface AuditActor { id: string; name: string }

interface AuditEntry {
  studyId: string;
  entityType: 'field' | 'form-submission-record';
  entityId: string;
  action: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  actor?: AuditActor;
}

// Best-effort, fire-and-forget: a failed audit write must never block the
// action it's recording. Callers use `void logAudit(...)`.
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLogDoc.create({
      studyId: entry.studyId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      summary: entry.summary,
      before: entry.before,
      after: entry.after,
      userId: entry.actor?.id,
      userName: entry.actor?.name,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write audit entry', err);
  }
}

export interface AuditFilters {
  entityType?: 'field' | 'form-submission-record';
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listAuditLog(studyId: string, filters: AuditFilters = {}): Promise<unknown[]> {
  const query: Record<string, unknown> = { studyId };
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.userId) query.userId = filters.userId;
  if (filters.from || filters.to) {
    const createdAt: Record<string, Date> = {};
    if (filters.from) createdAt.$gte = new Date(filters.from);
    if (filters.to) createdAt.$lte = new Date(filters.to);
    query.createdAt = createdAt;
  }
  const docs = await AuditLogDoc.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(filters.limit ?? 200, 500))
    .lean();
  return docs.map((d) => ({
    id: String(d._id),
    studyId: String(d.studyId),
    entityType: d.entityType,
    entityId: d.entityId,
    action: d.action,
    summary: d.summary,
    before: d.before,
    after: d.after,
    userId: d.userId,
    userName: d.userName,
    createdAt: (d.createdAt as Date).toISOString(),
  }));
}
