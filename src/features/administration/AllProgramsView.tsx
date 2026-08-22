/**
 * « Tous les programmes » — vue en blocs des programmes réellement administrés
 * par la personne connectée. Elle ne donne aucun accès supplémentaire :
 * seuls les programmes où un rôle d'administrateur existe sont affichés.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useDataAccess, useSession } from "@/application/session";
import { canAccessProgramAdministration } from "@/domain/access";
import {
  COHORT_PHASE_LABELS_FR,
  buildAdministeredProgramCards,
  formatFrDate,
} from "@/features/administration/adminProgramViewModel";

export function AllProgramsView() {
  const data = useDataAccess();
  const session = useSession();
  const navigate = useNavigate();

  const { data: cohorts, isPending } = useQuery({
    queryKey: ["all-programs-cohorts"],
    queryFn: () => data.programs.listCohorts(),
  });

  if (isPending || !cohorts) return <Skeleton className="h-64 w-full" />;

  const cards = buildAdministeredProgramCards(session.programs, cohorts, (programId) =>
    canAccessProgramAdministration(session.roles, programId),
  );

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Tous les programmes"
        level={1}
        action={<MockBadge />}
        description="Vue d'ensemble des programmes que vous administrez, avec leur classe active et leur prochaine échéance."
      />

      <ScopeNotice>
        Cette vue n'ouvre aucun droit supplémentaire : elle liste uniquement les programmes où vous
        possédez un rôle d'administrateur. Sélectionner un programme replace tout l'espace sur ce
        périmètre.
      </ScopeNotice>

      {cards.length === 0 ? (
        <EmptyState>Vous n'administrez aucun programme.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <PanelCard
              key={card.program.id}
              title={card.program.name}
              description={`${card.program.institution} · ${card.program.code}`}
            >
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal">
                    {card.cohortCount} classe(s)
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {card.learnerCount} apprenants
                  </Badge>
                  {card.phase ? (
                    <Badge variant="secondary" className="font-normal">
                      {COHORT_PHASE_LABELS_FR[card.phase]}
                    </Badge>
                  ) : null}
                </div>

                {card.activeCohort ? (
                  <div className="space-y-1">
                    <p className="font-medium">{card.activeCohort.label}</p>
                    <Progress value={card.progressPercent} />
                    <p className="text-muted-foreground text-xs">
                      Avancement calendaire {card.progressPercent} %
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Aucune classe programmée.</p>
                )}

                {card.nextDeadline ? (
                  <p className="text-muted-foreground text-xs">
                    Prochaine échéance : {card.nextDeadline.label} le{" "}
                    {formatFrDate(card.nextDeadline.date)}
                  </p>
                ) : null}

                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11 w-full"
                  onClick={() => {
                    session.setActiveProgramId(card.program.id);
                    void navigate({ to: "/espace/administration" });
                  }}
                >
                  Ouvrir ce programme
                </Button>
              </div>
            </PanelCard>
          ))}
        </div>
      )}
    </div>
  );
}
