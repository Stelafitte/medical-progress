/**
 * Programme de DÉMONSTRATION du module DPC générique : « DPC HVG–Amylose ».
 *
 * Les contenus (29 critères d'audit, 5 QCM, 3 séquences, bibliographie) sont
 * repris du dossier pédagogique fourni. Aucune donnée patient : les dossiers
 * audités sont désignés par des références anonymes locales (D1 à D10).
 * Tout est mocké : aucune écriture, aucun fichier, aucun appel IA.
 */
import type {
  DpcAnswer,
  DpcAuditEntry,
  DpcAuditGrid,
  DpcAuditRecord,
  DpcCriterion,
  DpcProgrammeSetup,
  DpcQuizQuestion,
  DpcRound,
  DpcSequence,
  DpcTest,
  DpcTestAttempt,
  DpcAttendance,
} from "@/domain/dpc";
import type { TeachingSession } from "@/domain/clinicalAudit";
import type {
  Cohort,
  CurriculumVersion,
  Enrollment,
  Outcome,
  Person,
  Program,
  Provenance,
  RoleAssignment,
} from "@/domain/types";

const native: Provenance = { sourceSystem: "native" };
const base = { createdAt: "2026-01-12T08:00:00Z", provenance: native };

export const DPC_HVG_PROGRAM_ID = "prog-dpc-hvg";
export const DPC_HVG_COHORT_ID = "coh-dpc-hvg-2026";
export const DPC_HVG_GRID_ID = "dpc-hvg-grid-v1";

/* ------------------------------------------------------------------ */
/* Programme, promotion, personnes                                    */
/* ------------------------------------------------------------------ */

export const dpcHvgProgram: Program = {
  ...base,
  id: DPC_HVG_PROGRAM_ID,
  code: "DPC-HVG",
  name: "DPC HVG–Amylose",
  kind: "dpc",
  institution: "Organisme de DPC (démonstration)",
  annualLearnerEstimate: 120,
  config: {
    placementsEnabled: false,
    simulationEnabled: false,
    realCompetenceRequiresValidator: true,
    targetMastery: "intermediate",
    // Modules optionnels : le DPC est une CONFIGURATION, pas une application.
    dpcEnabled: true,
    auditsEnabled: true,
    prePostTestsEnabled: true,
    sessionsEnabled: true,
    locale: "fr-FR",
  },
};

export const dpcHvgCurriculumVersion: CurriculumVersion = {
  ...base,
  id: "cv-dpc-hvg-2026",
  programId: DPC_HVG_PROGRAM_ID,
  label: "Programme intégré 2026 — audit 1, formation 3 h, audit 2",
  effectiveFrom: "2026-04-01T00:00:00Z",
  status: "active",
};

export const dpcHvgCohort: Cohort = {
  ...base,
  id: DPC_HVG_COHORT_ID,
  programId: DPC_HVG_PROGRAM_ID,
  curriculumVersionId: "cv-dpc-hvg-2026",
  label: "Session HVG–Amylose — juin 2026",
  academicYear: "2026",
  startsOn: "2026-05-15T00:00:00Z",
  endsOn: "2026-09-30T00:00:00Z",
  learnerCount: 18,
};

export const dpcHvgPeople: readonly Person[] = [
  {
    ...base,
    id: "per-dpc-hvg-learner",
    fullName: "Dr Nadia Berthier",
    email: "nadia.demo@example.org",
  },
  {
    ...base,
    id: "per-dpc-hvg-learner-2",
    fullName: "Dr Marc Delaunay",
    email: "marc.demo@example.org",
  },
  {
    ...base,
    id: "per-dpc-hvg-expert",
    fullName: "Pr Hélène Fabre",
    email: "helene.demo@example.org",
  },
  {
    ...base,
    id: "per-dpc-hvg-admin",
    fullName: "Coordination DPC",
    email: "coordination.demo@example.org",
  },
];

export const dpcHvgEnrollments: readonly Enrollment[] = [
  {
    ...base,
    id: "enr-dpc-hvg-1",
    personId: "per-dpc-hvg-learner",
    programId: DPC_HVG_PROGRAM_ID,
    cohortId: DPC_HVG_COHORT_ID,
    status: "active",
  },
  {
    ...base,
    id: "enr-dpc-hvg-2",
    personId: "per-dpc-hvg-learner-2",
    programId: DPC_HVG_PROGRAM_ID,
    cohortId: DPC_HVG_COHORT_ID,
    status: "active",
  },
  {
    ...base,
    id: "enr-dpc-hvg-3",
    personId: "per-learner",
    programId: DPC_HVG_PROGRAM_ID,
    cohortId: DPC_HVG_COHORT_ID,
    status: "active",
  },
];

