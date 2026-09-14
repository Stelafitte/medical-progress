import { describe, expect, it } from "vitest";
import {
  ORDRE_DES_BLOCS,
  RESULTATS_PAR_BLOC,
  construireBlocs,
  correspond,
  motsDeLaRequete,
  totalDesBlocs,
  type EntreeRecherche,
} from "@/domain/rechercheTransverse";
import type { Outcome, OutcomeId } from "@/domain/types";
import type { PlanScheduleEntry } from "@/domain/acquisitionPlan";
import type { AssessmentModality } from "@/domain/assessmentModality";
import type { StageLog } from "@/domain/stageLog";
import type { LearnerMessage } from "@/domain/communication";
import type { ProgramSectionMatch } from "@/application/ports/repositories";

function outcome(id: string, nature: Outcome["nature"], label: string, description = ""): Outcome {
  return {
    id: id as OutcomeId,
    programId: "prg-1",
    curriculumVersionId: "cv-1",
    code: id.toUpperCase(),
    label,
    description,
    nature,
    domain: "Examen clinique cardiovasculaire",
    targetMastery: "proficient",
  } as Outcome;
}

function section(id: string, titre: string, contenu: string, total: number): ProgramSectionMatch {
  return {
    sectionId: id,
    resourceId: "res-1" as ProgramSectionMatch["resourceId"],
    resourceTitle: "Item 233 — Valvulopathies",
    chapitre: 233,
    numero: "I.E.1",
    titre,
    partie: undefined,
    rubrique: undefined,
    contenu,
    nCaracteres: contenu.length,
    rank: 0.5,
    totalMatches: total,
  };
}

const VIDE: EntreeRecherche = {
  requete: "",
  outcomes: [],
  /* Par défaut on teste le cas complet : un apprenant inscrit, six blocs. */
  estInscrit: true,
  jalons: [],
  modalites: [],
  carnets: [],
  messages: [],
  sections: [],
};

describe("appariement", () => {
  it("retient les abréviations de deux lettres, que le seuil à trois viderait", () => {
    // « FA », « IM », « RA », « IC » sont des requêtes d'étudiant en cardiologie.
    expect(motsDeLaRequete("FA")).toEqual(["fa"]);
    expect(motsDeLaRequete("l'IM et le RA")).toEqual(["im", "et", "le", "ra"]);
  });

  it("ignore un mot d'une seule lettre", () => {
    expect(motsDeLaRequete("a")).toEqual([]);
  });

  it("désaccentue des deux côtés — c'est ce qui manquait à « Mes ressources »", () => {
    expect(correspond(["Échocardiographie transthoracique"], motsDeLaRequete("echo"))).toBe(true);
    expect(correspond(["Echographie"], motsDeLaRequete("échographie"))).toBe(true);
  });

  it("exige TOUS les mots, et pas un seul d'entre eux", () => {
    const mots = motsDeLaRequete("insuffisance mitrale");
    expect(correspond(["Insuffisance mitrale chronique"], mots)).toBe(true);
    expect(correspond(["Insuffisance cardiaque aiguë"], mots)).toBe(false);
  });

  it("ne trouve rien sur une requête vide", () => {
    expect(correspond(["quoi que ce soit"], motsDeLaRequete("   "))).toBe(false);
  });
});

