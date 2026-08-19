import { describe, expect, it } from "vitest";
import {
  activeModuleKeys,
  canOpenImplementation,
  implementationBlockingIssues,
  implementationOverview,
  implementedReferenceVersions,
  implementationsOfProgram,
  isHybrid,
  noModulesActive,
  orderedMilestones,
  validateImplementation,
  type DpcProgramImplementation,
} from "@/domain/dpcProgramImplementation";
import {
  dpcHvgImplementationELearning2027,
  dpcHvgImplementationJesfc2027,
  dpcHvgImplementationVisio2027,
  dpcHvgImplementations,
} from "@/infrastructure/mock/dpcImplementationFixtures";

const base: DpcProgramImplementation = {
  id: "impl-1",
  programDefinitionId: "def-1",
  programDefinitionVersion: "v1.0",
  name: "Implémentation test",
  cohortId: "coh-1",
  coordinatorId: "per-1",
  facilitatorIds: [],
  timeZone: "Europe/Paris",
  status: "draft",
  modules: noModulesActive(),
  sequences: [],
  schedule: { timeZone: "Europe/Paris", milestones: [] },
  completionRules: {},
  reminderDates: [],
};

const codes = (implementation: DpcProgramImplementation) =>
  validateImplementation(implementation).map((issue) => issue.code);

describe("modules facultatifs", () => {
  it("accepte une implémentation sans audit et sans QCM", () => {
    const noAudit: DpcProgramImplementation = {
      ...base,
      modules: { ...noModulesActive(), training: true, attestation: true },
      sequences: [
        {
          id: "s1",
          label: "Présentiel",
          modality: "in_person",
          order: 1,
          startsAt: "2027-01-10T09:00:00+01:00",
          endsAt: "2027-01-10T17:00:00+01:00",
          location: "Paris",
        },
      ],
      schedule: {
        timeZone: "Europe/Paris",
        milestones: [
          {
            id: "m1",
            kind: "training_sequence",
            label: "Présentiel",
            startsAt: "2027-01-10T09:00:00+01:00",
            endsAt: "2027-01-10T17:00:00+01:00",
          },
        ],
      },
    };
    expect(implementationBlockingIssues(noAudit)).toHaveLength(0);
    expect(activeModuleKeys(noAudit.modules)).toEqual(["training", "attestation"]);
  });

  it("avertit sans bloquer lorsqu'aucun module n'est activé", () => {
    expect(codes(base)).toContain("no_module_active");
    expect(implementationBlockingIssues(base)).toHaveLength(0);
  });

  it("refuse une échéance sans module correspondant", () => {
    const orphan: DpcProgramImplementation = {
      ...base,
      modules: { ...noModulesActive(), training: true },
      schedule: {
        timeZone: "Europe/Paris",
        milestones: [
          { id: "m1", kind: "audit_a1_open", label: "A1", startsAt: "2027-01-01T09:00:00+01:00" },
        ],
      },
    };
    expect(codes(orphan)).toContain("milestone_without_module");
  });

  it("refuse une séquence sans module Formation activé", () => {
    const orphan: DpcProgramImplementation = {
      ...base,
      sequences: [
        {
          id: "s1",
          label: "Présentiel",
          modality: "in_person",
          order: 1,
          startsAt: "2027-01-10T09:00:00+01:00",
          endsAt: "2027-01-10T17:00:00+01:00",
          location: "Paris",
        },
      ],
    };
    expect(codes(orphan)).toContain("sequence_without_training_module");
  });
});

describe("modalités", () => {
  const training = { ...noModulesActive(), training: true };

  it("valide le présentiel seul et exige un lieu", () => {
    const impl: DpcProgramImplementation = {
      ...base,
      modules: training,
      sequences: [
        {
          id: "s1",
          label: "Présentiel",
          modality: "in_person",
          order: 1,
          startsAt: "2027-01-10T09:00:00+01:00",
          endsAt: "2027-01-10T17:00:00+01:00",
        },
      ],
    };
    expect(codes(impl)).toContain("missing_location");
    expect(
      implementationBlockingIssues({
        ...impl,
        sequences: [{ ...impl.sequences[0]!, location: "Paris" }],
      }),
    ).toHaveLength(0);
  });

  it("valide la visioconférence seule et exige un fournisseur", () => {
    const impl: DpcProgramImplementation = {
      ...base,
      modules: training,
      sequences: [
        {
          id: "s1",
          label: "Visio",
          modality: "virtual_classroom",
          order: 1,
          startsAt: "2027-01-10T18:00:00+01:00",
          endsAt: "2027-01-10T20:00:00+01:00",
        },
      ],
    };
    expect(codes(impl)).toContain("missing_provider");
  });

  it("valide la e-formation seule et exige une fenêtre plus des ressources", () => {
    const impl: DpcProgramImplementation = {
      ...base,
      modules: training,
      sequences: [
        { id: "s1", label: "E-formation", modality: "e_learning", order: 1 },
      ],
    };
    expect(codes(impl)).toContain("missing_window");
    expect(codes(impl)).toContain("missing_required_resources");
  });

  it("reconnaît un parcours hybride", () => {
    expect(
      isHybrid([
        { id: "a", label: "a", modality: "in_person", order: 1 },
        { id: "b", label: "b", modality: "e_learning", order: 2 },
      ]),
    ).toBe(true);
    expect(isHybrid(dpcHvgImplementationELearning2027.sequences)).toBe(false);
  });
});