export const dpcHvgRoleAssignments: readonly RoleAssignment[] = [
  {
    personId: "per-dpc-hvg-learner",
    role: "learner",
    scope: { kind: "cohort", programId: DPC_HVG_PROGRAM_ID, cohortId: DPC_HVG_COHORT_ID },
    grantedAt: "2026-05-15T00:00:00Z",
    provenance: native,
  },
  {
    personId: "per-dpc-hvg-learner-2",
    role: "learner",
    scope: { kind: "cohort", programId: DPC_HVG_PROGRAM_ID, cohortId: DPC_HVG_COHORT_ID },
    grantedAt: "2026-05-15T00:00:00Z",
    provenance: native,
  },
  {
    personId: "per-learner",
    role: "learner",
    scope: { kind: "cohort", programId: DPC_HVG_PROGRAM_ID, cohortId: DPC_HVG_COHORT_ID },
    grantedAt: "2026-05-15T00:00:00Z",
    provenance: native,
  },
  {
    personId: "per-dpc-hvg-expert",
    role: "teacher",
    scope: { kind: "program", programId: DPC_HVG_PROGRAM_ID },
    grantedAt: "2026-01-12T00:00:00Z",
    provenance: native,
  },
  {
    personId: "per-dpc-hvg-admin",
    role: "administrator",
    scope: { kind: "program", programId: DPC_HVG_PROGRAM_ID },
    grantedAt: "2026-01-12T00:00:00Z",
    provenance: native,
  },
  {
    personId: "per-admin",
    role: "administrator",
    scope: { kind: "program", programId: DPC_HVG_PROGRAM_ID },
    grantedAt: "2026-01-12T00:00:00Z",
    provenance: native,
  },
];

export const dpcHvgOutcomes: readonly Outcome[] = [
  {
    ...base,
    id: "out-dpc-hvg-qualification",
    programId: DPC_HVG_PROGRAM_ID,
    curriculumVersionId: "cv-dpc-hvg-2026",
    code: "HVG-1",
    label: "Qualifier une hypertrophie ventriculaire gauche à l'échocardiographie",
    description:
      "Mesurer, caractériser et documenter l'HVG, la fonction systolique et diastolique, le strain et l'ECG associé.",
    nature: "knowledge",
    domain: "Imagerie et qualification",
    targetMastery: "proficient",
    retainedAt: "2026-01-12T08:00:00Z",
  },
  {
    ...base,
    id: "out-dpc-hvg-causes",
    programId: DPC_HVG_PROGRAM_ID,
    curriculumVersionId: "cv-dpc-hvg-2026",
    code: "HVG-2",
    label: "Rechercher les causes fréquentes ou visibles d'HVG",
    description:
      "Explorer l'HTA, la valvulopathie aortique, la CMH sarcomérique, les antécédents familiaux et les comorbidités.",
    nature: "knowledge",
    domain: "Démarche étiologique",
    targetMastery: "proficient",
    retainedAt: "2026-01-12T08:00:00Z",
  },
  {
    ...base,
    id: "out-dpc-hvg-amylose",
    programId: DPC_HVG_PROGRAM_ID,
    curriculumVersionId: "cv-dpc-hvg-2026",
    code: "HVG-3",
    label: "Conduire la démarche diagnostique d'une amylose cardiaque",
    description:
      "Évoquer l'amylose devant une HVG inexpliquée, éliminer une amylose AL, interpréter la scintigraphie osseuse.",
    nature: "knowledge",
    domain: "Diagnostic de l'amylose",
    targetMastery: "proficient",
    retainedAt: "2026-01-12T08:00:00Z",
  },
  {
    ...base,
    id: "out-dpc-hvg-pratique",
    programId: DPC_HVG_PROGRAM_ID,
    curriculumVersionId: "cv-dpc-hvg-2026",
    code: "HVG-4",
    label: "Améliorer sa pratique documentée devant une HVG",
    description:
      "Démontrer, par deux tours d'audit sur ses propres dossiers, une amélioration de la conformité de la démarche.",
    nature: "real_competence",
    domain: "Amélioration des pratiques",
    targetMastery: "intermediate",
    retainedAt: "2026-01-12T08:00:00Z",
  },
];

/* ------------------------------------------------------------------ */
/* Grille d'audit — 29 critères, 4 parties                            */
/* ------------------------------------------------------------------ */

let counter = 0;
const crit = (label: string, outcomeId: string, helpText?: string): DpcCriterion => {
  counter += 1;
  return {
    id: `hvg-c${counter}`,
    number: counter,
    label,
    outcomeId,
    ...(helpText ? { helpText } : {}),
  };
};

const part1: readonly DpcCriterion[] = [
  crit(
    "L'épaisseur pariétale maximale du ventricule gauche a-t-elle été mesurée et renseignée dans le compte rendu d'échocardiographie ?",
    "out-dpc-hvg-qualification",
  ),
  crit(
    "Le caractère de l'HVG a-t-il été précisé dans le compte rendu : concentrique, asymétrique, septale, apicale ou diffuse ?",
    "out-dpc-hvg-qualification",
  ),
  crit(
    "La masse ventriculaire gauche, indexée ou non indexée, a-t-elle été renseignée ?",
    "out-dpc-hvg-qualification",
  ),
  crit(
    "La fraction d'éjection du ventricule gauche a-t-elle été mesurée et renseignée ?",
    "out-dpc-hvg-qualification",
  ),
  crit(
    "La fonction diastolique ou les pressions de remplissage du ventricule gauche ont-elles été évaluées ?",
    "out-dpc-hvg-qualification",
  ),
  crit(
    "Des signes échocardiographiques associés pouvant orienter vers une cardiopathie infiltrative ont-ils été recherchés : épaississement valvulaire, dilatation bi-atriale, épaississement du septum interauriculaire, épanchement péricardique ou aspect myocardique évocateur ?",
    "out-dpc-hvg-qualification",
  ),
  crit(
    "Le strain longitudinal global a-t-il été obtenu ?",
    "out-dpc-hvg-qualification",
    "N/A si le strain n'est pas disponible sur l'appareil utilisé.",
  ),
  crit(
    "Un ECG a-t-il été réalisé ou analysé en parallèle de l'échocardiographie ?",
    "out-dpc-hvg-qualification",
  ),
  crit(
    "Une discordance entre l'HVG échocardiographique et l'absence d'HVG électrique ou la présence d'un bas voltage à l'ECG a-t-elle été recherchée ?",
    "out-dpc-hvg-qualification",
  ),
  crit(
    "Des examens complémentaires ont-ils été demandés ou discutés devant cette HVG ?",
    "out-dpc-hvg-qualification",
  ),
];

