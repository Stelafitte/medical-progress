/**
 * « CE TABLEAU PERMET-IL DE VOIR CE QUE LES ÉTUDIANTS ONT RÉELLEMENT FAIT ? »
 * (Stef, 25/09, devant la matrice de suivi.)
 *
 * Trois réponses, trois corrections :
 *  1. la colonne « Évaluations » valait `score(0, 0)` EN DUR — elle affichait
 *     « non mesuré » quoi que fasse l'étudiant, et l'aurait affiché après
 *     cinquante QCM ;
 *  2. la colonne « Signaux » montrait 54, 55, parfois 126 alertes par
 *     étudiant, toutes le même motif répété une fois par acquis ;
 *  3. rien, nulle part, ne montrait les cours réellement ouverts — alors que
 *     la plateforme les enregistre depuis le 17/09.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLearnerTrackingRows } from "@/features/administration/learnerTrackingViewModel";
import type { LearnerCourseOpens, LearnerQuestionResults } from "@/application/ports/repositories";
import type { Enrollment, Person } from "@/domain/types";

const read = (p: string) => readFileSync(p, "utf8");
const A = "src/features/administration/";

const enrollment = (id: string, personId: string): Enrollment =>
  ({ id, personId, programId: "p1", cohortId: "c1", status: "active" }) as unknown as Enrollment;
const person = (id: string, fullName: string): Person => ({ id, fullName }) as unknown as Person;

const rows = (
  qcm?: ReadonlyMap<string, LearnerQuestionResults>,
  cours?: ReadonlyMap<string, LearnerCourseOpens>,
) =>
  buildLearnerTrackingRows({
    enrollments: [enrollment("e1", "u1")],
    people: [person("u1", "Camille")],
    outcomes: [],
    logs: [],
    expectedLogsPerLearner: 0,
    ...(qcm ? { qcmByEnrollment: qcm } : {}),
    ...(cours ? { courseOpensByEnrollment: cours } : {}),
  });

const resultat = (attempts: number, avgScore: number): LearnerQuestionResults => ({
  enrollmentId: "e1",
  personId: "u1",
  fullName: "Camille",
  attempts,
  distinctQuestions: attempts,
  avgScore,
});

describe("l'axe Évaluations lit les vraies réponses", () => {
  it("rend le score moyen, rapporté au nombre de réponses", () => {
    const [row] = rows(new Map([["e1", resultat(20, 0.6)]]));
    expect(row?.assessment).toEqual({ done: 12, total: 20, percent: 60 });
  });

  it("reste « non mesuré » sans aucune réponse, et ne pèse pas sur la moyenne", () => {
    const [sansRien] = rows(new Map([["e1", resultat(0, 0)]]));
    expect(sansRien?.assessment.total).toBe(0);
    expect(sansRien?.globalPercent).toBe(0);
  });

  it("n'invente rien quand la lecture n'a pas eu lieu", () => {
    const [row] = rows();
    expect(row?.assessment).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("n'est plus câblé en dur", () => {
    const vm = read(`${A}learnerTrackingViewModel.ts`);
    expect(vm).toContain("qcmByEnrollment");
    expect(vm).not.toContain("const assessment = score(0, 0);");
  });
});

describe("les cours réellement ouverts", () => {
  it("remonte les ouvertures et les cours distincts", () => {
    const [row] = rows(
      undefined,
      new Map([["e1", { enrollmentId: "e1", opens: 9, distinctCourses: 4 }]]),
    );
    expect(row?.courseOpens).toBe(9);
    expect(row?.distinctCourses).toBe(4);
  });

  it("vaut zéro, jamais undefined, quand la lecture est refusée ou vide", () => {
    const [row] = rows();
    expect(row?.courseOpens).toBe(0);
    expect(row?.distinctCourses).toBe(0);
  });

  it("a sa colonne dans le tableau de suivi, et une lecture en base", () => {
    expect(read(`${A}LearnerTrackingSection.tsx`)).toContain("Consulté");
    expect(read("src/infrastructure/supabase/supabaseDataAccess.ts")).toContain(
      'client.rpc("course_opens_by_learner"',
    );
  });
});

describe("un signal, pas cinquante-cinq", () => {
  const sql = read("supabase/migrations/20260925090000_signal_contre_bruit_et_cours_ouverts.sql");

  it("agrège les acquis sans trace en une ligne par inscription", () => {
    expect(sql).toContain("group by n.enrollment_id");
    expect(sql).toContain("acquis sans trace, jalon depasse");
    // L'identifiant d'alerte ne porte plus le nom de la compétence : une seule
    // ligne par inscription, donc une seule clé.
    expect(sql).not.toContain("|| ':' || n.competence");
  });

  it("laisse intactes les alertes qui appellent un geste", () => {
    for (const motif of ["late_validation:carnet:", "late_validation:competence:", "no_entry:"]) {
      expect(sql).toContain(motif);
    }
  });

  it("borne la nouvelle lecture à l'équipe du programme", () => {
    expect(sql).toContain("is_program_staff(v_program_id)");
    expect(sql).toContain("revoke all on function public.course_opens_by_learner(uuid)");
  });
});
