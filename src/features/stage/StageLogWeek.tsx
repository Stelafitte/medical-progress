/**
 * « Mon carnet de stage » — la SEMAINE COURANTE, sept lignes.
 *
 * Décision de Stef (07/09) : l'étudiant voit sa semaine, navigue semaine par
 * semaine, et coche sa présence sur la ligne fermée — un geste par jour, sans
 * écran intermédiaire. C'est la même règle que la liste du Passeport : la case
 * est sur la ligne, jamais au fond d'un dépliant.
 *
 * Ce que dit la base, et qu'on ne réinvente pas ici :
 *
 * - **L'existence de l'entrée EST la présence.** Cocher enregistre la journée,
 *   décocher la supprime, et supprimer déclare l'absence. Il n'y a pas de
 *   colonne « présent ».
 * - **Le récit est dicté au clavier du téléphone** (touche micro native), pas
 *   enregistré en audio. On ne conserve que le texte — il traverse un couloir
 *   d'hôpital sans réseau, et ne coûte rien par entrée.
 * - La validation appartient à l'encadrant et porte sur une période ; l'étudiant
 *   ne soumet rien.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDataAccess, useSession } from "@/application/session";
import { STAGE_LOG_STATUS_LABELS_FR, type StageLog } from "@/domain/stageLog";
import type { EnrollmentId, PlacementId } from "@/domain/types";

/**
 * `AAAA-MM-JJ` composé en HEURE LOCALE.
 *
 * Surtout pas la conversion UTC : en UTC+2, une journée cochée après 22 h
 * serait enregistrée la veille, et l'étudiant ne le verrait pas. Un test de
 * `stageLogUi` interdit ce retour en arrière.
 */
function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Lundi de la semaine contenant `date`. La semaine française commence lundi. */
function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - shift);
  return monday;
}

function addDays(date: Date, count: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + count);
  return next;
}

/**
 * L ETAT D UNE SEMAINE — et pourquoi ces couleurs-la.
 *
 * Demande de Stef (08/09) : l onglet est terne, on ne sait pas ou l on est
 * quand on navigue. La couleur doit dire le temps. Deux affectations sur trois
 * ont ete deplacees, et voici les raisons :
 *
 * - LE VERT EST DEJA PRIS sur cet ecran : il dit « journee enregistree ». Le
 *   donner aussi a la semaine en cours ferait dire deux choses a une meme
 *   couleur. La semaine en cours prend donc `--live`, le jeton reserve dans
 *   tout le produit au TEMPS QUI PRESSE — c est exactement « c est maintenant ».
 * - LE ROUGE DIRAIT FAUX. Dans le jeu semantique il vaut `--destructive` : une
 *   erreur. Une semaine a venir n est pas une erreur, elle n a pas eu lieu. Et
 *   puisqu elle devient non modifiable, un fond rouge se lirait « interdit » la
 *   ou il faut lire « pas encore ». Elle reste donc eteinte : l absence de
 *   couleur dit « rien a faire ici », ce qui est vrai.
 * - L ORANGE SUR LE PASSE EST CONDITIONNEL. Une semaine passee incomplete
 *   merite l avertissement : il reste a rattraper, et c est actionnable. Une
 *   semaine passee complete merite le vert — c est la bonne nouvelle. Colorer
 *   les deux pareil ferait ignorer la couleur en trois jours.
 *
 * SECOND PASSAGE (08/09, « la colorisation est minimaliste ») : la premiere
 * version posait la teinte sur un filet de douze pixels au-dessus d une liste
 * restee entierement neutre. Le motif etait juste — ne pas noyer la case a
 * cocher — mais la conclusion trop timide : il ne restait presque rien a voir.
 * Trois corrections, sans jamais poser d aplat sous la case :
 *
 * 1. LE FILET DEVIENT UN BANDEAU. Etat, plage de dates, reste a consigner et
 *    navigation tiennent sur une meme surface teintee. La couleur occupe une
 *    hauteur, la ou l oeil cherche « ou suis-je » apres avoir navigue.
 * 2. ELLE DESCEND SUR CHAQUE LIGNE PAR UN LISERE de trois pixels, double d un
 *    lavis tres clair. Elle designe alors une journee et non un bloc : vert,
 *    elle est enregistree ; orange, elle est passee et manque.
 * 3. LA MARQUE « PRESENT » CESSE D ETRE GRISE. Un badge secondaire repetait la
 *    case cochee dans la seule teinte qui ne signifie rien ; elle prend le vert
 *    du jeu semantique, et son pendant orange nomme la journee qui manque.
 */