const part2: readonly DpcCriterion[] = [
  crit(
    "L'existence d'une hypertension artérielle ancienne, sévère ou insuffisamment contrôlée a-t-elle été recherchée dans le dossier ?",
    "out-dpc-hvg-causes",
  ),
  crit(
    "Les chiffres tensionnels récents ou l'historique tensionnel ont-ils été pris en compte pour interpréter l'HVG ?",
    "out-dpc-hvg-causes",
  ),
  crit(
    "Une valvulopathie aortique, notamment un rétrécissement aortique significatif, a-t-elle été recherchée et quantifiée ?",
    "out-dpc-hvg-causes",
  ),
  crit(
    "Une cardiomyopathie hypertrophique sarcomérique a-t-elle été discutée en cas d'HVG asymétrique, familiale, sévère ou inexpliquée ?",
    "out-dpc-hvg-causes",
  ),
  crit(
    "Un antécédent familial de cardiomyopathie, de mort subite, d'insuffisance cardiaque inexpliquée ou de neuropathie familiale a-t-il été recherché ?",
    "out-dpc-hvg-causes",
  ),
  crit(
    "Une maladie rénale chronique ou une autre pathologie générale pouvant participer à l'HVG a-t-elle été prise en compte ?",
    "out-dpc-hvg-causes",
  ),
  crit(
    "En l'absence de cause évidente, le caractère inexpliqué ou disproportionné de l'HVG a-t-il été explicitement mentionné dans le dossier ?",
    "out-dpc-hvg-causes",
  ),
];

const part3: readonly DpcCriterion[] = [
  crit(
    "L'hypothèse d'une amylose cardiaque a-t-elle été évoquée devant une HVG inexpliquée, atypique ou disproportionnée ?",
    "out-dpc-hvg-amylose",
  ),
  crit(
    "Des signes d'alerte extracardiaques compatibles avec une amylose ont-ils été recherchés : canal carpien bilatéral, canal lombaire étroit, rupture du tendon bicipital, neuropathie périphérique ou dysautonomie ?",
    "out-dpc-hvg-amylose",
  ),
  crit(
    "Des signes cardiologiques évocateurs d'amylose ont-ils été recherchés : insuffisance cardiaque à FEVG préservée, troubles conductifs, fibrillation atriale, élévation disproportionnée du NT-proBNP ou de la troponine ?",
    "out-dpc-hvg-amylose",
  ),
  crit(
    "Un bilan biologique visant à éliminer une amylose AL a-t-il été prescrit ou vérifié : chaînes légères libres sériques, immunofixation sérique et urinaire ?",
    "out-dpc-hvg-amylose",
  ),
  crit(
    "Une scintigraphie osseuse aux traceurs diphosphonates a-t-elle été prescrite ou discutée en cas de suspicion d'amylose ATTR ?",
    "out-dpc-hvg-amylose",
  ),
  crit(
    "L'interprétation de la scintigraphie osseuse a-t-elle été conditionnée à l'absence d'argument biologique pour une amylose AL ?",
    "out-dpc-hvg-amylose",
  ),
  crit(
    "Une IRM cardiaque a-t-elle été utilisée ou demandée pour rechercher des arguments en faveur d'une cardiopathie infiltrative lorsque le contexte le justifiait ?",
    "out-dpc-hvg-amylose",
  ),
  crit(
    "En cas de gammapathie monoclonale ou de suspicion d'amylose AL, une orientation hématologique ou vers un centre expert a-t-elle été organisée ou discutée ?",
    "out-dpc-hvg-amylose",
    "N/A en l'absence de gammapathie monoclonale.",
  ),
  crit(
    "En cas d'amylose ATTR suspectée ou confirmée, le typage ATTR sauvage versus ATTR héréditaire a-t-il été envisagé ?",
    "out-dpc-hvg-amylose",
    "N/A si aucune amylose ATTR n'est suspectée.",
  ),
  crit(
    "Une analyse génétique du gène TTR a-t-elle été prescrite ou organisée en cas d'amylose ATTR confirmée ?",
    "out-dpc-hvg-amylose",
    "N/A si l'amylose ATTR n'est pas confirmée.",
  ),
];

const part4: readonly DpcCriterion[] = [
  crit(
    "En cas de suspicion d'amylose AL, une prise en charge spécialisée rapide a-t-elle été organisée ?",
    "out-dpc-hvg-pratique",
    "N/A en l'absence de suspicion d'amylose AL.",
  ),
  crit(
    "En cas d'amylose ATTR confirmée, l'éligibilité à un traitement spécifique a-t-elle été discutée ?",
    "out-dpc-hvg-pratique",
    "N/A si l'amylose ATTR n'est pas confirmée.",
  ),
];

