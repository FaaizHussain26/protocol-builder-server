import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { list, create, createBulk, remove } from '../controllers/questions.controller';

const questionSchema = z.object({
  text: z.string().min(1, 'text is required'),
  answerType: z.string().optional(),
  group: z.string().optional(),
  options: z.array(z.string()).optional(),
});

const bulkSchema = z.object({
  items: z.array(questionSchema).min(1, 'items is required').max(1000),
});

export const questionsRouter = Router();

questionsRouter.get('/', asyncHandler(list));
questionsRouter.post('/', validateBody(questionSchema), asyncHandler(create));
questionsRouter.post('/bulk', validateBody(bulkSchema), asyncHandler(createBulk));
questionsRouter.delete('/:id', asyncHandler(remove));
