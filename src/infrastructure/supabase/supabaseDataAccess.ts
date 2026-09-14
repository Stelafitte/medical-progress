import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { PlanMilestoneId, PlanScheduleEntry } from "@/domain/acquisitionPlan";
import {
  AI_FALLBACK_POLICIES,
  defaultProgramAiSettings,
  type AiFallbackPolicy,
  type ProgramAiSettings,
} from "@/domain/programAi";
import {
  COURSE_SECTION_KINDS,
  OUTCOME_SECTION_ORIGINS,
  type CourseSection,
  type CourseSectionKind,
  type OutcomeSectionOrigin,
  type OutcomeSections,
} from "@/domain/courseSections";
import type {
  CreateAssessmentModalityInput,
  CreateCohortInput,
  CreateLearningResourceInput,
  CreateOutcomeInput,
  DataAccess,
  GrantRoleAssignmentInput,
  ProgramAiAnalysisResult,
  PublishNarratedDeckInput,
  PublishedNarratedDeck,
  RegisterResourceAssetInput,
  RegisteredResourceAsset,
  RequestUploadUrlInput,
  ResourceAssetKind,
  NarratedDeckPlayback,
  ResourceVisibility,
  TranscriptionProgress,
  UploadUrlResult,
} from "@/application/ports/repositories";
import type {
  Cohort,
  CohortId,
  CohortStatus,
  CurriculumVersion,
  CurriculumVersionId,
  Enrollment,
  EnrollmentId,
  LearningResource,
  LearningResourceId,
  MasteryLevel,
  Outcome,
  OutcomeId,
  OutcomeTheme,
  OutcomeThemeId,
  Person,
  PersonId,
  Placement,
  PlacementId,
  EncadrementSource,
  EncadrementSourceId,
  EncadrementSyncPreview,
  EncadrementSyncReport,
  EncadrementSyncRun,
  DiscussionMessage,
  DiscussionMessageId,
  DiscussionThread,
  DiscussionThreadId,
  OutcomeExperienceNote,
  PlacementAssignment,
  PlacementAssignmentId,
  Program,
  ProgramId,
  RoleAssignment,
  RoleScope,
  SupervisionGroup,
  SupervisionGroupId,
} from "@/domain/types";
/*
 * `MessageChannel` EST IMPORTE EXPLICITEMENT, ET IL LE FAUT : le DOM en declare
 * un homonyme (celui des `MessagePort`), et sans cet import TypeScript prend le
 * type global sans rien signaler d'autre qu'une incompatibilite obscure a
 * l'assignation. Le compilateur l'a attrape ; a l'oeil, c'etait invisible.
 */
import type { MessageChannel } from "@/domain/communication";
import type { MessageDeliveryId } from "@/domain/types";
import type {
  StageLog,
  StageLogEntryId,
  StageLogId,
  StageLogStatus,
  StageLogTemplateId,
} from "@/domain/stageLog";
import type { EcosExternalRun, EcosGridItem } from "@/domain/ecos";
import type { OutcomeSelfReport } from "@/domain/passport";
import type { AssessmentModality } from "@/domain/assessmentModality";
import type {
  MediaAsset,
  MediaKind,
  MediaResource,
  MediaResourceId,
  MediaStatus,
  MediaVisibility,
} from "@/domain/mediaLibrary";
import {
  normalizeLoginEmail,
  roleIntentIssue,
  statusAfterRestore,
  type CreatePendingPersonInput,
  type PendingPerson,
  type PendingPersonId,
  type PendingPersonStatus,
  type SendInvitationOutcome,
  type UpdatePendingPersonInput,
} from "@/domain/peopleStaging";
import { mockDataAccess } from "@/infrastructure/mock/mockDataAccess";
import { requireCanonicalMediaType } from "@/infrastructure/storage/mediaTypes";

const nativeProvenance = { sourceSystem: "native" as const };

type ProgramRow = {
  id: string;
  code: string;
  name: string;
  kind: Program["kind"];
  institution: string;
  annual_learner_estimate: number;
  placements_enabled: boolean;
  simulation_enabled: boolean;
  audits_enabled: boolean;
  pre_post_tests_enabled: boolean;
  sessions_enabled: boolean;
  dpc_enabled: boolean;
  learner_plan_shifts_enabled: boolean;
  target_mastery: Program["config"]["targetMastery"];
  locale: string;
  design_draft: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
  created_at: string;
  updated_at: string;
};

type EnrollmentRow = {
  id: string;
  person_id: string;
  program_id: string;
  cohort_id: string;
  status: Enrollment["status"];
  created_at: string;
  updated_at: string;
};

type RoleAssignmentRow = {
  person_id: string;
  role: RoleAssignment["role"];
  scope_kind: RoleScope["kind"];
  scope_id: string | null;
  program_id: string | null;
  granted_at: string;
};

function assertNoSupabaseError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

interface ProgramAiSettingsRow {
  program_id: string;
  enabled: boolean;
  monthly_credit_cap: number;
  fallback_policy: string;
  active_provider: string | null;
}

interface ProgramAiUsageRow {
  credits_total: number;
  messages_total: number;
  apprenants_actifs: number;
  apprenants_au_plafond: number;
}

/**
 * `fallback_policy` ARRIVE EN TEXTE. On le compare a la liste du domaine plutot
 * que de le forcer par un `as` : si l'enum gagne une valeur en base avant que
 * l'ecran sache l'afficher, mieux vaut retomber sur `seuil` — le moins cher —
 * que rendre un radio-groupe sans selection, ou pire, une politique inventee.
 */
interface CourseSectionRow {
  section_id: string;
  chapitre: number;
  partie: string | null;
  numero: string | null;
  titre: string | null;
  niveau: number | null;
  ordre: number;
  kind: string;
  rubrique: string | null;
  contenu: string;
  n_caracteres: number;
  origine?: string;
}

/**
 * `kind` ET `origine` ARRIVENT EN TEXTE, et on les compare aux listes du
 * domaine plutot que de les forcer par un `as`. La contrainte `check` en base
 * les borne aujourd'hui ; le jour ou une cinquieme valeur apparaitra, mieux vaut
 * un repli sur `section` qu'un type qui ment au reste du code.
 */
function mapCourseSection(row: CourseSectionRow): CourseSection {
  const kind: CourseSectionKind =
    COURSE_SECTION_KINDS.find((valeur) => valeur === row.kind) ?? "section";
  return {
    sectionId: row.section_id,
    chapitre: row.chapitre,
    partie: row.partie ?? "",
    numero: row.numero ?? "",
    titre: row.titre ?? "",
    niveau: row.niveau ?? 1,
    ordre: row.ordre,
    kind,
    rubrique: row.rubrique ?? undefined,
    contenu: row.contenu,
    nCaracteres: row.n_caracteres,
  };
}

function mapProgramAiSettings(row: ProgramAiSettingsRow): ProgramAiSettings {
  const politique = AI_FALLBACK_POLICIES.find((valeur) => valeur === row.fallback_policy);
  return {
    programId: row.program_id as ProgramId,
    enabled: row.enabled,
    monthlyCreditCap: row.monthly_credit_cap,
    fallbackPolicy: politique ?? "seuil",
    /*
     * `undefined` EXPLICITE, PAS UNE PROPRIETE ABSENTE. `ProgramAiSettings`
     * declare `activeProvider: string | undefined` — un champ toujours
     * present, parfois vide — et le projet est en
     * `exactOptionalPropertyTypes` : un spread conditionnel produirait une
     * propriete OPTIONNELLE, qui n'est pas le meme type. Le compilateur l'a
     * refuse, et il avait raison : « pas de moteur » est une information, pas
     * une absence d'information.
     */
    activeProvider: row.active_provider ?? undefined,
  };
}

export function mapProgram(row: ProgramRow): Program {
  if (row.locale !== "fr-FR") {
    throw new Error(`Locale de programme non prise en charge: ${row.locale}`);
  }
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    institution: row.institution,
    annualLearnerEstimate: row.annual_learner_estimate,
    designDraft: row.design_draft,
    config: {
      placementsEnabled: row.placements_enabled,
      simulationEnabled: row.simulation_enabled,
      realCompetenceRequiresValidator: true,
      targetMastery: row.target_mastery,
      auditsEnabled: row.audits_enabled,
      prePostTestsEnabled: row.pre_post_tests_enabled,
      sessionsEnabled: row.sessions_enabled,
      dpcEnabled: row.dpc_enabled,
      learnerPlanShiftsEnabled: row.learner_plan_shifts_enabled,
      locale: row.locale,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    provenance: nativeProvenance,
  };
}

type CohortRow = {
  id: string;
  program_id: string;
  curriculum_version_id: string;
  label: string;
  academic_year: string;
  starts_on: string;
  ends_on: string;
  status: string;
  archived_at: string | null;
  created_at: string;
};

/** `starts_on`/`ends_on` sont des colonnes `date` (pas d'heure) côté Postgres. */
function normalizeIsoDate(value: string): string {
  return value.includes("T") ? value : `${value}T00:00:00.000Z`;
}

type CurriculumVersionRow = {
  id: string;
  program_id: string;
  label: string;
  effective_from: string;
  status: CurriculumVersion["status"];
  created_at: string;
};

export function mapCurriculumVersion(row: CurriculumVersionRow): CurriculumVersion {
  return {
    id: row.id as CurriculumVersionId,
    createdAt: row.created_at,
    provenance: nativeProvenance,
    programId: row.program_id as ProgramId,
    label: row.label,
    effectiveFrom: normalizeIsoDate(row.effective_from),
    status: row.status,
  };
}

type PlacementRow = {
  id: string;
  program_id: string;
  name: string;
  site: string;
  department: string;
  capacity: number;
  created_at: string;
};

const placementColumns = "id,program_id,name,site,department,capacity,created_at";

export function mapPlacement(row: PlacementRow): Placement {
  return {
    id: row.id as PlacementId,
    createdAt: row.created_at,
    provenance: nativeProvenance,
    programId: row.program_id as ProgramId,
    name: row.name,
    site: row.site,
    department: row.department,
    capacity: row.capacity,
  };
}

/*
 * AFFECTATION DE STAGE — DERIVEE, JAMAIS STOCKEE (10/09).
 *
 * `list_placement_assignments` construit ces lignes a partir des groupes
 * d'encadrement ; aucune table `placement_assignments` n'existe. Voir la
 * migration 20260910100000 pour le pourquoi.
 */
type PlacementAssignmentRow = {
  id: string;
  placement_id: string;
  enrollment_id: string;
  supervisor_person_id: string;
  starts_on: string;
  ends_on: string;
  status: string;
};

export function mapPlacementAssignment(row: PlacementAssignmentRow): PlacementAssignment {
  return {
    id: row.id as PlacementAssignmentId,
    /*
     * UNE AFFECTATION DERIVEE N'A PAS DE DATE DE CREATION : elle n'a jamais ete
     * ecrite. On expose le debut de la periode plutot qu'une date inventee ou
     * l'instant de la lecture — qui, lui, changerait a chaque appel.
     */
    createdAt: row.starts_on,
    provenance: nativeProvenance,
    placementId: row.placement_id as PlacementId,
    enrollmentId: row.enrollment_id as EnrollmentId,
    supervisorPersonId: row.supervisor_person_id as PersonId,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    status: row.status as PlacementAssignment["status"],
  };
}

/**
 * L'appel unique derriere les trois lectures d'affectation.
 *
 * Les trois filtres sont NULLABLES cote base : chaque porte n'en renseigne que
 * ce qu'elle connait. Passer `null` explicitement plutot que d'omettre la cle
 * evite qu'un jour PostgREST se retrouve devant deux signatures possibles.
 */
async function listPlacementAssignments(
  client: SupabaseClient,
  filtres: {
    programId?: ProgramId;
    supervisorPersonId?: PersonId;
    enrollmentId?: EnrollmentId;
  },
): Promise<readonly PlacementAssignment[]> {
  const { data, error } = await client.rpc("list_placement_assignments", {
    p_program_id: filtres.programId ?? null,
    p_supervisor_person_id: filtres.supervisorPersonId ?? null,
    p_enrollment_id: filtres.enrollmentId ?? null,
  });
  assertNoSupabaseError(error);
  return ((data ?? []) as PlacementAssignmentRow[]).map(mapPlacementAssignment);
}

type SupervisionGroupRow = {
  id: string;
  program_id: string;
  cohort_id: string;
  placement_id: string;
  label: string;
  created_at: string;
  supervision_group_members?: { enrollment_id: string }[] | null;
  supervision_group_supervisors?: { person_id: string }[] | null;
};

const supervisionGroupColumns =
  "id,program_id,cohort_id,placement_id,label,created_at," +
  "supervision_group_members(enrollment_id),supervision_group_supervisors(person_id)";

export function mapSupervisionGroup(row: SupervisionGroupRow): SupervisionGroup {
  return {
    id: row.id as SupervisionGroupId,
    createdAt: row.created_at,
    provenance: nativeProvenance,
    programId: row.program_id as ProgramId,
    cohortId: row.cohort_id as CohortId,
    placementId: row.placement_id as PlacementId,
    label: row.label,
    memberEnrollmentIds: (row.supervision_group_members ?? []).map(
      (m) => m.enrollment_id as EnrollmentId,
    ),
    supervisorPersonIds: (row.supervision_group_supervisors ?? []).map(
      (sup) => sup.person_id as PersonId,
    ),
  };
}

type StageLogEntryRow = {
  id: string;
  occurred_on: string;
  narrative: string;
  values: Record<string, string> | null;
  created_at: string;
};

type StageLogValidationRow = {
  covers_from: string;
  covers_to: string;
  validator_person_id: string;
  validator_role: "placement_supervisor" | "teacher" | "administrator";
  decision: "validated" | "needs_revision" | "not_validated";
  comment: string;
  decided_at: string;
};

type StageLogRow = {
  id: string;
  template_id: string | null;
  template_version: number;
  program_id: string;
  cohort_id: string;
  enrollment_id: string;
  placement_id: string;
  period_starts_on: string;
  period_ends_on: string;
  status: StageLogStatus;
  created_at: string;
  stage_log_entries?: StageLogEntryRow[] | null;
  stage_log_validations?: StageLogValidationRow[] | null;
};

const stageLogColumns =
  "id,template_id,template_version,program_id,cohort_id,enrollment_id,placement_id," +
  "period_starts_on,period_ends_on,status,created_at," +
  "stage_log_entries(id,occurred_on,narrative,values,created_at)," +
  "stage_log_validations(covers_from,covers_to,validator_person_id,validator_role,decision,comment,decided_at)";

/**
 * `template_id` est nul tant qu'aucun modele de carnet n'est configure — et il
 * n'y en a aucun aujourd'hui. Le domaine attend un identifiant : on rend la
 * chaine vide, que les ecrans traitent comme « pas de modele », plutot que
 * d'inventer un modele qui n'existe pas.
 */
