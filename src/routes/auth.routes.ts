import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { register, login, me, listUsers, updateUser } from '../controllers/auth.controller';

const registerSchema = z.object({
  name: z.string().min(1, 'name is required'),
  email: z.string().email('a valid email is required'),
  password: z.string().min(8, 'password must be at least 8 characters'),
  inviteCode: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('a valid email is required'),
  password: z.string().min(1, 'password is required'),
});

const updateUserSchema = z.object({
  role: z.enum(['admin', 'builder', 'site']).optional(),
  active: z.boolean().optional(),
});

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), asyncHandler(register));
authRouter.post('/login', validateBody(loginSchema), asyncHandler(login));
authRouter.get('/me', requireAuth, asyncHandler(me));
authRouter.get('/users', requireAuth, requireRole('admin'), asyncHandler(listUsers));
authRouter.patch('/users/:id', requireAuth, requireRole('admin'), validateBody(updateUserSchema), asyncHandler(updateUser));
