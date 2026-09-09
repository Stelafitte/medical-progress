import { describe, expect, it } from "vitest";
import {
  AI_FALLBACK_POLICIES,
  AI_FALLBACK_POLICY_COST_FR,
  AI_FALLBACK_POLICY_HINTS_FR,
  AI_FALLBACK_POLICY_LABELS_FR,
  defaultProgramAiSettings,
  describeLearnerAvailability,
  isSettingsInconsistent,
  type ProgramAiSettings,
} from "../programAi";

const ouvert: ProgramAiSettings = {
  programId: "prog-dfasm",
  enabled: true,
  monthlyCreditCap: 400,
  fallbackPolicy: "seuil",
  activeProvider: "openai",
};

describe("réglage de l'assistant IA", () => {
  /*
   * L'INVARIANT DU 03/09, TENU JUSQU'A L'ECRAN : un programme sans ligne de
   * reglage n'a pas d'IA. Si ce test tombe, c'est qu'un defaut « ouvert » s'est
   * glisse quelque part, et un programme se mettrait a repondre — et a couter —
   * sans que personne l'ait decide.
   */
  it("l'absence de réglage vaut refus, jamais autorisation", () => {
    const defaut = defaultProgramAiSettings("prog-neuf");
    expect(defaut.enabled).toBe(false);
    expect(defaut.activeProvider).toBeUndefined();
    expect(defaut.fallbackPolicy).toBe("seuil");
  });

  /*
   * LE PLAFOND A ZERO COUPE L'OUTIL SANS FERMER L'INTERRUPTEUR. C'est le
   * reglage qu'on pose un soir et qu'on ne s'explique plus le lendemain : la
   * phrase doit le dire, sinon l'ecran affiche « ouvert » pendant que les
   * etudiants recoivent des refus.
   */
  it("dit les trois états, y compris le plafond à zéro", () => {
    expect(describeLearnerAvailability({ ...ouvert, enabled: false })).toContain("n'apparaît pas");
    expect(describeLearnerAvailability({ ...ouvert, monthlyCreditCap: 0 })).toContain("refuse");
    expect(describeLearnerAvailability(ouvert)).toContain("400");
  });

  it("signale un assistant ouvert sans moteur", () => {
    expect(isSettingsInconsistent(ouvert)).toBe(false);
    expect(isSettingsInconsistent({ ...ouvert, activeProvider: undefined })).toBe(true);
    // Ferme sans moteur n'est pas une incoherence : c'est l'etat normal.
    expect(isSettingsInconsistent({ ...ouvert, enabled: false, activeProvider: undefined })).toBe(
      false,
    );
  });

  /*
   * LES ETIQUETTES SONT CELLES DE L'ENUM EN BASE. Une traduction en chemin
   * ferait echouer l'enregistrement avec un message postgres illisible ; le
   * test fige donc les valeurs, pas seulement leur nombre.
   */
  it("porte exactement les valeurs de l'enum, du moins cher au plus cher", () => {
    expect(AI_FALLBACK_POLICIES).toEqual(["seuil", "sections_seules", "chapitre"]);
  });

  /*
   * TOUTE POLITIQUE DOIT DIRE CE QU'ELLE COUTE. Ajouter une valeur a l'enum
   * sans expliquer sa facture rendrait le choix impossible a faire pour celui
   * qui paie — c'est-a-dire exactement le probleme que cet ecran corrige.
   */
  it("chaque politique dit ce que vit l'étudiant et ce qu'elle coûte", () => {
    for (const politique of AI_FALLBACK_POLICIES) {
      expect(AI_FALLBACK_POLICY_LABELS_FR[politique].length).toBeGreaterThan(0);
      expect(AI_FALLBACK_POLICY_HINTS_FR[politique].length).toBeGreaterThan(0);
      expect(AI_FALLBACK_POLICY_COST_FR[politique].length).toBeGreaterThan(0);
    }
  });
});
