/**
 * IMPLÉMENTATION d'un DPC — composants optionnels et calendrier précis.
 *
 * On n'« implémente » pas un programme DPC en cochant un modèle figé : le
 * coordinateur décide QUELS composants existent, puis QUAND chacun a lieu.
 *
 * Invariants du modèle :
 *  - TOUT composant est optionnel : un DPC peut n'avoir aucun audit de
 *    pratiques, aucun test de connaissances, aucune séance de formation, ou
 *    seulement l'un d'eux ;
 *  - un audit avant / après n'est pas imposé : zéro, un ou plusieurs tours ;
 *  - la formation peut être en présentiel (date et heure précises, lieu), en
 *    visioconférence (date et heure précises, lien de connexion) ou en
 *    e-formation (fenêtre de consultation en ligne de documents) ;
 *  - une séance à date précise exige un début ET une fin datés ; une activité
 *    en ligne exige une fenêtre d'ouverture ET de fermeture ;
 *  - la chronologie méthodologique est CONTRÔLÉE, jamais devinée : test amont
 *    avant la formation, test aval après la formation, tours d'audit dans
 *    l'ordre déclaré ;
 *  - aucune valeur n'est codée en dur (ni J-30, ni J+90, ni deux tours).
 *
 * Module PUR : aucun I/O, aucune IA, aucune date « maintenant » implicite.
 */
import type { IsoDateTime } from "./types";

/* ------------------------------------------------------------------ */
/* 1. Composants et modalités                                          */
/* ------------------------------------------------------------------ */

/** Nature d'un composant programmable. Aucun n'est obligatoire. */
export type DpcComponentKind =
  | "audit_round"
  | "pre_test"
  | "post_test"
  | "training_session"
  | "other_activity";

export const DPC_COMPONENT_KIND_LABELS_FR: Record<DpcComponentKind, string> = {
  audit_round: "Tour d'audit de pratiques",
  pre_test: "Test de connaissances amont",
  post_test: "Test de connaissances aval",
  training_session: "Séquence de formation",
  other_activity: "Autre activité programmée",
};

/** Modalité de délivrance d'une séquence de formation. */
export type DpcTrainingDelivery = "in_person" | "virtual_classroom" | "e_learning";

export const DPC_TRAINING_DELIVERY_LABELS_FR: Record<DpcTrainingDelivery, string> = {
  in_person: "Présentiel (date et heure précises)",
  virtual_classroom: "Visioconférence (date et heure précises)",
  e_learning: "E-formation (documents à consulter en ligne)",
};

/** Deux façons de placer un composant dans le calendrier. */
export type DpcSlotTiming = "fixed_datetime" | "open_window";

export const DPC_SLOT_TIMING_LABELS_FR: Record<DpcSlotTiming, string> = {
  fixed_datetime: "Séance à date et heure précises",
  open_window: "Fenêtre d'ouverture et de fermeture",
};

/**
 * Placement attendu d'un composant : une séance synchrone se tient à une date
 * précise, une activité asynchrone s'ouvre sur une fenêtre.
 */
export function expectedTiming(
  kind: DpcComponentKind,
  delivery?: DpcTrainingDelivery,
): DpcSlotTiming {
  if (kind === "training_session")
    return delivery === "in_person" || delivery === "virtual_classroom"
      ? "fixed_datetime"
      : "open_window";
  return "open_window";
}

/* ------------------------------------------------------------------ */
/* 2. Créneau programmé                                                */
/* ------------------------------------------------------------------ */

export interface DpcScheduledSlot {
  readonly id: string;
  readonly label: string;
  readonly kind: DpcComponentKind;
  /** Uniquement pour une séquence de formation. */
  readonly delivery?: DpcTrainingDelivery;
  /** Séance synchrone : début et fin datés. */
  readonly startsAt?: IsoDateTime;
  readonly endsAt?: IsoDateTime;
  /** Activité asynchrone : fenêtre d'ouverture et de fermeture. */
  readonly opensOn?: IsoDateTime;
  readonly closesOn?: IsoDateTime;
  /** Lieu de la séance en présentiel. */
  readonly location?: string;
  /** Modalité de connexion d'une visioconférence (jamais un secret). */
  readonly joinInstructions?: string;
  /** Documents à consulter en ligne pour une e-formation. */
  readonly resourceIds?: readonly string[];
  /** Émargement ou preuve de participation attendue. */
  readonly attendanceRequired: boolean;
  /** Tour d'audit correspondant dans la configuration d'audit, si applicable. */
  readonly roundId?: string;
  /** Ordre déclaré entre composants de même nature (tours d'audit notamment). */
  readonly order?: number;
  readonly note?: string;
}

