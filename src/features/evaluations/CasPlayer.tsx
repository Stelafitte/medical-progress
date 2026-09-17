/**
 * LE LECTEUR DE DOSSIER PROGRESSIF — mini-DP et KFP, côté étudiant.
 *
 * ⚠️ POURQUOI IL ARRIVE SI TARD, ET CE QUE ÇA DIT. Les 21 mini-DP (111 étapes)
 * ont été importés le 16/09, l'administration les voyait, `read_case` et
 * `answer_case_step` existaient en base et dans l'adaptateur — et AUCUN écran
 * ne les appelait. Du contenu mesuré, validé, déployé, et injouable pendant
 * deux jours. C'est la dette que ce fichier solde.
 *
 * LES QUATRE RÈGLES DU DOSSIER PROGRESSIF, telles que Stef les a posées :
 *
 *   1. LA VIGNETTE RESTE. Elle n'est pas un préambule qu'on lit et qu'on
 *      oublie : c'est le patient, et il est là à chaque étape. Elle reste donc
 *      à l'écran, repliable mais jamais perdue.
 *
 *   2. LES DONNÉES NOUVELLES ARRIVENT AVANT LA QUESTION. Le champ `reveal`
 *      d'une étape, c'est l'examen qu'on vient de recevoir, la biologie qui
 *      revient. Il s'affiche AVANT l'énoncé, jamais après : un dossier
 *      progressif se joue dans le temps du patient, pas dans celui du QCM.
 *
 *   3. ON NE REVIENT PAS EN ARRIÈRE. C'est toute la différence avec une série
 *      de questions indépendantes : l'étape 3 révèle souvent la réponse de
 *      l'étape 2. Autoriser le retour, ce serait autoriser la triche — et
 *      surtout vider l'exercice de son sens clinique.
 *
 *   4. LE CORRIGÉ TOMBE APRÈS CHAQUE ÉTAPE, pas à la fin. On apprend de
 *      l'étape qu'on vient de faire, pendant qu'on y pense encore.
 *
 * CE QUE LE LECTEUR NE SAIT PAS : les bonnes réponses. `read_case` rend les
 * propositions sans elles ; `answer_case_step` enregistre la tentative ET rend
 * la correction — un aller-retour par étape, jamais d'avance. Même contrat que
 * le QCM, et pour la même raison : rien de corrigeable ne transite avant que
 * l'étudiant ait répondu.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldHeader } from "@/components/field-header";
import { Chiffres, Panneau, Vide } from "@/features/evaluations/ui-apprenant";
import { useDataAccess, useSession } from "@/application/session";
import { AVERTISSEMENT_REFERENTIEL_FR } from "@/domain/questionBankImport";
import { etapeSuivante, scoreDuDossier, type EtapeJouee } from "@/domain/casProgressif";
import type { CaseStepCorrection } from "@/application/ports/repositories";

export interface CasPlayerParams {
  readonly caseId: string;
}

export function CasPlayer({ params }: { readonly params: CasPlayerParams }) {
  const dataAccess = useDataAccess();
  const { activeEnrollment } = useSession();
  const [vignetteOuverte, setVignetteOuverte] = useState(true);
  const [jouees, setJouees] = useState<readonly EtapeJouee[]>([]);
  const [choix, setChoix] = useState<readonly string[]>([]);
  const [correction, setCorrection] = useState<CaseStepCorrection | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const dossier = useQuery({
    queryKey: ["dossier-a-jouer", params.caseId, activeEnrollment?.id ?? "aucune"],
    queryFn: () => dataAccess.assessments.readCase(params.caseId, activeEnrollment?.id),
  });

  const etapes = useMemo(
    () => [...(dossier.data?.steps ?? [])].sort((a, b) => a.position - b.position),
    [dossier.data],
  );
  const index = jouees.length;
  const etape = etapes[index];
  const termine = etapes.length > 0 && index >= etapes.length;

  async function repondre() {
    if (!etape || !activeEnrollment) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const resultat = await dataAccess.assessments.answerCaseStep(
        etape.id,
        activeEnrollment.id,
        choix,
      );
      setCorrection(resultat);
    } catch (raison) {
      setErreur(raison instanceof Error ? raison.message : "Réponse non enregistrée.");
    } finally {
      setEnvoi(false);
    }
  }

  function suivante() {
    if (!etape || !correction) return;
    setJouees((liste) => [...liste, { etapeId: etape.id, score: correction.score }]);
    setChoix([]);
    setCorrection(null);
  }

  if (dossier.isPending) return <Skeleton className="h-96 w-full" />;

  if (dossier.error || !dossier.data) {
    return (
      <div className="space-y-4">
        <FieldHeader eyebrow="Mini-dossier progressif" title="Dossier indisponible" />
        <Panneau title="Ce dossier ne s'ouvre pas">
          <Vide>
            {dossier.error instanceof Error
              ? dossier.error.message
              : "Ce dossier n'est pas ouvert pour votre promotion."}
          </Vide>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/evaluations">Revenir à mes évaluations</Link>
          </Button>
        </Panneau>
      </div>
    );
  }

  const cas = dossier.data;
  const score = scoreDuDossier(jouees);

  return (
    <div className="space-y-5">
      <FieldHeader
        eyebrow={cas.itemCode ? `Item ${cas.itemCode}` : "Mini-dossier progressif"}
        title={cas.title}
        figures={[
          { value: `${Math.min(index + 1, etapes.length)}/${etapes.length}`, label: "Étape" },
          ...(jouees.length > 0
            ? [{ value: `${Math.round(score * 100)} %`, label: "Score en cours" }]
            : []),
        ]}
      >
        <div className="mt-5">
          <Progress value={(index / Math.max(1, etapes.length)) * 100} />
        </div>
      </FieldHeader>

      {/* 1. LA VIGNETTE RESTE — c'est le patient, il ne disparaît pas. */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <button
          type="button"
          onClick={() => setVignetteOuverte((v) => !v)}
          className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-start"
          aria-expanded={vignetteOuverte}
        >
          <Stethoscope className="size-4 shrink-0 text-cta" aria-hidden />
          <span className="text-[13px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
            Le patient
          </span>
          <span className="ms-auto">
            {vignetteOuverte ? (
              <ChevronUp className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
          </span>
        </button>
        {vignetteOuverte ? (
          <p className="whitespace-pre-line border-t px-4 py-4 text-[15px] leading-relaxed">
            {cas.vignette}
          </p>
        ) : null}
      </section>

      {termine ? (
        <Panneau
          title="Dossier terminé"
          description="Le score est la moyenne des étapes, au barème EDN."
        >
          <Chiffres
            items={[
              { value: `${Math.round(score * 100)} %`, label: "Score du dossier" },
              { value: etapes.length, label: "Étapes" },
            ]}
          />
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            {AVERTISSEMENT_REFERENTIEL_FR}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link to="/espace/evaluations">Revenir à mes évaluations</Link>
            </Button>
          </div>
        </Panneau>
      ) : etape ? (
        <>
          {/* 2. LES DONNÉES NOUVELLES ARRIVENT AVANT LA QUESTION. */}
          {etape.reveal ? (
            <div className="flex items-stretch overflow-hidden rounded-xl bg-card-sunk">
              <div className="w-[3px] shrink-0 bg-cta" aria-hidden />
              <div className="px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                  Nouvelles données
                </p>
                <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">
                  {etape.reveal}
                </p>
              </div>
            </div>
          ) : null}

          <Panneau
            title={`Étape ${etape.position}`}
            {...(etape.expected === undefined
              ? {}
              : { description: `${etape.expected} proposition(s) exacte(s) attendue(s).` })}
          >
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{etape.stem}</p>

            <ul className="mt-4 space-y-2">
              {etape.options.map((option) => {
                const corrigee = correction?.options.find((o) => o.letter === option.letter);
                const coche = choix.includes(option.letter);
                return (
                  <li
                    key={option.letter}
                    className={`rounded-lg border p-4 ${
                      corrigee
                        ? corrigee.correct
                          ? "border-success/50 bg-success/5"
                          : coche
                            ? "border-destructive/50 bg-destructive/5"
                            : ""
                        : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`opt-${etape.id}-${option.letter}`}
                        checked={coche}
                        disabled={correction !== null || envoi}
                        onCheckedChange={(v) =>
                          setChoix((liste) =>
                            v === true
                              ? [...liste, option.letter]
                              : liste.filter((l) => l !== option.letter),
                          )
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <Label
                          htmlFor={`opt-${etape.id}-${option.letter}`}
                          className="text-[15px] font-normal leading-relaxed"
                        >
                          <strong className="me-1.5">{option.letter}.</strong>
                          {option.body}
                        </Label>
                        {corrigee ? (
                          <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-ink-soft">
                            {corrigee.correct ? (
                              <CheckCircle2
                                className="mt-0.5 size-4 shrink-0 text-success"
                                aria-hidden
                              />
                            ) : (
                              <XCircle
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            )}
                            <span>
                              {corrigee.explanation ?? (corrigee.correct ? "Exacte." : "Inexacte.")}
                              {corrigee.flag ? (
                                <Badge variant="outline" className="ms-2 font-normal">
                                  {corrigee.flag}
                                </Badge>
                              ) : null}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {erreur ? (
              <p className="mt-3 rounded-lg border border-destructive/40 px-3 py-2 text-[13px] text-destructive">
                {erreur}
              </p>
            ) : null}

            {/* 4. LE CORRIGÉ TOMBE APRÈS CHAQUE ÉTAPE. */}
            {correction ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={correction.score >= 1 ? "secondary" : "outline"}>
                    {Math.round(correction.score * 100)} %
                  </Badge>
                  {correction.eliminatory ? (
                    <Badge variant="outline" className="border-live/50 text-live font-normal">
                      <AlertTriangle className="me-1 size-3" aria-hidden />
                      proposition éliminatoire
                    </Badge>
                  ) : null}
                  <span className="text-[13px] text-muted-foreground">
                    {correction.discordances} discordance(s)
                  </span>
                </div>
                {correction.note ? (
                  <p className="whitespace-pre-line rounded-lg bg-card-sunk px-4 py-3 text-[14px] leading-relaxed">
                    {correction.note}
                  </p>
                ) : null}
                <Button type="button" className="min-h-11" onClick={suivante}>
                  {etapeSuivante(index, etapes.length) ? "Étape suivante" : "Voir mon score"}
                  <ArrowRight className="ms-1 size-4" aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={choix.length === 0 || envoi || !activeEnrollment}
                  onClick={() => void repondre()}
                >
                  Valider cette étape
                </Button>
                {/* 3. ON NE REVIENT PAS EN ARRIÈRE — et on le dit. */}
                <p className="text-[12px] text-muted-foreground">
                  Une étape validée ne se reprend pas : la suivante en révèle souvent la réponse.
                </p>
              </div>
            )}
          </Panneau>
        </>
      ) : (
        <Panneau title="Dossier vide">
          <Vide>Ce dossier ne porte aucune étape.</Vide>
        </Panneau>
      )}
    </div>
  );
}
