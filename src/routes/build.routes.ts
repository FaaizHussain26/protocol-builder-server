import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { buildStudy, regenerateForm } from '../controllers/build.controller';

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

export const buildRouter = Router();

buildRouter.post('/', validateBody(buildSchema), asyncHandler(buildStudy));
buildRouter.post('/regenerate', validateBody(regenerateSchema), asyncHandler(regenerateForm));
