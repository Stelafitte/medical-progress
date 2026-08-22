import { describe, expect, it } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { selectDataAccess } from "@/application/dataAccess";
import { mockDataAccess } from "@/infrastructure/mock/mockDataAccess";
import {
  mapPerson,
  mapProgram,
  mapRoleAssignment,
} from "@/infrastructure/supabase/supabaseDataAccess";

describe("sélection du backend de données", () => {
  it("conserve le backend mock lorsqu'il est demandé", () => {
    expect(
      selectDataAccess({ configured: false, backend: "mock", reason: "non configuré" }),
    ).toBe(mockDataAccess);
  });

  it("construit l'adaptateur Supabase uniquement avec un client configuré", () => {
    const config = {
      configured: true as const,
      backend: "supabase" as const,
      value: { url: "https://example.supabase.co", publishableKey: "x".repeat(24) },
    };
    expect(() => selectDataAccess(config)).toThrow("client Supabase");
    const selected = selectDataAccess(config, {} as SupabaseClient);
    expect(selected.isMock).toBe(false);
    expect(selected.programs.listPrograms).not.toBe(mockDataAccess.programs.listPrograms);
  });
});

describe("mapping du socle Supabase", () => {
  it("mappe la configuration d'un programme SQL vers le domaine", () => {
    const program = mapProgram({
      id: "program-id",
      code: "DIU-ECHO",
      name: "DIU Échocardiographie",
      kind: "diu",
      institution: "Université",
      annual_learner_estimate: 400,
      placements_enabled: true,
      simulation_enabled: true,
      audits_enabled: false,
      pre_post_tests_enabled: false,
      sessions_enabled: true,
      dpc_enabled: false,
      target_mastery: "proficient",
      locale: "fr-FR",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(program.config.realCompetenceRequiresValidator).toBe(true);
    expect(program.annualLearnerEstimate).toBe(400);
    expect(program.provenance.sourceSystem).toBe("native");
  });

  it("prend l'e-mail depuis l'utilisateur Auth et mappe une portée cohorte", () => {
    const person = mapPerson(
      {
        id: "person-id",
        full_name: "Camille Martin",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
      { id: "person-id", email: "camille@example.test" } as User,
    );
    expect(person.email).toBe("camille@example.test");

    const role = mapRoleAssignment({
      person_id: "person-id",
      role: "learner",
      scope_kind: "cohort",
      scope_id: "cohort-id",
      program_id: "program-id",
      granted_at: "2026-01-01T00:00:00Z",
    });
    expect(role.scope).toEqual({
      kind: "cohort",
      programId: "program-id",
      cohortId: "cohort-id",
    });
  });

  it("refuse les portées de rôle inconnues ou structurellement incohérentes", () => {
    const base = {
      person_id: "person-id",
      role: "administrator" as const,
      scope_id: "program-id",
      program_id: "program-id",
      granted_at: "2026-01-01T00:00:00Z",
    };
    expect(() =>
      mapRoleAssignment({ ...base, scope_kind: "unknown" as "program" }),
    ).toThrow("Type de portée Supabase inconnu");
    expect(() =>
      mapRoleAssignment({ ...base, scope_kind: "program", scope_id: "other-program" }),
    ).toThrow("Portée programme Supabase incohérente");
    expect(() =>
      mapRoleAssignment({ ...base, scope_kind: "platform" }),
    ).toThrow("Portée plateforme Supabase incohérente");
  });
});