export function mapStageLog(row: StageLogRow): StageLog {
  return {
    id: row.id as StageLogId,
    createdAt: row.created_at,
    provenance: nativeProvenance,
    templateId: (row.template_id ?? "") as StageLogTemplateId,
    templateVersion: row.template_version,
    programId: row.program_id as ProgramId,
    cohortId: row.cohort_id as CohortId,
    enrollmentId: row.enrollment_id as EnrollmentId,
    placementId: row.placement_id as PlacementId,
    periodStartsOn: row.period_starts_on,
    periodEndsOn: row.period_ends_on,
    status: row.status,
    entries: (row.stage_log_entries ?? [])
      .map((entry) => ({
        id: entry.id as StageLogEntryId,
        createdAt: entry.created_at,
        provenance: nativeProvenance,
        stageLogId: row.id as StageLogId,
        templateId: (row.template_id ?? "") as StageLogTemplateId,
        occurredAt: entry.occurred_on,
        narrative: entry.narrative,
        values: entry.values ?? {},
        photos: [],
      }))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    validations: (row.stage_log_validations ?? []).map((validation) => ({
      stageLogId: row.id as StageLogId,
      coversFrom: validation.covers_from,
      coversTo: validation.covers_to,
      validatorPersonId: validation.validator_person_id as PersonId,
      validatorRole: validation.validator_role,
      decision: validation.decision,
      decidedAt: validation.decided_at,
      comment: validation.comment,
      provenance: nativeProvenance,
    })),
  };
}

export function mapCohort(row: CohortRow, learnerCount: number): Cohort {
  return {
    id: row.id as CohortId,
    createdAt: row.created_at,
    provenance: nativeProvenance,
    programId: row.program_id as ProgramId,
    curriculumVersionId: row.curriculum_version_id as CurriculumVersionId,
    label: row.label,
    academicYear: row.academic_year,
    startsOn: normalizeIsoDate(row.starts_on),
    endsOn: normalizeIsoDate(row.ends_on),
    learnerCount,
    status: row.status as CohortStatus,
    archivedAt: row.archived_at ?? null,
  };
}

interface SelfReportRow {
  enrollment_id: string;
  outcome_id: string;
  declared_level: MasteryLevel;
  declared_at: string;
  note: string;
  validated_by: string | null;
  validated_at: string | null;
}

/**
 * `validatedBy` et `validatedAt` sont OMIS quand la validation est absente, et
 * non poses a `null` : le domaine les declare optionnels, et `isValidated()`
 * teste `validatedAt !== undefined`. Un `null` passerait ce test.
 */
function mapSelfReport(row: SelfReportRow): OutcomeSelfReport {
  return {
    enrollmentId: row.enrollment_id as EnrollmentId,
    outcomeId: row.outcome_id as OutcomeId,
    declaredLevel: row.declared_level,
    declaredAt: row.declared_at,
    note: row.note,
    ...(row.validated_by ? { validatedBy: row.validated_by as PersonId } : {}),
    ...(row.validated_at ? { validatedAt: row.validated_at } : {}),
  };
}

/*
 * LE FIL, AVEC SON SUJET JOINT DANS LA MEME REQUETE.
 *
 * `outcomes` et `stage_log_entries` sont embarques par PostgREST le long des
 * deux cles etrangeres d'ancrage : sans eux l'ecran afficherait un identifiant
 * a la place du sujet, et il faudrait une lecture de plus par fil.
 *
 * `discussion_thread_reads` remonte en TABLEAU (relation inverse), mais la
 * policy `person_id = auth.uid()` fait qu'il n'y a jamais que MA ligne dedans,
 * ou aucune. C'est ce qui permet de dire « non lu » sans exposer a l'apprenant
 * l'heure a laquelle son encadrant a ouvert le fil.
 */
type EncadrementSourceRow = {
  id: string;
  program_id: string;
  placement_id: string;
  label: string;
  endpoint_url: string;
  token_hint: string;
  active: boolean;
  last_sync_at: string | null;
};

function mapEncadrementSource(row: EncadrementSourceRow): EncadrementSource {
  return {
    id: row.id as EncadrementSourceId,
    programId: row.program_id as ProgramId,
    placementId: row.placement_id as PlacementId,
    label: row.label,
    endpointUrl: row.endpoint_url,
    tokenHint: row.token_hint,
    active: row.active,
    lastSyncAt: row.last_sync_at,
  };
}

type EncadrementRunRow = {
  id: string;
  source_id: string;
  started_at: string;
  status: "running" | "succeeded" | "failed";
  members_seen: number;
  people_added: number;
  removals_proposed: number;
  unchanged: number;
  error_message: string | null;
};

function mapEncadrementRun(row: EncadrementRunRow): EncadrementSyncRun {
  return {
    id: row.id,
    sourceId: row.source_id as EncadrementSourceId,
    startedAt: row.started_at,
    status: row.status,
    membersSeen: row.members_seen,
    peopleAdded: row.people_added,
    removalsProposed: row.removals_proposed,
    unchanged: row.unchanged,
    errorMessage: row.error_message,
  };
}

/**
 * LE MESSAGE UTILE EST DANS LE CORPS, PAS DANS L'ERREUR.
 *
 * `functions.invoke` rend « Edge Function returned a non-2xx status code » --
 * vrai et inutilisable. La fonction, elle, repond `{ error: "..." }` en clair
 * (« La source refuse ce jeton... »). Sans cette extraction, l'administrateur
 * lirait un message technique la ou il y a une explication.
 */
async function messageDeFonctionEdge(erreur: unknown, corps: unknown): Promise<string> {
  const duCorps = (corps as { error?: string } | null)?.error;
  if (typeof duCorps === "string" && duCorps.length > 0) return duCorps;
  /*
   * ⚠️ SUR UN STATUT NON-2xx, `data` EST NUL et le corps est range dans
   * `error.context`, qui est une `Response` PAS ENCORE LUE. Sans ce
   * deballage, l'administrateur lirait « Edge Function returned a non-2xx
   * status code » -- exact et inutilisable -- au lieu de « La source refuse ce
   * jeton, regenerez-le cote UMCV ».
   */
  const contexte = (erreur as { context?: unknown } | null)?.context;
  if (contexte instanceof Response) {
    try {
      const lu = (await contexte.clone().json()) as { error?: string };
      if (typeof lu?.error === "string" && lu.error.length > 0) return lu.error;
    } catch {
      /* Le corps n'etait pas du JSON : on retombe sur le message generique. */
    }
  }
  return erreur instanceof Error ? erreur.message : "La synchronisation a échoué.";
}

type DiscussionThreadRow = {
  id: string;
  program_id: string;
  enrollment_id: string;
  outcome_id: string | null;
  stage_log_entry_id: string | null;
  opened_by: string;
  created_at: string;
  last_message_at: string;
  outcomes: { code: string; label: string } | null;
  stage_log_entries: { occurred_on: string; narrative: string } | null;
  discussion_thread_reads: { read_at: string }[] | null;
  enrollments: { profiles: { full_name: string } | null } | null;
};

const discussionThreadColumns =
  "id,program_id,enrollment_id,outcome_id,stage_log_entry_id,opened_by,created_at,last_message_at," +
  "outcomes(code,label),stage_log_entries(occurred_on,narrative)," +
  "discussion_thread_reads(read_at),enrollments(profiles(full_name))";

function mapDiscussionThread(row: DiscussionThreadRow): DiscussionThread {
  return {
    id: row.id as DiscussionThreadId,
    programId: row.program_id as ProgramId,
    enrollmentId: row.enrollment_id as EnrollmentId,
    ...(row.outcome_id ? { outcomeId: row.outcome_id as OutcomeId } : {}),
    ...(row.stage_log_entry_id ? { stageLogEntryId: row.stage_log_entry_id } : {}),
    openedBy: row.opened_by as PersonId,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    readAt: row.discussion_thread_reads?.[0]?.read_at ?? null,
    ...(row.enrollments?.profiles ? { learnerName: row.enrollments.profiles.full_name } : {}),
    ...(row.outcomes ? { outcomeCode: row.outcomes.code, outcomeLabel: row.outcomes.label } : {}),
    ...(row.stage_log_entries
      ? {
          occurredOn: row.stage_log_entries.occurred_on,
          contextBody: row.stage_log_entries.narrative,
        }
      : {}),
  };
}

type DiscussionMessageRow = {
  id: string;
  thread_id: string;
  author_person_id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

function mapDiscussionMessage(row: DiscussionMessageRow): DiscussionMessage {
  return {
    id: row.id as DiscussionMessageId,
    threadId: row.thread_id as DiscussionThreadId,
    authorPersonId: row.author_person_id as PersonId,
    ...(row.profiles ? { authorName: row.profiles.full_name } : {}),
    body: row.body,
    createdAt: row.created_at,
  };
}

type ExperienceNoteRow = {
  enrollment_id: string;
  outcome_id: string;
  body: string;
  updated_at: string;
};

function mapExperienceNote(row: ExperienceNoteRow): OutcomeExperienceNote {
  return {
    enrollmentId: row.enrollment_id as EnrollmentId,
    outcomeId: row.outcome_id as OutcomeId,
    body: row.body,
    updatedAt: row.updated_at,
  };
}

export function mapPerson(row: ProfileRow, user: User): Person {
  const email = user.email;
  if (!email) throw new Error("Le compte Supabase authentifié ne possède pas d’adresse e-mail.");
  return {
    id: row.id,
    fullName: row.full_name,
    email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    provenance: nativeProvenance,
  };
}

export function mapEnrollment(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    personId: row.person_id,
    programId: row.program_id,
    cohortId: row.cohort_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    provenance: nativeProvenance,
  };
}

export function mapRoleAssignment(row: RoleAssignmentRow): RoleAssignment {
  let scope: RoleScope;
  const scopeKind: string = row.scope_kind;
  if (scopeKind === "platform") {
    if (row.program_id || row.scope_id) {
      throw new Error("Portée plateforme Supabase incohérente.");
    }
    scope = { kind: "platform" };
  } else {
    if (!row.program_id || !row.scope_id) {
      throw new Error("Portée de rôle Supabase incohérente.");
    }
    if (scopeKind === "program") {
      if (row.scope_id !== row.program_id) {
        throw new Error("Portée programme Supabase incohérente.");
      }
      scope = { kind: "program", programId: row.program_id };
    } else if (scopeKind === "cohort") {
      scope = { kind: "cohort", programId: row.program_id, cohortId: row.scope_id };
    } else if (scopeKind === "placement") {
      scope = { kind: "placement", programId: row.program_id, placementId: row.scope_id };
    } else {
      throw new Error(`Type de portée Supabase inconnu: ${scopeKind}`);
    }
  }
  return {
    personId: row.person_id,
    role: row.role,
    scope,
    grantedAt: row.granted_at,
    provenance: nativeProvenance,
  };
}

