import { CalendarDays, MapPin, ShieldCheck, Stethoscope } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { useSession } from "@/application/session";
import { ROLE_LABELS_FR, rolesInContext } from "@/domain/roles";

const STATUS_FR: Record<string, string> = {
  planned: "à venir",
  in_progress: "en cours",
  completed: "terminé",
  cancelled: "annulé",
};

export function StageView() {
  const { activeProgram, activeEnrollment, roles } = useSession();
  const { data, isPending } = useLearnerPassport();

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  const { placements, assignments, evidence } = data;

  if (!activeProgram.config.placementsEnabled) {
    return (
      <div className="space-y-4">
        <SectionHeading
          title="Stage"
          level={1}
        level={1}
          description="Ce programme ne comporte pas de terrain clinique configuré."
        />
        <Card>
          <CardHeader>
            <Badge variant="outline" className="w-fit font-normal">
              Non applicable
            </Badge>
            <CardDescription>
              Les stages sont désactivés pour {activeProgram.name}. Le module reste disponible pour
              les programmes qui l'activent.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Stage"
        level={1}
        description="Affectations, encadrants et preuves rattachées au terrain clinique."
      />

      <ul className="grid gap-4">
        {assignments.map((assignment) => {
          const placement = placements.find((p) => p.id === assignment.placementId);
          const linked = evidence.filter((e) => e.placementAssignmentId === assignment.id);
          const contextRoles = rolesInContext(roles, {
            programId: activeProgram.id,
            cohortId: activeEnrollment.cohortId,
            placementId: assignment.placementId,
          });

          return (
            <li key={assignment.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Stethoscope className="size-5 text-primary" aria-hidden />
                    <CardTitle className="text-base">
                      {placement?.name ?? "Stage inconnu"}
                    </CardTitle>
                    <Badge variant="outline" className="font-normal">
                      {STATUS_FR[assignment.status]}
                    </Badge>
                  </div>
                  <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden />
                      {placement ? `${placement.site} · ${placement.department}` : "—"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3.5" aria-hidden />
                      {new Date(assignment.startsOn).toLocaleDateString("fr-FR")} —{" "}
                      {new Date(assignment.endsOn).toLocaleDateString("fr-FR")}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p className="inline-flex items-center gap-2">
                    <ShieldCheck className="size-4 text-success" aria-hidden />
                    {linked.length} preuve(s) de terrain rattachée(s) à cette affectation.
                  </p>
                  <p>
                    Vos rôles dans ce contexte :{" "}
                    {contextRoles.map((r) => ROLE_LABELS_FR[r]).join(", ") || "aucun"}
                  </p>
                  <p className="text-xs">
                    Simulé : la saisie d'un geste et la contre-signature de l'encadrant seront
                    ajoutées lors d'une prochaine itération.
                  </p>
                </CardContent>
              </Card>
            </li>
          );
        })}
        {assignments.length === 0 ? (
          <li className="text-sm text-muted-foreground">Aucune affectation pour l'instant.</li>
        ) : null}
      </ul>
    </div>
  );
}
