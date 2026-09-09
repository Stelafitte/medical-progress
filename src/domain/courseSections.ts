import type { LearningResourceId } from "@/domain/types";

/**
 * LE TEXTE 2026 DU REFERENTIEL, DECOUPE EN SECTIONS.
 *
 * CE QUE CE MODULE REMPLACE. Jusqu'ici l'apprenant lisait
 * `learning_resource_texts` : le texte importe en 2022, decoupe en segments
 * AVEUGLES de 4 000 caracteres, sans titres ni structure — la structure du
 * cours avait ete detruite a l'import et n'etait pas reconstituable. Depuis le
 * 08/09, `course_sections` porte le texte de l'edition 2026 avec sa structure
 * reelle : 981 sections, leurs titres, leur ordre de lecture, et leur rubrique
 * CNEC quand elle existe.
 *
 * DECISION DE STEF, 09/09 : « tout DOIT etre du 2026 ». `learning_resource_texts`
 * reste en base comme ARCHIVE de l'import 2022 — a garder, ne pas supprimer —
 * mais plus rien ne l'affiche.
 */

/**
 * LES QUATRE NATURES DE SECTION, telles que la base les contraint.
 *
 * `encadre` et `sous-item` portent dans `numero` LA SECTION HOTE, pas la leur ;
 * `annexe` a un `numero` vide. **`ordre` donne la position de lecture et suffit
 * a tout placer** — il est unique par chapitre. Trier sur `numero` melangerait
 * les encadres avec leurs hotes et renverrait les annexes en tete.
 */
export const COURSE_SECTION_KINDS = ["section", "sous-item", "encadre", "annexe"] as const;

export type CourseSectionKind = (typeof COURSE_SECTION_KINDS)[number];

/**
 * PAR QUELLE VOIE le texte d'un acquis a ete trouve. La fonction en base essaie
 * les trois dans cet ordre et dit laquelle a servi.
 *
 *   `manuel`    — rattachement arbitre a la main (`outcome_sections`) ;
 *   `rubrique`  — les sections du chapitre qui portent la rubrique de l'acquis ;
 *   `chapitre`  — REPLI : aucune section propre, on rend le chapitre entier.
 *
 * **CETTE COLONNE N'EST PAS UNE STATISTIQUE, C'EST UNE CONDITION D'AFFICHAGE.**
 * Mesure du 09/09 sur les 331 savoirs actifs de DFASM-CARDIO :
 *
 * | voie        | savoirs | texte median | max     |
 * |-------------|---------|--------------|---------|
 * | `manuel`    |      46 |    2 311 car |  24 338 |
 * | `rubrique`  |     223 |    8 442 car |  32 951 |
 * | `chapitre`  |      58 |   31 903 car | 123 512 |
 * | aucune      |       4 |            — |       — |
 *
 * Les 269 premiers ont un texte propre, de taille lisible. Les 58 du repli
 * n'en ont pas : afficher leur reponse sous la ligne mettrait TRENTE MILLE
 * caracteres sous un sous-item, et le meme texte que le bouton du haut de page,
 * repete autant de fois qu'il y a de savoirs dans le chapitre. C'est exactement
 * le defaut qui avait fait retirer le texte de cet ecran le 07/09.
 */
export const OUTCOME_SECTION_ORIGINS = ["manuel", "rubrique", "chapitre"] as const;

export type OutcomeSectionOrigin = (typeof OUTCOME_SECTION_ORIGINS)[number];

export interface CourseSection {
  readonly sectionId: string;
  readonly chapitre: number;
  /** Partie du chapitre — le chapitre 8 est decoupe par valvulopathie. */
  readonly partie: string;
  /** Numero d'AFFICHAGE (« I.E.1 »). Jamais une cle : voir la note ci-dessous. */
  readonly numero: string;
  readonly titre: string;
  readonly niveau: number;
  /** Position de lecture, unique par chapitre. C'est le seul tri fiable. */
  readonly ordre: number;
  readonly kind: CourseSectionKind;
  readonly rubrique: string | undefined;
  readonly contenu: string;
  readonly nCaracteres: number;
}

/**
 * LE TEXTE D'UN ACQUIS, AVEC LA VOIE QUI L'A TROUVE.
 *
 * `origin` vaut `undefined` quand la fonction ne rend AUCUNE ligne. Ce n'est pas
 * une panne : quatre supports du programme (les modules de stage) n'ont pas de
 * chapitre dans le livre. Zero ligne est une reponse valide, et c'est le test
 * d'affichage — aucune liste en dur.
 */
export interface OutcomeSections {
  readonly origin: OutcomeSectionOrigin | undefined;
  readonly sections: readonly CourseSection[];
}

/**
 * LES SECTIONS A AFFICHER SOUS UN SOUS-ITEM, et rien d'autre.
 *
 * Le repli chapitre est ecarte ici, une seule fois, plutot que dans chaque
 * ecran : c'est une regle de domaine (« ce texte n'appartient pas a cet
 * acquis »), pas une preference de mise en page. Un ecran qui l'oublierait
 * afficherait un mur de texte sans que rien ne le signale.
 */
export function sectionsPropres(texte: OutcomeSections): readonly CourseSection[] {
  if (texte.origin === undefined || texte.origin === "chapitre") return [];
  return texte.sections;
}

/**
 * L'ORDRE DE LECTURE DU CHAPITRE. `ordre` seul suffit ; `partie` le precede
 * parce que le chapitre 8 porte trois jeux de sections et d'annexes, un par
 * valvulopathie, et que leurs `ordre` se suivent a l'interieur de chaque partie.
 */
export function ordreDeLecture(sections: readonly CourseSection[]): readonly CourseSection[] {
  return [...sections].sort((a, b) => a.partie.localeCompare(b.partie) || a.ordre - b.ordre);
}

/**
 * CE QUI ENTRE DANS LE PLAN D'UN CHAPITRE. Un `encadre` (« Pour comprendre »)
 * se lit DANS sa section hote et n'a jamais d'entree propre — lui en donner une
 * ferait apparaitre dans le sommaire des apartes que le livre n'y met pas.
 */
export function entreesDuPlan(sections: readonly CourseSection[]): readonly CourseSection[] {
  return ordreDeLecture(sections).filter((s) => s.kind !== "encadre");
}

/** Le poids total d'un ensemble de sections, pour borner ce qu'on envoie ou affiche. */
export function totalCaracteres(sections: readonly CourseSection[]): number {
  return sections.reduce((somme, section) => somme + section.nCaracteres, 0);
}
