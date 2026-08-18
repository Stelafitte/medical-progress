/**
 * Session SIMULÉE (aucune authentification réelle dans cette itération).
 * L'API du contexte est volontairement proche d'une future session serveur :
 * personne courante, inscriptions, rôles contextualisés, programme actif.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { mockDataAccess } from "@/infrastructure/mock/mockDataAccess";
import * as fx from "@/infrastructure/mock/fixtures";
import {
  clearDemoSession,
  readDemoSession,
  reconcileDemoSession,
  writeDemoSession,
} from "@/application/sessionPersistence";
import {
  canAccessAdministration,
  canAccessOwnProfile,
  canAccessPlatformAdministration,
  canAccessProgramAdministration,
  canAccessStatistics,
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
  /** Outil statistique : encadrants, enseignants et administrateurs. */
  readonly canAccessStatistics: boolean;
  readonly canAccessProfile: boolean;
  /** Vrai tant que la session est mockée ; faux dès l'authentification réelle. */
  readonly isSimulated: boolean;
  setActiveProgramId(id: ProgramId): void;
  /** Bascule d'identité simulée (démonstration des rôles, pas une authentification). */
  setActivePersonId(id: PersonId): void;
  /** Revient au profil et au programme par défaut, et efface la persistance locale. */
  resetDemoSession(): void;
  hasRoleInProgram(role: RoleName, programId: ProgramId): boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

const DEFAULT_PROGRAM_ID = fx.programs[0]!.id;
const DEFAULT_PERSON_ID = fx.people[0]!.id;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeProgramId, setActiveProgramId] = useState<ProgramId>(DEFAULT_PROGRAM_ID);
  const [activePersonId, setActivePersonId] = useState<PersonId>(DEFAULT_PERSON_ID);
  const [hydrated, setHydrated] = useState(false);

  /**
   * Restauration APRÈS hydratation (jamais pendant le rendu serveur) :
   * un rechargement de l'aperçu conserve le profil et le programme choisis.
   */
  useEffect(() => {
    const stored = reconcileDemoSession(readDemoSession(), {
      personIds: fx.people.map((p) => p.id),
      programIds: fx.programs.map((p) => p.id),
    });
    if (stored) {
      setActivePersonId(stored.personId);
      setActiveProgramId(stored.programId);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeDemoSession({ personId: activePersonId, programId: activeProgramId });
  }, [hydrated, activePersonId, activeProgramId]);

  /**
   * Bascule d'identité simulée : on sélectionne aussi un programme dans lequel
   * la personne possède réellement un rôle, sinon l'écran afficherait un
   * programme sans aucun droit pour ce profil.
   */
  const selectPerson = useCallback(
    (id: PersonId) => {
      setActivePersonId(id);
      const assignments = fx.roleAssignments.filter((r) => r.personId === id);
      const hasRoleHere = assignments.some(
        (r) =>
          r.scope.kind === "platform" ||
          ("programId" in r.scope && r.scope.programId === activeProgramId),
      );
      if (hasRoleHere) return;
      const scoped = assignments.find((r) => "programId" in r.scope);
      if (scoped && "programId" in scoped.scope) setActiveProgramId(scoped.scope.programId);
    },
    [activeProgramId],
  );

  const resetDemoSession = useCallback(() => {
    clearDemoSession();
    setActivePersonId(DEFAULT_PERSON_ID);
    setActiveProgramId(DEFAULT_PROGRAM_ID);
  }, []);

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
      canAccessStatistics: canAccessStatistics(roles, activeProgram.id),
      canAccessProfile: canAccessOwnProfile(true),
      isSimulated: true,
      setActiveProgramId,
      setActivePersonId: selectPerson,
      resetDemoSession,
      hasRoleInProgram: (role, programId) =>
        roles.some(
          (r) =>
            r.role === role &&
            (r.scope.kind === "platform" ||
              ("programId" in r.scope && r.scope.programId === programId)),
        ),
    };
  }, [activeProgramId, activePersonId, selectPerson, resetDemoSession]);

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
