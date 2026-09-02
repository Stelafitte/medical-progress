/**
 * Un modèle de rétroplanning : le calendrier de jalons d'une promotion,
 * détaché d'elle, reposable ailleurs.
 *
 * CE QU'UN MODÈLE PORTE — et la raison, qui n'est pas évidente.
 *
 * Des CHAPITRES et des SEMAINES. Jamais des acquis. La composition d'un jalon
 * n'a jamais été saisie à la main : `ProgramMilestonePlanner` passe à
 * `setMilestoneOutcomes` tous les acquis du chapitre. Un jalon
 * « Valvulopathies » contient donc, par construction, les acquis de
 * « Valvulopathies ». Transporter leurs identifiants attacherait le modèle à
 * son programme d'origine sans rien apporter, et le figerait : un acquis
 * ajouté au chapitre l'année suivante n'entrerait jamais dans les jalons
 * rejoués. La composition se recalcule donc à l'arrivée, côté serveur.
 *
 * CE MODULE NE REJOUE PAS LE SERVEUR. `apply_milestone_template` sait dire, en
 * mode « à blanc », combien de jalons seraient posés et quels chapitres ne
 * correspondent à rien. L'écran demande CE rapport-là plutôt que d'en calculer
 * un second ici : deux calculs finiraient par diverger, et c'est celui du
 * serveur qui écrit. Ce qui est ici, ce sont les deux refus que l'écran doit
 * pouvoir expliquer AVANT l'aller-retour — un bouton grisé avec sa raison vaut
 * mieux qu'un message d'erreur après coup.
 */
import type { CohortId, IsoDateTime, ProgramId } from "@/domain/types";

export type MilestoneTemplateId = string & { readonly __brand?: "MilestoneTemplate" };

/** Une ligne du modèle : un chapitre, une échéance. Mêmes bornes que `PlanMilestone`. */
export interface MilestoneTemplateItem {
  /** L'intitulé du CHAPITRE : c'est la clé de rapprochement à l'arrivée. */
  readonly label: string;
  readonly weekOffset: number;
  /** Absent = jalon ponctuel. Présent = jalon étalé. */
  readonly weekOffsetEnd?: number;
  readonly official: boolean;
  readonly position: number;
}

export interface MilestoneTemplate {
  readonly id: MilestoneTemplateId;
  /** Programme d'ORIGINE : il décide qui voit le modèle, pas où il s'applique. */
  readonly programId: ProgramId;
  readonly label: string;
  readonly description: string;
  /** Promotion dont le calendrier a été relevé. Absente si elle a disparu. */
  readonly sourceCohortId?: CohortId;
  readonly createdAt: IsoDateTime;
  readonly items: readonly MilestoneTemplateItem[];
}

/**
 * Poser un modèle sur une promotion qui porte déjà des jalons.
 *
 * Stef (02/09) : l'écran PROPOSE les deux, il n'en impose pas un.
 * - `keep` : les chapitres déjà datés dans la promotion ne sont pas touchés.
 * - `replace` : on repart de zéro. Le serveur refuse si un apprenant a décalé
 *   l'un des jalons existants — sa date personnelle disparaîtrait en silence.
 */
export type MilestoneTemplateApplyMode = "keep" | "replace";

/** Ce que le serveur rend, à blanc comme pour de vrai. */
export interface MilestoneTemplateApplyReport {
  readonly posed: number;
  readonly skipped: number;
  /** Chapitres du modèle qui n'existent pas dans le programme d'arrivée. */
  readonly withoutChapter: readonly string[];
}

export type MilestoneTemplateIssue =
  | "nom_manquant"
  | "nom_deja_pris"
  | "promotion_sans_jalon"
  | "modele_vide"
  | "modele_plus_long_que_la_promotion"
  | "aucun_chapitre_reconnu";

export const MILESTONE_TEMPLATE_ISSUE_LABELS_FR: Record<MilestoneTemplateIssue, string> = {
  nom_manquant: "Donnez un nom au modèle.",
  nom_deja_pris: "Un modèle porte déjà ce nom dans ce programme.",
  promotion_sans_jalon: "Cette promotion ne porte aucun jalon : il n'y a rien à relever.",
  modele_vide: "Ce modèle ne contient aucun jalon.",
  modele_plus_long_que_la_promotion:
    "Ce modèle va plus loin que la fin de cette promotion : les derniers jalons tomberaient après le stage.",
  aucun_chapitre_reconnu:
    "Aucun chapitre de ce modèle n'existe dans ce programme : tous les jalons seraient orphelins.",
};

