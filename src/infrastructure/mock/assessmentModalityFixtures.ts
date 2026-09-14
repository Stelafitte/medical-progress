/**
 * Modalités d'évaluation de maquette — déterministes.
 * Aucune donnée réelle : ces objets illustrent la structure attendue.
 *
 * `sessionFixturesFor` a été SUPPRIMÉE le 14/09. Elle fabriquait des dates,
 * des moyennes et des taux de réussite qu'aucune table ne porte, et deux
 * panneaux de l'écran « Évaluations » les affichaient comme un calendrier.
 * Le jour où les sessions existeront vraiment, elles viendront de la base.
 */
import type { ProgramId } from "@/domain/types";
import type { AssessmentModality } from "@/domain/assessmentModality";

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
