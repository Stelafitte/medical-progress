/**
 * LE JOUEUR DE QCM — une série, question par question, corrigée au barème EDN.
 *
 * Deux façons d'y arriver, une seule mécanique :
 *   - « Je m'évalue maintenant » : l'étudiant a composé sa série (thèmes,
 *     rangs, nombre) dans « Mes évaluations » ; l'URL porte ce choix ;
 *   - une fenêtre programmée : la série est celle que l'équipe a fixée ;
 *     l'URL porte l'identifiant de la fenêtre et rien d'autre.
 *
 * CE QUE LE JOUEUR NE SAIT PAS. Les bonnes réponses. `read_question` rend les
 * propositions sans elles ; `answer_question` enregistre la tentative ET rend
 * la correction — un aller-retour par question, jamais d'avance. Le score de
 * la série est la moyenne des scores EDN (1 / 0,5 / 0,2 / 0 selon les
 * discordances, 0 si une proposition éliminatoire est trahie).
 *
 * L'AVERTISSEMENT de Stef (CNEC 2026, décalages possibles) s'affiche avec
 * chaque correction, et « Signaler » est à un clic — c'est la contrepartie
 * d'une banque publiée sans relecture médicale complète.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, Flag, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FieldHeader } from "@/components/field-header";
import { Chiffres, Panneau, Vide } from "@/features/evaluations/ui-apprenant";
import { useDataAccess, useSession } from "@/application/session";
import { AVERTISSEMENT_REFERENTIEL_FR } from "@/domain/questionBankImport";
import { RAISONS_SIGNALEMENT } from "@/domain/questionReport";
import { windowState } from "@/domain/assessmentModality";
import type { QuestionCorrection, QuestionToAnswer } from "@/application/ports/repositories";

/** Ce que l'URL porte : soit une fenêtre, soit une série composée. */
export interface QcmPlayerParams {
  readonly modalityId: string;
  readonly sessionId?: string;
  readonly themeIds?: readonly string[];
  readonly chapters?: readonly number[];
  readonly sections?: readonly string[];
  readonly ranks?: readonly string[];
  readonly count?: number;
}

type Etape =
  | { readonly kind: "chargement" }
  | { readonly kind: "vide"; readonly raison: string }
  | { readonly kind: "question"; readonly index: number; readonly question: QuestionToAnswer }
  | { readonly kind: "correction"; readonly index: number; readonly question: QuestionToAnswer; readonly correction: QuestionCorrection }
  | { readonly kind: "fin" };

