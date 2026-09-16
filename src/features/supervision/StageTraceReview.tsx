/**
 * LA TRACE DU STAGE, VUE PAR L'ÉQUIPE — dans le bilan, avant de prononcer.
 *
 * Deux choses, selon ce que le programme a retenu sous « Journal de stage »
 * (16/09) :
 *   - LE CARNET DÉCLARÉ : ce que l'étudiant dit avoir réalisé, item par item,
 *     face à ce qui est attendu. L'encadrant confirme ligne à ligne. Une
 *     déclaration modifiée après coup reperd sa confirmation — c'est la base
 *     qui le fait, pas cet écran.
 *   - LES TRACES HORS PLATEFORME : carnet physique, attestation. Rien n'est
 *     rempli ici ; le responsable de stage atteste les avoir vues, et c'est
 *     cette attestation que le bilan lit. Même règle que le PRONONCÉ (11/09) :
 *     l'attestation revient au responsable de stage ou à l'administration.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import {
  STAGE_TRACKING_LABELS_FR,
  modeleDeCarnetRetenu,
  tracesDuStage,
  type StageAttestation,
} from "@/domain/stageTracking";
import type { AssessmentModality } from "@/domain/assessmentModality";
import type { EnrollmentId } from "@/domain/types";

export function StageTraceReview({
  enrollmentId,
  modalities,
}: {
  readonly enrollmentId: EnrollmentId;
  readonly modalities: readonly AssessmentModality[];
}) {
  const dataAccess = useDataAccess();
  const { canValidatePlacement } = useSession();
  const [erreur, setErreur] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const traces = tracesDuStage(modalities);
  const carnetId = modeleDeCarnetRetenu(modalities);
  const horsPlateforme = traces.filter(
    (m): m is StageAttestation["kind"] => m === "logbook_paper" || m === "supervisor_attestation",
  );

  const modeles = useQuery({
    queryKey: ["carnets-de-stage-equipe"],
    enabled: Boolean(carnetId),
    queryFn: () => dataAccess.stageLogs.listTemplates(),
  });
  const declarations = useQuery({
    queryKey: ["carnet-declare", enrollmentId],
    enabled: Boolean(carnetId),
    queryFn: () => dataAccess.stageLogs.listLogbookReports(enrollmentId),
  });
  const attestations = useQuery({
    queryKey: ["attestations-de-stage", enrollmentId],
    enabled: horsPlateforme.length > 0,
    queryFn: () => dataAccess.stageLogs.listStageAttestations(enrollmentId),
  });

  if (traces.length === 0) return null;

  const modele = (modeles.data ?? []).find((m) => m.id === carnetId);

  async function agir(action: () => Promise<void>, relire: () => Promise<unknown>) {
    setErreur(null);
    try {
      await action();
      await relire();
    } catch (reason) {
      setErreur(reason instanceof Error ? reason.message : "Action impossible.");
    }
  }

  return (
    <div className="space-y-4">
      {erreur ? <p className="text-destructive text-sm">{erreur}</p> : null}

      {carnetId ? (
        declarations.isPending || modeles.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : !modele ? (
          <p className="text-muted-foreground text-xs">Le modèle de carnet n'est pas lisible.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium">
              {modele.label}{" "}
              <span className="text-muted-foreground font-normal">— déclaré par l'étudiant</span>
            </p>
            <ul className="divide-border border-border divide-y rounded-md border">
              {modele.objectives.map((objectif) => {
                const ligne = (declarations.data ?? []).find(
                  (d) => d.objectiveKey === objectif.key,
                );
                const confirme = Boolean(ligne?.validatedAt);
                return (
                  <li
                    key={objectif.key}
                    className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{objectif.label}</span>
                      {ligne?.note ? (
                        <span className="text-muted-foreground block text-xs">{ligne.note}</span>
                      ) : null}
                    </span>
                    <span
                      className="text-muted-foreground text-xs"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {ligne?.declaredCount ?? 0} / {objectif.quota}
                    </span>
                    {confirme ? (
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <BadgeCheck className="size-3.5" aria-hidden />
                        confirmé
                      </Badge>
                    ) : null}
                    {ligne ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={confirme ? "ghost" : "outline"}
                        className="min-h-9"
                        onClick={() =>
                          void agir(
                            () => dataAccess.stageLogs.validateLogbookReport(ligne.id, !confirme),
                            () => declarations.refetch(),
                          )
                        }
                      >
                        {confirme ? "Retirer" : "Confirmer"}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">rien de déclaré</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ) : null}

      {horsPlateforme.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium">
            Tenu hors plateforme{" "}
            <span className="text-muted-foreground font-normal">
              — à attester par le responsable de stage
            </span>
          </p>
          <ul className="divide-border border-border divide-y rounded-md border">
            {horsPlateforme.map((kind) => {
              const posee = (attestations.data ?? []).find((a) => a.kind === kind);
              return (
                <li key={kind} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{STAGE_TRACKING_LABELS_FR[kind]}</span>
                    {posee?.note ? (
                      <span className="text-muted-foreground block text-xs">{posee.note}</span>
                    ) : null}
                  </span>
                  {posee ? (
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <BadgeCheck className="size-3.5" aria-hidden />
                      attesté
                    </Badge>
                  ) : null}
                  {canValidatePlacement ? (
                    posee ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-9"
                        onClick={() =>
                          void agir(
                            () => dataAccess.stageLogs.revokeStageAttestation(enrollmentId, kind),
                            () => attestations.refetch(),
                          )
                        }
                      >
                        Retirer
                      </Button>
                    ) : (
                      <>
                        <Input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Précision (facultative)"
                          className="w-48"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-9"
                          onClick={() =>
                            void agir(
                              () =>
                                dataAccess.stageLogs.grantStageAttestation({
                                  enrollmentId,
                                  kind,
                                  note,
                                }),
                              () => attestations.refetch(),
                            )
                          }
                        >
                          Attester
                        </Button>
                      </>
                    )
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      {posee ? "" : "en attente du responsable de stage"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
