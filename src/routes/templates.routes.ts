import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { list, getOne, create, update, remove, analyzeEsource, getAnalyzeStatus } from '../controllers/templates.controller';

const templateSchema = z.object({
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  preferences: z.record(z.string(), z.any()),
});

const analyzeSchema = z.object({
  esourceText: z.string().min(1, 'esourceText is required'),
  fileName: z.string().optional(),
});

export const templatesRouter = Router();

templatesRouter.get('/', asyncHandler(list));
templatesRouter.post('/', validateBody(templateSchema), asyncHandler(create));
// Analyze routes must be registered before '/:id' so "analyze" isn't matched as an id.
templatesRouter.post('/analyze', validateBody(analyzeSchema), asyncHandler(analyzeEsource));
templatesRouter.get('/analyze/status/:jobId', asyncHandler(getAnalyzeStatus));
templatesRouter.get('/:id', asyncHandler(getOne));
templatesRouter.put('/:id', validateBody(templateSchema), asyncHandler(update));
templatesRouter.delete('/:id', asyncHandler(remove));
