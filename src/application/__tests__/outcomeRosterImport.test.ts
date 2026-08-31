import { describe, expect, it } from "vitest";
import { importOutcomeRoster } from "@/application/outcomeRosterImport";
import type { OutcomeRepository } from "@/application/ports/repositories";
import { buildOutcomeRosterPreview } from "@/domain/outcomeRoster";
import { mockDataAccess } from "@/infrastructure/mock/mockDataAccess";
import type { Outcome, OutcomeId, OutcomeTheme, ProgramId } from "@/domain/types";

const programId = "prog-test" as ProgramId;
const curriculumVersionId = "cv-test" as Outcome["curriculumVersionId"];

const TABLE = [
  "Thème;Intitulé;Nature;Niveau",
  "Sémiologie;Ausculter un souffle;Compétence;Avancé",
  "Sémiologie;Décrire les souffles;Connaissance;Base",
  "Rythmologie;Lire un ECG;Compétence;Expert",
].join("\n");

/**
 * Dépôt en mémoire, remis à neuf à chaque cas. `mockDataAccess` est un
 * singleton dont l'état s'accumule d'un test à l'autre : il sert ici de
 * vérification d'ensemble (dernier cas), pas de bac à sable.
 */
function fakeRepository(options: { failOnLabel?: string; failOnTheme?: string } = {}) {
  const outcomes: Outcome[] = [];
  const themes: OutcomeTheme[] = [];
  const themeOf = new Map<string, { themeId: string; position: number }>();
  let n = 0;

  const repository: OutcomeRepository = {
    listOutcomes: async () => outcomes,
    listTakenOutcomeCodes: async () => outcomes.map((o) => o.code),
    listOutcomeRelations: async () => [],
    archiveOutcome: async () => undefined,
    setOutcomesRetained: async () => undefined,
    createOutcome: async (input) => {
      if (input.label === options.failOnLabel) throw new Error("refusé par le serveur");
      n += 1;
      const created = {
        id: `o-${n}` as OutcomeId,
        createdAt: "2026-08-31T00:00:00Z",
        provenance: { sourceSystem: "native" as const },
        ...input,
        retainedAt: "2026-08-31T00:00:00Z",
      } as Outcome;
      outcomes.push(created);
      return created;
    },
    listOutcomeThemes: async () => themes,
    createOutcomeTheme: async (input) => {
      if (input.label === options.failOnTheme) throw new Error("thème refusé");
      const created: OutcomeTheme = {
        id: `t-${themes.length + 1}` as OutcomeTheme["id"],
        createdAt: "2026-08-31T00:00:00Z",
        provenance: { sourceSystem: "native" },
        programId: input.programId,
        label: input.label,
        description: input.description ?? "",
        position: input.position ?? themes.length + 1,
      };
      themes.push(created);
      return created;
    },
    setOutcomesTheme: async (outcomeIds, themeId) => {
      outcomeIds.forEach((id, index) => {
        if (themeId) themeOf.set(id, { themeId, position: index + 1 });
        else themeOf.delete(id);
      });
    },
  };

  return { repository, outcomes, themes, themeOf };
}

function preview(text: string, existingCodes: readonly string[] = []) {
  return buildOutcomeRosterPreview({ text, existingCodes });
}