/**
 * La dernière semaine occupée par le modèle. `undefined` s'il est vide.
 *
 * C'est la fin d'un jalon qui compte, pas son début : un jalon « semaines 9 à
 * 11 » va jusqu'en 11, et c'est 11 qu'il faut comparer à la fin du stage.
 */
export function templateLastWeek(items: readonly MilestoneTemplateItem[]): number | undefined {
  let last: number | undefined;
  for (const item of items) {
    const end = item.weekOffsetEnd ?? item.weekOffset;
    if (last === undefined || end > last) last = end;
  }
  return last;
}

/** Ce qui empêche de relever un modèle sur une promotion. Liste vide = faisable. */
export function milestoneTemplateSaveIssues(input: {
  readonly label: string;
  readonly milestoneCount: number;
  /** Noms des modèles déjà enregistrés dans CE programme. */
  readonly existingLabels: readonly string[];
}): readonly MilestoneTemplateIssue[] {
  const issues: MilestoneTemplateIssue[] = [];
  const name = input.label.trim();

  if (name === "") issues.push("nom_manquant");
  // Comparaison insensible à la casse : la base ne l'exige pas, mais deux
  // modèles nommés « DFASM cardio » et « DFASM Cardio » seraient indiscernables
  // dans une liste déroulante, et le mauvais serait choisi.
  else if (
    input.existingLabels.some((existing) => existing.trim().toLowerCase() === name.toLowerCase())
  ) {
    issues.push("nom_deja_pris");
  }

  if (input.milestoneCount === 0) issues.push("promotion_sans_jalon");

  return issues;
}

/**
 * Ce qui empêche de poser un modèle sur une promotion.
 *
 * Les deux refus du serveur, rejoués ici pour être DITS avant l'aller-retour.
 * Le serveur reste l'autorité : ces contrôles grisent un bouton, ils ne
 * protègent pas la base.
 */
export function milestoneTemplateApplyIssues(input: {
  readonly items: readonly MilestoneTemplateItem[];
  /** Dernière semaine de la promotion d'arrivée. Absente = durée inconnue. */
  readonly promotionLastWeek?: number;
  /** Intitulés des chapitres du programme d'arrivée. */
  readonly themeLabels: readonly string[];
}): readonly MilestoneTemplateIssue[] {
  const issues: MilestoneTemplateIssue[] = [];
  const last = templateLastWeek(input.items);

  if (last === undefined) return ["modele_vide"];

  if (input.promotionLastWeek !== undefined && last > input.promotionLastWeek) {
    issues.push("modele_plus_long_que_la_promotion");
  }

  const known = new Set(input.themeLabels);
  if (!input.items.some((item) => known.has(item.label))) {
    issues.push("aucun_chapitre_reconnu");
  }

  return issues;
}

/**
 * Le rapport du serveur, en une phrase.
 *
 * Les chapitres non reconnus sont NOMMÉS, pas comptés : « 3 chapitres ignorés »
 * n'aide personne à comprendre pourquoi son modèle est arrivé incomplet.
 */
export function describeApplyReport(
  report: MilestoneTemplateApplyReport,
  options: { readonly dryRun?: boolean } = {},
): string {
  const verb = options.dryRun === true ? "seraient posés" : "posés";
  const parts: string[] = [];

  if (report.posed === 0 && report.skipped > 0) {
    parts.push(
      `Rien à poser : les ${report.skipped} chapitre(s) du modèle portent déjà un jalon dans cette promotion.`,
    );
  } else {
    parts.push(`${report.posed} jalon(s) ${verb}.`);
    if (report.skipped > 0) {
      parts.push(`${report.skipped} chapitre(s) déjà daté(s), laissé(s) tel(s) quel(s).`);
    }
  }

  if (report.withoutChapter.length > 0) {
    parts.push(`Absent(s) de ce programme, donc ignoré(s) : ${report.withoutChapter.join(", ")}.`);
  }

  return parts.join(" ");
}

/**
 * Traduit ce que la base refuse.
 *
 * Les messages des fonctions SQL sont déjà écrits pour être lus par un humain
 * et portent des chiffres que l'écran n'a pas (le nombre de décalages
 * d'apprenants, la semaine exacte) : on les laisse passer tels quels. Seule la
 * contrainte d'unicité parle en noms de colonnes.
 */
export function describeMilestoneTemplateWriteError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);

  if (message.includes("milestone_templates_program_id_label_key")) {
    return MILESTONE_TEMPLATE_ISSUE_LABELS_FR.nom_deja_pris;
  }

  return message;
}
