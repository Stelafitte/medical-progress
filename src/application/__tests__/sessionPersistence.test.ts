import { describe, expect, it } from "vitest";
import {
  DEMO_SESSION_STORAGE_KEY,
  parseDemoSession,
  reconcileDemoSession,
} from "@/application/sessionPersistence";

const known = {
  personIds: ["per-camille", "per-karim"],
  programIds: ["prog-diu-echo", "prog-dfasm-cardio"],
};

describe("persistance de la session de démonstration", () => {
  it("utilise une clé sessionStorage versionnée", () => {
    expect(DEMO_SESSION_STORAGE_KEY).toContain("v1");
  });

  it("relit un état valide", () => {
    const raw = JSON.stringify({ personId: "per-karim", programId: "prog-dfasm-cardio" });
    expect(parseDemoSession(raw)).toEqual({
      personId: "per-karim",
      programId: "prog-dfasm-cardio",
    });
  });

  it("ignore une valeur absente, corrompue ou incomplète", () => {
    expect(parseDemoSession(null)).toBeNull();
    expect(parseDemoSession("pas du json")).toBeNull();
    expect(parseDemoSession(JSON.stringify({ personId: "per-karim" }))).toBeNull();
    expect(parseDemoSession(JSON.stringify({ personId: "", programId: "p" }))).toBeNull();
    expect(parseDemoSession(JSON.stringify([1, 2]))).toBeNull();
  });

  it("rejette un état pointant vers un profil ou un programme inconnu", () => {
    expect(
      reconcileDemoSession({ personId: "per-inconnu", programId: "prog-diu-echo" }, known),
    ).toBeNull();
    expect(
      reconcileDemoSession({ personId: "per-karim", programId: "prog-inconnu" }, known),
    ).toBeNull();
  });

  it("conserve un état cohérent (le rechargement ne revient pas au profil par défaut)", () => {
    const stored = { personId: "per-karim", programId: "prog-dfasm-cardio" };
    expect(reconcileDemoSession(stored, known)).toEqual(stored);
  });
});
