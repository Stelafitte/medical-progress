import { describe, expect, it } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { selectDataAccess } from "@/application/dataAccess";
import { mockDataAccess } from "@/infrastructure/mock/mockDataAccess";
import {
  mapLearnerNarratedDeck,
  mapPendingPerson,
  mapPerson,
  mapProgram,
  mapRoleAssignment,
} from "@/infrastructure/supabase/supabaseDataAccess";

describe("sélection du backend de données", () => {
  it("conserve le backend mock lorsqu'il est demandé", () => {
    expect(selectDataAccess({ configured: false, backend: "mock", reason: "non configuré" })).toBe(
      mockDataAccess,
    );
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

  /**
   * Garde-fou contre le mode de panne le plus silencieux du dépôt : une
   * surcharge PARTIELLE. `administration` commence par `...mockDataAccess
   * .administration`, donc une méthode oubliee ne leve aucune erreur — elle
   * rend du mock, et l'ecran affiche un vide credible.
   */
  it("surcharge les methodes d'administration branchees sur la base", () => {
    const selected = selectDataAccess(
      {
        configured: true as const,
        backend: "supabase" as const,
        value: { url: "https://example.supabase.co", publishableKey: "x".repeat(24) },
      },
      {} as SupabaseClient,
    );
    for (const method of ["listPeople", "listAllRoleAssignments", "listAllEnrollments"] as const) {
      expect(selected.administration[method]).not.toBe(mockDataAccess.administration[method]);
    }
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
      learner_plan_shifts_enabled: true,
      target_mastery: "proficient",
      locale: "fr-FR",
      design_draft: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(program.config.realCompetenceRequiresValidator).toBe(true);
    // Le reglage du 09/09 : le drapeau SQL doit arriver jusqu'a la config.
    expect(program.config.learnerPlanShiftsEnabled).toBe(true);
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
    expect(() => mapRoleAssignment({ ...base, scope_kind: "unknown" as "program" })).toThrow(
      "Type de portée Supabase inconnu",
    );
    expect(() =>
      mapRoleAssignment({ ...base, scope_kind: "program", scope_id: "other-program" }),
    ).toThrow("Portée programme Supabase incohérente");
    expect(() => mapRoleAssignment({ ...base, scope_kind: "platform" })).toThrow(
      "Portée plateforme Supabase incohérente",
    );
  });
});

describe("mapping du sas de pré-inscription (D94)", () => {
  it("mappe une ligne people minimale (aucun champ optionnel renseigné)", () => {
    const person = mapPendingPerson({
      id: "people-id",
      program_id: "program-id",
      first_name: "Camille",
      last_name: "Martin",
      login_email: "camille@example.test",
      institutional_id: null,
      intended_role: null,
      intended_placement_id: null,
      origin: "individual",
      intended_cohort_id: null,
      status: "pending",
      invited_at: null,
      cancelled_at: null,
      activated_profile_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(person).toEqual({
      id: "people-id",
      programId: "program-id",
      firstName: "Camille",
      lastName: "Martin",
      loginEmail: "camille@example.test",
      origin: "individual",
      status: "pending",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
  });

  it("mappe une ligne people invitée avec tous les champs optionnels renseignés", () => {
    const person = mapPendingPerson({
      id: "people-id",
      program_id: "program-id",
      first_name: "Camille",
      last_name: "Martin",
      login_email: "camille@example.test",
      institutional_id: "21012345",
      intended_role: "placement_supervisor",
      intended_placement_id: "placement-id",
      origin: "import",
      intended_cohort_id: "cohort-id",
      status: "invited",
      invited_at: "2026-01-02T00:00:00Z",
      cancelled_at: null,
      activated_profile_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(person.institutionalId).toBe("21012345");
    expect(person.intendedCohortId).toBe("cohort-id");
    expect(person.intendedPlacementId).toBe("placement-id");
    expect(person.invitedAt).toBe("2026-01-02T00:00:00Z");
    expect(person.cancelledAt).toBeUndefined();
    expect(person.activatedProfileId).toBeUndefined();
  });
});

describe("diaporamas sonorisés côté apprenant (18/09)", () => {
  it("lit la base au lieu de retomber sur le mock", () => {
    const selected = selectDataAccess(
      {
        configured: true as const,
        backend: "supabase" as const,
        value: { url: "https://example.supabase.co", publishableKey: "x".repeat(24) },
      },
      {} as SupabaseClient,
    );
    expect(selected.media.listLearnerNarratedDecks).not.toBe(
      mockDataAccess.media.listLearnerNarratedDecks,
    );
  });

  it("ne garde que les diapositives et chapitres du diaporama, dans l'ordre, sans transcription", () => {
    const deck = mapLearnerNarratedDeck(
      {
        id: "res-1",
        program_id: "prog-1",
        title: "Doppler",
        description: "Module 6",
        format: "pptx_narrated",
        visibility: "program",
        is_published: true,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-02T00:00:00Z",
      } as never,
      { id: "deck-2", resource_id: "res-1", version: 2, slide_count: null, duration_ms: 125_400 },
      [
        {
          deck_id: "deck-2",
          slide_index: 2,
          title: "B",
          duration_ms: 60_000,
          audio_present: false,
        },
        {
          deck_id: "deck-1",
          slide_index: 1,
          title: "ancienne",
          duration_ms: 1,
          audio_present: true,
        },
        { deck_id: "deck-2", slide_index: 1, title: "A", duration_ms: 65_400, audio_present: true },
      ],
      [{ deck_id: "deck-2", chapter_index: 0, title: "Intro", starts_at_slide: 1 }],
      [],
    );
    expect(deck.slides.map((slide) => slide.title)).toEqual(["A", "B"]);
    expect(deck.slides[0]).toEqual({
      index: 1,
      title: "A",
      durationSeconds: 65,
      hasNarration: true,
    });
    expect(deck.slideCount).toBe(2);
    expect(deck.totalDurationSeconds).toBe(125);
    expect(deck.chapters).toEqual([{ id: "deck-2:0", title: "Intro", startSlide: 1 }]);
    expect(deck.transcriptAvailable).toBe(false);
    expect(JSON.stringify(deck)).not.toMatch(/https?:|\.pptx/);
  });
});
