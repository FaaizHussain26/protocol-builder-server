import type { StudyModel } from '../types/study';

// Local embeddings — no Azure embeddings deployment, no external API. Uses a
// small open-source model run in-process (downloaded once, then cached). gpt-4.1
// remains the only Azure model; these vectors feed MongoDB Atlas Vector Search.
export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBED_DIMS = 384;

type Extractor = (text: string, opts: unknown) => Promise<{ data: Float32Array }>;

let extractor: Extractor | null = null;
let loadPromise: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (extractor) return extractor;
  if (!loadPromise) {
    loadPromise = (async () => {
      // Dynamic import so the server still boots if the dependency is unavailable.
      const mod = (await import('@xenova/transformers')) as { pipeline: (task: string, model: string) => Promise<Extractor> };
      const ex = await mod.pipeline('feature-extraction', EMBED_MODEL);
      extractor = ex;
      console.log('[embeddings] model loaded:', EMBED_MODEL);
      return ex;
    })().catch((err) => {
      console.error('[embeddings] load failed:', (err as Error).message);
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

// Returns a normalized 384-dim vector, or null if embeddings are unavailable.
export async function embed(text: string): Promise<number[] | null> {
  const clean = (text || '').trim();
  if (!clean) return null;
  try {
    const ex = await getExtractor();
    if (!ex) return null;
    const out = await ex(clean.slice(0, 8000), { pooling: 'mean', normalize: true });
    return Array.from(out.data as Float32Array);
  } catch {
    return null;
  }
}

export function isEmbeddingsLoaded(): boolean {
  return !!extractor;
}

// Compact text summarizing a study for similarity (title, indication, form names).
export function studyEmbeddingText(s: Partial<Pick<StudyModel, 'studyTitle' | 'indication' | 'objectives' | 'visits'>>): string {
  const forms = (s.visits ?? []).flatMap((v) => (v.forms ?? []).map((f) => f.name));
  const uniqueForms = [...new Set(forms)];
  return [s.studyTitle, s.indication, s.objectives, uniqueForms.length ? `Forms: ${uniqueForms.join(', ')}` : '']
    .filter(Boolean)
    .join('. ')
    .slice(0, 8000);
}
