/**
 * Navigation dérivée des RÔLES CONTEXTUELS.
 *
 * Chaque espace possède sa propre navigation : apprenant, responsable de stage,
 * administration du programme, administration plateforme. Aucune entrée n'est
 * affichée sans le rôle correspondant dans le programme sélectionné, et chaque
 * route reste protégée indépendamment de la navigation.
 */
import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileCheck,
  Gauge,
  GraduationCap,
  IdCard,
  Layers,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  SlidersHorizontal,
  Notebook,
  BarChart3,
  Route,
  ScrollText,
  ShieldCheck,
  Users,
  UserRound,
} from "lucide-react";
import type { ProgramId, RoleAssignment } from "@/domain/types";
import {
  canAccessInternalCommunication,
  canAccessLearnerSpace,
  canAccessPlatformAdministration,
  canAccessProgramAdministration,
  canAccessSupervision,
  canManagePlacementCalendar,
  canValidatePlacement,
} from "@/domain/access";

export interface NavEntry {
  readonly to: string;
  readonly label: string;
  readonly icon: typeof LayoutDashboard;
  readonly exact: boolean;
}

export interface NavSpace {
  readonly key: "learner" | "supervision" | "program_admin" | "platform_admin";
  readonly label: string;
  readonly entries: readonly NavEntry[];
}

/**
 * Espace apprenant — vocabulaire d'entrée aligné sur les espaces admin
 * (« Vue d'ensemble »). Les compétences existent indépendamment des stages :
 * « Mes compétences » reste toujours visible, seul « Mon carnet de stage »
 * dépend du module stages du programme.
 */
