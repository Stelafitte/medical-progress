/**
 * INTERROMPRE ET REPRENDRE UNE PROMOTION — les boutons du pilotage.
 *
 * CE QUI ÉTAIT LÀ AVANT, et pourquoi il fallait le remplacer. Le panneau
 * « Programmation » portait déjà cinq boutons (activer, pause, reprendre,
 * terminer, réouvrir) branchés sur une machine à états correcte… posée dans un
 * `useState`. On mettait en pause, on rechargeait, c'était reparti. L'état de
 * départ, lui, était déduit des DATES de la promotion, pas de la base. Et le
 * pied de panneau l'avouait : « les changements d'état restent locaux ».
 *
 * CE QUI CHANGE. Trois boutons, un par degré (Stef, 16/09 : « il faut des
 * boutons pour chaque situation que tu envisages avec la Pause »), chacun
 * écrivant réellement par `pause_cohort`. La reprise passe par `resume_cohort`
 * et propose le décalage du calendrier. Le motif est obligatoire des deux
 * côtés — de l'écran ET de la base.
 *
 * LA GARDE N'EST PAS ICI. C'est un trigger de base qui refuse les écritures
 * d'apprenant sur une promotion suspendue ou gelée : cet écran ne fait que
 * décider et dire. Si cet écran se trompait, la base tiendrait quand même.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, History, Loader2, Pause, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  INTERRUPTION_ACTION_LABELS_FR,
  INTERRUPTION_EFFECT_FR,
  INTERRUPTION_MODES,
  INTERRUPTION_STATE_LABELS_FR,
  decalagePropose,
  finPrevueDepassee,
  interruptionEnCours,
  joursEcoules,
  type CohortInterruptionMode,
} from "@/domain/cohortInterruption";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { cleInterruptions } from "@/features/administration/cohortInterruptionQuery";
import type { CohortId } from "@/domain/types";

export function CohortInterruptionPanel({
  cohortId,
  cohortLabel,
  onChanged,
}: {
  readonly cohortId: CohortId;
  readonly cohortLabel: string;
  readonly onChanged?: () => void;
}) {
  const dataAccess = useDataAccess();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<CohortInterruptionMode | null>(null);
  const [motif, setMotif] = useState("");
  const [jusquA, setJusquA] = useState("");
  const [reprise, setReprise] = useState(false);
  const [semaines, setSemaines] = useState("0");
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const interruptions = useQuery({
    queryKey: cleInterruptions(cohortId),
    queryFn: () => dataAccess.programs.listCohortInterruptions(cohortId),
  });

  const enCours = interruptionEnCours(interruptions.data ?? []);

  const apresEcriture = () => {
    void queryClient.invalidateQueries({ queryKey: cleInterruptions(cohortId) });
    onChanged?.();
    setMode(null);
    setReprise(false);
    setMotif("");
    setJusquA("");
    setNote("");
    setErreur(null);
  };

  const poser = useMutation({
    mutationFn: (choisi: CohortInterruptionMode) =>
      dataAccess.programs.pauseCohort({
        cohortId,
        mode: choisi,
        reason: motif.trim(),
        expectedUntil: jusquA === "" ? null : jusquA,
      }),
    onSuccess: apresEcriture,
    onError: (raison: unknown) =>
      setErreur(raison instanceof Error ? raison.message : "Interruption impossible."),
  });

  const lever = useMutation({
    mutationFn: () =>
      dataAccess.programs.resumeCohort({
        cohortId,
        shiftWeeks: Number.parseInt(semaines, 10) || 0,
        note: note.trim(),
      }),
    onSuccess: apresEcriture,
    onError: (raison: unknown) =>
      setErreur(raison instanceof Error ? raison.message : "Reprise impossible."),
  });

  if (interruptions.isPending) {
    return <p className="text-muted-foreground text-[13px]">Lecture de l'état de la promotion…</p>;
  }

  return (
    <div className="space-y-4">
      {erreur ? (
        <p className="border-destructive/40 text-destructive rounded-lg border px-3 py-2 text-[13px]">
          {erreur}
        </p>
      ) : null}

      {enCours ? (
        /* ---------------- une interruption est en cours ---------------- */
        <div className="space-y-3">
          <div className="bg-card-sunk flex items-stretch overflow-hidden rounded-lg">
            <div className="bg-live w-[3px] shrink-0" aria-hidden />
            <div className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pause className="text-live size-4" aria-hidden />
                <span className="text-sm font-medium">
                  {INTERRUPTION_STATE_LABELS_FR[enCours.mode]}
                </span>
                <Badge variant="outline" className="bg-background font-normal">
                  depuis {joursEcoules(enCours)} jour(s)
                </Badge>
                {finPrevueDepassee(enCours) ? (
                  <Badge variant="outline" className="border-live/50 text-live font-normal">
                    <AlertTriangle className="me-1 size-3" aria-hidden />
                    fin prévue dépassée
                  </Badge>
                ) : null}
              </div>
              <p className="text-ink-soft text-[13px] leading-relaxed">
                {enCours.reason}
                {enCours.expectedUntil
                  ? ` · reprise prévue le ${formatFrDate(enCours.expectedUntil)}`
                  : null}
              </p>
              <p className="text-muted-foreground text-[12px]">
                {INTERRUPTION_EFFECT_FR[enCours.mode]}
              </p>
            </div>
          </div>

          {reprise ? (
            <div className="space-y-3 rounded-lg border p-4">
              {/*
                LE DÉCALAGE EST PROPOSÉ, PAS IMPOSÉ. La proposition est le
                nombre de semaines pleines écoulées ; l'équipe peut décider que
                la promotion rattrape, et remettre zéro.
              */}
              <div className="space-y-1.5">
                <Label htmlFor="reprise-semaines">Décaler le calendrier de</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="reprise-semaines"
                    type="number"
                    min={0}
                    max={104}
                    value={semaines}
                    onChange={(e) => setSemaines(e.target.value)}
                    className="min-h-11 w-24"
                  />
                  <span className="text-[13px]">semaine(s)</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setSemaines(String(decalagePropose(enCours)))}
                  >
                    proposer {decalagePropose(enCours)}
                  </Button>
                </div>
                <p className="text-muted-foreground text-[12px]">
                  La fin de la promotion et les jalons postérieurs au début de l'interruption
                  reculent d'autant. Ce qui a déjà eu lieu ne bouge pas. Zéro : la promotion
                  rattrape.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reprise-note">Note de reprise (facultative)</Label>
                <Textarea
                  id="reprise-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Terrain rouvert, effectif complet."
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={lever.isPending}
                  onClick={() => lever.mutate()}
                >
                  {lever.isPending ? (
                    <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                  ) : (
                    <PlayCircle className="me-1 size-4" aria-hidden />
                  )}
                  Reprendre {cohortLabel}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => setReprise(false)}
                >
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" className="min-h-11" onClick={() => setReprise(true)}>
              <PlayCircle className="me-1 size-4" aria-hidden />
              Reprendre le parcours
            </Button>
          )}
        </div>
      ) : mode ? (
        /* ---------------- le motif, avant d'engager ---------------- */
        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="font-display text-[17px] font-medium">
              {INTERRUPTION_ACTION_LABELS_FR[mode]}
            </p>
            <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
              {INTERRUPTION_EFFECT_FR[mode]}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="interruption-motif">Motif (obligatoire)</Label>
            <Textarea
              id="interruption-motif"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={2}
              placeholder="Terrain de stage fermé pour travaux."
            />
            <p className="text-muted-foreground text-[12px]">
              Il sera lu par l'apprenant et par l'encadrant, et restera dans l'historique.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="interruption-jusqua">Reprise prévue le (facultatif)</Label>
            <Input
              id="interruption-jusqua"
              type="date"
              value={jusquA}
              onChange={(e) => setJusquA(e.target.value)}
              className="min-h-11 w-full sm:w-52"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={motif.trim().length < 3 || poser.isPending}
              onClick={() => poser.mutate(mode)}
            >
              {poser.isPending ? (
                <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
              ) : null}
              Confirmer — {INTERRUPTION_ACTION_LABELS_FR[mode].toLowerCase()}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setMode(null);
                setErreur(null);
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        /* ---------------- les trois boutons ---------------- */
        <div className="space-y-2">
          <p className="text-muted-foreground text-[13px]">
            Trois degrés d'interruption, du plus fermé au plus discret. Chacun demande un motif.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {INTERRUPTION_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setErreur(null);
                }}
                className="hover:border-cta/60 min-h-11 rounded-lg border p-4 text-start transition-colors"
              >
                <span className="block text-sm font-medium">
                  {INTERRUPTION_ACTION_LABELS_FR[m]}
                </span>
                <span className="text-muted-foreground mt-1.5 block text-[12px] leading-relaxed">
                  {INTERRUPTION_EFFECT_FR[m]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- l'historique ---------------- */}
      <div className="space-y-2">
        <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.11em]">
          <History className="size-3.5" aria-hidden />
          Historique des interruptions
        </p>
        {(interruptions.data ?? []).filter((i) => i.endedOn).length === 0 ? (
          <EmptyState>Aucune interruption passée sur cette promotion.</EmptyState>
        ) : (
          <ul className="space-y-1.5">
            {(interruptions.data ?? [])
              .filter((i) => i.endedOn)
              .map((i) => (
                <li key={i.id} className="text-[13px]">
                  <span className="font-medium">{INTERRUPTION_STATE_LABELS_FR[i.mode]}</span>{" "}
                  <span className="text-muted-foreground">
                    du {formatFrDate(i.startedOn)} au {formatFrDate(i.endedOn!)} · {i.reason}
                    {i.shiftWeeks > 0 ? ` · calendrier décalé de ${i.shiftWeeks} semaine(s)` : null}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
