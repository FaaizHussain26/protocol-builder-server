import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { list, create, remove } from '../controllers/questions.controller';

const questionSchema = z.object({
  text: z.string().min(1, 'text is required'),
  answerType: z.string().optional(),
  options: z.array(z.string()).optional(),
});

export const questionsRouter = Router();

questionsRouter.get('/', asyncHandler(list));
questionsRouter.post('/', validateBody(questionSchema), asyncHandler(create));
questionsRouter.delete('/:id', asyncHandler(remove));
