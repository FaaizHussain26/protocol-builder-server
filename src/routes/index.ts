import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from './auth.routes';
import { buildRouter } from './build.routes';
import { studiesRouter } from './studies.routes';
import { templatesRouter } from './templates.routes';
import { questionsRouter } from './questions.routes';
import { studySubjectsRouter, subjectsRouter } from './subjects.routes';
import { visitsRouter } from './visits.routes';
import { submissionsRouter } from './submissions.routes';
import { studyAuditRouter } from './audit.routes';
import { requireAuth } from '../middleware/auth.middleware';

export const apiRouter = Router();

// Public: health check, and auth itself (you need to log in before anything else).
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

// Everything else requires a logged-in user.
apiRouter.use('/build', requireAuth, buildRouter);
apiRouter.use('/studies', requireAuth, studiesRouter);
apiRouter.use('/studies/:studyId/subjects', requireAuth, studySubjectsRouter);
apiRouter.use('/studies/:studyId/audit', requireAuth, studyAuditRouter);
apiRouter.use('/templates', requireAuth, templatesRouter);
apiRouter.use('/questions', requireAuth, questionsRouter);

// Data capture (Phase 2): subjects, their visit instances, and form submissions.
apiRouter.use('/subjects', requireAuth, subjectsRouter);
apiRouter.use('/visits', requireAuth, visitsRouter);
apiRouter.use('/submissions', requireAuth, submissionsRouter);
