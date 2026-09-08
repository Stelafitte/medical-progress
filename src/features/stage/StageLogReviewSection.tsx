/**
 * Carnets vus par l'ENCADRANT, puis par l'administration du programme.
 *
 * Deux règles portées par ce fichier, et une seule autorité :
 *
 * - **Le périmètre n'est pas calculé ici.** L'écran demande les carnets du
 *   programme ; c'est `supervises_enrollment()` qui décide, côté serveur, à
 *   partir des GROUPES d'encadrement. Refiltrer à l'affichage redonnerait à
 *   cette page une autorité qu'elle n'a pas, et masquerait un défaut de policy
 *   au lieu de le révéler.
 * - **La validation porte une PÉRIODE**, jamais une journée : une semaine,
 *   trois, ou tout le stage. L'étudiant ne soumet rien — l'encadrant valide
 *   quand il le décide.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Inbox, RotateCcw } from "lucide-react";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDataAccess, useSession } from "@/application/session";
import { STAGE_LOG_STATUS_LABELS_FR, nextStageLogStatus, type StageLog } from "@/domain/stageLog";
import type { Enrollment, Person } from "@/domain/types";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

/**
 * LA PHRASE RESTE D'UN SEUL TENANT DANS LE SOURCE. `stageLogUi.test.ts` la
 * cherche telle quelle dans le fichier : posee directement dans le JSX, elle
 * s'est fait couper en deux lignes par le formateur (« … par » / « e-mail. »),
 * et le contrat est tombe sans qu'aucun comportement ne change. Une constante
 * la met hors de portee du retour a la ligne.
 */
const MENTION_TRANSMISSION =
  "Transmission interne à l'application : aucun carnet n'est envoyé en pièce jointe par e-mail.";

/** Nom réel de l'apprenant : `enrollments` fait le lien vers son compte. */
function learnerNameOf(
  log: StageLog,
  enrollments: readonly Enrollment[],
  people: readonly Person[],
): string {
  const personId = enrollments.find((e) => e.id === log.enrollmentId)?.personId;
  return people.find((p) => p.id === personId)?.fullName ?? "Apprenant";
}

/** Dernier jour déjà couvert par une validation acceptée. */
function lastValidatedDay(log: StageLog): string | null {
  const covered = log.validations
    .filter((validation) => validation.decision === "validated")
    .map((validation) => validation.coversTo);
  if (covered.length === 0) return null;
  return covered.reduce((latest, current) => (current > latest ? current : latest));
}

function addOneDay(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + 1);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const dayOfMonth = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

