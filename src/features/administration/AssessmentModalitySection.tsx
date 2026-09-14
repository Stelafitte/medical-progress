/**
 * Bloc UNIQUE des évaluations d'un programme.
 *
 * Même contenu dans l'onglet « Évaluations » (éditable) et dans la partie
 * Évaluation du pilotage de programme (lecture).
 *
 * ORDRE DE LECTURE, du plus important au plus rare :
 *   1. le référentiel — ce que l'étudiant rencontrera, rangé par ce que
 *      chaque épreuve engage ;
 *   2. la création d'une modalité sur mesure ;
 *   3. l'import assisté par IA (un outil de puissance, pas la porte d'entrée) ;
 *   4. les promotions concernées, et ce qui n'est pas encore modélisé.
 *
 * CE QUI A ÉTÉ RETIRÉ LE 14/09. Trois panneaux de maquette — un import de
 * résultats « (simulé) », et deux calendriers d'épreuves par promotion nourris
 * par `sessionFixturesFor`. Un `MockBadge` les signalait ; il ne suffisait
 * pas. Ce qui manque est désormais DIT, à l'endroit où on le cherche.
 *
 * CE QUI A ÉTÉ AJOUTÉ. « Retirer du programme » sur chaque ligne, dans
 * l'onglet qui crée. Il n'existe pas de modification d'une modalité : la
 * seule façon de corriger un format ou un usage est d'archiver et de recréer,
 * et cette action doit vivre là où la création vit.
 */
import { useState, type ReactNode } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { useDataAccess } from "@/application/session";
import {
  ASSESSMENT_MODE_LABELS_FR,
  ASSESSMENT_SUBTYPE_LABELS_FR,
  ASSESSMENT_USAGE_LABELS_FR,
  type AssessmentModality,
  type AssessmentUsage,
} from "@/domain/assessmentModality";
import { AssessmentModalityForm } from "@/features/administration/AssessmentModalityForm";
import type { Cohort, ProgramId } from "@/domain/types";

/**
 * L'ordre PÉDAGOGIQUE, pas l'ordre alphabétique : ce que l'étudiant fait seul,
 * puis ce qu'on lui demande, puis ce qui l'engage.
 */
const ORDRE_DES_USAGES: readonly AssessmentUsage[] = [
  "self_assessment",
  "formative",
  "validation_exam",
  "certification",
];

const CE_QUE_L_USAGE_ENGAGE: Record<AssessmentUsage, string> = {
  self_assessment: "L'étudiant s'y exerce quand il veut. Rien n'est retenu contre lui.",
  formative: "Passage attendu et résultat commenté, sans effet sur la validation.",
  validation_exam: "Le passage conditionne la validation du stage.",
  certification: "Épreuve certifiante, au-delà du programme.",
};

