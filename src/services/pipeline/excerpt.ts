// Corpus-slicing helpers. These caps + concurrency keep the build inside the
// Azure deployment's 50k tokens-per-minute / 50 requests-per-minute quota.

// Skeleton input cap (~41k tokens). The SOA can sit deep in a long protocol, so
// the input is assembled from relevant regions rather than truncating the start.
export const SKELETON_MAX_CHARS = 165000;
// Per-form enrichment excerpt size.
export const ENRICH_EXCERPT_CHARS = 16000;
// Concurrency for parallel per-form enrichment calls.
export const ENRICH_CONCURRENCY = 2;
// Overall safety cap on corpus size.
export const MAX_CONTEXT_CHARS = 1_000_000;

export const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

// Run an async fn over items with bounded concurrency, preserving input order.
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// The skeleton phase only needs the protocol (the SOA + eligibility + metadata),
// not the eCRF guide — so when extractText tagged the SOA-bearing document(s),
// send only those. Falls back to the full corpus when nothing is tagged.
export function soaDocsOnly(corpus: string): string {
  const parts = corpus.split(/\n(?====== DOCUMENT \d+ of \d+:)/);
  if (parts.length <= 1) return corpus;
  const soa = parts.filter((p) => /contains Schedule of Activities/i.test(p.split('\n', 1)[0] ?? ''));
  return soa.length ? soa.join('\n') : corpus;
}

// The COMPLEMENT of soaDocsOnly: the non-SOA documents (the eCRF / CRF completion
// guide). Used to discover forms the eCRF defines that the SOA-only skeleton never
// sees. Returns '' when there is only a single (protocol) document.
export function ecrfDocsOnly(corpus: string): string {
  const parts = corpus.split(/\n(?====== DOCUMENT \d+ of \d+:)/);
  if (parts.length <= 1) return '';
  const ecrf = parts.filter((p) => !/contains Schedule of Activities/i.test(p.split('\n', 1)[0] ?? ''));
  return ecrf.join('\n');
}

// Size-capped input for the eCRF-forms discovery pass.
export const ECRF_FORMS_MAX_CHARS = 120000;
export function ecrfFormsInput(corpus: string): string {
  const doc = ecrfDocsOnly(corpus);
  return doc.length <= ECRF_FORMS_MAX_CHARS ? doc : doc.slice(0, ECRF_FORMS_MAX_CHARS);
}

// Assemble a focused, size-capped skeleton input: synopsis (start), the SOA
// table, and eligibility criteria, located by anchor (the SOA can sit past a
// naive truncation point). Falls back to the whole doc when it already fits.
export function skeletonInput(corpus: string): string {
  const doc = soaDocsOnly(corpus);
  if (doc.length <= SKELETON_MAX_CHARS) return doc;

  const wide: RegExp[] = [
    /schedule of (activities|assessments|procedures|events)/i,
    /\bvisit\b[\s\S]{0,60}\bstudy\s*day/i,
  ];
  const narrow: RegExp[] = [/inclusion criteria/i, /exclusion criteria/i];

  const windows: Array<[number, number]> = [[0, 45000]];
  for (const re of wide) {
    const m = re.exec(doc);
    if (m) windows.push([Math.max(0, m.index - 2000), Math.min(doc.length, m.index + 95000)]);
  }
  for (const re of narrow) {
    const m = re.exec(doc);
    if (m) windows.push([Math.max(0, m.index - 1000), Math.min(doc.length, m.index + 25000)]);
  }

  windows.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([w[0], w[1]]);
  }
  let out = '';
  for (const [s, e] of merged) {
    out += doc.slice(s, e) + '\n…\n';
    if (out.length >= SKELETON_MAX_CHARS) break;
  }
  return out.slice(0, SKELETON_MAX_CHARS);
}

// Eligibility-focused input cap (~15k tokens) for the dedicated eligibility pass.
// The window now ENDS at the section following the criteria (see ELIGIBILITY_END),
// so a long I/E list is captured whole without dragging in the rest of the protocol.
export const ELIGIBILITY_MAX_CHARS = 60000;
// Hard ceiling per criteria region, used when no end-of-section marker is found.
const ELIGIBILITY_WINDOW = 30000;
// The heading that typically FOLLOWS the inclusion/exclusion criteria. Matching it
// lets the window stop at the end of the criteria rather than a fixed char count.
const ELIGIBILITY_END = /\n\s*(?:\d+(?:\.\d+)*\.?\s+)?(?:study (?:design|treatment|intervention|procedures|assessments)|screen(?:ing)? failure|rescreen|randomi[sz]ation|discontinuation|withdrawal|statistical|schedule of (?:activities|assessments|events|procedures)|(?:prior and )?concomitant (?:medication|therap)|adverse events?|informed consent|end of study|lifestyle (?:considerations|restrictions))\b/i;

// Assemble a focused input around the Inclusion/Exclusion criteria for the
// dedicated eligibility extraction. Windows the criteria regions (they can be
// long lists) and falls back to the document start when no anchor is found.
export function eligibilityInput(corpus: string): string {
  const doc = soaDocsOnly(corpus);
  if (doc.length <= ELIGIBILITY_MAX_CHARS) return doc;

  const anchors = [/inclusion\s+criteria/i, /exclusion\s+criteria/i, /\beligibility\b/i];
  const windows: Array<[number, number]> = [];
  for (const re of anchors) {
    const g = new RegExp(re.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = g.exec(doc)) && windows.length < 8) {
      const start = Math.max(0, m.index - 500);
      // End at the next major section heading after the criteria, else the ceiling.
      const ceiling = Math.min(doc.length, m.index + ELIGIBILITY_WINDOW);
      const tail = doc.slice(m.index + 1000, ceiling);
      const end = ELIGIBILITY_END.exec(tail);
      windows.push([start, end ? m.index + 1000 + end.index : ceiling]);
    }
  }
  if (!windows.length) return doc.slice(0, ELIGIBILITY_MAX_CHARS);

  windows.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([w[0], w[1]]);
  }
  let out = '';
  for (const [s, e] of merged) {
    out += doc.slice(s, e) + '\n…\n';
    if (out.length >= ELIGIBILITY_MAX_CHARS) break;
  }
  return out.slice(0, ELIGIBILITY_MAX_CHARS);
}

// Build a focused excerpt of the corpus around mentions of a form name, so each
// enrichment call sends only the relevant slice rather than the whole document.
export function excerptFor(corpus: string, formName: string, maxChars = ENRICH_EXCERPT_CHARS): string {
  const hay = corpus.toLowerCase();
  const needle = norm(formName);
  if (!needle) return corpus.slice(0, maxChars);

  const windows: Array<[number, number]> = [];
  let from = 0;
  while (windows.length < 4) {
    const idx = hay.indexOf(needle, from);
    if (idx === -1) break;
    windows.push([Math.max(0, idx - 1500), Math.min(corpus.length, idx + 6500)]);
    from = idx + needle.length;
  }
  if (!windows.length) return corpus.slice(0, maxChars);

  windows.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([w[0], w[1]]);
  }
  let out = '';
  for (const [s, e] of merged) {
    out += corpus.slice(s, e) + '\n…\n';
    if (out.length >= maxChars) break;
  }
  return out.slice(0, maxChars);
}