type EtatSemaine = "passee_incomplete" | "passee_complete" | "en_cours" | "a_venir";

/** Le bandeau : la teinte y est franche, c est la seule grande surface. */
const FOND_SEMAINE: Readonly<Record<EtatSemaine, string>> = {
  passee_incomplete: "bg-warning/20 border-warning/45",
  passee_complete: "bg-success/15 border-success/40",
  en_cours: "bg-live/25 border-live/55",
  a_venir: "bg-card-sunk",
};

/** L encre du bandeau. Aucun jeton ne fournit d encre sombre pour `--success`
 *  sur un lavis : `text-success` en petites capitales y suffit. */
const ENCRE_SEMAINE: Readonly<Record<EtatSemaine, string>> = {
  passee_incomplete: "text-warning-foreground",
  passee_complete: "text-success",
  en_cours: "text-live-ink",
  a_venir: "text-muted-foreground",
};

/** La bordure de la liste, en rappel : la couleur enveloppe les sept lignes
 *  sans passer dessous. */
const BORDURE_SEMAINE: Readonly<Record<EtatSemaine, string>> = {
  passee_incomplete: "border-warning/40",
  passee_complete: "border-success/35",
  en_cours: "border-live/50",
  a_venir: "",
};

const LIBELLE_SEMAINE: Readonly<Record<EtatSemaine, string>> = {
  passee_incomplete: "Semaine passée — des journées manquent",
  passee_complete: "Semaine passée — à jour",
  en_cours: "Semaine en cours",
  a_venir: "Semaine à venir — pas encore",
};

const DAY_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const RANGE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export interface StageLogWeekProps {
  readonly enrollmentId: EnrollmentId;
  readonly placementId: PlacementId;
  readonly placementName: string;
}

