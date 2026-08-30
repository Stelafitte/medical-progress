/**
 * Module DPC GÉNÉRIQUE et CONFIGURABLE (programme intégré EPP + formation).
 *
 * Ce module n'introduit aucune architecture parallèle : c'est une configuration
 * de programme, activable pour n'importe quel programme depuis l'administration
 * (`ProgramConfig.dpcEnabled`). Le programme « DPC HVG–Amylose » n'est qu'un jeu
 * de données de démonstration de ce module.
 *
 * Invariants :
 *  - aucune donnée patient : un dossier audité est désigné par une référence
 *    anonyme locale au participant (D1…D10) ;
 *  - trois modalités de réponse : Oui / Non / N/A ; les N/A sont EXCLUS du
 *    denominateur de conformité (ils ne pénalisent pas le participant) ;
 *  - tous les calculs sont déterministes, sans IA ;
 *  - l'attestation atteste une participation et une progression mesurée, jamais
 *    l'acquisition automatique d'une compétence en situation réelle.
 */
import type {
  CohortId,
  EnrollmentId,
  IsoDateTime,
  OutcomeId,
  PersonId,
  ProgramId,
  Provenance,
} from "./types";

/* ------------------------------------------------------------------ */
/* Grille d'audit                                                     */
/* ------------------------------------------------------------------ */

/** Codage imposé par la méthode d'audit clinique. */
export type DpcAnswer = "yes" | "no" | "na";

export const DPC_ANSWER_LABELS_FR: Record<DpcAnswer, string> = {
  yes: "Oui",
  no: "Non",
  na: "N/A",
};

export const DPC_ANSWER_HELP_FR: Record<DpcAnswer, string> = {
  yes: "L'élément est retrouvé ou a été réalisé.",
  no: "L'élément n'est pas retrouvé ou n'a pas été réalisé.",
  na: "L'item n'est pas applicable à la situation clinique du patient.",
};

export interface DpcCriterion {
  readonly id: string;
  /** Numéro affiché dans la grille papier (1…29). */
  readonly number: number;
  readonly label: string;
  readonly helpText?: string;
  readonly outcomeId?: OutcomeId;
}

export interface DpcAuditSection {
  readonly id: string;
  readonly label: string;
  readonly criteria: readonly DpcCriterion[];
}

export type DpcGridStatus = "draft" | "published" | "archived";

export interface DpcAuditGrid {
  readonly id: string;
  readonly programId: ProgramId;
  readonly title: string;
  readonly description: string;
  readonly version: string;
  readonly status: DpcGridStatus;
  /** Nombre de dossiers à auditer par tour et par participant. */
  readonly recordsPerRound: number;
  readonly targetConformityPercent: number;
  /** Progression minimale attendue entre les deux tours (en points). */
  readonly expectedProgressPoints: number;
  readonly sections: readonly DpcAuditSection[];
  readonly publishedAt?: IsoDateTime;
  readonly provenance: Provenance;
}

/** Deux tours de la MÊME grille : c'est ce qui rend la comparaison valide. */
export type DpcRoundPhase = "t0" | "t1";

export const DPC_ROUND_LABELS_FR: Record<DpcRoundPhase, string> = {
  t0: "Audit 1 — avant formation",
  t1: "Audit 2 — après formation",
};

export interface DpcRound {
  readonly id: string;
  readonly gridId: string;
  readonly programId: ProgramId;
  readonly cohortId: CohortId;
  readonly phase: DpcRoundPhase;
  readonly label: string;
  /** Fenêtre relative du calendrier DPC (ex. « J-30 à J0 »). */
  readonly window: string;
  readonly opensOn: IsoDateTime;
  readonly closesOn: IsoDateTime;
  readonly status: "planned" | "open" | "closed";
}

export interface DpcAuditRecord {
  /** Référence ANONYME locale au participant (D1…D10). Aucune donnée patient. */
  readonly ref: string;
  readonly answers: Readonly<Record<string, DpcAnswer>>;
}

export type DpcEntryStatus = "not_started" | "in_progress" | "submitted";

export const DPC_ENTRY_STATUS_LABELS_FR: Record<DpcEntryStatus, string> = {
  not_started: "À remplir",
  in_progress: "En cours",
  submitted: "Transmis",
};