export function QcmPlayer({ params }: { readonly params: QcmPlayerParams }) {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();

  /*
   * 1. Résoudre la série : d'où viennent les identifiants ?
   *    D'une fenêtre (sa config + la banque du lien) ou de l'URL.
   */
  const serie = useQuery({
    queryKey: ["qcm-serie", activeProgram.id, params],
    queryFn: async () => {
      const links = await data.assessments.listCohortAssessmentLinks(activeProgram.id);
      const link = links.find(
        (l) => l.modalityId === params.modalityId && l.cohortId === activeEnrollment?.cohortId,
      );
      if (!link) throw new Error("Cette évaluation n'est pas servie à votre promotion.");
      if (!link.isOpen) throw new Error("Cette évaluation est fermée pour l'instant.");
      if (!link.questionSource) throw new Error("Aucune banque de questions n'est rattachée à cette évaluation.");

      let themeIds: readonly string[] = params.themeIds ?? [];
      let chapters: readonly number[] = params.chapters ?? [];
      let sections: readonly string[] = params.sections ?? [];
      let ranks: readonly string[] = params.ranks ?? [];
      let count = params.count ?? 20;
      if (params.sessionId) {
        const sessions = await data.assessments.listAssessmentSessions(activeProgram.id);
        const s = sessions.find((x) => x.id === params.sessionId);
        if (!s) throw new Error("Cette fenêtre n'existe plus.");
        if (windowState(s, new Date()) !== "open") throw new Error("Cette fenêtre n'est pas ouverte aujourd'hui.");
        themeIds = s.config?.themeIds ?? [];
        chapters = s.config?.chapters ?? [];
        sections = s.config?.sections ?? [];
        ranks = s.config?.ranks ?? [];
        count = s.config?.count ?? 20;
      } else if (!link.freeAccess) {
        throw new Error("L'accès libre n'est pas ouvert pour cette évaluation : attendez une fenêtre programmée.");
      }
      const ids = await data.assessments.pickQuestions(
        { programId: activeProgram.id, source: link.questionSource, themeIds, chapters, sections, ranks },
        count,
      );
      return { ids, count };
    },
    retry: false,
  });

  const [etape, setEtape] = useState<Etape>({ kind: "chargement" });
  const [choix, setChoix] = useState<readonly string[]>([]);
  const [scores, setScores] = useState<readonly number[]>([]);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const ids = useMemo(() => serie.data?.ids ?? [], [serie.data]);

  async function ouvrir(index: number) {
    const id = ids[index];
    if (!id) {
      setEtape({ kind: "fin" });
      return;
    }
    setEtape({ kind: "chargement" });
    setChoix([]);
    try {
      /*
      * L'inscription voyage avec la lecture : c'est elle qui déclenche le
      * tirage de l'ordre des propositions, REFAIT À CHAQUE LECTURE (16/09,
      * migration 20260916200000). Recharger la page redistribue donc les
      * propositions — voulu : on retient le contenu, pas la place.
      */
      const question = await data.assessments.readQuestion(id, activeEnrollment?.id);
      setEtape({ kind: "question", index, question });
    } catch (reason) {
      setErreur(reason instanceof Error ? reason.message : "Question illisible.");
      setEtape({ kind: "vide", raison: "Cette question ne peut pas être lue." });
    }
  }

  useEffect(() => {
    if (serie.isError) {
      setEtape({ kind: "vide", raison: serie.error instanceof Error ? serie.error.message : "Série impossible." });
      return;
    }
    if (!serie.data) return;
    if (serie.data.ids.length === 0) {
      setEtape({ kind: "vide", raison: "Aucune question ne répond à ce filtre dans la banque." });
      return;
    }
    void ouvrir(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie.data, serie.isError]);

  async function valider() {
    if (etape.kind !== "question" || !activeEnrollment) return;
    setBusy(true);
    setErreur(null);
    try {
      const correction = await data.assessments.answerQuestion(etape.question.id, activeEnrollment.id, choix);
      setScores((s) => [...s, correction.score]);
      setEtape({ kind: "correction", index: etape.index, question: etape.question, correction });
    } catch (reason) {
      setErreur(reason instanceof Error ? reason.message : "Réponse non enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  const total = ids.length;
  const faites = scores.length;
  const moyenne = faites > 0 ? scores.reduce((a, b) => a + b, 0) / faites : 0;

  return (
    <div className="space-y-6">
      {/* Le bandeau marine des écrans apprenant (16/09) — voir ui-apprenant.tsx. */}
      <FieldHeader
        eyebrow={params.sessionId ? "Série programmée" : "Je m'évalue maintenant"}
        title={total > 0 ? `${total} question(s)` : "Préparation…"}
        figures={
          total > 0
            ? [
                { value: `${faites} / ${total}`, label: "répondues" },
                { value: `${Math.round(moyenne * 100)} %`, label: "score moyen" },
              ]
            : []
        }
      >
        <div className="mt-5">
          <Button asChild variant="secondary" className="min-h-10">
            <Link to="/espace/evaluations">Quitter</Link>
          </Button>
        </div>
      </FieldHeader>

      {total > 0 && etape.kind !== "fin" ? (
        <div className="space-y-1">
          <Progress value={(faites / total) * 100} aria-label="Avancement" />
          <p className="text-muted-foreground text-xs">
            {faites} / {total} répondue(s)
            {faites > 0 ? ` · score moyen ${Math.round(moyenne * 100)} %` : ""}
          </p>
        </div>
      ) : null}

      {etape.kind === "chargement" ? <Skeleton className="h-48 w-full" /> : null}

      {etape.kind === "vide" ? (
        <Panneau title="Pas de série">
          <Vide>{etape.raison}</Vide>
          <Button asChild className="mt-3 min-h-11">
            <Link to="/espace/evaluations">Retour à mes évaluations</Link>
          </Button>
        </Panneau>
      ) : null}

      {etape.kind === "question" || etape.kind === "correction" ? (
        <Panneau
          title={`Question ${etape.index + 1} / ${total}`}
          description={etape.question.format.toUpperCase() + (etape.question.chapter ? ` · chapitre ${etape.question.chapter}` : "")}
        >
          <p className="text-base leading-relaxed">{etape.question.stem}</p>

          <ul className="mt-4 space-y-2">
            {etape.question.options.map((o) => {
              const coche = choix.includes(o.letter);
              const corr = etape.kind === "correction" ? etape.correction.options.find((c) => c.letter === o.letter) : undefined;
              const bordure =
                corr === undefined
                  ? "border-border"
                  : corr.correct
                    ? "border-green-600"
                    : coche
                      ? "border-destructive"
                      : "border-border";
              return (
                <li key={o.letter} className={`rounded-md border p-3 ${bordure}`}>
                  <div className="flex items-start gap-3">
                    {etape.kind === "question" ? (
                      <Checkbox
                        id={`opt-${o.letter}`}
                        checked={coche}
                        disabled={busy}
                        onCheckedChange={(c) =>
                          setChoix(c === true ? [...choix, o.letter] : choix.filter((x) => x !== o.letter))
                        }
                        className="mt-0.5"
                      />
                    ) : corr?.correct ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-label="exacte" />
                    ) : coche ? (
                      <XCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-label="cochée à tort" />
                    ) : (
                      <span className="mt-0.5 size-4 shrink-0" aria-hidden />
                    )}
                    <Label htmlFor={`opt-${o.letter}`} className="cursor-pointer text-sm font-normal leading-relaxed">
                      {/*
                        LA LETTRE AFFICHÉE EST CELLE DE LA PLACE, pas celle du
                        fichier : l'ordre est tiré à chaque lecture, donc la
                        même proposition peut être « C » ici et « A » au tour
                        suivant. La vraie lettre continue de voyager avec la
                        réponse, le barème et le signalement.
                      */}
                      <span className="mr-2 font-mono text-xs">
                        {String.fromCharCode(65 + etape.question.options.indexOf(o))}.
                      </span>
                      {o.body}
                      {corr?.explanation ? (
                        <span className="text-muted-foreground mt-1 block text-xs">{corr.explanation}</span>
                      ) : null}
                      {corr?.flag ? (
                        <Badge variant="outline" className="mt-1 font-normal">
                          {corr.flag === "inacceptable" ? "inacceptable" : "indispensable"}
                        </Badge>
                      ) : null}
                    </Label>
                  </div>
                </li>
              );
            })}
          </ul>

          {erreur ? <p className="text-destructive mt-3 text-sm">{erreur}</p> : null}

          {etape.kind === "question" ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button type="button" className="min-h-11" disabled={busy || choix.length === 0} onClick={() => void valider()}>
                {busy ? "Correction…" : "Valider ma réponse"}
              </Button>
              <span className="text-muted-foreground text-xs">Cochez toutes les propositions que vous jugez exactes.</span>
            </div>
          ) : null}

          {etape.kind === "correction" ? (
            <Correction
              etape={etape}
              derniere={etape.index + 1 >= total}
              onSuivante={() => void ouvrir(etape.index + 1)}
            />
          ) : null}
        </Panneau>
      ) : null}

      {etape.kind === "fin" ? (
        <Panneau title="Série terminée" description="Chaque réponse a été enregistrée dans votre passeport.">
          <Chiffres
            items={[
              { value: faites, label: "questions" },
              { value: `${Math.round(moyenne * 100)} %`, label: "score moyen" },
              { value: scores.filter((s) => s === 1).length, label: "sans faute" },
              { value: scores.filter((s) => s < 0.5).length, label: "à revoir" },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {!params.sessionId ? (
              <Button asChild className="min-h-11 gap-2">
                <Link to="/espace/evaluations">
                  <RotateCcw className="size-4" aria-hidden />
                  Une autre série
                </Link>
              </Button>
            ) : (
              <Button asChild className="min-h-11">
                <Link to="/espace/evaluations">Retour à mes évaluations</Link>
              </Button>
            )}
          </div>
        </Panneau>
      ) : null}
    </div>
  );
}

function Correction({
  etape,
  derniere,
  onSuivante,
}: {
  readonly etape: Extract<Etape, { kind: "correction" }>;
  readonly derniere: boolean;
  readonly onSuivante: () => void;
}) {
  const data = useDataAccess();
  const [signaler, setSignaler] = useState(false);
  const [raison, setRaison] = useState("erreur");
  const [message, setMessage] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = etape.correction;
  const pct = Math.round(c.score * 100);

  async function envoyer() {
    setBusy(true);
    try {
      await data.assessments.reportQuestion(etape.question.id, raison, message);
      setEnvoye(true);
      setSignaler(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-border mt-4 space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={c.score === 1 ? "secondary" : "outline"} className="text-sm">
          {pct} %
        </Badge>
        <span className="text-sm">
          {c.eliminatory
            ? "Une proposition éliminatoire a été trahie : la question vaut 0."
            : c.discordances === 0
              ? "Aucune discordance."
              : `${c.discordances} discordance(s) — barème EDN : 1 → 0,5 · 2 → 0,2 · 3 et plus → 0.`}
        </span>
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {AVERTISSEMENT_REFERENTIEL_FR}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="min-h-11 gap-2" onClick={onSuivante}>
          {derniere ? "Terminer la série" : "Question suivante"}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
        {!envoye ? (
          <Button type="button" variant="ghost" className="min-h-11 gap-2" onClick={() => setSignaler((v) => !v)}>
            <Flag className="size-4" aria-hidden />
            Signaler cette question
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">Signalement transmis à l'équipe pédagogique.</span>
        )}
      </div>

      {signaler ? (
        <div className="border-border space-y-2 rounded-md border p-3">
          <select className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm" value={raison} onChange={(e) => setRaison(e.target.value)}>
            {RAISONS_SIGNALEMENT.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <Textarea rows={3} value={message} placeholder="Ce qui vous semble discutable, la source si vous l'avez…" onChange={(e) => setMessage(e.target.value)} />
          <div className="flex gap-2">
            <Button type="button" size="sm" className="min-h-10" disabled={busy} onClick={() => void envoyer()}>
              Envoyer
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => setSignaler(false)}>
              Annuler
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Votre signalement est lu par toute l'équipe d'encadrement du programme.
          </p>
        </div>
      ) : null}
    </div>
  );
}
