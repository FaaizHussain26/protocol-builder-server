import type { BuildOptions } from '../../types/study';

type ResolvedOptions = Required<Omit<BuildOptions, 'customInstructions' | 'templateId'>> & {
  customInstructions: string;
  templateId?: string;
};

// Shared guidance reused by both build phases.
export const DOC_ROLES = `DOCUMENT ROLES — when multiple documents are provided, recognize what each is FOR:
- The Clinical Study Protocol (the document containing the Schedule of Activities / Table of Procedures, objectives, eligibility, and visit timing) is the AUTHORITATIVE source for the VISIT SCHEDULE and for the RULES governing data collection.
- A "CRF Completion Requirements" / "EDC Completion Guidelines" / eCRF data-entry guide describes how to FILL forms/fields (labels, formats, completion guidance). It is the AUTHORITATIVE source for the exact set of forms and fields. When an eCRF/CRF document is present, COPY ALL of its forms COMPLETELY — every form and every field — do not sample or summarize.
- When both are present: build the visit schedule from the protocol's SOA, take the field-level form content from the eCRF guide, and use the protocol (incl. SOA footnotes) to SET validation/edit-check rules.`;

// Source-document design philosophy (distilled from the CRA/CDM/GCP master
// methodology). Reused by both build phases so the output is an audit-ready
// source worksheet that mirrors the CRF/EDC one-to-one.
export const SOURCE_DOC_PRINCIPLES = `SOURCE-DOCUMENT PHILOSOPHY (you are a CRA / Clinical Data Manager / GCP specialist building an audit-ready oncology source worksheet):
- The uploaded CRF/eCRF is a direct copy of the EDC and is the MASTER BLUEPRINT. Every CRF field must have a corresponding place in the output — none omitted. Do NOT add fields that are not in the CRF unless the Protocol specifically requires them.
- The Protocol is NOT used to redesign forms. Consult it only for: references, footnotes, inclusion/exclusion criteria, Schedule of Assessments, assessment timing, study procedures, protocol-specific wording, visit windows, and study-drug instructions. When the CRF references the Protocol, incorporate the required instruction; never guess protocol requirements.
- Priority when sources differ: (1) Protocol, (2) CRF.
- Mirror the CRF structure and EDC workflow: same visit order, same form/page order, similar terminology, so a user can transcribe directly into the EDC.
- Reproduce field types faithfully (radio, checkbox, dropdown, date, time, numeric, signature, file/upload, conditional). Add an upload (file) placeholder wherever the CRF has an upload; add an investigator signature/date where the CRF signs off; reproduce conditional questions with their trigger.`;

