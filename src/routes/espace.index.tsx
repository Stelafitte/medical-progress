import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, ClipboardCheck, Flag, Stethoscope, TrendingUp } from "lucide-react";
import { useSession } from "@/application/session";
import { MasteryBadge, NatureBadge } from "@/components/mastery-badge";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";

const PLACEMENT_STATUS_FR: Record<string, string> = {
  planned: "à venir",
  in_progress: "en cours",
  completed: "terminé",
  cancelled: "annulé",
};

export const Route = createFileRoute("/espace/")({
  head: () => ({
    meta: [
      { title: "Tableau de bord apprenant — Passeport Éducatif Médical" },
      {
        name: "description",
        content:
          "Aujourd'hui, cette semaine, jalons, progression et stage : le pilotage quotidien de l'apprenant.",
      },
      { property: "og:title", content: "Tableau de bord apprenant — Passeport Éducatif Médical" },
      {
        property: "og:description",
        content: "Aujourd'hui, cette semaine, jalons, progression et stage.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { activeProgram, person } = useSession();
  const { data, isPending } = useLearnerPassport();

  if (isPending || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { progress, summary, resources, assignments, placements, evidence } = data;
  const currentAssignment = assignments.find((a) => a.status === "in_progress") ?? assignments[0];
  const currentPlacement = placements.find((p) => p.id === currentAssignment?.placementId);
  const pending = evidence.filter((e) => e.status === "submitted");
  const nextTargets = progress.filter((p) => !p.meetsTarget).slice(0, 3);

  return (
    <div className="space-y-10">
      <header className="surface-panel p-6">
        <p className="text-sm text-muted-foreground">{activeProgram.name}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Bonjour {person.fullName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Votre passeport regroupe connaissances, compétences simulées et compétences réelles
          validées. Les compétences réelles nécessitent toujours la validation d'un encadrant.
        </p>
      </header>

      <section aria-labelledby="titre-aujourdhui">
        <SectionHeading
          id="titre-aujourdhui"
          title="Aujourd'hui"
          description="Les deux ou trois actions qui font avancer le passeport aujourd'hui."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {resources.slice(0, 2).map((resource) => (
            <Card key={resource.id}>
              <CardHeader>
                <Badge variant="outline" className="w-fit font-normal">
                  {resource.format}
                </Badge>
                <CardTitle className="text-base">{resource.title}</CardTitle>
                <CardDescription>≈ {resource.estimatedMinutes} min</CardDescription>
              </CardHeader>
            </Card>
          ))}
          <Card>
            <CardHeader>
              <ClipboardCheck className="size-5 text-primary" aria-hidden />
              <CardTitle className="text-base">Preuves en attente de validation</CardTitle>
              <CardDescription>
                {pending.length} preuve(s) soumise(s), en attente d'un encadrant.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      <section aria-labelledby="titre-semaine">
        <SectionHeading
          id="titre-semaine"
          title="Cette semaine"
          description="Séances, ressources et gestes à consigner sur les sept prochains jours."
        />
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {resources.map((resource) => (
              <div
                key={resource.id}
                className="flex flex-wrap items-center justify-between gap-2 px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{resource.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {resource.outcomeIds.length} acquis visé(s) · ≈ {resource.estimatedMinutes} min
                  </p>
                </div>
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="titre-jalons">
        <SectionHeading
          id="titre-jalons"
          title="Jalons"
          description="Acquis à atteindre pour rester dans la trajectoire du référentiel."
        />
        <ul className="grid gap-3 md:grid-cols-3">
          {nextTargets.map((item) => (
            <li key={item.outcome.id} className="surface-panel p-4">
              <div className="flex items-center gap-2">
                <Flag className="size-4 text-primary" aria-hidden />
                <span className="text-xs font-medium text-muted-foreground">
                  {item.outcome.code}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">{item.outcome.label}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <MasteryBadge level={item.mastery} />
                <NatureBadge nature={item.outcome.nature} />
              </div>
            </li>
          ))}
          {nextTargets.length === 0 ? (
            <li className="text-sm text-muted-foreground">Tous les jalons sont atteints.</li>
          ) : null}
        </ul>
      </section>

      <section aria-labelledby="titre-progression">
        <SectionHeading
          id="titre-progression"
          title="Progression"
          description="Part des acquis ayant atteint le niveau cible du référentiel."
        />
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="size-5 text-success" aria-hidden />
              <span className="text-2xl font-semibold text-foreground">
                {summary.percentAtTarget} %
              </span>
              <span className="text-sm text-muted-foreground">
                {summary.atTarget} / {summary.total} acquis au niveau cible
              </span>
            </div>
            <Progress value={summary.percentAtTarget} aria-label="Progression globale" />
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Au niveau cible</dt>
                <dd className="text-lg font-medium text-foreground">{summary.atTarget}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">En cours</dt>
                <dd className="text-lg font-medium text-foreground">{summary.inProgress}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Non commencés</dt>
                <dd className="text-lg font-medium text-foreground">{summary.notStarted}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="titre-stage">
        <SectionHeading
          id="titre-stage"
          title="Stage"
          description="Terrain clinique en cours et encadrant responsable des validations."
        />
        <Card>
          <CardHeader>
            <Stethoscope className="size-5 text-primary" aria-hidden />
            <CardTitle className="text-base">
              {currentPlacement?.name ?? "Aucun stage affecté"}
            </CardTitle>
            <CardDescription>
              {currentPlacement
                ? `${currentPlacement.site} · ${currentPlacement.department}`
                : "Les affectations seront visibles ici."}
            </CardDescription>
          </CardHeader>
          {currentAssignment ? (
            <CardContent className="text-sm text-muted-foreground">
              Statut : {PLACEMENT_STATUS_FR[currentAssignment.status]} · du{" "}
              {new Date(currentAssignment.startsOn).toLocaleDateString("fr-FR")} au{" "}
              {new Date(currentAssignment.endsOn).toLocaleDateString("fr-FR")}
            </CardContent>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
