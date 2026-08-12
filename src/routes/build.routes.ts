import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { buildStudy, getBuildStatus, regenerateForm, reviewStudy } from '../controllers/build.controller';

const buildSchema = z.object({
  protocolText: z.string().min(1, 'protocolText is required'),
  documents: z.array(z.any()).optional(),
  options: z.any().optional(),
  templatePreferences: z.any().optional(),
});

const regenerateSchema = z.object({
  formName: z.string().min(1, 'formName is required'),
  formDescription: z.string().optional(),
  studyTitle: z.string().optional(),
  indication: z.string().optional(),
  protocolText: z.string().optional(),
  prompt: z.string().optional(),
  options: z.any().optional(),
});

// The follow-up "form testing" pass. Normally carries just the completed build's
// job id (its study + corpus are still in memory); study/protocolText are the
// fallback when that job has expired.
const reviewSchema = z.object({
  buildJobId: z.string().optional(),
  study: z.any().optional(),
  protocolText: z.string().optional(),
});

export const buildRouter = Router();

buildRouter.post('/', validateBody(buildSchema), asyncHandler(buildStudy));
buildRouter.get('/status/:jobId', asyncHandler(getBuildStatus));
buildRouter.post('/regenerate', validateBody(regenerateSchema), asyncHandler(regenerateForm));
buildRouter.post('/review', validateBody(reviewSchema), asyncHandler(reviewStudy));
