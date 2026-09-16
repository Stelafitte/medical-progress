/**
 * « Évaluations » — l'atelier des évaluations du programme, en entier.
 *
 * L'atelier (voir `AssessmentModalitySection`) : une promotion choisie, puis
 * tout ce qui est possible pour elle, à cocher, configurer, dater et piloter
 * — le QCM y porte aussi ses résultats. Sous l'atelier, l'import des banques
 * et les signalements des étudiants, qui concernent le programme entier. Le
 * Concepteur embarque le même atelier ; le pilotage le lit. Tout ce que cet
 * écran affiche est lu en base.
 */
import { useQuery } from "@tanstack/react-query";
import { SectionHeading } from "@/components/section-heading";
import { PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { CorpusImport } from "@/features/administration/CorpusImport";
import { QuestionBankImport } from "@/features/administration/QuestionBankImport";
import { QuestionReports } from "@/features/administration/QuestionReports";
import { AssessmentModalitySection } from "@/features/administration/AssessmentModalitySection";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { AdminChargement } from "@/features/administration/AdminChargement";
import { StageLogbookTemplates } from "@/features/administration/StageLogbookTemplates";
import { useDataAccess } from "@/application/session";

export function AdminAssessments() {
  const { data, isPending, error, refetch } = useProgramAdmin();
  const dataAccess = useDataAccess();
  /*
   * MÊME CLÉ QUE « Carnets de stage » plus bas : l'atelier a besoin de la liste
   * pour proposer un modèle sous « Journal de stage », et il ne part pas une
   * requête de plus pour cela.
   */
  const carnets = useQuery({
    queryKey: ["carnets-de-stage", data?.program?.id ?? "aucun"],
    enabled: Boolean(data?.program),
    queryFn: () => dataAccess.stageLogs.listTemplates(data!.program!.id),
  });

  if (isPending || !data || !data.program) return <AdminChargement error={error} />;

  const program = data.program;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Évaluations"
        level={1}
        description={`${program.name} (${program.code}) — ce que chaque promotion rencontrera, sous quel format, où, ce que ça engage, et quand.`}
      />

      <ScopeNotice>
        Chaque <strong>promotion</strong> a son contenu d'évaluation. Une modalité est configurée
        une fois pour le programme — format, lieu, ce qu'elle engage, consignes — et chaque
        promotion choisit de l'utiliser, et quand. Choisissez une promotion : tout ce qui suit est à
        elle. Le Concepteur de programme ouvre le même atelier.
      </ScopeNotice>

      <AssessmentModalitySection
        programId={program.id}
        modalities={data.assessmentModalities}
        sessions={data.assessmentSessions}
        links={data.cohortAssessmentLinks}
        cohorts={data.cohorts}
        banques={data.questionBanks}
        themes={data.outcomeThemes}
        carnets={carnets.data ?? []}
        onChanged={() => {
          void refetch();
          void carnets.refetch();
        }}
      >
        <PanelCard
          title="Voie automatique — importer un corpus de documents"
          description="Un document ou une archive ZIP : les modalités d'évaluation que l'IA y repère sont proposées à la validation, et les fichiers sont déposés dans la médiathèque. Nécessite un fournisseur IA et une clé configurés pour le programme."
        >
          <CorpusImport
            target="assessments"
            programId={program.id}
            curriculumVersionId={data.versions[0]?.id}
            existingAssessmentNames={data.assessmentModalities.map((m) => m.name)}
            onCreated={() => void refetch()}
          />
        </PanelCard>
        <StageLogbookTemplates programId={program.id} />
        <QuestionBankImport programId={program.id} />
      </AssessmentModalitySection>

      <QuestionReports programId={program.id} />
    </div>
  );
}
