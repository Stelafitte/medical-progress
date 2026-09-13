/**
 * MES ÉVALUATIONS — ECOS VIRTUEL, LES STATIONS CHATGPT (13/09).
 *
 * LA DEMANDE. Stef, le 12/09 : les cinq GPT ECOS « sont à intégrer dans notre
 * plateforme ». Le 13/09 : option 1 — la station s'ouvre dans ChatGPT ; puis
 * « en créant un import de la fiche Excel debrief », avec, dans les consignes
 * avant de cliquer : « à la fin de l'ECOS et du débriefing, demander l'export
 * du Excel de la grille de notation qu'il faudra importer dans le hub ».
 *
 * CE QUE L'ÉCRAN FAIT. Trois choses, dans l'ordre où l'étudiant les vit :
 * les consignes AVANT le lien (sinon il découvre l'export après avoir fermé
 * ChatGPT), la liste des cinq stations avec le lien sortant, puis le retour
 * de la grille — fichier xlsx déposé, ou tableau du DEBRIEF collé — lu ici,
 * montré ligne à ligne, et enregistré seulement s'il est lisible en entier.
 *
 * ⚠️ CE QUE L'ÉCRAN NE FAIT PAS. Il ne lance pas la station, ne voit pas le
 * dialogue et ne juge rien : ce qu'il enregistre est une DÉCLARATION de
 * l'étudiant, visible de son équipe de stage (décision 5), ni une preuve ni
 * une confirmation (décisions 1 et 3). Le score affiché est recalculé à
 * partir des items — la base fait le même calcul et fait foi.
 */
import { useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useDataAccess, useSession } from "@/application/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ECOS_EXTERNAL_STATIONS,
  ecosRunPercent,
  type EcosExternalRun,
  type EcosExternalStation,
} from "@/domain/ecos";
import { readEcosGridRows, readEcosGridText, type EcosGridReading } from "@/domain/ecosGridImport";
import { readXlsxRows } from "@/infrastructure/xlsx/readXlsxRows";

