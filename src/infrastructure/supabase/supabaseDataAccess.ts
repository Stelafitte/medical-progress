import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  CreateAssessmentModalityInput,
  CreateCohortInput,
  CreateLearningResourceInput,
  CreateOutcomeInput,
  DataAccess,
  GrantRoleAssignmentInput,
  PublishNarratedDeckInput,
  PublishedNarratedDeck,
  RegisterResourceAssetInput,
  RegisteredResourceAsset,
  RequestUploadUrlInput,
  ResourceAssetKind,
  ResourceVisibility,
  UploadUrlResult,
} from "@/application/ports/repositories";
import type {
  Cohort,
  CohortId,
  CurriculumVersion,
  CurriculumVersionId,
  Enrollment,
  LearningResource,
  LearningResourceId,
  Outcome,
  OutcomeId,
  Person,
  Program,
  ProgramId,
  RoleAssignment,
  RoleScope,
} from "@/domain/types";
import type { AssessmentModality } from "@/domain/assessmentModality";
import type {
  CreatePendingPersonInput,
  PendingPerson,
  PendingPersonId,
  PendingPersonStatus,
  SendInvitationOutcome,
} from "@/domain/peopleStaging";
import { mockDataAccess } from "@/infrastructure/mock/mockDataAccess";

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
  created_at: string;
};

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

const pendingPersonColumns =
  "id,program_id,first_name,last_name,login_email,institutional_id,origin,intended_cohort_id,status,invited_at,cancelled_at,activated_profile_id,created_at,updated_at";

const programColumns =
  "id,code,name,kind,institution,annual_learner_estimate,placements_enabled,simulation_enabled,audits_enabled,pre_post_tests_enabled,sessions_enabled,dpc_enabled,target_mastery,locale,created_at,updated_at";

const assessmentModalityColumns =
  "id,program_id,name,mode,subtype,usage,notes,created_at,updated_at";

const outcomeColumns =
  "id,program_id,curriculum_version_id,code,label,description,nature,domain,target_mastery,created_at";

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
      async listCurriculumVersions(programId: ProgramId) {
        const { data, error } = await client
          .from("curriculum_versions")
          .select("id,program_id,label,effective_from,status,created_at")
          .eq("program_id", programId)
          .order("effective_from");
        assertNoSupabaseError(error);
        return ((data ?? []) as CurriculumVersionRow[]).map(mapCurriculumVersion);
      },
      async listCohorts(programId?: ProgramId) {
        let query = client
          .from("cohorts")
          .select(
            "id,program_id,curriculum_version_id,label,academic_year,starts_on,ends_on,created_at,enrollments(count)",
          )
          .order("starts_on");
        if (programId) query = query.eq("program_id", programId);
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
            "id,program_id,curriculum_version_id,label,academic_year,starts_on,ends_on,created_at,enrollments(count)",
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
    },
    people: {
      ...mockDataAccess.people,
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
    },
    outcomes: {
      ...mockDataAccess.outcomes,
      async listOutcomes(programId: ProgramId) {
        const { data, error } = await client
          .from("outcomes")
          .select(outcomeColumns)
          .eq("program_id", programId)
          .order("code");
        assertNoSupabaseError(error);
        return ((data ?? []) as OutcomeRow[]).map(mapOutcome);
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
        });
        assertNoSupabaseError(error);
        return mapOutcome(data as OutcomeRow);
      },
    },
    /**
     * Chantier Médiathèque (A) : seule la création réelle est câblée ici
     * (création du support, upload signé, enregistrement d'asset,
     * publication d'un diaporama sonorisé). `listResources` reste délégué
     * au mock — le refactor de l'écran de catalogue est un chantier séparé
     * (voir chantier_mediatheque_backend_29aout.md).
     */
    resources: {
      ...mockDataAccess.resources,
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
        const payload = data as
          | { bucket?: string; objectPath?: string; signedUrl?: string; token?: string; error?: string }
          | null;
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
      /** Téléversement réel vers le stockage privé, via le token de l'URL signée. */
      async uploadResourceFile(upload: UploadUrlResult, file: File) {
        const { error } = await client.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.objectPath, upload.token, file);
        assertNoSupabaseError(error);
      },
      async registerAsset(input: RegisterResourceAssetInput): Promise<RegisteredResourceAsset> {
+        const { data, error } = await client.rpc("register_learning_resource_asset", {
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
  };
}