export const dpcHvgGrid: DpcAuditGrid = {
  id: DPC_HVG_GRID_ID,
  programId: DPC_HVG_PROGRAM_ID,
  title: "Audit clinique — HVG à l'échocardiographie",
  description:
    "29 critères appliqués à 10 dossiers anonymes, avant puis après la formation. La même grille est utilisée aux deux tours afin de permettre la comparaison individuelle.",
  version: "v1.0",
  status: "published",
  recordsPerRound: 10,
  targetConformityPercent: 80,
  expectedProgressPoints: 15,
  publishedAt: "2026-04-02T09:00:00Z",
  provenance: native,
  sections: [
    {
      id: "hvg-p1",
      label: "Partie 1 — Qualification de l'HVG à l'échocardiographie",
      criteria: part1,
    },
    {
      id: "hvg-p2",
      label: "Partie 2 — Recherche des causes fréquentes ou visibles d'HVG",
      criteria: part2,
    },
    {
      id: "hvg-p3",
      label:
        "Partie 3 — Démarche diagnostique complémentaire devant une HVG inexpliquée ou atypique",
      criteria: part3,
    },
    {
      id: "hvg-p4",
      label: "Partie 4 — Orientation thérapeutique et suivi du patient",
      criteria: part4,
    },
  ],
};

/** Version 2027 en préparation : jamais ouverte tant qu'une campagne utilise v1.0. */
const { publishedAt: _publishedV1, ...gridWithoutPublication } = dpcHvgGrid;

export const dpcHvgGridDraft: DpcAuditGrid = {
  ...gridWithoutPublication,
  id: "dpc-hvg-grid-v2",
  version: "v2.0 (brouillon)",
  status: "draft",
  description:
    "Révision en cours : reformulation des critères 22 à 27 après retour des experts. Non ouverte aux participants.",
};

/* ------------------------------------------------------------------ */
/* Tours d'audit et saisies de démonstration                          */
/* ------------------------------------------------------------------ */

export const dpcHvgRounds: readonly DpcRound[] = [
  {
    id: "dpc-hvg-round-t0",
    gridId: DPC_HVG_GRID_ID,
    programId: DPC_HVG_PROGRAM_ID,
    cohortId: DPC_HVG_COHORT_ID,
    phase: "t0",
    label: "Audit clinique 1 — 10 dossiers avant formation",
    window: "J-30 à J0",
    opensOn: "2026-05-15T00:00:00Z",
    closesOn: "2026-06-14T00:00:00Z",
    status: "closed",
  },
  {
    id: "dpc-hvg-round-t1",
    gridId: DPC_HVG_GRID_ID,
    programId: DPC_HVG_PROGRAM_ID,
    cohortId: DPC_HVG_COHORT_ID,
    phase: "t1",
    label: "Audit clinique 2 — 10 nouveaux dossiers après formation",
    window: "J+90",
    opensOn: "2026-09-13T00:00:00Z",
    closesOn: "2026-10-13T00:00:00Z",
    status: "open",
  },
];

const allCriteria = [...part1, ...part2, ...part3, ...part4];

/**
 * Construit un dossier audité : les numéros listés sont conformes (Oui),
 * les numéros `na` sont non applicables, le reste est Non.
 */
const mkRecord = (
  ref: string,
  conform: readonly number[],
  na: readonly number[] = [],
): DpcAuditRecord => {
  const answers: Record<string, DpcAnswer> = {};
  for (const criterion of allCriteria) {
    answers[criterion.id] = na.includes(criterion.number)
      ? "na"
      : conform.includes(criterion.number)
        ? "yes"
        : "no";
  }
  return { ref, answers };
};

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Audit 1 : qualification correcte, démarche amylose très incomplète. */
const t0Records: readonly DpcAuditRecord[] = [
  mkRecord("D1", [1, 2, 3, 4, 5, 8, 10, 11, 12, 13, 16], [7, 25, 26, 27, 28, 29]),
  mkRecord("D2", [1, 2, 4, 5, 8, 11, 12, 13, 17], [7, 26, 27, 28, 29]),
  mkRecord("D3", [1, 2, 3, 4, 8, 10, 11, 12, 14, 15], [25, 27, 28, 29]),
  mkRecord("D4", [1, 4, 5, 8, 11, 12, 16, 18], [7, 25, 26, 27, 29]),
  mkRecord("D5", [1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 18, 20], [25, 27, 29]),
  mkRecord("D6", [1, 2, 4, 8, 11, 12, 16], [7, 25, 26, 27, 28, 29]),
  mkRecord("D7", [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 17, 18, 21], [26, 27, 29]),
  mkRecord("D8", [1, 4, 8, 11, 13, 16], [7, 25, 26, 27, 28, 29]),
  mkRecord("D9", [1, 2, 4, 5, 8, 10, 11, 12, 14, 15, 17], [7, 25, 27, 28, 29]),
  mkRecord("D10", [1, 2, 3, 4, 5, 8, 11, 12, 13, 16, 18, 19], [26, 27, 28, 29]),
];

