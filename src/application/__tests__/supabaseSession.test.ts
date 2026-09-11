import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataAccess } from "@/application/ports/repositories";
import {
  AuthenticationRequiredError,
  NoProgramAccessError,
  loadAuthenticatedSupabaseSession,
} from "@/application/supabaseSession";
import { mockDataAccess } from "@/infrastructure/mock/mockDataAccess";
import * as fixtures from "@/infrastructure/mock/fixtures";

function clientWithUser(id?: string): SupabaseClient {
  return {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue(
          id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: null },
        ),
    },
  } as unknown as SupabaseClient;
}

function accessWithPrograms(programs = fixtures.programs): DataAccess {
  return {
    ...mockDataAccess,
    isMock: false,
    programs: { ...mockDataAccess.programs, listPrograms: vi.fn().mockResolvedValue(programs) },
    people: {
      ...mockDataAccess.people,
      getPerson: vi.fn().mockResolvedValue(fixtures.people[0]),
      listEnrollments: vi.fn().mockResolvedValue(fixtures.enrollments),
      listRoleAssignments: vi.fn().mockResolvedValue(fixtures.roleAssignments),
    },
  };
}

describe("chargement de session Supabase", () => {
  it("refuse une requête sans utilisateur et ne consulte aucun fallback", async () => {
    const access = accessWithPrograms();
    await expect(loadAuthenticatedSupabaseSession(clientWithUser(), access)).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(access.programs.listPrograms).not.toHaveBeenCalled();
    expect(access.people.getPerson).not.toHaveBeenCalled();
  });

  it("charge le profil et uniquement les programmes renvoyés sous RLS", async () => {
    const allowedPrograms = [fixtures.programs[0]!];
    const access = accessWithPrograms(allowedPrograms);
    const session = await loadAuthenticatedSupabaseSession(
      clientWithUser(fixtures.people[0]!.id),
      access,
    );
    expect(session.person.id).toBe(fixtures.people[0]!.id);
    expect(session.programs).toEqual(allowedPrograms);
    expect(access.programs.listPrograms).toHaveBeenCalledOnce();
  });

  it("refuse explicitement un utilisateur authentifié sans programme accessible", async () => {
    const access = accessWithPrograms([]);
    await expect(
      loadAuthenticatedSupabaseSession(clientWithUser(fixtures.people[0]!.id), access),
    ).rejects.toBeInstanceOf(NoProgramAccessError);
  });
});
