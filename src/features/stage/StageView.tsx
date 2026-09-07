/**
 * « Mon carnet de stage », côté apprenant.
 *
 * L'écran part désormais des CARNETS de l'étudiant, plus de ses affectations :
 * la table d'affectation n'existe pas, et le rattachement passe par les groupes
 * d'encadrement depuis le 31/08. Un carnet est ouvert pour chaque inscrit au
 * moment où sa promotion est rattachée à un terrain.
 *
 * Le contenu affiché est réel : ce fichier ne lit plus aucune donnée simulée.
 */
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Stethoscope } from "lucide-react";
import { FieldHeader } from "@/components/field-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { useDataAccess, useSession } from "@/application/session";
import { StageLogWeek } from "@/features/stage/StageLogWeek";
import { StageLogsToValidate } from "@/features/stage/StageLogReviewSection";
import type { PlacementId } from "@/domain/types";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function StageView() {
  const { activeProgram, activeEnrollment } = useSession();
  const dataAccess = useDataAccess();
  const passport = useLearnerPassport();

  const enrollmentId = activeEnrollment?.id;

  const logs = useQuery({
    queryKey: ["stage-logs-mine", enrollmentId],
    enabled: enrollmentId !== undefined,
    queryFn: () => dataAccess.stageLogs.listLogsForEnrollment(enrollmentId!),
  });

  if (!activeEnrollment) {
    return (
      <p className="text-muted-foreground text-sm">Aucune inscription active pour ce programme.</p>
    );
  }

  if (!activeProgram.config.placementsEnabled) {
    return (
      <div className="space-y-4">
        <FieldHeader eyebrow={activeProgram.name} title="Mon carnet de stage" />
        <Card>
          <CardHeader>
            <Badge variant="outline" className="w-fit font-normal">
              Non applicable
            </Badge>
            <CardDescription>
              Les stages sont désactivés pour {activeProgram.name}. Vos compétences restent
              accessibles dans « Mes compétences » : elles ne dépendent pas du module stages.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (logs.isPending || passport.isPending || !passport.data) {
    return <Skeleton className="h-64 w-full" />;
  }

  const placements = passport.data.placements;
  const myLogs = logs.data ?? [];

  return (
    <div className="space-y-8">
      <FieldHeader
        eyebrow={activeProgram.name}
        title="Mon carnet de stage"
        figures={[
          { value: myLogs.length, label: myLogs.length > 1 ? "carnets ouverts" : "carnet ouvert" },
        ]}
      />
      <p className="-mt-3 text-sm text-muted-foreground">
        Cochez les journées où vous étiez présent, et racontez ce que vous avez fait. Votre
        encadrant valide par périodes.
      </p>

      {myLogs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>
              Aucun carnet n'est encore ouvert à votre nom. Il l'est par l'administration du
              programme au moment où votre promotion est rattachée à un terrain de stage.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-4">
          {myLogs.map((log) => {
            const placement = placements.find((p) => p.id === log.placementId);
            return (
              <li key={log.id}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <Stethoscope className="text-primary size-5" aria-hidden />
                      <CardTitle className="text-base">{placement?.name ?? "Stage"}</CardTitle>
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden />
                        {placement ? `${placement.site} · ${placement.department}` : "—"}
                      </span>
                      {log.periodStartsOn && log.periodEndsOn ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3.5" aria-hidden />
                          {DATE_FORMAT.format(new Date(log.periodStartsOn))} —{" "}
                          {DATE_FORMAT.format(new Date(log.periodEndsOn))}
                        </span>
                      ) : null}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <StageLogWeek
                      enrollmentId={activeEnrollment.id}
                      placementId={(log.placementId ?? "") as PlacementId}
                      placementName={placement?.name ?? "Stage"}
                    />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <StageLogsToValidate />
    </div>
  );
}
