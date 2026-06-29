import { TemplateDoc } from '../models/Template.model';
import { isMongoConnected, dbUnavailableMessage } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import type { Template } from '../types/study';

function ensureDb(): void {
  if (!isMongoConnected()) {
    throw new HttpError(503, `Persistence unavailable: ${dbUnavailableMessage()}`);
  }
}

export async function listTemplates(): Promise<Template[]> {
  ensureDb();
  const docs = await TemplateDoc.find().sort({ updatedAt: -1 });
  return docs.map((d) => d.toJSON() as unknown as Template);
}

export async function getTemplate(id: string): Promise<Template> {
  ensureDb();
  const doc = await TemplateDoc.findById(id);
  if (!doc) throw new HttpError(404, 'Template not found.');
  return doc.toJSON() as unknown as Template;
}

export async function createTemplate(input: Partial<Template>): Promise<Template> {
  ensureDb();
  const doc = await TemplateDoc.create({ name: input.name, description: input.description, preferences: input.preferences });
  return doc.toJSON() as unknown as Template;
}

export async function updateTemplate(id: string, input: Partial<Template>): Promise<Template> {
  ensureDb();
  const doc = await TemplateDoc.findByIdAndUpdate(
    id,
    { name: input.name, description: input.description, preferences: input.preferences },
    { new: true },
  );
  if (!doc) throw new HttpError(404, 'Template not found.');
  return doc.toJSON() as unknown as Template;
}

export async function deleteTemplate(id: string): Promise<void> {
  ensureDb();
  const doc = await TemplateDoc.findByIdAndDelete(id);
  if (!doc) throw new HttpError(404, 'Template not found.');
}
