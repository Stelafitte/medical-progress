/**
 * « Vue d'ensemble » du programme.
 *
 * Suite de l'audit : la promotion observée est explicite (plus d'agrégat
 * implicite), la prochaine échéance est affichée, chaque tâche et chaque alerte
 * ouvre l'écran qui permet d'agir, et les deux fonctions jusqu'ici
 * inatteignables — statistiques pluriannuelles et crédits IA — sont accessibles
 * depuis cet écran.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, CalendarClock } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { ProgramAiSettingsSection } from "@/features/administration/ProgramAiSettingsSection";
import { useProgramAdmin, personNameFor } from "@/features/administration/useProgramAdmin";
import { AdminChargement } from "@/features/administration/AdminChargement";
import { LearnerTrackingSection } from "@/features/administration/LearnerTrackingSection";
import {
  buildPilotTimeline,
  defaultPilotCohortId,
  formatFrDate,
  nextMilestone,
} from "@/features/administration/adminProgramViewModel";
import { useSession } from "@/application/session";
import { setCohortFocus, useCohortFocus } from "@/application/cohortFocusStore";
import { CERTIFICATE_STATUS_LABELS_FR } from "@/domain/administration";
import {
  ASSESSMENT_MODE_LABELS_FR,
  ASSESSMENT_SUBTYPE_LABELS_FR,
  ASSESSMENT_USAGE_LABELS_FR,
  type AssessmentUsage,
} from "@/domain/assessmentModality";

/**
 * L'ORDRE DES GENRES N'EST PAS ALPHABÉTIQUE, IL EST CROISSANT EN ENJEU.
 * Ce qu'une épreuve ENGAGE est la première chose à lire : on s'entraîne sans
 * conséquence, puis on est commenté, puis on valide, puis on certifie. C'est
 * l'ordre de l'atelier des évaluations ; le tableau de bord ne doit pas en
 * inventer un autre.
 */
const GENRES_PAR_ENJEU: readonly AssessmentUsage[] = [
  "self_assessment",
  "formative",
  "validation_exam",
  "certification",
];

const TASK_PRIORITY_FR: Record<string, string> = {
  high: "prioritaire",
  medium: "à planifier",
  low: "secondaire",
};

