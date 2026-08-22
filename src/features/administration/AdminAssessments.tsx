/**
 * « Évaluations » — modalités, QCM, ECOS et collecte des résultats.
 * Un ECOS reste une modalité d'évaluation, jamais une catégorie de compétence.
 */
import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { AssessmentConfigurationSection } from "@/features/administration/AssessmentConfigurationSection";
import { EcosMigrationSection } from "@/features/administration/EcosMigrationSection";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import { ASSESSMENT_RESULT_IMPORT_REQUIRED_COLUMNS } from "@/domain/assessment";
import { assessmentFixturesFor } from "@/infrastructure/mock/assessmentFixtures";

export function AdminAssessments() {
  const { data, isPending } = useProgramAdmin();
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");

  const cohorts = data?.cohorts ?? [];
  const selectedId = cohortId ?? defaultPilotCohortId(cohorts);

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const isDfasm = data.program?.code.toUpperCase().startsWith("DFASM") === true;
  const assessments = data.program ? assessmentFixturesFor(data.program.id, isDfasm) : [];
  const importedRows = importText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.toLowerCase().startsWith("email"));

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Évaluations"
        level={1}
        action={<MockBadge />}
        description="Modalités d'évaluation, banques de questions, ECOS et import des résultats obtenus hors plateforme."
      />

      <ScopeNotice>
        Une évaluation peut se dérouler dans la plateforme, en présentiel, à distance ou dans un
        outil extérieur. Aucun résultat n'est enregistré dans cette maquette.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Évaluations configurées" value={assessments.length} />
        <StatCard label="Scénarios ECOS" value={data.ecosScenarios.length} />
        <StatCard label="Cohortes concernées" value={cohorts.length} />
        <StatCard label="Objectifs évaluables" value={data.outcomes.length} />
      </div>

      <Tabs defaultValue="modalites" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="modalites" className="min-h-11 flex-none text-xs sm:text-sm">
            Modalités et QCM
          </TabsTrigger>
          <TabsTrigger value="simulation" className="min-h-11 flex-none text-xs sm:text-sm">
            Simulation et ECOS
          </TabsTrigger>
          <TabsTrigger value="resultats" className="min-h-11 flex-none text-xs sm:text-sm">
            Résultats et notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="modalites" className="space-y-6">
          <AssessmentConfigurationSection assessments={assessments} />
        </TabsContent>

        <TabsContent value="simulation" className="space-y-6">
          {isDfasm ? (
            <EcosMigrationSection
              inventory={data.ecosInventory}
              scenarios={data.ecosScenarios}
              outcomes={data.outcomes}
            />
          ) : (
            <ScopeNotice>
              L'entraînement ECOS est un module réservé aux programmes DFASM. Il n'est pas activé
              pour <strong>{data.program?.name}</strong>.
            </ScopeNotice>
          )}
        </TabsContent>

        <TabsContent value="resultats" className="space-y-6">
          <CohortSelector
            cohorts={cohorts}
            value={selectedId}
            onChange={setCohortId}
            label="Cohorte évaluée"
          />

          <PanelCard
            title="Importer des notes obtenues hors plateforme"
            description="Colonnes attendues : ces résultats sont rattachés à la cohorte sélectionnée."
            action={<MockBadge />}
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {ASSESSMENT_RESULT_IMPORT_REQUIRED_COLUMNS.map((column) => (
                <Badge key={column} variant="outline" className="font-mono text-[10px]">
                  {column}
                </Badge>
              ))}
            </div>
            <Textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              rows={6}
              placeholder="email;note;date"
              aria-label="Notes à importer"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{importedRows.length} ligne(s) reconnue(s)</Badge>
              <Button size="sm" className="min-h-11" disabled={importedRows.length === 0}>
                Importer les résultats (simulé)
              </Button>
            </div>
          </PanelCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
