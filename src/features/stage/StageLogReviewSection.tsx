import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Inbox, RotateCcw } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import { STAGE_LOG_STATUS_LABELS_FR, nextStageLogStatus } from "@/domain/stageLog";
import * as fx from "@/infrastructure/mock/fixtures";

/**
 * Vue mock « Carnets à valider » : un encadrant ne voit que les carnets
 * rattachés aux stages dont il est responsable.
 */
export function StageLogsToValidate() {
  const dataAccess = useDataAccess();
  const { person, rolesInActiveProgram, activeProgram } = useSession();

  const { data, isPending } = useQuery({
    queryKey: ["stage-logs-to-validate", person.id, activeProgram.id],
    queryFn: async () => {
      const mine = fx.placementAssignments
        .filter((a) => a.supervisorPersonId === person.id)
        .map((a) => a.id);
      return dataAccess.stageLogs.listLogsToValidate(mine);
    },
  });

  const isValidator =
    rolesInActiveProgram.includes("placement_supervisor") ||
    rolesInActiveProgram.includes("teacher");

  if (!isValidator) return null;
  if (isPending || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <section className="space-y-4" aria-labelledby="titre-a-valider">
      <SectionHeading
        id="titre-a-valider"
        title="Carnets à valider"
        description="Carnets soumis par les apprenants des stages dont vous êtes responsable."
        action={
          <Badge variant="outline" className="font-normal">
            Simulé
          </Badge>
        }
      />
      <ul className="grid gap-3">
        {data.map((log) => {
          const learner = fx.people.find(
            (p) => p.id === fx.enrollments.find((e) => e.id === log.enrollmentId)?.personId,
          );
          const canValidate = !!nextStageLogStatus(log.status, "validate", rolesInActiveProgram);
          return (
            <li key={log.id}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{learner?.fullName ?? "Apprenant"}</CardTitle>
                  <CardDescription>
                    {log.entries.length} entrée(s) · état : {STAGE_LOG_STATUS_LABELS_FR[log.status]}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" className="gap-1" disabled={!canValidate}>
                    <CheckCircle2 className="size-4" aria-hidden />
                    Valider (simulé)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={!canValidate}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                    Demander une correction (simulé)
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    La validation humaine est la seule source d'acquisition d'une compétence réelle.
                  </span>
                </CardContent>
              </Card>
            </li>
          );
        })}
        {data.length === 0 ? (
          <li className="text-sm text-muted-foreground">Aucun carnet en attente de validation.</li>
        ) : null}
      </ul>
    </section>
  );
}

/** Vue mock « Carnets reçus » : espace interne de l'administration du programme. */
export function StageLogsReceived() {
  const dataAccess = useDataAccess();
  const { activeProgram } = useSession();

  const { data, isPending } = useQuery({
    queryKey: ["stage-logs-received", activeProgram.id],
    queryFn: () => dataAccess.stageLogs.listLogsReceived(activeProgram.id),
  });

  if (isPending || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <section className="space-y-4" aria-labelledby="titre-recus">
      <SectionHeading
        id="titre-recus"
        title="Carnets reçus"
        description="Transmission interne à l'application : aucun carnet n'est envoyé en pièce jointe par e-mail."
        action={
          <Badge variant="outline" className="font-normal">
            Simulé
          </Badge>
        }
      />
      <ul className="grid gap-3">
        {data.map((log) => {
          const learner = fx.people.find(
            (p) => p.id === fx.enrollments.find((e) => e.id === log.enrollmentId)?.personId,
          );
          return (
            <li key={log.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Inbox className="size-4 text-primary" aria-hidden />
                    <CardTitle className="text-base">{learner?.fullName ?? "Apprenant"}</CardTitle>
                    <Badge variant="secondary" className="font-normal">
                      {STAGE_LOG_STATUS_LABELS_FR[log.status]}
                    </Badge>
                  </div>
                  <CardDescription>
                    Modèle {log.templateId} · version {log.templateVersion} ·{" "}
                    {log.entries.length} entrée(s)
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {log.validations.length > 0
                    ? `Validé par ${
                        fx.people.find((p) => p.id === log.validations[0]!.validatorPersonId)
                          ?.fullName ?? "responsable"
                      } le ${new Date(log.validations[0]!.decidedAt).toLocaleDateString("fr-FR")}.`
                    : "En attente de validation du responsable de stage."}
                </CardContent>
              </Card>
            </li>
          );
        })}
        {data.length === 0 ? (
          <li className="text-sm text-muted-foreground">Aucun carnet reçu pour ce programme.</li>
        ) : null}
      </ul>
    </section>
  );
}
