/**
 * « Mon carnet de stage », côté apprenant.
 *
 * L'écran part désormais des CARNETS de l'étudiant, plus de ses affectations :
 * la table d'affectation n'existe pas, et le rattachement passe par les groupes
 * d'encadrement depuis le 31/08. Un carnet est ouvert pour chaque inscrit au
 * moment où sa promotion est rattachée à un terrain.
 *
 * Le contenu affiché est réel : ce fichier ne lit plus aucune donnée simulée.
 */
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin } from "lucide-react";
import { FieldHeader } from "@/components/field-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { useDataAccess, useSession } from "@/application/session";
import { StageGroupChoice } from "@/features/stage/StageGroupChoice";
import { StageLogWeek } from "@/features/stage/StageLogWeek";
import { StageLogsToValidate } from "@/features/stage/StageLogReviewSection";
import { StageLogbookDeclaration } from "@/features/stage/StageLogbookDeclaration";
import { useMesEvaluations } from "@/features/evaluations/MesEvaluations";
import {
  STAGE_TRACKING_LABELS_FR,
  modeleDeCarnetRetenu,
  suiviDePresenceAttendu,
  tracesDuStage,
} from "@/domain/stageTracking";
import type { PlacementId } from "@/domain/types";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function StageView() {
  const { activeProgram, activeEnrollment } = useSession();
  const dataAccess = useDataAccess();
  const passport = useLearnerPassport();

  const enrollmentId = activeEnrollment?.id;

  const logs = useQuery({
    queryKey: ["stage-logs-mine", enrollmentId],
    enabled: enrollmentId !== undefined,
    queryFn: () => dataAccess.stageLogs.listLogsForEnrollment(enrollmentId!),
  });

  /*
   * DE QUOI LA TRACE DE CE STAGE EST-ELLE FAITE ? (16/09)
   *
   * Jusqu'ici cet écran ne savait afficher qu'une chose : la présence cochée
   * jour par jour, imposée dès qu'un stage existait. L'équipe décide désormais,
   * au Concepteur, sous « Journal de stage » — et tant qu'elle n'a rien décidé,
   * on garde le comportement d'avant (voir `domain/stageTracking.ts`).
   *
   * Même clé de requête que « Mes évaluations » : aucune requête de plus.
   */
  const mesEvaluations = useMesEvaluations();
  const modalites = mesEvaluations.data?.modalities ?? [];
  const traces = tracesDuStage(modalites);
  const presenceAttendue = suiviDePresenceAttendu(modalites, activeProgram.config.placementsEnabled);
  const carnetId = modeleDeCarnetRetenu(modalites);
  const horsPlateforme = traces.filter(
    (m) => m === "logbook_paper" || m === "supervisor_attestation",
  );

  const attestations = useQuery({
    queryKey: ["mes-attestations-de-stage", enrollmentId],
    enabled: enrollmentId !== undefined && horsPlateforme.length > 0,
    queryFn: () => dataAccess.stageLogs.listStageAttestations(enrollmentId!),
  });

  if (!activeEnrollment) {
    return (
      <p className="text-muted-foreground text-sm">Aucune inscription active pour ce programme.</p>
    );
  }

  if (!activeProgram.config.placementsEnabled) {
    return (
      <div>
        <FieldHeader eyebrow={activeProgram.name} title="Mon carnet de stage" />
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Les stages sont désactivés pour {activeProgram.name}. Vos compétences restent
            accessibles dans « Mes compétences » : elles ne dépendent pas du module stages.
          </p>
        </div>
      </div>
    );
  }

  if (logs.isPending || passport.isPending || !passport.data) {
    return <Skeleton className="h-64 w-full" />;
  }

  const placements = passport.data.placements;
  const myLogs = logs.data ?? [];

  /*
   * LES CHIFFRES DU BANDEAU VIENNENT DES ENTREES REELLES du carnet — une ligne
   * par journee presente, l'existence de l'entree ETANT la presence (31/08).
   * La duree se deduit de la periode du carnet ; sans periode, elle n'est pas
   * affichee plutot que devinee.
   */
  const joursConsignes = myLogs.reduce((n, log) => n + log.entries.length, 0);
  const semaines = myLogs.reduce((n, log) => {
    if (!log.periodStartsOn || !log.periodEndsOn) return n;
    const jours =
      (new Date(log.periodEndsOn).getTime() - new Date(log.periodStartsOn).getTime()) / 86400000;
    return n + Math.max(1, Math.round(jours / 7));
  }, 0);

  return (
    <div className="space-y-8">
      <FieldHeader
        eyebrow={activeProgram.name}
        title="Mon carnet de stage"
        figures={[
          ...(joursConsignes > 0 ? [{ value: joursConsignes, label: "jours consignés" }] : []),
          ...(semaines > 0 ? [{ value: semaines, label: "semaines de stage" }] : []),
        ]}
      />

      {carnetId && activeEnrollment ? (
        <StageLogbookDeclaration enrollmentId={activeEnrollment.id} templateId={carnetId} />
      ) : null}

      {horsPlateforme.length > 0 ? (
        <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-[16.5px] leading-tight tracking-[-0.01em]">
            Ce qui est tenu hors de la plateforme
          </h2>
          <ul className="mt-2 space-y-1.5">
            {horsPlateforme.map((mode) => {
              const posee = (attestations.data ?? []).find((a) => a.kind === mode);
              return (
                <li key={mode} className="text-[13px] leading-relaxed">
                  <span className="font-medium">{STAGE_TRACKING_LABELS_FR[mode]}</span>{" "}
                  <span className="text-muted-foreground">
                    {posee
                      ? `— attesté par votre responsable de stage${posee.note ? ` : ${posee.note}` : ""}`
                      : "— rien à remplir ici ; votre responsable de stage l'attestera au bilan."}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!presenceAttendue ? (
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Votre programme ne demande pas de relevé de présence quotidien pour ce stage.
          </p>
        </div>
      ) : myLogs.length === 0 ? (
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Aucun carnet n'est encore ouvert à votre nom. Il l'est par l'administration du programme
            au moment où votre promotion est rattachée à un terrain de stage.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {myLogs.map((log) => {
            const placement = placements.find((p) => p.id === log.placementId);
            return (
              <li key={log.id} className="space-y-3">
                {log.placementId ? <StageGroupChoice placementId={log.placementId} /> : null}
                <section className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
                  {/*
                    LA MEME ANATOMIE QUE LES AUTRES SECTIONS : tuile de compte en
                    aplat marine et chiffres tabulaires, titre en serif, metadonnees
                    en dessous. Une connaissance n'est pas un domaine : la tuile est
                    en marine, jamais dans une teinte de domaine.
                  */}
                  <div className="flex items-center gap-3 p-4">
                    <span className="grid w-11 shrink-0 place-items-center rounded-lg bg-field py-2 text-field-ink">
                      <b
                        className="text-[17px] font-bold leading-none"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {log.entries.length}
                      </b>
                      <span className="mt-[3px] text-[9px] tracking-wider opacity-85">JOURS</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-[16.5px] leading-tight tracking-[-0.01em]">
                        {placement?.name ?? "Stage"}
                      </h2>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          {placement ? `${placement.site} · ${placement.department}` : "—"}
                        </span>
                        {log.periodStartsOn && log.periodEndsOn ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                            {DATE_FORMAT.format(new Date(log.periodStartsOn))} —{" "}
                            {DATE_FORMAT.format(new Date(log.periodEndsOn))}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="border-t px-4 pb-4 pt-4">
                    <StageLogWeek
                      enrollmentId={activeEnrollment.id}
                      placementId={(log.placementId ?? "") as PlacementId}
                      placementName={placement?.name ?? "Stage"}
                    />
                    <p className="mt-3 border-t pt-3 text-[12.5px] text-muted-foreground">
                      Cochez les journées où vous étiez présent. Votre encadrant valide par
                      périodes.
                    </p>
                  </div>
                </section>
              </li>
            );
          })}
        </ul>
      )}

      <StageLogsToValidate />
    </div>
  );
}
