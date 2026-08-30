/**
 * Programme de référence DPC et ses implémentations.
 *
 * Le coordinateur n'invente pas le contenu : il implémente pour une cohorte, un
 * calendrier et des modalités donnés un programme déjà conçu et validé.
 * Tout est SIMULÉ : aucune ouverture réelle, aucun lien de visioconférence
 * réel, aucune notification.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import {
  DPC_IMPLEMENTATION_STATUS_LABELS_FR,
  DPC_MODULE_LABELS_FR,
  DPC_SEQUENCE_MODALITY_LABELS_FR,
  canOpenImplementation,
  implementationOverview,
  implementedReferenceVersions,
  orderedMilestones,
  validateImplementation,
  type DpcProgramImplementation,
} from "@/domain/dpcProgramImplementation";
import { dpcHvgProgramDefinition } from "@/infrastructure/mock/dpcHvgProgramDefinition";
import {
  dpcHvgImplementations,
  dpcHvgReferencePublished,
} from "@/infrastructure/mock/dpcImplementationFixtures";

const touch = "min-h-11";

function formatDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function ImplementationCard({ implementation }: { implementation: DpcProgramImplementation }) {
  const overview = implementationOverview(implementation);
  const issues = validateImplementation(implementation);
  const openable = canOpenImplementation(implementation, dpcHvgReferencePublished);
  const timeline = orderedMilestones(implementation.schedule);

  return (
    <PanelCard
      title={implementation.name}
      description={`Version implémentée du programme de référence : ${implementation.programDefinitionVersion} — fuseau ${implementation.timeZone}`}
      action={<MockBadge label="Implémentation simulée" />}
    >
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {DPC_IMPLEMENTATION_STATUS_LABELS_FR[implementation.status]}
        </Badge>
        {overview.modules.map((key) => (
          <Badge key={key} variant="outline" className="font-normal">
            {DPC_MODULE_LABELS_FR[key]}
          </Badge>
        ))}
        {overview.modalities.map((modality) => (
          <Badge key={modality} variant="outline" className="font-normal">
            {DPC_SEQUENCE_MODALITY_LABELS_FR[modality]}
          </Badge>
        ))}
        {overview.hybrid ? (
          <Badge variant="outline" className="font-normal">
            Parcours hybride
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Modules activés" value={overview.modules.length} />
        <StatCard label="Étapes au calendrier" value={overview.milestoneCount} />
        <StatCard
          label="Contrôles bloquants"
          value={overview.blocking}
          hint={`${overview.warnings} avertissement(s)`}
        />
      </div>

      <div>
        <h4 className="text-sm font-medium">Calendrier ordonné</h4>
        <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
          {timeline.map((milestone) => (
            <li key={milestone.id} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <span className="font-medium text-foreground">{milestone.label}</span>
              <span>
                {formatDate(milestone.startsAt, implementation.timeZone)}
                {milestone.endsAt
                  ? ` → ${formatDate(milestone.endsAt, implementation.timeZone)}`
                  : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {issues.length ? (
        <ul role="alert" className="space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={`${issue.code}-${issue.ref ?? ""}`}>
              {issue.severity === "blocking" ? "Bloquant : " : "Avertissement : "}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className={`${touch} w-full sm:w-auto`}
          disabled={!openable}
        >
          Ouvrir l'implémentation (simulé)
        </Button>
        <Button type="button" variant="ghost" className={`${touch} w-full sm:w-auto`} disabled>
          Relances programmées : {implementation.reminderDates.length} (aucun envoi)
        </Button>
      </div>
    </PanelCard>
  );
}

export function DpcImplementationsSection() {
  const versions = implementedReferenceVersions(dpcHvgImplementations, dpcHvgProgramDefinition.id);

  return (
    <section className="space-y-4">
      <ScopeNotice>
        Le coordinateur <strong>importe un programme DPC</strong> (Word ou PDF) avec ses grilles
        d'audit et ses documents associés ; Campus Santé Augmenté en tire des{" "}
        <strong>données structurées</strong> puis prépare une <strong>implémentation</strong> —
        cohorte, calendrier, modalités et intervenants — à vérifier avant ouverture. Aucune
        ouverture, aucune visioconférence et aucune notification ne sont réelles ici.
      </ScopeNotice>

      <PanelCard
        title={`Programme importé — ${dpcHvgProgramDefinition.title}`}
        description="Données structurées issues du programme : objectifs, méthode, grilles, QCM et bibliographie, sans date d'exploitation."
        action={<MockBadge label="Import simulé" />}
      >
        <p className="text-sm text-muted-foreground">
          Public visé : {dpcHvgProgramDefinition.targetAudience}
        </p>
        <section className="space-y-1 rounded-md border border-border p-3">
          <h4 className="text-sm font-medium">Traçabilité de la version</h4>
          <p className="text-muted-foreground text-xs">
            Version des données structurées : {dpcHvgProgramDefinition.version.version} · versions
            actuellement implémentées : {versions.join(", ")}. Section technique secondaire : aucune
            publication distincte n'est demandée au coordinateur.
          </p>
        </section>
        <Button type="button" variant="ghost" className={`${touch} w-full sm:w-auto`} disabled>
          Réutiliser ce programme déjà importé (simulé)
        </Button>
      </PanelCard>

      {dpcHvgImplementations.map((implementation) => (
        <ImplementationCard key={implementation.id} implementation={implementation} />
      ))}
    </section>
  );
}
