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
import { Badge } from "@/components/ui/badge";
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
 */
type EtatSemaine = "passee_incomplete" | "passee_complete" | "en_cours" | "a_venir";

const FOND_SEMAINE: Readonly<Record<EtatSemaine, string>> = {
  passee_incomplete: "bg-warning/10 border-warning/35",
  passee_complete: "bg-success/10 border-success/35",
  en_cours: "bg-live/15 border-live/45",
  a_venir: "bg-card-sunk",
};

const LIBELLE_SEMAINE: Readonly<Record<EtatSemaine, string>> = {
  passee_incomplete: "Semaine passée — des journées manquent",
  passee_complete: "Semaine passée — complète",
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
   * L ETAT DE LA SEMAINE AFFICHEE. « Complete » se lit sur les jours OUVRABLES
   * de la periode : compter samedi et dimanche rendrait toute semaine
   * incomplete, et l avertissement serait ignore des la premiere.
   */
  const joursAConsigner = days.filter((date) => {
    const day = isoDay(date);
    const jourDeSemaine = date.getDay();
    return !outOfPeriod(day) && jourDeSemaine !== 0 && jourDeSemaine !== 6;
  });
  const etatSemaine: EtatSemaine = (() => {
    const debut = isoDay(days[0] ?? new Date());
    const fin = isoDay(days[6] ?? new Date());
    if (debut > aujourdHui) return "a_venir";
    if (fin >= aujourdHui) return "en_cours";
    const manquantes = joursAConsigner.filter((date) => !byDay.has(isoDay(date))).length;
    return manquantes > 0 ? "passee_incomplete" : "passee_complete";
  })();

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{placementName}</p>
          <p className="text-muted-foreground text-sm">
            {RANGE_FORMAT.format(weekStart)} — {RANGE_FORMAT.format(addDays(weekStart, 6))}
          </p>
        </div>
        <div className="flex items-center gap-1">
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

      {/*
        LE BANDEAU PORTE L ETAT, PAS LA LISTE. Un fond teinte sur les sept
        lignes noierait la case a cocher, qui est le seul geste de l ecran. La
        couleur se lit en tete, ou l on cherche « ou suis-je » apres avoir
        navigue.
      */}
      <p
        className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[12.5px] font-medium ${FOND_SEMAINE[etatSemaine]}`}
      >
        <span>{LIBELLE_SEMAINE[etatSemaine]}</span>
        {etatSemaine === "passee_incomplete" ? (
          <span className="text-muted-foreground shrink-0 font-normal">
            {joursAConsigner.filter((date) => !byDay.has(isoDay(date))).length} à consigner
          </span>
        ) : null}
      </p>

      <ul className="divide-border divide-y rounded-md border">
        {days.map((date) => {
          const day = isoDay(date);
          const stored = byDay.get(day);
          const present = stored !== undefined;
          const futur = inFuture(day);
          const disabled = busy || outOfPeriod(day) || futur;
          const locked = validatedUpTo !== null && day <= validatedUpTo;
          const value = drafts[day] ?? stored ?? "";

          return (
            <li key={day} className={`space-y-2 p-3 ${futur ? "text-muted-foreground" : ""}`}>
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
                <label htmlFor={`day-${day}`} className="min-w-0 flex-1 text-sm">
                  <span className="block first-letter:uppercase">{DAY_FORMAT.format(date)}</span>
                  {outOfPeriod(day) ? (
                    <span className="text-muted-foreground block text-xs">
                      Hors période de stage
                    </span>
                  ) : futur ? (
                    <span className="text-muted-foreground block text-xs">
                      Pas encore — une journée se consigne le jour même ou après
                    </span>
                  ) : locked ? (
                    <span className="text-muted-foreground block text-xs">
                      Période déjà validée par l'encadrant
                    </span>
                  ) : null}
                </label>
                {present ? <Badge variant="secondary">Présent</Badge> : null}
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
