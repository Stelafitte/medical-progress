import { describe, expect, it } from "vitest";
import {
  availableMediaActions,
  filterMedia,
  mediaIndicators,
  mediaModules,
  MEDIA_STORAGE_NOTICE_FR,
  type MediaResource,
} from "@/domain/mediaLibrary";
import { mediaResources } from "@/infrastructure/mock/mediaFixtures";

const byProgram = (programId: string) => mediaResources.filter((r) => r.programId === programId);

describe("médiathèque — cloisonnement par programme", () => {
  it("expose des supports pour les deux programmes, sans mélange", () => {
    const diu = byProgram("prog-diu-echo");
    const dfasm = byProgram("prog-dfasm-cardio");
    expect(diu.length).toBeGreaterThan(0);
    expect(dfasm.length).toBeGreaterThan(0);
    expect(diu.every((r) => r.programId === "prog-diu-echo")).toBe(true);
    expect(dfasm.every((r) => r.programId === "prog-dfasm-cardio")).toBe(true);
  });

  it("couvre les types de supports attendus du corpus réel", () => {
    const kinds = new Set(mediaResources.map((r) => r.kind));
    for (const kind of [
      "pdf",
      "slides",
      "slides_audio",
      "video",
      "link",
      "quiz",
      "clinical_case",
    ]) {
      expect(kinds.has(kind as MediaResource["kind"])).toBe(true);
    }
  });
});

describe("médiathèque — recherche et filtres", () => {
  const all = mediaResources;

  it("ignore la casse et les accents", () => {
    const target = all[0]!;
    const needle = target.title.slice(0, 6).toUpperCase();
    expect(filterMedia(all, { search: needle }).some((r) => r.id === target.id)).toBe(true);
  });

  it("filtre par type, statut et module", () => {
    const quizzes = filterMedia(all, { kind: "quiz" });
    expect(quizzes.every((r) => r.kind === "quiz")).toBe(true);
    const published = filterMedia(all, { status: "published" });
    expect(published.every((r) => r.status === "published")).toBe(true);
    const module = mediaModules(all)[0]!;
    expect(filterMedia(all, { module }).every((r) => r.module === module)).toBe(true);
  });

  it("isole les supports non rattachés à un objectif", () => {
    expect(filterMedia(all, { onlyUnlinked: true }).every((r) => r.outcomeIds.length === 0)).toBe(
      true,
    );
  });
});

describe("médiathèque — indicateurs et actions", () => {
  it("répartit le total entre les statuts", () => {
    const i = mediaIndicators(mediaResources);
    expect(i.published + i.drafts + i.archived).toBe(i.total);
    expect(i.needsReview).toBeGreaterThanOrEqual(0);
  });

  it("propose publier pour un brouillon et dépublier pour un support publié", () => {
    const draft = mediaResources.find((r) => r.status === "draft");
    const published = mediaResources.find((r) => r.status === "published");
    if (draft) expect(availableMediaActions(draft)).toContain("publish");
    if (published) expect(availableMediaActions(published)).toContain("unpublish");
  });

  it("n'offre jamais d'archivage d'un support déjà archivé", () => {
    for (const r of mediaResources.filter((x) => x.status === "archived")) {
      expect(availableMediaActions(r)).not.toContain("archive");
    }
  });

  it("affiche la mention de non-activation du stockage", () => {
    expect(MEDIA_STORAGE_NOTICE_FR).toContain("Stockage non activé");
  });
});
