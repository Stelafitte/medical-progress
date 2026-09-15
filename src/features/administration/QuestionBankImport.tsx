/**
 * L'IMPORT DE LA BANQUE DE QUESTIONS — l'outil, dans l'onglet « Évaluations ».
 *
 * Stef (15/09) : « importer la banque de mon disque, pouvoir supprimer la
 * banque actuelle, réimporter, ou fusionner — une solution agile qui permette
 * de tout modifier tout le temps ». Quatre gestes, un fichier, un rapport.
 *
 * L'ORDRE EST CELUI DU RISQUE : on mesure d'abord (rien n'est écrit), on lit
 * le rapport — combien de questions ont trouvé leur acquis, lesquelles non —
 * puis on choisit fusionner, remplacer ou supprimer. Le bouton d'écriture
 * n'apparaît qu'après une mesure sur CE fichier.
 *
 * Le fichier est lu dans le navigateur, découpé par paquets de 100 questions
 * (~250 Ko) : 1 493 questions d'un coup feraient 4 Mo dans un seul appel.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  AVERTISSEMENT_REFERENTIEL_FR,
  DESTINATAIRES_SIGNALEMENT_FR,
  IMPORT_MODE_HINTS_FR,
  IMPORT_MODE_LABELS_FR,
  PARSE_ISSUE_LABELS_FR,
  chunk,
  mergeReports,
  parseBanque,
  type ImportMode,
  type ImportReport,
  type ImportedQuestion,
} from "@/domain/questionBankImport";
import type { ProgramId } from "@/domain/types";

const SOURCE_PAR_DEFAUT = "banque-cardio-2026";
const TAILLE_DE_LOT = 100;

export function QuestionBankImport({ programId }: { readonly programId: ProgramId }) {
  const dataAccess = useDataAccess();
  const summary = useQuery({
    queryKey: ["question-bank-summary", programId],
    queryFn: () => dataAccess.assessments.questionBankSummary(programId),
  });

  const [source, setSource] = useState(SOURCE_PAR_DEFAUT);
  const [publish, setPublish] = useState(true);
  const [fichier, setFichier] = useState<{ nom: string; questions: readonly ImportedQuestion[]; chapters: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mesure, setMesure] = useState<ImportReport | null>(null);
  const [resultat, setResultat] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<ImportMode | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lire(file: File) {
    setParseError(null);
    setMesure(null);
    setResultat(null);
    const text = await file.text();
    const parsed = parseBanque(text);
    if (!parsed.ok) {
      setFichier(null);
      setParseError(PARSE_ISSUE_LABELS_FR[parsed.issue]);
      return;
    }
    setFichier({ nom: file.name, questions: parsed.questions, chapters: parsed.chapters });
  }

  async function lancer(mode: ImportMode) {
    setBusy(mode);
    setError(null);
    setProgress(null);
    try {
      const items = mode === "delete" ? [] : (fichier?.questions ?? []);
      const lots = mode === "delete" ? [[]] : chunk(items, TAILLE_DE_LOT);
      const rapports: ImportReport[] = [];
      for (let i = 0; i < lots.length; i += 1) {
        setProgress(`${mode === "delete" ? "Retrait" : "Lot"} ${i + 1} / ${lots.length}…`);
        rapports.push(
          await dataAccess.assessments.importQuestionItems({
            programId,
            /*
             * En `replace`, seul le PREMIER lot retire l'existant ; les suivants
             * s'ajoutent en `merge`, sinon chaque lot effacerait le précédent.
             */
            mode: mode === "replace" && i > 0 ? "merge" : mode,
            source: source.trim(),
            items: lots[i] ?? [],
            publish,
          }),
        );
      }
      const total = mergeReports(rapports);
      if (mode === "dry_run") setMesure(total);
      else {
        setResultat(total);
        setMesure(null);
        await summary.refetch();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Import impossible.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const rows = summary.data ?? [];
  const total = rows.reduce((n, r) => n + r.questions, 0);

  return (
    <PanelCard
      title="Banque de questions"
      description="Ce que la banque contient, et l'outil pour la mesurer, la fusionner, la remplacer ou la supprimer — source par source."
      action={<FileUp className="text-primary size-5" aria-hidden />}
    >
      {/* ---- l'état ---- */}
      <div className="mb-4">
        {summary.isPending ? (
          <p className="text-muted-foreground text-xs">Lecture de la banque…</p>
        ) : rows.length === 0 ? (
          <EmptyState>Aucune question en base pour ce programme.</EmptyState>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <li key={`${r.source}-${r.status}`}>
                <Badge variant={r.status === "publiee" ? "secondary" : "outline"} className="font-normal">
                  {r.source} · {r.status} · {r.questions}
                </Badge>
              </li>
            ))}
            <li>
              <Badge variant="outline" className="font-normal">
                {total} au total
              </Badge>
            </li>
          </ul>
        )}
      </div>

      {/* ---- le fichier ---- */}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="qb-file">Fichier de la banque (banque.json)</Label>
          <Input
            id="qb-file"
            type="file"
            accept=".json,application/json"
            className="min-h-11"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lire(f);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qb-source">Source</Label>
          <Input
            id="qb-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="min-h-11"
            placeholder={SOURCE_PAR_DEFAUT}
          />
        </div>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        La source nomme un lot de questions. Remplacer ou supprimer n'agit que sur les questions de
        cette source : deux banques peuvent coexister sous deux noms.
      </p>
      {parseError ? <p className="text-destructive mt-2 text-sm">{parseError}</p> : null}
      {fichier ? (
        <p className="mt-2 text-sm">
          <strong>{fichier.nom}</strong> — {fichier.questions.length} question(s), {fichier.chapters}{" "}
          chapitre(s).{" "}
          <span className="text-muted-foreground">
            {mesure ? "Vérifié : vous pouvez importer." : "Vérifiez-le, puis importez."}
          </span>
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Checkbox id="qb-publish" checked={publish} onCheckedChange={(c) => setPublish(c === true)} />
        <Label htmlFor="qb-publish" className="text-sm font-normal">
          Publier à l'import (sinon : brouillon, invisible des étudiants)
        </Label>
      </div>

      {/* ---- les gestes ---- */}
      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium">Importation</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11"
            disabled={!fichier || busy !== null || source.trim() === ""}
            onClick={() => void lancer("dry_run")}
          >
            {busy === "dry_run" ? "Vérification…" : IMPORT_MODE_LABELS_FR.dry_run}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!fichier || !mesure || busy !== null}
            onClick={() => void lancer("merge")}
          >
            {busy === "merge" ? "Import…" : IMPORT_MODE_LABELS_FR.merge}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!fichier || !mesure || busy !== null}
            onClick={() => void lancer("replace")}
          >
            {busy === "replace" ? "Import…" : IMPORT_MODE_LABELS_FR.replace}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy !== null || source.trim() === "" || total === 0}
            onClick={() => {
              if (window.confirm(`Retirer toutes les questions de la source « ${source.trim()} » ?`))
                void lancer("delete");
            }}
          >
            {busy === "delete" ? "Retrait…" : IMPORT_MODE_LABELS_FR.delete}
          </Button>
        </div>
        <ul className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2">
          {(Object.keys(IMPORT_MODE_HINTS_FR) as ImportMode[]).map((m) => (
            <li key={m}>
              <strong className="font-medium">{IMPORT_MODE_LABELS_FR[m]}</strong> — {IMPORT_MODE_HINTS_FR[m]}
            </li>
          ))}
        </ul>
        {progress ? <p className="text-muted-foreground text-xs">{progress}</p> : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>

      {/* ---- le rapport ---- */}
      {mesure || resultat ? <Rapport rapport={(resultat ?? mesure)!} aBlanc={resultat === null} /> : null}

      <div className="border-border mt-5 space-y-1 border-t pt-3">
        <p className="text-muted-foreground text-xs">
          <strong className="font-medium">Avec chaque correction, l'étudiant lira :</strong>{" "}
          {AVERTISSEMENT_REFERENTIEL_FR}
        </p>
        <p className="text-muted-foreground text-xs">{DESTINATAIRES_SIGNALEMENT_FR}</p>
      </div>
    </PanelCard>
  );
}