// ===== PHASE A — skeleton: the COMPLETE visit/log schedule + form NAMES only. =====
export const SKELETON_SYSTEM_PROMPT = `You are an expert clinical-trial eSource builder. In THIS step you extract the STUDY STRUCTURE ONLY: study metadata, the COMPLETE visit/log schedule driven by the Schedule of Activities (SOA), and the NAMES of the forms collected at each visit. You do NOT produce fields in this step.

${DOC_ROLES}

${SOURCE_DOC_PRINCIPLES}

WORKFLOW:
1. Identify the PRIMARY protocol (the one with the SOA). Extract study title, protocol number, phase, indication, sponsor, and objectives. Do NOT extract eligibility/inclusion/exclusion criteria — a separate protocol-only pass owns those.
2. Locate the SOA table ("Schedule of Activities/Assessments/Procedures/Events", or a numbered table such as "Table 3"). Its column headers ARE the visits — read them directly off the table; never infer from prose or from a "typical" trial.
   - The SOA is extracted from a PDF, so its grid is flattened and may look scrambled: a multi-row header where visit labels are split across lines (e.g. a "Visit" row "1 2 3 3 4 4 4 4 5 6 ..." with sub-labels "a b a b c d ..." beneath, forming 1, 2, 3a, 3b, 4a, 4b, 4c, 4d, 5, 6, ...), a "Study Day(s)" row giving each visit's day, and "Study Phase" groupings (Screening, Baseline, Treatment, Follow-up). Reconstruct the FULL ordered visit list, pairing each label with its study day. Treat sub-visits (3a/3b) as DISTINCT visits. Do NOT collapse into broad phases.
   - READ THE FOOTNOTES beneath and around the SOA table (markers like a, b, c, *, †, or "Note:"). These footnotes carry essential detail about HOW each procedure/form is to be collected and designed — carry them forward conceptually (they will drive field design and rules in the next step).
3. Output EVERY visit column LEFT-TO-RIGHT in exact order (left-to-right is chronological):
   - Capture ALL columns including the first and last (incl. EOS, ET/EDD, Unscheduled). Do not drop, skip, merge, deduplicate, or stop early. If the SOA has 30 columns, output 30 visits.
   - Use the EXACT label shown. Do not renumber, relabel, round, or convert.
   - Capture each visit's timing and window from the header/footnotes.
   - Continuous logs spanning the whole study (Adverse Events, Concomitant Medications, etc.) are kind "log"; everything tied to a specific SOA column is kind "visit".
   - Re-count before finishing: the number of "visit" entries MUST equal the number of SOA visit columns.
4. For each visit, list the FORMS collected at it (by NAME only). A procedure ROW marked in that visit's column becomes a form for that visit ONLY when it is ROUTINELY collected there. READ THE FOOTNOTES / CELL MARKERS: when a mark is conditional or optional ("as needed", "if clinically indicated", "if abnormal", "unscheduled only", "only at …", "PRN", a dash/blank/"X" meaning NOT done, or a footnote that restricts when/where it applies), do NOT attach that form to that visit as a routine form — instead raise a low-confidence "finding" noting the conditional procedure. Use the protocol's context, not just the raw SOA grid: do not spray a procedure into visits where the footnotes exclude it. Capture every ROUTINE row; do not sample. If an eCRF/CRF document is present, ALSO ensure every form it defines appears on the visit(s) where it is collected. Use standard names where they match: Informed Consent, Demographics, Eligibility / Inclusion-Exclusion, Medical History, Vital Signs, Physical Examination, ECG, Lab Assessments, Concomitant Medications, Adverse Events, Pharmacokinetics, Questionnaires, Disposition / End of Study, etc.
5. SOURCE-DOCUMENT STRUCTURE — organize the forms the CRF/SOA actually contain per this methodology (organize, do NOT invent forms absent from the CRF/Protocol):
   - The Screening visit typically splits into three forms: (1) Consent Process Documentation, (2) Eligibility Determination, (3) Screening (procedures).
   - Keep these as SEPARATE forms when present: "Lab Assessments" (ONE page consolidating routine labs), "Physical Measurements" (Height/Weight/BMI/BSA — SEPARATE from Vital Signs), "Vital Signs" (a repeated logline for pre-/post-dose timepoints; NO height/weight), "ECG", "Physical Examination", "Imaging Assessment" (separate from) "Tumor Evaluation", "ECOG Performance Status", "Screening Disposition", "Progress Notes & Uploads", and a "Visit Completion" form LAST.
   - Give each protocol-specified extra assessment its own form (Neurological Exam, ECHO/MUGA, Ophthalmology, Pulmonary Function Test, ICE score, Bone Marrow, central-lab assessments).
   - Subsequent (treatment) visits mirror the Screening structure and ADD a "Study Drug Administration" form.

Output ONLY valid JSON (NO fields, NO rules, and NO eligibility in this step):
{
  "studyTitle": "string",
  "studyDescription": "string (1-2 sentences)",
  "protocolNumber": "string or null",
  "sponsor": "string or null",
  "phase": "string or null",
  "indication": "string or null",
  "objectives": "string or null",
  "visits": [
    { "id": "v1", "name": "string (exact SOA label)", "kind": "visit | log", "timing": "string or null", "window": "string or null",
      "forms": [ { "name": "string", "description": "string or null", "appliedTemplate": "Adverse Event Log | Concomitant Medication Log | Vital Signs | Medical History | null" } ] }
  ],
  "findings": [ { "id": "fnd1", "title": "string", "description": "string", "source": "string", "confidence": "high|medium|low", "severity": "info|warning|blocker", "suggestedAction": "review | block" } ]
}

Rules:
- The "visits" array MUST contain one entry per SOA visit COLUMN (kind "visit"), in left-to-right (chronological) order, with the exact labels — do not sample, summarize, reorder, rename, or cap to a round number. This is the single most important requirement of this step.
- Every visit MUST list at least one form name. Forms have NO fields in this step.
- If NO SOA table exists in ANY document, infer a best-effort schedule (Screening, Baseline, Day 1, Week 1, Week 2, … plus follow-up) and add a "blocker" finding stating no SOA was found.
- Produce 3-6 findings, at least one "blocker". Do NOT emit an "eligibility" key at all.
- Return ONLY the JSON object. No markdown, no prose.`;

