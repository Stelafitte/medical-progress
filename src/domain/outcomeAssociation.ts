/**
 * La projection d'un acquis en ligne de liste « ce que le programme retient » —
 * logique pure, sans React.
 *
 * POURQUOI CE FICHIER EXISTE. Trois écrans montrent le même stock d'acquis avec
 * le même composant : le Concepteur, l'onglet Connaissances, l'onglet
 * Compétences. Ils partageaient le composant mais pas la construction de ses
 * lignes, et ils avaient donc silencieusement divergé : le Concepteur rendait
 * 327 connaissances à plat, sans chapitre ni rang, là où l'onglet Connaissances
 * rendait la même liste repliée par chapitre et filtrable par rang. Même
 * référentiel, deux visages — exactement ce que la règle du projet interdit :
 * une entité, un mécanisme, plusieurs portes d'entrée.
 *
 * La règle tient tant que les trois écrans passent par `outcomeAssociationItems`
 * et rien d'autre. Construire les lignes à la main dans un écran, c'est rouvrir
 * l'écart.
 */
import type { Outcome, OutcomeTheme } from "@/domain/types";

export interface AssociationItem {
  readonly id: string;
  readonly label: string;
  /** Retenu pour le parcours. `undefined` = la notion ne s'applique pas. */
  readonly retained?: boolean;
  /**
   * Chapitre sous lequel replier cet élément. Quand au moins un item en porte
   * un, la liste devient une pile de dépliants — 327 lignes à plat ne se lisent
   * pas, 22 titres qui s'ouvrent si.
   */
  readonly groupLabel?: string;
  /** Rang R2C, pour filtrer. Affiché tel quel. */
  readonly rank?: string;
}

/** Libellé affiché quand un acquis pointe un thème que la liste n'a pas reçu. */
export const UNKNOWN_THEME_LABEL = "Chapitre inconnu";

const CODE_COLLATOR = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/**
 * Les acquis, dans l'ordre où on veut les lire.
 *
 * Chapitre d'abord (par la `position` du thème, celle du référentiel, pas
 * l'ordre alphabétique de son libellé), puis la `position` de l'acquis dans son
 * chapitre, puis le code en dernier recours. Un acquis sans chapitre passe
 * après ceux qui en ont un : « non rangé » est un état valide, pas une tête de
 * liste.
 */
export function sortOutcomesForAssociation(
  outcomes: readonly Outcome[],
  themes: readonly OutcomeTheme[],
): readonly Outcome[] {
  const themePosition = new Map(themes.map((theme) => [theme.id as string, theme.position]));
  const rank = (outcome: Outcome) =>
    outcome.themeId === undefined
      ? Number.MAX_SAFE_INTEGER
      : (themePosition.get(outcome.themeId as string) ?? Number.MAX_SAFE_INTEGER - 1);
  return [...outcomes].sort((a, b) => {
    const byTheme = rank(a) - rank(b);
    if (byTheme !== 0) return byTheme;
    const byPosition =
      (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
    if (byPosition !== 0) return byPosition;
    return CODE_COLLATOR.compare(a.code, b.code);
  });
}

/**
 * Les lignes de la liste « ce que le programme retient », pour un lot d'acquis.
 *
 * Le rang n'est posé que s'il existe : une compétence n'en aura jamais, et la
 * clé absente (plutôt que `undefined` explicite) est ce qu'exige
 * `exactOptionalPropertyTypes`.
 */
export function outcomeAssociationItems(
  outcomes: readonly Outcome[],
  themes: readonly OutcomeTheme[],
): readonly AssociationItem[] {
  return sortOutcomesForAssociation(outcomes, themes).map((outcome) => ({
    id: outcome.id as string,
    label: `${outcome.code} — ${outcome.label}`,
    retained: outcome.retainedAt !== null,
    ...(outcome.knowledgeRank ? { rank: outcome.knowledgeRank } : {}),
    ...(outcome.themeId
      ? {
          groupLabel:
            themes.find((theme) => theme.id === outcome.themeId)?.label ?? UNKNOWN_THEME_LABEL,
        }
      : {}),
  }));
}