function Rapport({ rapport, aBlanc }: { readonly rapport: ImportReport; readonly aBlanc: boolean }) {
  return (
    <div className="border-border mt-4 rounded-md border p-3">
      <p className="text-sm font-medium">
        {aBlanc ? "Vérification — rien n'a été écrit" : `Importé — ${IMPORT_MODE_LABELS_FR[rapport.mode]}`}
      </p>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-xs">Appariées à un acquis</dt>
          <dd>{rapport.matched}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Sans acquis — écartées</dt>
          <dd className={rapport.unmatched > 0 ? "text-destructive" : ""}>{rapport.unmatched}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{aBlanc ? "Seraient créées" : "Créées"}</dt>
          <dd>{rapport.inserted}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{aBlanc ? "Seraient mises à jour" : "Mises à jour"}</dt>
          <dd>{rapport.updated}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Supprimées</dt>
          <dd>{rapport.deleted}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Retirées (déjà répondues)</dt>
          <dd>{rapport.retired}</dd>
        </div>
      </dl>
      {rapport.unmatched_codes.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium">
            {rapport.unmatched_codes.length} code(s) d'acquis introuvable(s) dans le programme
          </summary>
          <p className="text-muted-foreground mt-1 font-mono text-xs break-words">
            {rapport.unmatched_codes.join("  ")}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Ces questions ne sont pas importées : leur code ne correspond à aucun acquis du référentiel.
            Créez ou renommez l'acquis, puis relancez.
          </p>
        </details>
      ) : null}
    </div>
  );
}