describe("chronologie", () => {
  const withTraining: DpcProgramImplementation = {
    ...base,
    modules: {
      ...noModulesActive(),
      training: true,
      post_test: true,
      practice_audit: true,
    },
    sequences: [
      {
        id: "s1",
        label: "Présentiel",
        modality: "in_person",
        order: 1,
        startsAt: "2027-01-10T09:00:00+01:00",
        endsAt: "2027-01-10T17:00:00+01:00",
        location: "Paris",
      },
    ],
  };

  it("refuse un post-test placé avant la formation", () => {
    const impl: DpcProgramImplementation = {
      ...withTraining,
      schedule: {
        timeZone: "Europe/Paris",
        milestones: [
          {
            id: "m1",
            kind: "post_test",
            label: "Post-test",
            startsAt: "2027-01-09T09:00:00+01:00",
          },
        ],
      },
    };
    expect(codes(impl)).toContain("post_test_before_training");
  });

  it("refuse un A2 ouvert avant la formation lorsqu'un avant/après est exigé", () => {
    const impl: DpcProgramImplementation = {
      ...withTraining,
      schedule: {
        timeZone: "Europe/Paris",
        requiresBeforeAfterAudit: true,
        milestones: [
          {
            id: "m1",
            kind: "audit_a2_open",
            label: "A2",
            startsAt: "2027-01-05T09:00:00+01:00",
          },
        ],
      },
    };
    expect(codes(impl)).toContain("a2_before_training");
  });

  it("refuse une fin antérieure au début", () => {
    expect(
      codes({
        ...base,
        startsOn: "2027-02-01T09:00:00+01:00",
        endsOn: "2027-01-01T09:00:00+01:00",
      }),
    ).toContain("end_before_start");
    expect(
      codes({
        ...base,
        modules: { ...noModulesActive(), pre_test: true },
        schedule: {
          timeZone: "Europe/Paris",
          milestones: [
            {
              id: "m1",
              kind: "pre_test",
              label: "Pré-test",
              startsAt: "2027-02-01T09:00:00+01:00",
              endsAt: "2027-01-01T09:00:00+01:00",
            },
          ],
        },
      }),
    ).toContain("milestone_end_before_start");
  });

  it("refuse un chevauchement lorsque les étapes sont exclusives", () => {
    const impl: DpcProgramImplementation = {
      ...base,
      modules: { ...noModulesActive(), practice_audit: true },
      schedule: {
        timeZone: "Europe/Paris",
        milestones: [
          {
            id: "m1",
            kind: "audit_a1_open",
            label: "A1",
            startsAt: "2027-01-01T09:00:00+01:00",
            endsAt: "2027-02-01T09:00:00+01:00",
            exclusive: true,
          },
          {
            id: "m2",
            kind: "audit_a2_open",
            label: "A2",
            startsAt: "2027-01-20T09:00:00+01:00",
            endsAt: "2027-03-01T09:00:00+01:00",
            exclusive: true,
          },
        ],
      },
    };
    expect(codes(impl)).toContain("forbidden_overlap");
  });

  it("exige un fuseau horaire", () => {
    expect(
      codes({ ...base, timeZone: "", schedule: { timeZone: "", milestones: [] } }),
    ).toContain("missing_time_zone");
  });

  it("refuse une clôture d'inscriptions antérieure à leur ouverture", () => {
    expect(
      codes({
        ...base,
        enrollmentOpensOn: "2027-01-10T09:00:00+01:00",
        enrollmentClosesOn: "2027-01-05T09:00:00+01:00",
      }),
    ).toContain("enrollment_close_before_open");
  });
});

describe("ouverture distincte de la publication", () => {
  it("exige le programme de référence publié ET une implémentation sans blocage", () => {
    expect(canOpenImplementation(dpcHvgImplementationJesfc2027, true)).toBe(true);
    expect(canOpenImplementation(dpcHvgImplementationJesfc2027, false)).toBe(false);
  });
});

describe("démonstrateur HVG–Amylose", () => {
  it("propose trois implémentations du même programme de référence", () => {
    expect(dpcHvgImplementations).toHaveLength(3);
    const grouped = implementationsOfProgram(
      dpcHvgImplementations,
      dpcHvgImplementationJesfc2027.programDefinitionId,
    );
    expect(grouped).toHaveLength(3);
    expect(
      implementedReferenceVersions(
        dpcHvgImplementations,
        dpcHvgImplementationJesfc2027.programDefinitionId,
      ),
    ).toEqual([dpcHvgImplementationJesfc2027.programDefinitionVersion]);
  });

  it("distingue les versions du programme de référence entre implémentations", () => {
    const versions = implementedReferenceVersions(
      [
        dpcHvgImplementationJesfc2027,
        { ...dpcHvgImplementationVisio2027, programDefinitionVersion: "v2.0" },
      ],
      dpcHvgImplementationJesfc2027.programDefinitionId,
    );
    expect(versions).toEqual(["v1.0", "v2.0"]);
  });

  it("expose un calendrier ordonné et exploitable pour chaque implémentation", () => {
    for (const implementation of dpcHvgImplementations) {
      expect(implementationBlockingIssues(implementation)).toHaveLength(0);
      const timeline = orderedMilestones(implementation.schedule);
      const starts = timeline.map((milestone) => Date.parse(milestone.startsAt));
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    }
  });

  it("résume les modules et modalités sans les imposer aux autres programmes", () => {
    const jesfc = implementationOverview(dpcHvgImplementationJesfc2027);
    expect(jesfc.modules).toContain("practice_audit");
    expect(jesfc.modalities).toEqual(["in_person"]);
    expect(implementationOverview(dpcHvgImplementationVisio2027).modules).not.toContain(
      "practice_audit",
    );
    expect(implementationOverview(dpcHvgImplementationELearning2027).modalities).toEqual([
      "e_learning",
    ]);
  });
});
