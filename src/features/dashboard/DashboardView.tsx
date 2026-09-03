import { Link } from "@tanstack/react-router";
import { BookOpen, CalendarClock, PlayCircle, Target, TrendingUp } from "lucide-react";

import { useSession } from "@/application/session";
import { NatureBadge } from "@/components/mastery-badge";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";

const JOUR = 24 * 60 * 60 * 1000;

function dateFr(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" });
}

/**
 * LA VUE D'ENSEMBLE, REFAITE LE 03/09 SUR CE QUI EXISTE VRAIMENT.
 *
 * CE QU'ELLE RACONTAIT AVANT, ET QUI ETAIT FAUX :
 * - « Aujourd'hui » affichait `resources.slice(0, 2)` — les deux PREMIERS
 *   supports de la liste, qui se trouvaient etre deux videos de competence.
 *   Rien a voir avec aujourd'hui.
 * - « Preuves en attente de validation » comptait des lignes d'une table
 *   `evidence` QUI N'EXISTE PAS en base ; le depot est encore au mock.
 * - « Cette semaine » listait les 26 supports, tous, sans aucune notion de
 *   semaine, chacun annonce « ≈ 0 min » faute de duree renseignee.
 * - « Jalons » listait trois ACQUIS pris dans l'ordre de la liste. Le
 *   retroplanning porte 29 vrais jalons dates, et aucun n'apparaissait.
 * - « Stage » lisait des affectations simulees.
 *
 * CE QU'ELLE MONTRE MAINTENANT : uniquement ce qui vient de la base et qui
 * fonctionne — la promotion et son calendrier, la progression reelle nourrie
 * par les declarations, le PROCHAIN JALON avec ce qu'il reste a y faire, et
 * les contenus reellement lisibles. Chaque bloc ouvre l'onglet qui le porte :
 * une vue d'ensemble n'est utile que si elle mene quelque part.
 *
 * LE STAGE A ETE RETIRE, pas masque par oubli : le carnet et les affectations
 * sont hors V1 et leurs depots rendent du mock. Il reviendra quand il aura
 * quelque chose de vrai a dire.
 */
