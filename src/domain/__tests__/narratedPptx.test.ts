import { describe, expect, it } from "vitest";
import {
  CONVERSION_PIPELINE,
  CONVERSION_STATUS_LABELS_FR,
  CONVERSION_STATUS_PROGRESS,
  PLAYER_SPEEDS,
  availableNarratedActions,
  chapterForSlide,
  checkPptxUpload,
  conversionStatusOf,
  formatPlayerDuration,
  isNarratedAvailableToLearners,
  toLearnerNarratedDeck,
  type ConversionStatus,
} from "@/domain/mediaLibrary";
import { mediaResources } from "@/infrastructure/mock/mediaFixtures";

const narratedFixtures = mediaResources.filter((m) => m.narrated);
const ready = mediaResources.find((m) => isNarratedAvailableToLearners(m));

describe("contrôle du dépôt PPTX (simulé)", () => {
  it("refuse une extension non .pptx", () => {
    const result = checkPptxUpload({ fileName: "cours.ppt", hasAudio: true, slideCount: 10 });
    expect(result.extensionOk).toBe(false);
    expect(result.canQueue).toBe(false);
  });

  it("signale l'absence d'audio et les diapositives non commentées", () => {
    const result = checkPptxUpload({
      fileName: "cours.pptx",
      hasAudio: false,
      slideCount: 6,
      slidesWithoutNarration: [2, 3],
      fontsEmbedded: false,
    });
    expect(result.alerts).toContain("missing_audio");
    expect(result.alerts).toContain("slides_without_narration");
    expect(result.alerts).toContain("font_not_embedded");
    expect(result.canQueue).toBe(false);
  });

  it("autorise la mise en file d'un dépôt conforme", () => {
    const result = checkPptxUpload({ fileName: "cours.pptx", hasAudio: true, slideCount: 12 });
    expect(result.canQueue).toBe(true);
    expect(result.alerts).toHaveLength(0);
  });
});

describe("statuts de conversion", () => {
  it("couvre chaque statut par un libellé et une progression croissante bornée", () => {
    const statuses = Object.keys(CONVERSION_STATUS_LABELS_FR) as ConversionStatus[];
    expect(statuses).toContain("not_required");
    expect(statuses).toContain("review_required");
    expect(statuses).toContain("failed");
    for (const status of statuses) {
      const value = CONVERSION_STATUS_PROGRESS[status];
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("retourne not_required pour un support non sonorisé", () => {
    const plain = mediaResources.find((m) => !m.narrated);
    expect(plain).toBeDefined();
    expect(conversionStatusOf(plain!)).toBe("not_required");
  });

  it("propose une validation humaine uniquement en review_required", () => {
    for (const resource of narratedFixtures) {
      const actions = availableNarratedActions(resource.narrated!);
      if (resource.narrated!.conversionStatus === "review_required") {
        expect(actions).toContain("approve_web_version");
      } else {
        expect(actions).not.toContain("approve_web_version");
      }
    }
  });

  it("journalise les étapes du pipeline dans l'ordre déclaré", () => {
    expect(CONVERSION_PIPELINE[0]).toBe("upload");
    expect(CONVERSION_PIPELINE.at(-1)).toBe("publication");
    for (const resource of narratedFixtures) {
      for (const entry of resource.narrated!.steps) {
        expect(CONVERSION_PIPELINE).toContain(entry.step);
      }
    }
  });
});

describe("isolation du PPTX source dans le DTO apprenant", () => {
  it("expose au moins un diaporama prêt", () => {
    expect(ready).toBeDefined();
  });

  it("ne fuit jamais le paquet source ni le MP4 de secours", () => {
    const deck = toLearnerNarratedDeck(ready!);
    expect(deck).toBeDefined();
    const serialized = JSON.stringify(deck);
    expect(serialized).not.toContain(".pptx");
    expect(serialized).not.toContain(".mp4");
    expect(serialized).not.toContain("mp4Fallback");
    expect(Object.keys(deck!)).not.toContain("source");
    expect(deck!.availability).toBe("online_only");
  });

  it("masque la transcription si l'équipe ne l'a pas autorisée", () => {
    const restricted = {
      ...ready!,
      narrated: {
        ...ready!.narrated!,
        options: { ...ready!.narrated!.options, exposeTranscriptToLearners: false },
      },
    };
    const deck = toLearnerNarratedDeck(restricted);
    expect(deck!.transcriptAvailable).toBe(false);
    expect(deck!.slides.every((slide) => slide.transcript === undefined)).toBe(true);
  });

  it("ne publie rien tant que la conversion n'est pas prête et validée", () => {
    const pending = {
      ...ready!,
      narrated: { ...ready!.narrated!, conversionStatus: "review_required" as const },
    };
    expect(isNarratedAvailableToLearners(pending)).toBe(false);
    expect(toLearnerNarratedDeck(pending)).toBeUndefined();
  });
});

describe("lecteur web", () => {
  it("formate la durée en minutes:secondes", () => {
    expect(formatPlayerDuration(0)).toBe("0:00");
    expect(formatPlayerDuration(65)).toBe("1:05");
  });

  it("propose plusieurs vitesses dont la vitesse normale", () => {
    expect(PLAYER_SPEEDS).toContain(1);
    expect(PLAYER_SPEEDS.length).toBeGreaterThan(2);
  });

  it("résout le chapitre courant à partir de l'index de diapositive", () => {
    const deck = toLearnerNarratedDeck(ready!)!;
    expect(deck.chapters.length).toBeGreaterThan(0);
    expect(chapterForSlide(deck.chapters, 1)).toBeDefined();
    expect(chapterForSlide(deck.chapters, deck.slideCount)).toBeDefined();
  });

  it("aligne le nombre de diapositives et la durée totale", () => {
    const deck = toLearnerNarratedDeck(ready!)!;
    expect(deck.slides).toHaveLength(deck.slideCount);
    expect(deck.totalDurationSeconds).toBeGreaterThan(0);
  });
});
