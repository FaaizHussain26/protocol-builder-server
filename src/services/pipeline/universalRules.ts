// Universal eSource rules ("Universal Rules across all the sites").
// Source of truth for the rule SET; the client mirror at
// src/utils/universalRules.ts MUST stay in sync (same ids & text).
//
// Every rule is a Yes/No directive whose default answer is "Yes". To keep the
// build prompt cheap, rules are SCOPED PER FORM: a given form's enrichment call
// only receives the rules for its matching group plus a one-line validation
// footer — never the full ~200-rule catalogue.

export interface UniversalRule {
  /** Stable id, prefixed "u-" so the prompt layer can dedupe vs. template questions. */
  id: string;
  /** Compact, affirmative directive (the "Yes" reading of the source question). */
  text: string;
  /** Default answer. "yes" enables the rule; "no" disables it. */
  answer: 'yes' | 'no';
}

export interface UniversalRuleGroup {
  /** Display/group label (also the TemplateQuestion group on the client). */
  group: string;
  /** Form-name matcher used to scope rules into the right enrichment call. */
  match: RegExp;
  rules: UniversalRule[];
}

const r = (id: string, text: string): UniversalRule => ({ id, text, answer: 'yes' });

export const UNIVERSAL_RULE_GROUPS: UniversalRuleGroup[] = [
  {
    group: 'Visit Forms',
    match: /visit|date of visit|schedule|disposition|early termination|end of study|eos/i,
    rules: [
      r('u-visit-1', 'Auto-populate visits, forms & procedures from the Schedule of Activities (SoA)'),
      r('u-visit-2', 'Support unscheduled visits using predefined types (not unlimited free-form)'),
      r('u-visit-3', 'Provide visit statuses: Planned, Scheduled, In Progress, Completed, Missed, Unscheduled, Early Termination'),
      r('u-visit-4', 'Visit completion auto-sets status to Completed'),
      r('u-visit-5', 'Require documentation before closing a Missed visit'),
      r('u-visit-6', 'Display the visit window to users'),
      r('u-visit-7', 'Alert when a visit occurs outside the allowed window'),
      r('u-visit-8', 'Auto-generate protocol deviations for out-of-window visits'),
      r('u-visit-9', "Auto-calculate the next visit's target date"),
      r('u-visit-10', 'Missed visits trigger follow-up notifications'),
      r('u-visit-11', 'Show all protocol-required assessments for the visit'),
      r('u-visit-12', 'Display optional assessments separately'),
      r('u-visit-13', 'Auto-hide assessments not applicable to the visit'),
      r('u-visit-14', 'Visit completion locks all completed forms'),
      r('u-visit-15', 'Unresolved data queries block visit completion'),
      r('u-visit-16', 'Investigator review mandatory before visit completion'),
      r('u-visit-17', 'Electronic signature required to complete the visit'),
      r('u-visit-18', 'Visit Form becomes read-only after electronic signature'),
      r('u-visit-19', 'Provide a dedicated Visit Notes section'),
      r('u-visit-20', 'Include visit-specific comments'),
      r('u-visit-21', 'Summarize abnormal findings, AEs & newly added con meds on the Visit Form'),
      r('u-visit-22', 'Identify missing required procedures before allowing completion'),
      r('u-visit-23', 'Generate a visit summary for investigator review before e-signature'),
      r('u-visit-24', 'If Missed, auto-mark all scheduled assessments as Not Performed'),
      r('u-visit-25', 'If Early Termination, auto-redirect to the Early Termination assessment form'),
      r('u-visit-26', 'If Unscheduled, show only the selected forms'),
      r('u-visit-27', 'If outside the protocol window, auto-redirect to a Protocol Deviation form'),
      r('u-visit-28', 'Warn on any blank source field before visit completion'),
    ],
  },
  {
    group: 'Medical History',
    match: /medical history|\bmh\b|surgical history/i,
    rules: [
      r('u-mh-1', 'Allow multiple medical history records'),
      r('u-mh-2', 'Categorize conditions (Cardiovascular, Respiratory, GI, Neurological, Endocrine, Psychiatric, Infectious Disease, Oncology, Other)'),
      r('u-mh-3', 'Show protocol-specific categories first'),
      r('u-mh-4', 'Allow custom condition categories'),
      r('u-mh-5', 'Diagnosis start/end date mandatory (DD-MM-YYYY); allow partial/unknown day & month'),
      r('u-mh-6', 'Record disease status (Ongoing, Resolved, Stable, Worsening, Unknown)'),
      r('u-mh-7', 'Auto-highlight clinically significant conditions'),
      r('u-mh-8', 'Clinically significant conditions trigger eligibility review'),
      r('u-mh-9', 'Auto-link clinically significant conditions to the referenced assessment'),
      r('u-mh-10', 'Link Medical History to Concomitant Medications'),
      r('u-mh-11', 'Link Medical History to Adverse Events'),
      r('u-mh-12', 'Link Medical History to Surgical History'),
      r('u-mh-13', 'Auto-populate relevant Physical Examination findings from Medical History'),
      r('u-mh-14', 'Warn on duplicate medical history entries'),
      r('u-mh-15', 'Flag diagnosis dates after the Screening Visit'),
      r('u-mh-16', 'Suggest conditions from uploaded medical records'),
      r('u-mh-17', 'Support document attachments (discharge summaries, specialist letters)'),
    ],
  },
  {
    group: 'Concomitant Medications',
    match: /concomitant|con\s?med|medication|\bcm\b/i,
    rules: [
      r('u-cm-1', 'Allow multiple concomitant medication records per subject'),
      r('u-cm-2', 'Select medication names from the WHO Drug Dictionary'),
      r('u-cm-3', 'Allow free-text entry when a medication is not in the dictionary'),
      r('u-cm-4', 'Show generic and brand names in a single field'),
      r('u-cm-5', 'Link indication to an existing Medical History condition'),
      r('u-cm-6', 'Classify route of administration (Oral, Topical, Subcutaneous, …)'),
      r('u-cm-7', 'Pre-classify dosage strengths, frequencies & units'),
      r('u-cm-8', 'Medication start/end date with Ongoing toggle mandatory (DD-MM-YYYY); allow partial/unknown'),
      r('u-cm-9', 'Alert on prohibited medications'),
      r('u-cm-10', 'Make protocol-specific medication restrictions configurable'),
      r('u-cm-11', 'Link medications to Medical History conditions'),
      r('u-cm-12', 'Link medications to Adverse Events'),
      r('u-cm-13', 'Show newly added medications in the Visit Summary'),
      r('u-cm-14', 'Dosage modifications create a new version (do not overwrite)'),
      r('u-cm-15', 'Import medications from EHR when available'),
      r('u-cm-16', 'List rescue medication separately in the con meds section'),
    ],
  },
  {
    group: 'Physical Examination',
    match: /physical exam|\bpe\b/i,
    rules: [
      r('u-pe-1', 'Allow multiple examination records during a visit'),
      r('u-pe-2', 'Display body systems individually'),
      r('u-pe-3', 'Include body systems: General Appearance, HEENT, Skin, Respiratory, Cardiovascular, GI, Genitourinary, Musculoskeletal, Neurological, Psychiatric, Lymphatic, Endocrine, Other'),
      r('u-pe-4', 'Hide body systems not required by the protocol'),
      r('u-pe-5', 'Allow customizing the body system list'),
      r('u-pe-6', 'Use Normal/Abnormal selection per body system'),
      r('u-pe-7', 'Auto-show a comments field for abnormal findings'),
      r('u-pe-8', 'Require mandatory comments for abnormal findings'),
      r('u-pe-9', 'Targeted exams allow only protocol-selected body systems'),
      r('u-pe-10', 'Require investigator review & e-signature on completion'),
      r('u-pe-11', 'Capture initials of the person performing & scribing the exam'),
      r('u-pe-12', 'Validate examination dates against visit dates'),
      r('u-pe-13', 'Abnormal clinically significant findings suggest an Adverse Event entry'),
      r('u-pe-14', 'Link abnormal findings to Medical History'),
      r('u-pe-15', 'Alert for protocol-required follow-up procedures from abnormal findings'),
      r('u-pe-16', 'Show protocol-specific exam instructions beside each body system'),
    ],
  },
  {
    group: 'Vital Signs',
    match: /vital sign|\bvs\b/i,
    rules: [
      r('u-vs-1', 'Allow multiple/triplicate Vital Signs during a single visit'),
      r('u-vs-2', 'Collect: Height, Weight, BMI, Temperature, Heart Rate, Respiratory Rate, Blood Pressure, SpO2, Waist Circumference, Hip Circumference, Other'),
      r('u-vs-3', 'Make measurement units configurable (mmHg BP, C/F temp, % SpO2)'),
      r('u-vs-4', 'Support automatic unit conversion (e.g. BMI)'),
      r('u-vs-5', 'Document measurement method (e.g. oral vs tympanic temperature)'),
      r('u-vs-6', 'Record body position (Sitting, Standing, Supine, …)'),
      r('u-vs-7', 'Collect fasting status'),
      r('u-vs-8', 'Display protocol-defined reference ranges'),
      r('u-vs-9', 'Alert on out-of-range values'),
      r('u-vs-10', 'Abnormal temperature suggests an Adverse Event review'),
      r('u-vs-11', 'Allow uploading supporting documentation'),
      r('u-vs-12', 'Capture initials of the person performing Vital Signs'),
    ],
  },
  {
    group: 'ECG',
    match: /ecg|electrocardiogram/i,
    rules: [
      r('u-ecg-1', 'Allow multiple ECG assessments during a single visit'),
      r('u-ecg-2', 'Record ECG type (e.g. 12-lead)'),
      r('u-ecg-3', 'Require ECG attachment (PDF/image)'),
      r('u-ecg-4', 'Capture parameters: Heart Rate, PR, QRS, QT, QTc, RR, Axis, Rhythm, Other'),
      r('u-ecg-5', 'Auto-calculate QTc when QT and RR are entered'),
      r('u-ecg-6', 'Support multiple QT correction formulas (Bazett, Fridericia)'),
      r('u-ecg-7', 'Use standardized interpretation (Normal; Abnormal NCS; Abnormal CS)'),
      r('u-ecg-8', 'Require mandatory comments for abnormal ECGs'),
      r('u-ecg-9', 'Require e-signature & comment for ECG interpretation'),
      r('u-ecg-10', 'Warn on protocol-defined QT/QTc limits'),
      r('u-ecg-11', 'Block completion when mandatory parameters are missing'),
      r('u-ecg-12', 'Validate ECG timing against study drug administration'),
      r('u-ecg-13', 'Abnormal clinically significant findings suggest an Adverse Event entry'),
      r('u-ecg-14', 'Trigger Protocol Deviation review if required ECG assessments were missed'),
    ],
  },
  {
    group: 'Adverse Events',
    match: /adverse event|\bae\b|\bsae\b/i,
    rules: [
      r('u-ae-1', 'Allow multiple Adverse Events per visit'),
      r('u-ae-2', 'Require a free-text event description'),
      r('u-ae-3', 'Date & time (24h) required; unknown date NOT allowed'),
      r('u-ae-4', 'Identify Adverse Events of Special Interest (AESIs) separately'),
      r('u-ae-5', 'Require severity grading (CTCAE/DAIDS)'),
      r('u-ae-6', 'Use standardized outcomes (Recovered, Recovering, Ongoing, Fatal, Unknown)'),
      r('u-ae-7', 'Relationship to Study Drug mandatory'),
      r('u-ae-8', 'Document action taken with Study Drug'),
      r('u-ae-9', 'Record additional treatment for the AE'),
      r('u-ae-10', 'Document hospitalization related to the AE'),
      r('u-ae-11', 'Link AEs to Study Drug Administration'),
      r('u-ae-12', 'Link AEs to Concomitant Medications'),
      r('u-ae-13', 'Link AEs to Medical History'),
      r('u-ae-14', 'Link AEs to Protocol Deviations'),
      r('u-ae-15', 'Investigator review & e-signature mandatory before AE completion'),
      r('u-ae-16', 'Follow-up visits auto-reopen unresolved AEs'),
      r('u-ae-17', 'Lab/ECG/PE abnormalities suggest Adverse Event creation'),
    ],
  },
  {
    group: 'Protocol Deviations',
    match: /protocol deviation|\bpd\b|deviation/i,
    rules: [
      r('u-pd-1', 'Allow multiple Protocol Deviations per subject & visit'),
      r('u-pd-2', 'Allow manual entry and automatic generation'),
      r('u-pd-3', 'Auto-link deviations to the corresponding visit'),
      r('u-pd-4', 'Use a predefined category list (Visit Window, Eligibility, Informed Consent, Study Drug, Lab Assessment, Safety Assessment, Procedure, Subject non-compliance, Site Error, Other)'),
      r('u-pd-5', 'Require deviation severity (Minor, Major, Critical)'),
      r('u-pd-6', 'Deviation date required with affected visit type documented'),
      r('u-pd-7', 'Assess subject safety impact'),
      r('u-pd-8', 'Require sponsor assessment'),
      r('u-pd-9', 'Investigator electronic review & signature required'),
      r('u-pd-10', 'Document corrective & preventive action (CAPA) in the required comments section'),
      r('u-pd-11', 'Major/Critical deviations notified to local IRB & sponsor within 24 hours'),
      r('u-pd-12', 'Auto-link deviations to Adverse Events when applicable'),
      r('u-pd-13', 'Auto-link deviations to Study Drug Administration'),
      r('u-pd-14', 'Auto-create a deviation for visits outside the protocol window'),
      r('u-pd-15', 'Missed mandatory assessments auto-generate a deviation draft'),
      r('u-pd-16', 'Dosing outside protocol limits auto-generates a deviation'),
      r('u-pd-17', 'Repeated deviations trigger alerts'),
    ],
  },
  {
    group: 'Visit Completion',
    match: /visit completion|completion checklist|disposition/i,
    rules: [
      r('u-vc-1', 'Lock completed Visit Completion forms after signature'),
      r('u-vc-2', 'Require all mandatory forms completed before Visit Completion'),
      r('u-vc-3', 'Display completion status of each form (MH, ConMed, PE, VS, ECG, Labs, Study Drug, Drug Compliance, PRO/ePRO, AE)'),
      r('u-vc-4', 'Exclude optional forms from completion validation'),
      r('u-vc-5', 'Display unresolved Adverse Events'),
      r('u-vc-6', 'Display unresolved Protocol Deviations'),
      r('u-vc-7', 'Require investigator e-signature with visit review validation'),
      r('u-vc-8', 'Auto-generate the next scheduled visit on completion'),
      r('u-vc-9', 'Carry forward ongoing Medical History conditions'),
      r('u-vc-10', 'Carry forward ongoing Concomitant Medications'),
      r('u-vc-11', 'Carry forward ongoing Adverse Events'),
      r('u-vc-12', 'Auto-notify the next study team member after completion'),
      r('u-vc-13', 'Generate subject progress notes (completed & remaining visits)'),
    ],
  },
  {
    group: 'Patient Questionnaire',
    match: /questionnaire|\bpro\b|epro|patient.reported/i,
    rules: [
      r('u-pro-1', 'Support both ePRO and Paper PRO'),
      r('u-pro-2', 'Allow multiple questionnaires per visit'),
      r('u-pro-3', 'Auto-assign questionnaires from the SoA by treatment arm'),
      r('u-pro-4', 'Define who completes it (Subject, Caregiver, Parent/Guardian, Site Staff, Investigator)'),
      r('u-pro-5', 'Show instructions before completion'),
      r('u-pro-6', 'Auto-score responses'),
      r('u-pro-7', 'Warn on inconsistent responses'),
      r('u-pro-8', 'Mandatory questionnaires block visit completion if incomplete'),
    ],
  },
  {
    group: 'Study Drug Administration',
    match: /study drug|dosing|administration|accountability|compliance|investigational product|\bip\b/i,
    rules: [
      r('u-sd-1', 'Allow multiple administration records within the same visit'),
      r('u-sd-2', 'Create separate records per dose'),
      r('u-sd-3', 'Auto-populate the Study Drug name from the protocol'),
      r('u-sd-4', 'Treatment arm determines the displayed study drug'),
      r('u-sd-5', 'Display the planned dose automatically'),
      r('u-sd-6', 'Auto-calculate dose (e.g. mg/kg)'),
      r('u-sd-7', 'Use a predefined route-of-administration list'),
      r('u-sd-8', 'Record administration site when applicable (e.g. left arm)'),
      r('u-sd-9', 'Capture administration start/end date & time'),
      r('u-sd-10', 'Allow dose reductions/interruptions'),
      r('u-sd-11', 'Require reason for a missed dose; alert when dose is above/below protocol'),
      r('u-sd-12', 'Dose modifications require investigator approval'),
      r('u-sd-13', 'Lock the administration form if eligibility is incomplete'),
      r('u-sd-14', 'Warn on protocol deviations affecting dosing'),
      r('u-sd-15', 'Link Study Drug Administration to Drug Accountability'),
      r('u-sd-16', 'Validate kit expiry before administration'),
      r('u-sd-17', 'Dose interruptions auto-create a Protocol Deviation (if protocol-defined)'),
      r('u-sd-18', 'Infusion reactions suggest an Adverse Event entry'),
      r('u-sd-19', 'Assess compliance at every visit'),
      r('u-sd-20', 'Support compliance methods (Pill/Bottle count, Device log, Infusion/Injection log, Subject diary, eDiary, Electronic monitoring, Investigator assessment, Other)'),
      r('u-sd-21', 'Allow manual entry or auto-calculation of compliance'),
      r('u-sd-22', 'Auto-calculate expected doses'),
      r('u-sd-23', 'Auto-calculate compliance percentage'),
      r('u-sd-24', 'Use standardized non-compliance reasons (Forgot dose, Subject refusal, Adverse Event, Lost medication, Other)'),
      r('u-sd-25', 'Document subject counseling/re-education'),
      r('u-sd-26', 'Alert on protocol-defined minimum compliance thresholds'),
    ],
  },
  {
    group: 'Female Participants',
    match: /pregnan|contracept|female|childbearing/i,
    rules: [
      r('u-fp-1', 'Capture the protocol-required pregnancy assessment'),
      r('u-fp-2', 'Flag whether pregnancy testing applies for this visit'),
      r('u-fp-3', 'Record pregnancy test type per protocol/visit (Urine, Serum, Both)'),
      r('u-fp-4', 'Capture whether contraception is required by protocol'),
      r('u-fp-5', 'Record contraceptive method (Abstinence, Oral, Implant, Injection, IUD, Condom, Vasectomy partner, Double barrier, Other)'),
      r('u-fp-6', 'Confirm contraception is compliant with protocol'),
      r('u-fp-7', 'Record the contraception start date'),
      r('u-fp-8', 'Pregnancy result cannot be blank when testing is required'),
      r('u-fp-9', 'Positive pregnancy result auto-generates a Pregnancy Follow-up form'),
      r('u-fp-10', 'Require a repeat test when the initial result is invalid'),
      r('u-fp-11', 'Hide pregnancy fields for male participants unless partner-pregnancy reporting applies'),
    ],
  },
  {
    group: 'Demographics',
    match: /demographic|\bdm\b|randomization/i,
    rules: [
      r('u-dm-1', 'Import the Randomization Number from IVRS/IWRS'),
      r('u-dm-2', 'Auto-calculate age'),
      r('u-dm-3', 'Alert on protocol minimum/maximum age limits'),
      r('u-dm-4', 'Show pregnancy/breastfeeding fields only when applicable'),
    ],
  },
  {
    group: 'Informed Consent',
    match: /informed consent|\bicf\b|consent/i,
    rules: [
      r('u-icf-1', 'Prevent screening until consent is complete'),
      r('u-icf-2', 'Prevent study procedures before the consent date/time'),
      r('u-icf-3', 'Validate that the consent version is current'),
      r('u-icf-4', 'Ensure all required signatures are present'),
      r('u-icf-5', 'Auto-populate re-consent after protocol amendments'),
      r('u-icf-6', 'Require upload of the signed ICF'),
      r('u-icf-7', 'Require confirmation the participant received a copy'),
      r('u-icf-8', 'On an amendment requiring re-consent, generate a new re-consent form linked to the prior consent'),
      r('u-icf-9', 'If consent is not obtained, block all subsequent study forms until valid consent is recorded'),
    ],
  },
];

