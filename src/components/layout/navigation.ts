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
  FileText,
  Gauge,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  Notebook,
  BarChart3,
  ScrollText,
  ShieldCheck,
  Stethoscope,
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

/** Espace apprenant — ordre gelé : Tableau de bord, Passeport, Ressources, Stage. */
export const LEARNER_NAV: readonly NavEntry[] = [
  { to: "/espace", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { to: "/espace/passeport", label: "Passeport", icon: IdCard, exact: false },
  { to: "/espace/ressources", label: "Ressources", icon: BookOpen, exact: false },
  { to: "/espace/stage", label: "Stage", icon: Stethoscope, exact: false },
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
  { to: "/espace/administration", label: "Pilotage", icon: Gauge, exact: true },
  {
    to: "/espace/administration/organisation",
    label: "Organisation",
    icon: Building2,
    exact: false,
  },
  {
    to: "/espace/administration/pedagogie",
    label: "Configuration pédagogique",
    icon: GraduationCap,
    exact: false,
  },
  {
    to: "/espace/administration/suivi",
    label: "Suivi pédagogique",
    icon: ClipboardCheck,
    exact: false,
  },
  {
    to: "/espace/administration/communications",
    label: "Communications",
    icon: Mail,
    exact: false,
  },
  {
    to: "/espace/administration/documents",
    label: "Documents et certificats",
    icon: FileText,
    exact: false,
  },
  { to: "/espace/statistiques", label: "Statistiques", icon: BarChart3, exact: false },
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
}

/** Entrée du module optionnel d'audits de pratique (DPC). */
export const LEARNER_AUDITS_ENTRY: NavEntry = {
  to: "/espace/audits",
  label: "Audits de pratique",
  icon: ClipboardCheck,
  exact: false,
};

/** Navigation apprenant ajustée aux modules activés pour le programme. */
export function learnerNavFor(config?: NavProgramConfig): readonly NavEntry[] {
  if (!config) return LEARNER_NAV;
  const entries = LEARNER_NAV.filter(
    (entry) => entry.to !== "/espace/stage" || config.placementsEnabled,
  );
  return config.auditsEnabled ? [...entries, LEARNER_AUDITS_ENTRY] : entries;
}

/** Espaces visibles pour une personne dans le programme sélectionné. */
export function navSpacesFor(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
  config?: NavProgramConfig,
): readonly NavSpace[] {
  const spaces: NavSpace[] = [];
  if (canAccessLearnerSpace(assignments, programId))
    spaces.push({ key: "learner", label: "Espace apprenant", entries: learnerNavFor(config) });
  if (canAccessSupervision(assignments, programId))
    spaces.push({
      key: "supervision",
      label: "Espace responsable de stage",
      entries: SUPERVISION_NAV,
    });
  if (canAccessProgramAdministration(assignments, programId))
    spaces.push({
      key: "program_admin",
      label: "Administration du programme",
      entries: PROGRAM_ADMIN_NAV,
    });
  if (canAccessPlatformAdministration(assignments))
    spaces.push({
      key: "platform_admin",
      label: "Administration plateforme",
      entries: PLATFORM_ADMIN_NAV,
    });
  return spaces;
}
