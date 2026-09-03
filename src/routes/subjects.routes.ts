import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  listSubjects, createSubject, getSubject, updateSubject,
  listVisitInstances, createVisitInstance,
} from '../controllers/dataCapture.controller';

const createSubjectSchema = z.object({ subjectCode: z.string().min(1, 'subjectCode is required') });
const updateSubjectSchema = z.object({ status: z.enum(['enrolled', 'screen-failed', 'completed', 'withdrawn']).optional() });
const createVisitSchema = z.object({ visitId: z.string().min(1, 'visitId is required') });

// Mounted twice: at /api/studies/:studyId/subjects (list/create) and at
// /api/subjects (everything keyed by subject id) — see routes/index.ts.
export const studySubjectsRouter = Router({ mergeParams: true });
studySubjectsRouter.get('/', asyncHandler(listSubjects));
studySubjectsRouter.post('/', validateBody(createSubjectSchema), asyncHandler(createSubject));

export const subjectsRouter = Router();
subjectsRouter.get('/:id', asyncHandler(getSubject));
subjectsRouter.patch('/:id', validateBody(updateSubjectSchema), asyncHandler(updateSubject));
subjectsRouter.get('/:id/visits', asyncHandler(listVisitInstances));
subjectsRouter.post('/:id/visits', validateBody(createVisitSchema), asyncHandler(createVisitInstance));
