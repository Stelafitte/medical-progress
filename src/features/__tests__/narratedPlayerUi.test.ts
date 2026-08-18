import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const player = read("src/features/resources/NarratedSlidesPlayer.tsx");
const dialog = read("src/features/administration/AddMediaDialog.tsx");
const panel = read("src/features/administration/NarratedConversionPanel.tsx");
const librarySection = read("src/features/administration/MediaLibrarySection.tsx");
const detail = read("src/features/administration/MediaDetailDialog.tsx");
const resources = read("src/features/resources/ResourcesView.tsx");

describe("lecteur de diaporama commenté", () => {
  it("offre lecture/pause, navigation, sommaire, transcription et vitesse", () => {
    expect(player).toContain("Lecture");
    expect(player).toContain("Pause");
    expect(player).toContain("Sommaire");
    expect(player).toContain("Transcription");
    expect(player).toContain("PLAYER_SPEEDS");
    expect(player).toContain("Progress");
  });

  it("respecte les zones tactiles de 44 px et reste utilisable dès 360 px", () => {
    const buttons = player.match(/<Button/g) ?? [];
    const touch = player.match(/min-h-11/g) ?? [];
    expect(touch.length).toBeGreaterThanOrEqual(buttons.length - 1);
    expect(player).not.toMatch(/\bw-\[(?:[4-9]\d\d|\d{4,})px\]/);
  });

  it("n'expose jamais le PPTX source ni un téléchargement", () => {
    expect(player.toLowerCase()).not.toContain(".pptx");
    expect(player).not.toContain("download");
    expect(player).toContain("NARRATED_ONLINE_ONLY_FR");
  });

  it("est branché dans l'espace Ressources", () => {
    expect(resources).toContain("NarratedSlidesPlayer");
    expect(resources).toContain("narratedDecks");
  });
});

describe("parcours administrateur", () => {
  it("propose le dépôt PPTX et les options de conversion", () => {
    expect(dialog).toContain("NARRATED_UPLOAD_LABEL_FR");
    expect(dialog).toContain('accept: ".pptx"');
    expect(dialog).toContain("CONVERSION_TARGET_LABELS_FR");
    expect(dialog).toContain("checkPptxUpload");
    expect(dialog).toContain("exposeTranscript");
  });

  it("affiche le journal des étapes et les alertes de conversion", () => {
    expect(panel).toContain("CONVERSION_PIPELINE");
    expect(panel).toContain("CONVERSION_STEP_STATE_LABELS_FR");
    expect(panel).toContain("CONVERSION_ALERT_LABELS_FR");
    expect(panel).toContain("availableNarratedActions");
    expect(panel).toContain("NARRATED_HUMAN_REVIEW_FR");
  });

  it("affiche le statut de conversion dans la liste et la fiche détail", () => {
    expect(librarySection).toContain("CONVERSION_STATUS_LABELS_FR");
    expect(librarySection).toContain("conversionStatusOf");
    expect(detail).toContain("NarratedConversionPanel");
  });

  it("rappelle que la conversion est simulée", () => {
    expect(panel).toContain("MEDIA_STORAGE_NOTICE_FR");
    expect(panel).toContain("simulé");
  });
});
