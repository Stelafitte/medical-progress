/**
 * Navigation dérivée des RÔLES CONTEXTUELS.
 *
 * Chaque espace possède sa propre navigation : apprenant, responsable de stage,
 * administration du programme, administration plateforme. Aucune entrée n'est
 * affichée sans le rôle correspondant dans le programme sélectionné, et chaque
 * route reste protégée indépendamment de la navigation.
 */
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  Building2,
  ClipboardCheck,
  Gauge,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  Mail,
  MessagesSquare,
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
  canAccessLearnerSpace,
  canAccessPlatformAdministration,
  canAccessProgramAdministration,
  canAccessSupervision,
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
 * Espace apprenant — quatre repères stables : pilotage immédiat, plan
 * longitudinal, apprentissages théoriques et acquisition des compétences.
 */
export const LEARNER_NAV: readonly NavEntry[] = [
  { to: "/espace", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  {
    to: "/espace/passeport",
    label: "Mon passeport",
    icon: IdCard,
    exact: false,
  },
  {
    to: "/espace/ressources",
    label: "Mes ressources théoriques",
    icon: BookOpen,
    exact: false,
  },
  { to: "/espace/stage", label: "Mes compétences", icon: BadgeCheck, exact: false },
];

export const SUPERVISION_NAV: readonly NavEntry[] = [
  { to: "/espace/encadrement", label: "Vue d'ensemble", icon: Gauge, exact: true },
  { to: "/espace/encadrement/etudiants", label: "Mes étudiants", icon: Users, exact: false },
  { to: "/espace/encadrement/carnets", label: "Carnets à valider", icon: Notebook, exact: false },
  {
    to: "/espace/encadrement/competences",
    label: "Compétences à confirmer",
    icon: BadgeCheck,
    exact: false,
  },
  { to: "/espace/encadrement/cas", label: "Cas et questions", icon: MessagesSquare, exact: false },
  { to: "/espace/encadrement/alertes", label: "Alertes", icon: AlertTriangle, exact: false },
  {
    to: "/espace/encadrement/bilans",
    label: "Bilans de stage",
    icon: ClipboardCheck,
    exact: false,
  },
  { to: "/espace/encadrement/messages", label: "Messagerie", icon: Mail, exact: false },
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
    to: "/espace/administration/pedagogie",
    label: "Concevoir le programme",
    icon: GraduationCap,
    exact: false,
  },
  {
    to: "/espace/administration/organisation",
    label: "Préparer la promotion",
    icon: Building2,
    exact: false,
  },
  {
    to: "/espace/administration/suivi",
    label: "Piloter la promotion",
    icon: ClipboardCheck,
    exact: false,
  },
  {
    to: "/espace/administration/gouvernance",
    label: "Gouvernance",
    icon: ShieldCheck,
    exact: false,
  },
];

export const PLATFORM_ADMIN_NAV: readonly NavEntry[] = [
  { to: "/espace/plateforme", label: "Administration plateforme", icon: ScrollText, exact: true },
  { to: "/espace/statistiques", label: "Statistiques", icon: BarChart3, exact: false },
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
    (entry) => entry.to === "/espace/administration/pedagogie",
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
      entries: SUPERVISION_NAV,
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
