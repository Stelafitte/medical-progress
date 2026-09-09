import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EYEBROW, MilestoneHeading, TABULAIRE } from "@/components/milestone-heading";
import type { AcquisitionPlanItem, PlanMilestoneId } from "@/domain/acquisitionPlan";
import { STAGE_LABELS_FR } from "@/domain/acquisitionPlan";
import { PlanOutcomeRow } from "@/features/passport/PlanOutcomeRow";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

const JOUR = 86_400_000;

/**
 * LE JOUR EN UTC, PAS EN HEURE LOCALE.
 *
 * `shift_milestone` attend un `date` SQL, c'est-a-dire `YYYY-MM-DD`. Les dates
 * du plan sont remontees a midi UTC precisement pour qu'aucun fuseau ne les
 * fasse changer de jour ; formater ici avec les composantes locales
 * reintroduirait ce que cette convention evite. Le meme piege que celui note le
 * 07/09 sur le carnet de stage, a l'autre bout de la chaine.
 */
function jourUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** La fenetre d'un jalon, en millisecondes, pendant qu'on la manipule. */
interface Fenetre {
  readonly debut: number;
  readonly fin: number;
}

/**
 * CE QUE L'APPRENANT PEUT FAIRE DE SON PLAN.
 *
 * ABSENT = LECTURE SEULE, et c'est le defaut. Le reamenagement n'existe que si
 * l'administrateur du programme l'a ouvert ; passer l'objet ou ne pas le passer
 * est la facon la plus courte de dire lequel des deux mondes on est en train de
 * dessiner, sans un booleen de plus a croiser dans chaque branche.
 */
export interface ReamenagementDuPlan {
  /** Fenetre choisie. `debutChoisi` absent = la duree du retroplanning est conservee. */
  readonly deplacer: (input: {
    milestoneId: PlanMilestoneId;
    dueOn: string;
    startsOn?: string;
  }) => void;
  readonly reinitialiser: (milestoneId: PlanMilestoneId) => void;
  /** Les jalons que CET apprenant a deja deplaces. */
  readonly decales: ReadonlySet<PlanMilestoneId>;
  readonly enCours: boolean;
  /**
   * Compteur d'echecs, incremente a chaque ecriture refusee.
   *
   * POURQUOI UN COMPTEUR ET NON UN BOOLEEN : deux refus de suite doivent
   * produire deux remises en place. Un booleen reste a `true` et le second
   * geste resterait affiche a l'ecran alors qu'il a ete refuse lui aussi.
   */
  readonly echecs: number;
}

interface BarreJalon {
  readonly cle: PlanMilestoneId;
  readonly label: string;
  readonly startsOn: string;
  readonly dueOn: string;
  readonly officielle: boolean;
  readonly items: readonly AcquisitionPlanItem[];
}

