import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const player = read("src/features/resources/NarratedSlidesPlayer.tsx");
const dialog = read("src/features/administration/AddMediaDialog.tsx");
const converter = read("src/features/administration/PptxConverterDialog.tsx");
const publisher = read("src/features/administration/NarratedPackagePublishDialog.tsx");
const panel = read("src/features/administration/NarratedConversionPanel.tsx");
const librarySection = read("src/features/administration/MediaLibrarySection.tsx");
const detail = read("src/features/administration/MediaDetailDialog.tsx");
const resources = read("src/features/resources/ResourcesView.tsx");
const reader = read("src/features/resources/NarratedReaderView.tsx");
const route = read("src/routes/espace.ressources.$resourceId.lecture.tsx");

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

  it("est ouvert depuis les Ressources par « Consulter le cours »", () => {
    expect(resources).toContain("Consulter le cours");
    expect(resources).toContain("/espace/ressources/$resourceId/lecture");
    expect(resources).toContain("params={{ resourceId: deck.mediaId }}");
    // La liste reste un catalogue : le lecteur n'y est plus intégré en aperçu.
    expect(resources).not.toContain("NarratedSlidesPlayer");
  });

  it("propose complétion et plein écran en mode écran dédié", () => {
    expect(player).toContain("focused");
    expect(player).toContain("requestFullscreen");
    expect(player).toContain("exitFullscreen");
    expect(player).toContain("Cours parcouru");
    expect(player).toContain("diapositives vues");
  });

  it("peut embarquer un lecteur d'artefacts réels sans exposer la source", () => {
    expect(player).toContain("deck.webPlayerUrl");
    expect(player).toContain("<iframe");
    expect(player).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(player).toContain("Lecteur web HTML5 réel");
    expect(player.indexOf("if (deck.webPlayerUrl)")).toBeLessThan(
      player.lastIndexOf("onClick={toggleFullscreen}"),
    );
  });
});

describe("écran de lecture dédié", () => {
  it("expose une route apprenant paramétrée et non indexée", () => {
    expect(route).toContain('createFileRoute("/espace/ressources/$resourceId/lecture")');
    expect(route).toContain("Route.useParams()");
    expect(route).toContain('name: "robots", content: "noindex"');
  });

  it("porte une garde de rôle apprenant", () => {
    expect(route).toContain("canAccessLearnerSpace");
    expect(route).toContain("AccessRestricted");
    expect(route.indexOf("canAccessLearnerSpace")).toBeLessThan(
      route.indexOf("<NarratedReaderView"),
    );
  });

  it("offre une lecture concentrée : retour, lecteur agrandi, objectifs", () => {
    expect(reader).toContain("Retour aux ressources");
    // Le lecteur REEL depuis le 18/09 : la scene partagee avec l'apercu admin.
    expect(reader).toContain("<LearnerDeckPlayer resourceId={deck.mediaId}");
    expect(reader).toContain("getNarratedDeckPlayback");
    expect(reader).not.toContain("NarratedSlidesPlayer");
    expect(reader).toContain("Objectifs travaillés");
    expect(reader).toContain("Cours indisponible");
  });

  it("ne consomme que le DTO d'artefacts dérivés, jamais le PPTX source", () => {
    for (const file of [reader, route]) {
      expect(file.toLowerCase()).not.toContain(".pptx");
      expect(file).not.toContain("fileName");
      expect(file).not.toContain("narrated.source");
      expect(file).not.toContain("sizeHint");
      expect(file).not.toContain("mp4");
      expect(file).not.toContain("download");
      expect(file).not.toContain("mediaResources");
    }
    expect(reader).toContain("narratedDecks.find");
  });

  it("laisse la prévisualisation enseignant côté administration", () => {
    expect(panel).toContain("NARRATED_ACTION_LABELS_FR");
    expect(reader).not.toContain("Prévisualiser");
    expect(reader).not.toContain("NarratedConversionPanel");
  });
});

describe("parcours administrateur", () => {
  it("propose le dépôt PPTX et les options de conversion", () => {
    // Le dépôt d'un PPTX a son écran dédié : « Ajouter un support » couvre le
    // PDF, la vidéo et le lien, la conversion d'un diaporama commenté passe par
    // PptxConverterDialog. Un seul chemin par type de support.
    expect(converter).toContain('accept=".pptx');
    expect(converter).toContain("exposeTranscript");
    expect(converter).toContain("autoChapters");
    expect(converter).toContain("convertPptx");
    expect(dialog).not.toContain(".pptx");
  });

  it("publie reellement un cours converti, sans simulation", () => {
    // Le rendu fidele exige PowerPoint : il est produit hors ligne par
    // convert.ps1. Cet ecran prend le dossier resultant et le publie pour de
    // bon — chaque fichier televerse, chaque asset enregistre, puis la
    // publication en une transaction.
    expect(publisher).toContain("dataAccess.resources.createResource");
    expect(publisher).toContain("dataAccess.resources.requestUploadUrl");
    expect(publisher).toContain("dataAccess.resources.uploadResourceFile");
    expect(publisher).toContain("dataAccess.resources.registerAsset");
    expect(publisher).toContain("dataAccess.resources.publishNarratedDeck");
    expect(publisher).toContain('"slide_video"');
    expect(publisher).not.toContain("simulé");
    expect(librarySection).toContain("NarratedPackagePublishDialog");
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
