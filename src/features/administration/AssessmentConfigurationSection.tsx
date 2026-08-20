import { CalendarClock, FileUp, Image, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import {
  ASSESSMENT_CONTENT_LABELS_FR,
  ASSESSMENT_DELIVERY_LABELS_FR,
  ASSESSMENT_RESULT_IMPORT_REQUIRED_COLUMNS,
  ASSESSMENT_RESULT_MODE_LABELS_FR,
  ASSESSMENT_STATUS_LABELS_FR,
  QUESTION_BANK_CAPABILITIES,
  validateAssessment,
  type AssessmentDefinition,
} from "@/domain/assessment";

export function AssessmentConfigurationSection({
  assessments,
}: {
  assessments: readonly AssessmentDefinition[];
}) {
  return (
    <div className="space-y-6">
      <ScopeNotice>
        Module transversal en maquette : une évaluation peut avoir lieu dans la plateforme, en
        présentiel, à distance ou dans un outil extérieur. Un ECOS est une modalité d'évaluation,
        jamais une catégorie de compétence.
      </ScopeNotice>

      <PanelCard
        title="Évaluations du programme"
        description="Nombre, ordre, modalités, calendrier, contenus, barème et mode de collecte des résultats."
        action={<MockBadge />}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{assessments.length} évaluation(s)</Badge>
          <Button type="button" className="min-h-11" disabled>
            Ajouter une évaluation (simulé)
          </Button>
        </div>
        {assessments.length === 0 ? (
          <EmptyState>Aucune évaluation configurée.</EmptyState>
        ) : (
          <ol className="grid gap-4 lg:grid-cols-2">
            {[...assessments]
              .sort((a, b) => a.sequence - b.sequence)
              .map((assessment) => {
                const issues = validateAssessment(assessment);
                return (
                  <li key={assessment.id} className="rounded-md border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <CalendarClock className="size-4 text-primary" aria-hidden />
                      <strong>
                        {assessment.sequence}. {assessment.title}
                      </strong>
                      <Badge variant="outline">
                        {ASSESSMENT_STATUS_LABELS_FR[assessment.status]}
                      </Badge>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Modalité</dt>
                        <dd>{ASSESSMENT_DELIVERY_LABELS_FR[assessment.delivery]}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Résultats</dt>
                        <dd>{ASSESSMENT_RESULT_MODE_LABELS_FR[assessment.resultMode]}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Début</dt>
                        <dd>
                          {assessment.startsAt
                            ? new Date(assessment.startsAt).toLocaleString("fr-FR")
                            : "À programmer"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Fin</dt>
                        <dd>
                          {assessment.endsAt
                            ? new Date(assessment.endsAt).toLocaleString("fr-FR")
                            : "À programmer"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assessment.contentKinds.map((kind) => (
                        <Badge key={kind} variant="secondary">
                          {ASSESSMENT_CONTENT_LABELS_FR[kind]}
                        </Badge>
                      ))}
                    </div>
                    {issues.length > 0 ? (
                      <ul className="mt-3 text-xs text-warning">
                        {issues.map((issue) => (
                          <li key={issue.code}>À compléter : {issue.message}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
          </ol>
        )}
      </PanelCard>

      <PanelCard
        title="Importer des résultats externes"
        description="Prévisualisation, correspondance des colonnes, contrôle des inscrits et rapport d'erreurs avant confirmation."
        action={<FileUp className="size-5 text-primary" aria-hidden />}
      >
        <p className="text-sm text-muted-foreground">
          Formats prévus : CSV, TSV et XLSX. Aucun fichier n'est envoyé dans cette maquette.
        </p>
        <div className="flex flex-wrap gap-2">
          {ASSESSMENT_RESULT_IMPORT_REQUIRED_COLUMNS.map((column) => (
            <Badge key={column} variant="outline" className="font-mono text-xs">
              {column}
            </Badge>
          ))}
        </div>
        <Button type="button" variant="outline" className="min-h-11" disabled>
          Importer des résultats (simulé)
        </Button>
      </PanelCard>

      <PanelCard
        title="Banques de questions — trajectoire"
        description="Fondation prévue après la persistance des évaluations et des résultats."
        action={<ListChecks className="size-5 text-primary" aria-hidden />}
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {QUESTION_BANK_CAPABILITIES.map((capability) => (
            <li
              key={capability}
              className="flex items-start gap-2 rounded-md border border-border p-3 text-sm"
            >
              <Image className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {capability}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Les images et boucles d'échocardiographie seront des assets privés versionnés ; aucune
          donnée patient ne devra y figurer.
        </p>
      </PanelCard>
    </div>
  );
}
