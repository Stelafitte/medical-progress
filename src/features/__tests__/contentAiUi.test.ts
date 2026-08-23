/**
 * Contrats d'interface de l'exploitation IA (lecture du code source) :
 * présence des écrans, isolation des sources et portabilité mobile.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const ADMIN_AI = read("src/features/administration/ContentAiSection.tsx");
const TUTOR = read("src/features/resources/ContentAiTutorPanel.tsx");
const RESOURCES = read("src/features/resources/ResourcesView.tsx");
const READER = read("src/features/resources/NarratedReaderView.tsx");
const ADD_MEDIA = read("src/features/administration/AddMediaDialog.tsx");
const PEDAGOGY = read("src/features/administration/AdminPedagogy.tsx");

describe("administration — exploitation IA", () => {
  it("est accessible depuis l'onglet Médiathèque", () => {
    expect(PEDAGOGY).toContain("ContentAiSection");
    expect(PEDAGOGY).toContain("exploitation-ia");
  });

  it("affiche la couverture, les files et les actions simulées", () => {
    expect(ADMIN_AI).toContain("Couverture IA des contenus publiés");
    expect(ADMIN_AI).toContain("CONTENT_AI_QUEUE_LABELS_FR");
    expect(ADMIN_AI).toContain("CONTENT_AI_ACTION_LABELS_FR");
    expect(ADMIN_AI).toContain("Action simulée");
  });

  it("rappelle la garde de publication et l'absence de traitement réel", () => {
    expect(ADMIN_AI).toContain("PUBLICATION_BLOCKED_NOTICE_FR");
    expect(ADMIN_AI).toContain("AI_MOCK_NOTICE_FR");
  });
});

describe("dépôt d'une page web HTML", () => {
  it("propose URL, accès, fréquence et profondeur", () => {
    expect(ADD_MEDIA).toContain("WEB_ACCESS_MODE_LABELS_FR");
    expect(ADD_MEDIA).toContain("WEB_CHECK_FREQUENCY_LABELS_FR");
    expect(ADD_MEDIA).toContain("WEB_CRAWL_DEPTH_LABELS_FR");
    expect(ADD_MEDIA).toContain("checkWebPageUrl");
  });

  it("rappelle que l'IA n'exploite que l'instantané validé", () => {
    expect(ADD_MEDIA).toContain("WEB_SNAPSHOT_NOTICE_FR");
    expect(ADD_MEDIA).toContain("WEB_PRECHECK_NOTICE_FR");
  });

  it("exige une décision pour un lien externe simple", () => {
    expect(ADD_MEDIA).toContain("hors du corpus IA");
  });
});

describe("apprenant — Étudier avec l'IA", () => {
  it("est proposé dans les ressources et dans l'écran de lecture", () => {
    expect(RESOURCES).toContain("ContentAiTutorPanel");
    expect(READER).toContain("ContentAiTutorPanel");
    expect(RESOURCES).toContain("AI_STUDY_CTA_FR");
  });

  it("cite systématiquement une référence et signale la maquette", () => {
    expect(TUTOR).toContain("CITATION_KIND_LABELS_FR");
    expect(TUTOR).toContain("AI_GROUNDING_NOTICE_FR");
    expect(TUTOR).toContain("AI_MOCK_NOTICE_FR");
  });

  it("simule le vocal sans microphone ni session temps réel", () => {
    expect(TUTOR).toContain("AI_VOICE_MOCK_NOTICE_FR");
    expect(TUTOR).not.toContain("getUserMedia");
    expect(TUTOR).not.toContain("WebSocket");
    expect(TUTOR).not.toContain("fetch(");
  });

  it("n'expose aucune source privée côté apprenant", () => {
    for (const source of [TUTOR, RESOURCES, READER]) {
      expect(source).not.toContain(".pptx");
      expect(source).not.toContain("rawHtml");
      expect(source).not.toContain("restrictedToStaff");
    }
  });
});

describe("portabilité mobile", () => {
  it("garde des zones tactiles de 44 px et des grilles empilées", () => {
    for (const source of [ADMIN_AI, TUTOR, RESOURCES]) {
      expect(source).toContain("min-h-11");
    }
    expect(ADMIN_AI).toContain("md:hidden");
    expect(RESOURCES).toContain("md:grid-cols-2");
    expect(TUTOR).toContain("sm:flex-row");
  });
});
