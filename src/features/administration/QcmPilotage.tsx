/**
 * LE PILOTAGE D'UN QCM POUR UNE PROMOTION — le bloc que l'atelier déplie.
 *
 * Stef (15/09) : « en cliquant sur QCM d'entraînement je dois voir les banques
 * à disposition et choisir ; ouvert/fermé ; un calendrier de mise à
 * disposition sur la durée du stage ; soit l'accès libre à toute la base,
 * soit des auto-évaluations programmées calées sur le plan. Il faut les deux. »
 *
 * TROIS RÉGLAGES ET UNE LISTE :
 *   - Ouvert / fermé — le bouton manuel ;
 *   - la banque servie — choisie parmi celles importées, avec fichier,
 *     nombre et dates ;
 *   - l'accès libre — « je m'évalue maintenant », l'étudiant compose sa série ;
 *   - les fenêtres programmées — du… au…, thèmes, rangs, nombre. « Depuis un
 *     jalon » lit le plan de montée en connaissance déjà posé pour cette
 *     promotion et pré-remplit dates et thème : c'est ce qui cale les
 *     auto-évaluations sur la conception, sans la dupliquer.
 *
 * Chaque réglage s'enregistre AUSSITÔT (un interrupteur qui attend un bouton
 * plus bas trompe) ; l'atelier relit derrière.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { QcmResultats } from "@/features/administration/QcmResultats";
import {
  FILTRE_VIDE,
  FiltreQuestions,
  cleFiltre,
  type FiltreValeur,
} from "@/features/evaluations/FiltreQuestions";
import { useDataAccess } from "@/application/session";
import { milestoneDateFor } from "@/domain/acquisitionPlan";
import {
  windowState,
  type AssessmentModality,
  type AssessmentSession,
  type CohortAssessmentLink,
  type QcmWindowConfig,
} from "@/domain/assessmentModality";
import type { Cohort, OutcomeTheme, ProgramId } from "@/domain/types";
import type { QuestionBankRow } from "@/application/ports/repositories";

const SELECT_CLASS = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";

/* ------------------------------------------------------------------ */
/* Les réglages                                                         */
/* ------------------------------------------------------------------ */