// Fixed, always-on defaults (the "Universal Validation Rules" in the document).
// Rendered as a compact one-liner footer on every form.
export const UNIVERSAL_VALIDATION_RULES: UniversalRule[] = [
  r('u-val-1', 'Required fields marked with *'),
  r('u-val-2', 'No future dates unless the protocol permits'),
  r('u-val-3', 'End Date cannot precede Start Date'),
  r('u-val-4', '24-hour time format'),
  r('u-val-5', 'Auto-save every 30 seconds'),
  r('u-val-6', 'Audit trail enabled; every edit captured'),
  r('u-val-7', 'CFR Part 11 compliant electronic signatures'),
  r('u-val-8', 'Investigator signature timestamped'),
  r('u-val-9', 'User initials captured'),
  r('u-val-10', 'Query history retained'),
  r('u-val-11', 'Soft delete only'),
  r('u-val-12', 'Version history maintained'),
  r('u-val-13', 'Read-only after signature'),
  r('u-val-14', 'Store date/time in UTC; display per-site timezone'),
  r('u-val-15', 'Auto-calculate Age, BMI, QTc, Compliance %'),
  r('u-val-16', 'Duplicate detection'),
];

// Render a group of rules compactly: affirmative directives joined by "; ",
// with only the disabled ones explicitly marked "— No" to save tokens.
function renderRules(rules: UniversalRule[]): string {
  return rules.map((x) => (x.answer === 'no' ? `${x.text} — No` : x.text)).join('; ');
}

