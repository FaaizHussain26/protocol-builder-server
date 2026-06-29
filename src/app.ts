import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : true }));
  app.use(express.json({ limit: '12mb' }));
  app.use('/api', apiRouter);
  app.use(errorHandler);
  return app;
}
