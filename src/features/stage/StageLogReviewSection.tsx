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
import { Button } from "@/components/ui/button";
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
    <section aria-labelledby="titre-a-valider">
      {/*
        MEME ANATOMIE QUE LE RESTE DE L ESPACE : titre en serif sans chapeau.
        Ce que disait le chapeau — « vous validez la periode de votre choix » —
        n est pas de la decoration, c est une affordance non evidente : elle
        descend donc sous la liste, une seule fois, plutot que d etre repetee
        sur chaque carnet.
      */}
      <h2
        id="titre-a-valider"
        className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]"
      >
        Carnets à valider
      </h2>
      {data.logs.length === 0 ? (
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-center text-[13px] text-muted-foreground">
            Aucun carnet dans vos groupes d'encadrement.
          </p>
        </div>
      ) : (
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
        </ul>
      )}
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        Carnets des apprenants des groupes que vous encadrez. Vous validez la période de votre choix
        : une semaine, plusieurs, ou tout le stage.
      </p>
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
    <li className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
      {/*
        LA TUILE PORTE LE COMPTE, comme partout ailleurs. Marine : un carnet
        n est pas un domaine de competence, et la teinte ne dit que cela.
      */}
      <div className="flex items-start gap-3 px-4 pb-3.5 pt-4">
        <span className="grid w-11 shrink-0 place-items-center rounded-lg bg-field py-2 text-field-ink">
          <b className="text-[17px] font-bold leading-none" style={TABULAIRE}>
            {days}
          </b>
          <span className="mt-[3px] text-[9px] tracking-wider opacity-85">JOURS</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16.5px] leading-tight tracking-[-0.01em]">
            {learnerName}
          </p>
          <p className={`${EYEBROW} mt-1.5 text-muted-foreground`}>
            {STAGE_LOG_STATUS_LABELS_FR[log.status]}
          </p>
          <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
            {days === 0
              ? "Aucune journée déclarée. Le carnet existe, il est vide — c'est l'information utile."
              : alreadyCovered
                ? `Déjà validé jusqu'au ${DATE_FORMAT.format(new Date(`${alreadyCovered}T00:00:00`))}.`
                : "Aucune période validée pour l'instant."}
          </p>
        </div>
      </div>

      <div className="space-y-3 border-t px-4 pb-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label
              htmlFor={`from-${log.id}`}
              className="block text-[12.5px] font-normal text-muted-foreground"
            >
              Du
            </Label>
            <Input
              id={`from-${log.id}`}
              type="date"
              value={coversFrom}
              onChange={(event) => setCoversFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor={`to-${log.id}`}
              className="block text-[12.5px] font-normal text-muted-foreground"
            >
              Au
            </Label>
            <Input
              id={`to-${log.id}`}
              type="date"
              value={coversTo}
              onChange={(event) => setCoversTo(event.target.value)}
            />
          </div>
        </div>

        <p className={`${EYEBROW} text-muted-foreground`} style={TABULAIRE}>
          {inRange} journée{inRange > 1 ? "s" : ""} déclarée{inRange > 1 ? "s" : ""} dans cette
          période
        </p>

        <div className="space-y-1.5">
          <Label
            htmlFor={`comment-${log.id}`}
            className="block text-[12.5px] font-normal text-muted-foreground"
          >
            Commentaire (facultatif)
          </Label>
          <Textarea
            id={`comment-${log.id}`}
            rows={2}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>

        {/*
          UN SEUL BOUTON PRIMAIRE. « Demander une correction » est l autre issue,
          pas l autre moitie : elle reste en contour.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="min-h-11 gap-1.5"
            disabled={!canValidate || !periodValid || decide.isPending}
            onClick={() => decide.mutate("validated")}
          >
            <CheckCircle2 className="size-4" aria-hidden />
            Valider cette période
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-1.5"
            disabled={!canValidate || !periodValid || decide.isPending}
            onClick={() => decide.mutate("needs_revision")}
          >
            <RotateCcw className="size-4" aria-hidden />
            Demander une correction
          </Button>
        </div>

        <p className="border-t pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          La validation humaine est la seule source d'acquisition d'une compétence réelle.
        </p>

        {decide.error ? (
          <p className="text-[13px] text-destructive">
            {decide.error instanceof Error ? decide.error.message : "Validation impossible."}
          </p>
        ) : null}
      </div>
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