/** Audit 2 : démarche structurée, red flags et bilan AL désormais systématiques. */
const t1Records: readonly DpcAuditRecord[] = [
  mkRecord("D1", [...range(1, 6), ...range(8, 24)], [7, 25, 26, 27, 28, 29]),
  mkRecord("D2", [...range(1, 6), ...range(8, 23)], [7, 25, 26, 27, 28, 29]),
  mkRecord("D3", [...range(1, 24)], [25, 27, 28, 29]),
  mkRecord("D4", [...range(1, 6), ...range(8, 22), 24], [7, 25, 26, 27, 28, 29]),
  mkRecord("D5", [...range(1, 24), 26], [25, 27, 29]),
  mkRecord("D6", [...range(1, 6), ...range(8, 21), 24], [7, 25, 26, 27, 28, 29]),
  mkRecord("D7", [...range(1, 24), 26, 28], [27, 29]),
  mkRecord("D8", [...range(1, 6), ...range(8, 23)], [7, 25, 26, 27, 28, 29]),
  mkRecord("D9", [...range(1, 6), ...range(8, 24)], [7, 25, 27, 28, 29]),
  mkRecord("D10", [...range(1, 24), 26, 27], [25, 28, 29]),
];

export const dpcHvgEntries: readonly DpcAuditEntry[] = [
  {
    id: "dpc-hvg-entry-t0-1",
    roundId: "dpc-hvg-round-t0",
    enrollmentId: "enr-dpc-hvg-1",
    status: "submitted",
    channel: "online",
    records: t0Records,
    submittedAt: "2026-06-10T18:20:00Z",
  },
  {
    // Saisie en cours : démontre la reprise et les relances.
    id: "dpc-hvg-entry-t1-1",
    roundId: "dpc-hvg-round-t1",
    enrollmentId: "enr-dpc-hvg-1",
    status: "in_progress",
    channel: "online",
    records: t1Records.slice(0, 4),
  },
  {
    id: "dpc-hvg-entry-t0-2",
    roundId: "dpc-hvg-round-t0",
    enrollmentId: "enr-dpc-hvg-2",
    status: "submitted",
    channel: "paper_transcribed",
    records: t0Records.slice(0, 10),
    submittedAt: "2026-06-12T09:05:00Z",
  },
  {
    // Parcours complet : comparaison, conclusion et attestation disponibles.
    id: "dpc-hvg-entry-t1-2",
    roundId: "dpc-hvg-round-t1",
    enrollmentId: "enr-dpc-hvg-2",
    status: "submitted",
    channel: "online",
    records: t1Records,
    submittedAt: "2026-09-28T20:40:00Z",
  },
  {
    id: "dpc-hvg-entry-t0-3",
    roundId: "dpc-hvg-round-t0",
    enrollmentId: "enr-dpc-hvg-3",
    status: "submitted",
    channel: "online",
    records: t0Records,
    submittedAt: "2026-06-13T07:30:00Z",
  },
];

/* ------------------------------------------------------------------ */
/* Formation : séquences, cas cliniques, séances                      */
/* ------------------------------------------------------------------ */

export const dpcHvgSequences: readonly DpcSequence[] = [
  {
    id: "dpc-hvg-seq-1",
    order: 1,
    title: "Quand penser à une amylose cardiaque ? Les red flags à ne jamais manquer",
    durationMinutes: 60,
    summary:
      "Situations cliniques devant faire évoquer une amylose cardiaque, signes d'alerte cardiaques et extracardiaques, pièges diagnostiques les plus fréquents.",
    objectives: [
      "Reconnaître les principaux signes d'alerte et les situations cliniques évocatrices.",
      "Identifier les patients devant bénéficier d'un bilan spécifique.",
      "Ne pas attribuer trop rapidement une HVG à l'âge ou à l'hypertension artérielle.",
    ],
    clinicalCase:
      "Homme de 79 ans adressé pour dyspnée d'effort progressive, FEVG préservée et HVG concentrique à l'échocardiographie. L'ECG montre des voltages peu marqués par rapport à l'épaisseur pariétale, et l'interrogatoire retrouve un antécédent de syndrome du canal carpien bilatéral opéré.",
    caseQuestions: [
      "Quels red flags identifiez-vous dans cette observation ?",
      "L'hypothèse d'amylose est-elle pertinente à ce stade ?",
      "Quels diagnostics différentiels envisagez-vous devant cette HVG ?",
    ],
    mediaIds: ["med-dpc-hvg-seq1"],
  },
  {
    id: "dpc-hvg-seq-2",
    order: 2,
    title: "Le parcours diagnostique moderne : de la suspicion à la certitude",
    durationMinutes: 60,
    summary:
      "Algorithme diagnostique actuel : échocardiographie, strain, IRM, scintigraphie osseuse, biologie et génétique, et critères du diagnostic non invasif d'amylose ATTR.",
    objectives: [
      "Maîtriser la démarche diagnostique devant une HVG, de la caractérisation à l'hypothèse étiologique.",
      "Connaître les performances, indications et limites de chaque modalité.",
      "Éliminer en priorité une amylose AL avant d'interpréter une scintigraphie.",
    ],
    clinicalCase:
      "Femme de 76 ans présentant une HVG inexpliquée, une insuffisance cardiaque à FEVG préservée et une élévation du NT-proBNP disproportionnée. L'échocardiographie montre une HVG concentrique avec altération du strain longitudinal global, et l'IRM cardiaque retrouve des arguments en faveur d'une cardiopathie infiltrative.",
    caseQuestions: [
      "Dans quel ordre demandez-vous les examens ?",
      "Comment éliminez-vous prioritairement une amylose AL ?",
      "Quelles conditions permettent de retenir un diagnostic non invasif d'ATTR ?",
    ],
    mediaIds: ["med-dpc-hvg-seq2"],
  },
  {
    id: "dpc-hvg-seq-3",
    order: 3,
    title: "Les traitements qui changent le pronostic : qui traiter, quand et comment ?",
    durationMinutes: 60,
    summary:
      "Traitements spécifiques de l'amylose ATTR et AL, indications, modalités de suivi et organisation du parcours de soins avec les centres experts.",
    objectives: [
      "Différencier ATTR et AL et comprendre leurs implications thérapeutiques.",
      "Identifier les indications des traitements spécifiques actuels.",
      "Optimiser le parcours de soins et le suivi multidisciplinaire.",
    ],
    clinicalCase:
      "Homme de 82 ans, amylose cardiaque ATTR confirmée par scintigraphie osseuse de grade 3, sans protéine monoclonale, test génétique TTR en cours. Dyspnée NYHA II-III, HVG, FEVG préservée, NT-proBNP élevé et plusieurs décompensations récentes.",
    caseQuestions: [
      "Le patient est-il éligible à un traitement spécifique et à quel moment l'introduire ?",
      "Quels critères de suivi clinique, biologique et échocardiographique retenez-vous ?",
      "Quelle est la place du conseil génétique en cas de forme héréditaire ?",
    ],
    mediaIds: ["med-dpc-hvg-seq3"],
  },
];

