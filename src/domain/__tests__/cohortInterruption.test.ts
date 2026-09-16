import { describe, expect, it } from "vitest";
import {
  decalagePropose,
  finPrevueDepassee,
  interruptionEnCours,
  joursEcoules,
  parcoursVisible,
  rendusPossibles,
  type CohortInterruption,
  type CohortInterruptionMode,
} from "../cohortInterruption";
import type { CohortId } from "../types";

const ep = (patch: Partial<CohortInterruption> & { mode: CohortInterruptionMode }) =>
  ({
    id: "int-1",
    cohortId: "coh-1" as CohortId,
    reason: "Terrain fermé",
    startedOn: "2026-09-01",
    shiftWeeks: 0,
    createdAt: "2026-09-01T08:00:00Z",
    ...patch,
  }) as CohortInterruption;

describe("l'interruption en cours", () => {
  it("est celle qui n'a pas de fin, et il ne peut y en avoir qu'une", () => {
    const passee = ep({ mode: "frozen", id: "vieille", endedOn: "2026-08-20" });
    const ouverte = ep({ mode: "suspended", id: "ouverte" });
    expect(interruptionEnCours([passee, ouverte])?.id).toBe("ouverte");
    expect(interruptionEnCours([passee])).toBeUndefined();
    expect(interruptionEnCours([])).toBeUndefined();
  });
});

describe("ce que chaque degré autorise", () => {
  /* MEME REGLE QUE LE TRIGGER DE BASE, ecrite deux fois expres : la base
     refuse, l'ecran previent. Si ces deux verites divergent, l'etudiant voit
     un bouton qui part vers un refus certain. */
  it("suspendre ferme la vue ET les rendus", () => {
    const i = ep({ mode: "suspended" });
    expect(parcoursVisible(i)).toBe(false);
    expect(rendusPossibles(i)).toBe(false);
  });

  it("geler laisse voir, et refuse de rendre", () => {
    const i = ep({ mode: "frozen" });
    expect(parcoursVisible(i)).toBe(true);
    expect(rendusPossibles(i)).toBe(false);
  });

  it("signaler ne change rien pour l'apprenant", () => {
    const i = ep({ mode: "flagged" });
    expect(parcoursVisible(i)).toBe(true);
    expect(rendusPossibles(i)).toBe(true);
  });

  it("sans interruption, tout est ouvert", () => {
    expect(parcoursVisible(undefined)).toBe(true);
    expect(rendusPossibles(undefined)).toBe(true);
  });
});

describe("le décalage proposé à la reprise", () => {
  it("compte les semaines PLEINES écoulées, jamais un compte à moitié", () => {
    const i = ep({ mode: "frozen", startedOn: "2026-09-01" });
    expect(decalagePropose(i, new Date("2026-09-01T12:00:00Z"))).toBe(0);
    expect(decalagePropose(i, new Date("2026-09-07T12:00:00Z"))).toBe(0);
    expect(decalagePropose(i, new Date("2026-09-08T12:00:00Z"))).toBe(1);
    expect(decalagePropose(i, new Date("2026-09-22T12:00:00Z"))).toBe(3);
  });

  it("ne descend jamais sous zéro ni au-dessus du plafond de la base", () => {
    const i = ep({ mode: "frozen", startedOn: "2026-09-01" });
    expect(decalagePropose(i, new Date("2026-08-01T12:00:00Z"))).toBe(0);
    expect(decalagePropose(i, new Date("2030-01-01T12:00:00Z"))).toBe(104);
  });

  it("rend zéro plutôt que NaN sur une date illisible", () => {
    const i = ep({ mode: "frozen", startedOn: "pas-une-date" });
    expect(decalagePropose(i)).toBe(0);
    expect(joursEcoules(i)).toBe(0);
  });
});

describe("la fin prévue dépassée", () => {
  /* LE SCENARIO LE PLUS COUTEUX : une pause qu'on a oublie de lever. Personne
     ne rend rien et personne ne sait pourquoi. */
  it("se signale quand la date est passée", () => {
    const i = ep({ mode: "frozen", startedOn: "2026-09-01", expectedUntil: "2026-09-15" });
    expect(finPrevueDepassee(i, new Date("2026-09-10T12:00:00Z"))).toBe(false);
    expect(finPrevueDepassee(i, new Date("2026-09-16T12:00:00Z"))).toBe(true);
  });

  it("ne se signale pas quand aucune fin n'était prévue", () => {
    const i = ep({ mode: "suspended", startedOn: "2026-01-01" });
    expect(finPrevueDepassee(i, new Date("2030-01-01T12:00:00Z"))).toBe(false);
  });
});
