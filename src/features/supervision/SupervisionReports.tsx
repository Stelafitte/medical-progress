import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import {
  competencesDuProgramme,
  connaissancesDuProgramme,
  learnerName,
  semainesDeLEtudiant,
  useSupervision,
} from "@/features/supervision/useSupervision";
import {
  ProgressionDot,
  ProgressionLegend,
  libelleEtat,
} from "@/features/supervision/ProgressionDot";
import { useDataAccess, useSession } from "@/application/session";
import type { StageLogId } from "@/domain/stageLog";
import type { MasteryLevel } from "@/domain/types";

/**
 * BILAN DE FIN DE STAGE (10/09), complété le 11/09.
 *
 * ⚠️ AUCUNE TABLE `placement_reports` N'EXISTE, et on n'en cree pas une. La
 * decision finale est une VALIDATION DE PERIODE couvrant tout le stage :
 * `stage_log_validations` porte deja `covers_from` / `covers_to`, une decision
 * et un commentaire, et valider du premier au dernier jour EST valider le
 * stage. Ajouter une seconde table de decision aurait cree deux verites sur la
 * meme question.
 *
 * CE QUE LE 11/09 AJOUTE (demande de Stef) : le bilan reunit desormais les
 * QUATRE faces du stage sur une seule page -- presence, competences,
 * connaissances, interactions -- au lieu de quatre chiffres sans relief. On ne
 * peut pas clore un stage en sachant seulement combien de jours ont ete
 * declares.
 *
 * ⚠️ LES JOURS ATTENDUS TIENNENT ENFIN COMPTE DE L'ALTERNANCE. Le commentaire
 * du 10/09 disait : « alternance semaine on / semaine off non deduite : elle
 * n'est modelisee nulle part ». Elle l'est depuis la migration
 * `20260910230000` et `semainesDeLEtudiant` la rend. Compter les semaines de
 * travail personnel comme des jours attendus faisait apparaitre un absenteisme
 * qui n'existait pas : sur un stage de onze semaines en alternance, le taux
 * affiche etait mecaniquement divise par deux. QUAND AUCUNE SEMAINE N'EST
 * POSEE, on retombe sur les jours ouvres bruts ET ON LE DIT -- un chiffre dont
 * on ignore la base doit s'annoncer comme tel.
 *
 * IL NE JUGE TOUJOURS PAS L'IMPLICATION. Les chiffres decrivent une activite
 * declaree ; l'analyse des commentaires est un chantier a part, et un chiffre
 * presente comme un jugement serait pire qu'un chiffre brut.
 */

/** Les jours ouvres d'une periode, sans rien savoir de l'alternance. */
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

