import { describe, expect, it } from "vitest";
import { annotateRankImages, itemNumbersIn, matchDocumentToTheme } from "@/domain/corpusChapter";

const THEMES = [
  { id: "t-232", label: "Item 232 — Fibrillation atriale" },
  { id: "t-231", label: "Item 231 — Électrocardiogramme : indications et interprétations" },
  { id: "t-237", label: "Item 237 — Palpitations" },
  { id: "t-13", label: "Item 13 — Un thème d'un tout autre programme" },
];

describe("conserver le rang porté par une image", () => {
  it("remplace l'image de rang par un marqueur lisible", () => {
    const html =
      '<td><img alt="lettre a" src="../sites/default/files/inline-images/A.jpg" width="33"></td>';
    expect(annotateRankImages(html)).toContain("[Rang A]");
    expect(annotateRankImages(html)).not.toContain("<img");
  });

  it("lit l'alt d'abord : le nom du fichier varie d'un chapitre à l'autre", () => {
    // A.jpg, A_1.jpg, A_9.jpg, B_2.jpg, C_0.jpg — tous vus dans le même zip.
    const variantes = [
      '<img alt="lettre b" src="x/inline-images/B_12.jpg">',
      '<img alt="lettre c" src="x/inline-images/C_0.jpg">',
    ];
    expect(annotateRankImages(variantes[0]!)).toContain("[Rang B]");
    expect(annotateRankImages(variantes[1]!)).toContain("[Rang C]");
  });

  it("se rabat sur le nom du fichier quand l'alt manque", () => {
    expect(annotateRankImages('<img src="x/inline-images/C_10.jpg">')).toContain("[Rang C]");
  });

  it("ne touche pas aux figures du cours", () => {
    const figure = '<img alt="Figure 1" src="x/inline-images/f15-33-9782294776861.jpg">';
    expect(annotateRankImages(figure)).toBe(figure);
  });
});

describe("rattacher un chapitre à son thème", () => {
  it("ne retient que le numéro qui SUIT « item »", () => {
    // Le 13 est le rang du chapitre dans l'ouvrage. Le prendre ferait matcher
    // « Item 13 », qui n'a rien à voir.
    expect(itemNumbersIn("chapitre-13-item-232-fibrillation-atriale.html")).toEqual([232]);
  });

  it("rattache le chapitre au bon thème par le numéro d'item", () => {
    const m = matchDocumentToTheme("chapitre-13-item-232-fibrillation-atriale.html", THEMES);
    expect(m?.themeId).toBe("t-232");
    expect(m?.via).toBe("numéro d'item");
  });

  it("ne confond pas le rang du chapitre avec un numéro d'item", () => {
    // Sans la règle « après item », ce chemin matcherait « Item 13 ».
    const m = matchDocumentToTheme("chapitre-13-item-232-fibrillation-atriale.html", THEMES);
    expect(m?.themeId).not.toBe("t-13");
  });

  it("se rabat sur les mots quand aucun numéro n'est exploitable", () => {
    const m = matchDocumentToTheme("cours/palpitations-du-sujet-jeune.html", [
      { id: "t-a", label: "Palpitations du sujet jeune" },
      { id: "t-b", label: "Insuffisance cardiaque" },
    ]);
    expect(m?.themeId).toBe("t-a");
    expect(m?.via).toBe("libellé");
  });

  it("préfère ne rien proposer plutôt qu'un rattachement ambigu", () => {
    // Deux thèmes également plausibles : un rapprochement serait validé d'un
    // clic et personne ne verrait l'erreur.
    const m = matchDocumentToTheme("troubles-du-rythme-cardiaque.html", [
      { id: "t-a", label: "Troubles du rythme cardiaque" },
      { id: "t-b", label: "Troubles du rythme cardiaque de l'enfant" },
    ]);
    expect(m).toBeUndefined();
  });

  it("ne propose rien quand un seul mot est commun", () => {
    const m = matchDocumentToTheme("mentions-legales.html", THEMES);
    expect(m).toBeUndefined();
  });
});
