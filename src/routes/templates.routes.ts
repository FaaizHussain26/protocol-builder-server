import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { list, getOne, create, update, remove } from '../controllers/templates.controller';

const templateSchema = z.object({
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  preferences: z.record(z.string(), z.any()),
});

export const templatesRouter = Router();

templatesRouter.get('/', asyncHandler(list));
templatesRouter.post('/', validateBody(templateSchema), asyncHandler(create));
templatesRouter.get('/:id', asyncHandler(getOne));
templatesRouter.put('/:id', validateBody(templateSchema), asyncHandler(update));
templatesRouter.delete('/:id', asyncHandler(remove));
