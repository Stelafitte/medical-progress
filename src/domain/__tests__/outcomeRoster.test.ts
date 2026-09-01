import { describe, expect, it } from "vitest";

import {
  buildOutcomeRosterPreview,
  detectOutcomeMapping,
  generateCode,
  parseLevel,
  parseNature,
  parseKnowledgeRank,
} from "@/domain/outcomeRoster";

/** Le format réel de la table `competencies` de myDFASM. */
const MYDFASM = [
  "theme;theme_label;order_in_theme;label;level",
  "1;Relationnel avec l'équipe soignante;1;Se présenter à l'équipe médicale et paramédicale dès l'arrivée;base",
  "1;Relationnel avec l'équipe soignante;2;Intégrer la hiérarchie médicale;base",
  "1;Relationnel avec l'équipe soignante;3;Participer activement à la transmission quotidienne;avance",
  "2;Relationnel avec le patient et sa famille;1;Se présenter au patient et expliquer son rôle;base",
  "2;Relationnel avec le patient et sa famille;2;Annoncer un diagnostic grave avec supervision;expert",
].join("\n");

describe("lecture d'un référentiel d'acquis", () => {
  it("reconnaît les en-têtes du référentiel réel", () => {
    const mapping = detectOutcomeMapping([
      "theme",
      "theme_label",
      "order_in_theme",
      "label",
      "level",
    ]);
    expect(mapping).toMatchObject({ theme: 0, themeLabel: 1, order: 2, label: 3, level: 4 });
  });

  it("regroupe par thème dans l'ordre d'apparition, pas alphabétique", () => {
    const preview = buildOutcomeRosterPreview({ text: MYDFASM });
    expect(preview.themes.map((t) => t.label)).toEqual([
      "Relationnel avec l'équipe soignante",
      "Relationnel avec le patient et sa famille",
    ]);
    expect(preview.themes[0]!.position).toBe(1);
    expect(preview.themes[0]!.outcomes).toHaveLength(3);
    expect(preview.themes[1]!.outcomes).toHaveLength(2);
    expect(preview.readyCount).toBe(5);
  });

  it("préfère le libellé au numéro quand les deux colonnes existent", () => {
    const preview = buildOutcomeRosterPreview({ text: MYDFASM });
    expect(preview.themes[0]!.key).toBe("1");
    expect(preview.themes[0]!.label).toBe("Relationnel avec l'équipe soignante");
  });

  it("traduit les niveaux du référentiel vers l'échelle du socle", () => {
    const preview = buildOutcomeRosterPreview({ text: MYDFASM });
    expect(preview.candidates[0]!.targetMastery).toBe("intermediate"); // base
    expect(preview.candidates[2]!.targetMastery).toBe("proficient"); // avance
    expect(preview.candidates[4]!.targetMastery).toBe("autonomous"); // expert
  });

  it("engendre un code lisible quand la source n'en porte pas, et le signale", () => {
    const preview = buildOutcomeRosterPreview({ text: MYDFASM });
    expect(preview.candidates.map((c) => c.code)).toEqual([
      "T1-01",
      "T1-02",
      "T1-03",
      "T2-01",
      "T2-02",
    ]);
    expect(preview.generatedCodeCount).toBe(5);
    expect(preview.candidates[0]!.codeGenerated).toBe(true);
  });

  it("garde le code de la source quand il y en a un", () => {
    const preview = buildOutcomeRosterPreview({
      text: ["code;label;theme", "ECG-01;Lire un ECG;5"].join("\n"),
    });
    expect(preview.candidates[0]!.code).toBe("ECG-01");
    expect(preview.generatedCodeCount).toBe(0);
  });
});