export const dpcHvgSessions: readonly TeachingSession[] = [
  {
    id: "dpc-hvg-session-j",
    programId: DPC_HVG_PROGRAM_ID,
    cohortId: DPC_HVG_COHORT_ID,
    title: "Formation présentielle — HVG et amylose cardiaque (3 heures)",
    modality: "in_person",
    startsAt: "2026-06-15T13:30:00Z",
    durationMinutes: 180,
    attendanceRequired: true,
    attendance: [
      { enrollmentId: "enr-dpc-hvg-1", present: true },
      { enrollmentId: "enr-dpc-hvg-2", present: true },
      { enrollmentId: "enr-dpc-hvg-3", present: false },
    ],
  },
];

export const dpcHvgAttendance: readonly DpcAttendance[] = [
  {
    sessionId: "dpc-hvg-session-j",
    enrollmentId: "enr-dpc-hvg-1",
    present: true,
    signedAt: "2026-06-15T13:35:00Z",
  },
  {
    sessionId: "dpc-hvg-session-j",
    enrollmentId: "enr-dpc-hvg-2",
    present: true,
    signedAt: "2026-06-15T13:32:00Z",
  },
  { sessionId: "dpc-hvg-session-j", enrollmentId: "enr-dpc-hvg-3", present: false },
];

/* ------------------------------------------------------------------ */
/* Pré-test et post-test (même série de 5 QCM)                        */
/* ------------------------------------------------------------------ */

