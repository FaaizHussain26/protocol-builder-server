import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from './auth.routes';
import { buildRouter } from './build.routes';
import { studiesRouter } from './studies.routes';
import { templatesRouter } from './templates.routes';
import { questionsRouter } from './questions.routes';
import { requireAuth } from '../middleware/auth.middleware';

export const apiRouter = Router();

// Public: health check, and auth itself (you need to log in before anything else).
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

// Everything else requires a logged-in user.
apiRouter.use('/build', requireAuth, buildRouter);
apiRouter.use('/studies', requireAuth, studiesRouter);
apiRouter.use('/templates', requireAuth, templatesRouter);
apiRouter.use('/questions', requireAuth, questionsRouter);