describe("nature et niveau : déduits, mais jamais en silence", () => {
  it("retient la nature par défaut et la compte", () => {
    const preview = buildOutcomeRosterPreview({ text: MYDFASM });
    expect(preview.candidates.every((c) => c.nature === "real_competence")).toBe(true);
    expect(preview.natureAssumedCount).toBe(5);
  });

  it("respecte une colonne nature quand elle existe, en français", () => {
    const preview = buildOutcomeRosterPreview({
      text: [
        "label;nature",
        "Définition de l'athérome;connaissance",
        "Réaliser un ECG;compétence",
        "Défibrillation sur mannequin;compétence simulée",
      ].join("\n"),
    });
    expect(preview.candidates.map((c) => c.nature)).toEqual([
      "knowledge",
      "real_competence",
      "simulated_competence",
    ]);
    expect(preview.natureAssumedCount).toBe(0);
  });

  it("avertit sur une nature illisible au lieu de l'ignorer", () => {
    const preview = buildOutcomeRosterPreview({
      text: ["label;nature", "Un acquis;chose bizarre"].join("\n"),
      defaultNature: "knowledge",
    });
    expect(preview.candidates[0]!.nature).toBe("knowledge");
    expect(preview.issues.some((i) => i.message.includes("non reconnue"))).toBe(true);
  });

  it("accepte aussi l'échelle du socle écrite telle quelle", () => {
    expect(parseLevel("proficient")).toBe("proficient");
    expect(parseLevel("Découverte")).toBe("novice");
    expect(parseLevel("n'importe quoi")).toBeUndefined();
    expect(parseNature("savoir-faire")).toBe("real_competence");
  });
});

describe("rang R2C des connaissances", () => {
  // Le piege historique : « rang » etait un alias d'`order`. Dans un
  // referentiel medical, une colonne « Rang » porte A / B / C, pas un numero.
  it("lit une colonne « Rang » comme un rang R2C, et NON comme un ordre", () => {
    const preview = buildOutcomeRosterPreview({
      text: [
        "Rang;Intitulé;Nature",
        "A;Connaître la définition de la FA;Connaissance",
        "B;Connaître la physiopathologie de la FA;Connaissance",
      ].join("\n"),
    });
    expect(preview.mapping.rank).toBe(0);
    expect(preview.mapping.order).toBeUndefined();
    expect(preview.candidates[0]?.knowledgeRank).toBe("A");
    expect(preview.candidates[1]?.knowledgeRank).toBe("B");
    // L'ordre retombe sur le rang d'apparition, ce qui est le comportement
    // voulu : la source n'a pas de colonne d'ordre.
    expect(preview.candidates[0]?.order).toBe(1);
    expect(preview.candidates[1]?.order).toBe(2);
    expect(preview.rankedCount).toBe(2);
    expect(preview.readyCount).toBe(2);
  });

  it("accepte « A » comme « rang B », refuse le reste sans deviner", () => {
    expect(parseKnowledgeRank("A")).toBe("A");
    expect(parseKnowledgeRank("  rang b ")).toBe("B");
    expect(parseKnowledgeRank("Rang C")).toBe("C");
    expect(parseKnowledgeRank("D")).toBeUndefined();
    expect(parseKnowledgeRank("A/B")).toBeUndefined();
    expect(parseKnowledgeRank("1")).toBeUndefined();
  });

  it("refuse la ligne quand le rang est illisible, au lieu de l'avaler", () => {
    const preview = buildOutcomeRosterPreview({
      text: ["Rang;Intitulé;Nature", "A/B;Un acquis douteux;Connaissance"].join("\n"),
    });
    expect(preview.invalidCount).toBe(1);
    expect(preview.candidates[0]?.issues[0]?.message).toContain("attendu A, B ou C");
  });

  it("refuse un rang posé sur une compétence : la base le refuserait aussi", () => {
    // `check (knowledge_rank is null or nature = 'knowledge')`. Laisser passer
    // ces lignes ferait echouer les insertions une par une, sans que l'ecran
    // l'ait annonce.
    const preview = buildOutcomeRosterPreview({
      text: ["Rang;Intitulé;Nature", "A;Ausculter un souffle;Compétence"].join("\n"),
    });
    expect(preview.invalidCount).toBe(1);
    expect(preview.candidates[0]?.issues[0]?.message).toContain(
      "ne s'applique qu'aux connaissances",
    );
  });
});

