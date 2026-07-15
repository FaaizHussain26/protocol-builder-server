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
    group: input.group ?? 'Custom',
    options: input.options,
  });
  return { ...(doc.toJSON() as unknown as TemplateQuestion), custom: true };
}

// Bulk insert — used when an eSource import approves hundreds of detected
// questions at once, so they land in the library as reusable custom questions.
export async function createQuestionsBulk(items: Partial<TemplateQuestion>[]): Promise<TemplateQuestion[]> {
  ensureDb();
  const docs = await QuestionDoc.insertMany(items.map((i) => ({
    text: i.text,
    answerType: i.answerType ?? 'text',
    group: i.group ?? 'Custom',
    options: i.options,
  })));
  return docs.map((d) => ({ ...(d.toJSON() as unknown as TemplateQuestion), custom: true }));
}

export async function deleteQuestion(id: string): Promise<void> {
  ensureDb();
  const doc = await QuestionDoc.findByIdAndDelete(id);
  if (!doc) throw new HttpError(404, 'Question not found.');
}