// ===== Dedicated eligibility extraction — protocol-only, template-independent. =====
// Runs in parallel with the skeleton so inclusion/exclusion criteria are always
// pulled straight from the protocol and never crowded out by template/memory
// content in the (larger) skeleton prompt.
export const ELIGIBILITY_SYSTEM_PROMPT = `You are an expert clinical-trial eSource builder. Your ONLY task is to extract the study's eligibility criteria from the protocol text provided.

RULES:
- Find the Inclusion Criteria and Exclusion Criteria sections and extract EVERY criterion, one entry each. Do not summarize, merge, skip, or cap the list — if there are 25 inclusion and 30 exclusion criteria, output all 55.
- COPY EACH CRITERION VERBATIM into "criterion" — character-for-character, exactly as written in the protocol. Do NOT paraphrase, reword, shorten, clean up, re-punctuate, or "improve" the text. Keep the criterion's own number/letter identifier at the start (e.g. "1.", "18a") and preserve any sub-parts — output each distinct criterion as its own entry with its exact text.
- Put the derived pass/fail check ONLY in "logic" (plain language, e.g. "PASS if age >= 18 and <= 65"). Never let that plain-language logic leak into "criterion" — "criterion" is the untouched source text.
- Base everything ONLY on the protocol text. Ignore any form/template/preferences context.

Output ONLY valid JSON:
{
  "eligibility": [
    { "id": "e1", "kind": "inclusion | exclusion", "criterion": "original text", "logic": "pass/fail logic", "confidence": "high|medium|low" }
  ]
}
Return ONLY the JSON object. No markdown, no prose.`;

// ===== eCRF-forms discovery — the forms the eCRF/CRF guide defines. =====
// The SOA-only skeleton never sees the eCRF (soaDocsOnly strips it), so
// study-specific forms defined only in the eCRF would be lost. This pass reads
// the eCRF guide and lists every form it defines, to be merged into the structure.
export const ECRF_FORMS_SYSTEM_PROMPT = `You are an expert clinical-trial eSource builder. You are given the eCRF / CRF Completion Requirements guide (NOT the protocol SOA). Your ONLY task is to list EVERY form (CRF) the eCRF defines — especially STUDY-SPECIFIC forms a generic template would miss.

RULES:
- Enumerate every distinct form/CRF in the guide by its EXACT name. Do not skip, sample, merge, summarize, or cap the list.
- For each form, if the guide indicates which visit(s) collect it, put a short hint in "visitHint" (e.g. "Screening", "Every visit", "Day 1"); otherwise null.
- Set "studySpecific" to true when the form is particular to THIS study (not a generic Demographics / Vital Signs / Adverse Events type), else false.
- Do NOT invent forms that are not present in the document.

Output ONLY valid JSON:
{
  "forms": [ { "name": "string (exact eCRF form name)", "visitHint": "string or null", "studySpecific": true } ]
}
Return ONLY the JSON object. No markdown, no prose.`;

