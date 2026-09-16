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
import { getSelectedDataAccess } from "@/application/dataAccess";
import { getBrowserSupabaseClient } from "@/infrastructure/supabase/client";
import { SupabaseLoginForm } from "@/components/supabase-login-form";

import {
  AuthenticationRequiredError,
  loadAuthenticatedSupabaseSession,
} from "@/application/supabaseSession";
import * as fx from "@/infrastructure/mock/fixtures";
import {
  clearDemoSession,
  readActiveRoleKey,
  readDemoSession,
  reconcileDemoSession,
  writeActiveRoleKey,
  writeDemoSession,
} from "@/application/sessionPersistence";
import {
  canAccessAdministration,
  canAccessOwnProfile,
  canAccessPlatformAdministration,
  canAccessInternalCommunication,
  canAccessProgramAdministration,
  canAccessStatistics,
  canAccessSupervision,
  canManagePlacementCalendar,
  canValidatePlacement,
} from "@/domain/access";
import { preferredRoleAssignment, rolesInContext, roleAssignmentKey } from "@/domain/roles";
import type {
  Enrollment,
  Person,
  PersonId,
  Program,
  ProgramId,
  RoleAssignment,
  RoleName,
} from "@/domain/types";

/**
 * Masquage temporaire, cote ecran uniquement (aucune donnee supprimee) :
 * programmes qui ne doivent pas apparaitre dans l'admin pour l'instant.
 * A retirer quand le programme sera pret a etre remontre.
 */
const HIDDEN_PROGRAM_CODES: readonly string[] = ["DPC-ODP2C"];