/**
 * Gantt REGROUPÉ PAR JALON (03/09), REAMENAGEABLE PAR L'APPRENANT (09/09).
 *
 * CE QUI N'ALLAIT PAS. Une barre par acquis, soit 368 barres empilées sur douze
 * semaines — et comme un jalon porte jusqu'à douze acquis, douze barres
 * strictement superposées, aux mêmes dates. Stef : « les listes sont
 * monstrueuses pour Kanban et Gantt ». C'est le même défaut que celui corrigé
 * le matin sur le Calendrier, à un écran près.
 *
 * POURQUOI LE JALON, ET NON LE CHAPITRE. Une barre de Gantt EST une période.
 * Le jalon en a une — sa semaine ; le chapitre n'en a pas, il s'étalerait du
 * premier au dernier de ses acquis et ne dirait rien. Le Kanban, lui, regroupe
 * par chapitre : il parle de contenu, pas de temps.
 *
 * LA CLÉ DE REGROUPEMENT EST L'IDENTIFIANT DU JALON (09/09), et non plus
 * `libellé|date`. Tant qu'on ne faisait qu'afficher, le libellé suffisait. Dès
 * lors qu'on ÉCRIT — `shift_milestone` prend un uuid — une clé d'affichage
 * n'est plus acceptable : deux jalons peuvent porter le même libellé, et un
 * jalon déplacé change de date, donc de clé, donc d'identité à l'écran.
 *
 * TROIS GESTES, AUCUNE SAISIE (demande de Stef, 09/09). On appuie sur une barre
 * pour entrer en modification ; on tire le corps pour DÉPLACER la fenêtre, la
 * poignée gauche pour le DÉBUT, la droite pour la FIN. Les flèches du clavier
 * font la même chose, au jour près : ce n'est pas un supplément d'accessibilité
 * mais la seule façon de viser un jour précis sur douze semaines de large.
 *
 * CHACUN NE BOUGE QUE SON PROPRE PLAN (Stef, 09/09) : « aucun impact sur le
 * programme global et sur les autres calendriers ». Le rétroplanning de la
 * promotion n'est jamais touché — l'écriture va dans une table de décalages
 * propre à l'inscription, et un jalon OFFICIEL reste immobile, refusé par une
 * contrainte de la base et pas seulement par cet écran.
 *
 * LES NON PLANIFIÉS NE SONT PAS DESSINÉS, mais ils sont comptés sous le
 * diagramme et listés dans l'alternative textuelle. Un Gantt ne peut montrer
 * que ce qui a des dates ; les faire disparaître laisserait croire que tout le
 * programme est planifié.
 */
