import { Link } from "@tanstack/react-router";
import { BookOpen, CalendarClock, PlayCircle, Target, TrendingUp } from "lucide-react";

import { useSession } from "@/application/session";
import { NatureBadge } from "@/components/mastery-badge";
import { SectionHeading } from "@/components/section-heading";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
   * LA PROCHAINE ECHEANCE, ET NON UN SEUL JALON (Stef, 04/09).
   *
   * CE QUI N'ALLAIT PAS, mesure en base le 04/09 : le calcul groupait par le
   * couple (libelle, echeance). Or plusieurs jalons partagent la meme date —
   * la semaine 1 en porte QUATRE, pour 34 acquis (11 + 9 + 5 + 9). La carte
   * n'en retenait qu'un, celui dont le code arrivait premier au tri, puis en
   * affichait cinq acquis. Le calendrier et le Gantt, eux, raisonnent par
   * echeance et montraient les quatre : « il y a une discordance entre le
   * contenu de Mon prochain jalon et le contenu de Voir toute la chronologie ».
   * Les deux ecrans lisaient pourtant le meme `plan.items` — c'etait un ecart
   * de definition, pas de donnees.
   *
   * ON GROUPE DONC PAR ECHEANCE, puis par jalon a l'interieur. Le repli
   * remplace la troncature a cinq : c'est deja la regle du Gantt et du Kanban,
   * et elle ne ferme plus la porte aux acquis surnumeraires.
   *
   * UNE ECHEANCE DEPASSEE RESTE LA PROCHAINE tant qu'il y reste a faire. On ne
   * la saute pas : c'est justement celle sur laquelle l'etudiant est en retard.
   * L'etiquette le dit.
   *
   * `plan.items` est deja trie par echeance puis par code : le premier element
   * non acquis porte donc la date la plus proche.
   */
  const echeance = (() => {
    const premier = plan.items.find(
      (item) => item.stage !== "acquired" && item.dueOn !== null && item.milestoneLabel !== null,
    );
    if (premier === undefined || premier.dueOn === null) return null;
    const dueOn = premier.dueOn;
    const restants = plan.items.filter(
      (item) => item.dueOn === dueOn && item.stage !== "acquired" && item.milestoneLabel !== null,
    );
    const parJalon = new Map<
      string,
      { label: string; officielle: boolean; items: typeof restants }
    >();
    for (const item of restants) {
      const label = item.milestoneLabel ?? "";
      const groupe = parJalon.get(label) ?? {
        label,
        officielle: item.officialDeadline,
        items: [] as typeof restants,
      };
      groupe.items = [...groupe.items, item];
      parJalon.set(label, groupe);
    }
    return {
      dueOn,
      total: restants.length,
      jalons: [...parJalon.values()].sort((a, b) => a.label.localeCompare(b.label)),
    };
  })();

  const jours =
    echeance !== null ? Math.ceil((new Date(echeance.dueOn).getTime() - Date.now()) / JOUR) : null;

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
        {echeance === null ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aucune échéance à venir</CardTitle>
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
                <CardTitle className="text-base">{dateFr(echeance.dueOn)}</CardTitle>
                <Badge variant="secondary" className="font-normal">
                  {echeance.total} acquis à travailler
                </Badge>
                <Badge variant="outline" className="ms-auto font-normal">
                  {jours !== null && jours >= 0
                    ? `dans ${jours} jour(s)`
                    : `échéance passée depuis ${Math.abs(jours ?? 0)} jour(s)`}
                </Badge>
              </div>
              <CardDescription>
                {echeance.jalons.length === 1
                  ? "Un jalon arrive à échéance à cette date."
                  : `${echeance.jalons.length} jalons arrivent à échéance à cette même date. Dépliez celui que vous voulez travailler.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/*
                UN REPLI PAR JALON, ET PLUS DE TRONCATURE A CINQ. La date porte
                jusqu'a 34 acquis : les couper a cinq laissait « … et 29
                autre(s) », c'est-a-dire une porte fermee des lors que ces
                lignes menent quelque part.

                CHAQUE ACQUIS EST UN LIEN (Stef, 04/09) : « clique sur item
                envoie dans le bon onglet et surtout directement sur le bon item
                a voir et a valider ». L'ONGLET SE DEDUIT DE LA NATURE, pas d'un
                reglage : une connaissance vit dans « Mes ressources », une
                competence — simulee ou reelle — dans « Mes competences ». Meme
                regle d'aiguillage que pour les supports. On passe le CODE et
                non l'identifiant : lisible dans la barre d'adresse, unique par
                programme, stable.
              */}
              <Accordion type="multiple" className="w-full">
                {echeance.jalons.map((jalon) => (
                  <AccordionItem key={jalon.label} value={jalon.label}>
                    <AccordionTrigger className="min-w-0 py-2 text-left text-sm">
                      <span className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                        <span className="min-w-0 break-words font-medium">{jalon.label}</span>
                        {jalon.officielle ? (
                          <Badge variant="outline" className="shrink-0 font-normal">
                            Officielle
                          </Badge>
                        ) : null}
                        <Badge variant="secondary" className="ms-auto shrink-0 font-normal">
                          {jalon.items.length}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-1 pt-1">
                        {jalon.items.map((item) => (
                          <li key={item.id}>
                            {item.nature === "knowledge" ? (
                              <Link
                                to="/espace/ressources"
                                search={{ acquis: item.code }}
                                className="flex min-h-11 flex-wrap items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <span className="font-mono text-xs text-muted-foreground">
                                  {item.code}
                                </span>
                                <span className="min-w-0 flex-1">{item.label}</span>
                                <NatureBadge nature={item.nature} />
                              </Link>
                            ) : (
                              <Link
                                to="/espace/competences"
                                search={{ acquis: item.code }}
                                className="flex min-h-11 flex-wrap items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <span className="font-mono text-xs text-muted-foreground">
                                  {item.code}
                                </span>
                                <span className="min-w-0 flex-1">{item.label}</span>
                                <NatureBadge nature={item.nature} />
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
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
