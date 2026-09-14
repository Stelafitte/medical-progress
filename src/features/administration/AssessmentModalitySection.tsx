/**
 * Bloc UNIQUE des évaluations d'un programme.
 *
 * Même contenu dans l'onglet « Évaluations » et dans la partie Évaluation du
 * pilotage de programme.
 *
 * CE QUI A ÉTÉ RETIRÉ LE 14/09, ET POURQUOI.
 *
 * Trois panneaux de maquette occupaient les deux tiers de l'écran : un import
 * de résultats dont le bouton disait « (simulé) », et « Évaluations réalisées »
 * / « Évaluations à venir » par cohorte, avec dates, moyennes et taux de
 * réussite — tout cela fabriqué par `sessionFixturesFor`. Un `MockBadge` le
 * signalait ; il ne suffisait pas. Stef lisait un calendrier d'épreuves qui
 * n'existait dans aucune table, et l'écran ne disait nulle part que la chose
 * qu'il cherchait — QUAND se passe quoi — n'était pas modélisée.
 *
 * Ce qui reste est vrai : le référentiel des modalités, lu dans
 * `assessment_modalities`, et sa création. Ce qui manque est DIT, à l'endroit
 * où on le cherche, plutôt que mimé.
 */
import { Badge } from "@/components/ui/badge";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import {
  ASSESSMENT_MODE_LABELS_FR,
  ASSESSMENT_SUBTYPE_LABELS_FR,
  ASSESSMENT_USAGE_LABELS_FR,
  type AssessmentModality,
  type AssessmentUsage,
} from "@/domain/assessmentModality";
import { AssessmentModalityForm } from "@/features/administration/AssessmentModalityForm";
import type { ProgramId } from "@/domain/types";

/**
 * L'ordre PÉDAGOGIQUE, pas l'ordre alphabétique : ce que l'étudiant fait seul,
 * puis ce qu'on lui demande, puis ce qui l'engage. C'est la distinction que
 * Stef a posée le 13/09 et que la base porte depuis le 27/08 sans que rien ne
 * l'affiche.
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

function ModalityCard({ modality }: { modality: AssessmentModality }) {
  const horsParcours = modality.retainedAt === undefined;
  return (
    <li className="border-border rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">{modality.name}</strong>
        <Badge variant="secondary">{ASSESSMENT_SUBTYPE_LABELS_FR[modality.subtype]}</Badge>
        <Badge variant="outline">{ASSESSMENT_MODE_LABELS_FR[modality.mode]}</Badge>
        {/*
          « Hors parcours » se dit, « retenue » se tait : c'est l'état normal.
          Un badge sur chaque ligne ne distinguerait plus rien.
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
      <p className="text-muted-foreground mt-2 text-xs">
        Créée le {formatFrDate(modality.createdAt)}
      </p>
    </li>
  );
}

function GroupeParUsage({
  usage,
  modalities,
}: {
  readonly usage: AssessmentUsage;
  readonly modalities: readonly AssessmentModality[];
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
        Un groupe VIDE reste affiché. « Aucune auto-évaluation » n'est pas un
        blanc à masquer : c'est le trou que le concepteur doit voir dans sa
        maquette pédagogique.
      */}
      {modalities.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-md border border-dashed px-3 py-2.5 text-xs">
          Rien de prévu à ce titre pour ce programme.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {modalities.map((modality) => (
            <ModalityCard key={modality.id} modality={modality} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AssessmentModalitySection({
  programId,
  modalities,
  onModalityCreated,
  showCreation = true,
}: {
  readonly programId: ProgramId;
  /** Modalités du programme, lues depuis `dataAccess.assessments.listAssessmentModalities`. */
  readonly modalities: readonly AssessmentModality[];
  /** Rafraîchit la liste après la création d'une modalité (voir `showCreation`). */
  readonly onModalityCreated?: () => void;
  /** `false` dans le pilotage : les modalités se créent dans « Évaluations ». */
  readonly showCreation?: boolean;
}) {
  return (
    <div className="space-y-6">
      <PanelCard
        title="Ce que l'étudiant rencontrera"
        description="Les modalités d'évaluation du programme, rangées par ce qu'elles engagent. Chaque ligne dit son format et si elle se passe en présentiel ou en ligne."
      >
        {modalities.length === 0 ? (
          <EmptyState>Aucune modalité d'évaluation définie pour ce programme.</EmptyState>
        ) : (
          <div className="space-y-5">
            {ORDRE_DES_USAGES.map((usage) => (
              <GroupeParUsage
                key={usage}
                usage={usage}
                modalities={modalities.filter((m) => m.usage === usage)}
              />
            ))}
          </div>
        )}
      </PanelCard>

      {showCreation ? (
        <PanelCard
          title="Créer une modalité d'évaluation"
          description="Nom, format (dix-huit, de la KFP à l'ECOS), présentiel ou en ligne, et ce que l'épreuve engage."
        >
          <AssessmentModalityForm
            programId={programId}
            hint="La modalité créée apparaît immédiatement ci-dessus et dans la partie Évaluation du pilotage de programme."
            onCreated={() => onModalityCreated?.()}
          />
        </PanelCard>
      ) : null}

      {/*
        LE PANNEAU QUI DIT CE QUI MANQUE.
        Il remplace trois panneaux qui faisaient SEMBLANT de l'avoir. Tant que
        la table des sessions n'existe pas, deux conséquences se voient ici :
        aucune date n'est programmable, et l'étudiant ne voit rien de tout ceci
        — la policy de `assessment_modalities` est réservée à l'équipe.
      */}
      <PanelCard
        title="Calendrier des épreuves"
        description="Les dates de passage ne sont pas encore modélisées."
      >
        <p className="text-muted-foreground text-sm">
          Une modalité décrit <strong>comment</strong> on évalue, jamais <strong>quand</strong> ni
          pour quelle promotion. Programmer une épreuve — date, convocation, résultats, moyenne —
          demande une table de sessions qui n'existe pas encore.
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