export interface DpcImplementationPlan {
  readonly id: string;
  readonly label: string;
  /** Fuseau de référence affiché au coordinateur et aux apprenants. */
  readonly timeZone: string;
  readonly slots: readonly DpcScheduledSlot[];
}

export function emptyImplementationPlan(
  id: string,
  label: string,
  timeZone = "Europe/Paris",
): DpcImplementationPlan {
  return { id, label, timeZone, slots: [] };
}

/* ------------------------------------------------------------------ */
/* 3. Lecture du plan                                                  */
/* ------------------------------------------------------------------ */

export function slotsOfKind(
  plan: DpcImplementationPlan,
  kind: DpcComponentKind,
): readonly DpcScheduledSlot[] {
  return plan.slots.filter((slot) => slot.kind === kind);
}

export function hasComponent(plan: DpcImplementationPlan, kind: DpcComponentKind): boolean {
  return plan.slots.some((slot) => slot.kind === kind);
}

/** Composants effectivement programmés, sans présupposer lesquels existent. */
export function activeComponentKinds(
  plan: DpcImplementationPlan,
): readonly DpcComponentKind[] {
  const order: readonly DpcComponentKind[] = [
    "audit_round",
    "pre_test",
    "training_session",
    "post_test",
    "other_activity",
  ];
  return order.filter((kind) => hasComponent(plan, kind));
}

/** Date de début effective : début de séance, sinon ouverture de fenêtre. */
export function slotStart(slot: DpcScheduledSlot): IsoDateTime | undefined {
  return slot.startsAt ?? slot.opensOn;
}

/** Date de fin effective : fin de séance, sinon fermeture de fenêtre. */
export function slotEnd(slot: DpcScheduledSlot): IsoDateTime | undefined {
  return slot.endsAt ?? slot.closesOn;
}

export function isSlotScheduled(slot: DpcScheduledSlot): boolean {
  return slotStart(slot) !== undefined && slotEnd(slot) !== undefined;
}

/**
 * Calendrier trié : d'abord les composants datés (par début, puis fin), puis
 * les composants non encore programmés, en conservant l'ordre déclaré.
 */
export function implementationTimeline(
  plan: DpcImplementationPlan,
): readonly DpcScheduledSlot[] {
  const scheduled = plan.slots.filter(isSlotScheduled);
  const pending = plan.slots.filter((slot) => !isSlotScheduled(slot));
  const sorted = [...scheduled].sort((a, b) => {
    const startDiff = Date.parse(slotStart(a)!) - Date.parse(slotStart(b)!);
    if (startDiff !== 0) return startDiff;
    const endDiff = Date.parse(slotEnd(a)!) - Date.parse(slotEnd(b)!);
    if (endDiff !== 0) return endDiff;
    return (a.order ?? 0) - (b.order ?? 0);
  });
  return [...sorted, ...pending];
}

/* ------------------------------------------------------------------ */
/* 4. Contrôles déterministes                                          */
/* ------------------------------------------------------------------ */

export type DpcImplementationIssueCode =
  | "missing_label"
  | "missing_delivery"
  | "delivery_on_non_training"
  | "missing_session_datetime"
  | "missing_window"
  | "end_before_start"
  | "missing_location"
  | "missing_join_instructions"
  | "missing_online_resources"
  | "pre_test_not_before_training"
  | "post_test_not_after_training"
  | "audit_rounds_out_of_order"
  | "duplicate_audit_round_link"
  | "no_component_planned";

export type DpcIssueSeverity = "blocking" | "warning";

export interface DpcImplementationIssue {
  readonly code: DpcImplementationIssueCode;
  readonly severity: DpcIssueSeverity;
  readonly message: string;
  readonly slotId?: string;
}

