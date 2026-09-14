import { describe, expect, it } from "vitest";
import {
  CATALOGUE_ID_PREFIX,
  CATALOGUE_MODALITES,
  catalogueAssociationItems,
} from "@/domain/assessmentCatalogue";
import type { AssessmentModality } from "@/domain/assessmentModality";

const programId = "prog-1";

function modalite(partiel: Partial<AssessmentModality> & { name: string }): AssessmentModality {
  return {
    id: `m-${partiel.name}`,
    programId,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    mode: "online",
    subtype: "qcm",
    usage: "formative",
    retainedAt: "2026-09-14T00:00:00.000Z",
    ...partiel,
  };
}

describe("catalogue des modalités d'évaluation", () => {
  it("ne porte ni clé ni intitulé en double", () => {
    const cles = CATALOGUE_MODALITES.map((e) => e.key);
    const noms = CATALOGUE_MODALITES.map((e) => e.name.trim().toLocaleLowerCase("fr"));
    expect(new Set(cles).size).toBe(cles.length);
    expect(new Set(noms).size).toBe(noms.length);
  });

  /*
   * L'exclusion documentée : l'interaction vocale du hub est une simulation
   * assumée. Une entrée `ai_oral` promettrait une épreuve qui n'existe pas.
   */
  it("ne propose aucune évaluation orale par IA", () => {
    expect(CATALOGUE_MODALITES.some((e) => e.subtype === "ai_oral")).toBe(false);
  });

  it("donne à une entrée absente un identifiant de catalogue, non retenue", () => {
    const lignes = catalogueAssociationItems([]);
    expect(lignes).toHaveLength(CATALOGUE_MODALITES.length);
    expect(lignes.every((l) => l.id.startsWith(CATALOGUE_ID_PREFIX))).toBe(true);
    expect(lignes.every((l) => l.retained === false)).toBe(true);
  });

  it("laisse la base faire foi quand l'entrée existe déjà", () => {
    // Même intitulé que l'entrée « Journal de stage », mais usage et format
    // différents de ceux du catalogue : c'est la ligne réelle qui doit s'afficher.
    const existante = modalite({
      name: "journal de stage",
      subtype: "case_study",
      usage: "validation_exam",
    });
    const ligne = catalogueAssociationItems([existante]).find((l) => l.id === existante.id);
    expect(ligne).toBeDefined();
    expect(ligne?.groupLabel).toBe("Examen de validation");
    expect(ligne?.label).toContain("Cas clinique commenté");
    expect(ligne?.retained).toBe(true);
  });

  it("ajoute les modalités sur mesure après le catalogue, dans leur groupe", () => {
    const surMesure = modalite({ name: "ECOS simulés", usage: "validation_exam" });
    const lignes = catalogueAssociationItems([surMesure]);
    expect(lignes).toHaveLength(CATALOGUE_MODALITES.length + 1);
    const derniere = lignes.at(-1);
    expect(derniere?.id).toBe(surMesure.id);
    expect(derniere?.groupLabel).toBe("Examen de validation");
  });

  it("ne marque pas retenue une ligne existante sortie du parcours", () => {
    const { retainedAt: _r, ...horsParcours } = modalite({ name: "QCM d'entraînement" });
    const ligne = catalogueAssociationItems([horsParcours]).find((l) => l.id === horsParcours.id);
    expect(ligne?.retained).toBe(false);
  });
});
