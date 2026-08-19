import { describe, expect, it } from "vitest";
import {
  aggregateCampaign,
  attendanceRate,
  auditRequiresHumanValidation,
  comparePrePost,
  isItemConform,
  itemConformity,
  scoreSubmission,
  testProgress,
} from "@/domain/clinicalAudit";
import {
  auditCampaigns,
  auditSubmissions,
  auditTemplates,
  dpcProgram,
  prePostTestResults,
  teachingSessions,
} from "@/infrastructure/mock/dpcFixtures";
import { learnerNavFor } from "@/components/layout/navigation";

const template = auditTemplates[0]!;
const preCampaign = auditCampaigns.find((c) => c.phase === "pre")!;
const postCampaign = auditCampaigns.find((c) => c.phase === "post")!;

describe("programme DPC — configuration optionnelle", () => {
  it("active les modules audits, tests et séances sans stage ni simulation", () => {
    expect(dpcProgram.kind).toBe("dpc");
    expect(dpcProgram.config.placementsEnabled).toBe(false);
    expect(dpcProgram.config.simulationEnabled).toBe(false);
    expect(dpcProgram.config.auditsEnabled).toBe(true);
    expect(dpcProgram.config.prePostTestsEnabled).toBe(true);
    expect(dpcProgram.config.sessionsEnabled).toBe(true);
  });

  it("masque Stage et affiche Audits dans la navigation apprenant", () => {
    const nav = learnerNavFor(dpcProgram.config);
    expect(nav.some((e) => e.to === "/espace/stage")).toBe(false);
    expect(nav.some((e) => e.to === "/espace/audits")).toBe(true);
  });

  it("laisse la navigation inchangée pour un programme sans audits", () => {
    const nav = learnerNavFor({ placementsEnabled: true });
    expect(nav.some((e) => e.to === "/espace/stage")).toBe(true);
    expect(nav.some((e) => e.to === "/espace/audits")).toBe(false);
  });
});

describe("conformité des items", () => {
  it("compare booléens, choix et échelles au seuil attendu", () => {
    expect(isItemConform(template.items[0]!, true)).toBe(true);
    expect(isItemConform(template.items[0]!, false)).toBe(false);
    expect(isItemConform(template.items[2]!, "conforme")).toBe(true);
    expect(isItemConform(template.items[2]!, "non_conforme")).toBe(false);
    expect(isItemConform(template.items[4]!, 3)).toBe(true);
    expect(isItemConform(template.items[4]!, 2)).toBe(false);
  });

  it("traite une réponse absente comme non conforme", () => {
    expect(isItemConform(template.items[0]!, undefined)).toBe(false);
  });
});

describe("audit avant / après", () => {
  const pre = auditSubmissions.find((s) => s.id === "aud-sub-pre-1")!;
  const post = auditSubmissions.find((s) => s.id === "aud-sub-post-2")!;

  it("mesure une progression positive après formation", () => {
    const preScore = scoreSubmission(template, pre);
    const postScore = scoreSubmission(template, post);
    expect(postScore.conformityPercent).toBeGreaterThan(preScore.conformityPercent);
  });

  it("ne conclut pas tant que le post-audit n'est pas transmis", () => {
    const inProgress = auditSubmissions.find((s) => s.id === "aud-sub-post-1")!;
    const comparison = comparePrePost(template, pre, inProgress);
    expect(comparison.pending).toBe(true);
    expect(comparison.postPercent).toBeNull();
    expect(comparison.deltaPoints).toBeNull();
  });

  it("agrège la participation par campagne sans nominatif", () => {
    const agg = aggregateCampaign(template, preCampaign, auditSubmissions, 3);
    expect(agg.submitted).toBe(3);
    expect(agg.participationPercent).toBe(100);
    expect(Object.keys(agg)).not.toContain("enrollmentId");

    const postAgg = aggregateCampaign(template, postCampaign, auditSubmissions, 3);
    expect(postAgg.inProgress).toBe(1);
    expect(postAgg.meanConformityPercent).toBeGreaterThan(agg.meanConformityPercent);
  });

  it("expose la conformité item par item", () => {
    const rows = itemConformity(template, auditSubmissions);
    expect(rows).toHaveLength(template.items.length);
    expect(rows.every((r) => r.conformityPercent >= 0 && r.conformityPercent <= 100)).toBe(true);
  });
});

describe("pré/post-tests et séances", () => {
  it("calcule le delta de connaissances", () => {
    const progress = testProgress(prePostTestResults, "enr-dpc");
    expect(progress.prePercent).toBe(55);
    expect(progress.postPercent).toBe(85);
    expect(progress.deltaPoints).toBe(30);
  });

  it("reste en attente sans post-test", () => {
    expect(testProgress(prePostTestResults, "enr-dpc-3").pending).toBe(true);
  });

  it("calcule un taux de présence par séance", () => {
    expect(attendanceRate(teachingSessions[0]!)).toBe(100);
    expect(attendanceRate(teachingSessions[1]!)).toBe(67);
  });
});

it("un audit n'accorde jamais seul une compétence réelle", () => {
  expect(auditRequiresHumanValidation()).toBe(true);
});