type AssessmentModalityRow = {
  id: string;
  program_id: string;
  name: string;
  mode: AssessmentModality["mode"];
  subtype: AssessmentModality["subtype"];
  usage: AssessmentModality["usage"];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function mapAssessmentModality(row: AssessmentModalityRow): AssessmentModality {
  return {
    id: row.id,
    programId: row.program_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mode: row.mode,
    subtype: row.subtype,
    usage: row.usage,
    ...(row.notes ? { notes: row.notes } : {}),
  };
}

type ResourceTextRow = {
  resource_id: string;
  resource_title: string;
  source_path: string;
  segment_index: number;
  content: string;
  rank: number;
};

type OutcomeRow = {
  id: string;
  program_id: string;
  curriculum_version_id: string;
  code: string;
  label: string;
  description: string;
  nature: Outcome["nature"];
  domain: string;
  target_mastery: Outcome["targetMastery"];
  retained_at: string | null;
  theme_id: string | null;
  position: number;
  knowledge_rank: Outcome["knowledgeRank"] | null;
  created_at: string;
};

type OutcomeThemeRow = {
  id: string;
  program_id: string;
  label: string;
  description: string;
  position: number;
  created_at: string;
};

export function mapOutcomeTheme(row: OutcomeThemeRow): OutcomeTheme {
  return {
    id: row.id as OutcomeThemeId,
    createdAt: row.created_at,
    provenance: nativeProvenance,
    programId: row.program_id as ProgramId,
    label: row.label,
    description: row.description,
    position: row.position,
  };
}

export function mapOutcome(row: OutcomeRow): Outcome {
  return {
    id: row.id as Outcome["id"],
    createdAt: row.created_at,
    provenance: nativeProvenance,
    programId: row.program_id as ProgramId,
    curriculumVersionId: row.curriculum_version_id as CurriculumVersionId,
    code: row.code,
    label: row.label,
    description: row.description,
    nature: row.nature,
    domain: row.domain,
    targetMastery: row.target_mastery,
    retainedAt: row.retained_at,
    ...(row.theme_id ? { themeId: row.theme_id as OutcomeThemeId } : {}),
    position: row.position ?? 0,
    ...(row.knowledge_rank ? { knowledgeRank: row.knowledge_rank } : {}),
  };
}

type PendingPersonRow = {
  id: string;
  program_id: string;
  first_name: string;
  last_name: string;
  login_email: string;
  institutional_id: string | null;
  origin: "individual" | "import" | "sync";
  intended_cohort_id: string | null;
  intended_role: "learner" | "placement_supervisor" | null;
  intended_placement_id: string | null;
  status: PendingPersonStatus;
  invited_at: string | null;
  cancelled_at: string | null;
  activated_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export function mapPendingPerson(row: PendingPersonRow): PendingPerson {
  return {
    id: row.id,
    programId: row.program_id,
    firstName: row.first_name,
    lastName: row.last_name,
    loginEmail: row.login_email,
    origin: row.origin,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.institutional_id ? { institutionalId: row.institutional_id } : {}),
    ...(row.intended_cohort_id ? { intendedCohortId: row.intended_cohort_id } : {}),
    ...(row.intended_role ? { intendedRole: row.intended_role } : {}),
    ...(row.intended_placement_id ? { intendedPlacementId: row.intended_placement_id } : {}),
    ...(row.invited_at ? { invitedAt: row.invited_at } : {}),
    ...(row.cancelled_at ? { cancelledAt: row.cancelled_at } : {}),
    ...(row.activated_profile_id ? { activatedProfileId: row.activated_profile_id } : {}),
  };
}

/**
 * `estimatedMinutes` n'existe pas encore côté base (colonne absente de
 * `learning_resources`) : fixé à 0 pour les supports créés réellement, en
 * attendant un chantier dédié à la durée estimée. `outcomeIds` n'est pas
 * renvoyé par la RPC (table de liaison séparée) : repris directement de la
 * saisie, puisqu'on vient de les insérer.
 */
type LearningResourceRow = {
  id: string;
  program_id: string;
  title: string;
  description: string;
  format: LearningResource["format"];
  visibility: ResourceVisibility;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  external_url?: string | null;
  created_by?: string | null;
};

const learningResourceColumns =
  "id,program_id,title,description,format,visibility,is_published,created_at,updated_at,external_url,created_by";

/**
 * Correspondance format technique -> vocabulaire de la grille médiathèque.
 * `other` n'a pas d'équivalent : il retombe sur "lien externe simple", le
 * type le moins engageant de la maquette.
 */
const MEDIA_KIND_BY_FORMAT: Record<LearningResource["format"], MediaKind> = {
  html: "web_page",
  pdf: "pdf",
  video: "video",
  narrated_slides: "slides_audio",
  link: "link",
  other: "link",
};

/** `staff_only` (base) n'a pas d'équivalent exact : "équipe pédagogique uniquement". */
const MEDIA_VISIBILITY_BY_RESOURCE_VISIBILITY: Record<ResourceVisibility, MediaVisibility> = {
  staff_only: "private",
  cohort: "cohort",
  program: "program",
};

function mapLearningResource(
  row: LearningResourceRow,
  outcomeIds: readonly OutcomeId[],
): LearningResource {
  return {
    id: row.id as LearningResourceId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    provenance: nativeProvenance,
    programId: row.program_id as ProgramId,
    title: row.title,
    format: row.format,
    outcomeIds,
    estimatedMinutes: 0,
  };
}

/**
 * Projection best-effort d'un support réel vers le type riche `MediaResource`
 * de la maquette, que la grille d'administration consomme encore. Les champs
 * sans équivalent en base sont neutres et assumés comme tels : pas de module,
 * pas d'historique de versions, pas de marquage "à réviser" (le modèle réel
 * publie immédiatement, cf. chantier Médiathèque). À supprimer le jour où
 * `MediaLibrarySection` consommera directement `LearningResource`.
 */
function mapMediaResource(
  row: LearningResourceRow,
  outcomeIds: readonly OutcomeId[],
  asset: ResourceAssetSummary | undefined,
): MediaResource {
  const mediaAsset: MediaAsset = row.external_url
    ? { kind: "url", label: row.external_url, storageActivated: false }
    : {
        kind: "file",
        label: asset?.original_file_name ?? "Fichiers téléversés dans le stockage privé",
        // Le stockage est bien actif pour un support réel : ne pas laisser
        // l'écran répéter la mention "non activé" héritée de la maquette.
        storageActivated: true,
      };
  return {
    id: row.id as MediaResourceId,
    programId: row.program_id as ProgramId,
    title: row.title,
    kind: MEDIA_KIND_BY_FORMAT[row.format],
    module: MEDIA_MODULE_UNCLASSIFIED,
    description: row.description,
    outcomeIds,
    version: "1",
    status: (row.is_published ? "published" : "draft") satisfies MediaStatus,
    visibility: MEDIA_VISIBILITY_BY_RESOURCE_VISIBILITY[row.visibility],
    authorPersonId: (row.created_by ?? "") as MediaResource["authorPersonId"],
    updatedAt: row.updated_at,
    needsReview: false,
    asset: mediaAsset,
    versions: [],
    provenance: nativeProvenance,
  };
}

type ResourceAssetSummary = {
  resource_id: string;
  original_file_name: string | null;
  object_path: string;
};

/** Libellé de regroupement par défaut : la base ne porte pas encore de module. */
const MEDIA_MODULE_UNCLASSIFIED = "Non classé";

/**
 * Objectifs rattachés à un lot de supports, en une seule requête.
 * Renvoie une table vide plutôt que d'échouer si aucun support n'est fourni.
 */
async function loadOutcomeIdsByResource(
  client: SupabaseClient,
  resourceIds: readonly string[],
): Promise<Map<string, OutcomeId[]>> {
  const byResource = new Map<string, OutcomeId[]>();
  if (resourceIds.length === 0) return byResource;
  const { data, error } = await client
    .from("learning_resource_outcomes")
    .select("resource_id,outcome_id")
    .in("resource_id", [...resourceIds]);
  assertNoSupabaseError(error);
  for (const link of (data ?? []) as { resource_id: string; outcome_id: string }[]) {
    const current = byResource.get(link.resource_id) ?? [];
    current.push(link.outcome_id as OutcomeId);
    byResource.set(link.resource_id, current);
  }
  return byResource;
}

/**
 * Fichier source représentatif de chaque support (le plus ancien enregistré).
 * Les assets dérivés (images/audio de diapositives) ne servent pas ici.
 */
async function loadSourceAssetsByResource(
  client: SupabaseClient,
  resourceIds: readonly string[],
): Promise<Map<string, ResourceAssetSummary>> {
  const byResource = new Map<string, ResourceAssetSummary>();
  if (resourceIds.length === 0) return byResource;
  const { data, error } = await client
    .from("learning_resource_assets")
    .select("resource_id,original_file_name,object_path,created_at")
    .in("resource_id", [...resourceIds])
    .eq("kind", "source")
    .order("created_at", { ascending: true });
  assertNoSupabaseError(error);
  for (const asset of (data ?? []) as ResourceAssetSummary[]) {
    if (!byResource.has(asset.resource_id)) byResource.set(asset.resource_id, asset);
  }
  return byResource;
}

const pendingPersonColumns =
  "id,program_id,first_name,last_name,login_email,institutional_id,origin,intended_cohort_id,intended_role,intended_placement_id,status,invited_at,cancelled_at,activated_profile_id,created_at,updated_at";

const programColumns =
  "id,code,name,kind,institution,annual_learner_estimate,placements_enabled,simulation_enabled,audits_enabled,pre_post_tests_enabled,sessions_enabled,dpc_enabled,learner_plan_shifts_enabled,target_mastery,locale,design_draft,created_at,updated_at";

const assessmentModalityColumns =
  "id,program_id,name,mode,subtype,usage,notes,created_at,updated_at";

const outcomeColumns =
  "id,program_id,curriculum_version_id,code,label,description,nature,domain,target_mastery,retained_at,theme_id,position,knowledge_rank,created_at";

const outcomeThemeColumns = "id,program_id,label,description,position,created_at";

/**
 * Lien signé pour chaque fichier demandé, groupé par bucket. Un fichier dont
 * le lien ne peut pas être produit est simplement absent du résultat :
 * l'appelant retombe alors sur ce qu'il a (l'affiche plutôt que le clip).
 */
async function signAssetUrls(
  client: SupabaseClient,
  assetIds: readonly string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (assetIds.length === 0) return signed;

  const { data, error } = await client
    .from("learning_resource_assets")
    .select("id,bucket_name,object_path")
    .in("id", [...assetIds]);
  assertNoSupabaseError(error);

  const rows = (data ?? []) as { id: string; bucket_name: string; object_path: string }[];
  const byBucket = new Map<string, typeof rows>();
  for (const row of rows) {
    byBucket.set(row.bucket_name, [...(byBucket.get(row.bucket_name) ?? []), row]);
  }

  await Promise.all(
    [...byBucket.entries()].map(async ([bucket, bucketRows]) => {
      const { data: urls, error: signError } = await client.storage.from(bucket).createSignedUrls(
        bucketRows.map((row) => row.object_path),
        3600,
      );
      if (signError) return;
      for (const [index, entry] of (urls ?? []).entries()) {
        const row = bucketRows[index];
        if (row && entry?.signedUrl) signed.set(row.id, entry.signedUrl);
      }
    }),
  );
  return signed;
}

/**
 * Première tranche Supabase. Les repositories non encore migrés restent
 * explicitement délégués au mock afin de préserver les écrans existants.
 */
/** Colonnes et projection d'un passage ECOS externe (migration 20260913100000). */
const ecosRunColumns =
  "id, enrollment_id, program_id, station_key, station_label, played_on, score, max_score, item_count, created_at";

interface EcosRunRow {
  id: string;
  enrollment_id: string;
  program_id: string;
  station_key: string;
  station_label: string;
  played_on: string;
  score: number | string;
  max_score: number | string;
  item_count: number;
  created_at: string;
}

function mapEcosRun(row: EcosRunRow): EcosExternalRun {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id as EnrollmentId,
    programId: row.program_id as ProgramId,
    stationKey: row.station_key,
    stationLabel: row.station_label,
    playedOn: row.played_on,
    score: Number(row.score),
    maxScore: Number(row.max_score),
    itemCount: row.item_count,
    createdAt: row.created_at,
  };
}

