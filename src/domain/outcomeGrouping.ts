import type { OutcomeTheme, OutcomeThemeId } from "@/domain/types";

/**
 * Regroupement par CHAPITRE, écrit une fois pour toutes.
 *
 * POURQUOI UNE FONCTION DE DOMAINE. Le même repli existe maintenant dans « Mes
 * ressources », « Mes compétences » et le Kanban du Passeport. Recopié trois
 * fois, il aurait fini par ordonner les chapitres différemment d'un écran à
 * l'autre — et c'est précisément ce que Stef surveille : « la liste vue par
 * l'apprenant est celle de l'onglet du même nom au moment de la configuration
 * du programme ».
 *
 * L'ORDRE EST CELUI DU CONCEPTEUR (`theme.position`), jamais l'ordre
 * alphabétique ni celui d'arrivée des lignes. Un chapitre déplacé côté
 * Concepteur doit se déplacer partout.
 *
 * « HORS CHAPITRE » PASSE EN DERNIER, et n'est produit que s'il contient
 * quelque chose. On ne le supprime pas : les acquis non rangés doivent rester
 * visibles, c'est ce qui rend évident qu'ils attendent un rangement. Les mettre
 * en tête, en revanche, mettrait le désordre avant le programme.
 */
export const HORS_CHAPITRE_KEY = "__hors_chapitre__";
export const HORS_CHAPITRE_LABEL = "Hors chapitre";

export interface ThemeGroup<T> {
  readonly key: string;
  readonly label: string;
  readonly position: number;
  readonly items: readonly T[];
}

export function groupByTheme<T>(
  items: readonly T[],
  themes: readonly OutcomeTheme[],
  themeIdOf: (item: T) => OutcomeThemeId | undefined,
): readonly ThemeGroup<T>[] {
  const parId = new Map(themes.map((theme) => [theme.id, theme] as const));
  const groupes = new Map<string, { label: string; position: number; items: T[] }>();

  for (const item of items) {
    const themeId = themeIdOf(item);
    const theme = themeId ? parId.get(themeId) : undefined;
    const key = theme ? theme.id : HORS_CHAPITRE_KEY;
    const groupe = groupes.get(key) ?? {
      label: theme ? theme.label : HORS_CHAPITRE_LABEL,
      // Sans chapitre, on passe en dernier plutot qu'en premier.
      position: theme ? theme.position : Number.MAX_SAFE_INTEGER,
      items: [],
    };
    groupe.items.push(item);
    groupes.set(key, groupe);
  }

  return [...groupes.entries()]
    .map(([key, groupe]) => ({ key, ...groupe }))
    .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
}