const VALIDATION_FOOTER = `Universal validation (always apply): ${renderRules(UNIVERSAL_VALIDATION_RULES)}.`;

// Per-form rule block for the enrichment phase — only the groups whose matcher
// hits this form name, plus the universal validation footer. Keeps each
// enrichment call lean instead of shipping the whole catalogue.
export function universalRulesFor(formName: string): string {
  const name = formName || '';
  const matched = UNIVERSAL_RULE_GROUPS.filter((g) => g.match.test(name));
  const lines = matched.map((g) => `[${g.group}] ${renderRules(g.rules)}.`);
  lines.push(VALIDATION_FOOTER);
  return (
    '\n\nUNIVERSAL eSOURCE RULES (apply these as standard Yes/enabled defaults when designing this form; ' +
    'only items marked "— No" are disabled):\n' +
    lines.join('\n')
  );
}

// Structural rules for the skeleton phase (visit schedule & form set).
export function universalSkeletonRules(): string {
  const structural = UNIVERSAL_RULE_GROUPS.filter((g) => g.group === 'Visit Forms' || g.group === 'Visit Completion');
  const lines = structural.map((g) => `[${g.group}] ${renderRules(g.rules)}.`);
  return (
    '\n\nUNIVERSAL eSOURCE RULES (apply as standard Yes/enabled defaults across the schedule):\n' +
    lines.join('\n')
  );
}
