import { QuestionDoc } from '../models/Question.model';
import { isMongoConnected, dbUnavailableMessage } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import type { TemplateQuestion } from '../types/study';

function ensureDb(): void {
  if (!isMongoConnected()) {
    throw new HttpError(503, `Persistence unavailable: ${dbUnavailableMessage()}`);
  }
}

export async function listQuestions(): Promise<TemplateQuestion[]> {
  ensureDb();
  const docs = await QuestionDoc.find().sort({ createdAt: -1 });
  return docs.map((d) => ({ ...(d.toJSON() as unknown as TemplateQuestion), custom: true }));
}

export async function createQuestion(input: Partial<TemplateQuestion>): Promise<TemplateQuestion> {
  ensureDb();
  const doc = await QuestionDoc.create({
    text: input.text,
    answerType: input.answerType ?? 'text',
    group: 'Custom',
    options: input.options,
  });
  return { ...(doc.toJSON() as unknown as TemplateQuestion), custom: true };
}

export async function deleteQuestion(id: string): Promise<void> {
  ensureDb();
  const doc = await QuestionDoc.findByIdAndDelete(id);
  if (!doc) throw new HttpError(404, 'Question not found.');
}