/** Le lundi de la semaine qui contient ce jour, au format « YYYY-MM-DD ». */
function lundiDe(jour: Date): string {
  const d = new Date(jour);
  const decalage = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Les jours ou l'etudiant etait ATTENDU DANS LE SERVICE : les jours ouvres des
 * seules semaines « on ». Une semaine non renseignee compte comme attendue --
 * l'absence d'information n'est pas une dispense.
 */
function joursAttendus(
  debut: string,
  fin: string,
  semaines: ReadonlyMap<string, "on" | "off"> | undefined,
): number {
  if (!semaines) return joursOuvres(debut, fin);
  let n = 0;
  const d = new Date(debut);
  const f = new Date(fin);
  while (d <= f) {
    const jour = d.getDay();
    if (jour !== 0 && jour !== 6 && semaines.get(lundiDe(d)) !== "off") n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

function pourcent(fait: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((fait / total) * 100));
}

/** Un bloc chiffré du bilan : un titre, une phrase, une barre. */
function Face({
  titre,
  principal,
  detail,
  valeur,
  children,
}: {
  titre: string;
  principal: string;
  detail?: string;
  valeur: number;
  children?: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{titre}</h4>
      <p className="text-sm">
        {principal}
        {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
      </p>
      <Progress value={valeur} className="h-1.5" />
      {children}
    </section>
  );
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
  const connaissances = connaissancesDuProgramme(scope);

  const bilans = scope.logsToValidate
    .filter((log) => log.periodStartsOn && log.periodEndsOn)
    .map((log) => {
      const debut = log.periodStartsOn!.slice(0, 10);
      const fin = log.periodEndsOn!.slice(0, 10);
      const declarees = scope.declarations.get(log.enrollmentId) ?? [];
      const parAcquis = new Map(declarees.map((d) => [d.outcomeId as string, d] as const));

      const etatsCompetences = competences.map((o) => {
        const d = parAcquis.get(o.id as string);
        return {
          id: o.id as string,
          code: o.code,
          label: o.label,
          niveau: d?.declaredLevel as MasteryLevel | undefined,
          confirme: d?.validatedAt !== undefined,
        };
      });
      const competencesDeclarees = etatsCompetences.filter((e) => e.niveau !== undefined).length;
      const competencesConfirmees = etatsCompetences.filter((e) => e.confirme).length;
      const connaissancesDeclarees = connaissances.filter(
        (o) => parAcquis.get(o.id as string) !== undefined,
      ).length;

      const semaines = semainesDeLEtudiant(scope, log.enrollmentId);
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
        attendus: joursAttendus(debut, fin, semaines),
        alternanceConnue: semaines !== undefined,
        etatsCompetences,
        competencesDeclarees,
        competencesConfirmees,
        connaissancesDeclarees,
        notes: (notes?.get(log.enrollmentId) ?? []).length,
        decisions: log.validations.length,
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
        description="Présence, compétences, connaissances et échanges — puis la décision qui clôt le stage."
      />

      <ScopeNotice>
        Les chiffres ci-dessous décrivent une activité déclarée, pas un jugement. La décision finale
        reste la vôtre.
      </ScopeNotice>

      <PanelCard
        title="Lecture des pastilles"
        description="Une pastille par compétence : la couleur dit le niveau déclaré, l'anneau votre confirmation."
      >
        <ProgressionLegend />
      </PanelCard>

      {bilans.length === 0 ? (
        <PanelCard title="Aucun bilan" description="Aucun carnet ouvert sur votre périmètre.">
          <p className="text-muted-foreground text-sm">
            Un bilan apparaît dès qu'un carnet de stage est ouvert pour un étudiant que vous
            encadrez.
          </p>
        </PanelCard>
      ) : (
        bilans.map((b) => (
          <PanelCard
            key={b.log.id}
            title={b.nom}
            description={`Stage du ${new Date(b.debut).toLocaleDateString("fr-FR")} au ${new Date(
              b.fin,
            ).toLocaleDateString("fr-FR")}`}
            action={
              b.cloture ? (
                <Badge variant={b.cloture.decision === "validated" ? "secondary" : "outline"}>
                  {b.cloture.decision === "validated" ? "stage validé" : "correction demandée"}
                </Badge>
              ) : (
                <Badge variant="outline" className="font-normal">
                  non clos
                </Badge>
              )
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Face
                titre="Présence en stage"
                principal={`${b.jours} journée${b.jours > 1 ? "s" : ""} déclarée${
                  b.jours > 1 ? "s" : ""
                } sur ${b.attendus} attendue${b.attendus > 1 ? "s" : ""}`}
                detail={
                  b.alternanceConnue
                    ? "semaines de travail personnel déduites"
                    : "aucune alternance renseignée : jours ouvrés bruts"
                }
                valeur={pourcent(b.jours, b.attendus)}
              />

              <Face
                titre="Connaissances"
                principal={`${b.connaissancesDeclarees} travaillée${
                  b.connaissancesDeclarees > 1 ? "s" : ""
                } sur ${connaissances.length}`}
                detail="déclaratif, sans confirmation"
                valeur={pourcent(b.connaissancesDeclarees, connaissances.length)}
              />

              <Face
                titre="Compétences"
                principal={`${b.competencesConfirmees} confirmée${
                  b.competencesConfirmees > 1 ? "s" : ""
                } sur ${competences.length}`}
                detail={`${b.competencesDeclarees} déclarée${
                  b.competencesDeclarees > 1 ? "s" : ""
                } par l'étudiant`}
                valeur={pourcent(b.competencesConfirmees, competences.length)}
              >
                {b.etatsCompetences.length > 0 ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {b.etatsCompetences.map((e) => (
                      <ProgressionDot
                        key={e.id}
                        etat={{ niveau: e.niveau, confirme: e.confirme }}
                        titre={libelleEtat(
                          { niveau: e.niveau, confirme: e.confirme },
                          b.nom,
                          `${e.code} ${e.label}`,
                        )}
                      />
                    ))}
                  </div>
                ) : null}
              </Face>

              <Face
                titre="Interactions"
                principal={`${b.echanges} échange${b.echanges > 1 ? "s" : ""} ouvert${
                  b.echanges > 1 ? "s" : ""
                }`}
                detail={`${b.notes} note${b.notes > 1 ? "s" : ""} d'expérience · ${
                  b.decisions
                } décision${b.decisions > 1 ? "s" : ""} de carnet`}
                valeur={pourcent(Math.min(b.echanges + b.notes, 10), 10)}
              />
            </div>

            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => {
                setMotif("");
                setOuvert(ouvert === b.log.id ? null : b.log.id);
              }}
            >
              {ouvert === b.log.id ? "Fermer" : "Clore le stage"}
            </Button>

            {ouvert === b.log.id ? (
              <div className="mt-1 space-y-3 rounded-xl border p-4">
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
          </PanelCard>
        ))
      )}
    </div>
  );
}
