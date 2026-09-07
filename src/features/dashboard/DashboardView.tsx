import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { useSession } from "@/application/session";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { OutcomeThemeId } from "@/domain/types";
import { buildDomainColors, DOMAIN_NEUTRAL } from "@/features/dashboard/domainColor";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { useStageToday } from "@/features/dashboard/useStageToday";

const JOUR = 24 * 60 * 60 * 1000;

/**
 * L'ETIQUETTE EN PETITES CAPITALES ESPACEES. La maquette la compose en Archivo
 * Narrow ; on tient le ROLE typographique avec la fonte deja chargee plutot que
 * d'ajouter une requete de fonte tierce au chargement de chaque page. A
 * arbitrer si l'ecart se voit.
 */
const EYEBROW = "text-[11.5px] font-semibold uppercase tracking-[0.14em]";
const TABULAIRE = { fontVariantNumeric: "tabular-nums" } as const;

function dateFr(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" });
}

const LETTRES = ["zéro", "Un", "Deux", "Trois", "Quatre", "Cinq", "Six", "Sept", "Huit", "Neuf"];
function enLettres(n: number) {
  return LETTRES[n] ?? String(n);
}

/**
 * LA VUE D'ENSEMBLE — habillage « version affirmee » (maquette v2).
 *
 * CE QUE LA MAQUETTE CHANGE, ET POURQUOI :
 * - UN BANDEAU SOMBRE EN TETE. Le marine passe du texte au fond. C'est le seul
 *   dispositif qui fera lire les huit onglets comme un seul produit, sans
 *   image et sans composant nouveau par page.
 * - LA COULEUR DE DOMAINE DEVIENT UN APLAT. Une pastille de 8 px ne pese rien ;
 *   une tuile qui porte le compte fait travailler la couleur.
 * - UNE CARTE DU PROGRAMME PLUTOT QU'UN ANNEAU VIDE. Un carre par acquis :
 *   pleine des la premiere semaine, elle montre l'echelle du parcours au lieu
 *   de marteler le zero.
 * - LES CHAPEAUX EXPLICATIFS SAUTENT. « Ce que le programme attend de
 *   vous... », « Part des acquis... » : la plateforme se commentait trois fois
 *   par ecran, et c'est ce ton qui faisait administratif.
 *
 * AUCUN NOMBRE N'EST ECRIT EN DUR. Le 368 de la maquette est `summary.total`,
 * le 12 vient de la promotion, le « Quatre » se calcule. Si la base rend 367
 * acquis, l'ecran affiche 367 et reste vrai.
 */
