/**
 * Tests de la transformation PPTX réelle : un vrai paquet OOXML minimal est
 * construit en mémoire (zip), puis lu, inventorié et converti.
 */
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readPptxPackage } from "@/infrastructure/pptx/pptxReader";
import {
  buildHtml5Package,
  buildManifest,
  toConversionInput,
  transformPptx,
} from "@/infrastructure/pptx/pptxPipeline";
import {
  MIN_SLIDE_SECONDS,
  buildChapters,
  estimateSlideDuration,
  hasNarration,
  precheckPackage,
} from "@/domain/pptxConversion";

const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value);

const slideXml = (texts: readonly string[], withAnimation = false) =>
  `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${texts
    .map((text) => `<p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`)
    .join(
      "",
    )}</p:spTree></p:cSld>${withAnimation ? "<p:timing><p:bldP/></p:timing>" : "<p:timing/>"}</p:sld>`;

const notesXml = (text: string) =>
  `<?xml version="1.0"?><p:notes xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>${text}</a:t></a:r></a:p><a:p><a:r><a:t>2</a:t></a:r></a:p></p:notes>`;

const REL_NOTES = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";
const REL_AUDIO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio";
const REL_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const REL_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";

function buildFixturePptx(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": bytes("<Types/>"),
    "docProps/core.xml": bytes(
      '<?xml version="1.0"?><cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:title>Amylose cardiaque</dc:title></cp:coreProperties>',
    ),
    "ppt/presentation.xml": bytes(
      '<?xml version="1.0"?><p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>',
    ),
    "ppt/_rels/presentation.xml.rels": bytes(
      `<Relationships><Relationship Id="rId1" Type="${REL_SLIDE}" Target="slides/slide2.xml"/><Relationship Id="rId2" Type="${REL_SLIDE}" Target="slides/slide1.xml"/></Relationships>`,
    ),
    "ppt/slides/slide1.xml": bytes(slideXml(["Introduction", "Épidémiologie", "Diagnostic"])),
    "ppt/slides/slide2.xml": bytes(slideXml(["Conclusion"], true)),
    "ppt/slides/_rels/slide1.xml.rels": bytes(
      `<Relationships><Relationship Id="rId1" Type="${REL_NOTES}" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rId2" Type="${REL_AUDIO}" Target="../media/audio1.mp3"/><Relationship Id="rId3" Type="${REL_IMAGE}" Target="../media/image1.png"/></Relationships>`,
    ),
    "ppt/slides/_rels/slide2.xml.rels": bytes("<Relationships></Relationships>"),
    "ppt/notesSlides/notesSlide1.xml": bytes(
      notesXml("Ce cours présente le diagnostic de l'amylose cardiaque et ses signes d'alerte."),
    ),
    "ppt/media/audio1.mp3": new Uint8Array(320_000),
    "ppt/media/image1.png": new Uint8Array([137, 80, 78, 71]),
  });
}

const fixture = buildFixturePptx();

describe("lecture réelle d'un paquet .pptx", () => {
  it("refuse une archive qui n'est pas une présentation", () => {
    const notPptx = zipSync({ "hello.txt": bytes("bonjour") });
    expect(() => readPptxPackage("faux.pptx", notPptx)).toThrow(/présentation/i);
  });

  it("respecte l'ordre de présentation et non l'ordre des fichiers", () => {
    const inventory = readPptxPackage("cours.pptx", fixture);
    expect(inventory.slides.map((slide) => slide.path)).toEqual([
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
    ]);
    expect(inventory.title).toBe("Amylose cardiaque");
  });

  it("extrait textes, notes, audio, images et animations", () => {
    const inventory = readPptxPackage("cours.pptx", fixture);
    const first = inventory.slides[0]!;
    expect(first.title).toBe("Introduction");
    expect(first.texts).toHaveLength(3);
    expect(first.notes).toContain("amylose cardiaque");
    expect(first.notes).not.toMatch(/\b2\b$/);
    expect(first.audio.map((file) => file.fileName)).toEqual(["audio1.mp3"]);
    expect(first.images.map((file) => file.fileName)).toEqual(["image1.png"]);
    expect(inventory.slides[1]!.hasAnimations).toBe(true);
    // Une diapositive sans animation porte quand meme <p:timing/> :
    // le confondre avec une animation etait le bug corrige le 30/08.
    expect(first.hasAnimations).toBe(false);
    expect(inventory.fontsEmbedded).toBe(false);
  });
});

