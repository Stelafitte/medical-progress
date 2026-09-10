import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDataAccess } from "@/application/session";
import { learnerName, type SupervisionScope } from "@/features/supervision/useSupervision";
import type { StageLog } from "@/domain/stageLog";
import type { ValidateStageLogBlockInput } from "@/application/ports/repositories";

/**
 * CALENDRIER DE PRESENCE — étudiants en ordonnée, semaines en abscisse (10/09).
 *
 * CE QU'ON VALIDE ICI, ET RIEN D'AUTRE : des JOURS DE PRESENCE et le
 * commentaire laissé. Ni les compétences (elles ont leur onglet), ni « la
 * globalité ». Le modèle le disait déjà depuis le 31/08 —
 * `stage_log_validations` porte une PERIODE (`covers_from` → `covers_to`) et une
 * décision, et une entrée de carnet EST la déclaration de présence : l'écran ne
 * faisait que ne pas le montrer.
 *
 * LES COULEURS, ET CE QU'ELLES N'AFFIRMENT PAS :
 *   vert   — journée déclarée par l'étudiant ;
 *   gris   — journée à venir ;
 *   ambre  — journée passée non renseignée, DANS une semaine où l'étudiant a
 *            déclaré au moins un jour ;
 *   ardoise— semaine entière sans aucune déclaration.
 *
 * ⚠️ LA DERNIERE COULEUR EST UN AVEU, PAS UNE MESURE. Les étudiants alternent
 * semaines « on » (dans le service) et « off » (travail personnel), et cette
 * alternance N'EST MODELISEE NULLE PART en base. Peindre en rouge une semaine
 * off donnerait un calendrier presque entièrement rouge, donc illisible, donc
 * ignoré. Tant que le calendrier on/off n'est pas saisi par l'administration,
 * une semaine vide est traitée comme une semaine off — ce qui masque, il faut
 * le savoir, une semaine on entièrement oubliée.
 */

const JOURS = ["lun", "mar", "mer", "jeu", "ven"] as const;