const EYEBROW = "text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateCourte(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function EcosVirtuelView() {
  const data = useDataAccess();
  const { activeEnrollment } = useSession();
  const [stationOuverte, setStationOuverte] = useState<EcosExternalStation | null>(null);

  const cleRuns = ["ecos-external-runs", activeEnrollment?.id ?? "none"] as const;
  const { data: passages, isPending } = useQuery({
    queryKey: cleRuns,
    enabled: Boolean(activeEnrollment),
    queryFn: () =>
      activeEnrollment
        ? data.ecosExternal.listRunsForEnrollment(activeEnrollment.id)
        : Promise.resolve([]),
  });

  const dernierPar = useMemo(() => {
    const map = new Map<string, EcosExternalRun>();
    for (const r of passages ?? []) if (!map.has(r.stationKey)) map.set(r.stationKey, r);
    return map;
  }, [passages]);

  return (
    <div className="space-y-8">
      <SectionHeading
        level={1}
        title="Mes évaluations"
        description="Les stations ECOS virtuelles se jouent dans ChatGPT ; vous rapportez ensuite ici la grille de notation rendue au débriefing. Ce que vous déclarez reste une déclaration, visible de votre équipe de stage."
      />

      <Consignes />

      <section aria-labelledby="stations-titre" className="space-y-3">
        <div>
          <p className={EYEBROW}>ECOS virtuel</p>
          <h2 id="stations-titre" className="text-xl font-semibold">
            Stations ChatGPT
          </h2>
        </div>
        {!activeEnrollment ? (
          <p className="text-muted-foreground text-sm">
            Aucune inscription active : les stations restent consultables, mais rien ne peut être
            déclaré.
          </p>
        ) : null}
        <ul className="space-y-3">
          {ECOS_EXTERNAL_STATIONS.map((station) => {
            const dernier = dernierPar.get(station.key);
            return (
              <li
                key={station.key}
                className="bg-card rounded-xl border p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">
                      {station.label}{" "}
                      <span className="text-muted-foreground font-normal">· {station.patient}</span>
                    </p>
                    <p className="text-sm">{station.theme}</p>
                    <p className="text-muted-foreground text-sm">{station.role}</p>
                    {dernier ? (
                      <p className="text-sm">
                        Dernier passage déclaré le {dateCourte(dernier.playedOn)} :{" "}
                        <strong>
                          {dernier.score} / {dernier.maxScore}
                        </strong>{" "}
                        ({ecosRunPercent(dernier)} %)
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm">Aucun passage déclaré.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button asChild variant="default">
                      <a href={station.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-4" aria-hidden />
                        Ouvrir dans ChatGPT
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!activeEnrollment}
                      aria-expanded={stationOuverte?.key === station.key}
                      onClick={() =>
                        setStationOuverte((s) => (s?.key === station.key ? null : station))
                      }
                    >
                      <Upload className="size-4" aria-hidden />
                      Rapporter ma grille
                    </Button>
                  </div>
                </div>
                {stationOuverte?.key === station.key && activeEnrollment ? (
                  <RapporterGrille
                    station={station}
                    enrollmentId={activeEnrollment.id as string}
                    onEnregistre={() => setStationOuverte(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="passages-titre" className="space-y-3">
        <div>
          <p className={EYEBROW}>Historique</p>
          <h2 id="passages-titre" className="text-xl font-semibold">
            Mes passages déclarés
          </h2>
        </div>
        {isPending && activeEnrollment ? (
          <Skeleton className="h-20 w-full" />
        ) : !passages || passages.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun passage pour l'instant. Après une station, rapportez sa grille ci-dessus.
          </p>
        ) : (
          <ul className="space-y-2">
            {passages.map((run) => (
              <PassageDeclare key={run.id} run={run} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Les consignes AVANT le lien. La demande de l'export Excel est la dernière
 * étape dans ChatGPT : dite ici, elle n'est pas découverte trop tard.
 */
function Consignes() {
  return (
    <section
      aria-labelledby="consignes-titre"
      className="bg-card rounded-xl border p-4 shadow-[var(--shadow-card)]"
    >
      <p className={EYEBROW}>Avant de cliquer sur une station</p>
      <h2 id="consignes-titre" className="text-lg font-semibold">
        Comment jouer une station et rapporter sa grille
      </h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
        <li>
          <strong>Ouvrez la station</strong> : elle s'affiche dans ChatGPT, dans un nouvel onglet
          (un compte ChatGPT est nécessaire). Tapez « Affiche la consigne » si elle n'apparaît pas.
        </li>
        <li>
          <strong>Lancez un minuteur de 8 minutes</strong> et, de préférence, le mode vocal (icône
          du micro en bas à droite). Le GPT joue le patient — ou le sénior de garde pour l'ECG.
        </li>
        <li>
          En cas de digression, écrivez « Continue l'ECOS ». À la fin, écrivez{" "}
          <strong>« DEBRIEF »</strong> : le GPT commente votre passage et affiche la grille de
          notation.
        </li>
        <li>
          <strong>Demandez ensuite l'export Excel</strong> : « Exporte la grille de notation au
          format Excel (xlsx) ». Téléchargez le fichier proposé.
        </li>
        <li>
          Revenez ici, cliquez <strong>« Rapporter ma grille »</strong> sur la station jouée et
          déposez ce fichier. Si l'export n'est pas proposé, copiez le tableau du DEBRIEF et
          collez-le : il est lu de la même façon.
        </li>
      </ol>
      <p className="text-muted-foreground mt-3 text-sm">
        Le score est recalculé à partir des lignes de la grille ; la ligne TOTAL du fichier n'est
        pas lue. Votre équipe de stage voit vos passages et vos grilles, pas le dialogue.
      </p>
    </section>
  );
}

/**
 * Le retour de la grille : un fichier OU un texte collé, lu tout de suite,
 * montré ligne à ligne ; rien n'est envoyé tant qu'une ligne est illisible.
 */
function RapporterGrille({
  station,
  enrollmentId,
  onEnregistre,
}: {
  readonly station: EcosExternalStation;
  readonly enrollmentId: string;
  readonly onEnregistre: () => void;
}) {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const [jouee, setJouee] = useState(aujourdhuiIso);
  const [source, setSource] = useState<string>("");
  const [colle, setColle] = useState("");
  const [lecture, setLecture] = useState<EcosGridReading | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);

  const lireFichier = async (event: ChangeEvent<HTMLInputElement>) => {
    const fichier = event.target.files?.[0];
    if (!fichier) return;
    setErreurFichier(null);
    setLecture(null);
    try {
      const nom = fichier.name.toLowerCase();
      if (nom.endsWith(".xlsx")) {
        const rows = await readXlsxRows(await fichier.arrayBuffer());
        setLecture(readEcosGridRows(rows));
      } else {
        setLecture(readEcosGridText(await fichier.text()));
      }
      setSource(fichier.name);
    } catch (raison) {
      setErreurFichier(raison instanceof Error ? raison.message : "Fichier illisible.");
    }
  };

  const lireTexte = (texte: string) => {
    setColle(texte);
    setErreurFichier(null);
    if (texte.trim().length === 0) {
      setLecture(null);
      return;
    }
    setLecture(readEcosGridText(texte));
    setSource("tableau collé");
  };

  const enregistrer = useMutation({
    mutationFn: () => {
      if (!lecture || lecture.errors.length > 0 || lecture.items.length === 0) {
        return Promise.reject(new Error("La grille n'est pas lisible en entier."));
      }
      return data.ecosExternal.recordRun({
        enrollmentId: enrollmentId as EcosExternalRun["enrollmentId"],
        stationKey: station.key,
        stationLabel: station.label,
        playedOn: jouee,
        items: lecture.items,
      });
    },
    onSuccess: () => {
      toast.success("Passage déclaré, grille enregistrée.");
      void queryClient.invalidateQueries({ queryKey: ["ecos-external-runs"] });
      onEnregistre();
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Grille non enregistrée."),
  });

  const pret = Boolean(lecture && lecture.errors.length === 0 && lecture.items.length > 0);

  return (
    <div className="mt-4 space-y-4 border-t pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`jouee-${station.key}`}>Date du passage</Label>
          <Input
            id={`jouee-${station.key}`}
            type="date"
            value={jouee}
            max={aujourdhuiIso()}
            onChange={(e) => setJouee(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`fichier-${station.key}`}>Fichier Excel rendu par le GPT (.xlsx)</Label>
          <Input
            id={`fichier-${station.key}`}
            type="file"
            accept=".xlsx,.csv,.txt,.tsv"
            onChange={(e) => void lireFichier(e)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`colle-${station.key}`}>
          … ou le tableau du DEBRIEF, collé tel quel (Item, Barème, Note obtenue)
        </Label>
        <Textarea
          id={`colle-${station.key}`}
          rows={4}
          value={colle}
          placeholder={"Item\tBarème\tNote obtenue\nDescription de la dyspnée à l'effort\t5 / 2 / 0\t5"}
          onChange={(e) => lireTexte(e.target.value)}
        />
      </div>

      {erreurFichier ? (
        <p role="alert" className="text-destructive text-sm">
          {erreurFichier}
        </p>
      ) : null}

      {lecture ? <ApercuGrille lecture={lecture} source={source} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!pret || enregistrer.isPending}
          onClick={() => enregistrer.mutate()}
        >
          <FileSpreadsheet className="size-4" aria-hidden />
          {enregistrer.isPending ? "Enregistrement…" : "Enregistrer ce passage"}
        </Button>
        {lecture && !pret ? (
          <span className="text-muted-foreground text-sm">
            Corrigez les lignes signalées, puis déposez le fichier à nouveau.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ApercuGrille({
  lecture,
  source,
}: {
  readonly lecture: EcosGridReading;
  readonly source: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <strong>{lecture.items.length}</strong> item(s) lu(s) depuis {source || "la grille"}
        {lecture.items.length > 0 ? (
          <>
            {" "}
            — score recalculé{" "}
            <strong>
              {lecture.score} / {lecture.maxScore}
            </strong>{" "}
            ({ecosRunPercent(lecture)} %)
          </>
        ) : null}
        .
      </p>
      {lecture.errors.length > 0 ? (
        <ul role="alert" className="text-destructive list-disc space-y-0.5 pl-5 text-sm">
          {lecture.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      {lecture.items.length > 0 ? (
        <div className="max-h-64 overflow-auto rounded-lg border">
          <GrilleTable items={lecture.items} />
        </div>
      ) : null}
      {lecture.skipped.length > 0 ? (
        <p className="text-muted-foreground text-xs">Écarté : {lecture.skipped.join(" ; ")}.</p>
      ) : null}
    </div>
  );
}

export function GrilleTable({
  items,
}: {
  readonly items: readonly { label: string; maxPoints: number; points: number }[];
}) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 sticky top-0">
        <tr>
          <th scope="col" className="px-3 py-1.5 text-left font-medium">
            Item
          </th>
          <th scope="col" className="px-3 py-1.5 text-right font-medium">
            Barème
          </th>
          <th scope="col" className="px-3 py-1.5 text-right font-medium">
            Note
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={`${index}-${item.label}`} className="border-t">
            <td className="px-3 py-1.5">{item.label}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{item.maxPoints}</td>
            <td
              className={`px-3 py-1.5 text-right tabular-nums ${
                item.points === 0 && item.maxPoints > 0 ? "text-destructive" : ""
              }`}
            >
              {item.points}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Un passage de l'historique : dépliable pour relire la grille, effaçable en deux temps. */
function PassageDeclare({ run }: { readonly run: EcosExternalRun }) {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [confirmer, setConfirmer] = useState(false);

  const { data: items, isPending } = useQuery({
    queryKey: ["ecos-external-run-items", run.id],
    enabled: ouvert,
    queryFn: () => data.ecosExternal.listRunItems(run.id),
  });

  const effacer = useMutation({
    mutationFn: () => data.ecosExternal.deleteRun(run.id),
    onSuccess: () => {
      toast.success("Passage effacé.");
      void queryClient.invalidateQueries({ queryKey: ["ecos-external-runs"] });
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Passage non effacé."),
  });

  const pct = ecosRunPercent(run);
  return (
    <li className="bg-card rounded-xl border p-3 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {run.stationLabel}{" "}
            <span className="text-muted-foreground font-normal">
              · {dateCourte(run.playedOn)}
            </span>
          </p>
          <p className="text-sm">
            <strong>
              {run.score} / {run.maxScore}
            </strong>{" "}
            ({pct} %) · {run.itemCount} item(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
            {ouvert ? "Replier la grille" : "Voir la grille"}
          </Button>
          {confirmer ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={effacer.isPending}
                onClick={() => effacer.mutate()}
              >
                Confirmer l'effacement
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmer(false)}>
                Annuler
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmer(true)}>
              <Trash2 className="size-4" aria-hidden />
              Effacer
            </Button>
          )}
        </div>
      </div>
      {ouvert ? (
        <div className="mt-3 overflow-auto rounded-lg border">
          {isPending || !items ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <GrilleTable items={items} />
          )}
        </div>
      ) : null}
    </li>
  );
}
