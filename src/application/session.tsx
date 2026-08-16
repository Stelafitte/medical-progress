/**
 * Session SIMULÉE (aucune authentification réelle dans cette itération).
 * L'API du contexte est volontairement proche d'une future session serveur :
 * personne courante, inscriptions, rôles contextualisés, programme actif.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { mockDataAccess } from "@/data/mock/mockDataAccess";
import * as fx from "@/data/mock/fixtures";
import type {
  Enrollment,
  Person,
  Program,
  ProgramId,
  RoleAssignment,
  RoleName,
} from "@/domain/types";

export interface SessionValue {
  readonly person: Person;
  readonly programs: readonly Program[];
  readonly activeProgram: Program;
  readonly activeEnrollment: Enrollment;
  readonly roles: readonly RoleAssignment[];
  readonly isSimulated: true;
  setActiveProgramId(id: ProgramId): void;
  hasRoleInProgram(role: RoleName, programId: ProgramId): boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeProgramId, setActiveProgramId] = useState<ProgramId>(fx.programs[0]!.id);

  const value = useMemo<SessionValue>(() => {
    const person = fx.people[0]!;
    const roles = fx.roleAssignments.filter((r) => r.personId === person.id);
    const activeProgram = fx.programs.find((p) => p.id === activeProgramId) ?? fx.programs[0]!;
    const activeEnrollment =
      fx.enrollments.find((e) => e.personId === person.id && e.programId === activeProgram.id) ??
      fx.enrollments[0]!;

    return {
      person,
      programs: fx.programs,
      activeProgram,
      activeEnrollment,
      roles,
      isSimulated: true,
      setActiveProgramId,
      hasRoleInProgram: (role, programId) =>
        roles.some(
          (r) =>
            r.role === role &&
            (r.scope.kind === "platform" ||
              ("programId" in r.scope && r.scope.programId === programId)),
        ),
    };
  }, [activeProgramId]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession doit être utilisé dans <SessionProvider>.");
  return ctx;
}

/** Point d'accès unique à la couche données (mock pour l'instant). */
export function useDataAccess() {
  return mockDataAccess;
}