export const dpcHvgQuestions: readonly DpcQuizQuestion[] = [
  {
    id: "dpc-hvg-q1",
    number: 1,
    theme: "Quand faut-il suspecter une amylose cardiaque ?",
    prompt:
      "Chez quel patient la suspicion d'amylose cardiaque doit-elle être particulièrement évoquée ?",
    options: [
      {
        key: "A",
        label:
          "Homme de 78 ans avec insuffisance cardiaque à FEVG préservée, HVG, syndrome du canal carpien ancien et bas voltage à l'ECG.",
      },
      {
        key: "B",
        label: "Femme de 45 ans présentant une HTA mal contrôlée avec HVG concentrique.",
      },
      { key: "C", label: "Homme de 55 ans avec infarctus du myocarde ancien et FEVG à 30 %." },
      { key: "D", label: "Patient de 30 ans présentant une myocardite aiguë." },
    ],
    correctKey: "A",
    explanation:
      "À retenir : l'association HVG inexpliquée, discordance ECG/échographie, âge avancé, syndrome du canal carpien et insuffisance cardiaque à FEVG préservée doit faire évoquer une amylose cardiaque.",
    outcomeId: "out-dpc-hvg-amylose",
  },
  {
    id: "dpc-hvg-q2",
    number: 2,
    theme: "Quel examen confirme une amylose ATTR de façon non invasive ?",
    prompt:
      "Chez un patient suspect d'amylose cardiaque, quel résultat permet un diagnostic non invasif d'amylose ATTR, en l'absence de gammapathie monoclonale ?",
    options: [
      { key: "A", label: "Échocardiographie montrant un strain apical préservé." },
      { key: "B", label: "IRM avec rehaussement tardif diffus." },
      {
        key: "C",
        label:
          "Scintigraphie osseuse (99mTc-DPD/PYP/HMDP) grade 2 ou 3 avec absence de protéine monoclonale.",
      },
      { key: "D", label: "Dosage élevé du NT-proBNP." },
    ],
    correctKey: "C",
    explanation:
      "À retenir : une scintigraphie positive (grade ≥ 2) associée à un bilan monoclonal négatif permet un diagnostic non invasif d'amylose ATTR.",
    outcomeId: "out-dpc-hvg-amylose",
  },
  {
    id: "dpc-hvg-q3",
    number: 3,
    theme: "Quel bilan est indispensable devant toute suspicion d'amylose cardiaque ?",
    prompt:
      "Lequel des examens suivants doit être réalisé systématiquement avant d'interpréter une scintigraphie osseuse ?",
    options: [
      { key: "A", label: "Coronarographie." },
      { key: "B", label: "Épreuve d'effort." },
      {
        key: "C",
        label:
          "Recherche d'une protéine monoclonale (immunofixation sérum/urines + chaînes légères libres).",
      },
      { key: "D", label: "Holter ECG." },
    ],
    correctKey: "C",
    explanation:
      "À retenir : éliminer une amylose AL est une urgence diagnostique ; le bilan immunologique est indispensable chez tout patient suspect.",
    outcomeId: "out-dpc-hvg-amylose",
  },
  {
    id: "dpc-hvg-q4",
    number: 4,
    theme: "Quel traitement modifie le pronostic de l'amylose ATTR ?",
    prompt:
      "Concernant le traitement de l'amylose cardiaque ATTR symptomatique, quelle affirmation est correcte ?",
    options: [
      { key: "A", label: "Les bêtabloquants sont le traitement de référence." },
      { key: "B", label: "Les IEC améliorent la survie." },
      {
        key: "C",
        label: "Le tafamidis ralentit la progression de la maladie et améliore le pronostic.",
      },
      { key: "D", label: "Les diurétiques sont le seul traitement efficace." },
    ],
    correctKey: "C",
    explanation:
      "À retenir : le tafamidis est un traitement spécifique de l'ATTR-CM éligible ; les traitements de soutien restent essentiels mais ne suffisent pas à modifier l'histoire naturelle.",
    outcomeId: "out-dpc-hvg-amylose",
  },
  {
    id: "dpc-hvg-q5",
    number: 5,
    theme: "Quel est le red flag échocardiographique le plus évocateur ?",
    prompt:
      "Quel signe échocardiographique est particulièrement suggestif d'une amylose cardiaque ?",
    options: [
      { key: "A", label: "Dilatation isolée du ventricule gauche." },
      { key: "B", label: "Hypertrophie septale asymétrique." },
      {
        key: "C",
        label: "Préservation relative du strain longitudinal apical (« apical sparing »).",
      },
      { key: "D", label: "Fraction d'éjection très diminuée (< 30 %)." },
    ],
    correctKey: "C",
    explanation:
      "À retenir : le profil d'apical sparing en strain longitudinal est un marqueur évocateur d'amylose cardiaque lorsqu'il est interprété dans le contexte clinique approprié.",
    outcomeId: "out-dpc-hvg-qualification",
  },
];

const allQuestionIds = dpcHvgQuestions.map((q) => q.id);

export const dpcHvgTests: readonly DpcTest[] = [
  {
    id: "dpc-hvg-test-pre",
    programId: DPC_HVG_PROGRAM_ID,
    phase: "pre",
    title: "Pré-test — 5 QCM avec explication écrite",
    questionIds: allQuestionIds,
  },
  {
    id: "dpc-hvg-test-post",
    programId: DPC_HVG_PROGRAM_ID,
    phase: "post",
    title: "Post-test — même série de 5 QCM",
    questionIds: allQuestionIds,
  },
];

export const dpcHvgTestAttempts: readonly DpcTestAttempt[] = [
  {
    testId: "dpc-hvg-test-pre",
    enrollmentId: "enr-dpc-hvg-1",
    phase: "pre",
    answers: {
      "dpc-hvg-q1": "A",
      "dpc-hvg-q2": "A",
      "dpc-hvg-q3": "D",
      "dpc-hvg-q4": "A",
      "dpc-hvg-q5": "B",
    },
    takenAt: "2026-06-15T13:40:00Z",
  },
  {
    testId: "dpc-hvg-test-post",
    enrollmentId: "enr-dpc-hvg-1",
    phase: "post",
    answers: {
      "dpc-hvg-q1": "A",
      "dpc-hvg-q2": "C",
      "dpc-hvg-q3": "C",
      "dpc-hvg-q4": "C",
      "dpc-hvg-q5": "B",
    },
    takenAt: "2026-06-15T16:45:00Z",
  },
  {
    testId: "dpc-hvg-test-pre",
    enrollmentId: "enr-dpc-hvg-2",
    phase: "pre",
    answers: {
      "dpc-hvg-q1": "B",
      "dpc-hvg-q2": "C",
      "dpc-hvg-q3": "A",
      "dpc-hvg-q4": "A",
      "dpc-hvg-q5": "C",
    },
    takenAt: "2026-06-15T13:38:00Z",
  },
  {
    testId: "dpc-hvg-test-post",
    enrollmentId: "enr-dpc-hvg-2",
    phase: "post",
    answers: {
      "dpc-hvg-q1": "A",
      "dpc-hvg-q2": "C",
      "dpc-hvg-q3": "C",
      "dpc-hvg-q4": "C",
      "dpc-hvg-q5": "C",
    },
    takenAt: "2026-06-15T16:42:00Z",
  },
];

/* ------------------------------------------------------------------ */
/* Réglages du programme DPC                                          */
/* ------------------------------------------------------------------ */