export function GanttView({
  items,
  range,
  couleurDe,
  reamenagement,
}: {
  items: readonly AcquisitionPlanItem[];
  range: { start: string; end: string };
  /** Fourni par le Passeport, pour que les quatre vues colorent a l'identique. */
  couleurDe: (themeId: string | undefined) => string;
  /** Absent = diagramme en lecture seule. */
  reamenagement?: ReamenagementDuPlan;
}) {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  const span = Math.max(end - start, 1);
  const pct = (ms: number) => ((ms - start) / span) * 100;

  /** Le jalon ouvert en modification. Un seul a la fois : deux barres en cours d'edition ne se lisent pas. */
  const [edite, setEdite] = useState<PlanMilestoneId | null>(null);
  /**
   * LA FENETRE PENDANT LE GESTE, avant enregistrement.
   *
   * Elle vit ici et non dans les donnees : tant que le doigt est pose, la barre
   * doit suivre a l'image pres, alors que l'ecriture ne part qu'au relachement.
   * Sans cet etat intermediaire, chaque pixel parcouru declencherait un appel
   * reseau — et la barre avancerait par a-coups, au rythme des reponses.
   */
  const [brouillon, setBrouillon] = useState<{ id: PlanMilestoneId; fenetre: Fenetre } | null>(
    null,
  );
  const gesteRef = useRef<{
    mode: "deplacer" | "debut" | "fin";
    origineX: number;
    largeur: number;
    depart: Fenetre;
  } | null>(null);

  const parJalon = new Map<PlanMilestoneId, BarreJalon & { items: AcquisitionPlanItem[] }>();
  for (const item of items) {
    if (!item.startsOn || !item.dueOn || !item.milestoneLabel || !item.milestoneId) continue;
    const cle = item.milestoneId;
    const barre = parJalon.get(cle) ?? {
      cle,
      label: item.milestoneLabel,
      startsOn: item.startsOn,
      dueOn: item.dueOn,
      officielle: item.officialDeadline,
      items: [],
    };
    barre.items.push(item);
    parJalon.set(cle, barre);
  }
  /*
   * LA BARRE PREND LA COULEUR DU DOMAINE DOMINANT du jalon, comme la tuile de
   * la carte de synthese et celle du Kanban. Elle etait en `bg-primary/70` :
   * vingt-neuf barres d'un seul bleu, ou la couleur ne disait rien.
   */
  const couleurDuJalon = (portes: readonly AcquisitionPlanItem[]) => {
    const comptes = new Map<string, number>();
    for (const item of portes) {
      if (item.themeId === undefined) continue;
      comptes.set(item.themeId, (comptes.get(item.themeId) ?? 0) + 1);
    }
    return couleurDe([...comptes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]);
  };
  const jalons = [...parJalon.values()]
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.label.localeCompare(b.label))
    .map((jalon) => ({
      ...jalon,
      couleur: couleurDuJalon(jalon.items),
      acquis: jalon.items.filter((item) => item.stage === "acquired").length,
      aValider: jalon.items.filter((item) => item.stage === "to_validate").length,
    }));
  const nonPlanifies = items.filter((item) => !item.startsOn || !item.dueOn);

  /* ---------------------------------------------------------------- */
  /* Le geste                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * ON ARRONDIT AU JOUR, TOUJOURS. Le diagramme couvre douze semaines dans
   * quelques centaines de pixels : un pixel vaut plusieurs heures, et sans
   * arrondi l'apprenant poserait une echeance a 14 h 37 sans le savoir. La
   * base stocke un `date` de toute facon.
   */
  const decalerDe = (depart: Fenetre, mode: string, jours: number): Fenetre => {
    const delta = jours * JOUR;
    if (mode === "deplacer") return { debut: depart.debut + delta, fin: depart.fin + delta };
    if (mode === "debut") {
      return { debut: Math.min(depart.debut + delta, depart.fin), fin: depart.fin };
    }
    return { debut: depart.debut, fin: Math.max(depart.fin + delta, depart.debut) };
  };

  const commencerGeste = (
    evenement: React.PointerEvent<HTMLElement>,
    jalon: (typeof jalons)[number],
    mode: "deplacer" | "debut" | "fin",
  ) => {
    if (!reamenagement || jalon.officielle) return;
    const piste = evenement.currentTarget.closest("[data-piste]");
    if (!(piste instanceof HTMLElement)) return;
    /*
     * `setPointerCapture` : le doigt ou le curseur peut sortir de la barre
     * pendant le geste — c'est meme le cas normal des qu'on la deplace de
     * plusieurs semaines. Sans capture, l'evenement part au premier element
     * survole et la barre se fige a mi-chemin.
     */
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    gesteRef.current = {
      mode,
      origineX: evenement.clientX,
      largeur: piste.getBoundingClientRect().width,
      depart: { debut: new Date(jalon.startsOn).getTime(), fin: new Date(jalon.dueOn).getTime() },
    };
    setEdite(jalon.cle);
    setBrouillon({ id: jalon.cle, fenetre: gesteRef.current.depart });
  };

  const suivreGeste = (evenement: React.PointerEvent<HTMLElement>, id: PlanMilestoneId) => {
    const geste = gesteRef.current;
    if (!geste || geste.largeur === 0) return;
    const jours = Math.round(
      (((evenement.clientX - geste.origineX) / geste.largeur) * span) / JOUR,
    );
    setBrouillon({ id, fenetre: decalerDe(geste.depart, geste.mode, jours) });
  };

  const finirGeste = (id: PlanMilestoneId) => {
    const geste = gesteRef.current;
    gesteRef.current = null;
    if (!geste || !reamenagement) {
      setBrouillon(null);
      return;
    }
    enregistrer(id, geste.depart, geste.mode);
  };

  /*
   * LE BROUILLON SURVIT A L'ENVOI, jusqu'a ce que les donnees le rejoignent.
   *
   * L'effacer au relachement ferait revenir la barre a son ancienne place le
   * temps que la lecture revienne — une fraction de seconde ou l'apprenant voit
   * son geste ANNULE. Il se lit comme un echec, alors que l'ecriture est
   * partie. On garde donc l'affichage sur ce qui a ete demande, et on lache
   * quand le plan relu dit la meme chose.
   */
  const jalonRelu = brouillon ? parJalon.get(brouillon.id) : undefined;
  const debutRelu = jalonRelu ? new Date(jalonRelu.startsOn).getTime() : null;
  const finRelue = jalonRelu ? new Date(jalonRelu.dueOn).getTime() : null;
  useEffect(() => {
    if (!brouillon || debutRelu === null || finRelue === null) return;
    if (debutRelu === brouillon.fenetre.debut && finRelue === brouillon.fenetre.fin) {
      setBrouillon(null);
    }
  }, [brouillon, debutRelu, finRelue]);

  /* Une ecriture refusee remet la barre a sa place : le plan n'a pas change. */
  const echecs = reamenagement?.echecs ?? 0;
  useEffect(() => {
    if (echecs > 0) setBrouillon(null);
  }, [echecs]);

  /**
   * CE QU'ON ENVOIE, ET POURQUOI PAS TOUJOURS LES DEUX DATES. Un simple
   * deplacement n'envoie QUE la fin : la base garde alors « duree du
   * retroplanning conservee », et le jour ou l'administrateur rallongera le
   * jalon, la fenetre de l'apprenant suivra. Envoyer un debut ferait de lui
   * une duree choisie, figee — une decision qu'il n'a pas prise.
   */
  const enregistrer = (id: PlanMilestoneId, depart: Fenetre, mode: string) => {
    const fenetre = brouillon?.id === id ? brouillon.fenetre : null;
    if (!reamenagement || !fenetre) {
      setBrouillon(null);
      return;
    }
    if (fenetre.debut === depart.debut && fenetre.fin === depart.fin) {
      setBrouillon(null);
      return;
    }
    reamenagement.deplacer({
      milestoneId: id,
      dueOn: jourUtc(fenetre.fin),
      ...(mode === "deplacer" ? {} : { startsOn: jourUtc(fenetre.debut) }),
    });
  };

  /** Les fleches font le meme travail que le doigt, au jour pres. */
  const auClavier = (
    evenement: React.KeyboardEvent<HTMLElement>,
    jalon: (typeof jalons)[number],
    mode: "deplacer" | "debut" | "fin",
  ) => {
    if (!reamenagement || jalon.officielle) return;
    const sens = evenement.key === "ArrowRight" ? 1 : evenement.key === "ArrowLeft" ? -1 : 0;
    if (sens === 0) return;
    evenement.preventDefault();
    const depart: Fenetre =
      brouillon?.id === jalon.cle
        ? brouillon.fenetre
        : { debut: new Date(jalon.startsOn).getTime(), fin: new Date(jalon.dueOn).getTime() };
    const suivante = decalerDe(depart, mode, sens);
    setEdite(jalon.cle);
    setBrouillon({ id: jalon.cle, fenetre: suivante });
    reamenagement.deplacer({
      milestoneId: jalon.cle,
      dueOn: jourUtc(suivante.fin),
      ...(mode === "deplacer" ? {} : { startsOn: jourUtc(suivante.debut) }),
    });
  };

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun élément à afficher.</p>;
  }

  return (
    <div className="space-y-4">
      {reamenagement ? (
        <p className="text-xs text-muted-foreground">
          Vous pouvez réaménager <strong className="font-medium">votre</strong> planning : appuyez
          sur une barre, puis faites glisser son corps pour la déplacer, ou l'une de ses deux
          poignées pour changer le début ou la fin. Les flèches ← → du clavier font la même chose,
          jour par jour. Le rétroplanning de la promotion et le planning des autres étudiants ne
          bougent pas ; les échéances <strong className="font-medium">officielles</strong> ne se
          déplacent pas.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-card)] p-4">
        <div className="min-w-[42rem] space-y-3">
          <p className="flex justify-between text-xs text-muted-foreground">
            <span>{fmt(range.start)}</span>
            <span>{fmt(range.end)}</span>
          </p>
          <ul className="space-y-3">
            {jalons.map((jalon) => {
              const fenetre: Fenetre =
                brouillon?.id === jalon.cle
                  ? brouillon.fenetre
                  : {
                      debut: new Date(jalon.startsOn).getTime(),
                      fin: new Date(jalon.dueOn).getTime(),
                    };
              const left = Math.max(pct(fenetre.debut), 0);
              const width = Math.max(pct(fenetre.fin) - left, 2);
              const modifiable = Boolean(reamenagement) && !jalon.officielle;
              const enEdition = modifiable && edite === jalon.cle;
              const decale = reamenagement?.decales.has(jalon.cle) === true;
              const description = `${jalon.label} : du ${fmt(new Date(fenetre.debut).toISOString())} au ${fmt(new Date(fenetre.fin).toISOString())}, ${jalon.items.length} acquis`;
              return (
                <li key={jalon.cle} className="grid grid-cols-[14rem_1fr] items-center gap-3">
                  <span className="truncate text-xs font-medium" title={jalon.label}>
                    {jalon.label}{" "}
                    <span className="text-muted-foreground">({jalon.items.length})</span>
                    {decale ? (
                      <span className="text-primary" title="Date personnalisée">
                        {" "}
                        ·
                      </span>
                    ) : null}
                  </span>
                  <span className="relative block h-6 rounded bg-muted" data-piste>
                    <span
                      className={`absolute inset-y-0 rounded ${
                        enEdition ? "ring-2 ring-foreground ring-offset-1" : ""
                      }`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: jalon.couleur,
                        /*
                         * `touchAction: none` SUR LA BARRE MANIPULABLE, et
                         * seulement sur elle : sans cela, le navigateur mobile
                         * interprete le glissement comme un defilement de page
                         * et la barre ne bouge jamais. Le poser sur le
                         * conteneur bloquerait le defilement horizontal du
                         * diagramme, dont on a besoin.
                         */
                        touchAction: modifiable ? "none" : undefined,
                        cursor: modifiable ? "grab" : undefined,
                      }}
                      role={modifiable ? "button" : "img"}
                      tabIndex={modifiable ? 0 : undefined}
                      aria-label={
                        modifiable
                          ? `${description}. Flèches gauche et droite pour déplacer d'un jour.`
                          : description
                      }
                      onPointerDown={(e) => commencerGeste(e, jalon, "deplacer")}
                      onPointerMove={(e) => suivreGeste(e, jalon.cle)}
                      onPointerUp={() => finirGeste(jalon.cle)}
                      onPointerCancel={() => finirGeste(jalon.cle)}
                      onKeyDown={(e) => auClavier(e, jalon, "deplacer")}
                      onFocus={() => modifiable && setEdite(jalon.cle)}
                    />
                    {enEdition ? (
                      <>
                        {/*
                          LES POIGNEES N'EXISTENT QU'EN MODIFICATION. Affichees
                          en permanence sur vingt-neuf barres, elles feraient un
                          diagramme herisse ou l'on ne lirait plus les dates —
                          et la moitie des barres font moins de vingt pixels de
                          large.

                          `-inset-y-2` : la poignee se VOIT sur six pixels et se
                          TOUCHE sur une quarantaine. C'est ce qui la rend
                          utilisable au doigt sans epaissir le diagramme.
                        */}
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Début de ${jalon.label} : ${fmt(new Date(fenetre.debut).toISOString())}. Flèches gauche et droite pour le changer d'un jour.`}
                          className="absolute -inset-y-2 w-1.5 cursor-ew-resize rounded bg-foreground/70 before:absolute before:-inset-x-3 before:inset-y-0 before:content-['']"
                          style={{ left: `${left}%`, touchAction: "none" }}
                          onPointerDown={(e) => commencerGeste(e, jalon, "debut")}
                          onPointerMove={(e) => suivreGeste(e, jalon.cle)}
                          onPointerUp={() => finirGeste(jalon.cle)}
                          onPointerCancel={() => finirGeste(jalon.cle)}
                          onKeyDown={(e) => auClavier(e, jalon, "debut")}
                        />
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Fin de ${jalon.label} : ${fmt(new Date(fenetre.fin).toISOString())}. Flèches gauche et droite pour la changer d'un jour.`}
                          className="absolute -inset-y-2 w-1.5 cursor-ew-resize rounded bg-foreground/70 before:absolute before:-inset-x-3 before:inset-y-0 before:content-['']"
                          style={{
                            left: `calc(${Math.min(left + width, 100)}% - 0.375rem)`,
                            touchAction: "none",
                          }}
                          onPointerDown={(e) => commencerGeste(e, jalon, "fin")}
                          onPointerMove={(e) => suivreGeste(e, jalon.cle)}
                          onPointerUp={() => finirGeste(jalon.cle)}
                          onPointerCancel={() => finirGeste(jalon.cle)}
                          onKeyDown={(e) => auClavier(e, jalon, "fin")}
                        />
                      </>
                    ) : (
                      <span
                        aria-hidden
                        className="absolute top-0 h-6 w-0.5 bg-foreground"
                        style={{ left: `${Math.min(pct(fenetre.fin), 99.5)}%` }}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {jalons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun acquis n'est encore posé sur un jalon du rétroplanning.
            </p>
          ) : null}
        </div>
      </div>

      {/*
        LA BARRE D'ACTION DU JALON EN COURS, SOUS LE DIAGRAMME et non dessus :
        posee au-dessus de la barre, elle masquerait les jalons voisins — c'est-
        a-dire precisement ce que l'apprenant regarde quand il decale une
        echeance.
      */}
      {reamenagement && edite ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <span className="font-medium">
            {jalons.find((jalon) => jalon.cle === edite)?.label ?? "Jalon"}
          </span>
          {reamenagement.decales.has(edite) ? (
            <button
              type="button"
              className="min-h-9 rounded-md border px-2 underline-offset-2 hover:underline"
              disabled={reamenagement.enCours}
              onClick={() => reamenagement.reinitialiser(edite)}
            >
              Revenir à la date de la promotion
            </button>
          ) : (
            <span className="text-muted-foreground">Aux dates de la promotion.</span>
          )}
          <button
            type="button"
            className="min-h-9 rounded-md px-2 text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setEdite(null)}
          >
            Terminer
          </button>
        </div>
      ) : null}

      {nonPlanifies.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {nonPlanifies.length} acquis ne sont portés par aucun jalon : ils n'ont pas d'échéance et
          n'apparaissent pas dans le diagramme.
        </p>
      ) : null}

      <div className="rounded-xl border bg-card shadow-[var(--shadow-card)] p-2">
        <Accordion type="multiple" className="w-full">
          {jalons.map((jalon) => (
            <AccordionItem key={jalon.cle} value={jalon.cle}>
              <AccordionTrigger className="min-w-0 gap-3 py-2 hover:no-underline">
                <MilestoneHeading
                  count={jalon.items.length}
                  color={jalon.couleur}
                  label={jalon.label}
                  done={jalon.acquis}
                  pending={jalon.aValider}
                  total={jalon.items.length}
                  trailing={
                    <span
                      className={`${EYEBROW} shrink-0 self-center text-muted-foreground`}
                      style={TABULAIRE}
                    >
                      {fmt(jalon.dueOn)}
                      {jalon.officielle ? " · officielle" : ""}
                      {reamenagement?.decales.has(jalon.cle) === true ? " · ma date" : ""}
                    </span>
                  }
                />
              </AccordionTrigger>
              <AccordionContent>
                <ul className="pt-1">
                  {jalon.items.map((item) => (
                    <PlanOutcomeRow
                      key={item.id}
                      item={item}
                      badges={
                        <span className="ml-2 text-xs text-muted-foreground">
                          {STAGE_LABELS_FR[item.stage]}
                        </span>
                      }
                    />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {nonPlanifies.length > 0 ? (
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="non-planifies">
              <AccordionTrigger className="min-w-0 gap-3 py-2 hover:no-underline">
                <MilestoneHeading
                  count={nonPlanifies.length}
                  color={couleurDe(undefined)}
                  label="Sans jalon"
                />
              </AccordionTrigger>
              <AccordionContent>
                <ul className="pt-1">
                  {nonPlanifies.map((item) => (
                    <PlanOutcomeRow key={item.id} item={item} />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </div>
    </div>
  );
}
