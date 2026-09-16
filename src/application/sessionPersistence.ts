/**
 * Persistance LOCALE de la session de démonstration.
 *
 * Seuls deux identifiants d'affichage sont conservés (profil de démonstration
 * et programme sélectionné) afin qu'un rechargement de l'aperçu ne ramène pas
 * systématiquement au premier profil. Aucune donnée personnelle, aucun jeton,
 * aucune preuve : sessionStorage uniquement, effacé à la fermeture de l'onglet.
 */
export const DEMO_SESSION_STORAGE_KEY = "mpe.demo-session.v1";

export interface DemoSessionState {
  readonly personId: string;
  readonly programId: string;
}

/** Lit un état valide ou retourne null (JSON corrompu, clé absente, SSR). */
export function parseDemoSession(raw: string | null): DemoSessionState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { personId, programId } = parsed as Record<string, unknown>;
    if (typeof personId !== "string" || typeof programId !== "string") return null;
    if (!personId || !programId) return null;
    return { personId, programId };
  } catch {
    return null;
  }
}

/** Conserve l'état seulement si les deux identifiants existent encore. */
export function reconcileDemoSession(
  stored: DemoSessionState | null,
  known: { readonly personIds: readonly string[]; readonly programIds: readonly string[] },
): DemoSessionState | null {
  if (!stored) return null;
  if (!known.personIds.includes(stored.personId)) return null;
  if (!known.programIds.includes(stored.programId)) return null;
  return stored;
}

export function readDemoSession(): DemoSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    return parseDemoSession(window.sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeDemoSession(state: DemoSessionState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* aperçu en mode restreint : la persistance est facultative. */
  }
}

export function clearDemoSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
  } catch {
    /* ignoré volontairement. */
  }
}

/**
 * RÔLE ACTIF D'UNE SESSION AUTHENTIFIÉE (« Voir en tant que »).
 *
 * Conservé dans `localStorage` — et non dans `sessionStorage` — parce qu'il doit
 * survivre à la fermeture de l'onglet : sans cela, chaque connexion repartait
 * sur un rôle décidé par l'ordre de la base. Aucune donnée personnelle : le nom
 * d'un rôle et la portée où il s'exerce, pour la seule personne dont
 * l'identifiant est enregistré avec. Effacé à la déconnexion.
 */
export const ACTIVE_ROLE_STORAGE_KEY = "mpe.active-role.v1";

export interface ActiveRoleState {
  readonly personId: string;
  readonly roleKey: string;
}

/** Lit un état valide ou retourne null (JSON corrompu, clé absente, SSR). */
export function parseActiveRole(raw: string | null): ActiveRoleState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { personId, roleKey } = parsed as Record<string, unknown>;
    if (typeof personId !== "string" || typeof roleKey !== "string") return null;
    if (!personId || !roleKey) return null;
    return { personId, roleKey };
  } catch {
    return null;
  }
}

/** Clé du rôle conservé POUR CETTE PERSONNE, ou null (autre personne, rien d'enregistré). */
export function readActiveRoleKey(personId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = parseActiveRole(window.localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY));
    return stored && stored.personId === personId ? stored.roleKey : null;
  } catch {
    return null;
  }
}

/** Enregistre le rôle choisi ; `null` efface (déconnexion, retour au rôle par défaut). */
export function writeActiveRoleKey(personId: string, roleKey: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (roleKey) {
      window.localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, JSON.stringify({ personId, roleKey }));
    } else {
      window.localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY);
    }
  } catch {
    /* navigateur en mode restreint : la persistance est facultative. */
  }
}
