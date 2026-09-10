import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import {
  competencesDuProgramme,
  learnerName,
  useSupervision,
} from "@/features/supervision/useSupervision";
import { useDataAccess, useSession } from "@/application/session";
import type { StageLogId } from "@/domain/stageLog";

/**
 * BILAN DE FIN DE STAGE (10/09).
 *
 * ⚠️ AUCUNE TABLE `placement_reports` N'EXISTE, et on n'en cree pas une. La
 * decision finale est une VALIDATION DE PERIODE couvrant tout le stage :
 * `stage_log_validations` porte deja `covers_from` / `covers_to`, une decision
 * et un commentaire, et valider du premier au dernier jour EST valider le
 * stage. Ajouter une seconde table de decision aurait cree deux verites sur la
 * meme question -- exactement ce qu'on a refuse pour les affectations.
 *
 * CE QUE LE TABLEAU SYNTHETISE, ET CE QU'IL NE FAIT PAS. Il compte : jours
 * declares, competences confirmees, notes d'experience laissees, echanges
 * ouverts. Il NE JUGE PAS l'implication -- l'analyse des commentaires par l'IA
 * est un chantier a part, et un chiffre presente comme un jugement serait pire
 * qu'un chiffre brut.
 *
 * LES JOURS ATTENDUS SONT DES JOURS OUVRES DE LA PERIODE, alternance
 * « semaine on / semaine off » non deduite : elle n'est modelisee nulle part.
 * Le ratio est donc un plancher, jamais un taux d'absenteisme.
 */

function joursOuvres(debut: string, fin: string): number {
  let n = 0;
  const d = new Date(debut);
  const f = new Date(fin);
  while (d <= f) {
    const jour = d.getDay();
    if (jour !== 0 && jour !== 6) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

export function SupervisionReports() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { activeProgram } = useSession();
  const { data: scope, isPending } = useSupervision();
  const [ouvert, setOuvert] = useState<StageLogId | null>(null);
  const [motif, setMotif] = useState("");

  const enrollmentIds = scope?.enrollmentIds ?? [];

  const { data: notes } = useQuery({
    queryKey: ["experience-notes", "encadrement", enrollmentIds.join(",")],
    enabled: enrollmentIds.length > 0,
    queryFn: async () => {
      const paires = await Promise.all(
        enrollmentIds.map(async (id) => [id, await data.passport.listExperienceNotes(id)] as const),
      );
      return new Map(paires);
    },
  });

  const { data: fils } = useQuery({
    queryKey: ["discussion-threads", "programme", activeProgram.id],
    queryFn: () => data.discussions.listThreadsForProgram(activeProgram.id),
  });

  const clore = useMutation({
    mutationFn: (input: {
      stageLogId: StageLogId;
      coversFrom: string;
      coversTo: string;
      decision: "validated" | "needs_revision";
      comment: string;
    }) => data.stageLogs.validateStageLogBlock(input),
    onSuccess: () => {
      toast.success("Décision de fin de stage enregistrée.");
      setOuvert(null);
      setMotif("");
      void queryClient.invalidateQueries({ queryKey: ["supervision"] });
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Décision non enregistrée."),
  });

  if (isPending || !scope) return <Skeleton className="h-72 w-full" />;

  const competences = competencesDuProgramme(scope);

  const bilans = scope.logsToValidate
    .filter((log) => log.periodStartsOn && log.periodEndsOn)
    .map((log) => {
      const debut = log.periodStartsOn!.slice(0, 10);
      const fin = log.periodEndsOn!.slice(0, 10);
      const declarees = scope.declarations.get(log.enrollmentId) ?? [];
      const confirmees = declarees.filter((d) => d.validatedAt !== undefined).length;
      const echanges = (fils ?? []).filter((f) => f.enrollmentId === log.enrollmentId).length;
      const cloture = log.validations.find(
        (v) => v.coversFrom.slice(0, 10) === debut && v.coversTo.slice(0, 10) === fin,
      );
      return {
        log,
        nom: learnerName(scope, log.enrollmentId),
        debut,
        fin,
        jours: log.entries.length,
        attendus: joursOuvres(debut, fin),
        confirmees,
        notes: (notes?.get(log.enrollmentId) ?? []).length,
        echanges,
        cloture,
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Bilans de stage"
        level={1}
        description="La synthèse de chaque étudiant, et la décision qui clôt son stage."
      />

      <ScopeNotice>
        Les chiffres ci-dessous décrivent une activité déclarée, pas un jugement. La décision finale
        reste la vôtre.
      </ScopeNotice>

      <PanelCard
        title="Synthèse par étudiant"
        description="Jours déclarés, compétences confirmées, traces écrites et échanges."
      >
        {bilans.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun carnet ouvert sur votre périmètre.</p>
        ) : (
          <ul className="divide-border divide-y">
            {bilans.map((b) => (
              <li key={b.log.id} className="py-3 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{b.nom}</span>
                  {b.cloture ? (
                    <Badge variant={b.cloture.decision === "validated" ? "secondary" : "outline"}>
                      {b.cloture.decision === "validated" ? "stage validé" : "correction demandée"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-normal">
                      non clos
                    </Badge>
                  )}
                </div>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase">Jours déclarés</dt>
                    <dd>
                      {b.jours} <span className="text-muted-foreground">/ {b.attendus} ouvrés</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase">
                      Compétences confirmées
                    </dt>
                    <dd>
                      {b.confirmees}{" "}
                      <span className="text-muted-foreground">/ {competences.length}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase">Notes d'expérience</dt>
                    <dd>{b.notes}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase">Échanges ouverts</dt>
                    <dd>{b.echanges}</dd>
                  </div>
                </dl>

                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setMotif("");
                    setOuvert(ouvert === b.log.id ? null : b.log.id);
                  }}
                >
                  {ouvert === b.log.id ? "Fermer" : "Clore le stage"}
                </Button>

                {ouvert === b.log.id ? (
                  <div className="mt-3 space-y-3 rounded-xl border p-4">
                    <p className="text-sm">
                      Décision portant sur toute la période du{" "}
                      {new Date(b.debut).toLocaleDateString("fr-FR")} au{" "}
                      {new Date(b.fin).toLocaleDateString("fr-FR")}.
                    </p>
                    <div className="space-y-2">
                      <label htmlFor={`motif-${b.log.id}`} className="block text-sm font-medium">
                        Appréciation — obligatoire pour demander une correction
                      </label>
                      <Textarea
                        id={`motif-${b.log.id}`}
                        value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                        placeholder="Ce que vous retenez du stage de cet étudiant."
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={clore.isPending}
                        onClick={() =>
                          clore.mutate({
                            stageLogId: b.log.id,
                            coversFrom: b.debut,
                            coversTo: b.fin,
                            decision: "validated",
                            comment: motif.trim(),
                          })
                        }
                      >
                        Valider le stage
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={clore.isPending || motif.trim().length === 0}
                        onClick={() =>
                          clore.mutate({
                            stageLogId: b.log.id,
                            coversFrom: b.debut,
                            coversTo: b.fin,
                            decision: "needs_revision",
                            comment: motif.trim(),
                          })
                        }
                      >
                        Demander une correction
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