/** `YYYY-MM-DD` en heure locale : jamais `toISOString()`, qui décale d'un jour. */
function cle(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const j = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${j}`;
}

function lundiDe(date: Date): Date {
  const d = new Date(date);
  const decalage = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - decalage);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface Semaine {
  readonly lundi: Date;
  readonly jours: readonly { readonly date: Date; readonly cle: string }[];
}

/** Les semaines ouvrables couvertes par la période du carnet. */
function semainesDeLaPeriode(debut: string, fin: string): readonly Semaine[] {
  const premier = lundiDe(new Date(debut));
  const dernier = new Date(fin);
  const semaines: Semaine[] = [];
  for (let l = new Date(premier); l <= dernier; l.setDate(l.getDate() + 7)) {
    const lundi = new Date(l);
    const jours = JOURS.map((_, i) => {
      const date = new Date(lundi);
      date.setDate(lundi.getDate() + i);
      return { date, cle: cle(date) };
    });
    semaines.push({ lundi, jours });
  }
  return semaines;
}

type EtatJour = "declare" | "avenir" | "manquant" | "hors";

function etatsDeLaSemaine(
  semaine: Semaine,
  declares: ReadonlySet<string>,
  debut: string,
  fin: string,
  aujourdhui: string,
): readonly EtatJour[] {
  const auMoinsUn = semaine.jours.some((j) => declares.has(j.cle));
  return semaine.jours.map((j) => {
    if (declares.has(j.cle)) return "declare";
    if (j.cle < debut || j.cle > fin) return "hors";
    if (j.cle > aujourdhui) return "avenir";
    return auMoinsUn ? "manquant" : "hors";
  });
}

const COULEUR: Record<EtatJour, string> = {
  declare: "bg-emerald-500",
  avenir: "bg-muted",
  manquant: "bg-amber-500",
  hors: "bg-muted/40",
};

const LEGENDE: readonly { etat: EtatJour; texte: string }[] = [
  { etat: "declare", texte: "journée déclarée" },
  { etat: "manquant", texte: "journée passée non renseignée" },
  { etat: "avenir", texte: "à venir" },
  { etat: "hors", texte: "hors période ou semaine sans déclaration" },
];

export function PresenceCalendar({ scope }: { scope: SupervisionScope }) {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState<{ logId: string; lundi: string } | null>(null);
  const [motif, setMotif] = useState("");

  const aujourdhui = cle(new Date());

  const carnets = useMemo(
    () =>
      scope.logsToValidate
        .filter((log): log is StageLog & { periodStartsOn: string; periodEndsOn: string } =>
          Boolean(log.periodStartsOn && log.periodEndsOn),
        )
        .map((log) => {
          const debut = log.periodStartsOn.slice(0, 10);
          const fin = log.periodEndsOn.slice(0, 10);
          const declares = new Set(log.entries.map((e) => e.occurredAt.slice(0, 10)));
          const recits = new Map(
            log.entries.map((e) => [e.occurredAt.slice(0, 10), e.narrative] as const),
          );
          return {
            log,
            nom: learnerName(scope, log.enrollmentId),
            debut,
            fin,
            declares,
            recits,
            semaines: semainesDeLaPeriode(debut, fin),
          };
        })
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    [scope],
  );

  const decider = useMutation({
    mutationFn: (input: ValidateStageLogBlockInput) => data.stageLogs.validateStageLogBlock(input),
    onSuccess: () => {
      toast.success("Décision enregistrée.");
      setOuvert(null);
      setMotif("");
      void queryClient.invalidateQueries({ queryKey: ["supervision"] });
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Décision non enregistrée."),
  });

  if (carnets.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-6 text-center text-[13px] leading-relaxed">
        Aucun carnet ouvert sur votre périmètre.
        <br />
        Les carnets s'ouvrent depuis l'administration, pour un groupe de supervision.
      </p>
    );
  }

  const semainesReference = carnets[0]!.semaines;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr>
              <th className="text-muted-foreground w-40 text-start text-xs font-normal">
                Étudiant
              </th>
              {semainesReference.map((s) => (
                <th
                  key={cle(s.lundi)}
                  className="text-muted-foreground px-1 text-xs font-normal"
                  scope="col"
                >
                  {s.lundi.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carnets.map((c) => (
              <tr key={c.log.id}>
                <th scope="row" className="pe-2 text-start font-medium">
                  {c.nom}
                </th>
                {c.semaines.map((s) => {
                  const etats = etatsDeLaSemaine(s, c.declares, c.debut, c.fin, aujourdhui);
                  const clef = cle(s.lundi);
                  const selectionnee = ouvert?.logId === c.log.id && ouvert.lundi === clef;
                  return (
                    <td key={clef} className="px-1">
                      <button
                        type="button"
                        aria-pressed={selectionnee}
                        aria-label={`Semaine du ${s.lundi.toLocaleDateString("fr-FR")} — ${c.nom}`}
                        className={`flex gap-0.5 rounded p-1 ${
                          selectionnee ? "ring-primary ring-2" : "hover:bg-muted/50"
                        }`}
                        onClick={() => {
                          setMotif("");
                          setOuvert(selectionnee ? null : { logId: c.log.id, lundi: clef });
                        }}
                      >
                        {etats.map((etat, i) => (
                          <span
                            key={JOURS[i]}
                            className={`size-3 rounded-[2px] ${COULEUR[etat]}`}
                            aria-hidden
                          />
                        ))}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {LEGENDE.map((l) => (
          <li key={l.etat} className="flex items-center gap-1.5">
            <span className={`size-3 rounded-[2px] ${COULEUR[l.etat]}`} aria-hidden />
            {l.texte}
          </li>
        ))}
      </ul>

      {ouvert
        ? (() => {
            const c = carnets.find((x) => x.log.id === ouvert.logId);
            const s = c?.semaines.find((x) => cle(x.lundi) === ouvert.lundi);
            if (!c || !s) return null;
            const vendredi = s.jours[4]!.cle;
            return (
              <div className="space-y-3 rounded-xl border p-4">
                <p className="font-medium">
                  {c.nom} — semaine du {s.lundi.toLocaleDateString("fr-FR")}
                </p>
                <ul className="space-y-2">
                  {s.jours.map((j, i) => {
                    const recit = c.recits.get(j.cle);
                    const declare = c.declares.has(j.cle);
                    return (
                      <li key={j.cle} className="text-sm">
                        <span className="font-medium">
                          {JOURS[i]} {j.date.toLocaleDateString("fr-FR")}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {declare ? "présent" : j.cle > aujourdhui ? "à venir" : "non renseigné"}
                        </span>
                        {recit ? (
                          <p className="text-muted-foreground mt-0.5 whitespace-pre-line">
                            {recit}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <div className="space-y-2">
                  <label htmlFor="motif-semaine" className="block text-sm font-medium">
                    Motif — obligatoire pour demander une correction
                  </label>
                  <Textarea
                    id="motif-semaine"
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    placeholder="Ce qui doit être complété ou corrigé."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={decider.isPending}
                    onClick={() =>
                      decider.mutate({
                        stageLogId: c.log.id,
                        coversFrom: ouvert.lundi,
                        coversTo: vendredi,
                        decision: "validated",
                        comment: motif.trim(),
                      })
                    }
                  >
                    Valider la semaine
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decider.isPending || motif.trim().length === 0}
                    onClick={() =>
                      decider.mutate({
                        stageLogId: c.log.id,
                        coversFrom: ouvert.lundi,
                        coversTo: vendredi,
                        decision: "needs_revision",
                        comment: motif.trim(),
                      })
                    }
                  >
                    Demander une correction
                  </Button>
                </div>
              </div>
            );
          })()
        : null}
    </div>
  );
}
