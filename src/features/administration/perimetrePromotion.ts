/**
 * LE PÉRIMÈTRE « PROMOTION » DES ÉCRANS PROFESSIONNELS (Stef, 21/09).
 *
 * Deux menus en haut à droite : le programme, puis la promotion. « Toutes les
 * promotions » garde le fonctionnement d'avant (chaque onglet propose son
 * propre choix). Une promotion choisie s'impose à tous les onglets qui en
 * dépendent.
 *
 * Trois natures d'onglet, et le bandeau de rappel le dit à chaque fois :
 * - « promotion » : l'écran n'affiche que la promotion choisie ;
 * - « programme » : le référentiel est commun à TOUTES les promotions (une
 *   compétence modifiée l'est pour toutes) — d'où le verrou d'édition ;
 * - « transversal » : l'écran n'est pas découpé par promotion (équipe,
 *   communication, sécurité…).
 *
 * Tout ce qui est décidable sans React vit ici, pour être testé.
 */
import type { Cohort } from "@/domain/types";

export type NatureOnglet = "promotion" | "programme" | "transversal";

const ONGLETS_PROGRAMME = ["concepteur", "connaissances", "competences", "evaluations"];
const ONGLETS_PROMOTION = ["", "pilotage", "classes", "stages", "documents"];

/** Nature de l'onglet d'administration ouvert, ou `null` hors administration. */
export function natureOnglet(pathname: string): NatureOnglet | null {
  const m = /^\/espace\/administration(?:\/([^/?#]+))?/.exec(pathname);
  if (!m) return null;
  const segment = m[1] ?? "";
  if (ONGLETS_PROGRAMME.includes(segment)) return "programme";
  if (ONGLETS_PROMOTION.includes(segment)) return "promotion";
  return "transversal";
}

/** Une promotion dont des étudiants vivent le programme en ce moment. */
export function estPromotionVivante(cohort: Pick<Cohort, "status" | "archivedAt">): boolean {
  if (cohort.archivedAt) return false;
  return cohort.status === "open" || cohort.status === "in_progress";
}

/**
 * Le verrou d'édition ne s'impose que si une promotion est ouverte ou en
 * cours : pendant la construction du programme, il gênerait sans protéger
 * personne.
 */
export function verrouNecessaire(cohorts: readonly Pick<Cohort, "status" | "archivedAt">[]) {
  return cohorts.some(estPromotionVivante);
}

/** Les promotions touchées par une modification du programme, vivantes d'abord. */
export function promotionsConcernees<T extends Pick<Cohort, "status" | "archivedAt" | "label">>(
  cohorts: readonly T[],
): readonly T[] {
  return cohorts
    .filter((c) => !c.archivedAt && c.status !== "archived")
    .sort((a, b) => Number(estPromotionVivante(b)) - Number(estPromotionVivante(a)));
}

/**
 * La promotion mémorisée appartient-elle encore au programme affiché ? Sinon
 * (changement de programme, promotion archivée), on revient à « Toutes ».
 */
export function promotionValide(
  cohortId: string | null,
  cohorts: readonly Pick<Cohort, "id">[],
): string | null {
  if (!cohortId) return null;
  return cohorts.some((c) => c.id === cohortId) ? cohortId : null;
}

/**
 * Faut-il intercepter ce clic quand le programme est verrouillé ? Oui pour ce
 * qui agit (bouton, interrupteur, case, fichier) ; non pour ce qui ne fait que
 * montrer : dépliage d'un bloc (aria-expanded), menu ou liste déroulante
 * (aria-haspopup, combobox), onglet, lien de navigation, et tout élément
 * marqué `data-lecture`.
 */
export interface ElementCliquable {
  readonly tag: string;
  readonly type?: string | null;
  readonly role?: string | null;
  readonly ariaExpanded?: string | null;
  readonly ariaHaspopup?: string | null;
  readonly lecture?: boolean;
  readonly href?: string | null;
}

export function doitIntercepter(el: ElementCliquable): boolean {
  if (el.lecture) return false;
  if (el.ariaExpanded !== null && el.ariaExpanded !== undefined) return false;
  if (el.ariaHaspopup && el.ariaHaspopup !== "false") return false;
  const role = (el.role ?? "").toLowerCase();
  if (role === "tab" || role === "combobox" || role === "option" || role === "link") return false;
  const tag = el.tag.toLowerCase();
  if (tag === "a") return false;
  if (role === "switch" || role === "checkbox" || role === "radio" || role === "menuitem") {
    return true;
  }
  if (tag === "button") return true;
  if (tag === "input") {
    const type = (el.type ?? "").toLowerCase();
    return ["checkbox", "radio", "file", "submit", "button", "reset"].includes(type);
  }
  return false;
}

/** Sélecteur CSS des éléments candidats (le tri fin est fait par `doitIntercepter`). */
export const SELECTEUR_CLIQUABLE =
  'button, a, input, [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="tab"], [role="combobox"]';