describe("logique de conversion", () => {
  const input = toConversionInput(readPptxPackage("cours.pptx", fixture));

  it("déduit la narration de l'audio ou des notes", () => {
    expect(hasNarration(input.slides[0]!)).toBe(true);
    expect(hasNarration(input.slides[1]!)).toBe(false);
  });

  it("estime une durée depuis la taille audio et applique un plancher", () => {
    expect(estimateSlideDuration(input.slides[0]!)).toBe(20);
    expect(estimateSlideDuration(input.slides[1]!)).toBe(MIN_SLIDE_SECONDS);
  });

  it("privilégie la durée réellement mesurée", () => {
    const measured = toConversionInput(readPptxPackage("cours.pptx", fixture), {
      "ppt/media/audio1.mp3": 42.4,
    });
    expect(estimateSlideDuration(measured.slides[0]!)).toBe(42);
  });

  it("signale les alertes réellement détectées", () => {
    const precheck = precheckPackage(input);
    expect(precheck.slideCount).toBe(2);
    expect(precheck.slidesWithoutNarration).toEqual([2]);
    expect(precheck.alerts).toContain("slides_without_narration");
    expect(precheck.alerts).toContain("font_not_embedded");
    expect(precheck.alerts).toContain("animation_not_convertible");
    expect(precheck.alerts).not.toContain("missing_audio");
    expect(precheck.canQueue).toBe(true);
  });

  it("produit un sommaire non vide", () => {
    const chapters = buildChapters(input.slides);
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0]!.startSlide).toBe(1);
  });

  it("échoue proprement sur une extension non .pptx", () => {
    const { deck } = transformPptx("cours.ppt", fixture);
    expect(deck.conversionStatus).toBe("failed");
    expect(deck.artifact).toBeUndefined();
  });

  it("n'auto-publie jamais : artefact brouillon et revue humaine en attente", () => {
    const { deck } = transformPptx("cours.pptx", fixture);
    expect(deck.conversionStatus).toBe("review_required");
    expect(deck.artifact?.state).toBe("draft");
    expect(deck.steps.find((s) => s.step === "pedagogical_review")?.state).toBe("pending");
    expect(deck.steps.find((s) => s.step === "publication")?.state).toBe("pending");
  });

  it("aligne l'artefact web sur le paquet lu", () => {
    const { deck } = transformPptx("cours.pptx", fixture);
    expect(deck.artifact?.slideCount).toBe(2);
    expect(deck.artifact?.slides[0]?.transcript).toContain("amylose");
    expect(deck.artifact?.totalDurationSeconds).toBeGreaterThan(0);
  });
});

describe("paquet HTML5 généré", () => {
  const transformation = transformPptx("cours.pptx", fixture);

  it("contient un lecteur autonome, un manifeste et les médias extraits", () => {
    const entries = unzipSync(buildHtml5Package(transformation));
    expect(Object.keys(entries)).toContain("index.html");
    expect(Object.keys(entries)).toContain("manifest.json");
    expect(Object.keys(entries)).toContain("media/audio1.mp3");
    expect(Object.keys(entries)).toContain("media/image1.png");
    const html = new TextDecoder().decode(entries["index.html"]!);
    expect(html).toContain("<!doctype html>");
    expect(html).not.toContain(".pptx");
  });

  it("n'expose jamais le fichier source dans le manifeste", () => {
    const serialized = JSON.stringify(buildManifest(transformation));
    expect(serialized).not.toContain(".pptx");
    expect(serialized).not.toContain("ppt/slides");
  });
});