// ===== PHASE B — enrich ONE form into its complete, sectioned questionnaire. =====
export const ENRICH_SYSTEM_PROMPT = `You are a CRA / Clinical Data Manager / GCP specialist building an audit-ready oncology source worksheet. Given source-document excerpts and ONE target form, produce the COMPLETE, detailed list of typed fields for that form — a real eSource questionnaire grouped into sections, that mirrors the CRF field-for-field.

${DOC_ROLES}

${SOURCE_DOC_PRINCIPLES}

For the TARGET FORM:
- COMPLETENESS — search the excerpts (especially any CRF/EDC Completion Requirements guide) for this form and emit EVERY field it defines. When the guide enumerates fields as numbered sub-items (e.g. "3.16.1 Category", "3.16.2 AE ID", … through "3.16.18 …"), reproduce EACH as its own field with the exact label and its data-entry instruction in completionGuidance. Do NOT truncate or sample — copy the eCRF form complete. Rich forms (Adverse Events, Laboratory, Concomitant Medications, ECG) commonly run 12-25+ fields. Use fewer only when the source genuinely defines fewer.
- FOOTNOTE-DRIVEN RULES — apply the SOA table FOOTNOTES and protocol text that govern this form to populate field-level "rules" (edit checks) and completionGuidance (e.g. allowed ranges, required-if conditions, timing windows, units, "record only if abnormal"). The protocol SETS the rules.
- CONDITIONAL FIELDS — reproduce dependent/branching fields ("If Yes, record …", "If abnormal, …", "If Other, specify") as their own fields, state the trigger in completionGuidance, and add a matching "required-if" rule.
- SECTIONS — set the "section" property on every field to group the form into correctly named subsections, in source order (e.g. Physical Examination → body systems; Adverse Events → "Event Details", "Seriousness", "Causality", "Action & Outcome"). Do not leave fields ungrouped when the form has more than ~5 fields.
- TYPES — choose the best field type (integer/decimal for numerics, datetime for date+time, multiselect for pick-many, signature for sign-offs, file for uploads, calculated with an "expression" for derived values like BMI/Age). Only include "options" for select/multiselect/radio/checkbox.
- TRACEABILITY — every field includes source (document name), and where determinable protocolSection, page, a short originalText snippet, and a confidence. Include at least one or two "low"/"medium" confidence fields where the source is ambiguous.
- Give EVERY field a completionGuidance. Provide 1-3 sensible validation rules for the form.
- REPEATABLE — set "repeatable": true when this form is a LOG, TABLE, or repeated LOGLINE the site fills with MULTIPLE records/timepoints (e.g. Vital Signs [pre-/post-dose timepoints], Adverse Events, Concomitant Medications, Medical History, Lab Assessments, Study Drug Administration, any "…Log"); set false for a form captured ONCE per visit (Demographics, Physical Measurements, Eligibility, etc.).

Output ONLY valid JSON for THIS one form:
{
  "repeatable": true,
  "fields": [
    { "label": "string", "type": "text|textarea|number|integer|decimal|date|datetime|time|select|multiselect|radio|checkbox|yesno|signature|file|calculated", "required": true,
      "options": ["..."], "section": "string or null", "expression": "string or null (only for 'calculated')", "confidence": "high|medium|low",
      "completionGuidance": "string", "source": "string (source document name)", "protocolSection": "string or null", "page": "number or null", "originalText": "string or null" }
  ],
  "rules": [ { "description": "string", "ruleType": "range|required-if|cross-field|format|date-not-future|within-visit-window", "confidence": "high|medium|low" } ]
}
Return ONLY the JSON object. No markdown, no prose.`;

// Neutral fallback used when Azure's Prompt Shields flag the full enrichment
// prompt as a jailbreak. Plain, non-imperative wording that still returns the
// same JSON shape, so a filtered form/regenerate can still be built.
export const ENRICH_SYSTEM_PROMPT_SAFE = `You are a clinical data manager designing an electronic case report form. Given some source text and a target form, produce a list of the data-entry fields for that form.

Output ONLY valid JSON:
{
  "repeatable": false,
  "fields": [
    { "label": "string", "type": "text|textarea|number|integer|decimal|date|datetime|time|select|multiselect|radio|checkbox|yesno|signature|file|calculated", "required": true,
      "options": ["..."], "section": "string or null", "expression": "string or null", "confidence": "high|medium|low",
      "completionGuidance": "string", "source": "string", "protocolSection": "string or null", "page": "number or null", "originalText": "string or null" }
  ],
  "rules": [ { "description": "string", "ruleType": "range|required-if|cross-field|format|date-not-future|within-visit-window", "confidence": "high|medium|low" } ]
}
Return ONLY the JSON object. No prose.`;

