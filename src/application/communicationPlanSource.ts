/**
 * Projection d'un calendrier d'implémentation vers le calendrier GÉNÉRIQUE
 * attendu par `src/domain/communicationPlan.ts`.
 *
 * Module PUR : aucune horloge, aucun réseau, aucune persistance. Le même
 * chemin sert DFASM, DIU, DPC et tout autre programme configuré : seul
 * l'adaptateur d'entrée diffère.
 */
import type {
  PlanActiveModules,
  PlanAudienceKind,
  PlanCalendar,
  PlanCalendarStep,
  PlanProgramKind,
  PlanStepKind,
} from "@/domain/communicationPlan";
import type { AudienceDefinition, MessageChannel, ScheduleTrigger } from "@/domain/communication";
import type {
  DpcProgramImplementation,
  DpcSequenceModality,
} from "@/domain/dpcProgramImplementation";
import { milestoneOf } from "@/domain/dpcProgramImplementation";
import type { IsoDateTime } from "@/domain/types";

const MODALITY_TO_STEP: Record<DpcSequenceModality, PlanStepKind> = {
  in_person: "in_person",
  virtual_classroom: "virtual_classroom",
  e_learning: "e_learning",
};

function optional<T extends object>(value: T): T {
  return value;
}

/** Adaptateur DPC : le démonstrateur HVG–Amylose passe par ici, sans cas particulier. */
export function calendarFromDpcImplementation(
  implementation: DpcProgramImplementation,
  input: {
    readonly programId: string;
    readonly programTitle: string;
    readonly programKind?: PlanProgramKind;
    readonly calendarVersion?: string;
  },
): PlanCalendar {
  const steps: PlanCalendarStep[] = [];
  const schedule = implementation.schedule;

  if (implementation.enrollmentOpensOn) {
    steps.push({
      id: `${implementation.id}-inscription`,
      kind: "enrollment",
      label: "Inscription",
      startsAt: implementation.enrollmentOpensOn,
      ...optional(
        implementation.enrollmentClosesOn ? { endsAt: implementation.enrollmentClosesOn } : {},
      ),
    });
  }

  const a1Open = milestoneOf(schedule, "audit_a1_open");
  const a1Close = milestoneOf(schedule, "audit_a1_close");
  if (a1Open) {
    steps.push({
      id: a1Open.id,
      kind: "audit_a1",
      label: a1Open.label,
      startsAt: a1Open.startsAt,
      ...optional(a1Close?.startsAt ? { endsAt: a1Close.endsAt ?? a1Close.startsAt } : {}),
    });
  }

  const preTest = milestoneOf(schedule, "pre_test");
  if (preTest)
    steps.push({
      id: preTest.id,
      kind: "pre_test",
      label: preTest.label,
      startsAt: preTest.startsAt,
      ...optional(preTest.endsAt ? { endsAt: preTest.endsAt } : {}),
    });

  for (const sequence of implementation.sequences) {
    const startsAt = sequence.startsAt ?? sequence.opensOn;
    if (!startsAt) continue;
    steps.push({
      id: sequence.id,
      kind: MODALITY_TO_STEP[sequence.modality],
      label: sequence.label,
      startsAt,
      ...optional(
        (sequence.endsAt ?? sequence.closesOn)
          ? { endsAt: (sequence.endsAt ?? sequence.closesOn)! }
          : {},
      ),
      ...optional(sequence.location ? { location: sequence.location } : {}),
      ...optional(sequence.joinUrl ? { joinUrl: sequence.joinUrl } : {}),
    });
  }

  const postTest = milestoneOf(schedule, "post_test");
  if (postTest)
    steps.push({
      id: postTest.id,
      kind: "post_test",
      label: postTest.label,
      startsAt: postTest.startsAt,
      ...optional(postTest.endsAt ? { endsAt: postTest.endsAt } : {}),
    });

  const a2Open = milestoneOf(schedule, "audit_a2_open");
  const a2Close = milestoneOf(schedule, "audit_a2_close");
  if (a2Open)
    steps.push({
      id: a2Open.id,
      kind: "audit_a2",
      label: a2Open.label,
      startsAt: a2Open.startsAt,
      ...optional(a2Close?.startsAt ? { endsAt: a2Close.endsAt ?? a2Close.startsAt } : {}),
    });

  const closing =
    milestoneOf(schedule, "attestation") ??
    milestoneOf(schedule, "improvement_plan") ??
    milestoneOf(schedule, "synthesis_release");
  if (closing)
    steps.push({
      id: closing.id,
      kind: "completion",
      label: closing.label,
      startsAt: closing.startsAt,
      ...optional(closing.endsAt ? { endsAt: closing.endsAt } : {}),
    });

  const kinds = new Set(steps.map((step) => step.kind));
  const auditActive = implementation.modules.practice_audit;
  const modules: PlanActiveModules = {
    enrollment: kinds.has("enrollment"),
    audit_a1: auditActive && kinds.has("audit_a1"),
    audit_a2: auditActive && kinds.has("audit_a2"),
    pre_test: implementation.modules.pre_test && kinds.has("pre_test"),
    post_test: implementation.modules.post_test && kinds.has("post_test"),
    in_person: implementation.modules.training && kinds.has("in_person"),
    virtual_classroom: implementation.modules.training && kinds.has("virtual_classroom"),
    e_learning: implementation.modules.training && kinds.has("e_learning"),
    completion:
      (implementation.modules.attestation || implementation.modules.improvement_plan) &&
      kinds.has("completion"),
  };

  return {
    implementationId: implementation.id,
    programId: input.programId,
    programKind: input.programKind ?? "dpc",
    programTitle: input.programTitle,
    calendarVersion: input.calendarVersion ?? `${implementation.programDefinitionVersion}-cal-1`,
    timeZone: implementation.timeZone,
    modules,
    steps,
  };
}

