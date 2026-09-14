import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_SUBTYPE_LABELS_FR,
  EMPTY_NEW_MODALITY_INPUT,
  SUBTYPE_GROUPS_FR,
  sessionState,
  splitSessions,
  validateNewModality,
  type AssessmentSession,
  type AssessmentSubtype,
} from "@/domain/assessmentModality";

describe("modalités d'évaluation", () => {
  it("exige un nom", () => {
    expect(validateNewModality(EMPTY_NEW_MODALITY_INPUT)).toContain("name-required");
  });

  /*
   * Ce test remplace « refuse un sous-type incohérent avec le type », qui
   * gardait la règle croisant mode et sous-type. Elle est tombée le 14/09,
   * côté base comme ici : c'est elle qui rendait un ECOS en présentiel et un
   * QCM sur table impossibles à saisir.
   */
  it("accepte un format quel que soit le mode", () => {
    const ecosAuLitDuMalade = validateNewModality({
      ...EMPTY_NEW_MODALITY_INPUT,
      name: "ECOS de fin de stage",
      mode: "in_person",
      subtype: "ecos",
    });
    const qcmSurTable = validateNewModality({
      ...EMPTY_NEW_MODALITY_INPUT,
      name: "QCM sur table",
      mode: "in_person",
      subtype: "qcm",
    });
    expect(ecosAuLitDuMalade).toEqual([]);
    expect(qcmSurTable).toEqual([]);
  });

  /*
   * Le garde-fou du regroupement. `SUBTYPE_GROUPS_FR` commande ce que le
   * formulaire propose : un format ajouté au type mais oublié dans les
   * groupes serait acceptable en base et INTROUVABLE à l'écran.
   */
  it("range chaque sous-type dans exactement un groupe", () => {
    const connus = Object.keys(ASSESSMENT_SUBTYPE_LABELS_FR) as AssessmentSubtype[];
    const groupes = SUBTYPE_GROUPS_FR.flatMap((groupe) => groupe.subtypes);
    expect([...groupes].sort()).toEqual([...connus].sort());
    expect(new Set(groupes).size).toBe(groupes.length);
  });

  it("sépare épreuves passées et à venir", () => {
    const sessions: readonly AssessmentSession[] = [
      { id: "a", programId: "p", modalityId: "m", cohortId: "c", scheduledOn: "2027-01-01" },
      { id: "b", programId: "p", modalityId: "m", cohortId: "c", scheduledOn: "2027-05-01" },
    ];
    const { completed, upcoming } = splitSessions(sessions, new Date("2027-03-01T12:00:00"));
    expect(completed.map((s) => s.id)).toEqual(["a"]);
    expect(upcoming.map((s) => s.id)).toEqual(["b"]);
  });

  /*
   * Une épreuve est passée à la FIN de son jour : le matin de l'examen, elle
   * est encore « à venir ». Minuit aurait fait basculer l'ECOS de 9 h dans le
   * passé avant que l'étudiant se lève.
   */
  it("garde une épreuve à venir jusqu'à la fin de son jour", () => {
    const jourJ: AssessmentSession = {
      id: "j",
      programId: "p",
      modalityId: "m",
      cohortId: "c",
      scheduledOn: "2027-03-01",
    };
    expect(sessionState(jourJ, new Date("2027-03-01T08:00:00"))).toBe("upcoming");
    expect(sessionState(jourJ, new Date("2027-03-02T00:30:00"))).toBe("completed");
  });
});