describe("import d'un référentiel d'acquis", () => {
  it("crée les thèmes dans l'ordre d'apparition du fichier", async () => {
    const fake = fakeRepository();
    const report = await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      preview: preview(TABLE),
    });

    expect(report.createdThemes.map((t) => t.label)).toEqual(["Sémiologie", "Rythmologie"]);
    expect(report.createdThemes.map((t) => t.position)).toEqual([1, 2]);
    expect(report.failures).toEqual([]);
  });

  it("crée les acquis avec la nature et le niveau traduits", async () => {
    const fake = fakeRepository();
    const report = await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      preview: preview(TABLE),
    });

    expect(report.createdOutcomes).toHaveLength(3);
    const [ausculter, decrire, ecg] = report.createdOutcomes;
    expect(ausculter?.nature).toBe("real_competence");
    expect(ausculter?.targetMastery).toBe("proficient");
    expect(decrire?.nature).toBe("knowledge");
    expect(decrire?.targetMastery).toBe("intermediate");
    expect(ecg?.targetMastery).toBe("autonomous");
  });

  it("range chaque acquis sous son thème, dans l'ordre du fichier", async () => {
    const fake = fakeRepository();
    await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      preview: preview(TABLE),
    });

    const semiologie = fake.themes.find((t) => t.label === "Sémiologie");
    const rythmologie = fake.themes.find((t) => t.label === "Rythmologie");
    expect(fake.themeOf.get("o-1")).toEqual({ themeId: semiologie?.id, position: 1 });
    expect(fake.themeOf.get("o-2")).toEqual({ themeId: semiologie?.id, position: 2 });
    expect(fake.themeOf.get("o-3")).toEqual({ themeId: rythmologie?.id, position: 1 });
  });

  it("reprend un thème déjà présent au lieu d'en créer un jumeau", async () => {
    const fake = fakeRepository();
    const already: OutcomeTheme = {
      id: "t-existant" as OutcomeTheme["id"],
      createdAt: "2026-08-01T00:00:00Z",
      provenance: { sourceSystem: "native" },
      programId,
      label: "SEMIOLOGIE",
      description: "",
      position: 7,
    };

    const report = await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      preview: preview(TABLE),
      existingThemes: [already],
    });

    expect(report.reusedThemes.map((t) => t.id)).toEqual(["t-existant"]);
    expect(report.createdThemes.map((t) => t.label)).toEqual(["Rythmologie"]);
    // Le nouveau thème se place après le dernier existant, pas en 1.
    expect(report.createdThemes[0]?.position).toBe(8);
    expect(fake.themeOf.get("o-1")?.themeId).toBe("t-existant");
  });

  it("ignore les lignes écartées par la prévisualisation", async () => {
    const fake = fakeRepository();
    const report = await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      // T1-01 est le code engendré pour la première ligne du premier thème.
      preview: preview(TABLE, ["T1-01"]),
    });

    expect(report.skippedCount).toBe(1);
    expect(report.createdOutcomes.map((o) => o.label)).toEqual([
      "Décrire les souffles",
      "Lire un ECG",
    ]);
  });

  it("ne crée aucun thème quand tout le fichier est déjà présent", async () => {
    const fake = fakeRepository();
    const report = await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      preview: preview(TABLE, ["T1-01", "T1-02", "T2-01"]),
    });

    expect(report.createdThemes).toEqual([]);
    expect(report.createdOutcomes).toEqual([]);
    expect(report.skippedCount).toBe(3);
  });

  it("poursuit après l'échec d'une ligne et le rapporte", async () => {
    const fake = fakeRepository({ failOnLabel: "Décrire les souffles" });
    const report = await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      preview: preview(TABLE),
    });

    expect(report.createdOutcomes).toHaveLength(2);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.label).toBe("Décrire les souffles");
    expect(report.failures[0]?.message).toContain("refusé");
    // Le rangement du thème survivant a bien eu lieu.
    expect(fake.themeOf.get("o-1")?.position).toBe(1);
  });

  it("crée quand même les acquis d'un thème refusé, non rangés", async () => {
    const fake = fakeRepository({ failOnTheme: "Sémiologie" });
    const report = await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      preview: preview(TABLE),
    });

    expect(report.createdOutcomes).toHaveLength(3);
    expect(report.failures[0]?.label).toContain("Sémiologie");
    expect(fake.themeOf.get("o-1")).toBeUndefined();
    expect(fake.themeOf.get("o-3")).toBeDefined();
  });

  it("remplit le domaine avec la portée quand la source en porte une", async () => {
    const fake = fakeRepository();
    const withScope = [
      "Thème;Intitulé;Portée",
      "Sémiologie;Ausculter un souffle;Générique",
      "Rythmologie;Lire un ECG;Spécialisé",
    ].join("\n");

    const report = await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      preview: preview(withScope),
    });

    expect(report.createdOutcomes.map((o) => o.domain)).toEqual(["Générique", "Spécialisé"]);
  });

  it("retombe sur le libellé du thème quand il n'y a pas de portée", async () => {
    const fake = fakeRepository();
    const report = await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      preview: preview(TABLE),
    });

    expect(report.createdOutcomes.map((o) => o.domain)).toEqual([
      "Sémiologie",
      "Sémiologie",
      "Rythmologie",
    ]);
  });

  it("rend un compteur d'avancement, une fois par acquis retenu", async () => {
    const fake = fakeRepository();
    const steps: string[] = [];
    await importOutcomeRoster({
      outcomes: fake.repository,
      programId,
      curriculumVersionId,
      preview: preview(TABLE),
      onProgress: (done, total) => steps.push(`${done}/${total}`),
    });

    expect(steps).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("passe la même séquence sur l'adaptateur mock du projet", async () => {
    const before = await mockDataAccess.outcomes.listOutcomes(programId);
    const report = await importOutcomeRoster({
      outcomes: mockDataAccess.outcomes,
      programId,
      curriculumVersionId,
      preview: preview(TABLE),
      existingThemes: await mockDataAccess.outcomes.listOutcomeThemes(programId),
    });

    expect(report.failures).toEqual([]);
    const after = await mockDataAccess.outcomes.listOutcomes(programId);
    expect(after.length - before.length).toBe(3);

    const themes = await mockDataAccess.outcomes.listOutcomeThemes(programId);
    const semiologie = themes.find((t) => t.label === "Sémiologie");
    const created = after.filter((o) => o.themeId === semiologie?.id);
    expect(created.map((o) => o.position)).toEqual([1, 2]);
  });
});
