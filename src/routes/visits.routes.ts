import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { updateVisitInstance, getFormSubmission } from '../controllers/dataCapture.controller';

const updateVisitSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'missed']).optional(),
  scheduledDate: z.string().optional(),
  completedDate: z.string().optional(),
});

export const visitsRouter = Router();
visitsRouter.patch('/:visitInstanceId', validateBody(updateVisitSchema), asyncHandler(updateVisitInstance));
// Fetches (or, on first access, creates) the submission for this visit+form.
visitsRouter.get('/:visitInstanceId/forms/:formId', asyncHandler(getFormSubmission));