export interface DpcAuditEntry {
  readonly id: string;
  readonly roundId: string;
  readonly enrollmentId: EnrollmentId;
  readonly status: DpcEntryStatus;
  /** Saisie possible en ligne ou report d'un formulaire papier : même grille. */
  readonly channel: "online" | "paper_transcribed";
  readonly records: readonly DpcAuditRecord[];
  readonly submittedAt?: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* Formation, tests, séances, attestation                             */
/* ------------------------------------------------------------------ */

export interface DpcSequence {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly durationMinutes: number;
  readonly summary: string;
  readonly objectives: readonly string[];
  /** Cas clinique support de la séquence (aucune donnée patient réelle). */
  readonly clinicalCase: string;
  readonly caseQuestions: readonly string[];
  /** Supports rattachés dans la médiathèque (exploitables par le tuteur IA). */
  readonly mediaIds: readonly string[];
}

export interface DpcQuizOption {
  readonly key: string;
  readonly label: string;
}

export interface DpcQuizQuestion {
  readonly id: string;
  readonly number: number;
  readonly theme: string;
  readonly prompt: string;
  readonly options: readonly DpcQuizOption[];
  readonly correctKey: string;
  readonly explanation: string;
  readonly outcomeId?: OutcomeId;
}

export type DpcTestPhase = "pre" | "post";

export const DPC_TEST_PHASE_LABELS_FR: Record<DpcTestPhase, string> = {
  pre: "Pré-test",
  post: "Post-test",
};

export interface DpcTest {
  readonly id: string;
  readonly programId: ProgramId;
  readonly phase: DpcTestPhase;
  readonly title: string;
  /** Les deux passages utilisent la même série : la comparaison est valide. */
  readonly questionIds: readonly string[];
}

export interface DpcTestAttempt {
  readonly testId: string;
  readonly enrollmentId: EnrollmentId;
  readonly phase: DpcTestPhase;
  readonly answers: Readonly<Record<string, string>>;
  readonly takenAt: IsoDateTime;
}

export interface DpcAttendance {
  readonly sessionId: string;
  readonly enrollmentId: EnrollmentId;
  readonly present: boolean;
  /** Émargement simulé : la traçabilité réelle sera serveur. */
  readonly signedAt?: IsoDateTime;
}

export interface DpcFacultyMember {
  readonly personId: PersonId;
  readonly fullName: string;
  readonly role: string;
  /** Déclaration de liens d'intérêt (exigence HAS/DPC). */
  readonly interestsDeclared: boolean;
  readonly interestsSummary: string;
}

export interface DpcReference {
  readonly order: number;
  readonly citation: string;
  readonly pmid?: string;
}

/** Étape du parcours DPC, exprimée en calendrier RELATIF. */
export type DpcStepKey =
  "audit_t0" | "pre_test" | "training" | "post_test" | "audit_t1" | "comparison" | "certificate";

export const DPC_STEP_LABELS_FR: Record<DpcStepKey, string> = {
  audit_t0: "Audit clinique 1 (10 dossiers)",
  pre_test: "Pré-test de connaissances",
  training: "Formation (3 heures)",
  post_test: "Post-test de connaissances",
  audit_t1: "Audit clinique 2 (10 nouveaux dossiers)",
  comparison: "Comparaison individuelle et conclusion",
  certificate: "Attestation de participation",
};

export interface DpcTimelineStep {
  readonly key: DpcStepKey;
  readonly window: string;
  readonly description: string;
  readonly requirement: string;
}

/** Réglages du module DPC pour un programme (administrables). */
export interface DpcProgrammeSetup {
  readonly programId: ProgramId;
  readonly recordsPerRound: number;
  readonly trainingDurationMinutes: number;
  readonly trainingModality: "in_person" | "virtual_classroom" | "self_paced";
  readonly timeline: readonly DpcTimelineStep[];
  readonly reminderDaysBeforeClose: readonly number[];
  readonly paperFallbackEnabled: boolean;
  readonly faculty: readonly DpcFacultyMember[];
  readonly references: readonly DpcReference[];
  readonly orientations: readonly string[];
  readonly targetAudience: string;
}

/* ------------------------------------------------------------------ */
/* Logique pure — conformité                                          */
/* ------------------------------------------------------------------ */

const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

export function dpcCriteria(grid: DpcAuditGrid): readonly DpcCriterion[] {
  return grid.sections.flatMap((section) => section.criteria);
}

export function dpcCriterionCount(grid: DpcAuditGrid): number {
  return dpcCriteria(grid).length;
}

/** Résultat CHIFFRÉ de conformité (compteurs et pourcentage). */
export interface DpcConformityTally {
  /** Items applicables (Oui ou Non) : les N/A sont exclus. */
  readonly applicable: number;
  readonly conform: number;
  readonly notApplicable: number;
  readonly answered: number;
  readonly expected: number;
  readonly conformityPercent: number;
  readonly complete: boolean;
}

const emptyConformity = (expected: number): DpcConformityTally => ({
  applicable: 0,
  conform: 0,
  notApplicable: 0,
  answered: 0,
  expected,
  conformityPercent: 0,
  complete: false,
});

function tally(
  criteria: readonly DpcCriterion[],
  records: readonly DpcAuditRecord[],
  expectedRecords: number,
): DpcConformityTally {
  let conform = 0;
  let applicable = 0;
  let notApplicable = 0;
  let answered = 0;
  for (const record of records) {
    for (const criterion of criteria) {
      const answer = record.answers[criterion.id];
      if (answer === undefined) continue;
      answered += 1;
      if (answer === "na") {
        notApplicable += 1;
        continue;
      }
      applicable += 1;
      if (answer === "yes") conform += 1;
    }
  }
  const expected = criteria.length * expectedRecords;
  return {
    applicable,
    conform,
    notApplicable,
    answered,
    expected,
    conformityPercent: percent(conform, applicable),
    complete: expected > 0 && answered === expected,
  };
}

/** Conformité d'un dossier audité. */
export function recordConformity(grid: DpcAuditGrid, record: DpcAuditRecord): DpcConformityTally {
  return tally(dpcCriteria(grid), [record], 1);
}

/** Conformité d'un tour d'audit pour un participant. */
export function entryConformity(
  grid: DpcAuditGrid,
  entry: DpcAuditEntry | undefined,
): DpcConformityTally {
  if (!entry) return emptyConformity(dpcCriterionCount(grid) * grid.recordsPerRound);
  return tally(dpcCriteria(grid), entry.records, grid.recordsPerRound);
}

export interface DpcSectionConformity {
  readonly section: DpcAuditSection;
  readonly conformity: DpcConformityTally;
}

/** Conformité par partie de la grille : cible le message pédagogique. */
export function sectionConformity(
  grid: DpcAuditGrid,
  entries: readonly DpcAuditEntry[],
): readonly DpcSectionConformity[] {
  const records = entries.flatMap((e) => e.records);
  return grid.sections.map((section) => ({
    section,
    conformity: tally(section.criteria, records, records.length),
  }));
}

export interface DpcCriterionStat {
  readonly criterion: DpcCriterion;
  readonly sectionId: string;
  readonly conformityPercent: number;
  readonly applicable: number;
  readonly notApplicable: number;
}

/** Conformité critère par critère (jamais nominative en vue agrégée). */
export function criterionStats(
  grid: DpcAuditGrid,
  entries: readonly DpcAuditEntry[],
): readonly DpcCriterionStat[] {
  const records = entries.flatMap((e) => e.records);
  return grid.sections.flatMap((section) =>
    section.criteria.map((criterion) => {
      const single = tally([criterion], records, records.length);
      return {
        criterion,
        sectionId: section.id,
        conformityPercent: single.conformityPercent,
        applicable: single.applicable,
        notApplicable: single.notApplicable,
      };
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Logique pure — comparaison avant / après                           */
/* ------------------------------------------------------------------ */

export type DpcVerdict = "pending" | "progress" | "insufficient";

export const DPC_VERDICT_LABELS_FR: Record<DpcVerdict, string> = {
  pending: "En attente de l'audit 2",
  progress: "Progression conforme aux objectifs pédagogiques",
  insufficient: "Montée en compétences insuffisante",
};

export interface DpcComparison {
  readonly t0Percent: number | null;
  readonly t1Percent: number | null;
  readonly deltaPoints: number | null;
  readonly meetsTarget: boolean;
  readonly verdict: DpcVerdict;
  /** Conclusion adressée au participant (renforcement ou remédiation). */
  readonly conclusion: string;
}

/** Comparaison individuelle des deux tours d'audit. */
export function compareRounds(
  grid: DpcAuditGrid,
  t0: DpcAuditEntry | undefined,
  t1: DpcAuditEntry | undefined,
): DpcComparison {
  const submitted = (entry: DpcAuditEntry | undefined) =>
    entry && entry.status === "submitted" ? entry : undefined;
  const first = submitted(t0);
  const second = submitted(t1);
  const t0Percent = first ? entryConformity(grid, first).conformityPercent : null;
  const t1Percent = second ? entryConformity(grid, second).conformityPercent : null;
  const deltaPoints = t0Percent !== null && t1Percent !== null ? t1Percent - t0Percent : null;
  const meetsTarget = t1Percent !== null && t1Percent >= grid.targetConformityPercent;
  const verdict: DpcVerdict =
    deltaPoints === null
      ? "pending"
      : deltaPoints >= grid.expectedProgressPoints || meetsTarget
        ? "progress"
        : "insufficient";
  return {
    t0Percent,
    t1Percent,
    deltaPoints,
    meetsTarget,
    verdict,
    conclusion:
      verdict === "pending"
        ? "La conclusion sera établie dès la transmission de l'audit 2."
        : verdict === "progress"
          ? "Progression objectivée : le résultat vous est adressé à titre de renforcement positif."
          : "Déficit persistant : l'analyse est adressée avec les supports pédagogiques, les référentiels et la bibliographie de la formation.",
  };
}

export interface DpcCriterionDelta {
  readonly criterion: DpcCriterion;
  readonly t0Percent: number;
  readonly t1Percent: number;
  readonly deltaPoints: number;
}

/** Évolution critère par critère entre les deux tours. */
export function criterionDeltas(
  grid: DpcAuditGrid,
  t0: DpcAuditEntry | undefined,
  t1: DpcAuditEntry | undefined,
): readonly DpcCriterionDelta[] {
  const before = criterionStats(grid, t0 ? [t0] : []);
  const after = criterionStats(grid, t1 ? [t1] : []);
  return before.map((row, index) => {
    const t1Percent = after[index]?.conformityPercent ?? 0;
    return {
      criterion: row.criterion,
      t0Percent: row.conformityPercent,
      t1Percent,
      deltaPoints: t1Percent - row.conformityPercent,
    };
  });
}

/** Écarts persistants : critères encore sous la cible après formation. */
export function persistentGaps(
  grid: DpcAuditGrid,
  t0: DpcAuditEntry | undefined,
  t1: DpcAuditEntry | undefined,
): readonly DpcCriterionDelta[] {
  return criterionDeltas(grid, t0, t1)
    .filter((row) => row.t1Percent < grid.targetConformityPercent)
    .sort((a, b) => a.t1Percent - b.t1Percent);
}

/* ------------------------------------------------------------------ */
/* Logique pure — progression de saisie                               */
/* ------------------------------------------------------------------ */

export interface DpcEntryProgress {
  readonly recordsStarted: number;
  readonly recordsComplete: number;
  readonly recordsExpected: number;
  readonly answered: number;
  readonly expected: number;
  readonly percentComplete: number;
  /** Reprise de saisie : premier dossier et premier critère non renseignés. */
  readonly nextRecordIndex: number | null;
  readonly nextCriterionId: string | null;
  readonly canSubmit: boolean;
}

/** Progression de saisie d'un tour, pour la reprise et les relances. */
export function entryProgress(
  grid: DpcAuditGrid,
  records: readonly DpcAuditRecord[],
): DpcEntryProgress {
  const criteria = dpcCriteria(grid);
  const expected = criteria.length * grid.recordsPerRound;
  let answered = 0;
  let recordsComplete = 0;
  let nextRecordIndex: number | null = null;
  let nextCriterionId: string | null = null;

  for (let index = 0; index < grid.recordsPerRound; index += 1) {
    const record = records[index];
    const missing = criteria.filter((c) => record?.answers[c.id] === undefined);
    answered += criteria.length - missing.length;
    if (missing.length === 0 && record) recordsComplete += 1;
    if (nextRecordIndex === null && missing.length > 0) {
      nextRecordIndex = index;
      nextCriterionId = missing[0]!.id;
    }
  }

  return {
    recordsStarted: records.filter((r) => Object.keys(r.answers).length > 0).length,
    recordsComplete,
    recordsExpected: grid.recordsPerRound,
    answered,
    expected,
    percentComplete: percent(answered, expected),
    nextRecordIndex,
    nextCriterionId,
    canSubmit: answered === expected,
  };
}

/* ------------------------------------------------------------------ */
/* Logique pure — tests de connaissances                              */
/* ------------------------------------------------------------------ */

export interface DpcQuizScore {
  readonly correct: number;
  readonly answered: number;
  readonly total: number;
  readonly scorePercent: number;
  readonly complete: boolean;
}

export function scoreQuiz(
  questions: readonly DpcQuizQuestion[],
  answers: Readonly<Record<string, string>>,
): DpcQuizScore {
  let correct = 0;
  let answered = 0;
  for (const question of questions) {
    const given = answers[question.id];
    if (given === undefined) continue;
    answered += 1;
    if (given === question.correctKey) correct += 1;
  }
  return {
    correct,
    answered,
    total: questions.length,
    scorePercent: percent(correct, questions.length),
    complete: answered === questions.length,
  };
}

export interface DpcTestComparison {
  readonly prePercent: number | null;
  readonly postPercent: number | null;
  readonly deltaPoints: number | null;
  readonly pending: boolean;
}

export function compareTests(
  questions: readonly DpcQuizQuestion[],
  attempts: readonly DpcTestAttempt[],
  enrollmentId: EnrollmentId,
): DpcTestComparison {
  const of = (phase: DpcTestPhase) => {
    const attempt = attempts.find((a) => a.enrollmentId === enrollmentId && a.phase === phase);
    return attempt ? scoreQuiz(questions, attempt.answers).scorePercent : null;
  };
  const prePercent = of("pre");
  const postPercent = of("post");
  return {
    prePercent,
    postPercent,
    deltaPoints: prePercent !== null && postPercent !== null ? postPercent - prePercent : null,
    pending: postPercent === null,
  };
}

/* ------------------------------------------------------------------ */
/* Logique pure — modèle de vue expurgé des tests                     */
/*                                                                    */
/* Avant validation d'une tentative, la vue transmise à l'interface ne */
/* contient NI `correctKey` NI `explanation` : la correction n'est pas */
/* seulement masquée en CSS, elle est absente de la donnée.           */
/*                                                                    */
/* Produit réel : cette expurgation devra être faite côté serveur     */
/* (server function + RLS), la version React n'étant qu'un garde-fou  */
/* d'affichage. Un client ne doit jamais recevoir la correction d'un  */
/* test qu'il n'a pas encore validé, ni celle d'un autre participant. */
/* ------------------------------------------------------------------ */

export interface DpcQuizQuestionView {
  readonly id: string;
  readonly number: number;
  readonly theme: string;
  readonly prompt: string;
  /** Toujours visibles : le participant doit pouvoir répondre. */
  readonly options: readonly DpcQuizOption[];
  /** Réponse du participant pour cette phase, si déjà saisie. */
  readonly givenKey?: string;
  /** `true` seulement si la tentative de CETTE phase est validée. */
  readonly revealed: boolean;
  /** Présent uniquement si `revealed`. */
  readonly correctKey?: string;
  /** Présent uniquement si `revealed`. */
  readonly explanation?: string;
  /** Présent uniquement si `revealed`. */
  readonly isCorrect?: boolean;
}

export interface DpcQuizPhaseView {
  readonly phase: DpcTestPhase;
  /** Tentative validée (terminée) pour ce participant et cette phase. */
  readonly submitted: boolean;
  /** Une nouvelle validation est-elle encore possible dans la maquette ? */
  readonly canSubmit: boolean;
  readonly scorePercent: number | null;
  readonly questions: readonly DpcQuizQuestionView[];
}

/** Tentative du participant pour une phase donnée, jamais celle d'un autre. */
export function quizAttemptOf(
  attempts: readonly DpcTestAttempt[],
  enrollmentId: EnrollmentId,
  phase: DpcTestPhase,
): DpcTestAttempt | undefined {
  return attempts.find((a) => a.enrollmentId === enrollmentId && a.phase === phase);
}

/**
 * Une tentative est considérée comme terminée dans la maquette lorsqu'elle
 * existe pour ce participant, cette phase, et que toutes les questions de la
 * série ont reçu une réponse. Tant qu'elle ne l'est pas, aucune correction.
 */
export function isQuizAttemptFinalised(
  questions: readonly DpcQuizQuestion[],
  attempts: readonly DpcTestAttempt[],
  enrollmentId: EnrollmentId,
  phase: DpcTestPhase,
): boolean {
  const attempt = quizAttemptOf(attempts, enrollmentId, phase);
  if (!attempt) return false;
  return scoreQuiz(questions, attempt.answers).complete;
}

/**
 * Construit la vue d'une phase de test. Le pré-test et le post-test sont
 * traités séparément : valider le pré-test ne révèle jamais le post-test.
 */
export function quizPhaseView(
  questions: readonly DpcQuizQuestion[],
  attempts: readonly DpcTestAttempt[],
  enrollmentId: EnrollmentId,
  phase: DpcTestPhase,
): DpcQuizPhaseView {
  const attempt = quizAttemptOf(attempts, enrollmentId, phase);
  const submitted = isQuizAttemptFinalised(questions, attempts, enrollmentId, phase);
  const score = attempt ? scoreQuiz(questions, attempt.answers) : null;
  const views = questions.map<DpcQuizQuestionView>((question) => {
    const givenKey = attempt?.answers[question.id];
    const base: DpcQuizQuestionView = {
      id: question.id,
      number: question.number,
      theme: question.theme,
      prompt: question.prompt,
      options: question.options.map((option) => ({ key: option.key, label: option.label })),
      revealed: submitted,
      ...(givenKey !== undefined ? { givenKey } : {}),
    };
    if (!submitted) return base;
    return {
      ...base,
      correctKey: question.correctKey,
      explanation: question.explanation,
      isCorrect: givenKey === question.correctKey,
    };
  });
  return {
    phase,
    submitted,
    canSubmit: !submitted,
    scorePercent: submitted && score ? score.scorePercent : null,
    questions: views,
  };
}

/* ------------------------------------------------------------------ */

/* Logique pure — parcours et attestation                             */
/* ------------------------------------------------------------------ */

export interface DpcStepState {
  readonly key: DpcStepKey;
  readonly window: string;
  readonly label: string;
  readonly description: string;
  readonly requirement: string;
  readonly state: "todo" | "in_progress" | "done" | "blocked";
  readonly detail: string;
}

export interface DpcJourneyInput {
  readonly grid: DpcAuditGrid;
  readonly setup: DpcProgrammeSetup;
  readonly t0?: DpcAuditEntry;
  readonly t1?: DpcAuditEntry;
  readonly preTestPercent: number | null;
  readonly postTestPercent: number | null;
  readonly attendedTraining: boolean;
  readonly comparison: DpcComparison;
}

export interface DpcJourney {
  readonly steps: readonly DpcStepState[];
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly percentComplete: number;
  readonly attestationEligible: boolean;
  readonly attestationBlockers: readonly string[];
}

/** État du parcours DPC d'un participant, dérivé de ses seules preuves. */
export function dpcJourney(input: DpcJourneyInput): DpcJourney {
  const { grid, setup, t0, t1, preTestPercent, postTestPercent, attendedTraining, comparison } =
    input;
  const entryState = (entry: DpcAuditEntry | undefined): DpcStepState["state"] =>
    entry?.status === "submitted"
      ? "done"
      : entry?.status === "in_progress"
        ? "in_progress"
        : "todo";
  const entryDetail = (entry: DpcAuditEntry | undefined) => {
    const progress = entryProgress(grid, entry?.records ?? []);
    return `${progress.recordsComplete}/${progress.recordsExpected} dossiers complets · ${progress.percentComplete} % de la grille`;
  };

  const byKey: Record<DpcStepKey, { state: DpcStepState["state"]; detail: string }> = {
    audit_t0: { state: entryState(t0), detail: entryDetail(t0) },
    pre_test: {
      state: preTestPercent === null ? "todo" : "done",
      detail: preTestPercent === null ? "Non passé" : `Score ${preTestPercent} %`,
    },
    training: {
      state: attendedTraining ? "done" : "todo",
      detail: attendedTraining
        ? `Présence émargée · ${setup.trainingDurationMinutes} min`
        : `${setup.trainingDurationMinutes} min à suivre`,
    },
    post_test: {
      state: postTestPercent === null ? "todo" : "done",
      detail: postTestPercent === null ? "Non passé" : `Score ${postTestPercent} %`,
    },
    audit_t1: { state: entryState(t1), detail: entryDetail(t1) },
    comparison: {
      state: comparison.verdict === "pending" ? "blocked" : "done",
      detail: DPC_VERDICT_LABELS_FR[comparison.verdict],
    },
    certificate: { state: "todo", detail: "Éditée après validation du parcours" },
  };

  const blockers: string[] = [];
  if (byKey.audit_t0.state !== "done") blockers.push("Audit 1 non transmis.");
  if (byKey.pre_test.state !== "done") blockers.push("Pré-test non passé.");
  if (!attendedTraining) blockers.push("Présence à la formation non émargée.");
  if (byKey.post_test.state !== "done") blockers.push("Post-test non passé.");
  if (byKey.audit_t1.state !== "done") blockers.push("Audit 2 non transmis.");

  const attestationEligible = blockers.length === 0;
  if (attestationEligible) {
    byKey.certificate = { state: "done", detail: "Attestation de participation disponible" };
  }

  const steps: readonly DpcStepState[] = setup.timeline.map((step) => ({
    key: step.key,
    window: step.window,
    label: DPC_STEP_LABELS_FR[step.key],
    description: step.description,
    requirement: step.requirement,
    state: byKey[step.key].state,
    detail: byKey[step.key].detail,
  }));

  const completedSteps = steps.filter((s) => s.state === "done").length;
  return {
    steps,
    completedSteps,
    totalSteps: steps.length,
    percentComplete: percent(completedSteps, steps.length),
    attestationEligible,
    attestationBlockers: blockers,
  };
}

/**
 * L'attestation DPC atteste une participation et une progression mesurée.
 * Elle n'accorde JAMAIS seule une compétence en situation réelle : celle-ci
 * reste soumise à une validation humaine.
 */
export function dpcCertificateConfersNoRealCompetence(): true {
  return true;
}

/* ------------------------------------------------------------------ */
/* Logique pure — pilotage de promotion                               */
/* ------------------------------------------------------------------ */

export interface DpcRoundAggregate {
  readonly roundId: string;
  readonly phase: DpcRoundPhase;
  readonly expectedParticipants: number;
  readonly submitted: number;
  readonly inProgress: number;
  readonly notStarted: number;
  readonly participationPercent: number;
  readonly meanConformityPercent: number;
}

/** Agrégat d'un tour : jamais nominatif. */
export function aggregateRound(
  grid: DpcAuditGrid,
  round: DpcRound,
  entries: readonly DpcAuditEntry[],
  expectedParticipants: number,
): DpcRoundAggregate {
  const scoped = entries.filter((e) => e.roundId === round.id);
  const submitted = scoped.filter((e) => e.status === "submitted");
  const mean =
    submitted.length === 0
      ? 0
      : Math.round(
          submitted.reduce((sum, e) => sum + entryConformity(grid, e).conformityPercent, 0) /
            submitted.length,
        );
  const inProgress = scoped.filter((e) => e.status === "in_progress").length;
  return {
    roundId: round.id,
    phase: round.phase,
    expectedParticipants,
    submitted: submitted.length,
    inProgress,
    notStarted: Math.max(0, expectedParticipants - submitted.length - inProgress),
    participationPercent: percent(submitted.length, expectedParticipants),
    meanConformityPercent: mean,
  };
}

export interface DpcReminderTarget {
  readonly enrollmentId: EnrollmentId;
  readonly status: DpcEntryStatus;
  readonly percentComplete: number;
}

/** Participants à relancer sur un tour ouvert (liste de travail administrative). */
export function reminderTargets(
  grid: DpcAuditGrid,
  round: DpcRound,
  entries: readonly DpcAuditEntry[],
  enrollmentIds: readonly EnrollmentId[],
): readonly DpcReminderTarget[] {
  return enrollmentIds
    .map((enrollmentId) => {
      const entry = entries.find((e) => e.roundId === round.id && e.enrollmentId === enrollmentId);
      return {
        enrollmentId,
        status: entry?.status ?? ("not_started" as DpcEntryStatus),
        percentComplete: entryProgress(grid, entry?.records ?? []).percentComplete,
      };
    })
    .filter((target) => target.status !== "submitted");
}

export const DPC_NO_PATIENT_DATA_NOTICE_FR =
  "Aucune donnée patient n'est enregistrée : chaque dossier est désigné par une référence anonyme locale (D1 à D10).";

export const DPC_PAPER_FALLBACK_NOTICE_FR =
  "Les audits peuvent être réalisés hors ligne sur formulaire papier puis reportés ici : la grille est strictement identique.";
