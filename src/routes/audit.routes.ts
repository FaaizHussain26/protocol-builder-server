import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { listAuditLog } from '../services/auditLog.service';

// Mounted at /api/studies/:studyId/audit (mergeParams) — see routes/index.ts.
export const studyAuditRouter = Router({ mergeParams: true });

studyAuditRouter.get('/', asyncHandler(async (req, res) => {
  const { entityType, userId, from, to, limit } = req.query;
  const items = await listAuditLog(String(req.params.studyId), {
    entityType: entityType === 'field' || entityType === 'form-submission-record' ? entityType : undefined,
    userId: userId ? String(userId) : undefined,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  res.json({ items });
}));
