/**
 * LES DÉCOMPTES VUS CÔTÉ ADMINISTRATION (Stef, 23/09 : « regarde si les
 * décomptes vus côté admin sont les bons »).
 *
 * Quatre mensonges mesurés en base ce jour-là, et corrigés ici :
 *  1. « Stages » comptait les lignes DÉRIVÉES membres × encadrants (108 pour
 *     18 étudiants suivis par 6 encadrants) ;
 *  2. le Pilotage lisait `logsReceived` (validés ou transmis) pour mesurer
 *     l'ACTIVITÉ : une étudiante venait de déclarer 7 journées et l'écran la
 *     marquait « inactif », avec 0 journée ;
 *  3. « Apprenants rattachés » sommait les effectifs de tous les groupes du
 *     programme, doublons et autres promotions compris ;
 *  4. « Activées — première connexion effectuée » comptait les fiches dont le
 *     COMPTE existe (29), pas celles qui se sont connectées (11).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { etudiantsAffectes } from "@/features/administration/adminProgramViewModel";
import { buildLearnerActivityRows } from "@/features/administration/pilotSectionsViewModel";
import type { StageLog } from "@/domain/stageLog";
import type { Enrollment, Person } from "@/domain/types";

const read = (p: string) => readFileSync(p, "utf8");
const A = "src/features/administration/";

const enrollment = (id: string, personId: string): Enrollment =>
  ({ id, personId, programId: "p1", cohortId: "c1", status: "active" }) as unknown as Enrollment;
const person = (id: string, fullName: string): Person => ({ id, fullName }) as unknown as Person;
const log = (enrollmentId: string, status: StageLog["status"], entries: number): StageLog =>
  ({
    id: `${enrollmentId}-${status}`,
    enrollmentId,
    status,
    entries: Array.from({ length: entries }, (_, i) => ({ occurredAt: `2026-09-0${i + 1}` })),
    validations: [],
  }) as unknown as StageLog;

describe("un étudiant en stage compte une fois", () => {
  it("dédoublonne le croisement membres × encadrants", () => {
    const croisement = [
      { enrollmentId: "e1" },
      { enrollmentId: "e1" },
      { enrollmentId: "e1" },
      { enrollmentId: "e2" },
    ];
    expect(croisement.length).toBe(4);
    expect(etudiantsAffectes(croisement)).toBe(2);
  });

  it("rend 0 sans affectation", () => {
    expect(etudiantsAffectes([])).toBe(0);
  });

  it("est utilisé partout où un compteur parle d'étudiants", () => {
    expect(read(`${A}AdminDashboard.tsx`)).toContain("etudiantsAffectes(");
    expect(read(`${A}StageEnPlace.tsx`)).toContain("etudiantsAffectes(affectations)");
    expect(read(`${A}ConceptionRecap.tsx`)).toContain("etudiantsAffectes(affectationsDuTerrain)");
  });
});

describe("l'activité se lit sur le carnet ouvert", () => {
  it("compte les journées d'un carnet non encore validé", () => {
    const rows = buildLearnerActivityRows({
      enrollments: [enrollment("e1", "u1")],
      people: [person("u1", "Camille")],
      logs: [log("e1", "draft", 7)],
      alerts: [],
      expectedLogsPerLearner: 0,
    });
    expect(rows[0]?.entryCount).toBe(7);
    expect(rows[0]?.marker).not.toBe("idle");
  });

  it("le Pilotage part de tous les carnets de la promotion, pas des seuls reçus", () => {
    const pilote = read(`${A}AdminProgramPilot.tsx`);
    expect(pilote).toContain("const cohortLogs = data.stageLogs.filter");
    expect(pilote).not.toContain("const cohortLogs = data.logsReceived.filter");
  });
});

describe("les autres compteurs disent ce qu'ils comptent", () => {
  it("la vue d'ensemble annonce les carnets ouverts et les journées déclarées", () => {
    const dash = read(`${A}AdminDashboard.tsx`);
    expect(dash).toContain('label="Étudiants en stage"');
    expect(dash).toContain('label="Carnets de stage"');
    expect(dash).toContain("journée(s) déclarée(s)");
  });

  it("« Apprenants rattachés » ne compte que la promotion observée, une fois chacun", () => {
    const stages = read(`${A}AdminStages.tsx`);
    expect(stages).toContain("inscriptionsDeLaPromotion");
    expect(stages).not.toContain("total + group.memberEnrollmentIds.length");
  });

  it("« Inscriptions actives » écarte les inscriptions closes", () => {
    expect(read(`${A}AdminLearnerClasses.tsx`)).toContain(
      'data.enrollments.filter((e) => e.status === "active").length',
    );
  });

  it("le sas distingue le compte créé de la connexion réelle", () => {
    const gens = read(`${A}PeopleEnrollmentsView.tsx`);
    expect(gens).toContain("fetchProgramDirectory(activeProgram.id)");
    expect(gens).toContain('label="Connectées au moins une fois"');
    expect(gens).not.toContain('hint="première connexion effectuée"');
  });
});