describe("construireBlocs", () => {
  it("ne rend aucun bloc sur une requête vide", () => {
    expect(construireBlocs(VIDE)).toEqual([]);
  });

  it("rend les six blocs, toujours dans le même ordre, même vides", () => {
    const blocs = construireBlocs({ ...VIDE, requete: "introuvable" });
    expect(blocs.map((b) => b.cle)).toEqual(ORDRE_DES_BLOCS);
    expect(totalDesBlocs(blocs)).toBe(0);
  });

  it("sépare une connaissance d'une compétence", () => {
    const blocs = construireBlocs({
      ...VIDE,
      requete: "souffle",
      outcomes: [
        outcome("k1", "knowledge", "Souffle systolique"),
        outcome("c1", "real_competence", "Ausculter un souffle"),
      ],
    });
    const parCle = new Map(blocs.map((b) => [b.cle, b] as const));
    expect(parCle.get("connaissances")?.total).toBe(1);
    expect(parCle.get("competences")?.total).toBe(1);
  });

  it("compte le texte des cours d'après le TOTAL SERVEUR, pas d'après les lignes reçues", () => {
    /*
     * La fonction serveur rend au plus `limit` lignes mais porte le compte
     * complet : compter les lignes afficherait « voir les 0 autres » sur un
     * corpus qui en contient cinquante.
     */
    const blocs = construireBlocs({
      ...VIDE,
      requete: "valvulopathie",
      sections: [
        section("s1", "Rétrécissement aortique", "La valvulopathie la plus fréquente.", 42),
      ],
    });
    expect(blocs[0]?.total).toBe(42);
    expect(blocs[0]?.resultats).toHaveLength(1);
  });

  it("coupe à trois résultats par bloc mais garde le total entier", () => {
    const outcomes = ["a", "b", "c", "d", "e"].map((s) =>
      outcome(`k-${s}`, "knowledge", `Souffle ${s}`),
    );
    const blocs = construireBlocs({ ...VIDE, requete: "souffle", outcomes });
    expect(blocs[0]?.total).toBe(5);
    expect(blocs[0]?.resultats).toHaveLength(RESULTATS_PAR_BLOC);
  });

  it("écarte une modalité d'évaluation NON retenue au parcours", () => {
    const base = {
      id: "m1",
      programId: "prg-1" as AssessmentModality["programId"],
      name: "QCM de mi-parcours",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      mode: "on_site",
      subtype: "qcm",
      usage: "validating",
      /*
       * `as unknown as` ET PAS UN `as` DIRECT : le vocabulaire des modalites
       * (`mode`, `subtype`) est en cours de revision dans un chantier voisin.
       * Fixer ici une valeur d enumeration ferait tomber ce test au moment ou
       * l autre chantier atterrira, pour une raison sans rapport avec la
       * recherche.
       */
    } as unknown as AssessmentModality;
    const horsParcours = construireBlocs({ ...VIDE, requete: "qcm", modalites: [base] });
    expect(horsParcours[2]?.total).toBe(0);

    const retenue = construireBlocs({
      ...VIDE,
      requete: "qcm",
      modalites: [{ ...base, retainedAt: "2026-09-02T00:00:00.000Z" }],
    });
    expect(retenue[2]?.total).toBe(1);
  });

  it("cherche dans le récit d'une journée de carnet", () => {
    const carnet = {
      id: "log-1",
      entries: [
        {
          id: "e1",
          occurredAt: "2026-09-10T00:00:00.000Z",
          narrative: "Patient adressé pour souffle systolique.",
          values: {},
        },
      ],
      validations: [],
    } as unknown as StageLog;
    const blocs = construireBlocs({ ...VIDE, requete: "souffle", carnets: [carnet] });
    expect(blocs[3]?.total).toBe(1);
    expect(blocs[3]?.resultats[0]?.extrait).toContain("souffle");
  });

  it("regroupe le calendrier par JALON et non par acquis", () => {
    const entree = (id: string): PlanScheduleEntry =>
      ({
        outcomeId: id as OutcomeId,
        milestoneId: "m1",
        milestoneLabel: "Valvulopathies",
        startsOn: "2026-09-28T00:00:00.000Z",
        dueOn: "2026-10-05T00:00:00.000Z",
        official: false,
      }) as PlanScheduleEntry;
    const blocs = construireBlocs({
      ...VIDE,
      requete: "valvulopathies",
      jalons: [entree("k1"), entree("k2"), entree("k3")],
    });
    // Trois acquis, UN jalon : sinon l'étudiant lirait trois fois la même ligne.
    expect(blocs[4]?.total).toBe(1);
    expect(blocs[4]?.resultats[0]?.contexte).toContain("3 acquis");
  });

  it("cherche dans le corps d'un message, pas seulement dans son objet", () => {
    const message = {
      deliveryId: "d1",
      subject: "Information de promotion",
      body: "L'attestation de stage sera disponible en novembre.",
      channel: "email",
      receivedAt: "2026-09-12T00:00:00.000Z",
      readAt: null,
    } as unknown as LearnerMessage;
    const blocs = construireBlocs({ ...VIDE, requete: "attestation", messages: [message] });
    expect(blocs[5]?.total).toBe(1);
  });

  it("emporte la requête vers les onglets qui savent se filtrer, et pas vers les autres", () => {
    /*
     * LE DÉFAUT DU 14/09 AU SOIR : « voir les 96 autres » ouvrait « Mes
     * ressources » sans aucun filtre, et l'étudiant y lisait les 314
     * connaissances du programme après en avoir vu annoncer quatre-vingt-seize.
     */
    const blocs = construireBlocs({ ...VIDE, requete: "souffle" });
    const parCle = new Map(blocs.map((b) => [b.cle, b] as const));
    expect(parCle.get("connaissances")?.lienOnglet.search).toEqual({ q: "souffle" });
    expect(parCle.get("competences")?.lienOnglet.search).toEqual({ q: "souffle" });
    // Ces trois écrans n'ont aucun filtre : un `q=` y serait ignoré en silence.
    expect(parCle.get("evaluations")?.lienOnglet.search).toBe(undefined);
    expect(parCle.get("stage")?.lienOnglet.search).toBe(undefined);
    expect(parCle.get("messages")?.lienOnglet.search).toBe(undefined);
  });

  it("sépare le reste ROUTABLE du reste qui n'a aucun écran d'accueil", () => {
    /*
     * Un acquis a un écran qui sait le retrouver ; un passage de cours n'en a
     * aucun. Les compter ensemble, c'est promettre une destination à ce qui
     * n'en a pas.
     */
    const blocs = construireBlocs({
      ...VIDE,
      requete: "mitral",
      outcomes: [outcome("k1", "knowledge", "Rétrécissement mitral")],
      sections: [section("s1", "Étiologies", "Une valve mitrale déformée.", 98)],
    });
    const connaissances = blocs[0];
    expect(connaissances?.total).toBe(99);
    // 1 acquis affiché, 1 passage affiché : rien de routable ne reste.
    expect(connaissances?.restantsRoutables).toBe(0);
    expect(connaissances?.restantsSurPlace).toBe(97);
  });

  it("le dépliement montre tous les passages chargés, sans toucher au total", () => {
    const sections = [1, 2, 3, 4, 5].map((n) =>
      section(`s${n}`, `Section ${n}`, "Passage sur la valve mitrale.", 98),
    );
    const replie = construireBlocs({ ...VIDE, requete: "mitrale", sections });
    const deplie = construireBlocs({
      ...VIDE,
      requete: "mitrale",
      sections,
      deplierConnaissances: true,
    });
    expect(replie[0]?.resultats).toHaveLength(RESULTATS_PAR_BLOC);
    expect(deplie[0]?.resultats).toHaveLength(5);
    expect(deplie[0]?.total).toBe(98);
    expect(deplie[0]?.restantsSurPlace).toBe(93);
  });

  it("un intitulé n'est jamais chassé de l'écran par des passages de cours", () => {
    const blocs = construireBlocs({
      ...VIDE,
      requete: "mitral",
      outcomes: [outcome("k1", "knowledge", "Rétrécissement mitral")],
      sections: [1, 2, 3, 4].map((n) => section(`s${n}`, `Section ${n}`, "Valve mitrale.", 40)),
    });
    expect(blocs[0]?.resultats[0]?.id).toBe("acquis-k1");
  });

  it("rend quatre blocs à un profil non inscrit, et jamais un carnet vide", () => {
    /*
     * L'outil est ouvert à tous les profils (Stef, 14/09), mais le carnet de
     * stage et le calendrier n'appartiennent qu'à un inscrit. Les afficher
     * vides à un encadrant lui ferait croire que sa recherche n'a rien trouvé
     * là où il n'y avait rien à chercher.
     */
    const blocs = construireBlocs({
      ...VIDE,
      estInscrit: false,
      requete: "souffle",
      outcomes: [outcome("k1", "knowledge", "Souffle systolique")],
    });
    expect(blocs.map((b) => b.cle)).toEqual([
      "connaissances",
      "competences",
      "evaluations",
      "messages",
    ]);
    expect(blocs[0]?.total).toBe(1);
  });

  it("garde les accents dans l'extrait rendu à l'étudiant", () => {
    /*
     * La recherche se fait sur du texte désaccentué, mais la DÉCOUPE porte sur
     * le texte d'origine : un extrait de cours de cardiologie sans accents
     * serait illisible.
     */
    const blocs = construireBlocs({
      ...VIDE,
      requete: "retrecissement",
      sections: [section("s1", "RA", "Le rétrécissement aortique serré du sujet âgé.", 1)],
    });
    expect(blocs[0]?.resultats[0]?.extrait).toContain("rétrécissement");
  });
});