export function AdminDashboard() {
  const { activeProgram } = useSession();
  const { data, isPending, error } = useProgramAdmin();
  /*
   * LA PROMOTION EST CHOISIE UNE FOIS, PAS UNE FOIS PAR ONGLET (17/09).
   * Chaque écran gardait son propre `useState` : on choisissait une promotion
   * dans Évaluations, et le Pilotage l'ignorait. Sept écrans, sept vérités.
   */
  const cohortId = useCohortFocus();

  if (isPending || !data) return <AdminChargement error={error} />;

  const selectedId = cohortId ?? defaultPilotCohortId(data.cohorts);
  const pilotSearch = selectedId ? { promotion: selectedId } : {};
  const cohort = data.cohorts.find((c) => c.id === selectedId);
  const cohortLabel = cohort?.label ?? "cohorte";
  const timeline = buildPilotTimeline(data.planSchedule, cohort);
  const next = nextMilestone(timeline);

  const enrollmentsOfCohort = data.enrollments.filter((e) => e.cohortId === selectedId);
  const enrollmentIds = new Set(enrollmentsOfCohort.map((e) => e.id));
  const certificates = data.certificates.filter((c) => enrollmentIds.has(c.enrollmentId));
  const missingDocuments = data.documents.filter((d) => d.status !== "received").length;

  /*
   * LES ÉVALUATIONS DE LA PROMOTION OBSERVÉE (Stef, 17/09 : « un bloc sur les
   * évaluations disponibles, genre et type »).
   *
   * On part des RATTACHEMENTS, pas du catalogue : une modalité existe pour le
   * programme, mais seule celle qui est servie à cette promotion la concerne.
   * C'est la même règle que côté étudiant — « une modalité non cochée pour sa
   * promotion lui reste invisible ».
   */
  const evaluationsServies = data.cohortAssessmentLinks
    .filter((link) => link.cohortId === selectedId)
    .flatMap((link) => {
      const modality = data.assessmentModalities.find((m) => m.id === link.modalityId);
      /* Un rattachement sans modalité ne se devine pas : on l'omet. */
      return modality ? [{ link, modality }] : [];
    });

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Administration du programme"
        level={1}
        description={`Vue d'ensemble de ${activeProgram.name}, promotion par promotion. Un seul moteur, plusieurs programmes configurés.`}
      />

      <ScopeNotice>
        Périmètre strictement limité à {activeProgram.name}. Les chiffres ci-dessous se lisent pour
        la promotion sélectionnée : aucun agrégat implicite entre promotions.
      </ScopeNotice>

      <CohortSelector
        cohorts={data.cohorts}
        value={selectedId}
        onChange={setCohortFocus}
        label="Promotion observée"
      />

      <PanelCard
        title="Prochaine échéance du programme"
        description="Premier jalon non passé de la chronologie du programme et de la promotion observée."
        action={<CalendarClock className="text-primary size-5" aria-hidden />}
      >
        {next ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{formatFrDate(next.date)}</span>
            <span className="font-medium">{next.label}</span>
            <Badge variant="outline" className="font-normal">
              {next.origin === "cohort" ? "jalon de promotion" : "jalon de programme"}
            </Badge>
            {next.official ? (
              <Badge variant="secondary" className="font-normal">
                date officielle
              </Badge>
            ) : null}
            <Button asChild size="sm" variant="outline" className="min-h-11">
              <Link to="/espace/administration/pilotage" search={pilotSearch}>
                Ouvrir la chronologie
                <ArrowRight className="ms-1 size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        ) : (
          <EmptyState>Aucune échéance à venir pour cette promotion.</EmptyState>
        )}
      </PanelCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Apprenants — ${cohortLabel}`}
          value={cohort?.learnerCount ?? enrollmentsOfCohort.length}
          hint={`${data.cohorts.length} promotion(s) sur ce programme`}
        />
        <StatCard
          label="Stages"
          value={data.assignments.length}
          hint={`${data.placements.length} terrain(s) configuré(s)`}
        />
        <StatCard
          label="Carnets reçus"
          value={data.logsReceived.length}
          hint="validés puis transmis en interne"
        />
        <StatCard
          label="Pièces à obtenir"
          value={missingDocuments}
          hint="demandées ou manquantes"
        />
      </div>

      <div className="space-y-4">
        <PanelCard
          title="Tâches prioritaires et échéances"
          description="Chaque tâche ouvre l'écran qui permet d'agir."
        >
          {data.tasks.length === 0 ? (
            <EmptyState>Aucune tâche.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.tasks.map((task) => (
                <li
                  key={task.id}
                  className="border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4"
                >
                  <span>{task.label}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={task.priority === "high" ? "destructive" : "outline"}
                      className="font-normal"
                    >
                      {TASK_PRIORITY_FR[task.priority] ?? task.priority}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatFrDate(task.dueOn)}
                    </span>
                    <Button asChild size="sm" variant="ghost" className="min-h-11">
                      <Link to="/espace/administration/pilotage" search={pilotSearch}>
                        Traiter
                        <ArrowRight className="ms-1 size-4" aria-hidden />
                      </Link>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>

      {/*
        LES ALERTES NE SONT PLUS UNE LISTE (Stef, 21/09 : « illisible »). Elles
        deviennent une colonne de la matrice de la promotion : une ligne par
        apprenant, ses axes en couleur, sa dernière connexion, ses signaux.
      */}
      <LearnerTrackingSection data={data} cohortId={selectedId} showCohortSelector={false} />

      <PanelCard
        title={`Validations et certificats — ${cohortLabel}`}
        description="Avancement du workflow de complétude pour la promotion observée."
      >
        {certificates.length === 0 ? (
          <EmptyState>Aucun certificat suivi pour cette promotion.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {certificates.map((c) => (
              <li
                key={c.id}
                className="border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4"
              >
                <span>{personNameFor(data, c.enrollmentId)}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="font-normal">
                    {CERTIFICATE_STATUS_LABELS_FR[c.status]}
                  </Badge>
                  <Button asChild size="sm" variant="ghost" className="min-h-11">
                    <Link to="/espace/administration/documents">
                      Ouvrir les documents
                      <ArrowRight className="ms-1 size-4" aria-hidden />
                    </Link>
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title={`Évaluations disponibles — ${cohortLabel}`}
        description="Ce que cette promotion rencontre : le genre de l'épreuve — ce qu'elle engage — et son type."
        action={
          <Button asChild size="sm" variant="ghost" className="min-h-11">
            <Link to="/espace/administration/evaluations">
              Ouvrir l'atelier
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
        }
      >
        {evaluationsServies.length === 0 ? (
          <EmptyState>
            Aucune évaluation servie à cette promotion. L'atelier des évaluations propose le
            catalogue : cocher une ligne suffit à la lui servir.
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {GENRES_PAR_ENJEU.map((genre) => {
              const lignes = evaluationsServies.filter((l) => l.modality.usage === genre);
              if (lignes.length === 0) return null;
              return (
                <div key={genre} className="space-y-2">
                  <p className="text-xs font-medium">
                    {ASSESSMENT_USAGE_LABELS_FR[genre]}{" "}
                    <span className="text-muted-foreground font-normal">
                      · {lignes.length} servie(s)
                    </span>
                  </p>
                  <ul className="space-y-2 text-sm">
                    {lignes.map(({ link, modality }) => (
                      <li
                        key={modality.id}
                        className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-4"
                      >
                        <strong className="min-w-0 flex-1 font-medium">{modality.name}</strong>
                        <Badge variant="secondary" className="font-normal">
                          {ASSESSMENT_SUBTYPE_LABELS_FR[modality.subtype]}
                        </Badge>
                        <Badge variant="outline" className="font-normal">
                          {ASSESSMENT_MODE_LABELS_FR[modality.mode]}
                        </Badge>
                        {link.isOpen ? null : (
                          <Badge variant="outline" className="text-muted-foreground font-normal">
                            fermé pour l'instant
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </PanelCard>

      <PanelCard
        title="Statistiques pluriannuelles"
        description="Comparaison des promotions successives du programme : réussite, assiduité, carnets reçus."
        action={<BarChart3 className="text-primary size-5" aria-hidden />}
      >
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/espace/statistiques">
            Ouvrir les statistiques du programme
            <ArrowRight className="ms-1 size-4" aria-hidden />
          </Link>
        </Button>
      </PanelCard>

      {/*
        LE SEUL COMPTEUR IA DE CET ECRAN, ET IL EST REEL
        (`program_ai_settings`, `program_ai_usage_this_month`).

        `AiCreditsSection` etait montee ici jusqu'au 09/09 : une comptabilite
        analytique de MAQUETTE — enveloppes par periode, paliers de modele,
        mode vocal — dont rien n'existe en base, et dont le modele est
        incompatible avec `monthly_credit_cap` (un plafond par apprenant et par
        mois). Elle portait son badge, mais un badge n'empeche pas de lire un
        chiffre : deux comptabilites IA l'une sous l'autre, dont une inventee,
        se lisent comme deux mesures du meme objet.

        DEBRANCHEE, PAS SUPPRIMEE (decision de Stef, 09/09) : le composant et
        ses fixtures restent dans le depot. Le jour ou la repartition par
        palier, par promotion et par mode aura une source reelle, la maquette
        dit deja a quoi elle doit ressembler.
      */}
      <ProgramAiSettingsSection />
    </div>
  );
}