export function DashboardView() {
  const { activeProgram, person } = useSession();
  const { data, isPending } = useLearnerPassport();

  if (isPending || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { progress, summary, resources, plan, themes, cohort } = data;

  const videos = resources.filter((r) => r.format === "video").length;
  const connaissances = progress.filter((p) => p.outcome.nature === "knowledge").length;
  const competences = progress.length - connaissances;
  const couleurParTheme = buildDomainColors(themes);

  const debut = cohort ? new Date(cohort.startsOn).getTime() : null;
  const fin = cohort ? new Date(cohort.endsOn).getTime() : null;
  const semaine =
    debut !== null && Number.isFinite(debut)
      ? Math.floor((Date.now() - debut) / (7 * JOUR)) + 1
      : null;
  const semaines =
    debut !== null && fin !== null && Number.isFinite(debut) && Number.isFinite(fin) && fin > debut
      ? Math.max(1, Math.round((fin - debut) / (7 * JOUR)))
      : null;

  /*
   * LA PROCHAINE ECHEANCE. Plusieurs jalons partagent la meme date — la
   * semaine 1 en porte quatre, pour 34 acquis. On groupe donc par ECHEANCE,
   * puis par jalon a l'interieur. Une echeance depassee reste la prochaine
   * tant qu'il y reste a faire : c'est celle sur laquelle l'etudiant est en
   * retard.
   */
  const echeance = (() => {
    const premier = plan.items.find(
      (item) => item.stage !== "acquired" && item.dueOn !== null && item.milestoneLabel !== null,
    );
    if (premier === undefined || premier.dueOn === null) return null;
    const dueOn = premier.dueOn;
    const tous = plan.items.filter((item) => item.dueOn === dueOn && item.milestoneLabel !== null);
    const parJalon = new Map<string, typeof tous>();
    for (const item of tous) {
      const label = item.milestoneLabel ?? "";
      parJalon.set(label, [...(parJalon.get(label) ?? []), item]);
    }
    const jalons = [...parJalon.entries()]
      .map(([label, items]) => {
        const restants = items.filter((item) => item.stage !== "acquired");
        const comptes = new Map<OutcomeThemeId, number>();
        for (const item of items) {
          if (item.themeId === undefined) continue;
          comptes.set(item.themeId, (comptes.get(item.themeId) ?? 0) + 1);
        }
        const dominant = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        return {
          label,
          items,
          restants,
          acquis: items.length - restants.length,
          couleur:
            dominant === undefined
              ? DOMAIN_NEUTRAL
              : (couleurParTheme.get(dominant) ?? DOMAIN_NEUTRAL),
        };
      })
      .filter((jalon) => jalon.restants.length > 0)
      .sort((a, b) => b.restants.length - a.restants.length);
    if (jalons.length === 0) return null;
    const prioritaire = jalons[0];
    if (prioritaire === undefined) return null;
    return {
      dueOn,
      total: jalons.reduce((n, jalon) => n + jalon.restants.length, 0),
      jalons,
      prioritaire,
    };
  })();

  const jours =
    echeance !== null ? Math.ceil((new Date(echeance.dueOn).getTime() - Date.now()) / JOUR) : null;

  /*
   * LA CARTE DU PROGRAMME. Un carre par acquis : les valides en encre, ceux de
   * la prochaine echeance dans la couleur de leur jalon, le reste eteint. Le
   * total vient du store — jamais un 368 grave dans le code.
   */
  const cases: string[] = [];
  for (let i = 0; i < summary.atTarget; i += 1) cases.push("var(--foreground)");
  for (const jalon of echeance?.jalons ?? []) {
    for (let i = 0; i < jalon.restants.length; i += 1) cases.push(jalon.couleur);
  }
  while (cases.length < summary.total) cases.push("var(--dot-idle)");
  cases.length = summary.total;

  return (
    <div className="space-y-7">
      {/*
        LE BANDEAU. Marges negatives pour absorber le rembourrage de <main> et
        atteindre les bords : c'est ce debord qui fait qu'il « pose » l'ecran
        plutot que de flotter comme une carte de plus.
      */}
      <div className="-mx-4 -mt-8 bg-field px-4 pb-7 pt-6 text-field-ink sm:-mx-6 sm:px-6">
        <p className={`${EYEBROW} text-field-mute`}>
          {activeProgram.name}
          {cohort ? ` · ${cohort.label}` : ""}
        </p>
        <h1 className="mt-2 font-display text-[38px] font-normal leading-[1.02] tracking-[-0.025em]">
          Bonjour
          <br />
          <span className="font-semibold">{person.fullName.split(" ")[0]}</span>
        </h1>
        {semaine !== null && semaines !== null && semaine >= 1 ? (
          <div className="mt-5">
            <div className="flex gap-[3px]" aria-hidden>
              {Array.from({ length: semaines }, (_, i) => (
                <span
                  key={i}
                  className={`h-[5px] flex-1 rounded-sm ${i < semaine ? "bg-live" : "bg-field-ink/20"}`}
                />
              ))}
            </div>
            <div className={`${EYEBROW} mt-2 flex justify-between text-field-mute`}>
              <span>Semaine {semaine}</span>
              <span>{semaines} semaines</span>
            </div>
          </div>
        ) : cohort ? (
          <p className="mt-4 text-sm text-field-mute">
            Votre promotion démarre le {dateFr(cohort.startsOn)}.
          </p>
        ) : null}
      </div>

      {/* LA CARTE DU PROCHAIN JALON, soulevee sur le bandeau. */}
      {echeance !== null ? (
        <section className="-mt-[38px] overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
          <div className="flex items-baseline gap-3 px-4 pb-3 pt-4">
            <span className="font-display text-[27px] font-medium leading-none tracking-[-0.02em]">
              {dateFr(echeance.dueOn)}
            </span>
            <span
              className="ms-auto rounded bg-live px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-live-ink"
              style={TABULAIRE}
            >
              {jours !== null && jours >= 0 ? `dans ${jours} jours` : `passée`}
            </span>
          </div>
          <p className="px-4 pb-3 text-sm leading-relaxed text-muted-foreground">
            {echeance.jalons.length === 1
              ? "Un jalon tombe à cette date : "
              : `${enLettres(echeance.jalons.length)} jalons tombent le même jour : `}
            <b className="font-bold text-foreground">{echeance.total} acquis</b> à travailler d'ici
            là.
          </p>
          <Accordion type="multiple" className="w-full pb-2">
            {echeance.jalons.map((jalon) => (
              <AccordionItem
                key={jalon.label}
                value={jalon.label}
                style={{ "--c": jalon.couleur } as React.CSSProperties}
                className="border-b-0"
              >
                <AccordionTrigger className="min-w-0 gap-3 px-4 py-2 hover:no-underline [&>svg]:hidden">
                  <span className="flex min-w-0 flex-1 items-stretch gap-3">
                    <span
                      className="grid w-11 shrink-0 place-items-center rounded-lg py-2 text-white"
                      style={{ backgroundColor: "var(--c)" }}
                    >
                      <b className="text-[17px] font-bold leading-none" style={TABULAIRE}>
                        {jalon.restants.length}
                      </b>
                      <span className="mt-[3px] text-[9px] tracking-wider opacity-85">ACQUIS</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col justify-center gap-[5px]">
                      <span className="font-display text-[16.5px] leading-tight tracking-[-0.01em]">
                        {jalon.label}
                      </span>
                      <span className="h-[3px] overflow-hidden rounded-sm bg-card-sunk" aria-hidden>
                        <span
                          className="block h-full rounded-sm"
                          style={{
                            width: `${Math.max((jalon.acquis / jalon.items.length) * 100, 3)}%`,
                            backgroundColor: "var(--c)",
                          }}
                        />
                      </span>
                    </span>
                    <ChevronDown
                      className="size-4 shrink-0 self-center text-muted-foreground transition-transform"
                      aria-hidden
                    />
                  </span>
                </AccordionTrigger>
                {/*
                  LE PANNEAU DEPLIE prend 8 % de la teinte du domaine, borde a
                  22 %. UN PANNEAU QUI S'OUVRE SUR DU TEXTE SANS RIEN A FAIRE
                  EST UNE IMPASSE : le bouton d'action ferme la boucle.
                */}
                <AccordionContent
                  className="mb-2 px-4 py-3"
                  style={{
                    backgroundColor: "color-mix(in oklch, var(--c) 8%, var(--card))",
                    borderTop: "1px solid color-mix(in oklch, var(--c) 22%, transparent)",
                    borderBottom: "1px solid color-mix(in oklch, var(--c) 22%, transparent)",
                  }}
                >
                  <ul>
                    {jalon.restants.map((item) => (
                      <li key={item.id}>
                        <Link
                          to={
                            item.nature === "knowledge"
                              ? "/espace/ressources"
                              : "/espace/competences"
                          }
                          search={{ acquis: item.code }}
                          className="flex min-h-11 items-start gap-2.5 border-b py-2 text-sm last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{
                            borderColor: "color-mix(in oklch, var(--c) 16%, transparent)",
                          }}
                        >
                          <span
                            className="w-11 shrink-0 pt-0.5 text-[11px] font-semibold tracking-wide"
                            style={{ color: "var(--c)", ...TABULAIRE }}
                          >
                            {item.code}
                          </span>
                          <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                          <span
                            className="mt-px shrink-0 rounded-sm border px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
                            style={{
                              color: "var(--c)",
                              borderColor: "color-mix(in oklch, var(--c) 40%, transparent)",
                            }}
                          >
                            {item.nature === "knowledge"
                              ? "Savoir"
                              : item.nature === "real_competence"
                                ? "Réelle"
                                : "Simulée"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {/*
                    LE LIEN PROFOND `?acquis=` EST LE SEUL QUI FONCTIONNE : la
                    route du Passeport n'accepte aucun parametre `jalon`, et
                    l'y envoyer aurait produit une page non filtree — une
                    action qui a l'air de viser et qui ne vise rien. On ouvre
                    donc l'onglet du premier acquis restant, la ou se trouve
                    son interrupteur de declaration.
                  */}
                  {jalon.restants[0] ? (
                    <Button
                      asChild
                      className="mt-2.5 min-h-11 w-full border-0 text-white hover:opacity-90"
                      style={{ backgroundColor: "var(--c)" }}
                    >
                      <Link
                        to={
                          jalon.restants[0].nature === "knowledge"
                            ? "/espace/ressources"
                            : "/espace/competences"
                        }
                        search={{ acquis: jalon.restants[0].code }}
                      >
                        Déclarer un acquis travaillé
                      </Link>
                    </Button>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]">
          La carte du programme
        </h2>
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="flex items-baseline gap-2.5">
            <b
              className="font-display text-[40px] font-medium leading-none tracking-[-0.03em]"
              style={TABULAIRE}
            >
              {summary.atTarget}
            </b>
            <span className="text-sm text-muted-foreground">
              acquis validé{summary.atTarget > 1 ? "s" : ""} sur {summary.total}
            </span>
          </p>
          <div
            className="my-3.5 grid gap-[3px]"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(7px, 1fr))" }}
            role="img"
            aria-label={`${summary.total} acquis du programme, ${summary.atTarget} validé(s)${
              echeance ? `, ${echeance.total} à échéance le ${dateFr(echeance.dueOn)}` : ""
            }`}
          >
            {cases.map((couleur, i) => (
              <span
                key={i}
                className="block aspect-square rounded-[1.5px]"
                style={{ backgroundColor: couleur }}
              />
            ))}
          </div>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Chaque carré est un acquis.
            {echeance
              ? ` Les ${echeance.total} colorés arrivent à échéance le ${dateFr(echeance.dueOn)}.`
              : ""}{" "}
            {plan.items.reduce((n, i) => n + i.countedEvidence, 0) === 0
              ? "Aucune preuve déposée pour l'instant — la première viendra de votre premier patient examiné en stage."
              : ""}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]">
          Ce que je peux travailler
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {/*
            LA CONNAISSANCE N'EST PAS UN DOMAINE : sa carte est en marine, pas
            dans une teinte de domaine. La couleur ne dit qu'une chose dans
            toute l'application, et c'est « domaine de competence ».
          */}
          <CarteTravail
            fond="var(--field)"
            compte={connaissances}
            legende="connaissances"
            corps="Chapitre par chapitre, avec le texte intégral des cours."
            vers="/espace/ressources"
            action="Ouvrir mes ressources"
          />
          <CarteTravail
            fond="var(--primary)"
            compte={competences}
            legende={videos > 0 ? `compétences · ${videos} vidéos` : "compétences"}
            corps="Ce que vous devez savoir faire, et comment le faire valider."
            vers="/espace/competences"
            action="Ouvrir mes compétences"
          />
        </div>
      </section>

      <PaveStage />

      <p className={`${EYEBROW} pt-2 text-center text-muted-foreground`}>
        Prototype — non enregistré
      </p>
    </div>
  );
}

function CarteTravail({
  fond,
  compte,
  legende,
  corps,
  vers,
  action,
}: {
  fond: string;
  compte: number;
  legende: string;
  corps: string;
  vers: "/espace/ressources" | "/espace/competences";
  action: string;
}) {
  return (
    <article className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
      <div className="px-4 pb-3 pt-3.5 text-white" style={{ backgroundColor: fond }}>
        <b className="text-[30px] font-bold leading-none" style={TABULAIRE}>
          {compte}
        </b>
        <span className={`${EYEBROW} mt-1.5 block opacity-90`}>{legende}</span>
      </div>
      <div className="px-4 pb-3.5 pt-3 text-[13px] leading-snug text-muted-foreground">
        {corps}
        <Link
          to={vers}
          className="mt-2.5 flex min-h-11 items-center gap-1.5 text-[13.5px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {action}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

/**
 * LE SUIVI DE STAGE DU JOUR.
 *
 * L'EXISTENCE DE L'ENTREE EST LA PRESENCE : un geste suffit, le recit reste
 * facultatif. La ou l'onglet Stage porte le carnet complet, le tableau de bord
 * ne porte QUE la journee courante — c'est le seul geste quotidien.
 *
 * QUAND LE CARNET N'EST PAS OUVERT, ON LE DIT. Afficher un bouton qui echouera
 * apprend a l'etudiant a se mefier de l'ecran.
 *
 * LE VOCAL N'EST PAS ICI : il demande une capture audio et une transcription
 * cote serveur qui n'existent pas encore. Promettre un micro qui n'enregistre
 * rien serait pire que de ne rien promettre.
 */
function PaveStage() {
  const { jour, isPending, ouvrable, entree, enregistrer } = useStageToday();
  const [recit, setRecit] = useState<string | null>(null);

  if (isPending) return <Skeleton className="h-40 w-full" />;

  /*
   * LE COMMENTAIRE EST LE GESTE, PAS UN SUPPLEMENT. Une premiere version
   * cachait le champ derriere un bouton « Commenter » et validait la journee
   * d'un clic : l'etudiant validait sans jamais rien ecrire, et le carnet se
   * remplissait de journees vides. Le champ est donc ouvert d'emblee, et le
   * bouton se trouve dessous — on ecrit, puis on valide.
   *
   * `null` = pas encore touche : on affiche alors ce qui est deja en base.
   * Des que l'etudiant saisit, sa frappe fait autorite.
   */
  const valeur = recit ?? entree?.narrative ?? "";

  return (
    <section>
      <h2 className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]">
        Suivi de stage
      </h2>
      <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-display text-[22px] font-medium tracking-[-0.02em]">
            {dateFr(jour)}
          </span>
          {entree ? (
            <span className="ms-auto inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <Check className="size-4" aria-hidden />
              Journée enregistrée
            </span>
          ) : null}
        </div>

        {!ouvrable ? (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Votre carnet de stage n'est pas encore ouvert : aucun terrain ne vous est rattaché
              pour aujourd'hui. Vous pourrez valider vos journées dès qu'il le sera.
            </p>
            <Link
              to="/espace/stage"
              className="mt-2.5 flex min-h-11 items-center gap-1.5 text-[13.5px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Ouvrir mon carnet de stage
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </>
        ) : (
          <>
            <Label htmlFor="recit-du-jour" className="mt-3 block text-[13px] text-muted-foreground">
              Ce que vous avez vu, fait ou appris aujourd'hui.
            </Label>
            <Textarea
              id="recit-du-jour"
              value={valeur}
              onChange={(e) => setRecit(e.target.value)}
              placeholder="Deux lignes suffisent."
              className="mt-2 min-h-28"
            />
            <Button
              className="mt-3 min-h-11 w-full"
              disabled={enregistrer.isPending}
              onClick={() => enregistrer.mutate(valeur)}
            >
              {entree ? "Mettre à jour ma journée" : "Valider ma journée"}
            </Button>
            {enregistrer.isError ? (
              <p className="mt-2 text-[13px] text-destructive">
                {(enregistrer.error as Error).message}
              </p>
            ) : null}
          </>
        )}
      </div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        Les photos et la validation par votre encadrant sont dans l'onglet Stage.
      </p>
    </section>
  );
}
