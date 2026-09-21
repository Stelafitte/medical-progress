import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  doitIntercepter,
  natureOnglet,
  promotionValide,
  promotionsConcernees,
  verrouNecessaire,
} from "@/features/administration/perimetrePromotion";
import type { Cohort } from "@/domain/types";

const c = (id: string, status: Cohort["status"], archivedAt: string | null = null) =>
  ({ id, label: id, status, archivedAt }) as unknown as Cohort;

describe("nature des onglets d'administration", () => {
  it("classe les onglets", () => {
    expect(natureOnglet("/espace/administration")).toBe("promotion");
    expect(natureOnglet("/espace/administration/pilotage")).toBe("promotion");
    expect(natureOnglet("/espace/administration/stages")).toBe("promotion");
    expect(natureOnglet("/espace/administration/concepteur")).toBe("programme");
    expect(natureOnglet("/espace/administration/competences")).toBe("programme");
    expect(natureOnglet("/espace/administration/connaissances")).toBe("programme");
    expect(natureOnglet("/espace/administration/messagerie")).toBe("transversal");
    expect(natureOnglet("/espace/administration/encadrement")).toBe("transversal");
    expect(natureOnglet("/espace/stage")).toBeNull();
  });
});

describe("verrou d'édition du programme", () => {
  it("ne s'impose qu'avec une promotion ouverte ou en cours", () => {
    expect(verrouNecessaire([c("a", "draft")])).toBe(false);
    expect(verrouNecessaire([c("a", "completed")])).toBe(false);
    expect(verrouNecessaire([c("a", "open")])).toBe(true);
    expect(verrouNecessaire([c("a", "in_progress")])).toBe(true);
    expect(verrouNecessaire([c("a", "in_progress", "2026-09-01")])).toBe(false);
  });

  it("liste les promotions concernées, vivantes d'abord, sans les archivées", () => {
    const l = promotionsConcernees([c("a", "draft"), c("b", "in_progress"), c("z", "archived")]);
    expect(l.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("intercepte ce qui agit, laisse passer ce qui montre", () => {
    expect(doitIntercepter({ tag: "BUTTON" })).toBe(true);
    expect(doitIntercepter({ tag: "BUTTON", ariaExpanded: "false" })).toBe(false);
    expect(doitIntercepter({ tag: "BUTTON", ariaHaspopup: "dialog" })).toBe(false);
    expect(doitIntercepter({ tag: "BUTTON", role: "tab" })).toBe(false);
    expect(doitIntercepter({ tag: "BUTTON", role: "combobox" })).toBe(false);
    expect(doitIntercepter({ tag: "BUTTON", lecture: true })).toBe(false);
    expect(doitIntercepter({ tag: "A", href: "/x" })).toBe(false);
    expect(doitIntercepter({ tag: "BUTTON", role: "switch" })).toBe(true);
    expect(doitIntercepter({ tag: "INPUT", type: "file" })).toBe(true);
    expect(doitIntercepter({ tag: "INPUT", type: "text" })).toBe(false);
  });
});

describe("promotion mémorisée", () => {
  it("revient à « Toutes » si elle n'appartient pas au programme", () => {
    expect(promotionValide("a", [c("a", "open")])).toBe("a");
    expect(promotionValide("x", [c("a", "open")])).toBeNull();
    expect(promotionValide(null, [c("a", "open")])).toBeNull();
  });
});

describe("câblage des écrans", () => {
  const lire = (p: string) => readFileSync(p, "utf8");
  it("l'en-tête porte le second menu et le rappel de contexte", () => {
    const shell = lire("src/components/layout/app-shell.tsx");
    expect(shell.match(/<CohortSwitcher/g)?.length).toBe(2);
    expect(shell).toContain("<RappelPromotion />");
  });
  it("les trois onglets de niveau programme sont sous verrou", () => {
    for (const f of ["AdminKnowledgeBase", "AdminCompetencies", "AdminProgramDesigner"]) {
      const src = lire(`src/features/administration/${f}.tsx`);
      expect(src).toContain("<ZoneProgramme");
      expect(src).toContain("</ZoneProgramme>");
    }
  });
  it("le dialogue de confirmation est hors de la zone qui intercepte", () => {
    const src = lire("src/features/administration/ZoneProgramme.tsx");
    const zone = src.indexOf("onClickCapture");
    const fin = src.indexOf("{children}", zone);
    expect(src.indexOf("<AlertDialog ", fin)).toBeGreaterThan(fin);
  });
});