function ModalityCard({
  modality,
  editable,
  onArchived,
}: {
  readonly modality: AssessmentModality;
  readonly editable: boolean;
  readonly onArchived?: () => void;
}) {
  const dataAccess = useDataAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const horsParcours = modality.retainedAt === undefined;

  async function retirer() {
    setBusy(true);
    setError(null);
    try {
      await dataAccess.assessments.archiveAssessmentModality(modality.id);
      onArchived?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Retrait impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border-border rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">{modality.name}</strong>
        <Badge variant="secondary">{ASSESSMENT_SUBTYPE_LABELS_FR[modality.subtype]}</Badge>
        <Badge variant="outline">{ASSESSMENT_MODE_LABELS_FR[modality.mode]}</Badge>
        {/*
          « Hors parcours » se dit, « retenue » se tait : c'est l'état normal.
        */}
        {horsParcours ? (
          <Badge variant="outline" className="text-muted-foreground font-normal">
            Hors parcours
          </Badge>
        ) : null}
      </div>
      {modality.notes ? (
        <p className="text-muted-foreground mt-2 text-xs">{modality.notes}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">Créée le {formatFrDate(modality.createdAt)}</p>
        {editable ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9"
            disabled={busy}
            onClick={() => void retirer()}
          >
            {busy ? "Retrait…" : "Retirer du programme"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-destructive mt-2 text-xs">{error}</p> : null}
    </li>
  );
}

function GroupeParUsage({
  usage,
  modalities,
  editable,
  onArchived,
}: {
  readonly usage: AssessmentUsage;
  readonly modalities: readonly AssessmentModality[];
  readonly editable: boolean;
  readonly onArchived?: () => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-medium">{ASSESSMENT_USAGE_LABELS_FR[usage]}</h3>
        <span className="text-muted-foreground text-xs">
          {modalities.length === 0 ? "aucune" : `${modalities.length} modalité(s)`} ·{" "}
          {CE_QUE_L_USAGE_ENGAGE[usage]}
        </span>
      </div>
      {/*
        Un groupe VIDE reste affiché : « aucune auto-évaluation » est le trou
        que le concepteur doit voir dans sa maquette pédagogique.
      */}
      {modalities.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-md border border-dashed px-3 py-2.5 text-xs">
          Rien de prévu à ce titre pour ce programme.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {modalities.map((modality) => (
            <ModalityCard
              key={modality.id}
              modality={modality}
              editable={editable}
              onArchived={onArchived}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AssessmentModalitySection({
  programId,
  modalities,
  cohorts,
  onChanged,
  editable = true,
  children,
}: {
  readonly programId: ProgramId;
  /** Modalités du programme, lues depuis `dataAccess.assessments.listAssessmentModalities`. */
  readonly modalities: readonly AssessmentModality[];
  /**
   * Les promotions du programme, pour les NOMMER — pas pour filtrer. Ces
   * modalités valent pour toutes, et aucune ne porte encore de date : l'écran
   * le montre plutôt que de faire choisir dans le vide.
   */
  readonly cohorts: readonly Cohort[];
  /** Relit la liste après une création ou un retrait. */
  readonly onChanged?: () => void;
  /** `false` dans le pilotage : on y lit, on ne crée ni ne retire. */
  readonly editable?: boolean;
  /** L'import assisté, rendu par l'appelant : il vient APRÈS la création. */
  readonly children?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PanelCard
        title="Ce que l'étudiant rencontrera"
        description="Les modalités d'évaluation du programme, rangées par ce qu'elles engagent. Chaque ligne dit son format et si elle se passe en présentiel ou en ligne."
      >
        {modalities.length === 0 ? (
          <EmptyState>
            Aucune modalité d'évaluation pour ce programme. Cochez-en dans le Concepteur de
            programme, ou créez-en une sur mesure ci-dessous.
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {ORDRE_DES_USAGES.map((usage) => (
              <GroupeParUsage
                key={usage}
                usage={usage}
                modalities={modalities.filter((m) => m.usage === usage)}
                editable={editable}
                onArchived={onChanged}
              />
            ))}
          </div>
        )}
      </PanelCard>

      {editable ? (
        <PanelCard
          title="Créer une modalité sur mesure"
          description="Pour ce que le catalogue du Concepteur ne propose pas. Nom, format, présentiel ou en ligne, et ce que l'épreuve engage."
        >
          <AssessmentModalityForm
            programId={programId}
            hint="La modalité créée apparaît immédiatement ci-dessus, dans le Concepteur de programme et dans le pilotage."
            onCreated={() => onChanged?.()}
          />
        </PanelCard>
      ) : null}

      {children}

      {/*
        LE PANNEAU QUI DIT CE QUI MANQUE, à la place de trois panneaux qui
        faisaient SEMBLANT de l'avoir.
      */}
      <PanelCard
        title="Promotions concernées, et calendrier des épreuves"
        description="Ces modalités valent pour toutes les promotions du programme. Aucune ne porte encore de date."
      >
        {cohorts.length === 0 ? (
          <EmptyState>Aucune promotion ouverte sur ce programme.</EmptyState>
        ) : (
          <ul className="mb-4 space-y-2">
            {cohorts.map((cohort) => (
              <li
                key={cohort.id}
                className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
              >
                <Users className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="font-medium">{cohort.label}</span>
                <Badge variant="outline" className="font-normal">
                  {cohort.academicYear}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {cohort.learnerCount} apprenant(s)
                </Badge>
                <span className="text-muted-foreground text-xs">
                  du {formatFrDate(cohort.startsOn)} au {formatFrDate(cohort.endsOn)}
                </span>
                <Badge variant="secondary" className="font-normal">
                  aucune épreuve datée
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-sm">
          Les dates ci-dessus sont celles du stage. Une modalité décrit{" "}
          <strong>comment</strong> on évalue, jamais <strong>quand</strong> ni pour quelle
          promotion : programmer une épreuve — date, convocation, résultats — demande une table
          de sessions qui n'existe pas encore.
        </p>
        <p className="text-muted-foreground mt-3 text-sm">
          Conséquence à connaître : <strong>l'étudiant ne voit aucune de ces modalités</strong>. La
          lecture de ce référentiel est réservée à l'équipe pédagogique, et son onglet « Mes
          évaluations » ne présente pour l'instant que les ECOS virtuels.
        </p>
      </PanelCard>
    </div>
  );
}
