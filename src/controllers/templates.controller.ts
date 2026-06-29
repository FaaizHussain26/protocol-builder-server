import type { Request, Response } from 'express';
import * as templates from '../services/templates.service';

export async function list(_req: Request, res: Response): Promise<void> {
  res.json({ items: await templates.listTemplates() });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.json({ template: await templates.getTemplate(String(req.params.id)) });
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ template: await templates.createTemplate(req.body) });
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json({ template: await templates.updateTemplate(String(req.params.id), req.body) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await templates.deleteTemplate(String(req.params.id));
  res.json({ ok: true });
}
