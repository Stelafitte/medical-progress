import { describe, expect, it } from "vitest";
import {
  GESTE_LABELS_FR,
  INCIDENT_SCOPE_LABELS_FR,
  gestesPour,
  incidentsOuverts,
  joursDepuis,
  type IncidentScope,
  type ProgramIncident,
} from "../pilotDecision";
import type { CohortId } from "../types";

const inc = (patch: Partial<ProgramIncident> & { scope: IncidentScope }) =>
  ({
    id: "inc-1",
    cohortId: "coh-1" as CohortId,
    title: "Service fermé",
    reason: "Travaux",
    occurredOn: "2026-09-01",
    createdAt: "2026-09-01T08:00:00Z",
    ...patch,
  }) as ProgramIncident;

describe("les incidents ouverts", () => {
  it("sont ceux qui n'ont pas de date de clôture", () => {
    const ouvert = inc({ scope: "cohort", id: "ouvert" });
    const clos = inc({ scope: "placement", id: "clos", resolvedOn: "2026-09-10" });
    expect(incidentsOuverts([ouvert, clos]).map((i) => i.id)).toEqual(["ouvert"]);
  });
});

describe("ce que chaque incident appelle", () => {
  /* LE CŒUR DE LA PROPOSITION : on ne présente pas les mêmes remèdes selon ce
     qui est cassé. Un terrain fermé ne se répare pas en gelant les rendus de
     toute la promotion. */
  it("un terrain fermé ne propose PAS d'interrompre toute la promotion", () => {
    expect(gestesPour("placement")).not.toContain("interrompre");
    expect(gestesPour("placement")[0]).toBe("decaler");
  });

  it("un jalon manqué est une affaire de calendrier et de prévenance", () => {
    expect(gestesPour("milestone")).toEqual(["decaler", "relancer"]);
  });

  it("un incident sur un seul apprenant ne fait rien bouger de collectif", () => {
    const gestes = gestesPour("learner");
    expect(gestes).not.toContain("interrompre");
    expect(gestes).not.toContain("decaler");
    expect(gestes[0]).toBe("relancer");
  });

  it("seul un incident de promotion propose l'interruption, et en premier", () => {
    expect(gestesPour("cohort")[0]).toBe("interrompre");
  });

  it("chaque geste proposé porte un libellé", () => {
    for (const scope of ["cohort", "placement", "milestone", "learner"] as const) {
      expect(INCIDENT_SCOPE_LABELS_FR[scope]).toBeTruthy();
      for (const geste of gestesPour(scope)) {
        expect(GESTE_LABELS_FR[geste]).toBeTruthy();
      }
    }
  });
});

describe("l'ancienneté d'un incident", () => {
  it("se compte en jours pleins, et jamais en négatif", () => {
    expect(joursDepuis("2026-09-01", new Date("2026-09-01T23:00:00Z"))).toBe(0);
    expect(joursDepuis("2026-09-01", new Date("2026-09-12T12:00:00Z"))).toBe(11);
    expect(joursDepuis("2026-09-01", new Date("2026-08-01T12:00:00Z"))).toBe(0);
  });

  it("rend zéro plutôt que NaN sur une date illisible", () => {
    expect(joursDepuis("pas-une-date")).toBe(0);
  });
});
