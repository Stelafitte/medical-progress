import { describe, expect, it } from "vitest";
import { avancement, etapeSuivante, scoreDuDossier } from "../casProgressif";

describe("le score d'un dossier", () => {
  /* LA MOYENNE, PAS LA SOMME : un dossier de 3 étapes et un de 10 doivent se
     comparer directement, c'est le seul usage qu'on en fait. */
  it("est la moyenne des étapes jouées", () => {
    expect(
      scoreDuDossier([
        { etapeId: "a", score: 1 },
        { etapeId: "b", score: 0 },
      ]),
    ).toBe(0.5);
    expect(
      scoreDuDossier([
        { etapeId: "a", score: 1 },
        { etapeId: "b", score: 0.5 },
        { etapeId: "c", score: 0 },
      ]),
    ).toBeCloseTo(0.5, 10);
  });

  it("ne compare pas un dossier long à un dossier court par sa somme", () => {
    const court = scoreDuDossier([
      { etapeId: "a", score: 1 },
      { etapeId: "b", score: 1 },
    ]);
    const long = scoreDuDossier(
      Array.from({ length: 10 }, (_, i) => ({ etapeId: `e${i}`, score: 1 })),
    );
    expect(court).toBe(long);
  });

  it("vaut zéro sur un dossier pas encore commencé, jamais NaN", () => {
    /* Une division par zéro affichée à l'étudiant ressemble à une panne. */
    expect(scoreDuDossier([])).toBe(0);
    expect(Number.isNaN(scoreDuDossier([]))).toBe(false);
  });

  it("garde le barème EDN tel quel, sans arrondir en chemin", () => {
    expect(scoreDuDossier([{ etapeId: "a", score: 0.2 }])).toBe(0.2);
  });
});

describe("la progression dans le dossier", () => {
  it("sait s'il reste une étape après celle qu'on vient de finir", () => {
    expect(etapeSuivante(0, 3)).toBe(true);
    expect(etapeSuivante(1, 3)).toBe(true);
    expect(etapeSuivante(2, 3)).toBe(false);
  });

  it("compte l'avancement sur les étapes TERMINÉES", () => {
    /* Tant qu'on répond à la première, on n'a rien fini : la barre est à zéro. */
    expect(avancement(0, 4)).toBe(0);
    expect(avancement(1, 4)).toBe(25);
    expect(avancement(4, 4)).toBe(100);
  });

  it("ne sort jamais de l'intervalle, même sur un dossier vide", () => {
    expect(avancement(0, 0)).toBe(0);
    expect(avancement(7, 4)).toBe(100);
    expect(avancement(-1, 4)).toBe(0);
  });
});
