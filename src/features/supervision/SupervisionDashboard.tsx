import { Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { aConfirmer, learnerName, useSupervision } from "@/features/supervision/useSupervision";
import { useSession } from "@/application/session";
import { EquipeDuProgramme } from "@/features/supervision/EquipeDuProgramme";

const STATUS_FR: Record<string, string> = {
  planned: "à venir",
  in_progress: "en cours",
  completed: "terminé",
  cancelled: "annulé",
};

/**
 * Vue d'ensemble de l'encadrement.
 *
 * LES ALERTES N'ONT PLUS D'ONGLET (décision de Stef, 10/09) : un signal qui vit
 * dans sa propre page devient une seconde boîte que personne n'ouvre. Les
 * compteurs sont posés là où le geste se fait -- carnets et compétences.
 */
export function SupervisionDashboard() {
  const { activeProgram } = useSession();
  const { data, isPending } = useSupervision();

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const inProgress = data.assignments.filter((a) => a.status === "in_progress");
  const planned = data.assignments.filter((a) => a.status === "planned");
  const completed = data.assignments.filter((a) => a.status === "completed");
  const pendingConfirmations = data.enrollments.reduce((n, e) => n + aConfirmer(data, e.id), 0);
  /* Un stage est clos quand une decision couvre TOUTE sa periode : la meme
     regle que l'onglet Bilans, pas un second compteur qui divergerait. */
  const bilansNonSignes = data.logsToValidate.filter(
    (log) =>
      log.periodStartsOn &&
      log.periodEndsOn &&
      !log.validations.some(
        (v) =>
          v.coversFrom.slice(0, 10) === log.periodStartsOn!.slice(0, 10) &&
          v.coversTo.slice(0, 10) === log.periodEndsOn!.slice(0, 10),
      ),
  ).length;

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Espace encadrant"
        level={1}
        description={`Encadrement clinique pour ${activeProgram.name}.`}
      />

      <ScopeNotice>
        Périmètre limité aux étudiants affectés à vos stages ({data.enrollmentIds.length}{" "}
        étudiant(s) encadré(s)). Les autres étudiants du programme ne sont jamais chargés ni
        affichés.
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Étudiants encadrés" value={data.enrollmentIds.length} />
        <StatCard
          label="Stages"
          value={`${inProgress.length} en cours`}
          hint={`${planned.length} à venir · ${completed.length} terminé(s)`}
        />
        <StatCard
          label="Carnets à décider"
          value={data.logsToValidate.length}
          hint="jours de présence déclarés"
        />
        <StatCard
          label="Compétences à confirmer"
          value={pendingConfirmations}
          hint="aucune acquisition sans validation humaine"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title="Tâches à traiter"
          description="Aucune action groupée n'est exécutée sans revue explicite de la synthèse."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/espace/encadrement/carnets">Ouvrir les carnets</Link>
            </Button>
          }
        >
          <ul className="space-y-2">
            <li className="flex items-center justify-between gap-3">
              <span>Carnets soumis à décider</span>
              <Badge variant="secondary">{data.logsToValidate.length}</Badge>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Compétences réelles à confirmer</span>
              <Badge variant="secondary">{pendingConfirmations}</Badge>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Bilans de fin de stage non signés</span>
              <Badge variant="secondary">{bilansNonSignes}</Badge>
            </li>
          </ul>
        </PanelCard>

        <PanelCard
          title="Mes stages"
          description="Périodes et terrains dont vous êtes responsable."
        >
          {data.assignments.length === 0 ? (
            <EmptyState>Aucune affectation dans ce programme.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {data.assignments.map((assignment) => {
                const placement = data.placements.find((p) => p.id === assignment.placementId);
                return (
                  <li key={assignment.id} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{placement?.name ?? "Stage"}</span>
                      <Badge variant="outline" className="font-normal">
                        {STATUS_FR[assignment.status]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {learnerName(data, assignment.enrollmentId)} ·{" "}
                      {new Date(assignment.startsOn).toLocaleDateString("fr-FR")} —{" "}
                      {new Date(assignment.endsOn).toLocaleDateString("fr-FR")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </PanelCard>

        <EquipeDuProgramme scope={data} />
      </div>
    </div>
  );
}
