import { Router } from 'express';
import { healthRouter } from './health.routes';
import { buildRouter } from './build.routes';
import { studiesRouter } from './studies.routes';
import { templatesRouter } from './templates.routes';
import { questionsRouter } from './questions.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/build', buildRouter);
apiRouter.use('/studies', studiesRouter);
apiRouter.use('/templates', templatesRouter);
apiRouter.use('/questions', questionsRouter);
