/**
 * Modalités et sessions d'évaluation de maquette — déterministes.
 * Aucune donnée réelle : ces objets illustrent la structure attendue.
 */
import type { ProgramId } from "@/domain/types";
import type { AssessmentModality, AssessmentSession } from "@/domain/assessmentModality";

export function modalityFixturesFor(programId: ProgramId): readonly AssessmentModality[] {
  return [
    {
      id: `modality-${programId}-1`,
      programId,
      name: "QCM d'entraînement en ligne",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-11-14T09:30:00.000Z",
      mode: "online",
      subtype: "qcm",
      usage: "self_assessment",
      retainedAt: "2026-09-01T08:00:00.000Z",
      notes: "Ouvert en continu, corrigé automatiquement.",
    },
    {
      id: `modality-${programId}-2`,
      programId,
      name: "Épreuve écrite de validation",
      createdAt: "2026-09-04T08:00:00.000Z",
      updatedAt: "2026-12-02T14:00:00.000Z",
      mode: "in_person",
      subtype: "written",
      usage: "validation_exam",
      retainedAt: "2026-09-04T08:00:00.000Z",
    },
    {
      id: `modality-${programId}-3`,
      programId,
      name: "Évaluation orale par IA",
      createdAt: "2026-10-12T08:00:00.000Z",
      updatedAt: "2026-10-12T08:00:00.000Z",
      mode: "online",
      subtype: "ai_oral",
      usage: "formative",
      retainedAt: "2026-10-12T08:00:00.000Z",
      notes: "Restitution guidée, jamais validante à elle seule.",
    },
  ];
}

/** Sessions rattachées à une cohorte : deux passées, deux à venir. */
export function sessionFixturesFor(
  programId: ProgramId,
  cohortId: string,
): readonly AssessmentSession[] {
  const modalities = modalityFixturesFor(programId);
  const seed = [...cohortId].reduce((total, char) => total + char.charCodeAt(0), 0);
  const first = modalities[0];
  const second = modalities[1];
  const third = modalities[2];
  if (!first || !second || !third) return [];
  return [
    {
      id: `session-${cohortId}-1`,
      modalityId: first.id,
      cohortId,
      scheduledFor: "2026-11-20T08:00:00.000Z",
      participants: 24 + (seed % 7),
      averageScore: 13 + (seed % 4),
      maximumScore: 20,
      passRatePercent: 72 + (seed % 11),
    },
    {
      id: `session-${cohortId}-2`,
      modalityId: third.id,
      cohortId,
      scheduledFor: "2027-01-09T13:00:00.000Z",
      participants: 21 + (seed % 5),
      averageScore: 12 + (seed % 5),
      maximumScore: 20,
      passRatePercent: 65 + (seed % 15),
    },
    {
      id: `session-${cohortId}-3`,
      modalityId: second.id,
      cohortId,
      scheduledFor: "2027-06-18T08:00:00.000Z",
      participants: 26 + (seed % 6),
    },
    {
      id: `session-${cohortId}-4`,
      modalityId: first.id,
      cohortId,
      scheduledFor: "2027-09-05T08:00:00.000Z",
      participants: 26 + (seed % 6),
    },
  ];
}