const ms = (value: IsoDateTime) => Date.parse(value);

function slotIssues(slot: DpcScheduledSlot): readonly DpcImplementationIssue[] {
  const issues: DpcImplementationIssue[] = [];
  const push = (
    code: DpcImplementationIssueCode,
    severity: DpcIssueSeverity,
    message: string,
  ) => issues.push({ code, severity, message, slotId: slot.id });

  if (slot.label.trim() === "")
    push("missing_label", "blocking", "Un composant programmé doit porter un libellé.");

  if (slot.kind !== "training_session" && slot.delivery !== undefined)
    push(
      "delivery_on_non_training",
      "blocking",
      "Une modalité de formation ne s'applique qu'à une séquence de formation.",
    );

  if (slot.kind === "training_session" && slot.delivery === undefined)
    push(
      "missing_delivery",
      "blocking",
      "Précisez la modalité : présentiel, visioconférence ou e-formation.",
    );

  const timing = expectedTiming(slot.kind, slot.delivery);
  if (timing === "fixed_datetime") {
    if (!slot.startsAt || !slot.endsAt)
      push(
        "missing_session_datetime",
        "blocking",
        "Une séance en présentiel ou en visioconférence exige une date et une heure de début et de fin.",
      );
    if (slot.delivery === "in_person" && (slot.location ?? "").trim() === "")
      push("missing_location", "blocking", "Renseignez le lieu de la séance en présentiel.");
    if (slot.delivery === "virtual_classroom" && (slot.joinInstructions ?? "").trim() === "")
      push(
        "missing_join_instructions",
        "blocking",
        "Renseignez les modalités de connexion à la visioconférence.",
      );
  } else {
    if (!slot.opensOn || !slot.closesOn)
      push(
        "missing_window",
        "blocking",
        "Renseignez la date d'ouverture et la date de fermeture de la période.",
      );
    if (slot.delivery === "e_learning" && (slot.resourceIds ?? []).length === 0)
      push(
        "missing_online_resources",
        "blocking",
        "Une e-formation exige au moins un document à consulter en ligne.",
      );
  }

  const start = slotStart(slot);
  const end = slotEnd(slot);
  if (start && end && ms(end) <= ms(start))
    push("end_before_start", "blocking", "La fin doit être postérieure au début.");

  return issues;
}

/**
 * Contrôles chronologiques : ils ne s'appliquent QUE si les composants
 * concernés existent tous les deux et sont datés.
 */
function chronologyIssues(plan: DpcImplementationPlan): readonly DpcImplementationIssue[] {
  const issues: DpcImplementationIssue[] = [];
  const training = slotsOfKind(plan, "training_session").filter(isSlotScheduled);
  const firstTrainingStart = training.length
    ? Math.min(...training.map((slot) => ms(slotStart(slot)!)))
    : undefined;
  const lastTrainingEnd = training.length
    ? Math.max(...training.map((slot) => ms(slotEnd(slot)!)))
    : undefined;

  if (firstTrainingStart !== undefined) {
    for (const slot of slotsOfKind(plan, "pre_test").filter(isSlotScheduled)) {
      if (ms(slotEnd(slot)!) > firstTrainingStart)
        issues.push({
          code: "pre_test_not_before_training",
          severity: "blocking",
          message: `« ${slot.label} » doit se clôturer avant le début de la première séquence de formation.`,
          slotId: slot.id,
        });
    }
  }

  if (lastTrainingEnd !== undefined) {
    for (const slot of slotsOfKind(plan, "post_test").filter(isSlotScheduled)) {
      if (ms(slotStart(slot)!) < lastTrainingEnd)
        issues.push({
          code: "post_test_not_after_training",
          severity: "blocking",
          message: `« ${slot.label} » doit s'ouvrir après la fin de la dernière séquence de formation.`,
          slotId: slot.id,
        });
    }
  }

  const audits = slotsOfKind(plan, "audit_round").filter(
    (slot) => isSlotScheduled(slot) && slot.order !== undefined,
  );
  const byOrder = [...audits].sort((a, b) => a.order! - b.order!);
  for (let index = 1; index < byOrder.length; index += 1) {
    const previous = byOrder[index - 1]!;
    const current = byOrder[index]!;
    if (ms(slotStart(current)!) < ms(slotEnd(previous)!))
      issues.push({
        code: "audit_rounds_out_of_order",
        severity: "blocking",
        message: `« ${current.label} » (tour ${current.order}) s'ouvre avant la fermeture de « ${previous.label} » (tour ${previous.order}).`,
        slotId: current.id,
      });
  }

  const linked = new Map<string, number>();
  for (const slot of slotsOfKind(plan, "audit_round")) {
    if (!slot.roundId) continue;
    linked.set(slot.roundId, (linked.get(slot.roundId) ?? 0) + 1);
  }
  for (const [roundId, count] of linked) {
    if (count > 1)
      issues.push({
        code: "duplicate_audit_round_link",
        severity: "blocking",
        message: `Plusieurs créneaux sont rattachés au même tour d'audit (${roundId}).`,
      });
  }

  return issues;
}