export const dpcHvgSetup: DpcProgrammeSetup = {
  programId: DPC_HVG_PROGRAM_ID,
  recordsPerRound: 10,
  trainingDurationMinutes: 180,
  trainingModality: "in_person",
  reminderDaysBeforeClose: [15, 7, 2],
  paperFallbackEnabled: true,
  targetAudience:
    "Cardiologues libéraux et hospitaliers prenant en charge des patients adultes présentant une HVG à l'échocardiographie.",
  orientations: [
    "Orientation n° 57 — pertinence des parcours et des examens complémentaires",
    "Orientation n° 59 — repérage précoce et prise en charge des maladies cardiovasculaires",
  ],
  timeline: [
    {
      key: "audit_t0",
      window: "J-30 à J0",
      description:
        "Audit clinique 1 sur 10 dossiers, analysés rétrospectivement ou prospectivement.",
      requirement: "10 dossiers complets transmis avant la formation.",
    },
    {
      key: "pre_test",
      window: "Jour J — ouverture",
      description: "Pré-test de 5 QCM élaborés par les intervenants, avec explication écrite.",
      requirement: "Série complète passée avant le début de la formation.",
    },
    {
      key: "training",
      window: "Jour J",
      description: "Formation présentielle de 3 heures : 3 séquences d'une heure et cas cliniques.",
      requirement: "Présence émargée à la séance.",
    },
    {
      key: "post_test",
      window: "Jour J — clôture",
      description: "Post-test : même série de 5 QCM, comparable au pré-test.",
      requirement: "Série complète passée après la formation.",
    },
    {
      key: "audit_t1",
      window: "J+90",
      description: "Audit clinique 2 sur 10 nouveaux dossiers, avec la même grille.",
      requirement: "10 dossiers complets transmis dans la fenêtre du second tour.",
    },
    {
      key: "comparison",
      window: "Après J+90",
      description: "Comparaison individuelle avant/après et conclusion adressée au participant.",
      requirement: "Les deux tours d'audit doivent être transmis.",
    },
    {
      key: "certificate",
      window: "Clôture du programme",
      description: "Attestation de participation au programme intégré (EPP + formation).",
      requirement: "Parcours complet : audit 1, pré-test, présence, post-test, audit 2.",
    },
  ],
  faculty: [
    {
      personId: "per-dpc-hvg-expert",
      fullName: "Pr Hélène Fabre",
      role: "Experte — conception et animation des 3 séquences",
      interestsDeclared: true,
      interestsSummary:
        "Liens d'intérêt déclarés et publiés avant la session, conformément aux exigences de la HAS relatives au DPC.",
    },
    {
      personId: "per-dpc-hvg-admin",
      fullName: "Coordination DPC",
      role: "Organisation, audits et traçabilité du parcours",
      interestsDeclared: true,
      interestsSummary: "Aucun lien d'intérêt avec l'industrie déclaré.",
    },
  ],
  references: [
    {
      order: 1,
      citation:
        "Garcia-Pavia P, Rapezzi C, Adler Y, et al. Diagnosis and treatment of cardiac amyloidosis: a position statement of the ESC Working Group on Myocardial and Pericardial Diseases. Eur Heart J. 2021;42(16):1554-1568.",
      pmid: "33825853",
    },
    {
      order: 2,
      citation:
        "Arbelo E, Protonotarios A, Gimeno JR, et al. 2023 ESC Guidelines for the management of cardiomyopathies. Eur Heart J. 2023;44(37):3503-3626.",
      pmid: "37622657",
    },
    {
      order: 3,
      citation:
        "Kittleson MM, Maurer MS, Ambardekar AV, et al. 2023 ACC Expert Consensus Decision Pathway on Comprehensive Multidisciplinary Care for the Patient With Cardiac Amyloidosis. J Am Coll Cardiol. 2023;81(11):1076-1126.",
      pmid: "36697326",
    },
    {
      order: 4,
      citation:
        "Dorbala S, Ando Y, Bokhari S, et al. Expert consensus recommendations for multimodality imaging in cardiac amyloidosis: Part 1 of 2. J Nucl Cardiol. 2019.",
      pmid: "31468376",
    },
    {
      order: 5,
      citation:
        "Gillmore JD, Maurer MS, Falk RH, et al. Nonbiopsy Diagnosis of Cardiac Transthyretin Amyloidosis. Circulation. 2016;133(24):2404-2412.",
      pmid: "27143678",
    },
    {
      order: 6,
      citation:
        "Maurer MS, Schwartz JH, Gundapaneni B, et al. Tafamidis Treatment for Patients with Transthyretin Amyloid Cardiomyopathy. N Engl J Med. 2018.",
      pmid: "30145929",
    },
    {
      order: 7,
      citation:
        "Gillmore JD, Judge DP, Cappelli F, et al. Efficacy and Safety of Acoramidis in Transthyretin Amyloid Cardiomyopathy. N Engl J Med. 2024.",
      pmid: "38197816",
    },
    {
      order: 8,
      citation:
        "Fontana M, Berk JL, Gillmore JD, et al. Vutrisiran in Patients with Transthyretin Amyloidosis Cardiomyopathy. N Engl J Med. 2024.",
      pmid: "39213194",
    },
    {
      order: 9,
      citation:
        "Damy T, Costes B, Hagège AA, et al. Prevalence and clinical phenotype of hereditary transthyretin amyloid cardiomyopathy in patients with increased left ventricular wall thickness. Eur Heart J. 2016.",
      pmid: "26705506",
    },
  ],
};

export const dpcHvgGrids: readonly DpcAuditGrid[] = [dpcHvgGrid, dpcHvgGridDraft];
