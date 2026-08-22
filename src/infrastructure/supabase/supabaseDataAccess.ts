import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { DataAccess } from "@/application/ports/repositories";
import type {
  Enrollment,
  Person,
  Program,
  ProgramId,
  RoleAssignment,
  RoleScope,
} from "@/domain/types";
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

const programColumns =
  "id,code,name,kind,institution,annual_learner_estimate,placements_enabled,simulation_enabled,audits_enabled,pre_post_tests_enabled,sessions_enabled,dpc_enabled,target_mastery,locale,created_at,updated_at";

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
  };
}