export interface SessionValue {
  readonly person: Person;
  readonly people: readonly Person[];
  readonly programs: readonly Program[];
  readonly activeProgram: Program;
  readonly activeEnrollment?: Enrollment;
  readonly enrollments: readonly Enrollment[];
  readonly roles: readonly RoleAssignment[];
  /** Rôle actif choisi parmi les rôles réels de la personne (bascule "voir en tant que"). */
  readonly activeRole: RoleAssignment | null;
  /**
   * Rôle(s) à utiliser pour toute décision d'accès ou de navigation : le rôle
   * actif seul si un rôle actif est sélectionné, sinon `roles` en entier.
   * Ne JAMAIS utiliser `roles` (liste complète) pour du contrôle d'accès ou
   * de la construction de navigation — utiliser systématiquement ce champ.
   */
  readonly rolesForAccess: readonly RoleAssignment[];
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
  /** Poser les semaines « en service / chez soi » : administrateur ou responsable de stage. */
  readonly canManagePlacementCalendar: boolean;
  /** Prononcer la validation d'un stage : responsable de stage ou administrateur. */
  readonly canValidatePlacement: boolean;
  /** Communication interne : toute l'équipe du programme, encadrants compris. */
  readonly canAccessInternalCommunication: boolean;
  /** Outil statistique : encadrants, enseignants et administrateurs. */
  readonly canAccessStatistics: boolean;
  readonly canAccessProfile: boolean;
  /** Vrai tant que la session est mockée ; faux dès l'authentification réelle. */
  readonly isSimulated: boolean;
  setActiveProgramId(id: ProgramId): void;
  /** Bascule d'identité simulée (démonstration des rôles, pas une authentification). */
  setActivePersonId(id: PersonId): void;
  /** Change le rôle actif ("voir en tant que") pour une session authentifiée. Sans effet en session simulée. */
  setActiveRole(role: RoleAssignment | null): void;
  /** Revient au profil et au programme par défaut, et efface la persistance locale. */
  resetDemoSession(): void;
  /**
   * Relit la session depuis la source de données. À appeler après une écriture
   * qui change ce que la session porte — la correction de sa propre fiche, par
   * exemple : sans cela l'en-tête continuerait d'afficher l'ancien nom jusqu'au
   * prochain rechargement complet de la page. Sans effet en session simulée,
   * dont les données sont des fixtures immuables.
   */
  reloadSession(): Promise<void>;
  signOut(): Promise<void>;
  hasRoleInProgram(role: RoleName, programId: ProgramId): boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

const DEFAULT_PROGRAM_ID = fx.programs[0]!.id;
const DEFAULT_PERSON_ID = fx.people[0]!.id;

function MockSessionProvider({ children }: { children: ReactNode }) {
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
      activeRole: roles[0] ?? null,
      rolesForAccess: roles,
      rolesInActiveProgram: rolesInContext(roles, { programId: activeProgram.id }),
      canAccessAdministration: canAccessAdministration(roles, activeProgram.id),
      canAccessProgramAdministration: canAccessProgramAdministration(roles, activeProgram.id),
      canAccessPlatformAdministration: canAccessPlatformAdministration(roles),
      canAccessSupervision: canAccessSupervision(roles, activeProgram.id),
      canManagePlacementCalendar: canManagePlacementCalendar(roles, activeProgram.id),
      canValidatePlacement: canValidatePlacement(roles, activeProgram.id),
      canAccessInternalCommunication: canAccessInternalCommunication(roles, activeProgram.id),
      canAccessStatistics: canAccessStatistics(roles, activeProgram.id),
      canAccessProfile: canAccessOwnProfile(true),
      isSimulated: true,
      setActiveProgramId,
      setActivePersonId: selectPerson,
      setActiveRole: () => undefined,
      resetDemoSession,
      reloadSession: async () => undefined,
      signOut: async () => undefined,
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

type SupabaseSessionState = {
  person: Person;
  programs: readonly Program[];
  enrollments: readonly Enrollment[];
  roles: readonly RoleAssignment[];
};

function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const dataAccess = getSelectedDataAccess();
  const client = getBrowserSupabaseClient();
  const [state, setState] = useState<SupabaseSessionState | null>(null);
  const [activeProgramId, setActiveProgramId] = useState<ProgramId | null>(null);
  /** Clé du rôle actif choisi ("voir en tant que") ; null = pas encore choisi, on prend le premier rôle. */
  const [activeRoleKey, setActiveRoleKeyState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authenticationRequired, setAuthenticationRequired] = useState(false);

  const load = useCallback(async () => {
    if (!client) throw new Error("Le client Supabase n’est pas configuré.");
    const {
      person,
      programs: loadedPrograms,
      enrollments,
      roles,
    } = await loadAuthenticatedSupabaseSession(client, dataAccess);
    // Masquage temporaire, cote ecran uniquement (aucune donnee supprimee).
    const programs = loadedPrograms.filter(
      (program) => !HIDDEN_PROGRAM_CODES.includes(program.code),
    );
    setState({ person, programs, enrollments, roles });
    /*
     * RÔLE ACTIF : on reprend celui que la personne a choisi la dernière fois.
     * Sans cela il repartait de `roles[0]`, c'est-à-dire de l'ordre rendu par la
     * base : un compte multi-rôles retombait sur « encadrant » à chaque
     * connexion et lisait « Accès restreint » sur ses propres écrans.
     */
    setActiveRoleKeyState((current) => current ?? readActiveRoleKey(person.id));
    setActiveProgramId((current) =>
      current && programs.some((program) => program.id === current) ? current : programs[0]!.id,
    );
    setError(null);
    setAuthenticationRequired(false);
  }, [client, dataAccess]);

  const handleLoadError = useCallback((reason: unknown) => {
    setState(null);
    setAuthenticationRequired(reason instanceof AuthenticationRequiredError);
    setError(reason instanceof Error ? reason.message : "Chargement Supabase impossible.");
  }, []);

  /**
   * Change le rôle actif. Si ce rôle est rattaché à un programme précis, le
   * programme actif est aligné dessus (une portée plateforme laisse le choix libre).
   */
  const personId = state?.person.id;
  const setActiveRole = useCallback(
    (role: RoleAssignment | null) => {
      const key = role ? roleAssignmentKey(role) : null;
      setActiveRoleKeyState(key);
      /* Le choix survit au rechargement : c'est lui, et non l'ordre de la base,
         qui décide du rôle actif à la prochaine connexion. */
      if (personId) writeActiveRoleKey(personId, key);
      if (role && "programId" in role.scope) {
        setActiveProgramId(role.scope.programId);
      }
    },
    [personId],
  );

  useEffect(() => {
    void load().catch(handleLoadError);
    if (!client) return;
    const { data } = client.auth.onAuthStateChange(() => {
      window.setTimeout(() => void load().catch(handleLoadError), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [client, handleLoadError, load]);

  const value = useMemo<SessionValue | null>(() => {
    if (!state || !activeProgramId) return null;
    const activeProgram =
      state.programs.find((program) => program.id === activeProgramId) ?? state.programs[0];
    if (!activeProgram) return null;
    const activeEnrollment = state.enrollments.find(
      (enrollment) => enrollment.programId === activeProgram.id,
    );
    /**
     * Une personne peut cumuler plusieurs rôles réels (ex. Admin Plateforme +
     * Enseignant). Par défaut on active le rôle le plus large qui couvre le
     * programme ouvert — JAMAIS `roles[0]`, dont l'ordre vient de la base et ne
     * veut rien dire. L'utilisateur peut
     * ensuite choisir un rôle actif ("voir en tant que") via le sélecteur de
     * l'en-tête. Les droits affichés ne portent alors que sur CE rôle, jamais
     * sur l'union de tous ses rôles — cohérence avec la règle "aucun rôle
     * global implicite".
     */
    const activeRole =
      state.roles.find((r) => roleAssignmentKey(r) === activeRoleKey) ??
      preferredRoleAssignment(state.roles, { programId: activeProgram.id });
    const rolesForAccess = activeRole ? [activeRole] : state.roles;
    const rolesInActiveProgram = rolesInContext(rolesForAccess, { programId: activeProgram.id });
    return {
      person: state.person,
      people: [state.person],
      programs: state.programs,
      activeProgram,
      ...(activeEnrollment ? { activeEnrollment } : {}),
      enrollments: state.enrollments,
      roles: state.roles,
      activeRole,
      rolesForAccess,
      rolesInActiveProgram,
      canAccessAdministration: canAccessAdministration(rolesForAccess, activeProgram.id),
      canAccessProgramAdministration: canAccessProgramAdministration(
        rolesForAccess,
        activeProgram.id,
      ),
      canAccessPlatformAdministration: canAccessPlatformAdministration(rolesForAccess),
      canAccessSupervision: canAccessSupervision(rolesForAccess, activeProgram.id),
      canManagePlacementCalendar: canManagePlacementCalendar(rolesForAccess, activeProgram.id),
      canValidatePlacement: canValidatePlacement(rolesForAccess, activeProgram.id),
      canAccessInternalCommunication: canAccessInternalCommunication(
        rolesForAccess,
        activeProgram.id,
      ),
      canAccessStatistics: canAccessStatistics(rolesForAccess, activeProgram.id),
      canAccessProfile: canAccessOwnProfile(true),
      isSimulated: false,
      setActiveProgramId,
      setActivePersonId: () => undefined,
      setActiveRole,
      resetDemoSession: () => undefined,
      reloadSession: async () => {
        await load();
      },
      signOut: async () => {
        if (!client) return;
        /* Le rôle choisi ne survit pas à la déconnexion. */
        writeActiveRoleKey(state.person.id, null);
        const { error: signOutError } = await client.auth.signOut();
        if (signOutError) throw new Error(signOutError.message);
      },
      hasRoleInProgram: (role, programId) =>
        state.roles.some(
          (assignment) =>
            assignment.role === role &&
            (assignment.scope.kind === "platform" ||
              ("programId" in assignment.scope && assignment.scope.programId === programId)),
        ),
    };
  }, [activeProgramId, activeRoleKey, client, load, setActiveRole, state]);

  if (error) {
    return (
      /*
       * ⚠️ L'ECRAN DE CONNEXION NE PARLE PLUS DE SUPABASE — corrigé le 11/09
       * sur constat de Stef. Il titrait « Connexion Supabase requise » et
       * affichait dessous le message technique brut de la couche
       * d'authentification. Le nom de notre fournisseur de base de données ne
       * regarde pas l'étudiant qui se connecte, et un message d'API en guise
       * d'accueil se lit comme une panne.
       *
       * LA DISTINCTION QUI COMPTE : ne pas être identifié n'est PAS une erreur.
       * Quand c'est simplement le cas (`authenticationRequired`), on accueille.
       * Quand quelque chose a vraiment échoué, on montre le message — car là il
       * aide, et le taire laisserait devant un écran muet.
       */
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">
            {authenticationRequired ? "Campus Santé Augmenté" : "Connexion impossible"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {authenticationRequired
              ? "Identifiez-vous avec l'adresse e-mail de votre compte pour accéder à votre espace."
              : error}
          </p>
          {authenticationRequired && client ? <SupabaseLoginForm client={client} /> : null}
          {!authenticationRequired && client ? (
            <button
              className="text-sm text-primary underline"
              type="button"
              onClick={() => void client.auth.signOut()}
            >
              Se déconnecter
            </button>
          ) : null}
        </div>
      </main>
    );
  }
  if (!value) {
    return <p className="p-6 text-sm text-muted-foreground">Chargement de la session…</p>;
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  let dataAccess;
  try {
    dataAccess = getSelectedDataAccess();
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Configuration invalide.";
    return <p className="p-6 text-sm text-destructive">{message}</p>;
  }
  return dataAccess.isMock ? (
    <MockSessionProvider>{children}</MockSessionProvider>
  ) : (
    <SupabaseSessionProvider>{children}</SupabaseSessionProvider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession doit être utilisé dans <SessionProvider>.");
  return ctx;
}

/** Point d'accès unique à la couche données sélectionnée par l'environnement. */
export function useDataAccess() {
  return getSelectedDataAccess();
}