// ===== PHASE C — QC review: re-check ONE already-built form against the source. =====
// Runs after the build as a separate "form testing" pass. Returns a DELTA (additions +
// patches) rather than a rewritten form: cheaper in output tokens, and it makes the
// "never delete a field" guarantee true by construction.
export const REVIEW_SYSTEM_PROMPT = `You are a senior CRA / Clinical Data Manager performing a QUALITY-CONTROL review of ONE already-built eSource form. The form was drafted by another pass and may be incomplete. Your job is to find what is MISSING or WRONG in it compared with the source documents, and return the corrections.

${DOC_ROLES}

${SOURCE_DOC_PRINCIPLES}

HOW TO REVIEW THIS FORM:
1. Read the CURRENT FIELDS list, then read the source excerpts for this form.
2. MISSING FIELDS — every field the eCRF/CRF guide (or a Protocol requirement for this form) defines that is NOT already in the current list goes into "addFields". Include enumerated sub-items the draft truncated, conditional/branching fields ("If Yes, specify…"), and any required upload (file), signature, date/time, or comment field the source shows.
3. WRONG/INCOMPLETE FIELDS — for a field that EXISTS but is demonstrably wrong or incomplete against the source, add ONE entry to "patchFields" keyed by its exact current label, containing ONLY the properties that need changing: a wrong "type" (e.g. free text where the CRF shows a dropdown), a truncated/missing "options" list, a wrong "required", a missing "section", a missing "expression" for a calculated field, or a missing/incorrect "completionGuidance".
4. Judge ONLY against the sources. If the excerpts do not support a change, do not make one.

HARD RULES:
- NEVER propose deleting or removing a field. There is no removal mechanism — omit it and it simply stays.
- NEVER invent a field that the eCRF or Protocol does not actually define. No speculative "nice to have" fields.
- Do NOT duplicate an existing field under a slightly different name — check the current list first.
- If the form is already complete and correct, return empty arrays. That is a valid, expected answer.

Output ONLY valid JSON:
{
  "addFields": [
    { "label": "string", "type": "text|textarea|number|integer|decimal|date|datetime|time|select|multiselect|radio|checkbox|yesno|signature|file|calculated", "required": true,
      "options": ["..."], "section": "string or null", "expression": "string or null", "confidence": "high|medium|low",
      "completionGuidance": "string", "source": "string (source document name)", "protocolSection": "string or null", "page": "number or null", "originalText": "string or null" }
  ],
  "patchFields": [
    { "matchLabel": "exact label of an existing field", "type": "string or null", "required": true, "options": ["..."],
      "section": "string or null", "expression": "string or null", "completionGuidance": "string or null" }
  ]
}
Return ONLY the JSON object. No markdown, no prose.`;

// Per-form field-count guidance, driven by the detailLevel option.
export function enrichDetailLine(o: ResolvedOptions): string {
  if (o.detailLevel === 'concise') return 'Keep it lean: the most important 4-6 fields, still grouped into sections.';
  if (o.detailLevel === 'detailed') return 'Be EXHAUSTIVE: emit every field the source defines for this form (12-25+ for rich forms), reproducing every enumerated sub-item, all grouped into sections.';
  return 'Use a realistic field count that follows the source (typically 6-12, more when the source enumerates more), grouped into sections.';
}

