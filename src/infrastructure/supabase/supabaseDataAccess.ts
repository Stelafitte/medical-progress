import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { PlanScheduleEntry } from "@/domain/acquisitionPlan";
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
  LearningResource,
  LearningResourceId,
  Outcome,
  OutcomeId,
  OutcomeTheme,
  OutcomeThemeId,
  Person,
  Program,
  ProgramId,
  RoleAssignment,
  RoleScope,
} from "@/domain/types";
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
  origin: "individual" | "import";
  intended_cohort_id: string | null;
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
  "id,program_id,first_name,last_name,login_email,institutional_id,origin,intended_cohort_id,status,invited_at,cancelled_at,activated_profile_id,created_at,updated_at";

const programColumns =
  "id,code,name,kind,institution,annual_learner_estimate,placements_enabled,simulation_enabled,audits_enabled,pre_post_tests_enabled,sessions_enabled,dpc_enabled,target_mastery,locale,design_draft,created_at,updated_at";

const assessmentModalityColumns =
  "id,program_id,name,mode,subtype,usage,notes,created_at,updated_at";

const outcomeColumns =
  "id,program_id,curriculum_version_id,code,label,description,nature,domain,target_mastery,retained_at,theme_id,position,created_at";

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
export function createSupabaseDataAccess(client: SupabaseClient): DataAccess {
  return {
    ...mockDataAccess,
    isMock: false,
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
            startsOn: debut.toISOString(),
            dueOn: fin.toISOString(),
            milestoneLabel: milestone.label,
            official: milestone.official,
          });
        }
        return entries;
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
