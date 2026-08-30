/**
 * Construction de l'INSTANTANÉ de communication (couche application).
 *
 * Ce module est PUR : il ne lit aucune horloge, ne stocke rien, n'appelle
 * aucun réseau. Il projette l'annuaire local et le calendrier de démonstration
 * vers le `CommunicationSnapshot` attendu par `src/domain/communication.ts`.
 *
 * Il est TRANSVERSAL : DIU, DFASM, DPC ou tout autre type de programme
 * passent par le même chemin. Aucun cas particulier de programme.
 *
 * SIMULATION assumée : les groupes de travail et l'achèvement des jalons ne
 * sont pas encore modélisés côté données. Ils sont dérivés ici de façon
 * DÉTERMINISTE (aucun hasard) et étiquetés « simulé » dans l'interface.
 */
import type { PlanScheduleEntry } from "@/domain/acquisitionPlan";
import type {
  ActorScope,
  CommunicationSnapshot,
  GroupSnapshot,
  MilestoneSnapshot,
} from "@/domain/communication";
import type { DirectoryRow, DirectoryScope } from "@/domain/directory";
import type { IsoDateTime, PersonId, ProgramId, RoleName } from "@/domain/types";

/** Groupes de travail SIMULÉS : chaque cohorte est scindée en deux moitiés stables. */
export function deriveDemoGroups(scope: DirectoryScope): readonly GroupSnapshot[] {
  const groups: GroupSnapshot[] = [];
  for (const cohort of scope.cohorts) {
    const ids = scope.rows
      .filter((r) => r.enrollment.cohortId === cohort.id)
      .map((r) => r.person.id);
    if (ids.length === 0) continue;
    const half = Math.ceil(ids.length / 2);
    groups.push({
      groupId: `${cohort.id}-groupe-a`,
      label: `${cohort.label} — groupe A (simulé)`,
      personIds: ids.slice(0, half),
    });
    if (ids.length > half) {
      groups.push({
        groupId: `${cohort.id}-groupe-b`,
        label: `${cohort.label} — groupe B (simulé)`,
        personIds: ids.slice(half),
      });
    }
  }
  return groups;
}

/**
 * Achèvement SIMULÉ et déterministe : une personne sur deux (rang alphabétique
 * d'identifiant) est considérée comme ayant terminé un jalon d'index pair.
 * Aucune donnée réelle de progression n'est utilisée ici.
 */
export function deriveDemoMilestones(
  scope: DirectoryScope,
  schedule: readonly PlanScheduleEntry[],
): readonly MilestoneSnapshot[] {
  const sortedPersons = [...new Set(scope.rows.map((r) => r.person.id))].sort();
  return schedule.map((entry, index) => ({
    milestoneId: entry.outcomeId,
    title: entry.milestoneLabel,
    dueAt: entry.dueOn,
    completedPersonIds: sortedPersons.filter((_id, i) => (i + index) % 2 === 0),
  }));
}

/** Échéance à venir par personne, dérivée du premier jalon non achevé. */
export function deriveNextDeadlines(
  milestones: readonly MilestoneSnapshot[],
  rows: readonly DirectoryRow[],
): Readonly<Record<string, IsoDateTime>> {
  const byPerson: Record<string, IsoDateTime> = {};
  const ordered = [...milestones]
    .filter((m) => m.dueAt !== undefined)
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1));
  for (const row of rows) {
    const next = ordered.find((m) => !m.completedPersonIds.includes(row.person.id));
    if (next?.dueAt) byPerson[row.person.id] = next.dueAt;
  }
  return byPerson;
}

export interface SnapshotInput {
  readonly programId: ProgramId;
  readonly programTitle: string;
  readonly coordinatorName: string;
  readonly scope: DirectoryScope;
  readonly schedule: readonly PlanScheduleEntry[];
  readonly accessLink?: string;
}

export function buildCommunicationSnapshot(input: SnapshotInput): CommunicationSnapshot {
  const groups = deriveDemoGroups(input.scope);
  const milestones = deriveDemoMilestones(input.scope, input.schedule);
  return {
    programId: input.programId,
    programTitle: input.programTitle,
    coordinatorName: input.coordinatorName,
    rows: input.scope.rows,
    groups,
    milestones,
    nextDeadlineByPerson: deriveNextDeadlines(milestones, input.scope.rows),
    accessLink: input.accessLink ?? "https://exemple.invalid/espace",
  };
}

/** Périmètre de l'émetteur : jamais toute la plateforme, jamais implicite. */
export function buildActorScope(input: {
  readonly actorPersonId: PersonId;
  readonly programId: ProgramId;
  readonly rolesInProgram: readonly RoleName[];
}): ActorScope {
  const role: RoleName = input.rolesInProgram.includes("administrator")
    ? "administrator"
    : input.rolesInProgram.includes("teacher")
      ? "teacher"
      : input.rolesInProgram.includes("placement_supervisor")
        ? "placement_supervisor"
        : "learner";
  return {
    actorPersonId: input.actorPersonId,
    role,
    programIds: [input.programId],
  };
}
