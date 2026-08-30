import { describe, expect, it } from "vitest";
import {
  appendMessage,
  emptyJournalEntry,
  selfDeclarationState,
  setExperienceNote,
  toggleSelfDeclaration,
} from "@/domain/competenceJournal";
import type { OutcomeId } from "@/domain/types";

const id = "outcome-1" as OutcomeId;
const now = "2026-08-25T10:00:00Z";

describe("competenceJournal", () => {
  it("horodate la déclaration et la retire au décochage", () => {
    const declared = toggleSelfDeclaration(emptyJournalEntry(id), true, now);
    expect(declared.selfDeclaredAcquired).toBe(true);
    expect(declared.declaredAt).toBe(now);
    const undone = toggleSelfDeclaration(declared, false, now);
    expect(undone.selfDeclaredAcquired).toBe(false);
    expect(undone.declaredAt).toBeUndefined();
  });

  it("conserve le commentaire d'expérience", () => {
    expect(setExperienceNote(emptyJournalEntry(id), "ETT réalisée").experienceNote).toBe(
      "ETT réalisée",
    );
  });

  it("ignore un message vide et marque les messages comme simulés", () => {
    const empty = appendMessage(emptyJournalEntry(id), "learner", "   ", now, "m1");
    expect(empty.messages).toHaveLength(0);
    const sent = appendMessage(empty, "learner", " question ", now, "m1");
    expect(sent.messages[0]).toMatchObject({
      body: "question",
      author: "learner",
      simulated: true,
    });
  });

  it("ne confirme jamais une compétence sur la seule déclaration de l'apprenant", () => {
    const declared = toggleSelfDeclaration(emptyJournalEntry(id), true, now);
    expect(selfDeclarationState(declared, false)).toBe("awaiting_validation");
    expect(selfDeclarationState(declared, true)).toBe("confirmed");
    expect(selfDeclarationState(undefined, false)).toBe("none");
  });
});
