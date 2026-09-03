import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { addRecord, deleteRecord, updateRecordValues, submitRecord, signRecord } from '../controllers/dataCapture.controller';

const updateValuesSchema = z.object({ values: z.record(z.string(), z.unknown()) });

export const submissionsRouter = Router();
// Add a new row (repeatable forms only).
submissionsRouter.post('/:submissionId/records', asyncHandler(addRecord));
submissionsRouter.delete('/:submissionId/records/:recordId', asyncHandler(deleteRecord));
// Autosave — merges the given field values into the record.
submissionsRouter.patch('/:submissionId/records/:recordId', validateBody(updateValuesSchema), asyncHandler(updateRecordValues));
submissionsRouter.post('/:submissionId/records/:recordId/submit', asyncHandler(submitRecord));
submissionsRouter.post('/:submissionId/records/:recordId/sign', asyncHandler(signRecord));
