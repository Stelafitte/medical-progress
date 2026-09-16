/**
 * L'INCIDENT, ET CE QU'IL APPELLE — le panneau « en cas de problème ».
 *
 * Stef, 16/09 : « il faut imaginer ce qui se passe en cas de problème ».
 *
 * CE QUI MANQUAIT, ET QUE CE PANNEAU APPORTE. Le Pilotage pouvait, au mieux,
 * offrir une liste de commandes. Face à un terrain fermé, il fallait savoir
 * laquelle choisir — et rien ne reliait le geste à sa cause. On part désormais
 * du PROBLÈME : sa nature, sa portée, depuis quand. Les gestes correctifs se
 * proposent alors d'eux-mêmes, et ils ne sont pas les mêmes selon ce qui est
 * cassé : un terrain fermé ne se répare pas en gelant les rendus de toute la
 * promotion, et un jalon manqué ne demande de suspendre personne.
 *
 * UN INCIDENT NE BLOQUE RIEN. Il constate. Ce sont les gestes pris ensuite qui
 * agissent, et le journal les relie au même incident.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  GESTE_LABELS_FR,
  INCIDENT_EXEMPLES_FR,
  INCIDENT_SCOPE_LABELS_FR,
  gestesPour,
  incidentsOuverts,
  joursDepuis,
  type IncidentScope,
} from "@/domain/pilotDecision";
import { cleIncidents, cleJournal } from "@/features/administration/cohortInterruptionQuery";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import type { CohortId, Placement } from "@/domain/types";
import type { PilotTimelineItem } from "@/features/administration/adminProgramViewModel";

const PORTEES: readonly IncidentScope[] = ["cohort", "placement", "milestone", "learner"];

export function IncidentsPanel({
  cohortId,
  placements,
  jalons,
  apprenants,
  onGeste,
}: {
  readonly cohortId: CohortId;
  readonly placements: readonly Placement[];
  readonly jalons: readonly PilotTimelineItem[];
  readonly apprenants: readonly { readonly id: string; readonly nom: string }[];
  /** Ouvre l'outil qui exécute le geste, sans quitter la promotion pilotée. */
  readonly onGeste?: (geste: string) => void;
}) {
  const dataAccess = useDataAccess();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [scope, setScope] = useState<IncidentScope>("cohort");
  const [scopeId, setScopeId] = useState("");
  const [titre, setTitre] = useState("");
  const [motif, setMotif] = useState("");
  const [survenuLe, setSurvenuLe] = useState("");
  const [clot, setClot] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const incidents = useQuery({
    queryKey: cleIncidents(cohortId),
    queryFn: () => dataAccess.programs.listIncidents(cohortId),
  });

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: cleIncidents(cohortId) });
    void queryClient.invalidateQueries({ queryKey: cleJournal(cohortId) });
  };

  const declarer = useMutation({
    mutationFn: () =>
      dataAccess.programs.declareIncident({
        cohortId,
        scope,
        title: titre.trim(),
        reason: motif.trim(),
        scopeId: scope === "cohort" ? null : scopeId,
        occurredOn: survenuLe === "" ? null : survenuLe,
      }),
    onSuccess: () => {
      rafraichir();
      setOuvert(false);
      setTitre("");
      setMotif("");
      setScopeId("");
      setSurvenuLe("");
      setErreur(null);
    },
    onError: (raison: unknown) =>
      setErreur(raison instanceof Error ? raison.message : "Déclaration impossible."),
  });

  const clore = useMutation({
    mutationFn: (id: string) => dataAccess.programs.resolveIncident(id, resolution.trim()),
    onSuccess: () => {
      rafraichir();
      setClot(null);
      setResolution("");
      setErreur(null);
    },
    onError: (raison: unknown) =>
      setErreur(raison instanceof Error ? raison.message : "Clôture impossible."),
  });

  /* Les objets que l'on peut désigner, selon la portée choisie. On ne propose
     que ce qui existe : un incident sur un terrain inexistant n'aide personne. */
  const objets =
    scope === "placement"
      ? placements.map((p) => ({ id: p.id, nom: p.name }))
      : scope === "milestone"
        ? jalons.map((j) => ({ id: j.id, nom: `${j.label} — ${formatFrDate(j.date)}` }))
        : scope === "learner"
          ? apprenants
          : [];

  const ouverts = incidentsOuverts(incidents.data ?? []);
  const clos = (incidents.data ?? []).filter((i) => i.resolvedOn);

  return (
    <div className="space-y-4">
      {erreur ? (
        <p className="border-destructive/40 text-destructive rounded-lg border px-3 py-2 text-[13px]">
          {erreur}
        </p>
      ) : null}

      {ouverts.length === 0 && !ouvert ? (
        <EmptyState>Aucun incident ouvert sur cette promotion.</EmptyState>
      ) : null}

      {ouverts.map((incident) => (
        <div
          key={incident.id}
          className="bg-card-sunk flex items-stretch overflow-hidden rounded-lg"
        >
          <div className="bg-live w-[3px] shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 space-y-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="text-live size-4" aria-hidden />
              <span className="text-sm font-medium">{incident.title}</span>
              <Badge variant="outline" className="bg-background font-normal">
                {INCIDENT_SCOPE_LABELS_FR[incident.scope]}
              </Badge>
              <Badge variant="outline" className="bg-background font-normal">
                depuis {joursDepuis(incident.occurredOn)} jour(s)
              </Badge>
            </div>
            <p className="text-ink-soft text-[13px] leading-relaxed">{incident.reason}</p>

            {/* CE QUE CET INCIDENT APPELLE — et rien d'autre. */}
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.11em]">
                Ce que cet incident appelle
              </p>
              <div className="flex flex-wrap gap-2">
                {gestesPour(incident.scope).map((geste) => (
                  <Button
                    key={geste}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => onGeste?.(geste)}
                  >
                    {GESTE_LABELS_FR[geste]}
                    <ArrowRight className="ms-1 size-3.5" aria-hidden />
                  </Button>
                ))}
              </div>
            </div>

            {clot === incident.id ? (
              <div className="space-y-2">
                <Label htmlFor={`resolution-${incident.id}`}>Comment cela a été réglé</Label>
                <Textarea
                  id={`resolution-${incident.id}`}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={2}
                  placeholder="Travaux terminés, service rouvert le 12/10."
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11"
                    disabled={resolution.trim().length < 3 || clore.isPending}
                    onClick={() => clore.mutate(incident.id)}
                  >
                    {clore.isPending ? (
                      <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                    ) : (
                      <CheckCircle2 className="me-1 size-4" aria-hidden />
                    )}
                    Clore l'incident
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setClot(null)}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-11"
                onClick={() => {
                  setClot(incident.id);
                  setResolution("");
                }}
              >
                Clore cet incident
              </Button>
            )}
          </div>
        </div>
      ))}

      {ouvert ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label>Qu'est-ce qui est touché ?</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {PORTEES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setScope(p);
                    setScopeId("");
                  }}
                  className={`min-h-11 rounded-lg border p-3 text-start transition-colors ${
                    scope === p ? "border-cta bg-cta/5" : "hover:border-cta/50"
                  }`}
                >
                  <span className="block text-[13px] font-medium">
                    {INCIDENT_SCOPE_LABELS_FR[p]}
                  </span>
                  <span className="text-muted-foreground mt-1 block text-[12px] leading-relaxed">
                    {INCIDENT_EXEMPLES_FR[p]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {scope === "cohort" ? null : (
            <div className="space-y-1.5">
              <Label htmlFor="incident-objet">Lequel ?</Label>
              {objets.length === 0 ? (
                <p className="text-muted-foreground text-[13px]">
                  Rien à désigner ici pour cette promotion.
                </p>
              ) : (
                <select
                  id="incident-objet"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">Choisir…</option>
                  {objets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nom}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="incident-titre">Ce qui s'est passé</Label>
            <Input
              id="incident-titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Service fermé pour travaux"
              className="min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="incident-motif">En détail</Label>
            <Textarea
              id="incident-motif"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={2}
              placeholder="Le bloc est indisponible jusqu'à nouvel ordre ; deux salles sur trois sont condamnées."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="incident-date">Survenu le (par défaut aujourd'hui)</Label>
            <Input
              id="incident-date"
              type="date"
              value={survenuLe}
              onChange={(e) => setSurvenuLe(e.target.value)}
              className="min-h-11 w-full sm:w-52"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={
                titre.trim().length < 3 ||
                motif.trim().length < 3 ||
                (scope !== "cohort" && scopeId === "") ||
                declarer.isPending
              }
              onClick={() => declarer.mutate()}
            >
              {declarer.isPending ? (
                <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
              ) : null}
              Déclarer l'incident
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setOuvert(false);
                setErreur(null);
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" className="min-h-11" onClick={() => setOuvert(true)}>
          <AlertTriangle className="me-1 size-4" aria-hidden />
          Déclarer un incident
        </Button>
      )}

      {clos.length > 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.11em]">
            Incidents clos
          </p>
          <ul className="space-y-1.5">
            {clos.map((i) => (
              <li key={i.id} className="text-[13px]">
                <span className="font-medium">{i.title}</span>{" "}
                <span className="text-muted-foreground">
                  · {formatFrDate(i.occurredOn)} → {formatFrDate(i.resolvedOn!)} · {i.resolution}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
