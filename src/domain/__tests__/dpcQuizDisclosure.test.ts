/**
 * Non-divulgation de la correction des tests DPC.
 * Invariant : avant validation d'une tentative, `correctKey` et `explanation`
 * sont ABSENTS du modèle de vue — pas seulement masqués à l'affichage.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isQuizAttemptFinalised,
  quizAttemptOf,
  quizPhaseView,
  type DpcTestAttempt,
} from "@/domain/dpc";
import { dpcHvgQuestions, dpcHvgTestAttempts } from "@/infrastructure/mock/dpcHvgFixtures";

const questions = dpcHvgQuestions;
const learner = dpcHvgTestAttempts[0]!.enrollmentId;
const other = dpcHvgTestAttempts.find((a) => a.enrollmentId !== learner)!.enrollmentId;

const noAttempts: readonly DpcTestAttempt[] = [];

describe("vue expurgée avant validation", () => {
  const view = quizPhaseView(questions, noAttempts, learner, "pre");

  it("n'expose ni correctKey ni explanation", () => {
    expect(view.submitted).toBe(false);
    for (const question of view.questions) {
      expect(question.revealed).toBe(false);
      expect(question.correctKey).toBeUndefined();
      expect(question.explanation).toBeUndefined();
      expect(question.isCorrect).toBeUndefined();
      expect(Object.keys(question)).not.toContain("correctKey");
      expect(Object.keys(question)).not.toContain("explanation");
    }
    expect(JSON.stringify(view)).not.toContain(questions[0]!.explanation);
  });

  it("garde les questions et toutes les options visibles", () => {
    expect(view.questions).toHaveLength(questions.length);
    for (const [index, question] of view.questions.entries()) {
      expect(question.prompt).toBe(questions[index]!.prompt);
      expect(question.options).toHaveLength(questions[index]!.options.length);
    }
  });

  it("autorise encore une validation", () => {
    expect(view.canSubmit).toBe(true);
    expect(view.scorePercent).toBeNull();
  });
});

describe("vue après validation", () => {
  const view = quizPhaseView(questions, dpcHvgTestAttempts, learner, "pre");

  it("révèle correction, explication et exactitude", () => {
    expect(view.submitted).toBe(true);
    for (const [index, question] of view.questions.entries()) {
      expect(question.revealed).toBe(true);
      expect(question.correctKey).toBe(questions[index]!.correctKey);
      expect(question.explanation).toBe(questions[index]!.explanation);
      expect(typeof question.isCorrect).toBe("boolean");
    }
    expect(view.scorePercent).not.toBeNull();
  });

  it("interdit une seconde validation", () => {
    expect(view.canSubmit).toBe(false);
  });
});

describe("séparation pré-test / post-test", () => {
  it("valider le pré-test ne révèle pas le post-test", () => {
    const preOnly = dpcHvgTestAttempts.filter(
      (a) => a.enrollmentId === learner && a.phase === "pre",
    );
    const pre = quizPhaseView(questions, preOnly, learner, "pre");
    const post = quizPhaseView(questions, preOnly, learner, "post");
    expect(pre.submitted).toBe(true);
    expect(post.submitted).toBe(false);
    expect(post.questions.every((q) => q.correctKey === undefined)).toBe(true);
    expect(post.questions.every((q) => q.explanation === undefined)).toBe(true);
  });
});

describe("cloisonnement par participant", () => {
  it("la tentative d'un autre participant ne déverrouille rien", () => {
    const foreign = dpcHvgTestAttempts.filter((a) => a.enrollmentId === other);
    expect(foreign.length).toBeGreaterThan(0);
    const view = quizPhaseView(questions, foreign, learner, "pre");
    expect(view.submitted).toBe(false);
    expect(view.questions.every((q) => q.correctKey === undefined)).toBe(true);
    expect(quizAttemptOf(foreign, learner, "pre")).toBeUndefined();
    expect(isQuizAttemptFinalised(questions, foreign, learner, "post")).toBe(false);
  });

  it("n'expose pas la réponse d'un autre participant", () => {
    const view = quizPhaseView(questions, dpcHvgTestAttempts, learner, "pre");
    const own = quizAttemptOf(dpcHvgTestAttempts, learner, "pre")!;
    for (const question of view.questions) {
      expect(question.givenKey).toBe(own.answers[question.id]);
    }
  });
});

describe("tentative incomplète", () => {
  it("ne révèle rien tant que toutes les questions ne sont pas répondues", () => {
    const partial: DpcTestAttempt = {
      testId: "dpc-hvg-test-pre",
      enrollmentId: learner,
      phase: "pre",
      answers: { [questions[0]!.id]: questions[0]!.options[0]!.key },
      takenAt: "2026-01-01T09:00:00.000Z",
    };
    const view = quizPhaseView(questions, [partial], learner, "pre");
    expect(view.submitted).toBe(false);
    expect(view.canSubmit).toBe(true);
    expect(view.questions.every((q) => q.explanation === undefined)).toBe(true);
    expect(view.questions[0]!.givenKey).toBe(partial.answers[questions[0]!.id]);
  });
});

describe("interface participant", () => {
  const source = readFileSync("src/features/dpc/DpcLearnerView.tsx", "utf8");

  it("ne lit jamais la correction directement sur la question source", () => {
    // Aucune itération sur les questions brutes (porteuses de correctKey) :
    // l'affichage passe exclusivement par le modèle de vue expurgé.
    expect(source).not.toMatch(/scope\.questions\.map/);
    expect(source).toContain("quizPhaseView");
    expect(source).toMatch(/question\.revealed/);
    expect(source).toMatch(/question\.revealed && question\.explanation/);
  });


  it("documente que l'expurgation devra être serveur dans le produit réel", () => {
    expect(source).toContain("côté serveur");
  });
});
