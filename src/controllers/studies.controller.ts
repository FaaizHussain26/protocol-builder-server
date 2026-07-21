import type { Request, Response } from 'express';
import * as studies from '../services/studies.service';

export async function list(_req: Request, res: Response): Promise<void> {
  res.json({ items: await studies.listStudies() });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.json({ study: await studies.getStudy(String(req.params.id)) });
}

export async function create(req: Request, res: Response): Promise<void> {
  const study = await studies.createStudy(req.body.study);
  res.status(201).json({ study });
}

export async function update(req: Request, res: Response): Promise<void> {
  const study = await studies.updateStudy(String(req.params.id), req.body.study);
  res.json({ study });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await studies.deleteStudy(String(req.params.id));
  res.json({ ok: true });
}

export async function listTrashed(_req: Request, res: Response): Promise<void> {
  res.json({ items: await studies.listTrash() });
}

export async function restore(req: Request, res: Response): Promise<void> {
  await studies.restoreStudy(String(req.params.id));
  res.json({ ok: true });
}

export async function purge(req: Request, res: Response): Promise<void> {
  await studies.permanentlyDeleteStudy(String(req.params.id));
  res.json({ ok: true });
}
