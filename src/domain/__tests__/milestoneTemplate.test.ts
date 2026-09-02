import { describe, expect, it } from "vitest";
import {
  describeApplyReport,
  describeMilestoneTemplateWriteError,
  milestoneTemplateApplyIssues,
  milestoneTemplateSaveIssues,
  templateLastWeek,
  type MilestoneTemplateItem,
} from "@/domain/milestoneTemplate";

function item(label: string, weekOffset: number, weekOffsetEnd?: number): MilestoneTemplateItem {
  return {
    label,
    weekOffset,
    ...(weekOffsetEnd === undefined ? {} : { weekOffsetEnd }),
    official: false,
    position: 0,
  };
}

const ITEMS = [item("Valvulopathies", 2), item("Insuffisance cardiaque", 5, 7)];
const THEMES = ["Valvulopathies", "Insuffisance cardiaque", "Péricardite"];

describe("la dernière semaine d'un modèle", () => {
  it("compte la FIN d'un jalon étalé, pas son début", () => {
    // « semaines 5 à 7 » va jusqu'en 7 : c'est 7 qu'il faut comparer à la fin
    // du stage, sinon un modèle qui déborde passerait le contrôle.
    expect(templateLastWeek(ITEMS)).toBe(7);
  });

  it("n'a pas de dernière semaine quand le modèle est vide", () => {
    expect(templateLastWeek([])).toBeUndefined();
  });
});

describe("relever un modèle sur une promotion", () => {
  it("accepte un nom neuf sur une promotion qui porte des jalons", () => {
    expect(
      milestoneTemplateSaveIssues({
        label: "DFASM cardio 11 semaines",
        milestoneCount: 29,
        existingLabels: ["Version courte"],
      }),
    ).toEqual([]);
  });

  it("refuse un nom vide", () => {
    expect(
      milestoneTemplateSaveIssues({ label: "   ", milestoneCount: 29, existingLabels: [] }),
    ).toEqual(["nom_manquant"]);
  });

  it("refuse un nom déjà pris, quelle que soit la casse", () => {
    // Deux modèles « DFASM cardio » et « DFASM Cardio » seraient indiscernables
    // dans une liste déroulante, et le mauvais serait choisi.
    expect(
      milestoneTemplateSaveIssues({
        label: " dfasm CARDIO ",
        milestoneCount: 29,
        existingLabels: ["DFASM cardio"],
      }),
    ).toEqual(["nom_deja_pris"]);
  });

  it("refuse de relever une promotion sans jalon", () => {
    // Un modèle vide ne se distinguerait pas d'un modèle qu'on a oublié de
    // remplir.
    expect(
      milestoneTemplateSaveIssues({ label: "Essai", milestoneCount: 0, existingLabels: [] }),
    ).toEqual(["promotion_sans_jalon"]);
  });
});

describe("poser un modèle sur une promotion", () => {
  it("laisse passer un modèle qui tient dans la promotion", () => {
    expect(
      milestoneTemplateApplyIssues({
        items: ITEMS,
        promotionLastWeek: 10,
        themeLabels: THEMES,
      }),
    ).toEqual([]);
  });

  it("refuse un modèle plus long que la promotion", () => {
    expect(
      milestoneTemplateApplyIssues({ items: ITEMS, promotionLastWeek: 6, themeLabels: THEMES }),
    ).toEqual(["modele_plus_long_que_la_promotion"]);
  });

  it("accepte un modèle qui finit exactement la dernière semaine", () => {
    // La dernière semaine du stage EST une semaine du stage : refuser ici
    // interdirait de poser un jalon de fin de parcours.
    expect(
      milestoneTemplateApplyIssues({ items: ITEMS, promotionLastWeek: 7, themeLabels: THEMES }),
    ).toEqual([]);
  });

  it("ne juge pas la durée quand elle est inconnue", () => {
    expect(milestoneTemplateApplyIssues({ items: ITEMS, themeLabels: THEMES })).toEqual([]);
  });

  it("refuse un modèle dont aucun chapitre n'existe ici", () => {
    // Tous les jalons seraient orphelins, et l'écran les afficherait comme
    // « à supprimer » : le contraire du service rendu.
    expect(
      milestoneTemplateApplyIssues({
        items: ITEMS,
        promotionLastWeek: 10,
        themeLabels: ["Anatomie", "Pharmacologie"],
      }),
    ).toEqual(["aucun_chapitre_reconnu"]);
  });

  it("laisse passer un modèle dont UN SEUL chapitre est reconnu", () => {
    // Partiel n'est pas vide : le rapport dira lesquels ont été ignorés.
    expect(
      milestoneTemplateApplyIssues({
        items: ITEMS,
        promotionLastWeek: 10,
        themeLabels: ["Valvulopathies"],
      }),
    ).toEqual([]);
  });

  it("signale un modèle vide, et rien d'autre", () => {
    expect(
      milestoneTemplateApplyIssues({ items: [], promotionLastWeek: 10, themeLabels: THEMES }),
    ).toEqual(["modele_vide"]);
  });
});

describe("le rapport de pose", () => {
  it("annonce ce qui a été posé", () => {
    expect(describeApplyReport({ posed: 11, skipped: 0, withoutChapter: [] })).toBe(
      "11 jalon(s) posés.",
    );
  });

  it("se met au conditionnel à blanc", () => {
    expect(
      describeApplyReport({ posed: 11, skipped: 0, withoutChapter: [] }, { dryRun: true }),
    ).toBe("11 jalon(s) seraient posés.");
  });

  it("NOMME les chapitres ignorés au lieu de les compter", () => {
    // « 2 chapitres ignorés » n'aide personne à comprendre pourquoi son modèle
    // est arrivé incomplet.
    expect(
      describeApplyReport({
        posed: 9,
        skipped: 2,
        withoutChapter: ["Péricardite", "Anatomie"],
      }),
    ).toBe(
      "9 jalon(s) posés. 2 chapitre(s) déjà daté(s), laissé(s) tel(s) quel(s). Absent(s) de ce programme, donc ignoré(s) : Péricardite, Anatomie.",
    );
  });

  it("dit clairement qu'il n'y avait rien à faire", () => {
    expect(describeApplyReport({ posed: 0, skipped: 7, withoutChapter: [] })).toBe(
      "Rien à poser : les 7 chapitre(s) du modèle portent déjà un jalon dans cette promotion.",
    );
  });
});

describe("les refus de la base", () => {
  it("traduit la contrainte d'unicité du nom", () => {
    expect(
      describeMilestoneTemplateWriteError(
        new Error(
          'duplicate key value violates unique constraint "milestone_templates_program_id_label_key"',
        ),
      ),
    ).toBe("Un modèle porte déjà ce nom dans ce programme.");
  });

  it("laisse passer tel quel un message déjà écrit pour un humain", () => {
    // Les fonctions SQL portent des chiffres que l'écran n'a pas : la semaine
    // exacte, le nombre de décalages d'apprenants. Les réécrire les perdrait.
    const message = "Ce modele va jusqu'a la semaine 11, cette promotion s'arrete a la semaine 8.";
    expect(describeMilestoneTemplateWriteError(new Error(message))).toBe(message);
  });
});
