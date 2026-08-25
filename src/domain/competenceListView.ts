/**
 * Vue « Mes compétences » : logique de présentation PURE.
 *
 * Filtres et recherche, remontée des auto-déclarations vers le tuteur et
 * document d'export du journal. Aucun calcul de progression ici : le niveau de
 * maîtrise reste dérivé des preuves (`src/domain/mastery.ts`).
 */
import type { OutcomeProgress } from "./mastery";
import { MASTERY_LABELS_FR, NATURE_LABELS_FR } from "./mastery";
import type { CompetenceJournalEntry } from "./competenceJournal";
import { selfDeclarationState } from "./competenceJournal";
import type { IsoDateTime, Outcome, OutcomeId, OutcomeNature } from "./types";

export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export type CompetenceStatusFilter =
  | "all"
  | "at_target"
  | "declared"
  | "in_progress"
  | "not_started";

export const COMPETENCE_STATUS_LABELS_FR: Record<CompetenceStatusFilter, string> = {
  all: "Tous les statuts",
  at_target: "Au niveau cible",
  declared: "Déclarées, à valider",
  in_progress: "En cours",
  not_started: "Non commencées",
};

export interface CompetenceListFilters {
  readonly search?: string;
  readonly nature?: OutcomeNature | "all";
  readonly status?: CompetenceStatusFilter;
}

export const EMPTY_COMPETENCE_FILTERS: CompetenceListFilters = {
  search: "",
  nature: "all",
  status: "all",
};

export function competenceStatus(
  item: OutcomeProgress,
  entry: CompetenceJournalEntry | undefined,
): Exclude<CompetenceStatusFilter, "all"> {
  if (item.meetsTarget) return "at_target";
  if (entry?.selfDeclaredAcquired) return "declared";
  return item.mastery === "not_started" ? "not_started" : "in_progress";
}

export function filterCompetences(
  items: readonly OutcomeProgress[],
  filters: CompetenceListFilters,
  journal: ReadonlyMap<OutcomeId, CompetenceJournalEntry>,
): readonly OutcomeProgress[] {
  const search = filters.search ? normalizeSearch(filters.search.trim()) : "";
  return items.filter((item) => {
    if (filters.nature && filters.nature !== "all" && item.outcome.nature !== filters.nature) {
      return false;
    }
    if (
      filters.status &&
      filters.status !== "all" &&
      competenceStatus(item, journal.get(item.outcome.id)) !== filters.status
    ) {
      return false;
    }
    if (!search) return true;
    const haystack = normalizeSearch(
      [item.outcome.code, item.outcome.label, item.outcome.description].join(" "),
    );
    return haystack.includes(search);
  });
}

/* ------------------------------------------------------------------ */
/* Remontée vers le tuteur                                             */
/* ------------------------------------------------------------------ */

export type TutorNotificationKind = "declaration" | "question";

export interface TutorNotification {
  readonly outcomeId: OutcomeId;
  readonly code: string;
  readonly label: string;
  readonly nature: OutcomeNature;
  readonly kind: TutorNotificationKind;
  readonly at: IsoDateTime;
  readonly body: string;
  /** Maquette : aucune notification réelle n'est envoyée. */
  readonly simulated: true;
}

/**
 * Notifications déclenchées par l'apprenant : auto-déclaration et questions.
 * Une déclaration ne vaut jamais acquisition d'une compétence réelle.
 */
export function tutorNotifications(
  entries: readonly CompetenceJournalEntry[],
  outcomes: readonly Outcome[],
): readonly TutorNotification[] {
  const byId = new Map(outcomes.map((o) => [o.id, o] as const));
  const items: TutorNotification[] = [];

  for (const entry of entries) {
    const outcome = byId.get(entry.outcomeId);
    if (!outcome) continue;
    const base = {
      outcomeId: entry.outcomeId,
      code: outcome.code,
      label: outcome.label,
      nature: outcome.nature,
      simulated: true,
    } as const;

    if (entry.selfDeclaredAcquired && entry.declaredAt) {
      items.push({
        ...base,
        kind: "declaration",
        at: entry.declaredAt,
        body:
          entry.experienceNote.trim().length > 0
            ? entry.experienceNote.trim()
            : "Auto-déclaration sans récit d'expérience.",
      });
    }
    for (const message of entry.messages) {
      if (message.author !== "learner") continue;
      items.push({ ...base, kind: "question", at: message.sentAt, body: message.body });
    }
  }

  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/* ------------------------------------------------------------------ */
/* Export du journal                                                   */
/* ------------------------------------------------------------------ */

export interface JournalExportInput {
  readonly programName: string;
  readonly learnerName: string;
  readonly generatedAt: IsoDateTime;
  readonly items: readonly OutcomeProgress[];
  readonly journal: ReadonlyMap<OutcomeId, CompetenceJournalEntry>;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const DECLARATION_LABELS_FR = {
  none: "Non déclarée",
  awaiting_validation: "Déclarée — en attente de validation tierce",
  confirmed: "Au niveau cible (preuves)",
} as const;

/**
 * Document imprimable (« Enregistrer en PDF ») du journal de compétence.
 * Généré localement : aucun envoi, aucune donnée patient.
 */
export function buildJournalExportHtml(input: JournalExportInput): string {
  const rows = input.items
    .map((item) => {
      const entry = input.journal.get(item.outcome.id);
      const state = selfDeclarationState(entry, item.meetsTarget);
      const messages = (entry?.messages ?? [])
        .map(
          (m) =>
            `<li><strong>${m.author === "learner" ? "Apprenant" : "Tuteur"}</strong> — ${escapeHtml(
              m.sentAt,
            )}<br />${escapeHtml(m.body)}</li>`,
        )
        .join("");
      return `<section>
  <h2>${escapeHtml(item.outcome.code)} — ${escapeHtml(item.outcome.label)}</h2>
  <p class="meta">${escapeHtml(NATURE_LABELS_FR[item.outcome.nature])} · Niveau : ${escapeHtml(
    MASTERY_LABELS_FR[item.mastery],
  )} · Cible : ${escapeHtml(MASTERY_LABELS_FR[item.outcome.targetMastery])} · ${escapeHtml(
    DECLARATION_LABELS_FR[state],
  )}</p>
  <p><em>Expérience d'acquisition :</em> ${
    entry && entry.experienceNote.trim().length > 0
      ? escapeHtml(entry.experienceNote.trim())
      : "non renseignée"
  }</p>
  ${messages ? `<ul>${messages}</ul>` : ""}
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<title>Journal de compétence — ${escapeHtml(input.learnerName)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;color:#111}
h1{font-size:1.4rem} h2{font-size:1rem;margin-bottom:.2rem}
.meta{color:#555;font-size:.8rem;margin:.2rem 0}
section{border-top:1px solid #ddd;padding:.6rem 0}
ul{font-size:.85rem} .notice{font-size:.75rem;color:#555}
</style></head>
<body>
<h1>Journal de compétence — ${escapeHtml(input.learnerName)}</h1>
<p class="meta">${escapeHtml(input.programName)} · Export du ${escapeHtml(input.generatedAt)}</p>
<p class="notice">Document simulé, généré localement. Une auto-déclaration ne vaut jamais
acquisition d'une compétence en situation réelle : une validation humaine tierce est requise.</p>
${rows}
</body></html>`;
}
