import { StudyDoc } from '../models/Study.model';
import { isMongoConnected } from '../config/db';
import { embed, EMBED_DIMS } from './embeddings.service';

const INDEX = 'study_vector';

export interface MemoryHit {
  title: string;
  indication?: string;
  forms: string[];
}

// Create the Atlas Vector Search index on Study.embedding if missing. Best-effort:
// not all tiers support programmatic creation, so failures are logged and ignored
// (the index can also be created in the Atlas UI).
export async function ensureVectorIndex(): Promise<void> {
  if (!isMongoConnected()) return;
  try {
    const existing = await StudyDoc.collection.listSearchIndexes().toArray().catch(() => [] as { name?: string }[]);
    if (existing.some((i) => i.name === INDEX)) return;
    await StudyDoc.collection.createSearchIndex({
      name: INDEX,
      type: 'vectorSearch',
      definition: { fields: [{ type: 'vector', path: 'embedding', numDimensions: EMBED_DIMS, similarity: 'cosine' }] },
    } as never);
    console.log('[memory] vector index requested:', INDEX);
  } catch (e) {
    console.warn('[memory] vector index unavailable (create in Atlas UI if needed):', (e as Error).message);
  }
}

// Retrieve up to k previously-saved studies most similar to the query text.
// Returns [] whenever Mongo, embeddings, or the vector index are unavailable.
export async function retrieveSimilar(queryText: string, k = 3): Promise<MemoryHit[]> {
  if (!isMongoConnected()) return [];
  const vec = await embed(queryText);
  if (!vec) return [];
  try {
    const docs = await StudyDoc.aggregate([
      { $vectorSearch: { index: INDEX, path: 'embedding', queryVector: vec, numCandidates: 50, limit: k } },
      { $project: { studyTitle: 1, indication: 1, visits: 1, score: { $meta: 'vectorSearchScore' } } },
    ]);
    return docs.map((d: { studyTitle: string; indication?: string; visits?: { forms?: { name: string }[] }[] }) => ({
      title: d.studyTitle,
      indication: d.indication,
      forms: [...new Set((d.visits ?? []).flatMap((v) => (v.forms ?? []).map((f) => f.name)))].slice(0, 40),
    }));
  } catch (e) {
    console.warn('[memory] $vectorSearch unavailable:', (e as Error).message);
    return [];
  }
}

// Compact "prior builds" context injected into the skeleton prompt.
export function buildMemoryContext(items: MemoryHit[]): string {
  if (!items.length) return '';
  const lines = items.map((it) => `- ${it.title}${it.indication ? ` (${it.indication})` : ''} — forms: ${it.forms.join(', ')}`);
  return (
    `\n\nPRIOR BUILDS FOR REFERENCE (you have built similar studies before; reuse consistent visit/form naming and structure where the new study is genuinely similar, but do NOT copy irrelevant content):\n` +
    lines.join('\n')
  );
}
