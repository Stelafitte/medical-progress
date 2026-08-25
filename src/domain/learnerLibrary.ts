/**
 * Vue « Mes ressources » : recherche et filtres PURS, côté apprenant.
 * Aucun accès aux données, aucun suivi de consultation réel.
 */
import { normalizeSearch } from "./competenceListView";

export interface SearchableResource {
  readonly title: string;
  readonly module?: string;
  readonly description?: string;
}

/** Recherche insensible à la casse et aux accents sur titre / module. */
export function searchResources<T extends SearchableResource>(
  items: readonly T[],
  search: string,
): readonly T[] {
  const needle = normalizeSearch(search.trim());
  if (!needle) return items;
  return items.filter((item) =>
    normalizeSearch([item.title, item.module ?? "", item.description ?? ""].join(" ")).includes(
      needle,
    ),
  );
}

export type LearnerResourceFormatFilter = string | "all";

export interface LearnerResourceFilters {
  readonly search?: string;
  readonly format?: LearnerResourceFormatFilter;
  readonly outcomeId?: string | "all";
}

export interface FilterableLearnerResource extends SearchableResource {
  readonly format: string;
  readonly outcomeIds: readonly string[];
}

export function filterLearnerResources<T extends FilterableLearnerResource>(
  items: readonly T[],
  filters: LearnerResourceFilters,
): readonly T[] {
  const base = items.filter((item) => {
    if (filters.format && filters.format !== "all" && item.format !== filters.format) return false;
    if (
      filters.outcomeId &&
      filters.outcomeId !== "all" &&
      !item.outcomeIds.includes(filters.outcomeId)
    ) {
      return false;
    }
    return true;
  });
  return searchResources(base, filters.search ?? "");
}

/** Formats présents dans le catalogue du programme, triés. */
export function learnerResourceFormats(
  items: readonly FilterableLearnerResource[],
): readonly string[] {
  return [...new Set(items.map((i) => i.format))].sort((a, b) => a.localeCompare(b, "fr"));
}