export function DashboardView() {
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

  const { progress, summary, resources, plan, selfReports, cohort } = data;

  const declares = selfReports.filter((r) => r.declaredLevel !== "not_started").length;
  const videos = resources.filter((r) => r.format === "video").length;

  /*
   * OU EN EST-ON DANS LE STAGE. Le retroplanning se compte en semaines depuis
   * le debut de la promotion, jamais en dates absolues — c'est ce qui permet de
   * rejouer le meme modele d'une promotion a l'autre. On rend donc le meme
   * repere a l'apprenant. Avant le debut, on ne dit pas « semaine 0 » : on
   * annonce la date d'ouverture.
   */
  const debut = cohort ? new Date(cohort.startsOn).getTime() : null;
  const semaine =
    debut !== null && Number.isFinite(debut)
      ? Math.floor((Date.now() - debut) / (7 * JOUR)) + 1
      : null;

  /*
   * LE PROCHAIN JALON, et non « les trois premiers acquis ». On regroupe par
   * jalon comme partout ailleurs depuis le 03/09, on ecarte ce qui est deja
   * acquis, et on garde le plus proche. Les items sont deja tries par echeance.
   */
  const prochain = (() => {
    for (const item of plan.items) {
      if (item.stage === "acquired" || !item.dueOn || !item.milestoneLabel) continue;
      const restants = plan.items.filter(
        (autre) =>
          autre.milestoneLabel === item.milestoneLabel &&
          autre.dueOn === item.dueOn &&
          autre.stage !== "acquired",
      );
      return { label: item.milestoneLabel, dueOn: item.dueOn, items: restants };
    }
    return null;
  })();

  const jours =
    prochain !== null ? Math.ceil((new Date(prochain.dueOn).getTime() - Date.now()) / JOUR) : null;

  return (
    <div className="space-y-10">
      <header className="surface-panel p-6">
        <p className="text-sm text-muted-foreground">
          {activeProgram.name}
          {cohort ? ` · ${cohort.label}` : ""}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Bonjour {person.fullName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {semaine !== null && semaine >= 1
            ? `Vous êtes en semaine ${semaine} du programme.`
            : cohort
              ? `Votre promotion démarre le ${dateFr(cohort.startsOn)}.`
              : "Votre promotion n'est pas encore ouverte."}{" "}
          Une compétence en situation réelle demande toujours la validation d'un encadrant ; le
          reste, vous le déclarez vous-même au fur et à mesure.
        </p>
      </header>

      <section aria-labelledby="titre-prochain-jalon">
        <SectionHeading
          id="titre-prochain-jalon"
          title="Mon prochain jalon"
          description="Ce que le programme attend de vous en premier, et ce qu'il vous reste à y faire."
        />
        {prochain === null ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aucun jalon à venir</CardTitle>
              <CardDescription>
                Tous les jalons du rétroplanning sont derrière vous, ou aucun ne porte encore
                d'acquis à travailler.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CalendarClock className="size-5 text-primary" aria-hidden />
                <CardTitle className="text-base">{prochain.label}</CardTitle>
                <Badge variant="secondary" className="font-normal">
                  {prochain.items.length} acquis à travailler
                </Badge>
                <Badge variant="outline" className="ms-auto font-normal">
                  {jours !== null && jours >= 0
                    ? `dans ${jours} jour(s)`
                    : `échéance passée le ${dateFr(prochain.dueOn)}`}
                </Badge>
              </div>
              <CardDescription>Échéance : {dateFr(prochain.dueOn)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2">
                {prochain.items.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                    <span className="min-w-0 flex-1">{item.label}</span>
                    <NatureBadge nature={item.nature} />
                  </li>
                ))}
              </ul>
              {prochain.items.length > 5 ? (
                <p className="text-xs text-muted-foreground">
                  … et {prochain.items.length - 5} autre(s) sur ce jalon.
                </p>
              ) : null}
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/espace/passeport">Voir toute la chronologie</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <section aria-labelledby="titre-progression">
        <SectionHeading
          id="titre-progression"
          title="Où j'en suis"
          description="Part des acquis ayant atteint le niveau attendu, déclarations comprises."
        />
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <TrendingUp className="size-5 text-success" aria-hidden />
              <span className="text-2xl font-semibold text-foreground">
                {summary.percentAtTarget} %
              </span>
              <span className="text-sm text-muted-foreground">
                {summary.atTarget} / {summary.total} acquis au niveau attendu
              </span>
            </div>
            <Progress value={summary.percentAtTarget} aria-label="Progression globale" />
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Déclarés par moi</dt>
                <dd className="text-lg font-medium text-foreground">{declares}</dd>
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

      <section aria-labelledby="titre-contenus">
        <SectionHeading
          id="titre-contenus"
          title="Ce que je peux travailler"
          description="Les contenus réellement disponibles dans ce programme."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <BookOpen className="size-5 text-primary" aria-hidden />
              <CardTitle className="text-base">
                {progress.filter((p) => p.outcome.nature === "knowledge").length} connaissances
              </CardTitle>
              <CardDescription>
                Chapitre par chapitre, avec le texte intégral des cours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/espace/ressources">Ouvrir mes ressources</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Target className="size-5 text-primary" aria-hidden />
              <CardTitle className="text-base">
                {progress.filter((p) => p.outcome.nature !== "knowledge").length} compétences
              </CardTitle>
              <CardDescription>
                {videos > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <PlayCircle className="size-3" aria-hidden />
                    {videos} vidéo(s) à regarder
                  </span>
                ) : (
                  "Par chapitre, avec leurs contenus quand ils existent."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/espace/competences">Ouvrir mes compétences</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