export function createSupabaseDataAccess(client: SupabaseClient): DataAccess {
  return {
    ...mockDataAccess,
    isMock: false,
    /**
     * Carnets de stage — LECTURE ET ECRITURE REELLES (07/09).
     *
     * Avant ce jour, ce depot n'existait pas cote Supabase : le carnet de
     * l'apprenant affichait `stageLogFixtures`, donc des journees INVENTEES, en
     * production.
     *
     * Le perimetre de `listLogsToValidate` n'est pas calcule ici : la policy
     * s'appuie sur `supervises_enrollment()`, qui passe par les GROUPES. Un
     * encadrant ne recoit donc que les carnets de ses groupes, meme si l'ecran
     * demande tout le programme.
     */
    /**
     * Reglage de l'assistant IA — LECTURE ET ECRITURE REELLES (09/09).
     *
     * LA LECTURE PASSE PAR LA TABLE, L'ECRITURE PAR UNE FONCTION. La table
     * n'accorde que `select` a `authenticated` : il n'existe aucune policy
     * d'ecriture, et c'est deliberé — `set_program_ai_settings` verifie
     * `can_administer_program` et laisse `active_provider` intacte, ce qu'un
     * `update` colonne par colonne ne garantirait pas.
     *
     * L'ERREUR DE LA BASE REMONTE TELLE QUELLE. Le declencheur
     * `program_ai_settings_guard` refuse l'ouverture sans moteur avec une
     * phrase qui dit ce qui manque ; la remplacer par un message generique
     * couterait l'information au moment ou elle sert.
     */
    programAi: {
      async getSettings(programId: ProgramId) {
        const { data, error } = await client
          .from("program_ai_settings")
          .select("program_id, enabled, monthly_credit_cap, fallback_policy, active_provider")
          .eq("program_id", programId)
          .maybeSingle();
        assertNoSupabaseError(error);
        // Pas de ligne = pas d'IA. Voir `defaultProgramAiSettings`.
        if (!data) return defaultProgramAiSettings(programId);
        return mapProgramAiSettings(data as ProgramAiSettingsRow);
      },
      async saveSettings(input: {
        programId: ProgramId;
        enabled: boolean;
        monthlyCreditCap: number;
        fallbackPolicy: AiFallbackPolicy;
      }) {
        const { data, error } = await client.rpc("set_program_ai_settings", {
          p_program_id: input.programId,
          p_enabled: input.enabled,
          p_monthly_credit_cap: input.monthlyCreditCap,
          p_fallback_policy: input.fallbackPolicy,
        });
        assertNoSupabaseError(error);
        if (!data) {
          throw new Error("Le réglage n’a pas été enregistré : la base n’a rien renvoyé.");
        }
        return mapProgramAiSettings(data as ProgramAiSettingsRow);
      },
      async getUsageThisMonth(programId: ProgramId) {
        const { data, error } = await client.rpc("program_ai_usage_this_month", {
          p_program_id: programId,
        });
        assertNoSupabaseError(error);
        /*
         * UNE FONCTION `returns table` REND UN TABLEAU, meme pour une seule
         * ligne. Aucune ligne reste une reponse possible si la fonction change
         * un jour : on rend alors des zeros plutot que de laisser l'ecran
         * planter sur une lecture de propriete indefinie.
         */
        const rows = (data ?? []) as ProgramAiUsageRow[];
        const row = rows[0];
        if (!row) {
          return { creditsTotal: 0, messagesTotal: 0, learnersActive: 0, learnersAtCap: 0 };
        }
        return {
          creditsTotal: row.credits_total,
          messagesTotal: row.messages_total,
          learnersActive: row.apprenants_actifs,
          learnersAtCap: row.apprenants_au_plafond,
        };
      },
    },
    stageLogs: {
      ...mockDataAccess.stageLogs,
      async listTemplates() {
        // Aucun modele de carnet n'est configure : la table est vide, et
        // inventer un modele donnerait un formulaire qui ne correspond a rien.
        return [];
      },
      async listLogsForEnrollment(enrollmentId: EnrollmentId) {
        const { data, error } = await client
          .from("stage_logs")
          .select(stageLogColumns)
          .eq("enrollment_id", enrollmentId);
        assertNoSupabaseError(error);
        return ((data ?? []) as unknown as StageLogRow[]).map(mapStageLog);
      },
      async listLogsToValidate(programId: ProgramId) {
        const { data, error } = await client
          .from("stage_logs")
          .select(stageLogColumns)
          .eq("program_id", programId);
        assertNoSupabaseError(error);
        return ((data ?? []) as unknown as StageLogRow[]).map(mapStageLog);
      },
      async listLogsReceived(programId: ProgramId) {
        const { data, error } = await client
          .from("stage_logs")
          .select(stageLogColumns)
          .eq("program_id", programId)
          .in("status", ["validated", "transmitted"]);
        assertNoSupabaseError(error);
        return ((data ?? []) as unknown as StageLogRow[]).map(mapStageLog);
      },
      async saveStageLogDay(input) {
        const { error } = await client.rpc("save_stage_log_day", {
          p_enrollment_id: input.enrollmentId,
          p_placement_id: input.placementId,
          p_occurred_on: input.occurredOn,
          p_narrative: input.narrative,
        });
        assertNoSupabaseError(error);
      },
      async deleteStageLogDay(input) {
        const { error } = await client.rpc("delete_stage_log_day", {
          p_enrollment_id: input.enrollmentId,
          p_placement_id: input.placementId,
          p_occurred_on: input.occurredOn,
        });
        assertNoSupabaseError(error);
      },
      async validateStageLogBlock(input) {
        const { error } = await client.rpc("validate_stage_log_block", {
          p_stage_log_id: input.stageLogId,
          p_covers_from: input.coversFrom,
          p_covers_to: input.coversTo,
          p_decision: input.decision,
          p_comment: input.comment,
        });
        assertNoSupabaseError(error);
      },
      async openStageLogsForGroup(groupId) {
        const { error } = await client.rpc("open_stage_logs_for_group", {
          p_group_id: groupId,
        });
        assertNoSupabaseError(error);
      },
    },
    /**
     * ECOS VIRTUEL EXTERNE (migration 20260913100000). Lecture directe des deux
     * tables sous RLS ; ecriture par les deux fonctions serveur. `score` et
     * `max_score` arrivent en numeric, donc en chaine : on les convertit ici,
     * une fois, pour que l'ecran ne fasse jamais d'arithmetique sur du texte.
     */
    ecosExternal: {
      async listRunsForEnrollment(enrollmentId) {
        const { data, error } = await client
          .from("ecos_external_runs")
          .select(ecosRunColumns)
          .eq("enrollment_id", enrollmentId)
          .order("played_on", { ascending: false })
          .order("created_at", { ascending: false });
        assertNoSupabaseError(error);
        return ((data ?? []) as unknown as EcosRunRow[]).map(mapEcosRun);
      },
      async listRunsForProgram(programId) {
        const { data, error } = await client
          .from("ecos_external_runs")
          .select(ecosRunColumns)
          .eq("program_id", programId)
          .order("played_on", { ascending: false });
        assertNoSupabaseError(error);
        return ((data ?? []) as unknown as EcosRunRow[]).map(mapEcosRun);
      },
      async listRunItems(runId) {
        const { data, error } = await client
          .from("ecos_external_run_items")
          .select("position, label, max_points, points")
          .eq("run_id", runId)
          .order("position", { ascending: true });
        assertNoSupabaseError(error);
        return (
          (data ?? []) as unknown as readonly {
            position: number;
            label: string;
            max_points: number | string;
            points: number | string;
          }[]
        ).map(
          (row): EcosGridItem => ({
            label: row.label,
            maxPoints: Number(row.max_points),
            points: Number(row.points),
          }),
        );
      },
      async recordRun(input) {
        const { data, error } = await client.rpc("record_ecos_external_run", {
          p_enrollment_id: input.enrollmentId,
          p_station_key: input.stationKey,
          p_station_label: input.stationLabel,
          p_played_on: input.playedOn,
          p_items: input.items.map((i) => ({
            label: i.label,
            max_points: i.maxPoints,
            points: i.points,
          })),
        });
        assertNoSupabaseError(error);
        return String(data);
      },
      async deleteRun(runId) {
        const { error } = await client.rpc("delete_ecos_external_run", { p_run_id: runId });
        assertNoSupabaseError(error);
      },
    },
    /**
     * ENCADREMENT — les deux lectures qui donnent un NOM aux affectations.
     *
     * Sans elles, brancher les affectations ne se voit pas : `useSupervision`
     * obtient les bons `enrollmentIds`, puis demande au depot `supervision`
     * qui sont ces gens — et ce depot n'etait surcharge NULLE PART, donc les
     * deux appels tombaient sur le mock, dont les fixtures sont indexees sur
     * des identifiants de maquette. Avec de vrais identifiants, le mock ne
     * trouve rien : l'ecran affichait une affectation sans personne en face.
     *
     * Les AUTRES lectures de `supervision` (alertes, cas, confirmations,
     * bilans, messagerie) restent au mock A DESSEIN : elles n'ont aucune table
     * en base. Elles filtrent toutes sur `programId`, donc avec l'identifiant
     * reel de DFASM-CARDIO elles rendent VIDE — un ecran vide, jamais du faux
     * credible.
     */
    supervision: {
      ...mockDataAccess.supervision,
      async listEnrollmentsByIds(ids) {
        /* `in` sur une liste vide leve cote PostgREST : on coupe court. */
        if (ids.length === 0) return [];
        const { data, error } = await client
          .from("enrollments")
          .select("id,person_id,program_id,cohort_id,status,created_at,updated_at")
          .in("id", ids);
        assertNoSupabaseError(error);
        return ((data ?? []) as EnrollmentRow[]).map(mapEnrollment);
      },
      /**
       * `profiles` NE PORTE AUCUNE ADRESSE (colonne absente ; la RLS ne la
       * donne qu'au titulaire via `auth.getUser()`). On rend donc `email: ""`,
       * comme `administration.listPeople` le fait deja, plutot que d'inventer
       * une adresse. Aucun ecran d'encadrement n'affiche l'adresse d'un
       * apprenant : seul le NOM est lu, par `learnerName()`.
       *
       * Le perimetre est borne par la policy `profiles_select_scoped` :
       * `can_read_profile` accorde la lecture au personnel du programme, et
       * `is_program_staff` inclut `placement_supervisor`.
       */
      async listPeopleByIds(ids) {
        if (ids.length === 0) return [];
        const { data, error } = await client
          .from("profiles")
          .select("id,full_name,created_at,updated_at")
          .in("id", ids);
        assertNoSupabaseError(error);
        return ((data ?? []) as ProfileRow[]).map((row) => ({
          id: row.id,
          fullName: row.full_name,
          email: "",
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          provenance: nativeProvenance,
        }));
      },
    },
    /**
     * Terrains de stage — LECTURE REELLE (07/09).
     *
     * `placements` n'accepte aucune ecriture directe : la migration
     * 20260831093000 revoque tout et n'accorde que le `select` aux
     * authentifies. La creation passera par la fonction `create_placement`.
     *
     * LES AFFECTATIONS SONT DERIVEES DES GROUPES depuis le 10/09 (option 1
     * choisie par Stef). Il n'existe toujours AUCUNE table
     * `placement_assignments`, et il ne doit pas y en avoir : le rattachement
     * d'un etudiant a un encadrant est porte par les groupes, qui gouvernent
     * deja la RLS des carnets. Les dates viennent de la promotion, comme pour
     * le carnet ; le statut se calcule. Les trois lectures ci-dessous sont la
     * meme requete vue par trois portes.
     */
    placements: {
      ...mockDataAccess.placements,
      async listPlacements(programId: ProgramId) {
        const { data, error } = await client
          .from("placements")
          .select(placementColumns)
          .eq("program_id", programId)
          .order("name");
        assertNoSupabaseError(error);
        return ((data ?? []) as PlacementRow[]).map(mapPlacement);
      },
      async listAssignmentsForProgram(programId: ProgramId) {
        return listPlacementAssignments(client, { programId });
      },
      async listAssignmentsForEnrollment(enrollmentId: EnrollmentId) {
        /*
         * L'APPRENANT N'A PAS DE `programId` SOUS LA MAIN a cet appel : c'est
         * pour cela que les trois filtres de la fonction acceptent NULL.
         */
        return listPlacementAssignments(client, { enrollmentId });
      },
      async listAssignmentsForSupervisor(personId: PersonId, programId: ProgramId) {
        return listPlacementAssignments(client, { programId, supervisorPersonId: personId });
      },
      /**
       * Ecriture : la migration 20260831093000 revoque tout et n'accorde que le
       * `select`. Chaque mutation passe donc par sa fonction `security definer`,
       * qui verifie `can_administer_program` cote serveur.
       */
      async createPlacement(input) {
        const { data, error } = await client.rpc("create_placement", {
          p_program_id: input.programId,
          p_name: input.name,
          p_site: input.site,
          p_department: input.department,
          p_capacity: input.capacity,
        });
        assertNoSupabaseError(error);
        return mapPlacement(data as PlacementRow);
      },
      /**
       * LES SEMAINES DU STAGE, lues pour TOUT le programme d un coup.
       *
       * La policy `supervision_group_weeks_select` borne deja la portee au
       * programme de la personne : filtrer ici sur les groupes qu on connait
       * ferait une seconde verite a tenir d accord avec la RLS. On demande
       * donc tout ce que la base accepte de rendre.
       */
      async listSupervisionGroupWeeks(programId: ProgramId) {
        const { data, error } = await client
          .from("supervision_group_weeks")
          .select("group_id, week_start, kind, supervision_groups!inner(program_id)")
          .eq("supervision_groups.program_id", programId)
          .order("week_start");
        assertNoSupabaseError(error);
        return ((data ?? []) as { group_id: string; week_start: string; kind: string }[]).map(
          (row) => ({
            groupId: row.group_id as SupervisionGroupId,
            weekStart: row.week_start.slice(0, 10),
            kind: row.kind as "on" | "off",
          }),
        );
      },
      async joinSupervisionGroup(groupId) {
        const { error } = await client.rpc("join_supervision_group", {
          p_group_id: groupId,
        });
        assertNoSupabaseError(error);
      },
      async setSupervisionGroupWeek(input) {
        const { error } = await client.rpc("set_supervision_group_week", {
          p_group_id: input.groupId,
          p_week_start: input.weekStart,
          p_kind: input.kind,
        });
        assertNoSupabaseError(error);
      },
      async generateSupervisionGroupWeeks(input) {
        const { data, error } = await client.rpc("generate_supervision_group_weeks", {
          p_group_id: input.groupId,
          p_first_kind: input.firstKind,
          p_period: input.period,
        });
        assertNoSupabaseError(error);
        return (data as number) ?? 0;
      },
      async listSupervisionGroups(programId: ProgramId) {
        const { data, error } = await client
          .from("supervision_groups")
          .select(supervisionGroupColumns)
          .eq("program_id", programId)
          .order("label");
        assertNoSupabaseError(error);
        return ((data ?? []) as unknown as SupervisionGroupRow[]).map(mapSupervisionGroup);
      },
      async createSupervisionGroup(input) {
        const { data, error } = await client.rpc("create_supervision_group", {
          p_cohort_id: input.cohortId,
          p_placement_id: input.placementId,
          p_label: input.label,
        });
        assertNoSupabaseError(error);
        const row = data as SupervisionGroupRow;
        // La fonction rend la LIGNE du groupe, sans ses membres ni ses
        // encadrants : le groupe vient de naitre, les deux listes sont vides.
        return mapSupervisionGroup({
          ...row,
          supervision_group_members: [],
          supervision_group_supervisors: [],
        });
      },
      async setSupervisionGroupMembers(groupId, enrollmentIds) {
        const { error } = await client.rpc("set_group_members", {
          p_group_id: groupId,
          p_enrollment_ids: [...enrollmentIds],
        });
        assertNoSupabaseError(error);
      },
      async setSupervisionGroupSupervisors(groupId, personIds) {
        const { error } = await client.rpc("set_group_supervisors", {
          p_group_id: groupId,
          p_person_ids: [...personIds],
        });
        assertNoSupabaseError(error);
      },
    },
    programs: {
      ...mockDataAccess.programs,
      async listPrograms() {
        const { data, error } = await client.from("programs").select(programColumns).order("name");
        assertNoSupabaseError(error);
        return ((data ?? []) as ProgramRow[]).map(mapProgram);
      },
      async getProgram(id: ProgramId) {
        const { data, error } = await client
          .from("programs")
          .select(programColumns)
          .eq("id", id)
          .maybeSingle();
        assertNoSupabaseError(error);
        return data ? mapProgram(data as ProgramRow) : undefined;
      },
      /*
       * RENDRE LE PROGRAMME RELU, ET NON L'ARGUMENT ENVOYE. La RPC rend la
       * ligne apres ecriture : c'est la base qui dit ce qui a ete enregistre,
       * pas l'ecran qui reaffiche ce qu'il croyait avoir demande.
       */
      async setLearnerPlanShifts(programId: ProgramId, enabled: boolean) {
        const { data, error } = await client.rpc("set_learner_plan_shifts", {
          p_program_id: programId,
          p_enabled: enabled,
        });
        assertNoSupabaseError(error);
        if (!data) throw new Error("Réglage non enregistré.");
        return mapProgram(data as ProgramRow);
      },
      async saveProgramDesignDraft(programId: ProgramId, draft: Record<string, unknown> | null) {
        const { error } = await client.rpc("save_program_design_draft", {
          p_program_id: programId,
          p_draft: draft,
        });
        assertNoSupabaseError(error);
      },
      async analyzeObjectivesForReferential(programId: ProgramId, text: string) {
        const { data, error } = await client.functions.invoke("analyze-program-objectives", {
          body: { programId, text },
        });
        if (error) {
          let message = error instanceof Error ? error.message : "Analyse IA impossible.";
          // FunctionsHttpError expose la réponse brute dans `context` : on y
          // récupère le message métier précis (droits, quota, erreur OpenAI…)
          // plutôt que le générique "non-2xx status code".
          const context = (error as { context?: Response }).context;
          if (context) {
            try {
              const body = (await context.clone().json()) as { error?: string };
              if (body.error) message = body.error;
            } catch {
              // corps non-JSON : on garde le message générique.
            }
          }
          throw new Error(message);
        }
        const payload = data as Partial<ProgramAiAnalysisResult> | null;
        return {
          knowledgeItems: payload?.knowledgeItems ?? [],
          assessmentModalities: payload?.assessmentModalities ?? [],
          truncated: payload?.truncated ?? false,
        };
      },
      async listCurriculumVersions(programId: ProgramId) {
        const { data, error } = await client
          .from("curriculum_versions")
          .select("id,program_id,label,effective_from,status,created_at")
          .eq("program_id", programId)
          .order("effective_from");
        assertNoSupabaseError(error);
        return ((data ?? []) as CurriculumVersionRow[]).map(mapCurriculumVersion);
      },
      async listCohorts(programId?: ProgramId, options?: { includeArchived?: boolean }) {
        let query = client
          .from("cohorts")
          .select(
            "id,program_id,curriculum_version_id,label,academic_year,starts_on,ends_on,status,archived_at,created_at,enrollments(count)",
          )
          .order("starts_on");
        if (programId) query = query.eq("program_id", programId);
        // Par défaut les classes archivées sont invisibles, exactement comme
        // les acquis archivés : seul l'écran qui propose de désarchiver les
        // demande explicitement.
        if (!options?.includeArchived) query = query.is("archived_at", null);
        const { data, error } = await query;
        assertNoSupabaseError(error);
        return ((data ?? []) as (CohortRow & { enrollments: { count: number }[] })[]).map((row) =>
          mapCohort(row, row.enrollments?.[0]?.count ?? 0),
        );
      },
      async getCohort(id: CohortId) {
        const { data, error } = await client
          .from("cohorts")
          .select(
            "id,program_id,curriculum_version_id,label,academic_year,starts_on,ends_on,status,archived_at,created_at,enrollments(count)",
          )
          .eq("id", id)
          .maybeSingle();
        assertNoSupabaseError(error);
        if (!data) return undefined;
        const row = data as CohortRow & { enrollments: { count: number }[] };
        return mapCohort(row, row.enrollments?.[0]?.count ?? 0);
      },
      /**
       * RPC `SECURITY DEFINER` : `authenticated` n'a qu'un droit de lecture
       * sur `cohorts` (voir GRANT dans la migration RLS) — la création passe
       * donc par une fonction serveur, même famille que `grant_role_assignment`.
       */
      async createCohort(input: CreateCohortInput) {
        const { data, error } = await client.rpc("create_cohort", {
          p_program_id: input.programId,
          p_curriculum_version_id: input.curriculumVersionId,
          p_label: input.label,
          p_academic_year: input.academicYear,
          p_starts_on: input.startsOn,
          p_ends_on: input.endsOn,
        });
        assertNoSupabaseError(error);
        return mapCohort(data as CohortRow, 0);
      },
      /** Même famille que `create_cohort` : RPC `SECURITY DEFINER`, droits au serveur. */
      async openCohort(cohortId, options) {
        const { data, error } = await client.rpc("open_cohort", {
          p_cohort_id: cohortId,
          p_dry_run: options?.dryRun ?? false,
        });
        assertNoSupabaseError(error);
        // `returns table` rend toujours un tableau, même pour une seule ligne.
        const row = (
          (data ?? []) as {
            jalons: number;
            acquis: number;
            jalons_vides: number;
            version_activee: boolean;
          }[]
        )[0];
        return {
          milestones: row?.jalons ?? 0,
          outcomes: row?.acquis ?? 0,
          emptyMilestones: row?.jalons_vides ?? 0,
          versionActivated: row?.version_activee ?? false,
        };
      },
      async revertCohortToDraft(cohortId) {
        const { error } = await client.rpc("revert_cohort_to_draft", {
          p_cohort_id: cohortId,
        });
        assertNoSupabaseError(error);
      },
      async updateCohort(input) {
        const { data, error } = await client.rpc("update_cohort", {
          p_cohort_id: input.cohortId,
          p_label: input.label,
          p_academic_year: input.academicYear,
          p_starts_on: input.startsOn,
          p_ends_on: input.endsOn,
        });
        assertNoSupabaseError(error);
        const row = data as CohortRow;
        return mapCohort(row, 0);
      },
      async setCohortArchived(cohortId, archived) {
        const { data, error } = await client.rpc("set_cohort_archived", {
          p_cohort_id: cohortId,
          p_archived: archived,
        });
        assertNoSupabaseError(error);
        return mapCohort(data as CohortRow, 0);
      },
    },
    people: {
      ...mockDataAccess.people,
      /**
       * Corrige sa propre fiche. La policy `profiles_update_self` decide : on ne
       * reecrit aucune regle ici, on se contente de viser la ligne de l'appelant.
       *
       * `auth.getUser()` plutot qu'un identifiant passe en argument : un ecran
       * qui transmettrait l'identifiant pourrait, par erreur ou par malice, en
       * transmettre un autre. La RLS le refuserait — mais autant ne jamais poser
       * la question.
       */
      async updateOwnProfile(input) {
        const {
          data: { user },
          error: userError,
        } = await client.auth.getUser();
        if (userError || !user) throw new Error("Session expiree : reconnectez-vous.");

        const nom = input.fullName.trim();
        if (nom.length === 0) throw new Error("Le nom ne peut pas etre vide.");

        const { data, error } = await client
          .from("profiles")
          .update({ full_name: nom, updated_at: new Date().toISOString() })
          .eq("id", user.id)
          .select("id, full_name, created_at, updated_at")
          .single();
        assertNoSupabaseError(error);
        return mapPerson(data as ProfileRow, user);
      },
      async getPerson(id) {
        const { data: userData, error: userError } = await client.auth.getUser();
        assertNoSupabaseError(userError);
        if (!userData.user || userData.user.id !== id) return undefined;
        const { data, error } = await client
          .from("profiles")
          .select("id,full_name,created_at,updated_at")
          .eq("id", id)
          .maybeSingle();
        assertNoSupabaseError(error);
        return data ? mapPerson(data as ProfileRow, userData.user) : undefined;
      },
      async listEnrollments(personId) {
        const { data, error } = await client
          .from("enrollments")
          .select("id,person_id,program_id,cohort_id,status,created_at,updated_at")
          .eq("person_id", personId);
        assertNoSupabaseError(error);
        return ((data ?? []) as EnrollmentRow[]).map(mapEnrollment);
      },
      async listRoleAssignments(personId) {
        const { data, error } = await client
          .from("role_assignments")
          .select("person_id,role,scope_kind,scope_id,program_id,granted_at")
          .eq("person_id", personId)
          .is("revoked_at", null);
        assertNoSupabaseError(error);
        return ((data ?? []) as RoleAssignmentRow[]).map(mapRoleAssignment);
      },
    },
    peopleStaging: {
      async listPendingPeople(programId: ProgramId) {
        const { data, error } = await client
          .from("people")
          .select(pendingPersonColumns)
          .eq("program_id", programId)
          .order("created_at", { ascending: false });
        assertNoSupabaseError(error);
        return ((data ?? []) as PendingPersonRow[]).map(mapPendingPerson);
      },
      async createPendingPerson(input: CreatePendingPersonInput) {
        /* La base refuserait par contrainte, avec un message illisible. */
        const issue = roleIntentIssue(input);
        if (issue) throw new Error(issue);
        const { data: userData, error: userError } = await client.auth.getUser();
        assertNoSupabaseError(userError);
        if (!userData.user) throw new Error("Authentification requise.");
        const { data, error } = await client
          .from("people")
          .insert({
            program_id: input.programId,
            first_name: input.firstName,
            last_name: input.lastName,
            login_email: input.loginEmail.trim().toLowerCase(),
            institutional_id: input.institutionalId ?? null,
            intended_cohort_id: input.intendedCohortId ?? null,
            intended_role: input.intendedRole ?? null,
            intended_placement_id: input.intendedPlacementId ?? null,
            origin: "individual",
            created_by: userData.user.id,
          })
          .select(pendingPersonColumns)
          .single();
        assertNoSupabaseError(error);
        return mapPendingPerson(data as PendingPersonRow);
      },
      /**
       * Écriture DIRECTE sur la table, sans RPC : la policy
       * `people_update_staff` autorise déjà le staff du programme, et le
       * `grant update` est posé. Ajouter une fonction serveur ici ne
       * garantirait rien de plus que ce que la RLS garantit.
       */
      async updatePendingPerson(input: UpdatePendingPersonInput) {
        const patch: Record<string, unknown> = {};
        if (input.firstName !== undefined) patch["first_name"] = input.firstName.trim();
        if (input.lastName !== undefined) patch["last_name"] = input.lastName.trim();
        if (input.loginEmail !== undefined) {
          patch["login_email"] = normalizeLoginEmail(input.loginEmail);
        }
        // Les deux drapeaux d'abord : « vider » l'emporte sur « ne pas toucher ».
        if (input.clearInstitutionalId === true) patch["institutional_id"] = null;
        else if (input.institutionalId !== undefined) {
          patch["institutional_id"] = input.institutionalId.trim();
        }
        if (input.clearIntendedCohortId === true) patch["intended_cohort_id"] = null;
        else if (input.intendedCohortId !== undefined) {
          patch["intended_cohort_id"] = input.intendedCohortId;
        }

        if (Object.keys(patch).length === 0) {
          // Rien à écrire : on relit plutôt que d'envoyer un update vide, qui
          // ferait quand même avancer `updated_at`.
          const { data, error } = await client
            .from("people")
            .select(pendingPersonColumns)
            .eq("id", input.personId)
            .single();
          assertNoSupabaseError(error);
          return mapPendingPerson(data as PendingPersonRow);
        }

        const { data, error } = await client
          .from("people")
          .update(patch)
          .eq("id", input.personId)
          .select(pendingPersonColumns)
          .single();
        assertNoSupabaseError(error);
        return mapPendingPerson(data as PendingPersonRow);
      },
      async setPendingPersonCancelled(personId: PendingPersonId, cancelled: boolean) {
        const { data: current, error: readError } = await client
          .from("people")
          .select(pendingPersonColumns)
          .eq("id", personId)
          .single();
        assertNoSupabaseError(readError);
        const person = mapPendingPerson(current as PendingPersonRow);

        /*
         * `cancelled_at` accompagne toujours le statut : la contrainte
         * `people_status_cancelled_coherent` lie les deux, et écrire l'un sans
         * l'autre ferait échouer l'écriture entière.
         */
        const patch = cancelled
          ? { status: "cancelled", cancelled_at: new Date().toISOString() }
          : { status: statusAfterRestore(person), cancelled_at: null };

        const { data, error } = await client
          .from("people")
          .update(patch)
          .eq("id", personId)
          .select(pendingPersonColumns)
          .single();
        assertNoSupabaseError(error);
        return mapPendingPerson(data as PendingPersonRow);
      },
      async sendInvitations(personIds: readonly PendingPersonId[]) {
        if (personIds.length === 0) return [];
        const { data, error } = await client.functions.invoke("invite-person", {
          body: { personIds },
        });
        if (error) {
          const message =
            error instanceof Error ? error.message : "Envoi de l’invitation impossible.";
          return personIds.map((personId) => ({ personId, ok: false, error: message }));
        }
        const payload = data as { results?: SendInvitationOutcome[] } | null;
        return payload?.results ?? personIds.map((personId) => ({ personId, ok: false }));
      },
    },
    administration: {
      ...mockDataAccess.administration,
      /**
       * `profiles` n'expose pas d'adresse e-mail (colonne absente, RLS ne la
       * donne qu'au titulaire via `auth.getUser()`) : seul le nom est
       * disponible ici pour les AUTRES comptes. Suffisant pour le
       * sélecteur « Accorder un droit », qui n'affiche jamais l'e-mail.
       * La visibilité des lignes est déjà bornée par la policy RLS
       * `profiles_select_scoped` (auto/lié par un programme administré).
       */
      async listPeople() {
        const { data, error } = await client
          .from("profiles")
          .select("id,full_name,created_at,updated_at")
          .order("full_name");
        assertNoSupabaseError(error);
        return ((data ?? []) as ProfileRow[]).map((row) => ({
          id: row.id,
          fullName: row.full_name,
          email: "",
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          provenance: nativeProvenance,
        }));
      },
      async listAllRoleAssignments() {
        const { data, error } = await client
          .from("role_assignments")
          .select("person_id,role,scope_kind,scope_id,program_id,granted_at")
          .is("revoked_at", null);
        assertNoSupabaseError(error);
        return ((data ?? []) as RoleAssignmentRow[]).map(mapRoleAssignment);
      },
      /**
       * Les inscriptions RÉELLES du programme, pour tous les écrans
       * d'administration. Auparavant servie par le mock, dont les fixtures
       * portent des identifiants de programme littéraux (`prog-dfasm-cardio`) :
       * filtrées sur un UUID réel, elles rendaient TOUJOURS une liste vide.
       * La visibilité est bornée côté serveur par la policy
       * `enrollments_select_scoped` : le titulaire, ou le personnel du
       * programme (`is_program_staff`).
       */
      async listAllEnrollments(programId: ProgramId) {
        const { data, error } = await client
          .from("enrollments")
          .select("id,person_id,program_id,cohort_id,status,created_at,updated_at")
          .eq("program_id", programId);
        assertNoSupabaseError(error);
        return ((data ?? []) as EnrollmentRow[]).map(mapEnrollment);
      },
      /**
       * RPC `SECURITY DEFINER` : écrit atomiquement dans `role_assignments`
       * ET `audit_events` (motif obligatoire). Anti-escalade et vérification
       * des droits déjà appliquées côté serveur (voir la fonction SQL).
       */
      async grantRoleAssignment(input: GrantRoleAssignmentInput) {
        const { data, error } = await client.rpc("grant_role_assignment", {
          p_person_id: input.personId,
          p_role: input.role,
          p_scope_kind: input.scopeKind,
          p_scope_id: input.scopeId,
          p_program_id: input.programId,
          p_justification: input.justification,
        });
        assertNoSupabaseError(error);
        return mapRoleAssignment(data as RoleAssignmentRow);
      },
    },
    assessments: {
      async listAssessmentModalities(programId: ProgramId) {
        const { data, error } = await client
          .from("assessment_modalities")
          .select(assessmentModalityColumns)
          .eq("program_id", programId)
          .is("archived_at", null)
          .order("created_at");
        assertNoSupabaseError(error);
        return ((data ?? []) as AssessmentModalityRow[]).map(mapAssessmentModality);
      },
      /**
       * RPC `SECURITY DEFINER` : vérifie les droits (can_administer_program)
       * puis insère la modalité. Voir supabase/migrations/20260827093000_assessment_modalities.sql.
       */
      async createAssessmentModality(input: CreateAssessmentModalityInput) {
        const { data, error } = await client.rpc("create_assessment_modality", {
          p_program_id: input.programId,
          p_name: input.name,
          p_mode: input.mode,
          p_subtype: input.subtype,
          p_usage: input.usage,
          p_notes: input.notes.trim().length > 0 ? input.notes.trim() : null,
        });
        assertNoSupabaseError(error);
        return mapAssessmentModality(data as AssessmentModalityRow);
      },
      /**
       * Archivage réversible (pas de suppression) : voir
       * supabase/migrations/20260829200000_archive_outcomes_and_assessment_modalities.sql.
       */
      async archiveAssessmentModality(assessmentModalityId: string) {
        const { error } = await client.rpc("archive_assessment_modality", {
          p_modality_id: assessmentModalityId,
        });
        assertNoSupabaseError(error);
      },
    },
    outcomes: {
      ...mockDataAccess.outcomes,
      async listOutcomes(programId: ProgramId) {
        const { data, error } = await client
          .from("outcomes")
          .select(outcomeColumns)
          .eq("program_id", programId)
          .is("archived_at", null)
          .order("code");
        assertNoSupabaseError(error);
        return ((data ?? []) as OutcomeRow[]).map(mapOutcome);
      },
      /** Sans filtre sur `archived_at`, contrairement à `listOutcomes` : un
       * code archivé reste pris du point de vue de la contrainte d'unicité. */
      async listTakenOutcomeCodes(programId: ProgramId) {
        const { data, error } = await client
          .from("outcomes")
          .select("code")
          .eq("program_id", programId);
        assertNoSupabaseError(error);
        return ((data ?? []) as { code: string }[]).map((row) => row.code);
      },
      // `listOutcomeRelations` reste délégué au mock : hors périmètre de ce
      // chantier (voir chantier3_outcomes_28aout.md), aucune UI ne les édite.
      /**
       * RPC `SECURITY DEFINER` : vérifie les droits (can_administer_program)
       * puis insère la compétence/connaissance. Voir
       * supabase/migrations/20260828_outcomes.sql.
       */
      async createOutcome(input: CreateOutcomeInput) {
        const { data, error } = await client.rpc("create_outcome", {
          p_program_id: input.programId,
          p_curriculum_version_id: input.curriculumVersionId,
          p_code: input.code,
          p_label: input.label,
          p_description: input.description,
          p_nature: input.nature,
          p_domain: input.domain,
          p_target_mastery: input.targetMastery,
          // Toujours transmis, meme nul : la fonction a un defaut, mais un
          // appel explicite evite de dependre de la resolution par defaut de
          // PostgREST si une seconde signature reapparaissait un jour.
          p_knowledge_rank: input.knowledgeRank ?? null,
        });
        assertNoSupabaseError(error);
        return mapOutcome(data as OutcomeRow);
      },
      /**
       * Révision d'un acquis. `null` = inchangé côté serveur, d'où les `?? null` :
       * un champ absent de l'appel ne doit pas effacer la valeur en base.
       */
      async updateOutcome(input) {
        const { data, error } = await client.rpc("update_outcome", {
          p_outcome_id: input.outcomeId,
          p_label: input.label ?? null,
          p_description: input.description ?? null,
          p_target_mastery: input.targetMastery ?? null,
          p_knowledge_rank: input.knowledgeRank ?? null,
        });
        assertNoSupabaseError(error);
        return mapOutcome(data as OutcomeRow);
      },
      /**
       * Archivage réversible (pas de suppression) : voir
       * supabase/migrations/20260829200000_archive_outcomes_and_assessment_modalities.sql.
       */
      async archiveOutcome(outcomeId) {
        const { error } = await client.rpc("archive_outcome", { p_outcome_id: outcomeId });
        assertNoSupabaseError(error);
      },
      /**
       * Bascule d'un lot en une seule requete : voir
       * supabase/migrations/20260830110000_outcome_retained.sql.
       */
      async setOutcomesRetained(outcomeIds, retained) {
        if (outcomeIds.length === 0) return;
        const { error } = await client.rpc("set_outcomes_retained", {
          p_outcome_ids: outcomeIds,
          p_retained: retained,
        });
        assertNoSupabaseError(error);
      },

      /* -------------------------------------------------------------- */
      /* Thèmes (20260831094000_outcome_themes.sql)                      */
      /* -------------------------------------------------------------- */

      async listOutcomeThemes(programId: ProgramId) {
        const { data, error } = await client
          .from("outcome_themes")
          .select(outcomeThemeColumns)
          .eq("program_id", programId)
          .order("position", { ascending: true });
        assertNoSupabaseError(error);
        return ((data ?? []) as OutcomeThemeRow[]).map(mapOutcomeTheme);
      },
      async createOutcomeTheme(input) {
        const { data, error } = await client.rpc("create_outcome_theme", {
          p_program_id: input.programId,
          p_label: input.label,
          p_description: input.description ?? "",
          p_position: input.position ?? 0,
        });
        assertNoSupabaseError(error);
        return mapOutcomeTheme(data as OutcomeThemeRow);
      },
      async setOutcomesTheme(outcomeIds, themeId) {
        if (outcomeIds.length === 0) return;
        const { error } = await client.rpc("set_outcomes_theme", {
          p_outcome_ids: outcomeIds,
          p_theme_id: themeId ?? null,
        });
        assertNoSupabaseError(error);
      },
    },
    /**
     * Chantier Médiathèque (A), câblage complet : lecture et écriture réelles.
     * Le filtrage staff / apprenant n'est PAS refait ici — il est assuré par
     * la RLS (`learning_resources_select_scoped` -> `can_read_resource`), qui
     * ne laisse voir à un apprenant que les supports publiés et visibles.
     */
    resources: {
      /**
       * Lien de lecture du fichier source, signé une heure.
       *
       * ON PREND LE PLUS ANCIEN `source` du support — le même que
       * `loadSourceAssetsByResource` — et jamais un asset derivé : les images
       * et l'audio d'un diaporama vivent dans la même table.
       *
       * Un support sans fichier, ou dont le lien echoue, rend `null` : l'ecran
       * dit alors que le fichier n'est pas disponible, plutot que de proposer
       * un lecteur vide.
       */
      async signResourceMediaUrl(resourceId) {
        const { data, error } = await client
          .from("learning_resource_assets")
          .select("id")
          .eq("resource_id", resourceId)
          .eq("kind", "source")
          .order("created_at", { ascending: true })
          .limit(1);
        assertNoSupabaseError(error);
        const asset = ((data ?? []) as { id: string }[])[0];
        if (!asset) return null;
        const signed = await signAssetUrls(client, [asset.id]);
        return signed.get(asset.id) ?? null;
      },
      async listResources(programId: ProgramId) {
        const { data, error } = await client
          .from("learning_resources")
          .select(learningResourceColumns)
          .eq("program_id", programId)
          .order("created_at", { ascending: false });
        assertNoSupabaseError(error);
        const rows = (data ?? []) as LearningResourceRow[];
        const outcomeIds = await loadOutcomeIdsByResource(
          client,
          rows.map((row) => row.id),
        );
        return rows.map((row) => mapLearningResource(row, outcomeIds.get(row.id) ?? []));
      },
      async createResource(input: CreateLearningResourceInput) {
        const { data, error } = await client.rpc("create_learning_resource", {
          p_program_id: input.programId,
          p_curriculum_version_id: input.curriculumVersionId,
          p_title: input.title,
          p_description: input.description,
          p_format: input.format,
          p_visibility: input.visibility,
          p_external_url: input.externalUrl ?? null,
          p_outcome_ids: input.outcomeIds.length > 0 ? input.outcomeIds : null,
        });
        assertNoSupabaseError(error);
        return mapLearningResource(data as LearningResourceRow, input.outcomeIds);
      },
      /**
       * RPC idempotente : `on conflict do nothing` sur
       * `primary key (resource_id, outcome_id)`. Rejouer le même corpus ne crée
       * rien de plus et n'échoue pas ; le nombre rendu est celui des liens
       * RÉELLEMENT ajoutés, pas celui des liens demandés.
       */
      async linkResourceOutcomes(resourceId, outcomeIds) {
        if (outcomeIds.length === 0) return 0;
        const { data, error } = await client.rpc("link_resource_outcomes", {
          p_resource_id: resourceId,
          p_outcome_ids: outcomeIds,
        });
        assertNoSupabaseError(error);
        return (data as number | null) ?? 0;
      },
      /** Délègue la génération de l'URL signée à l'Edge Function (service_role côté serveur uniquement). */
      async requestUploadUrl(input: RequestUploadUrlInput): Promise<UploadUrlResult> {
        const { data, error } = await client.functions.invoke("create-resource-upload-url", {
          body: { programId: input.programId, bucket: input.bucket, fileName: input.fileName },
        });
        if (error) {
          const message =
            error instanceof Error ? error.message : "URL d'upload impossible à obtenir.";
          throw new Error(message);
        }
        const payload = data as {
          bucket?: string;
          objectPath?: string;
          signedUrl?: string;
          token?: string;
          error?: string;
        } | null;
        if (!payload || !payload.signedUrl || !payload.objectPath || !payload.token) {
          throw new Error(payload?.error ?? "Réponse invalide du service d'upload.");
        }
        return {
          bucket: payload.bucket ?? input.bucket,
          objectPath: payload.objectPath,
          signedUrl: payload.signedUrl,
          token: payload.token,
        };
      },
      /**
       * Téléversement réel vers le stockage privé, via le token de l'URL signée.
       *
       * Le fichier est réétiqueté avant l'envoi : Chrome annonce un .m4a en
       * audio/x-m4a, que le stockage refuse. L'option `contentType` de
       * supabase-js ne sert à rien ici — quand on lui passe un Blob, elle
       * construit un envoi multipart et laisse le type du Blob décider. Seul
       * un réétiquetage du fichier lui-même est pris en compte.
       */
      async uploadResourceFile(upload: UploadUrlResult, file: File) {
        const mediaType = requireCanonicalMediaType(file.name);
        const body =
          file.type === mediaType ? file : new File([file], file.name, { type: mediaType });
        const { error } = await client.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.objectPath, upload.token, body, { contentType: mediaType });
        assertNoSupabaseError(error);
      },
      async registerAsset(input: RegisterResourceAssetInput): Promise<RegisteredResourceAsset> {
        const { data, error } = await client.rpc("register_learning_resource_asset", {
          p_resource_id: input.resourceId,
          p_kind: input.kind,
          p_bucket_name: input.bucketName,
          p_object_path: input.objectPath,
          p_media_type: input.mediaType,
          p_original_file_name: input.originalFileName,
          p_byte_size: input.byteSize,
        });
        assertNoSupabaseError(error);
        const row = data as {
          id: string;
          resource_id: string;
          kind: ResourceAssetKind;
          bucket_name: string;
          object_path: string;
        };
        return {
          id: row.id,
          resourceId: row.resource_id as LearningResourceId,
          kind: row.kind,
          bucketName: row.bucket_name,
          objectPath: row.object_path,
        };
      },
      /** Délègue à l'Edge Function : la clé du service de transcription ne quitte jamais le serveur. */
      async transcribeNextSlide(resourceId: LearningResourceId): Promise<TranscriptionProgress> {
        const { data, error } = await client.functions.invoke("transcribe-slide-audio", {
          body: { resourceId },
        });
        if (error) {
          throw new Error(error instanceof Error ? error.message : "Transcription impossible.");
        }
        const payload = data as (Partial<TranscriptionProgress> & { error?: string }) | null;
        if (!payload || payload.error) {
          throw new Error(payload?.error ?? "Réponse invalide du service de transcription.");
        }
        return {
          slideIndex: payload.slideIndex ?? null,
          characters: payload.characters ?? 0,
          remaining: payload.remaining ?? 0,
          done: payload.done ?? true,
        };
      },
      /**
       * Reconstitue le diaporama publié le plus récent, avec un lien signé par
       * fichier. Les objets restent privés : ces liens expirent au bout d'une
       * heure et ne sont jamais stockés.
       */
      async getNarratedDeckPlayback(
        resourceId: LearningResourceId,
      ): Promise<NarratedDeckPlayback | undefined> {
        const { data: deck, error: deckError } = await client
          .from("narrated_decks")
          .select("id")
          .eq("resource_id", resourceId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        assertNoSupabaseError(deckError);
        if (!deck) return undefined;
        const deckId = (deck as { id: string }).id;

        const [{ data: slideRows, error: slideError }, { data: chapterRows, error: chapterError }] =
          await Promise.all([
            client
              .from("narrated_deck_slides")
              .select("slide_index,title,duration_ms,image_asset_id,video_asset_id,transcript")
              .eq("deck_id", deckId)
              .order("slide_index", { ascending: true }),
            client
              .from("narrated_deck_chapters")
              .select("chapter_index,title,starts_at_slide")
              .eq("deck_id", deckId)
              .order("chapter_index", { ascending: true }),
          ]);
        assertNoSupabaseError(slideError);
        assertNoSupabaseError(chapterError);

        type SlideRow = {
          slide_index: number;
          title: string;
          duration_ms: number;
          image_asset_id: string | null;
          video_asset_id: string | null;
          transcript: string | null;
        };
        const slides = (slideRows ?? []) as SlideRow[];
        const assetIds = [
          ...new Set(
            slides.flatMap((slide) =>
              [slide.image_asset_id, slide.video_asset_id].filter((id): id is string =>
                Boolean(id),
              ),
            ),
          ),
        ];
        const signedByAsset = await signAssetUrls(client, assetIds);

        return {
          title: "",
          slides: slides.map((slide) => ({
            index: slide.slide_index,
            title: slide.title,
            durationMs: slide.duration_ms,
            ...(slide.video_asset_id && signedByAsset.get(slide.video_asset_id)
              ? { videoUrl: signedByAsset.get(slide.video_asset_id)! }
              : {}),
            ...(slide.image_asset_id && signedByAsset.get(slide.image_asset_id)
              ? { imageUrl: signedByAsset.get(slide.image_asset_id)! }
              : {}),
            ...(slide.transcript ? { transcript: slide.transcript } : {}),
          })),
          chapters: (
            (chapterRows ?? []) as {
              chapter_index: number;
              title: string;
              starts_at_slide: number;
            }[]
          ).map((chapter) => ({
            chapterIndex: chapter.chapter_index,
            title: chapter.title,
            startsAtSlide: chapter.starts_at_slide,
          })),
        };
      },
      async storeResourceText(resourceId, sourcePath, segments) {
        const { data, error } = await client.rpc("store_learning_resource_text", {
          p_resource_id: resourceId,
          p_source_path: sourcePath,
          p_segments: segments,
        });
        assertNoSupabaseError(error);
        return typeof data === "number" ? data : 0;
      },
      /**
       * Lecture DIRECTE de la table, sans RPC.
       *
       * `learning_resource_texts` accorde déjà `select` à `authenticated`, et sa
       * policy `learning_resource_texts_select_scoped` restreint à
       * `can_read_resource(resource_id)` — la même portée que le support
       * lui-même. Ajouter une fonction `security definer` pour lire ce que la
       * policy autorise déjà reviendrait à écrire une seconde règle de lecture
       * à côté de la première, avec la certitude qu'elles divergent un jour.
       */
      /*
       * LE TEXTE 2026, PAR SES DEUX FONCTIONS. Elles sont `security invoker` :
       * elles ne peuvent rendre aucune ligne que l'appelant n'aurait pas le droit
       * de lire directement. Un chapitre non publie, ou d'un autre programme,
       * rend donc ZERO LIGNE — pas une erreur, et c'est ce qu'il faut : l'ecran
       * traite deja le vide comme une reponse valide.
       */
      async readChapterSections(resourceId) {
        const { data, error } = await client.rpc("read_chapter_sections", {
          p_resource_id: resourceId,
        });
        assertNoSupabaseError(error);
        return ((data ?? []) as CourseSectionRow[]).map(mapCourseSection);
      },
      async readOutcomeSections(outcomeId) {
        const { data, error } = await client.rpc("read_outcome_sections", {
          p_outcome_id: outcomeId,
        });
        assertNoSupabaseError(error);
        const rows = (data ?? []) as CourseSectionRow[];
        /*
         * L'ORIGINE EST LA MEME SUR TOUTES LES LIGNES — la fonction choisit UNE
         * voie et rend son resultat. On lit celle de la premiere ligne plutot que
         * de supposer : si la fonction changeait un jour et melangeait deux voies,
         * mieux vaut afficher selon la premiere que selon une valeur codee ici.
         */
        const brute = rows[0]?.origine;
        const origin: OutcomeSectionOrigin | undefined = OUTCOME_SECTION_ORIGINS.find(
          (valeur) => valeur === brute,
        );
        const resultat: OutcomeSections = {
          origin,
          sections: rows.map(mapCourseSection),
        };
        return resultat;
      },
      async listResourceTexts(resourceId) {
        const { data, error } = await client
          .from("learning_resource_texts")
          .select("source_path,segment_index,content")
          .eq("resource_id", resourceId)
          .order("source_path")
          .order("segment_index");
        assertNoSupabaseError(error);
        return (
          (data ?? []) as { source_path: string; segment_index: number; content: string }[]
        ).map((row) => ({
          sourcePath: row.source_path,
          segmentIndex: row.segment_index,
          content: row.content,
        }));
      },
      async searchResourceTexts(programId, query, limit) {
        const { data, error } = await client.rpc("search_learning_resource_texts", {
          p_program_id: programId,
          p_query: query,
          p_limit: limit ?? 10,
        });
        assertNoSupabaseError(error);
        return ((data ?? []) as ResourceTextRow[]).map((row) => ({
          resourceId: row.resource_id as LearningResourceId,
          resourceTitle: row.resource_title,
          sourcePath: row.source_path,
          segmentIndex: row.segment_index,
          content: row.content,
          rank: row.rank,
        }));
      },
      async publishNarratedDeck(input: PublishNarratedDeckInput): Promise<PublishedNarratedDeck> {
        const { data, error } = await client.rpc("publish_narrated_deck", {
          p_resource_id: input.resourceId,
          p_source_asset_id: input.sourceAssetId,
          p_slide_count: input.slideCount,
          p_duration_ms: input.durationMs,
          p_transcript_available: input.transcriptAvailable,
          p_slides: input.slides.map((slide) => ({
            slideIndex: slide.slideIndex,
            title: slide.title,
            durationMs: slide.durationMs,
            imageAssetId: slide.imageAssetId ?? null,
            audioAssetId: slide.audioAssetId ?? null,
            videoAssetId: slide.videoAssetId ?? null,
            slideText: slide.slideText ?? null,
            transcript: slide.transcript ?? null,
            transcriptLanguage: slide.transcriptLanguage ?? null,
          })),
          p_chapters: input.chapters.map((chapter) => ({
            chapterIndex: chapter.chapterIndex,
            title: chapter.title,
            startsAtSlide: chapter.startsAtSlide,
          })),
        });
        assertNoSupabaseError(error);
        const row = data as { id: string; resource_id: string; version: number; status: string };
        return {
          id: row.id,
          resourceId: row.resource_id as LearningResourceId,
          version: row.version,
          status: row.status,
        };
      },
    },
    /**
     * LE PASSEPORT DECLARATIF — branche sur Supabase le 03/09.
     *
     * CE QUI MANQUAIT. `declare_outcome_level` est en base depuis le 31/08 et
     * l'adaptateur Supabase n'en portait AUCUNE implementation : le `passport`
     * retombait sur `...mockDataAccess`, qui rend une declaration en memoire,
     * perdue au rechargement, et une liste vide. L'ecran aurait donc coche, dit
     * merci, et n'aurait rien ecrit — le pire des trois etats possibles.
     */
    /*
     * MES MESSAGES — la boite reelle (09/09).
     *
     * UNE JOINTURE POSTGREST, PAS UNE FONCTION `security definer`. La policy
     * `communication_campaigns_select_recipient`, posee le meme jour, autorise
     * un destinataire a lire LA campagne qui le concerne : la lecture est donc
     * cadree par la base, structurellement, et non par la prudence du code qui
     * suit. C'est la lecon du 08/09 — deux fonctions proposees en `definer`
     * ouvraient l'ouvrage entier.
     *
     * AUCUN FILTRE `person_id` ICI, MEME PAS PAR PRUDENCE. La RLS le fait, et
     * un filtre de plus donnerait l'illusion que c'est LUI qui protege.
     *
     * ⚠️ ON FILTRE SUR DEUX STATUTS, PAS UN. `comm_delivery_status` en compte
     * SIX — `queued`, `sent`, `delivered`, `failed`, `cancelled`,
     * `suppressed` — et `sent` seul aurait FAIT DISPARAITRE de la boite tout
     * message dont l'accuse de reception a progresse jusqu'a `delivered` : le
     * message le mieux acheminé aurait ete le seul invisible. Les quatre autres
     * ne sont pas des messages recus, et les afficher promettrait a l'apprenant
     * un courrier qu'il n'a jamais eu.
     */
    messages: {
      async listMyMessages() {
        const { data, error } = await client
          .from("communication_deliveries")
          .select(
            "id, status, sent_at, created_at, read_at, campaign:communication_campaigns(subject, body, channel)",
          )
          .in("status", ["sent", "delivered"])
          .order("created_at", { ascending: false });
        assertNoSupabaseError(error);
        type Ligne = {
          id: string;
          sent_at: string | null;
          created_at: string;
          read_at: string | null;
          /*
           * PostgREST rend une relation « to-one » tantot comme objet, tantot
           * comme tableau d'un element selon la version et la forme de la cle.
           * On accepte les deux plutot que de parier.
           */
          campaign:
            | { subject: string; body: string; channel: MessageChannel }
            | { subject: string; body: string; channel: MessageChannel }[]
            | null;
        };
        return ((data ?? []) as Ligne[]).flatMap((row) => {
          const campagne = Array.isArray(row.campaign) ? row.campaign[0] : row.campaign;
          /*
           * SANS CAMPAGNE LISIBLE, ON N'AFFICHE RIEN. Le cas ne devrait pas se
           * produire depuis la policy du 09/09 ; s'il se produit, une ligne
           * « (sans objet) » serait un message fantome de plus — exactement ce
           * qu'on vient de retirer de cet ecran.
           */
          if (!campagne) return [];
          return [
            {
              deliveryId: row.id as MessageDeliveryId,
              subject: campagne.subject,
              body: campagne.body,
              channel: campagne.channel,
              /* L'envoi reel fait foi ; la mise en file ne sert que de repli. */
              receivedAt: row.sent_at ?? row.created_at,
              readAt: row.read_at,
            },
          ];
        });
      },
      async markRead(deliveryId: MessageDeliveryId) {
        const { error } = await client.rpc("mark_message_read", {
          p_delivery_id: deliveryId,
        });
        assertNoSupabaseError(error);
      },
    },
    passport: {
      /**
       * Poser ou corriger son niveau. TOUT PASSE PAR LA FONCTION : la table
       * `outcome_self_reports` n'a aucune policy d'ecriture, c'est deliberé.
       * La fonction verifie que l'inscription est bien celle de l'appelant et
       * que l'acquis appartient au PARCOURS (retenu, non archive) ; l'ecran
       * n'a donc aucune regle a redire ici.
       */
      async declareOutcomeLevel(input) {
        const { data, error } = await client.rpc("declare_outcome_level", {
          p_enrollment_id: input.enrollmentId,
          p_outcome_id: input.outcomeId,
          p_level: input.level,
          p_note: input.note ?? "",
        });
        assertNoSupabaseError(error);
        return mapSelfReport(data as SelfReportRow);
      },
      async validateOutcomeDeclaration(input) {
        const { data, error } = await client.rpc("validate_outcome_declaration", {
          p_enrollment_id: input.enrollmentId,
          p_outcome_id: input.outcomeId,
        });
        assertNoSupabaseError(error);
        return mapSelfReport(data as SelfReportRow);
      },
      async revokeOutcomeValidation(input) {
        const { data, error } = await client.rpc("revoke_outcome_validation", {
          p_enrollment_id: input.enrollmentId,
          p_outcome_id: input.outcomeId,
        });
        assertNoSupabaseError(error);
        return mapSelfReport(data as SelfReportRow);
      },
      async listSelfReports(enrollmentId) {
        const { data, error } = await client
          .from("outcome_self_reports")
          .select(
            "enrollment_id, outcome_id, declared_level, declared_at, note, validated_by, validated_at",
          )
          .eq("enrollment_id", enrollmentId);
        assertNoSupabaseError(error);
        return ((data ?? []) as SelfReportRow[]).map(mapSelfReport);
      },
      /**
       * LA NOTE D'EXPERIENCE, ENFIN ECRITE QUELQUE PART (10/09).
       *
       * Elle vivait dans un magasin EN MEMOIRE : l'apprenant tapait son vecu,
       * rechargeait la page, tout etait perdu — et la boite ne portait meme pas
       * de badge « Simule », contrairement au fil de tuteur juste en dessous.
       *
       * Table distincte d'`outcome_self_reports` A DESSEIN : celle-ci exige un
       * niveau declare, et le texte le plus utile est celui de quelqu'un qui
       * n'est PAS encore pret a se declarer competent. Voir la migration
       * 20260910140000.
       */
      async listExperienceNotes(enrollmentId) {
        const { data, error } = await client
          .from("outcome_experience_notes")
          .select("enrollment_id, outcome_id, body, updated_at")
          .eq("enrollment_id", enrollmentId);
        assertNoSupabaseError(error);
        return ((data ?? []) as ExperienceNoteRow[]).map(mapExperienceNote);
      },
      async saveExperienceNote(input) {
        const { error } = await client.rpc("save_outcome_experience_note", {
          p_enrollment_id: input.enrollmentId,
          p_outcome_id: input.outcomeId,
          p_body: input.body,
        });
        assertNoSupabaseError(error);
      },
    },
    /**
     * LES FILS DE DISCUSSION (10/09).
     *
     * Toute ECRITURE passe par `post_discussion_message`, qui verifie le droit,
     * ouvre le fil s'il n'existe pas, tient `last_message_at` et marque l'auteur
     * comme ayant lu son propre message. Les tables n'acceptent que le `select`.
     */
    /**
     * LES SOURCES D'EQUIPE D'ENCADREMENT (10/09).
     *
     * ⚠️ AUCUNE METHODE ICI NE PEUT RELIRE UN JETON. `encadrement_sources` ne
     * rend que `token_hint` -- quatre caracteres -- et
     * `resolve_encadrement_source` est revoquee jusqu'a `authenticated`
     * comprise. Le navigateur envoie un identifiant de source, jamais un
     * secret.
     *
     * Le TEST et la SYNCHRONISATION passent par la fonction edge : l'appel a
     * la source tierce ne peut pas partir du navigateur, qui n'a pas le jeton
     * -- et ne doit pas l'avoir.
     */
    encadrementSources: {
      async listSources(programId) {
        const { data, error } = await client
          .from("encadrement_sources")
          .select("id,program_id,placement_id,label,endpoint_url,token_hint,active,last_sync_at")
          .eq("program_id", programId)
          .order("label");
        assertNoSupabaseError(error);
        return ((data ?? []) as EncadrementSourceRow[]).map(mapEncadrementSource);
      },
      async listRuns(sourceId) {
        const { data, error } = await client
          .from("encadrement_sync_runs")
          .select(
            "id,source_id,started_at,status,members_seen,people_added,removals_proposed,unchanged,error_message",
          )
          .eq("source_id", sourceId)
          .order("started_at", { ascending: false })
          .limit(20);
        assertNoSupabaseError(error);
        return ((data ?? []) as EncadrementRunRow[]).map(mapEncadrementRun);
      },
      async setSource(input) {
        const { data, error } = await client.rpc("set_encadrement_source", {
          p_program_id: input.programId,
          p_placement_id: input.placementId,
          p_label: input.label,
          p_endpoint_url: input.endpointUrl,
          p_token: input.token,
        });
        assertNoSupabaseError(error);
        return data as EncadrementSourceId;
      },
      async testSource(sourceId) {
        const { data, error } = await client.functions.invoke("sync-encadrement", {
          body: { sourceId, dryRun: true },
        });
        if (error) throw new Error(await messageDeFonctionEdge(error, data));
        return data as EncadrementSyncPreview;
      },
      async syncSource(sourceId) {
        const { data, error } = await client.functions.invoke("sync-encadrement", {
          body: { sourceId },
        });
        if (error) throw new Error(await messageDeFonctionEdge(error, data));
        return data as EncadrementSyncReport;
      },
    },
    discussions: {
      async listThreads(enrollmentId) {
        const { data, error } = await client
          .from("discussion_threads")
          .select(discussionThreadColumns)
          .eq("enrollment_id", enrollmentId)
          .order("last_message_at", { ascending: false });
        assertNoSupabaseError(error);
        return ((data ?? []) as unknown as DiscussionThreadRow[]).map(mapDiscussionThread);
      },
      /**
       * LA LECTURE DE L'ENCADRANT. On demande TOUT le programme et on laisse la
       * RLS trancher : `discussion_threads_select` passe par
       * `supervises_enrollment()`, donc il ne recoit que les fils de ses
       * groupes. Calculer le perimetre ici serait une seconde verite a tenir
       * d'accord avec la premiere.
       */
      async listThreadsForProgram(programId) {
        const { data, error } = await client
          .from("discussion_threads")
          .select(discussionThreadColumns)
          .eq("program_id", programId)
          .order("last_message_at", { ascending: false });
        assertNoSupabaseError(error);
        return ((data ?? []) as unknown as DiscussionThreadRow[]).map(mapDiscussionThread);
      },
      async listMessages(threadId) {
        const { data, error } = await client
          .from("discussion_messages")
          .select("id,thread_id,author_person_id,body,created_at,profiles(full_name)")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true });
        assertNoSupabaseError(error);
        return ((data ?? []) as unknown as DiscussionMessageRow[]).map(mapDiscussionMessage);
      },
      async postMessage(input) {
        const { data, error } = await client.rpc("post_discussion_message", {
          p_enrollment_id: input.enrollmentId,
          p_outcome_id: input.outcomeId ?? null,
          p_stage_log_entry_id: input.stageLogEntryId ?? null,
          p_body: input.body,
        });
        assertNoSupabaseError(error);
        if (!data) throw new Error("Le message n’a pas été enregistré : la base n’a rien renvoyé.");
        /*
         * LA RPC REND LA LIGNE BRUTE DU FIL, sans les jointures de sujet : elle
         * ne sait rendre que `discussion_threads`. L'ecran relit la liste juste
         * apres, qui, elle, porte le sujet — on ne fabrique donc pas ici une
         * projection a moitie remplie qui se ferait passer pour l'autre.
         */
        return mapDiscussionThread({
          ...(data as DiscussionThreadRow),
          outcomes: null,
          stage_log_entries: null,
          discussion_thread_reads: null,
        });
      },
      async markThreadRead(threadId) {
        const { error } = await client.rpc("mark_discussion_thread_read", {
          p_thread_id: threadId,
        });
        assertNoSupabaseError(error);
      },
    },
    /**
     * Rétroplanning réel d'une promotion.
     *
     * `listPlanSchedule` LIT MAINTENANT LES VRAIS JALONS (03/09).
     *
     * Il rendait le calendrier de demonstration du mock : l'apprenant voyait
     * des echeances qui n'avaient aucun rapport avec sa promotion, alors que
     * les 29 jalons construits le 01/09 dormaient dans `plan_milestones`.
     * Constate par Stef en testant la vue apprenant : « pas logique pour les
     * jalons ». Les autres fonctions du depot ecrivaient deja la vraie table —
     * seule la lecture du passeport etait restee en arriere.
     */
    plan: {
      ...mockDataAccess.plan,
      /**
       * Projette les jalons d'une promotion dans la forme attendue par le
       * passeport : une ligne par acquis, avec ses dates.
       *
       * LES DATES SONT CALCULEES, PAS STOCKEES. Un jalon porte un `week_offset`
       * — un rang de semaine depuis le debut du stage — et non une date. C'est
       * ce qui permet de rejouer le meme modele de retroplanning d'une
       * promotion a l'autre (voir la migration `milestone_templates`). La date
       * reelle se deduit donc du `starts_on` de la promotion, et d'elle seule.
       *
       * SANS PROMOTION, LISTE VIDE. Un programme n'a pas de calendrier : deux
       * centuries du meme programme ont chacune le leur. Rendre le calendrier
       * d'une promotion arbitraire serait un mensonge silencieux.
       */
      async listPlanSchedule(programId, cohortId) {
        if (!cohortId) return [];

        const { data: cohort, error: cohortError } = await client
          .from("cohorts")
          .select("starts_on, program_id")
          .eq("id", cohortId)
          .maybeSingle();
        assertNoSupabaseError(cohortError);
        const cohortRow = cohort as { starts_on: string; program_id: string } | null;
        if (!cohortRow || cohortRow.program_id !== programId) return [];

        const { data: milestones, error: milestonesError } = await client
          .from("plan_milestones")
          .select("id, label, week_offset, official")
          .eq("cohort_id", cohortId);
        assertNoSupabaseError(milestonesError);
        const milestoneRows = (milestones ?? []) as {
          id: string;
          label: string;
          week_offset: number;
          official: boolean;
        }[];
        if (milestoneRows.length === 0) return [];

        const { data: links, error: linksError } = await client
          .from("plan_milestone_outcomes")
          .select("milestone_id, outcome_id")
          .in(
            "milestone_id",
            milestoneRows.map((row) => row.id),
          );
        assertNoSupabaseError(linksError);

        const byId = new Map(milestoneRows.map((row) => [row.id, row]));
        const start = new Date(`${cohortRow.starts_on}T00:00:00.000Z`);
        const jour = 24 * 60 * 60 * 1000;

        const entries: PlanScheduleEntry[] = [];
        for (const link of (links ?? []) as { milestone_id: string; outcome_id: string }[]) {
          const milestone = byId.get(link.milestone_id);
          if (!milestone) continue;
          const debut = new Date(start.getTime() + milestone.week_offset * 7 * jour);
          // La semaine du jalon : elle s'ouvre le lundi de son rang et se ferme
          // six jours plus tard. Une echeance ponctuelle afficherait un trait
          // sans epaisseur dans le Gantt du passeport.
          const fin = new Date(debut.getTime() + 6 * jour);
          entries.push({
            outcomeId: link.outcome_id as OutcomeId,
            milestoneId: link.milestone_id as PlanMilestoneId,
            startsOn: debut.toISOString(),
            dueOn: fin.toISOString(),
            milestoneLabel: milestone.label,
            official: milestone.official,
          });
        }
        return entries;
      },
      /*
       * LE PLAN PERSONNEL — LECTURE ET ECRITURE REELLES (09/09).
       *
       * `learner_milestone_shifts` et `shift_milestone` existent en base depuis
       * le 31/08 et n'avaient jamais ete appelees. Un etudiant ne modifie que
       * SON calendrier : la cle est `(inscription, jalon)`, et
       * `plan_milestones` — le retroplanning de la promotion — n'est jamais
       * touchee.
       *
       * LES TROIS REFUS VIENNENT DE LA BASE, pas d'ici : jalon officiel
       * (contrainte declarative), inscription qui n'est pas la sienne, et
       * programme dont le reamenagement n'est pas ouvert. On remonte leur
       * message tel quel — chacun dit ce qui manque.
       */
      async listMilestoneShifts(enrollmentId) {
        const { data, error } = await client
          .from("learner_milestone_shifts")
          .select("milestone_id, shifted_due_on, shifted_starts_on")
          .eq("enrollment_id", enrollmentId);
        assertNoSupabaseError(error);
        return (
          (data ?? []) as {
            milestone_id: string;
            shifted_due_on: string;
            shifted_starts_on: string | null;
          }[]
        ).map((row) => ({
          milestoneId: row.milestone_id as PlanMilestoneId,
          /*
           * `shifted_due_on` EST UNE DATE SEULE. On la remonte a midi UTC et non
           * a minuit : minuit bascule de jour des qu'un fuseau recule, et le
           * jalon change de date a l'ecran sans que personne l'ait deplace.
           * C'est le meme piege que celui note le 07/09 sur le carnet de stage.
           */
          shiftedDueOn: `${row.shifted_due_on}T12:00:00.000Z`,
          /*
           * PROPRIETE ABSENTE ET NON `undefined` EXPLICITE : `MilestoneShift`
           * la declare optionnelle, et le projet est en
           * `exactOptionalPropertyTypes`. Ici l'absence EST l'information —
           * « aucun debut choisi » — contrairement au moteur IA du matin, ou
           * le champ etait toujours present.
           */
          ...(row.shifted_starts_on
            ? { shiftedStartsOn: `${row.shifted_starts_on}T12:00:00.000Z` }
            : {}),
        }));
      },
      async shiftMilestone(input) {
        /*
         * `p_starts_on: null` EXPLICITE quand l'appelant ne choisit pas de
         * debut. La fonction remplace la ligne entiere : omettre la cle
         * laisserait le defaut `null` jouer ici, mais l'ecrire rend visible
         * que « pas de debut » EFFACE un debut choisi auparavant — c'est
         * ainsi qu'on revient a la duree du retroplanning.
         */
        const { data, error } = await client.rpc("shift_milestone", {
          p_enrollment_id: input.enrollmentId,
          p_milestone_id: input.milestoneId,
          p_due_on: input.dueOn,
          p_starts_on: input.startsOn ?? null,
        });
        assertNoSupabaseError(error);
        const row = (Array.isArray(data) ? data[0] : data) as {
          milestone_id?: string;
          shifted_due_on?: string;
          shifted_starts_on?: string | null;
        } | null;
        if (!row?.milestone_id || !row.shifted_due_on) {
          throw new Error("Le déplacement n’a pas été enregistré.");
        }
        return {
          milestoneId: row.milestone_id as PlanMilestoneId,
          shiftedDueOn: `${row.shifted_due_on}T12:00:00.000Z`,
          ...(row.shifted_starts_on
            ? { shiftedStartsOn: `${row.shifted_starts_on}T12:00:00.000Z` }
            : {}),
        };
      },
      async resetMilestoneShift(enrollmentId, milestoneId) {
        const { error } = await client.rpc("reset_milestone_shift", {
          p_enrollment_id: enrollmentId,
          p_milestone_id: milestoneId,
        });
        assertNoSupabaseError(error);
      },
      async listMilestones(cohortId) {
        /*
         * Deux lectures directes plutôt qu'une jointure imbriquée : la policy
         * `plan_milestones_select` couvre déjà les deux tables, et une jointure
         * PostgREST rendrait la composition sous une clé imbriquée qu'il
         * faudrait déplier à la main de toute façon.
         */
        const { data, error } = await client
          .from("plan_milestones")
          .select("id,cohort_id,program_id,label,week_offset,week_offset_end,official,position")
          .eq("cohort_id", cohortId)
          .order("position")
          .order("week_offset");
        assertNoSupabaseError(error);
        const rows = (data ?? []) as {
          id: string;
          cohort_id: string;
          program_id: string;
          label: string;
          week_offset: number;
          week_offset_end: number | null;
          official: boolean;
          position: number;
        }[];
        if (rows.length === 0) return [];

        const { data: links, error: linkError } = await client
          .from("plan_milestone_outcomes")
          .select("milestone_id,outcome_id,position")
          .in(
            "milestone_id",
            rows.map((row) => row.id),
          )
          .order("position");
        assertNoSupabaseError(linkError);
        const byMilestone = new Map<string, OutcomeId[]>();
        for (const link of (links ?? []) as { milestone_id: string; outcome_id: string }[]) {
          const list = byMilestone.get(link.milestone_id) ?? [];
          list.push(link.outcome_id as OutcomeId);
          byMilestone.set(link.milestone_id, list);
        }

        return rows.map((row) => ({
          id: row.id,
          cohortId: row.cohort_id,
          programId: row.program_id,
          label: row.label,
          weekOffset: row.week_offset,
          // Clé ABSENTE et non `undefined` : `exactOptionalPropertyTypes`.
          ...(row.week_offset_end === null ? {} : { weekOffsetEnd: row.week_offset_end }),
          official: row.official,
          position: row.position,
          outcomeIds: byMilestone.get(row.id) ?? [],
        }));
      },
      async createMilestone(input) {
        const { data, error } = await client.rpc("create_plan_milestone", {
          p_cohort_id: input.cohortId,
          p_label: input.label,
          p_week_offset: input.weekOffset,
          p_official: input.official ?? false,
          p_position: input.position ?? 0,
          p_week_offset_end: input.weekOffsetEnd ?? null,
        });
        assertNoSupabaseError(error);
        const row = data as {
          id: string;
          cohort_id: string;
          program_id: string;
          label: string;
          week_offset: number;
          week_offset_end: number | null;
          official: boolean;
          position: number;
        };
        return {
          id: row.id,
          cohortId: row.cohort_id,
          programId: row.program_id,
          label: row.label,
          weekOffset: row.week_offset,
          ...(row.week_offset_end === null ? {} : { weekOffsetEnd: row.week_offset_end }),
          official: row.official,
          position: row.position,
          outcomeIds: [],
        };
      },
      async updateMilestone(input) {
        /*
         * `null` = inchangé pour tous les champs, SAUF la fin de période :
         * là, `null` est aussi une valeur légitime (« jalon ponctuel »), et
         * c'est `p_clear_week_offset_end` qui l'exprime. Sans ce drapeau,
         * étaler un jalon serait un aller sans retour.
         */
        const { data, error } = await client.rpc("update_plan_milestone", {
          p_milestone_id: input.milestoneId,
          p_label: input.label ?? null,
          p_week_offset: input.weekOffset ?? null,
          p_official: input.official ?? null,
          p_position: input.position ?? null,
          p_week_offset_end: input.weekOffsetEnd ?? null,
          p_clear_week_offset_end: input.clearWeekOffsetEnd ?? false,
        });
        assertNoSupabaseError(error);
        const row = data as {
          id: string;
          cohort_id: string;
          program_id: string;
          label: string;
          week_offset: number;
          week_offset_end: number | null;
          official: boolean;
          position: number;
        };
        return {
          id: row.id,
          cohortId: row.cohort_id,
          programId: row.program_id,
          label: row.label,
          weekOffset: row.week_offset,
          ...(row.week_offset_end === null ? {} : { weekOffsetEnd: row.week_offset_end }),
          official: row.official,
          position: row.position,
          outcomeIds: [],
        };
      },
      async deleteMilestone(milestoneId) {
        const { error } = await client.rpc("delete_plan_milestone", {
          p_milestone_id: milestoneId,
        });
        assertNoSupabaseError(error);
      },
      async setMilestoneOutcomes(milestoneId, outcomeIds) {
        const { data, error } = await client.rpc("set_milestone_outcomes", {
          p_milestone_id: milestoneId,
          p_outcome_ids: [...outcomeIds],
        });
        assertNoSupabaseError(error);
        return ((data ?? []) as unknown[]).length;
      },
      async listTemplates(programId) {
        /*
         * Deux lectures directes, comme pour les jalons : la policy des items
         * remonte au modèle parent, et une jointure PostgREST rendrait les
         * lignes sous une clé imbriquée qu'il faudrait déplier de toute façon.
         */
        const { data, error } = await client
          .from("milestone_templates")
          .select("id,program_id,label,description,source_cohort_id,created_at")
          .eq("program_id", programId)
          .order("label");
        assertNoSupabaseError(error);
        const rows = (data ?? []) as {
          id: string;
          program_id: string;
          label: string;
          description: string;
          source_cohort_id: string | null;
          created_at: string;
        }[];
        if (rows.length === 0) return [];

        const { data: itemRows, error: itemError } = await client
          .from("milestone_template_items")
          .select("template_id,label,week_offset,week_offset_end,official,position")
          .in(
            "template_id",
            rows.map((row) => row.id),
          )
          .order("position");
        assertNoSupabaseError(itemError);
        const items = (itemRows ?? []) as {
          template_id: string;
          label: string;
          week_offset: number;
          week_offset_end: number | null;
          official: boolean;
          position: number;
        }[];

        return rows.map((row) => ({
          id: row.id,
          programId: row.program_id as ProgramId,
          label: row.label,
          description: row.description,
          ...(row.source_cohort_id === null
            ? {}
            : { sourceCohortId: row.source_cohort_id as CohortId }),
          createdAt: row.created_at,
          items: items
            .filter((item) => item.template_id === row.id)
            .map((item) => ({
              label: item.label,
              weekOffset: item.week_offset,
              ...(item.week_offset_end === null ? {} : { weekOffsetEnd: item.week_offset_end }),
              official: item.official,
              position: item.position,
            })),
        }));
      },
      async saveTemplate(input) {
        const { data, error } = await client.rpc("save_milestone_template", {
          p_cohort_id: input.cohortId,
          p_label: input.label,
          p_description: input.description ?? "",
        });
        assertNoSupabaseError(error);
        const row = data as {
          id: string;
          program_id: string;
          label: string;
          description: string;
          source_cohort_id: string | null;
          created_at: string;
        };
        /*
         * La fonction rend le MODÈLE, pas ses lignes : elles viennent d'être
         * copiées depuis les jalons. On les relit plutôt que de les déduire —
         * un objet qui prétendrait connaître ses lignes sans les avoir lues
         * mentirait au premier écart.
         */
        const { data: itemRows, error: itemError } = await client
          .from("milestone_template_items")
          .select("label,week_offset,week_offset_end,official,position")
          .eq("template_id", row.id)
          .order("position");
        assertNoSupabaseError(itemError);
        const items = (itemRows ?? []) as {
          label: string;
          week_offset: number;
          week_offset_end: number | null;
          official: boolean;
          position: number;
        }[];

        return {
          id: row.id,
          programId: row.program_id as ProgramId,
          label: row.label,
          description: row.description,
          ...(row.source_cohort_id === null
            ? {}
            : { sourceCohortId: row.source_cohort_id as CohortId }),
          createdAt: row.created_at,
          items: items.map((item) => ({
            label: item.label,
            weekOffset: item.week_offset,
            ...(item.week_offset_end === null ? {} : { weekOffsetEnd: item.week_offset_end }),
            official: item.official,
            position: item.position,
          })),
        };
      },
      async updateTemplate(input) {
        const { error } = await client.rpc("update_milestone_template", {
          p_template_id: input.templateId,
          p_label: input.label,
          p_description: input.description,
        });
        assertNoSupabaseError(error);
      },
      async deleteTemplate(templateId) {
        const { error } = await client.rpc("delete_milestone_template", {
          p_template_id: templateId,
        });
        assertNoSupabaseError(error);
      },
      async applyTemplate(input) {
        const { data, error } = await client.rpc("apply_milestone_template", {
          p_template_id: input.templateId,
          p_cohort_id: input.cohortId,
          p_mode: input.mode,
          p_dry_run: input.dryRun ?? false,
        });
        assertNoSupabaseError(error);
        /*
         * `returns table` rend TOUJOURS un tableau, même pour une seule ligne.
         * Absent voudrait dire que la fonction n'a rien rendu, ce qui n'arrive
         * pas : elle lève plutôt qu'elle ne se tait. Le zéro est donc un
         * garde-fou, pas un cas nominal.
         */
        const row = (
          (data ?? []) as {
            poses: number;
            ignores: number;
            sans_chapitre: string[] | null;
          }[]
        )[0];
        return {
          posed: row?.poses ?? 0,
          skipped: row?.ignores ?? 0,
          withoutChapter: row?.sans_chapitre ?? [],
        };
      },
    },

    /**
     * Grille médiathèque : lecture réelle, projetée sur le type riche de la
     * maquette (voir `mapMediaResource`). `listLearnerNarratedDecks` reste
     * délégué au mock tant que la lecture des diaporamas sonorisés côté
     * apprenant n'est pas câblée — c'est le prochain morceau du chantier.
     */
    media: {
      ...mockDataAccess.media,
      async listMedia(programId: ProgramId) {
        const { data, error } = await client
          .from("learning_resources")
          .select(learningResourceColumns)
          .eq("program_id", programId)
          .order("updated_at", { ascending: false });
        assertNoSupabaseError(error);
        const rows = (data ?? []) as LearningResourceRow[];
        const ids = rows.map((row) => row.id);
        const [outcomeIds, assets] = await Promise.all([
          loadOutcomeIdsByResource(client, ids),
          loadSourceAssetsByResource(client, ids),
        ]);
        return rows.map((row) =>
          mapMediaResource(row, outcomeIds.get(row.id) ?? [], assets.get(row.id)),
        );
      },
      async getMedia(id: string) {
        const { data, error } = await client
          .from("learning_resources")
          .select(learningResourceColumns)
          .eq("id", id)
          .maybeSingle();
        assertNoSupabaseError(error);
        if (!data) return undefined;
        const row = data as LearningResourceRow;
        const [outcomeIds, assets] = await Promise.all([
          loadOutcomeIdsByResource(client, [row.id]),
          loadSourceAssetsByResource(client, [row.id]),
        ]);
        return mapMediaResource(row, outcomeIds.get(row.id) ?? [], assets.get(row.id));
      },
    },
  };
}
