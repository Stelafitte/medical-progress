import { describe, expect, it } from "vitest";
import {
  EMPTY_COMPETENCE_FILTERS,
  buildJournalExportHtml,
  competenceStatus,
  filterCompetences,
  normalizeSearch,
  tutorNotifications,
} from "@/domain/competenceListView";
import type { OutcomeProgress } from "@/domain/mastery";
import type { CompetenceJournalEntry } from "@/domain/competenceJournal";
import type { Outcome, OutcomeId } from "@/domain/types";
import { filterLearnerResources, searchResources } from "@/domain/learnerLibrary";

function outcome(id: string, nature: Outcome["nature"], label: string): Outcome {
  return {
    id: id as OutcomeId,
    programId: "prg-1",
    curriculumVersionId: "cv-1",
    code: id.toUpperCase(),
    label,
    description: `Description ${label}`,
    nature,
    targetMastery: "proficient",
  } as Outcome;
}

function progress(o: Outcome, over: Partial<OutcomeProgress> = {}): OutcomeProgress {
  return {
    outcome: o,
    mastery: "not_started",
    countedEvidence: [],
    pendingEvidence: [],
    blockedBySelfDeclaration: false,
    meetsTarget: false,
    ...over,
  };
}

function entry(id: string, over: Partial<CompetenceJournalEntry> = {}): CompetenceJournalEntry {
  return {
    outcomeId: id as OutcomeId,
    selfDeclaredAcquired: false,
    experienceNote: "",
    messages: [],
    ...over,
  };
}

const echo = outcome("o1", "real_competence", "Échographie transthoracique");
const simu = outcome("o2", "simulated_competence", "Ponction sur mannequin");

describe("filtres de la liste de compétences", () => {
  const items = [progress(echo), progress(simu, { mastery: "novice" })];
  const journal = new Map([["o1" as OutcomeId, entry("o1", { selfDeclaredAcquired: true })]]);

  it("ignore casse et accents dans la recherche", () => {
    expect(normalizeSearch("Échographie")).toBe("echographie");
    expect(
      filterCompetences(items, { ...EMPTY_COMPETENCE_FILTERS, search: "ECHOGRAPHIE" }, journal),
    ).toHaveLength(1);
  });

  it("ne filtre rien sans filtre actif", () => {
    expect(filterCompetences(items, EMPTY_COMPETENCE_FILTERS, journal)).toHaveLength(2);
  });

  it("filtre par nature et par statut", () => {
    expect(
      filterCompetences(items, { nature: "simulated_competence" }, journal).map(
        (i) => i.outcome.id,
      ),
    ).toEqual(["o2"]);
    expect(
      filterCompetences(items, { status: "declared" }, journal).map((i) => i.outcome.id),
    ).toEqual(["o1"]);
    expect(
      filterCompetences(items, { status: "in_progress" }, journal).map((i) => i.outcome.id),
    ).toEqual(["o2"]);
  });

  it("dérive le statut sans jamais faire primer la déclaration sur les preuves", () => {
    expect(
      competenceStatus(
        progress(echo, { meetsTarget: true }),
        entry("o1", { selfDeclaredAcquired: true }),
      ),
    ).toBe("at_target");
    expect(competenceStatus(progress(echo), undefined)).toBe("not_started");
  });
});

describe("remontée vers le tuteur", () => {
  it("notifie les déclarations et les questions de l'apprenant, du plus récent au plus ancien", () => {
    const entries = [
      entry("o1", {
        selfDeclaredAcquired: true,
        declaredAt: "2026-06-01T10:00:00.000Z",
        experienceNote: "10 examens supervisés",
        messages: [
          {
            id: "m1",
            author: "learner",
            body: "Question sur le Doppler",
            sentAt: "2026-06-02T10:00:00.000Z",
            simulated: true,
          },
          {
            id: "m2",
            author: "tutor",
            body: "Réponse",
            sentAt: "2026-06-03T10:00:00.000Z",
            simulated: true,
          },
        ],
      }),
    ];
    const notifications = tutorNotifications(entries, [echo]);
    expect(notifications.map((n) => n.kind)).toEqual(["question", "declaration"]);
    expect(notifications.every((n) => n.simulated)).toBe(true);
  });

  it("ignore les compétences hors périmètre du tuteur", () => {
    expect(
      tutorNotifications(
        [entry("o9", { selfDeclaredAcquired: true, declaredAt: "2026-01-01T00:00:00.000Z" })],
        [echo],
      ),
    ).toHaveLength(0);
  });
});

describe("export du journal", () => {
  it("produit un document mentionnant la validation tierce et échappant le HTML", () => {
    const html = buildJournalExportHtml({
      programName: "DIU Écho",
      learnerName: "Camille Rousseau",
      generatedAt: "2026-06-01T00:00:00.000Z",
      items: [progress(echo)],
      journal: new Map([
        ["o1" as OutcomeId, entry("o1", { experienceNote: "<script>x</script>" })],
      ]),
    });
    expect(html).toContain("validation humaine tierce est requise");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("filtres des ressources apprenant", () => {
  const resources = [
    { title: "Doppler tissulaire", module: "Doppler", format: "course", outcomeIds: ["o1"] },
    { title: "QCM valves", module: "Valves", format: "quiz", outcomeIds: [] },
  ];

  it("recherche sans accent et filtre par format et par acquis", () => {
    expect(searchResources(resources, "DOPPLER")).toHaveLength(1);
    expect(filterLearnerResources(resources, { format: "quiz" })).toHaveLength(1);
    expect(filterLearnerResources(resources, { outcomeId: "o1" })).toHaveLength(1);
    expect(filterLearnerResources(resources, {})).toHaveLength(2);
  });
});
