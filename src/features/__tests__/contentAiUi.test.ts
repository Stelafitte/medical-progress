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
const KNOWLEDGE = read("src/features/administration/AdminKnowledgeBase.tsx");

describe("administration — exploitation IA", () => {
  it("n'est plus montée dans la Base de connaissances (audit du 21/09 : factice)", () => {
    expect(KNOWLEDGE).not.toContain("<ContentAiSection");
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

/**
 * Le dépôt d'une page web extraite (capture, instantané versionné, profondeur
 * de parcours) est HORS PÉRIMÈTRE v1 : l'audit Médiathèque du 29/08 ne retient
 * que le lien web simple. Le modèle de domaine `webPage.ts` reste en place,
 * inutilisé, en vue d'une reprise ultérieure — ce que ce test verrouille, pour
 * qu'une suppression involontaire se voie.
 */
describe("dépôt d'un support — périmètre v1", () => {
  it("ne propose que PDF, vidéo et lien externe", () => {
    expect(ADD_MEDIA).toContain('type NewResourceKind = "pdf" | "video" | "link"');
    expect(ADD_MEDIA).not.toContain("WEB_ACCESS_MODE_LABELS_FR");
    expect(ADD_MEDIA).not.toContain("checkWebPageUrl");
  });

  it("conserve le modèle de la page web extraite pour plus tard", () => {
    const domain = read("src/domain/webPage.ts");
    expect(domain).toContain("WEB_ACCESS_MODE_LABELS_FR");
    expect(domain).toContain("WEB_SNAPSHOT_NOTICE_FR");
    expect(domain).toContain("checkWebPageUrl");
  });
});

/**
 * ⚠️ CE BLOC A ETE INVERSE LE 09/09, ET C'EST VOLONTAIRE.
 *
 * Il verrouillait le contraire : « Etudier avec l'IA est PROPOSE dans les
 * ressources et dans l'ecran de lecture ». Ce contrat etait juste tant que le
 * tuteur de demonstration etait la seule IA du produit. Il ne l'est plus : le
 * VRAI assistant (`AiCompanionInline`) repond en production depuis le 03/09,
 * et laisser le tuteur maquette a quelques centimetres de lui mettait deux IA
 * cote a cote, une vraie et une fausse. Stef a tranche le 09/09 : on debranche.
 *
 * ON TESTE L'IMPORT ET LA BALISE, PAS LE NOM. Un simple
 * `not.toContain("ContentAiTutorPanel")` serait passe AU VERT PAR ACCIDENT
 * avant cette correction, et il ECHOUERAIT aujourd'hui : les commentaires des
 * deux ecrans nomment le composant pour expliquer pourquoi il n'y est plus.
 * C'est le defaut de tout test qui lit du texte source — il ne distingue pas
 * un composant monte d'un composant cite. Viser l'import et `<Balise` le
 * distingue.
 *
 * LE COMPOSANT RESTE SUR LE DISQUE : les trois tests suivants le gardent
 * intact (citation obligatoire, mention de maquette, vocal sans micro). Ses
 * modes — QCM, cas clinique guide, revision adaptative — sont une feuille de
 * route, pas du code mort.
 */
describe("apprenant — le tuteur IA de démonstration est débranché", () => {
  it("n'est monté ni dans les ressources ni dans l'écran de lecture", () => {
    for (const source of [RESOURCES, READER]) {
      expect(source).not.toContain('from "@/features/resources/ContentAiTutorPanel"');
      expect(source).not.toContain("<ContentAiTutorPanel");
    }
    expect(RESOURCES).not.toContain("AI_STUDY_CTA_FR");
  });

  it("laisse la place au VRAI assistant, lui bien monté", () => {
    expect(RESOURCES).toContain('from "@/features/ai/AiCompanionInline"');
    expect(RESOURCES).toContain("<AiCompanionInline");
    // Et il ne s'affiche que si le programme a ouvert l'IA (reglage du 09/09).
    expect(RESOURCES).toContain("useProgramAiEnabled");
  });

  it("cite systématiquement une référence et signale la simulation", () => {
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
