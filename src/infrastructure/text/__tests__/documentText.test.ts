import { describe, expect, it } from "vitest";
import { splitText } from "@/infrastructure/text/documentText";

describe("splitText", () => {
  it("rend le texte tel quel quand il tient dans un morceau", () => {
    expect(splitText("Une phrase courte.", 100)).toEqual(["Une phrase courte."]);
  });

  it("ne rend rien pour un texte vide ou blanc", () => {
    expect(splitText("   \n  ", 100)).toEqual([]);
  });

  it("coupe sur les frontières de phrase, jamais au milieu d'un mot", () => {
    const text = "Première phrase. Deuxième phrase. Troisième phrase.";
    const chunks = splitText(text, 35);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk).toMatch(/^[A-ZÀ-Ý]/);
      expect(chunk).toMatch(/\.$/);
    }
  });

  it("conserve la totalité du texte, sans perte ni doublon", () => {
    const text = Array.from({ length: 200 }, (_, i) => `Phrase numéro ${i}.`).join(" ");
    const chunks = splitText(text, 120);
    // La reconstitution ignore les espaces : seuls les caractères comptent.
    const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
    expect(collapse(chunks.join(" "))).toBe(collapse(text));
  });

  it("respecte la taille maximale demandée", () => {
    const text = Array.from({ length: 200 }, (_, i) => `Phrase numéro ${i}.`).join(" ");
    for (const chunk of splitText(text, 120)) {
      expect(chunk.length).toBeLessThanOrEqual(120);
    }
  });

  it("découpe une phrase plus longue que la limite plutôt que de la rendre entière", () => {
    // Sans ponctuation : le repli par longueur doit s'appliquer, sinon une
    // tranche dépasserait la limite d'entrée du service d'analyse.
    const text = "a".repeat(250);
    const chunks = splitText(text, 100);
    expect(chunks).toHaveLength(3);
    expect(chunks.join("")).toBe(text);
  });
});
