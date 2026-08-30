/**
 * Compétences — entraînement ECOS réservé au DFASM et préparation de
 * l'intégration sélective du moteur
 * historique. Aucun couplage runtime, aucun import réel, aucun appel IA.
 */
import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import {
  ECOS_EVIDENCE_RULE_FR,
  ECOS_MODE_LABELS_FR,
  LEGACY_CATEGORY_LABELS_FR,
  LEGACY_SOURCE_PROJECT_ID,
  LEGACY_SOURCE_SYSTEM,
  MIGRATION_DECISION_LABELS_FR,
  MIGRATION_STATUS_LABELS_FR,
  MIGRATION_STEPS,
  inventoryProgress,
  projectEcosResultToEvidence,
  type EcosScenarioMock,
  type LegacyModuleInventoryItem,
} from "@/domain/ecosMigration";
import type { Outcome } from "@/domain/types";

export function EcosMigrationSection({
  inventory,
  scenarios,
  outcomes,
}: {
  inventory: readonly LegacyModuleInventoryItem[];
  scenarios: readonly EcosScenarioMock[];
  outcomes: readonly Outcome[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(scenarios[0]?.id ?? null);
  const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0] ?? null;
  const progress = inventoryProgress(inventory);
  const projection = projectEcosResultToEvidence();

  return (
    <div className="space-y-6">
      <ScopeNotice>
        Inventaire documentaire du moteur historique <strong>{LEGACY_SOURCE_SYSTEM}</strong> (projet
        source {LEGACY_SOURCE_PROJECT_ID}) : aucun code, secret, table ni fonction n'est copié
        automatiquement et aucun couplage runtime n'existe.
      </ScopeNotice>

      <p
        role="note"
        className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {ECOS_EVIDENCE_RULE_FR}
      </p>

      <PanelCard
        title="Workflow de migration sélective"
        description="Inventorier → Mapper → Adapter → Tester → Importer"
        action={<MockBadge />}
      >
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {MIGRATION_STEPS.map((step, index) => (
            <li key={step.key} className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                {step.done ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-hidden />
                )}
                <span className="text-sm font-medium">
                  {index + 1}. {step.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-11" disabled>
            Importer depuis le projet source
          </Button>
          <span className="text-xs text-muted-foreground">
            Import réel indisponible : aucune connexion au projet historique.
          </span>
        </div>
      </PanelCard>

      <PanelCard
        title="Inventaire de migration"
        description={`${progress.total} modules — conserver ${progress.byDecision.keep}, adapter ${progress.byDecision.adapt}, remplacer ${progress.byDecision.replace}, bloqués ${progress.blocked}`}
      >
        {/* Mobile : cartes ; desktop : tableau. */}
        <ul className="grid gap-3 md:hidden">
          {inventory.map((item) => (
            <li key={item.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  {LEGACY_CATEGORY_LABELS_FR[item.category]}
                </Badge>
                <span className="font-mono text-xs">{item.sourceModule}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary" className="font-normal">
                  {MIGRATION_DECISION_LABELS_FR[item.decision]}
                </Badge>
                <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="break-words">{item.destination}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Statut : {MIGRATION_STATUS_LABELS_FR[item.status]} — {item.note}
              </p>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module source</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Décision</TableHead>
                <TableHead>Destination Passeport</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.sourceModule}</TableCell>
                  <TableCell className="text-xs">
                    {LEGACY_CATEGORY_LABELS_FR[item.category]}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {MIGRATION_DECISION_LABELS_FR[item.decision]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{item.destination}</TableCell>
                  <TableCell className="text-xs">
                    {MIGRATION_STATUS_LABELS_FR[item.status]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PanelCard>

      <PanelCard
        title="Scénarios ECOS disponibles en mock"
        description={`${scenarios.length} scénario(s) pour ce programme`}
      >
        {scenarios.length === 0 ? (
          <EmptyState>Aucun scénario mock pour ce programme.</EmptyState>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {scenarios.map((scenario) => (
              <li key={scenario.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(scenario.id)}
                  aria-pressed={selected?.id === scenario.id}
                  className={`min-h-11 w-full rounded-md border p-3 text-left text-sm transition-colors ${
                    selected?.id === scenario.id
                      ? "border-primary bg-secondary/50"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <span className="block font-medium">{scenario.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {scenario.durationMinutes} min · {ECOS_MODE_LABELS_FR[scenario.mode]} ·{" "}
                    {scenario.status === "mock" ? "maquette" : "à adapter"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      {selected ? (
        <PanelCard
          title={`Fiche de scénario — ${selected.title}`}
          description="Contenu de démonstration, aucune session réelle ne peut être lancée."
          action={<MockBadge label="Maquette" />}
        >
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Patient simulé</dt>
              <dd>{selected.patientProfile}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Consignes</dt>
              <dd>{selected.instructions}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Durée</dt>
              <dd>{selected.durationMinutes} minutes</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mode</dt>
              <dd>{ECOS_MODE_LABELS_FR[selected.mode]}</dd>
            </div>
          </dl>

          <div className="space-y-1">
            <p className="font-medium">Grille d'évaluation et compétences liées</p>
            <ul className="space-y-1">
              {selected.grading.map((criterion) => {
                const outcome = outcomes.find((o) => o.id === criterion.outcomeId);
                return (
                  <li key={criterion.label} className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-normal">
                      {criterion.weight} %
                    </Badge>
                    <span>{criterion.label}</span>
                    {outcome ? (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {outcome.code}
                      </Badge>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-medium">Débriefing</p>
            <p className="text-muted-foreground">{selected.debriefSummary}</p>
          </div>

          <div className="space-y-1 rounded-md border border-dashed border-border p-3">
            <p className="font-medium">Conversion du résultat en preuve</p>
            <p className="text-muted-foreground">
              Preuve de type <strong>{projection.evidenceKind}</strong>, nature{" "}
              <strong>compétence simulée</strong>, statut <strong>{projection.status}</strong>, non
              auto-déclarée. Une compétence réelle exige toujours une validation humaine.
            </p>
          </div>

          {selected.legacySourceId ? (
            <p className="text-xs text-muted-foreground">
              Provenance legacy conservée : {LEGACY_SOURCE_SYSTEM} / {selected.legacySourceId}.
            </p>
          ) : null}
        </PanelCard>
      ) : null}
    </div>
  );
}