export const LEARNER_NAV: readonly NavEntry[] = [
  { to: "/espace", label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
  {
    to: "/espace/passeport",
    label: "Mon Passeport Éducatif",
    icon: IdCard,
    exact: false,
  },
  {
    to: "/espace/ressources",
    label: "Mes ressources",
    icon: BookOpen,
    exact: false,
  },
  { to: "/espace/competences", label: "Mes compétences", icon: BadgeCheck, exact: false },
  { to: "/espace/stage", label: "Mon carnet de stage", icon: Notebook, exact: false },
  { to: "/espace/evaluations", label: "Mes évaluations", icon: ClipboardCheck, exact: false },
  { to: "/espace/progression", label: "Mes statistiques", icon: BarChart3, exact: false },
  { to: "/espace/messages", label: "Mes messages", icon: Mail, exact: false },
  { to: "/espace/profil", label: "Mon profil", icon: UserRound, exact: false },
];

export const SUPERVISION_NAV: readonly NavEntry[] = [
  { to: "/espace/encadrement", label: "Vue d'ensemble", icon: Gauge, exact: true },
  { to: "/espace/encadrement/etudiants", label: "Mes étudiants", icon: Users, exact: false },
  { to: "/espace/encadrement/carnets", label: "Carnets à valider", icon: Notebook, exact: false },
  {
    to: "/espace/encadrement/calendrier",
    label: "Calendrier du stage",
    icon: CalendarDays,
    exact: false,
  },
  {
    to: "/espace/encadrement/competences",
    label: "Compétences à confirmer",
    icon: BadgeCheck,
    exact: false,
  },
  {
    to: "/espace/encadrement/connaissances",
    label: "Connaissances",
    icon: BookOpen,
    exact: false,
  },
  {
    to: "/espace/encadrement/bilans",
    label: "Bilans de stage",
    icon: ClipboardCheck,
    exact: false,
  },
  { to: "/espace/encadrement/messages", label: "Messagerie", icon: Mail, exact: false },
  /*
   * DEUX ECRANS PARTAGES AVEC L'ADMINISTRATION (Stef, 11/09). Ce sont les
   * MEMES routes, pas des copies : l'equipe et les envois d'un programme n'ont
   * qu'une seule source, et deux ecrans jumeaux finiraient par diverger. Leur
   * visibilite n'est pas la meme pour autant -- voir le filtre plus bas.
   */
  {
    to: "/espace/administration/communications",
    label: "Communication interne",
    icon: MessagesSquare,
    exact: false,
  },
  {
    to: "/espace/administration/encadrement",
    label: "Équipe d'encadrement",
    icon: Users,
    exact: false,
  },
  { to: "/espace/statistiques", label: "Statistiques", icon: BarChart3, exact: false },
  {
    to: "/espace/encadrement/profil",
    label: "Mon profil d'encadrant",
    icon: UserRound,
    exact: false,
  },
];

export const PROGRAM_ADMIN_NAV: readonly NavEntry[] = [
  { to: "/espace/administration", label: "Vue d’ensemble", icon: Gauge, exact: true },
  {
    to: "/espace/administration/concepteur",
    label: "Concepteur de programme",
    icon: GraduationCap,
    exact: false,
  },
  {
    to: "/espace/administration/pilotage",
    label: "Pilotage de programme",
    icon: Gauge,
    exact: false,
  },
  {
    to: "/espace/administration/classes",
    label: "Classes d'apprenants",
    icon: Users,
    exact: false,
  },
  {
    to: "/espace/administration/connaissances",
    label: "Base de connaissances",
    icon: BookOpen,
    exact: false,
  },
  {
    to: "/espace/administration/competences",
    label: "Compétences",
    icon: BadgeCheck,
    exact: false,
  },
  {
    to: "/espace/administration/evaluations",
    label: "Évaluations",
    icon: ClipboardCheck,
    exact: false,
  },
  {
    to: "/espace/administration/stages",
    label: "Gestion des stages",
    icon: Notebook,
    exact: false,
  },
  {
    to: "/espace/administration/encadrement",
    label: "Équipe d'encadrement",
    icon: Users,
    exact: false,
  },
  {
    to: "/espace/administration/communications",
    label: "Communication interne",
    icon: MessagesSquare,
    exact: false,
  },
  {
    to: "/espace/administration/documents",
    label: "Documents et certificats",
    icon: FileCheck,
    exact: false,
  },
  {
    to: "/espace/administration/securite",
    label: "Administration et sécurité",
    icon: ShieldCheck,
    exact: false,
  },
];

export const PLATFORM_ADMIN_NAV: readonly NavEntry[] = [
  { to: "/espace/plateforme", label: "Vue d'ensemble plateforme", icon: Gauge, exact: true },
  { to: "/espace/plateforme/programmes", label: "Programmes agrégés", icon: Layers, exact: false },
  {
    to: "/espace/plateforme/statistiques",
    label: "Statistiques",
    icon: BarChart3,
    exact: false,
  },
  {
    to: "/espace/plateforme/pilotage",
    label: "Pilotage et paramétrage",
    icon: SlidersHorizontal,
    exact: false,
  },
];

/**
 * Modules optionnels du programme sélectionné. Ils n'ajoutent aucune
 * architecture parallèle : ils masquent ou révèlent des entrées de navigation.
 */
export interface NavProgramConfig {
  readonly placementsEnabled: boolean;
  readonly auditsEnabled?: boolean;
  readonly dpcEnabled?: boolean;
}

/** Entrée du module optionnel d'audits de pratique (DPC). */
export const LEARNER_AUDITS_ENTRY: NavEntry = {
  to: "/espace/audits",
  label: "Audits de pratique",
  icon: ClipboardCheck,
  exact: false,
};

/** Entrée du parcours DPC intégré (audit 1 → formation → audit 2). */
export const LEARNER_DPC_ENTRY: NavEntry = {
  to: "/espace/dpc",
  label: "Mon parcours DPC",
  icon: Route,
  exact: false,
};

/** Entrée d'administration du programme DPC. */
export const ADMIN_DPC_ENTRY: NavEntry = {
  to: "/espace/administration/dpc",
  label: "Programme DPC",
  icon: Route,
  exact: false,
};

/** Navigation apprenant ajustée aux modules activés pour le programme. */
export function learnerNavFor(config?: NavProgramConfig): readonly NavEntry[] {
  if (!config) return LEARNER_NAV;
  const entries = LEARNER_NAV.filter(
    (entry) => entry.to !== "/espace/stage" || config.placementsEnabled,
  );
  // Le parcours DPC intègre déjà ses deux tours d'audit : pas de doublon.
  if (config.dpcEnabled) return [...entries, LEARNER_DPC_ENTRY];
  return config.auditsEnabled ? [...entries, LEARNER_AUDITS_ENTRY] : entries;
}

/** Navigation d'administration ajustée aux modules activés pour le programme. */
export function programAdminNavFor(config?: NavProgramConfig): readonly NavEntry[] {
  if (!config?.dpcEnabled) return PROGRAM_ADMIN_NAV;
  const index = PROGRAM_ADMIN_NAV.findIndex(
    (entry) => entry.to === "/espace/administration/pilotage",
  );
  const entries = [...PROGRAM_ADMIN_NAV];
  entries.splice(index + 1, 0, ADMIN_DPC_ENTRY);
  return entries;
}

/**
 * Intitulé de l'espace apprenant adapté au programme sélectionné
 * (« Mon parcours DFASM », « Mon parcours DIU », « Mon programme DPC »).
 */
export function learnerSpaceLabel(programCode?: string, config?: NavProgramConfig): string {
  if (config?.dpcEnabled) return "Mon programme DPC";
  const code = (programCode ?? "").toUpperCase();
  if (code.startsWith("DFASM")) return "Mon parcours DFASM";
  if (code.startsWith("DIU")) return "Mon parcours DIU";
  if (code.startsWith("DPC")) return "Mon programme DPC";
  return "Mon parcours de formation";
}

/** Espaces visibles pour une personne dans le programme sélectionné. */
export function navSpacesFor(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
  config?: NavProgramConfig,
  programCode?: string,
): readonly NavSpace[] {
  const spaces: NavSpace[] = [];
  if (canAccessLearnerSpace(assignments, programId))
    spaces.push({
      key: "learner",
      label: learnerSpaceLabel(programCode, config),
      entries: learnerNavFor(config),
    });
  if (canAccessSupervision(assignments, programId))
    spaces.push({
      key: "supervision",
      label: "Supervision des stages",
      /*
       * LE CALENDRIER N'EST PAS POUR TOUT LE MONDE. Poser les semaines « en
       * service / chez soi » est reserve a l'administrateur du programme et au
       * responsable de stage -- `can_set_placement_calendar` en base. Montrer
       * l'entree a un encadrant simple lui ouvrirait un ecran dont chaque
       * bouton echoue.
       */
      entries: SUPERVISION_NAV.filter((e) => {
        if (e.to === "/espace/encadrement/calendrier")
          return canManagePlacementCalendar(assignments, programId);
        /* La communication interne est ouverte a toute l'equipe du programme :
           c'est ce que dit `is_program_staff` en base. */
        if (e.to === "/espace/administration/communications")
          return canAccessInternalCommunication(assignments, programId);
        /* L'EQUIPE D'ENCADREMENT EST POUR LE RESPONSABLE DE STAGE, PAS POUR
           L'ENCADRANT (Stef, 11/09). Brancher une source d'equipe injecte des
           personnes dans le vivier du programme : c'est un geste de
           gouvernance, pas un geste de terrain. */
        if (e.to === "/espace/administration/encadrement")
          return canValidatePlacement(assignments, programId);
        return true;
      }),
    });
  if (canAccessProgramAdministration(assignments, programId))
    spaces.push({
      key: "program_admin",
      label: "Administration des programmes",
      entries: programAdminNavFor(config),
    });

  if (canAccessPlatformAdministration(assignments))
    spaces.push({
      key: "platform_admin",
      label: "Administration plateforme",
      entries: PLATFORM_ADMIN_NAV,
    });
  return spaces;
}

/**
 * Première page réellement accessible pour les espaces visibles.
 * Utilisée après un changement de profil : sans cela, l'écran conservé
 * pouvait afficher « Accès restreint » alors que le profil a d'autres droits.
 */
export function landingRouteFor(spaces: readonly NavSpace[]): string {
  const first = spaces[0];
  if (!first) return "/espace/profil";
  // Un administrateur (de programme ou de plateforme) commence toujours par la
  // vue « Tous les programmes » : le périmètre est choisi explicitement.
  if (first.key === "platform_admin") return "/espace/plateforme";
  if (first.key === "program_admin") return "/espace/programmes";
  return first.entries[0]?.to ?? "/espace/profil";
}

/** Vrai si le chemin courant appartient aux espaces visibles. */
export function isRouteWithinSpaces(spaces: readonly NavSpace[], pathname: string): boolean {
  return spaces.some((space) =>
    space.entries.some((entry) =>
      entry.exact ? pathname === entry.to : pathname.startsWith(entry.to),
    ),
  );
}