export function StageLogsToValidate() {
  const dataAccess = useDataAccess();
  const queryClient = useQueryClient();
  const { rolesInActiveProgram, activeProgram } = useSession();

  const { data, isPending } = useQuery({
    queryKey: ["stage-logs-to-validate", activeProgram.id],
    queryFn: async () => {
      // Le périmètre n'est plus calculé ici : `supervises_enrollment()` le
      // décide côté serveur, à partir des GROUPES d'encadrement.
      const [logs, enrollments, people] = await Promise.all([
        dataAccess.stageLogs.listLogsToValidate(activeProgram.id),
        dataAccess.administration.listAllEnrollments(activeProgram.id),
        dataAccess.administration.listPeople(),
      ]);
      return { logs, enrollments, people };
    },
  });

  /**
   * Qui voit cette section — et pourquoi l'administration y figure.
   *
   * `supervises_enrollment()` est vraie pour `can_administer_program()` AVANT
   * même de regarder les groupes : l'administration d'un programme peut donc
   * valider n'importe quel carnet, et la contrainte de
   * `stage_log_validations.validator_role` accepte `administrator`. Sans cette
   * troisième ligne, l'écran cachait une action que le serveur autorise — et un
   * administrateur ne pouvait pas valider alors que rien ne le lui interdisait.
   */
  const isValidator =
    rolesInActiveProgram.includes("placement_supervisor") ||
    rolesInActiveProgram.includes("teacher") ||
    rolesInActiveProgram.includes("administrator");

  if (!isValidator) return null;
  if (isPending || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <section className="space-y-4" aria-labelledby="titre-a-valider">
      <SectionHeading
        id="titre-a-valider"
        title="Carnets à valider"
        description="Carnets des apprenants des groupes que vous encadrez. Vous validez la période de votre choix : une semaine, plusieurs, ou tout le stage."
      />
      <ul className="grid gap-3">
        {data.logs.map((log) => (
          <StageLogReviewCard
            key={log.id}
            log={log}
            learnerName={learnerNameOf(log, data.enrollments, data.people)}
            canValidate={!!nextStageLogStatus(log.status, "validate", rolesInActiveProgram)}
            onDone={() =>
              void queryClient.invalidateQueries({ queryKey: ["stage-logs-to-validate"] })
            }
          />
        ))}
        {data.logs.length === 0 ? (
          <li className="text-muted-foreground text-sm">
            Aucun carnet dans vos groupes d'encadrement.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function StageLogReviewCard({
  log,
  learnerName,
  canValidate,
  onDone,
}: {
  readonly log: StageLog;
  readonly learnerName: string;
  readonly canValidate: boolean;
  readonly onDone: () => void;
}) {
  const dataAccess = useDataAccess();
  const alreadyCovered = lastValidatedDay(log);
  const [coversFrom, setCoversFrom] = useState(
    alreadyCovered ? addOneDay(alreadyCovered) : (log.periodStartsOn ?? ""),
  );
  const [coversTo, setCoversTo] = useState(log.periodEndsOn ?? "");
  const [comment, setComment] = useState("");

  const decide = useMutation({
    mutationFn: (decision: "validated" | "needs_revision") =>
      dataAccess.stageLogs.validateStageLogBlock({
        stageLogId: log.id,
        coversFrom,
        coversTo,
        decision,
        comment,
      }),
    onSuccess: () => {
      setComment("");
      onDone();
    },
  });

  const days = log.entries.length;
  const inRange = log.entries.filter(
    (entry) => entry.occurredAt >= coversFrom && entry.occurredAt <= coversTo,
  ).length;
  const periodValid = coversFrom.length > 0 && coversTo.length > 0 && coversFrom <= coversTo;

  return (
    <li>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{learnerName}</CardTitle>
            <Badge variant="secondary" className="font-normal">
              {STAGE_LOG_STATUS_LABELS_FR[log.status]}
            </Badge>
          </div>
          <CardDescription>
            {days} journée(s) déclarée(s) sur l'ensemble du stage
            {alreadyCovered
              ? ` · déjà validé jusqu'au ${DATE_FORMAT.format(new Date(`${alreadyCovered}T00:00:00`))}`
              : " · aucune période validée pour l'instant"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {days === 0 ? (
            <p className="text-muted-foreground text-sm">
              Cet apprenant n'a déclaré aucune journée. Le carnet existe, il est vide — c'est
              l'information utile.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`from-${log.id}`}>Du</Label>
              <Input
                id={`from-${log.id}`}
                type="date"
                value={coversFrom}
                onChange={(event) => setCoversFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`to-${log.id}`}>Au</Label>
              <Input
                id={`to-${log.id}`}
                type="date"
                value={coversTo}
                onChange={(event) => setCoversTo(event.target.value)}
              />
            </div>
          </div>

          <p className="text-muted-foreground text-sm">
            {inRange} journée(s) déclarée(s) dans cette période.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor={`comment-${log.id}`}>Commentaire (facultatif)</Label>
            <Textarea
              id={`comment-${log.id}`}
              rows={2}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1"
              disabled={!canValidate || !periodValid || decide.isPending}
              onClick={() => decide.mutate("validated")}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              Valider cette période
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={!canValidate || !periodValid || decide.isPending}
              onClick={() => decide.mutate("needs_revision")}
            >
              <RotateCcw className="size-4" aria-hidden />
              Demander une correction
            </Button>
          </div>

          <p className="text-muted-foreground text-xs">
            La validation humaine est la seule source d'acquisition d'une compétence réelle.
          </p>

          {decide.error ? (
            <p className="text-destructive text-sm">
              {decide.error instanceof Error ? decide.error.message : "Validation impossible."}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}

/** « Carnets reçus » : espace interne de l'administration du programme. */
export function StageLogsReceived() {
  const dataAccess = useDataAccess();
  const { activeProgram } = useSession();

  const { data, isPending } = useQuery({
    queryKey: ["stage-logs-received", activeProgram.id],
    queryFn: async () => {
      const [logs, enrollments, people] = await Promise.all([
        dataAccess.stageLogs.listLogsReceived(activeProgram.id),
        dataAccess.administration.listAllEnrollments(activeProgram.id),
        dataAccess.administration.listPeople(),
      ]);
      return { logs, enrollments, people };
    },
  });

  if (isPending || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <section aria-labelledby="titre-recus">
      {/*
        LA MEME ANATOMIE QUE LE RESTE DE L'ESPACE APPRENANT : titre en serif
        sans chapeau, carte `rounded-xl` a l'ombre commune, tuile de compte en
        aplat marine et chiffres tabulaires. Une pastille `Badge` pour le statut
        pesait autant que le nom de l'etudiant, juste a cote.

        LA MENTION SUR LA TRANSMISSION redescend en note de pied, dans la carte
        qu'elle qualifie.
      */}
      <h2
        id="titre-recus"
        className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]"
      >
        Carnets reçus
      </h2>
      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        {data.logs.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            Aucun carnet reçu pour ce programme.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.logs.map((log) => {
              const validation = log.validations[0];
              return (
                <li key={log.id} className="flex items-start gap-3 px-4 py-3.5">
                  <span className="grid w-11 shrink-0 place-items-center rounded-lg bg-field py-2 text-field-ink">
                    <b className="text-[17px] font-bold leading-none" style={TABULAIRE}>
                      {log.entries.length}
                    </b>
                    <span className="mt-[3px] text-[9px] tracking-wider opacity-85">JOURS</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-display text-[16.5px] leading-tight tracking-[-0.01em]">
                      <Inbox className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      {learnerNameOf(log, data.enrollments, data.people)}
                    </p>
                    <p className={`${EYEBROW} mt-1.5 text-muted-foreground`}>
                      {STAGE_LOG_STATUS_LABELS_FR[log.status]}
                    </p>
                    <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
                      {validation
                        ? `Validé par ${
                            data.people.find((p) => p.id === validation.validatorPersonId)
                              ?.fullName ?? "responsable"
                          } le ${new Date(validation.decidedAt).toLocaleDateString("fr-FR")}.`
                        : "En attente de validation du responsable de stage."}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          {MENTION_TRANSMISSION}
        </p>
      </div>
    </section>
  );
}