/**
 * Adaptateur générique (DFASM, DIU, other) : un calendrier déjà exprimé en
 * étapes datées. Aucun module n'est présupposé actif.
 */
export function calendarFromGenericSteps(input: {
  readonly implementationId: string;
  readonly programId: string;
  readonly programKind: PlanProgramKind;
  readonly programTitle: string;
  readonly calendarVersion: string;
  readonly timeZone: string;
  readonly steps: readonly PlanCalendarStep[];
  readonly modules?: PlanActiveModules;
}): PlanCalendar {
  const derived: PlanActiveModules =
    input.modules ?? Object.fromEntries(input.steps.map((step) => [step.kind, true]));
  return {
    implementationId: input.implementationId,
    programId: input.programId,
    programKind: input.programKind,
    programTitle: input.programTitle,
    calendarVersion: input.calendarVersion,
    timeZone: input.timeZone,
    modules: derived,
    steps: input.steps,
  };
}

/* ------------------------------------------------------------------ */
/* Passerelle vers l'écran Communications                              */
/* ------------------------------------------------------------------ */

/** Audience du plan → audience du domaine communications (périmètre programme). */
export function toAudienceDefinition(
  audience: PlanAudienceKind,
  milestoneRef: string,
): AudienceDefinition {
  switch (audience) {
    case "incomplete_participants":
      return { kind: "milestone_incomplete", milestoneId: milestoneRef };
    case "facilitators":
      return { kind: "contextual_role", role: "teacher" };
    case "submitted_participants":
    case "all_participants":
      return { kind: "program_all" };
  }
}

/** Déclencheur simulé : une date fixe dans le fuseau du calendrier. */
export function toScheduleTrigger(
  scheduledAt: IsoDateTime | undefined,
  timeZone: string,
): ScheduleTrigger {
  return scheduledAt ? { kind: "at", at: scheduledAt, timeZone } : { kind: "immediate" };
}

export const PLAN_DEFAULT_CHANNEL: MessageChannel = "email";

/* ------------------------------------------------------------------ */
/* Adaptateur des créneaux de l'assistant d'implémentation             */
/* ------------------------------------------------------------------ */

/**
 * Projection des créneaux `DpcScheduledSlot` de l'assistant vers le calendrier
 * générique. Le premier tour d'audit alimente A1, les suivants A2.
 */
export function calendarFromScheduledSlots(input: {
  readonly implementationId: string;
  readonly programId: string;
  readonly programKind: PlanProgramKind;
  readonly programTitle: string;
  readonly calendarVersion: string;
  readonly timeZone: string;
  readonly slots: readonly SlotLike[];
}): PlanCalendar {
  const auditRounds = input.slots
    .filter((slot) => slot.kind === "audit_round")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const steps: PlanCalendarStep[] = [];

  for (const slot of input.slots) {
    const startsAt = slot.startsAt ?? slot.opensOn;
    if (!startsAt) continue;
    const endsAt = slot.endsAt ?? slot.closesOn;
    const kind: PlanStepKind | undefined =
      slot.kind === "audit_round"
        ? auditRounds.indexOf(slot) === 0
          ? "audit_a1"
          : "audit_a2"
        : slot.kind === "pre_test"
          ? "pre_test"
          : slot.kind === "post_test"
            ? "post_test"
            : slot.kind === "training_session"
              ? MODALITY_TO_STEP[slot.delivery ?? "e_learning"]
              : "completion";
    steps.push({
      id: slot.id,
      kind,
      label: slot.label,
      startsAt,
      ...optional(endsAt ? { endsAt } : {}),
      ...optional(slot.location ? { location: slot.location } : {}),
    });
  }

  return calendarFromGenericSteps({ ...input, steps });
}

export interface SlotLike {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly delivery?: DpcSequenceModality;
  readonly startsAt?: IsoDateTime;
  readonly endsAt?: IsoDateTime;
  readonly opensOn?: IsoDateTime;
  readonly closesOn?: IsoDateTime;
  readonly location?: string;
  readonly order?: number;
}