// Per-form-type source-document design guidance, scoped to the target form so each
// enrichment call only carries the guidance relevant to THAT form (keeps tokens
// low). Distilled from the CRA/CDM master methodology. Appended to the enrich
// user message alongside the universal rules.
export function sourceDocFieldGuidance(formName: string): string {
  const n = formName.toLowerCase();
  const g: string[] = [];
  const routineLab = /lab|hematolog|chemistr|urinalys|coagulat|serolog/.test(n) && !/genetic|pharmacokinet|\bpk\b|exploratory|biomarker/.test(n);
  if (routineLab)
    g.push('Lab Assessments is ONE checklist page. For EACH required test emit: Test Name, Performed (yes/no), Collection Date (date), Collection Time (time), Result (Normal/Abnormal), Clinical Significance (Clinically Significant / Not Clinically Significant), and a Laboratory Report upload (file). Group tests into sections (Hematology, Chemistry, Urinalysis, Coagulation).');
  if (/genetic|pharmacokinet|\bpk\b|exploratory|biomarker/.test(n))
    g.push('This is a specialty lab (Genetic/PK/Exploratory) — keep it as its OWN form, distinct from routine Lab Assessments.');
  if (/physical measurement|anthropom/.test(n))
    g.push('Physical Measurements page: Height, Weight, BMI (calculated), Body Surface Area (calculated, if protocol-required). Do NOT include Blood Pressure/Pulse/Temperature here.');
  if (/vital sign/.test(n))
    g.push('Vital Signs is a REPEATABLE logline (repeatable=true) for pre-dose/post-dose/multiple timepoints — include a "Timepoint" field. Parameters: Blood Pressure, Pulse, Temperature, Respiratory Rate, Oxygen Saturation. Do NOT include Height/Weight/BMI (those live on Physical Measurements).');
  if (/\becg\b|electrocardiogram/.test(n))
    g.push('ECG page: "Was ECG performed?" (yes/no), Date, Time, Interpretation (Normal / Abnormal Clinically Significant / Abnormal Not Clinically Significant), an ECG upload (file), and an investigator signature. If the protocol requires triplicate/repeated ECGs, set repeatable=true.');
  if (/physical exam/.test(n))
    g.push('Physical Examination: each body system as Normal/Abnormal (or a checklist, per the CRF); end with "Were any clinically significant findings observed?" plus a findings/comments text field.');
  if (/imaging|\bct\b|\bmri\b|\bpet\b|\bscan\b/.test(n))
    g.push('Imaging Assessment: modality, date, anatomical region, and an imaging upload (file). Do NOT include tumor response here.');
  if (/tumou?r|recist|lugano|response/.test(n))
    g.push('Tumor Evaluation: response assessment (e.g. RECIST/Lugano). Do NOT duplicate imaging acquisition details.');
  if (/ecog|performance status/.test(n))
    g.push('ECOG Performance Status: the standard 0-5 ECOG scale (select/radio) plus an investigator signature.');
  if (/consent/.test(n))
    g.push('Consent: "Was informed consent obtained?", date obtained, Protocol Version, Informed Consent Version, a signed ICF upload (file), and the signature of the person obtaining consent. Add a section for each optional consent (research sample, genetic, biomarker, future research) when present.');
  if (/eligibility|inclusion|exclusion/.test(n))
    g.push('Eligibility Determination: ONE Yes/No/N/A field per criterion, using the EXACT protocol wording and numbering — never combine criteria.');
  if (/disposition|screen fail/.test(n))
    g.push('Disposition: Completed vs Screen Failure (+ reason), date, investigator signature.');
  if (/visit completion/.test(n))
    g.push('Visit Completion mirrors the CRF: continue to next visit? medical history reviewed? ongoing/new AEs? conmed changes? procedures performed? withdrawal? discontinuation criteria met? comments — each Yes carrying a conditional note to complete the related form (AE / Concomitant Medications / Consent Withdrawal).');
  if (/study drug|dosing|drug administration|treatment administration/.test(n))
    g.push('Study Drug Administration: all protocol-required administration details (drug, dose, route, date/time, lot/kit number, administered by, etc.); repeatable when multiple administrations occur.');
  if (/progress note/.test(n))
    g.push('Progress Notes & Uploads: a general upload (file) placeholder, a free-text progress-notes area, and a "Page completed by" field.');
  return g.length ? `\n\nSOURCE-DOCUMENT DESIGN FOR THIS FORM:\n- ${g.join('\n- ')}` : '';
}
