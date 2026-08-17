/**
 * Session SIMULÉE (aucune authentification réelle dans cette itération).
 * L'API du contexte est volontairement proche d'une future session serveur :
 * personne courante, inscriptions, rôles contextualisés, programme actif.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { mockDataAccess } from "@/infrastructure/mock/mockDataAccess";
import * as fx from "@/infrastructure/mock/fixtures";
import {
  canAccessAdministration,
  canAccessOwnProfile,
  canAccessPlatformAdministration,
  canAccessProgramAdministration,
  canAccessSupervision,
} from "@/domain/access";
import { rolesInContext } from "@/domain/roles";
import type {
  Enrollment,
  Person,
  PersonId,
  Program,
  ProgramId,
  RoleAssignment,
  RoleName,
} from "@/domain/types";

export interface SessionValue {
  readonly person: Person;
  readonly people: readonly Person[];
  readonly programs: readonly Program[];
  readonly activeProgram: Program;
  readonly activeEnrollment: Enrollment;
  readonly enrollments: readonly Enrollment[];
  readonly roles: readonly RoleAssignment[];
  /** Rôles effectifs dans le programme sélectionné. */
  readonly rolesInActiveProgram: readonly RoleName[];
  /** Dérivé des RoleAssignment, recalculé à chaque changement de programme. */
  readonly canAccessAdministration: boolean;
  /** Administration DU programme sélectionné (jamais implicite pour un admin plateforme). */
  readonly canAccessProgramAdministration: boolean;
  /** Administration PLATEFORME : supervision, sans dossier pédagogique. */
  readonly canAccessPlatformAdministration: boolean;
  /** Espace responsable de stage, limité aux affectations de la personne. */
  readonly canAccessSupervision: boolean;
  readonly canAccessProfile: boolean;
  readonly isSimulated: true;
  setActiveProgramId(id: ProgramId): void;
  /** Bascule d'identité simulée (démonstration des rôles, pas une authentification). */
  setActivePersonId(id: PersonId): void;
  hasRoleInProgram(role: RoleName, programId: ProgramId): boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeProgramId, setActiveProgramId] = useState<ProgramId>(fx.programs[0]!.id);
  const [activePersonId, setActivePersonId] = useState<PersonId>(fx.people[0]!.id);

  const value = useMemo<SessionValue>(() => {
    const person = fx.people.find((p) => p.id === activePersonId) ?? fx.people[0]!;
    const roles = fx.roleAssignments.filter((r) => r.personId === person.id);
    const activeProgram = fx.programs.find((p) => p.id === activeProgramId) ?? fx.programs[0]!;
    const enrollments = fx.enrollments.filter((e) => e.personId === person.id);
    const activeEnrollment =
      enrollments.find((e) => e.programId === activeProgram.id) ??
      fx.enrollments.find((e) => e.programId === activeProgram.id) ??
      fx.enrollments[0]!;

    return {
      person,
      people: fx.people,
      programs: fx.programs,
      activeProgram,
      activeEnrollment,
      enrollments,
      roles,
      rolesInActiveProgram: rolesInContext(roles, { programId: activeProgram.id }),
      canAccessAdministration: canAccessAdministration(roles, activeProgram.id),
      canAccessProgramAdministration: canAccessProgramAdministration(roles, activeProgram.id),
      canAccessPlatformAdministration: canAccessPlatformAdministration(roles),
      canAccessSupervision: canAccessSupervision(roles, activeProgram.id),
      canAccessProfile: canAccessOwnProfile(true),
      isSimulated: true,
      setActiveProgramId,
      setActivePersonId,
      hasRoleInProgram: (role, programId) =>
        roles.some(
          (r) =>
            r.role === role &&
            (r.scope.kind === "platform" ||
              ("programId" in r.scope && r.scope.programId === programId)),
        ),
    };
  }, [activeProgramId, activePersonId]);

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