export function QcmPilotage({
  programId,
  cohort,
  modality,
  link,
  banques,
  themes,
  sessions,
  editable,
  onChanged,
}: {
  readonly programId: ProgramId;
  readonly cohort: Cohort;
  readonly modality: AssessmentModality;
  readonly link: CohortAssessmentLink;
  readonly banques: readonly QuestionBankRow[];
  readonly themes: readonly OutcomeTheme[];
  readonly sessions: readonly AssessmentSession[];
  readonly editable: boolean;
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regler(
    patch: Partial<{ isOpen: boolean; questionSource: string; freeAccess: boolean }>,
  ) {
    setBusy(true);
    setError(null);
    try {
      await dataAccess.assessments.setCohortAssessmentPilotage({
        cohortId: cohort.id,
        assessmentModalityId: modality.id,
        isOpen: patch.isOpen ?? link.isOpen,
        questionSource: patch.questionSource ?? link.questionSource ?? "",
        freeAccess: patch.freeAccess ?? link.freeAccess,
      });
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Réglage impossible.");
    } finally {
      setBusy(false);
    }
  }

  const banque = banques.find((b) => b.source === link.questionSource);
  const fenetres = sessions
    .filter((s) => s.modalityId === modality.id && s.cohortId === cohort.id)
    .sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium">
          Pilotage <span className="text-muted-foreground font-normal">— pour cette promotion</span>
        </p>

        {/* Ouvert / fermé */}
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            id={`open-${modality.id}`}
            checked={link.isOpen}
            disabled={!editable || busy}
            onCheckedChange={(v) => void regler({ isOpen: v })}
          />
          <Label htmlFor={`open-${modality.id}`} className="text-sm font-normal">
            {link.isOpen ? "Ouvert" : "Fermé"}
            <span className="text-muted-foreground">
              {" "}
              —{" "}
              {link.isOpen
                ? "l'étudiant peut lancer"
                : "l'étudiant voit la modalité mais ne peut rien lancer"}
            </span>
          </Label>
        </div>

        {/* La banque */}
        <div className="space-y-1">
          <Label htmlFor={`bank-${modality.id}`} className="text-xs">
            Banque servie
          </Label>
          {banques.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Aucune banque importée pour ce programme. Importez-en une dans le panneau « Banque de
              questions » plus bas.
            </p>
          ) : (
            <select
              id={`bank-${modality.id}`}
              className={`${SELECT_CLASS} w-full`}
              value={link.questionSource ?? ""}
              disabled={!editable || busy}
              onChange={(e) => void regler({ questionSource: e.target.value })}
            >
              <option value="">— aucune banque —</option>
              {banques.map((b) => (
                <option key={b.source} value={b.source}>
                  {b.source} — {b.published} question(s)
                  {b.fileName ? ` — ${b.fileName}` : ""}
                  {b.fileModifiedAt ? ` (fichier du ${formatFrDate(b.fileModifiedAt)})` : ""}
                  {` — importée le ${formatFrDate(b.lastImportedAt)}`}
                </option>
              ))}
            </select>
          )}
          {banque ? (
            <p className="text-muted-foreground text-xs">
              {banque.published} publiée(s)
              {banque.drafts > 0 ? `, ${banque.drafts} brouillon(s)` : ""}
              {banque.flagged > 0 ? `, ${banque.flagged} signalée(s)` : ""} · importée le{" "}
              {formatFrDate(banque.lastImportedAt)}
              {banque.fileModifiedAt ? ` · fichier du ${formatFrDate(banque.fileModifiedAt)}` : ""}
            </p>
          ) : null}
        </div>

        {/* Accès libre */}
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            id={`free-${modality.id}`}
            checked={link.freeAccess}
            disabled={!editable || busy || !link.questionSource}
            onCheckedChange={(v) => void regler({ freeAccess: v })}
          />
          <Label htmlFor={`free-${modality.id}`} className="text-sm font-normal">
            Accès libre
            <span className="text-muted-foreground">
              {" "}
              — « Je m'évalue maintenant » : l'étudiant choisit thèmes, rangs et nombre, quand il
              veut
            </span>
          </Label>
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>

      {/* Les fenêtres */}
      <div className="space-y-2">
        <p className="text-xs font-medium">
          Fenêtres programmées{" "}
          <span className="text-muted-foreground font-normal">
            — des séries imposées, à dates fixes, calées ou non sur le plan
          </span>
        </p>
        {fenetres.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Aucune fenêtre.{" "}
            {link.freeAccess
              ? "L'étudiant s'entraîne en accès libre."
              : "Sans fenêtre ni accès libre, l'étudiant ne peut rien lancer."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {fenetres.map((s) => (
              <FenetreRow
                key={s.id}
                session={s}
                themes={themes}
                editable={editable}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}
        {editable && link.questionSource ? (
          <AjouterUneFenetre
            programId={programId}
            cohort={cohort}
            modality={modality}
            source={link.questionSource}
            themes={themes}
            onChanged={onChanged}
          />
        ) : null}
        {editable && !link.questionSource ? (
          <p className="text-muted-foreground text-xs">
            Choisissez d'abord une banque pour programmer des fenêtres.
          </p>
        ) : null}
      </div>

      {/* Les résultats — lus en base, agrégés */}
      <QcmResultats cohort={cohort} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Une fenêtre                                                          */
/* ------------------------------------------------------------------ */

function decrireConfig(
  config: QcmWindowConfig | undefined,
  themes: readonly OutcomeTheme[],
): string {
  if (!config) return "toute la banque";
  const parts: string[] = [];
  parts.push(`${config.count} question(s)`);
  if (config.themeIds.length > 0) {
    const noms = config.themeIds.map((id) => themes.find((t) => t.id === id)?.label ?? "?");
    parts.push(noms.length > 2 ? `${noms.length} thèmes` : noms.join(", "));
  } else parts.push("tous thèmes");
  if (config.sections && config.sections.length > 0)
    parts.push(`${config.sections.length} sous-item(s)`);
  else if (config.chapters && config.chapters.length > 0)
    parts.push(`${config.chapters.length} item(s)`);
  else parts.push("tous items");
  parts.push(config.ranks.length > 0 ? `rang ${config.ranks.join("/")}` : "tous rangs");
  return parts.join(" · ");
}

function FenetreRow({
  session,
  themes,
  editable,
  onChanged,
}: {
  readonly session: AssessmentSession;
  readonly themes: readonly OutcomeTheme[];
  readonly editable: boolean;
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [busy, setBusy] = useState(false);
  const etat = windowState(session, new Date());
  async function supprimer() {
    setBusy(true);
    try {
      await dataAccess.assessments.deleteAssessmentSession(session.id);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <CalendarRange className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="font-mono text-xs">
        {formatFrDate(session.scheduledOn)}
        {session.closesOn ? ` → ${formatFrDate(session.closesOn)}` : ""}
      </span>
      <span className="text-muted-foreground text-xs">{decrireConfig(session.config, themes)}</span>
      {session.notes ? (
        <span className="text-muted-foreground text-xs">· {session.notes}</span>
      ) : null}
      <Badge variant={etat === "open" ? "secondary" : "outline"} className="font-normal">
        {etat === "open" ? "ouverte" : etat === "upcoming" ? "à venir" : "fermée"}
      </Badge>
      {editable ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-9"
          disabled={busy}
          onClick={() => void supprimer()}
        >
          Supprimer
        </Button>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Ajouter une fenêtre — à la main, ou depuis un jalon du plan          */
/* ------------------------------------------------------------------ */

function AjouterUneFenetre({
  programId,
  cohort,
  modality,
  source,
  themes,
  onChanged,
}: {
  readonly programId: ProgramId;
  readonly cohort: Cohort;
  readonly modality: AssessmentModality;
  readonly source: string;
  readonly themes: readonly OutcomeTheme[];
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [filtre, setFiltre] = useState<FiltreValeur>(FILTRE_VIDE);
  const [count, setCount] = useState(20);
  const [milestoneId, setMilestoneId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Les jalons de CETTE promotion : le plan de montée en connaissance que
   * le Concepteur a posé (étape 3). On ne le duplique pas, on le lit.
   */
  const jalons = useQuery({
    queryKey: ["plan-milestones", cohort.id],
    queryFn: () => dataAccess.plan.listMilestones(cohort.id),
  });
  // Même clé que FiltreQuestions : lu une fois, partagé par le cache.
  const sections = useQuery({
    queryKey: ["question-sections", programId, source],
    queryFn: () => dataAccess.assessments.listQuestionSections(programId, source),
  });

  const disponibles = useQuery({
    queryKey: ["count-questions", programId, source, cleFiltre(filtre)],
    queryFn: () => dataAccess.assessments.countQuestions({ programId, source, ...filtre }),
  });

  function depuisJalon(id: string) {
    setMilestoneId(id);
    const j = jalons.data?.find((m) => m.id === id);
    if (!j) return;
    /*
     * Dates : la semaine du jalon (ou sa période). Thème : celui dont le
     * libellé est le libellé du jalon — c'est ainsi que le Concepteur les
     * nomme (« un chapitre, une échéance », milestoneTemplate.ts).
     */
    setDu(milestoneDateFor(cohort.startsOn, j.weekOffset));
    const finSemaine = new Date(milestoneDateFor(cohort.startsOn, j.weekOffsetEnd ?? j.weekOffset));
    finSemaine.setUTCDate(finSemaine.getUTCDate() + 6);
    setAu(finSemaine.toISOString().slice(0, 10));
    /*
     * Le jalon « Item 152 — … » désigne un item : on filtre sur son chapitre
     * dans la banque (l'axe visible), et seulement à défaut sur le thème.
     */
    const numero = /item\s*(\d+)/i.exec(j.label)?.[1];
    const chapitre = numero
      ? sections.data?.find((s) => s.itemCode === numero)?.chapter
      : undefined;
    if (chapitre !== undefined) {
      setFiltre((v) => ({ ...v, chapters: [chapitre], sections: [] }));
      return;
    }
    const theme = themes.find(
      (t) => t.label.trim().toLocaleLowerCase("fr") === j.label.trim().toLocaleLowerCase("fr"),
    );
    if (theme) setFiltre((v) => ({ ...v, themeIds: [theme.id] }));
  }

  async function ajouter() {
    if (!du) return;
    setBusy(true);
    setError(null);
    try {
      await dataAccess.assessments.createAssessmentSession({
        assessmentModalityId: modality.id,
        cohortId: cohort.id,
        scheduledOn: du,
        location: "",
        notes,
        ...(au ? { closesOn: au } : {}),
        config: {
          themeIds: filtre.themeIds,
          ranks: filtre.ranks,
          count,
          ...(filtre.chapters.length > 0 ? { chapters: filtre.chapters } : {}),
          ...(filtre.sections.length > 0 ? { sections: filtre.sections } : {}),
          ...(milestoneId ? { milestoneId } : {}),
        },
      });
      setDu("");
      setAu("");
      setFiltre(FILTRE_VIDE);
      setMilestoneId("");
      setNotes("");
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  }

  const dispo = disponibles.data ?? null;
  const tropDemande = dispo !== null && count > dispo;

  return (
    <div className="border-border space-y-3 rounded-md border border-dashed p-3">
      <p className="text-xs font-medium">Ajouter une fenêtre</p>

      {jalons.data && jalons.data.length > 0 ? (
        <div className="space-y-1">
          <Label htmlFor={`jalon-${modality.id}`} className="text-xs">
            Depuis un jalon du plan (optionnel — pré-remplit dates et thème)
          </Label>
          <select
            id={`jalon-${modality.id}`}
            className={`${SELECT_CLASS} w-full`}
            value={milestoneId}
            onChange={(e) => depuisJalon(e.target.value)}
          >
            <option value="">— à la main —</option>
            {[...jalons.data]
              .sort((a, b) => a.weekOffset - b.weekOffset)
              .map((j) => (
                <option key={j.id} value={j.id}>
                  S{j.weekOffset}
                  {j.weekOffsetEnd !== undefined ? `–S${j.weekOffsetEnd}` : ""} · {j.label}
                  {j.official ? " · officiel" : ""}
                </option>
              ))}
          </select>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`du-${modality.id}`} className="text-xs">
            Du
          </Label>
          <Input
            id={`du-${modality.id}`}
            type="date"
            value={du}
            onChange={(e) => setDu(e.target.value)}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`au-${modality.id}`} className="text-xs">
            Au (optionnel)
          </Label>
          <Input
            id={`au-${modality.id}`}
            type="date"
            value={au}
            min={du}
            onChange={(e) => setAu(e.target.value)}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`n-${modality.id}`} className="text-xs">
            Nombre de questions
          </Label>
          <Input
            id={`n-${modality.id}`}
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            className="min-h-11"
          />
        </div>
      </div>

      <FiltreQuestions
        programId={programId}
        source={source}
        themes={themes}
        value={filtre}
        onChange={setFiltre}
        idPrefix={`fen-${modality.id}`}
      />
      <p className={`text-xs ${tropDemande ? "text-destructive" : "text-muted-foreground"}`}>
        {dispo === null ? "…" : `${dispo} question(s) disponible(s) avec ce filtre`}
      </p>

      <div className="space-y-1">
        <Label htmlFor={`notes-${modality.id}`} className="text-xs">
          Consigne pour l'étudiant (optionnel)
        </Label>
        <Input
          id={`notes-${modality.id}`}
          value={notes}
          placeholder="Avant le cours du lundi, 20 minutes…"
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-11"
        />
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <Button
        type="button"
        size="sm"
        className="min-h-11"
        disabled={busy || !du || tropDemande}
        onClick={() => void ajouter()}
      >
        {busy ? "Ajout…" : "Programmer cette fenêtre"}
      </Button>
    </div>
  );
}
