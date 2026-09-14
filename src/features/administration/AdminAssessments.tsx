/**
 * « Évaluations » — l'atelier des évaluations du programme, en entier.
 *
 * Deux modes (voir `AssessmentModalitySection`) : lecture — ce qui est retenu
 * et quand — et construction — tout ce qui est possible, à cocher, configurer
 * et dater par promotion. Le Concepteur embarque le même atelier ; le
 * pilotage le lit. Tout ce que cet écran affiche est lu en base.
 */
import { SectionHeading } from "@/components/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { CorpusImport } from "@/features/administration/CorpusImport";
import { AssessmentModalitySection } from "@/features/administration/AssessmentModalitySection";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import type { AssessmentUsage } from "@/domain/assessmentModality";

export function AdminAssessments() {
  const { data, isPending, refetch } = useProgramAdmin();

  if (isPending || !data || !data.program) return <Skeleton className="h-80 w-full" />;

  const program = data.program;
  const modalities = data.assessmentModalities.filter((m) => m.retainedAt !== undefined);
  const compter = (usage: AssessmentUsage) => modalities.filter((m) => m.usage === usage).length;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Évaluations"
        level={1}
        description={`${program.name} (${program.code}) — ce que l'étudiant rencontrera, sous quel format, en présentiel ou en ligne, et ce que chaque épreuve engage.`}
      />

      <ScopeNotice>
        Une modalité décrit le <strong>format</strong> d'une épreuve et vaut pour{" "}
        <strong>toutes les promotions</strong> ; une épreuve datée la pose pour{" "}
        <strong>une promotion, à une date</strong>. Lecture pour voir, construction pour choisir,
        configurer et dater. Le Concepteur de programme ouvre le même atelier.
      </ScopeNotice>

      {/*
        Les compteurs disent ce que le concepteur cherche : l'équilibre entre ce
        que l'étudiant fait seul, ce qu'on lui demande et ce qui l'engage.
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Auto-évaluations" value={compter("self_assessment")} />
        <StatCard label="Formatives" value={compter("formative")} />
        <StatCard label="Validantes" value={compter("validation_exam")} />
        <StatCard label="Épreuves datées" value={data.assessmentSessions.length} />
      </div>

      <AssessmentModalitySection
        programId={program.id}
        modalities={data.assessmentModalities}
        sessions={data.assessmentSessions}
        cohorts={data.cohorts}
        onChanged={() => void refetch()}
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
      </AssessmentModalitySection>
    </div>
  );
}