/**
 * Validation complète du plan d'implémentation.
 * Un plan VIDE est structurellement valide : il ne produit qu'un avertissement,
 * car aucun composant n'est obligatoire.
 */
export function validateImplementationPlan(
  plan: DpcImplementationPlan,
): readonly DpcImplementationIssue[] {
  if (plan.slots.length === 0)
    return [
      {
        code: "no_component_planned",
        severity: "warning",
        message:
          "Aucun composant programmé : audit, tests et formation sont tous optionnels, mais un DPC sans composant n'a pas de calendrier.",
      },
    ];
  return [...plan.slots.flatMap(slotIssues), ...chronologyIssues(plan)];
}

export function blockingIssues(
  plan: DpcImplementationPlan,
): readonly DpcImplementationIssue[] {
  return validateImplementationPlan(plan).filter((issue) => issue.severity === "blocking");
}

/** Le calendrier est-il exploitable ? (aucun point bloquant) */
export function isImplementationSchedulable(plan: DpcImplementationPlan): boolean {
  return blockingIssues(plan).length === 0;
}

/* ------------------------------------------------------------------ */
/* 5. Synthèse                                                         */
/* ------------------------------------------------------------------ */

export interface DpcImplementationSummary {
  readonly totalSlots: number;
  readonly scheduledSlots: number;
  readonly components: readonly DpcComponentKind[];
  readonly hasBeforeAfterAudit: boolean;
  readonly hasPrePostTests: boolean;
  readonly deliveries: readonly DpcTrainingDelivery[];
  readonly firstStart?: IsoDateTime;
  readonly lastEnd?: IsoDateTime;
  readonly blocking: number;
  readonly warnings: number;
}

export function implementationSummary(
  plan: DpcImplementationPlan,
): DpcImplementationSummary {
  const issues = validateImplementationPlan(plan);
  const scheduled = plan.slots.filter(isSlotScheduled);
  const starts = scheduled.map((slot) => slotStart(slot)!).sort();
  const ends = scheduled.map((slot) => slotEnd(slot)!).sort();
  const deliveries = [
    ...new Set(
      slotsOfKind(plan, "training_session")
        .map((slot) => slot.delivery)
        .filter((delivery): delivery is DpcTrainingDelivery => delivery !== undefined),
    ),
  ];
  return {
    totalSlots: plan.slots.length,
    scheduledSlots: scheduled.length,
    components: activeComponentKinds(plan),
    hasBeforeAfterAudit: slotsOfKind(plan, "audit_round").length >= 2,
    hasPrePostTests: hasComponent(plan, "pre_test") && hasComponent(plan, "post_test"),
    deliveries,
    ...(starts[0] ? { firstStart: starts[0] } : {}),
    ...(ends.length ? { lastEnd: ends[ends.length - 1]! } : {}),
    blocking: issues.filter((issue) => issue.severity === "blocking").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
  };
}

/** Description lisible du placement d'un créneau, sans reformulation par IA. */
export function describeSlotTiming(slot: DpcScheduledSlot): string {
  const timing = expectedTiming(slot.kind, slot.delivery);
  const start = slotStart(slot);
  const end = slotEnd(slot);
  if (!start || !end) return "Non programmé";
  return timing === "fixed_datetime"
    ? `Séance du ${start} au ${end}`
    : `Ouvert du ${start} au ${end}`;
}