export function StageLogWeek({ enrollmentId, placementId, placementName }: StageLogWeekProps) {
  const dataAccess = useDataAccess();
  const queryClient = useQueryClient();
  const { activeProgram } = useSession();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});

  const { data, isPending } = useQuery({
    queryKey: ["stage-log", enrollmentId, placementId],
    queryFn: async () => {
      const logs = await dataAccess.stageLogs.listLogsForEnrollment(enrollmentId);
      return logs.find((log) => log.placementId === placementId) ?? null;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["stage-log", enrollmentId, placementId] });

  const saveDay = useMutation({
    mutationFn: (input: { readonly occurredOn: string; readonly narrative: string }) =>
      dataAccess.stageLogs.saveStageLogDay({ enrollmentId, placementId, ...input }),
    onSuccess: () => void invalidate(),
  });

  const removeDay = useMutation({
    mutationFn: (occurredOn: string) =>
      dataAccess.stageLogs.deleteStageLogDay({ enrollmentId, placementId, occurredOn }),
    onSuccess: () => void invalidate(),
  });

  /** Journées enregistrées, indexées par jour : la clé de tout l'écran. */
  const byDay = useMemo(() => {
    const index = new Map<string, string>();
    for (const entry of data?.entries ?? [])
      index.set(entry.occurredAt.slice(0, 10), entry.narrative);
    return index;
  }, [data]);

  if (isPending) return <Skeleton className="h-72 w-full" />;

  if (!data) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center text-sm">
        Votre carnet n'a pas encore été ouvert pour ce stage. Il l'est par l'administration du
        programme au moment où votre promotion est rattachée au terrain — signalez-le si l'oubli
        persiste.
      </p>
    );
  }

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const busy = saveDay.isPending || removeDay.isPending;
  const error = saveDay.error ?? removeDay.error;

  /** Une journée hors période est refusée par la base : autant la griser. */
  const outOfPeriod = (day: string) =>
    (data.periodStartsOn !== undefined && day < data.periodStartsOn) ||
    (data.periodEndsOn !== undefined && day > data.periodEndsOn);

  const validatedUpTo = lastValidatedDay(data);

  /*
   * ON NE DECLARE PAS SA PRESENCE A UN JOUR QUI N A PAS EU LIEU.
   *
   * DEFAUT RELEVE PAR STEF LE 08/09, et il etait entier : rien ne bornait le
   * futur. `outOfPeriod` ne verifie que la periode du stage, `locked` que le
   * passe deja contresigne — une journee de la semaine prochaine tombant dans
   * le stage etait donc cochable. Un etudiant pouvait declarer sa presence a
   * l avance, et l encadrant valider une periode sur des journees inventees.
   *
   * LA BASE NE L INTERDIT PAS : `save_stage_log_day` ne verifie que
   * l appartenance a la periode. La borne est donc posee ici, ET elle devra
   * l etre en base le jour ou une autre porte d ecriture existera — une regle
   * qui ne vit qu a l ecran n est pas une regle.
   *
   * AUJOURD HUI EST INCLUS : la journee se consigne le soir meme, c est tout
   * l objet du pave de la vue d ensemble.
   */
  const aujourdHui = isoDay(new Date());
  const inFuture = (day: string) => day > aujourdHui;

  /*
   * UNE JOURNEE MANQUANTE EST UN JOUR OUVRABLE DEJA PASSE, DANS LA PERIODE,
   * NON CONSIGNE ET PAS ENCORE CONTRESIGNE. Chacune des quatre conditions
   * porte :
   *
   * - samedi et dimanche rendraient toute semaine incomplete, et
   *   l avertissement serait ignore des la premiere ;
   * - aujourd hui ferait virer la ligne du jour a l orange des le matin, alors
   *   que la journee se consigne le soir ;
   * - une periode deja validee par l encadrant ne manque de rien : l absence y
   *   a ete constatee, pas oubliee. C est aussi pourquoi la semaine passee sans
   *   manque se dit « a jour » et non « complete » — l etudiant a pu etre
   *   absent, et ce n est pas un defaut.
   */
  const manquante = (date: Date) => {
    const day = isoDay(date);
    const jourDeSemaine = date.getDay();
    if (jourDeSemaine === 0 || jourDeSemaine === 6) return false;
    if (outOfPeriod(day) || day >= aujourdHui) return false;
    if (validatedUpTo !== null && day <= validatedUpTo) return false;
    return !byDay.has(day);
  };
  const manquantes = days.filter(manquante).length;

  const etatSemaine: EtatSemaine = (() => {
    const debut = isoDay(days[0] ?? new Date());
    const fin = isoDay(days[6] ?? new Date());
    if (debut > aujourdHui) return "a_venir";
    if (fin >= aujourdHui) return "en_cours";
    return manquantes > 0 ? "passee_incomplete" : "passee_complete";
  })();

  return (
    <section className="space-y-3" aria-label={`Carnet de la semaine — ${placementName}`}>
      {/*
        LE BANDEAU DE SEMAINE. Le nom du stage n y figure plus : la carte qui
        contient ce composant l affiche deja en serif, quarante pixels plus
        haut, et le repeter volait la place ou la couleur devait vivre. Il
        reste dans le nom accessible de la section.
      */}
      <header
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${FOND_SEMAINE[etatSemaine]}`}
      >
        <div className="min-w-0">
          <p className={`${EYEBROW} ${ENCRE_SEMAINE[etatSemaine]}`}>
            {LIBELLE_SEMAINE[etatSemaine]}
          </p>
          <p
            className="font-display mt-1 text-[16.5px] font-medium leading-tight tracking-[-0.01em]"
            style={TABULAIRE}
          >
            {RANGE_FORMAT.format(weekStart)} — {RANGE_FORMAT.format(addDays(weekStart, 6))}
          </p>
          {manquantes > 0 ? (
            <p className="text-muted-foreground mt-0.5 text-[12.5px]" style={TABULAIRE}>
              {manquantes} journée{manquantes > 1 ? "s" : ""} à consigner
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Semaine précédente"
            onClick={() => setWeekStart((current) => addDays(current, -7))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setWeekStart(mondayOf(new Date()))}>
            Cette semaine
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Semaine suivante"
            onClick={() => setWeekStart((current) => addDays(current, 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>

      <ul className={`overflow-hidden rounded-xl border ${BORDURE_SEMAINE[etatSemaine]}`}>
        {days.map((date) => {
          const day = isoDay(date);
          const stored = byDay.get(day);
          const present = stored !== undefined;
          const futur = inFuture(day);
          const manque = manquante(date);
          const disabled = busy || outOfPeriod(day) || futur;
          const locked = validatedUpTo !== null && day <= validatedUpTo;
          const value = drafts[day] ?? stored ?? "";

          /*
            LA COULEUR DESCEND SUR LA LIGNE PAR SON BORD. Le lavis reste autour
            de dix pour cent : la case a cocher est le seul geste de l ecran, il
            lui faut un fond calme. Le lisere, lui, est franc — c est ce qui se
            voit d un coup d oeil en descendant les sept lignes.

            L OPACITE EST ECRITE EN ENTIER, jamais entre crochets : le
            modificateur arbitraire se lit en POUR-CENT, si bien que `/[0.07]`
            vaudrait sept centiemes de pour-cent et ne peindrait rien. Le defaut
            serait invisible au compilateur comme aux tests.
          */
          const teinte = present
            ? "border-l-success bg-success/10"
            : manque
              ? "border-l-warning bg-warning/12"
              : futur
                ? "text-muted-foreground border-l-transparent bg-card-sunk"
                : "border-l-transparent";

          return (
            <li
              key={day}
              className={`space-y-2 border-t border-l-[3px] p-3 first:border-t-0 ${teinte}`}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`day-${day}`}
                  className="mt-1"
                  checked={present}
                  disabled={disabled || locked}
                  onCheckedChange={() => {
                    if (present) removeDay.mutate(day);
                    else saveDay.mutate({ occurredOn: day, narrative: "" });
                  }}
                />
                <label htmlFor={`day-${day}`} className="min-w-0 flex-1">
                  <span className="font-display block text-[15px] font-medium tracking-[-0.01em] first-letter:uppercase">
                    {DAY_FORMAT.format(date)}
                  </span>
                  {outOfPeriod(day) ? (
                    <span className="text-muted-foreground mt-0.5 block text-[12.5px]">
                      Hors période de stage
                    </span>
                  ) : futur ? (
                    <span className="text-muted-foreground mt-0.5 block text-[12.5px]">
                      Pas encore — une journée se consigne le jour même ou après
                    </span>
                  ) : locked ? (
                    <span className="text-muted-foreground mt-0.5 block text-[12.5px]">
                      Période déjà validée par l'encadrant
                    </span>
                  ) : null}
                </label>
                {present ? (
                  <span
                    className={`${EYEBROW} text-success inline-flex shrink-0 items-center gap-1`}
                  >
                    <Check className="size-3.5" aria-hidden />
                    Présent
                  </span>
                ) : manque ? (
                  <span className={`${EYEBROW} text-warning-foreground shrink-0`}>Manque</span>
                ) : null}
              </div>

              {present && !locked ? (
                <div className="space-y-2 pl-7">
                  <Textarea
                    value={value}
                    rows={2}
                    placeholder="Ce que vous avez fait — dictez avec la touche micro de votre clavier."
                    onChange={(event) =>
                      setDrafts((previous) => ({ ...previous, [day]: event.target.value }))
                    }
                  />
                  {value !== (stored ?? "") ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => saveDay.mutate({ occurredOn: day, narrative: value })}
                    >
                      <Check className="mr-1 size-4" />
                      Enregistrer
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground text-sm">
        Cocher une journée déclare votre présence ; la décocher déclare votre absence. Le carnet est{" "}
        {STAGE_LOG_STATUS_LABELS_FR[data.status].toLowerCase()} — votre encadrant le valide par
        périodes, vous n'avez rien à envoyer.
      </p>

      {error ? (
        <p className="text-destructive text-sm">
          {error instanceof Error ? error.message : "Enregistrement impossible."}
        </p>
      ) : null}

      {activeProgram.config.placementsEnabled ? null : (
        <p className="text-muted-foreground text-sm">
          Le module stage est désactivé pour ce programme.
        </p>
      )}
    </section>
  );
}

/** Dernier jour couvert par une validation acceptée : au-delà, on ne touche plus. */
function lastValidatedDay(log: StageLog): string | null {
  const covered = log.validations
    .filter((validation) => validation.decision === "validated")
    .map((validation) => validation.coversTo);
  if (covered.length === 0) return null;
  return covered.reduce((latest, current) => (current > latest ? current : latest));
}
