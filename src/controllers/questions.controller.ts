import type { Request, Response } from 'express';
import * as questions from '../services/questions.service';

export async function list(_req: Request, res: Response): Promise<void> {
  res.json({ items: await questions.listQuestions() });
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ question: await questions.createQuestion(req.body) });
}

export async function createBulk(req: Request, res: Response): Promise<void> {
  res.status(201).json({ items: await questions.createQuestionsBulk(req.body.items) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await questions.deleteQuestion(String(req.params.id));
  res.json({ ok: true });
}