describe("doublons et lignes refusées", () => {
  it("ignore une ligne dont le code est déjà dans le programme", () => {
    const preview = buildOutcomeRosterPreview({
      text: ["code;label", "ECG-01;Lire un ECG", "ECG-02;Poser une VVP"].join("\n"),
      existingCodes: ["ecg-01"],
    });
    expect(preview.alreadyPresentCount).toBe(1);
    expect(preview.readyCount).toBe(1);
  });

  it("distingue un code pris par un ARCHIVÉ d'un code porté par un acquis actif", () => {
    // Le piège que ces deux cas existent pour séparer : `unique (program_id,
    // code)` ne distingue pas l'archivé de l'actif, mais l'utilisateur, si.
    //  * un code porté par un acquis ACTIF est révisable — c'est le cas normal
    //    quand on rejoue un référentiel révisé ;
    //  * un code pris par un acquis ARCHIVÉ n'est ni créable ni révisable, et
    //    l'écran doit le DIRE plutôt que d'annoncer « à créer » des lignes que
    //    la base refusera une par une.
    // L'appelant passe donc les codes PRIS (listTakenOutcomeCodes) ET les
    // acquis actifs ; ce qui est dans le premier sans être dans le second est
    // forcément archivé.
    const archive = buildOutcomeRosterPreview({
      text: ["code;label", "ECG-01;Lire un ECG"].join("\n"),
      existingCodes: ["ECG-01"],
    });
    expect(archive.readyCount).toBe(0);
    expect(archive.candidates[0]?.status).toBe("already_present");
    expect(archive.candidates[0]?.issues[0]?.message).toMatch(/archiv/i);

    const actif = buildOutcomeRosterPreview({
      text: ["code;label;nature", "ECG-01;Lire un ECG autrement;Compétence"].join("\n"),
      existingCodes: ["ECG-01"],
      existingOutcomes: [
        {
          id: "o-1",
          code: "ECG-01",
          label: "Lire un ECG",
          description: "",
          nature: "real_competence",
          targetMastery: "proficient",
        },
      ],
    });
    expect(actif.candidates[0]?.status).toBe("to_update");
    expect(actif.toUpdateCount).toBe(1);
    expect(actif.canImport).toBe(true);
  });

  it("repère un code répété dans le fichier lui-même", () => {
    const preview = buildOutcomeRosterPreview({
      text: ["code;label", "A-01;Un acquis", "A-01;Le même code"].join("\n"),
    });
    expect(preview.duplicateCount).toBe(1);
    expect(preview.readyCount).toBe(1);
  });

  it("refuse une ligne sans intitulé, et l'import sans colonne intitulé", () => {
    const sansLabel = buildOutcomeRosterPreview({
      text: ["theme;niveau", "1;base"].join("\n"),
    });
    expect(sansLabel.missingRequiredColumns).toContain("label");
    expect(sansLabel.canImport).toBe(false);

    const ligneVide = buildOutcomeRosterPreview({
      text: ["label;theme", ";1", "Un vrai acquis;1"].join("\n"),
    });
    expect(ligneVide.invalidCount).toBe(1);
    expect(ligneVide.readyCount).toBe(1);
  });
});

describe("le tableau arrive comme il veut", () => {
  it("retrouve l'en-tête sous un titre et une ligne de service", () => {
    const preview = buildOutcomeRosterPreview({
      text: [
        "Référentiel de compétences - DFASM Cardiologie",
        "Export du 31/08/2026",
        "theme;theme_label;label;level",
        "1;Relationnel;Se présenter à l'équipe;base",
      ].join("\n"),
    });
    expect(preview.headerLine).toBe(3);
    expect(preview.readyCount).toBe(1);
  });

  it("numérote dans le thème quand la source ne donne pas d'ordre", () => {
    const preview = buildOutcomeRosterPreview({
      text: ["theme;label", "1;Premier", "1;Deuxième", "2;Autre thème premier"].join("\n"),
    });
    expect(preview.candidates.map((c) => c.code)).toEqual(["T1-01", "T1-02", "T2-01"]);
  });

  it("fabrique un code stable et lisible", () => {
    expect(generateCode(3, 7)).toBe("T3-07");
    expect(generateCode(12, 11)).toBe("T12-11");
  });
});
