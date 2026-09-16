/**
 * DE QUOI LA TRACE D'UN STAGE EST FAITE — la règle qui décide ce que l'étudiant
 * doit remplir. La plus importante est celle de TRANSITION : tant que personne
 * n'a rien décidé, DFASM-CARDIO garde son carnet de présence.
 */
import { describe, expect, it } from "vitest";
import {
  avancementDeLItem,
  estRempliDansLeHub,
  modeleDeCarnetRetenu,
  suiviDePresenceAttendu,
  tracesDuStage,
} from "../stageTracking";
import type { AssessmentModality } from "../assessmentModality";

const modalite = (patch: Partial<AssessmentModality>): AssessmentModality =>
  ({
    id: "mod-journal",
    programId: "prog-a",
    name: "Journal de stage",
    mode: "online",
    subtype: "portfolio",
    usage: "formative",
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:00:00Z",
    ...patch,
  }) as AssessmentModality;

describe("la transition — ce qui protège DFASM", () => {
  it("sans aucun choix, le suivi de présence reste attendu", () => {
    expect(suiviDePresenceAttendu([modalite({})], true)).toBe(true);
    expect(suiviDePresenceAttendu([], true)).toBe(true);
  });

  it("sans module Stage, rien n'est attendu", () => {
    expect(suiviDePresenceAttendu([modalite({ stageTracking: ["presence_digital"] })], false)).toBe(
      false,
    );
  });

  it("dès qu'un choix est fait, c'est lui qui décide", () => {
    expect(suiviDePresenceAttendu([modalite({ stageTracking: ["logbook_digital"] })], true)).toBe(
      false,
    );
    expect(
      suiviDePresenceAttendu(
        [modalite({ stageTracking: ["logbook_digital", "presence_digital"] })],
        true,
      ),
    ).toBe(true);
  });
});

describe("les formes de trace retenues", () => {
  it("dédoublonne et garde l'ordre de référence", () => {
    expect(
      tracesDuStage([
        modalite({ id: "a", stageTracking: ["supervisor_attestation", "logbook_digital"] }),
        modalite({ id: "b", stageTracking: ["logbook_digital", "presence_digital"] }),
      ]),
    ).toEqual(["presence_digital", "logbook_digital", "supervisor_attestation"]);
  });

  it("distingue ce que le hub fait remplir de ce qui est attesté", () => {
    expect(estRempliDansLeHub("presence_digital")).toBe(true);
    expect(estRempliDansLeHub("logbook_digital")).toBe(true);
    expect(estRempliDansLeHub("logbook_paper")).toBe(false);
    expect(estRempliDansLeHub("supervisor_attestation")).toBe(false);
  });
});

describe("le modèle de carnet", () => {
  it("n'est retenu que si le carnet dématérialisé l'est", () => {
    expect(
      modeleDeCarnetRetenu([
        modalite({ stageTracking: ["logbook_paper"], stageLogTemplateId: "t1" }),
      ]),
    ).toBeUndefined();
    expect(
      modeleDeCarnetRetenu([
        modalite({ stageTracking: ["logbook_digital"], stageLogTemplateId: "t1" }),
      ]),
    ).toBe("t1");
  });
});

describe("l'avancement d'un item", () => {
  it("compte ce qui est déclaré sur ce qui est attendu", () => {
    expect(avancementDeLItem(43, 150).pourcent).toBe(29);
    expect(avancementDeLItem(0, 150).pourcent).toBe(0);
  });

  it("ne dépasse jamais 100 %, et ne divise pas par zéro", () => {
    expect(avancementDeLItem(200, 150).pourcent).toBe(100);
    expect(avancementDeLItem(5, 0).pourcent).toBe(0);
  });

  it("refuse les comptes négatifs", () => {
    expect(avancementDeLItem(-3, 150).fait).toBe(0);
  });
});
