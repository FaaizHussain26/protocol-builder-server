import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { list, getOne, create, update, remove, listTrashed, restore, purge } from '../controllers/studies.controller';

const studyBodySchema = z.object({ study: z.record(z.string(), z.any()) });

export const studiesRouter = Router();

studiesRouter.get('/', asyncHandler(list));
studiesRouter.get('/trash', asyncHandler(listTrashed)); // before '/:id'
studiesRouter.post('/', validateBody(studyBodySchema), asyncHandler(create));
studiesRouter.get('/:id', asyncHandler(getOne));
studiesRouter.put('/:id', validateBody(studyBodySchema), asyncHandler(update));
studiesRouter.delete('/:id', asyncHandler(remove)); // soft delete → Trash
studiesRouter.post('/:id/restore', asyncHandler(restore));
studiesRouter.delete('/:id/permanent', asyncHandler(purge));
