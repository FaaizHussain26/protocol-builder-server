import type { Request, Response } from 'express';
import * as auth from '../services/auth.service';
import { HttpError } from '../middleware/errorHandler';

export async function register(req: Request, res: Response): Promise<void> {
  const { user, token } = await auth.register(req.body);
  res.status(201).json({ user, token });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { user, token } = await auth.login(req.body.email, req.body.password);
  res.json({ user, token });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new HttpError(401, 'Not authenticated.');
  res.json({ user: await auth.getUserById(req.user.id) });
}

export async function listUsers(_req: Request, res: Response): Promise<void> {
  res.json({ items: await auth.listUsers() });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  res.json({ user: await auth.updateUser(String(req.params.id), req.body) });
}
