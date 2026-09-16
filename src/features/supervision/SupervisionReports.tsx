import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";

import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import {
  competencesDuProgramme,
  connaissancesDuProgramme,
  learnerName,
  parTheme,
  semainesDeLEtudiant,
  useSupervision,
} from "@/features/supervision/useSupervision";
import { ProgressionLegend, type EtatAcquis } from "@/features/supervision/ProgressionDot";
import { BarreDeGroupe, repartitionDuGroupe } from "@/features/supervision/BarreDeGroupe";
import { PasseportEtudiant } from "@/features/supervision/PasseportEtudiant";
import { EcosDeclares } from "@/features/supervision/EcosDeclares";
import { StageTraceReview } from "@/features/supervision/StageTraceReview";
import { useDataAccess, useSession } from "@/application/session";
import type { StageLogId } from "@/domain/stageLog";
import type { EnrollmentId, OutcomeId } from "@/domain/types";

/**
 * BILAN DE STAGE (10/09), refondu le 11/09 pour tenir à vingt étudiants.
 *
 * ⚠️ AUCUNE TABLE `placement_reports` N'EXISTE, et on n'en crée pas une. La
 * décision finale est une VALIDATION DE PERIODE couvrant tout le stage :
 * `stage_log_validations` porte déjà `covers_from` / `covers_to`, une décision
 * et un commentaire, et valider du premier au dernier jour EST valider le
 * stage.
 *
 * CE QUE LE 11/09 CHANGE, ET POURQUOI. La version précédente dépliait une
 * grande carte par étudiant. Avec un étudiant c'était lisible ; avec vingt, la
 * page devenait un couloir. Désormais : une LIGNE par étudiant, triée par
 * retard, et on OUVRE celui dont on veut décider. Le détail complet — les
 * quatre faces et le passeport, chapitre par chapitre — ne se monte que pour
 * l'étudiant ouvert.
 *
 * ⚠️ « VALIDER LE STAGE », ET NON « CLORE ». Demande de Stef : clore décrit ce
 * que fait le logiciel, valider décrit ce que fait le responsable. Le second
 * engage quelqu'un, le premier range un dossier.
 *
 * ⚠️ LE PRONONCE EST RESERVE AU RESPONSABLE DE STAGE ET AUX ADMINISTRATEURS
 * (décision de Stef, 11/09). Un encadrant lit le bilan, confirme les
 * compétences, valide les semaines — mais ne prononce pas le stage. LA BASE NE
 * L'IMPOSE PAS ENCORE : `validate_stage_log_block` accepte l'encadrant, ce qui
 * est juste pour UNE SEMAINE. La restriction du prononcé sur la période entière
 * reste à poser côté serveur.
 *
 * LES JOURS ATTENDUS TIENNENT COMPTE DE L'ALTERNANCE depuis le 11/09 :
 * `semainesDeLEtudiant` rend les semaines « on ». Sans cela, un stage de onze
 * semaines en alternance affichait un absentéisme qui n'existait pas.
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

function lundiDe(jour: Date): string {
  const d = new Date(jour);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Les jours où l'étudiant était ATTENDU DANS LE SERVICE. Une semaine non
 * renseignée compte comme attendue : l'absence d'information n'est pas une
 * dispense.
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

function Face({
  titre,
  principal,
  detail,
  valeur,
}: {
  titre: string;
  principal: string;
  detail?: string;
  valeur: number;
}) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{titre}</h4>
      <p className="text-sm">
        {principal}
        {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
      </p>
      <Progress value={valeur} className="h-1.5" />
    </section>
  );
}

export function SupervisionReports() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { activeProgram, canValidatePlacement } = useSession();
  const { data: scope, isPending } = useSupervision();
  const [ouvert, setOuvert] = useState<StageLogId | null>(null);
  const [motif, setMotif] = useState("");

  /* Décision groupée : la sélection, le geste choisi, et le texte qui
     l'accompagne. Rien ne part tant que le geste n'est pas confirmé. */
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [modeLot, setModeLot] = useState<"valider" | "attente" | "refus" | "message" | null>(null);
  const [texteLot, setTexteLot] = useState("");

  const enrollmentIds = scope?.enrollmentIds ?? [];

  /*
   * LES MODALITES DU PROGRAMME, pas celles d'une promotion de l'encadrant :
   * il n'est inscrit nulle part. C'est elles qui disent de quoi la trace du
   * stage est faite (« Journal de stage », 16/09).
   */
  const { data: modalitesDuProgramme } = useQuery({
    queryKey: ["modalites-du-programme", activeProgram.id],
    queryFn: () => data.assessments.listAssessmentModalities(activeProgram.id),
  });

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

  const decider = useMutation({
    mutationFn: (input: {
      stageLogId: StageLogId;
      coversFrom: string;
      coversTo: string;
      decision: "validated" | "needs_revision" | "not_validated";
      comment: string;
    }) => data.stageLogs.validateStageLogBlock(input),
    onSuccess: (_r, input) => {
      toast.success(
        input.decision === "validated"
          ? "Stage validé."
          : input.decision === "not_validated"
            ? "Stage non validé."
            : "Correction demandée à l'étudiant.",
      );
      setMotif("");
      void queryClient.invalidateQueries({ queryKey: ["supervision"] });
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Décision non enregistrée."),
  });

  /**
   * LA DECISION GROUPEE — demandée par Stef le 11/09 : « validation de
   * l'ensemble du parcours de façon sélective ou groupée pour toute la
   * promotion ».
   *
   * ⚠️ UN APPEL PAR ETUDIANT, EN SERIE, ET C'EST VOULU. Chaque carnet porte
   * SA période : il n'existe pas de « valider la promotion » en base, et il ne
   * doit pas en exister un ici — une décision groupée qui prononcerait une
   * période commune vaudrait pour des stages qui n'ont pas les mêmes dates.
   * En série plutôt qu'en parallèle : vingt écritures simultanées sur la même
   * table ne gagneraient rien et brouilleraient l'ordre des journaux.
   *
   * ⚠️ UN ECHEC N'ARRETE PAS LES AUTRES, mais il est rapporté. Le lot rend le
   * nombre traité, le nombre d'échecs et le PREMIER motif d'échec : « 3 en
   * échec » sans la raison ne se répare pas.
   */
  const lot = useMutation({
    mutationFn: async (input: {
      readonly mode: "valider" | "attente" | "refus" | "message";
      readonly texte: string;
      readonly cibles: readonly {
        readonly stageLogId: StageLogId;
        readonly enrollmentId: EnrollmentId;
        readonly debut: string;
        readonly fin: string;
      }[];
    }) => {
      let echecs = 0;
      let premierMotif: string | null = null;
      for (const cible of input.cibles) {
        try {
          if (input.mode === "message") {
            await data.discussions.postMessage({
              enrollmentId: cible.enrollmentId,
              body: input.texte,
            });
          } else {
            await data.stageLogs.validateStageLogBlock({
              stageLogId: cible.stageLogId,
              coversFrom: cible.debut,
              coversTo: cible.fin,
              decision:
                input.mode === "valider"
                  ? "validated"
                  : input.mode === "refus"
                    ? "not_validated"
                    : "needs_revision",
              comment: input.texte,
            });
          }
        } catch (raison) {
          echecs += 1;
          premierMotif ??= raison instanceof Error ? raison.message : "raison inconnue";
        }
      }
      return { total: input.cibles.length, echecs, premierMotif };
    },
    onSuccess: (resultat, input) => {
      const faits = resultat.total - resultat.echecs;
      const verbe =
        input.mode === "valider"
          ? "stage(s) validé(s)"
          : input.mode === "attente"
            ? "carnet(s) mis en attente"
            : input.mode === "refus"
              ? "stage(s) non validé(s)"
              : "message(s) envoyé(s)";
      if (resultat.echecs === 0) toast.success(`${faits} ${verbe}.`);
      else toast.error(`${faits} ${verbe}, ${resultat.echecs} en échec : ${resultat.premierMotif}`);
      setSelection(new Set());
      setModeLot(null);
      setTexteLot("");
      void queryClient.invalidateQueries({ queryKey: ["supervision"] });
      void queryClient.invalidateQueries({ queryKey: ["discussion-threads"] });
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Décision groupée impossible."),
  });

  const confirmer = useMutation({
    mutationFn: (input: { enrollmentId: EnrollmentId; outcomeId: OutcomeId; retirer: boolean }) =>
      input.retirer
        ? data.passport.revokeOutcomeValidation({
            enrollmentId: input.enrollmentId,
            outcomeId: input.outcomeId,
          })
        : data.passport.validateOutcomeDeclaration({
            enrollmentId: input.enrollmentId,
            outcomeId: input.outcomeId,
          }),
    onSuccess: (_r, input) => {
      toast.success(input.retirer ? "Confirmation retirée." : "Compétence confirmée.");
      void queryClient.invalidateQueries({ queryKey: ["supervision"] });
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Enregistrement impossible."),
  });

  if (isPending || !scope) return <Skeleton className="h-72 w-full" />;

  const competences = competencesDuProgramme(scope);
  const connaissances = connaissancesDuProgramme(scope);
  const groupesCompetences = parTheme(scope, competences).map((c) => ({
    id: c.id,
    label: c.label,
    acquis: c.acquis.map((o) => ({ id: o.id as string, code: o.code, label: o.label })),
  }));
  const groupesConnaissances = parTheme(scope, connaissances).map((c) => ({
    id: c.id,
    label: c.label,
    acquis: c.acquis.map((o) => ({ id: o.id as string, code: o.code, label: o.label })),
  }));

  const etatDe = (enrollmentId: string, outcomeId: string): EtatAcquis => {
    const d = (scope.declarations.get(enrollmentId) ?? []).find(
      (x) => (x.outcomeId as string) === outcomeId,
    );
    if (!d) return { confirme: false };
    return { niveau: d.declaredLevel, confirme: d.validatedAt !== undefined };
  };

  const bilans = scope.logsToValidate
    .filter((log) => log.periodStartsOn && log.periodEndsOn)
    .map((log) => {
      const debut = log.periodStartsOn!.slice(0, 10);
      const fin = log.periodEndsOn!.slice(0, 10);
      const etat = (id: string) => etatDe(log.enrollmentId, id);
      const competencesConfirmees = competences.filter((o) => etat(o.id as string).confirme).length;
      const competencesDeclarees = competences.filter(
        (o) => etat(o.id as string).niveau !== undefined,
      ).length;
      const connaissancesDeclarees = connaissances.filter(
        (o) => etat(o.id as string).niveau !== undefined,
      ).length;
      const semaines = semainesDeLEtudiant(scope, log.enrollmentId);
      const attendus = joursAttendus(debut, fin, semaines);
      return {
        log,
        etat,
        nom: learnerName(scope, log.enrollmentId),
        debut,
        fin,
        jours: log.entries.length,
        attendus,
        alternanceConnue: semaines !== undefined,
        competencesConfirmees,
        competencesDeclarees,
        connaissancesDeclarees,
        notes: (notes?.get(log.enrollmentId) ?? []).length,
        decisions: log.validations.length,
        echanges: (fils ?? []).filter((f) => f.enrollmentId === log.enrollmentId).length,
        cloture: log.validations.find(
          (v) => v.coversFrom.slice(0, 10) === debut && v.coversTo.slice(0, 10) === fin,
        ),
      };
    })
    /* Les moins avancés d'abord : c'est sur eux que la décision se discute. */
    .sort(
      (a, b) =>
        pourcent(a.competencesConfirmees, competences.length) -
          pourcent(b.competencesConfirmees, competences.length) || a.nom.localeCompare(b.nom, "fr"),
    );

  const choisi = bilans.find((b) => b.log.id === ouvert);

  /** Les lignes cochées, réduites à ce que les écritures demandent. */
  const cibles = bilans
    .filter((b) => selection.has(b.log.id as string))
    .map((b) => ({
      stageLogId: b.log.id,
      enrollmentId: b.log.enrollmentId as EnrollmentId,
      debut: b.debut,
      fin: b.fin,
    }));
  const nomsSelection = bilans.filter((b) => selection.has(b.log.id as string)).map((b) => b.nom);

  const basculer = (id: string) =>
    setSelection((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  /**
   * LES CINQ ETATS D'UNE LIGNE (Stef, 11/09 : « au bout de la ligne de chaque
   * étudiant tu mets juste le statut »).
   *
   *   Programme en cours — le stage court encore, il n'y a rien à prononcer ;
   *   À valider          — la période est finie et personne n'a décidé ;
   *   Validé / En attente / Non validé — les trois décisions de la base.
   *
   * ⚠️ « À VALIDER » N'EST PAS UNE DECISION, c'est une absence de décision sur
   * une période close. Le distinguer de « Programme en cours » est tout
   * l'intérêt : les deux sont « rien d'écrit », mais un seul appelle un geste.
   */
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const statut = (b: (typeof bilans)[number]) => {
    if (b.cloture) {
      if (b.cloture.decision === "validated") return <Badge variant="secondary">Validé</Badge>;
      if (b.cloture.decision === "not_validated")
        return <Badge variant="destructive">Non validé</Badge>;
      return (
        <Badge variant="outline" className="font-normal">
          En attente
        </Badge>
      );
    }
    return b.fin >= aujourdhui ? (
      <Badge variant="outline" className="font-normal">
        Programme en cours
      </Badge>
    ) : (
      <Badge variant="outline">À valider</Badge>
    );
  };

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Bilans de stage"
        level={1}
        description="Présence, compétences, connaissances et échanges — puis la validation du stage."
      />

      <ScopeNotice>
        Les chiffres décrivent une activité déclarée, pas un jugement.{" "}
        {canValidatePlacement
          ? "La validation du stage vous revient."
          : "La validation du stage revient au responsable de stage."}
      </ScopeNotice>

      {choisi ? (
        <>
          <Button size="sm" variant="ghost" onClick={() => setOuvert(null)}>
            <ChevronLeft className="size-4" aria-hidden /> Tous les étudiants
          </Button>

          <PanelCard
            title={choisi.nom}
            description={`Stage du ${new Date(choisi.debut).toLocaleDateString("fr-FR")} au ${new Date(choisi.fin).toLocaleDateString("fr-FR")}`}
            action={statut(choisi)}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Face
                titre="Présence en stage"
                principal={`${choisi.jours} journée${choisi.jours > 1 ? "s" : ""} déclarée${choisi.jours > 1 ? "s" : ""} sur ${choisi.attendus} attendue${choisi.attendus > 1 ? "s" : ""}`}
                detail={
                  choisi.alternanceConnue
                    ? "semaines de travail personnel déduites"
                    : "aucune alternance renseignée : jours ouvrés bruts"
                }
                valeur={pourcent(choisi.jours, choisi.attendus)}
              />
              <Face
                titre="Connaissances"
                principal={`${choisi.connaissancesDeclarees} travaillée${choisi.connaissancesDeclarees > 1 ? "s" : ""} sur ${connaissances.length}`}
                detail="déclaratif, sans confirmation"
                valeur={pourcent(choisi.connaissancesDeclarees, connaissances.length)}
              />
              <Face
                titre="Compétences"
                principal={`${choisi.competencesConfirmees} confirmée${choisi.competencesConfirmees > 1 ? "s" : ""} sur ${competences.length}`}
                detail={`${choisi.competencesDeclarees} déclarée${choisi.competencesDeclarees > 1 ? "s" : ""} par l'étudiant`}
                valeur={pourcent(choisi.competencesConfirmees, competences.length)}
              />
              <Face
                titre="Interactions"
                principal={`${choisi.echanges} échange${choisi.echanges > 1 ? "s" : ""} ouvert${choisi.echanges > 1 ? "s" : ""}`}
                detail={`${choisi.notes} note${choisi.notes > 1 ? "s" : ""} d'expérience · ${choisi.decisions} décision${choisi.decisions > 1 ? "s" : ""} de carnet`}
                valeur={pourcent(Math.min(choisi.echanges + choisi.notes, 10), 10)}
              />
            </div>
          </PanelCard>

          <PanelCard
            title="Son passeport — compétences"
            description="Dépliez un chapitre pour voir ses compétences une à une. Cliquez une pastille pour confirmer ou retirer."
          >
            <ProgressionLegend />
            <PasseportEtudiant
              nom={choisi.nom}
              groupes={groupesCompetences}
              etat={choisi.etat}
              enCours={confirmer.isPending}
              onCase={(outcomeId, courant) =>
                confirmer.mutate({
                  enrollmentId: choisi.log.enrollmentId,
                  outcomeId: outcomeId as OutcomeId,
                  retirer: courant.confirme,
                })
              }
              vide="Ce programme ne définit aucune compétence."
            />
          </PanelCard>

          <PanelCard
            title="Son passeport — connaissances"
            description="En lecture seule : une connaissance ne se confirme pas."
          >
            <PasseportEtudiant
              nom={choisi.nom}
              groupes={groupesConnaissances}
              etat={choisi.etat}
              vide="Ce programme ne définit aucune connaissance."
            />
          </PanelCard>

          <PanelCard
            title="ECOS virtuel — passages déclarés"
            description="Stations ChatGPT jouées hors du hub ; la grille rapportée par l'étudiant, en lecture seule."
          >
            <EcosDeclares enrollmentId={choisi.log.enrollmentId} />
          </PanelCard>

          {/*
            LA TRACE DU STAGE (16/09) : le carnet déclaré et ce qui est tenu
            hors plateforme, AVANT le prononcé — c'est ce qu'il faut avoir sous
            les yeux pour décider.
          */}
          <PanelCard
            title="Trace du stage"
            description="Ce que le programme a retenu sous « Journal de stage » : le carnet déclaré par l'étudiant, et ce qui est attesté hors de la plateforme."
          >
            <StageTraceReview
              enrollmentId={choisi.log.enrollmentId}
              modalities={modalitesDuProgramme ?? []}
            />
          </PanelCard>

          <PanelCard
            title="Validation du stage"
            description={`Décision portant sur toute la période, du ${new Date(choisi.debut).toLocaleDateString("fr-FR")} au ${new Date(choisi.fin).toLocaleDateString("fr-FR")}.`}
          >
            {canValidatePlacement ? (
              <>
                <div className="space-y-2">
                  <label htmlFor="motif-bilan" className="block text-sm font-medium">
                    Appréciation — obligatoire pour demander une correction
                  </label>
                  <Textarea
                    id="motif-bilan"
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    placeholder="Ce que vous retenez du stage de cet étudiant."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={decider.isPending}
                    onClick={() =>
                      decider.mutate({
                        stageLogId: choisi.log.id,
                        coversFrom: choisi.debut,
                        coversTo: choisi.fin,
                        decision: "validated",
                        comment: motif.trim(),
                      })
                    }
                  >
                    Valider le stage
                  </Button>
                  <Button
                    variant="outline"
                    disabled={decider.isPending || motif.trim().length === 0}
                    onClick={() =>
                      decider.mutate({
                        stageLogId: choisi.log.id,
                        coversFrom: choisi.debut,
                        coversTo: choisi.fin,
                        decision: "needs_revision",
                        comment: motif.trim(),
                      })
                    }
                  >
                    Demander une correction
                  </Button>
                  <Button
                    variant="outline"
                    disabled={decider.isPending || motif.trim().length === 0}
                    onClick={() =>
                      decider.mutate({
                        stageLogId: choisi.log.id,
                        coversFrom: choisi.debut,
                        coversTo: choisi.fin,
                        decision: "not_validated",
                        comment: motif.trim(),
                      })
                    }
                  >
                    Stage non validé
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Le prononcé du stage revient au responsable de stage et à l'administration du
                programme. Vous pouvez confirmer les compétences et valider les semaines du carnet.
              </p>
            )}
          </PanelCard>
        </>
      ) : (
        <PanelCard
          title={`${bilans.length} étudiant${bilans.length > 1 ? "s" : ""} en stage`}
          description={
            canValidatePlacement
              ? "Les moins avancés d'abord. Cochez pour décider en lot, ou ouvrez un étudiant pour son passeport et sa décision."
              : "Les moins avancés d'abord. Ouvrez un étudiant pour son passeport."
          }
        >
          {bilans.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun carnet ouvert sur votre périmètre.
            </p>
          ) : (
            <div className="space-y-3">
              {/*
                LA BARRE D'ACTION NE PART JAMAIS AU PREMIER CLIC. Choisir le
                geste ouvre un volet qui NOMME les étudiants concernés et
                demande confirmation : une validation groupée est un prononcé,
                et vingt prononcés faits par erreur ne se défont pas d'un
                bouton « annuler ».
              */}
              {canValidatePlacement ? (
                <div className="border-border space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      ⚠️ UN BOUTON GRIS QUI NE DIT PAS POURQUOI PASSE POUR UN
                      BOUTON CASSE — constaté le 11/09 : « aucun des 3 boutons
                      ne fonctionne ». Ils attendaient une sélection, et rien ne
                      le disait. La phrase remplace le silence, et chaque ligne
                      porte désormais son propre bouton (colonne Stage).
                    */}
                    <span className="text-sm font-medium">
                      {selection.size === 0
                        ? "Cochez un ou plusieurs étudiants pour activer ces gestes"
                        : `${selection.size} étudiant(s) sélectionné(s)`}
                    </span>
                    <Button
                      size="sm"
                      disabled={selection.size === 0 || lot.isPending}
                      onClick={() => {
                        setModeLot("valider");
                        setTexteLot("");
                      }}
                    >
                      Valider le stage
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={selection.size === 0 || lot.isPending}
                      onClick={() => {
                        setModeLot("attente");
                        setTexteLot("");
                      }}
                    >
                      Mettre en attente
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={selection.size === 0 || lot.isPending}
                      onClick={() => {
                        setModeLot("refus");
                        setTexteLot("");
                      }}
                    >
                      Stage non validé
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={selection.size === 0 || lot.isPending}
                      onClick={() => {
                        setModeLot("message");
                        setTexteLot("");
                      }}
                    >
                      Envoyer un message
                    </Button>
                  </div>

                  {modeLot ? (
                    <div className="space-y-2">
                      <p className="text-muted-foreground text-xs">
                        {modeLot === "valider"
                          ? "Prononce le stage de"
                          : modeLot === "attente"
                            ? "Renvoie le carnet pour complément à"
                            : modeLot === "refus"
                              ? "Prononce la NON-validation du stage de"
                              : "Écrit dans le fil de discussion de"}{" "}
                        {nomsSelection.join(", ")}.
                        {modeLot === "attente"
                          ? " Le carnet repasse en « à compléter » : l'étudiant voit le motif et peut compléter."
                          : modeLot === "refus"
                            ? " Décision défavorable sur toute la période : elle se lit dans le passeport de l'étudiant."
                            : ""}
                      </p>
                      <Textarea
                        id="texte-lot"
                        rows={3}
                        value={texteLot}
                        onChange={(event) => setTexteLot(event.target.value)}
                        placeholder={
                          modeLot === "valider"
                            ? "Appréciation (facultative), la même pour tous les étudiants cochés."
                            : modeLot === "attente"
                              ? "Ce qu'il manque — obligatoire."
                              : modeLot === "refus"
                                ? "Le motif de la non-validation — obligatoire."
                                : "Votre message — obligatoire."
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={
                            lot.isPending || (modeLot !== "valider" && texteLot.trim().length === 0)
                          }
                          onClick={() =>
                            lot.mutate({ mode: modeLot, texte: texteLot.trim(), cibles })
                          }
                        >
                          Confirmer pour {selection.size} étudiant(s)
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={lot.isPending}
                          onClick={() => {
                            setModeLot(null);
                            setTexteLot("");
                          }}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-border border-b text-start text-[11px]">
                      {canValidatePlacement ? (
                        <th scope="col" className="py-1.5 pe-2 text-start font-medium">
                          <Checkbox
                            checked={selection.size === bilans.length && bilans.length > 0}
                            aria-label="Tout sélectionner"
                            onCheckedChange={(coche) =>
                              setSelection(
                                coche === true
                                  ? new Set(bilans.map((b) => b.log.id as string))
                                  : new Set(),
                              )
                            }
                          />
                        </th>
                      ) : null}
                      <th scope="col" className="py-1.5 text-start font-medium">
                        Étudiant
                      </th>
                      <th scope="col" className="py-1.5 text-start font-medium">
                        Présence
                      </th>
                      <th scope="col" className="py-1.5 text-start font-medium">
                        Compétences
                      </th>
                      <th scope="col" className="py-1.5 text-start font-medium">
                        Connaissances
                      </th>
                      <th scope="col" className="py-1.5 text-start font-medium">
                        Échanges
                      </th>
                      <th scope="col" className="py-1.5 text-end font-medium">
                        Stage
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bilans.map((b) => (
                      <tr key={b.log.id} className="border-border border-b">
                        {canValidatePlacement ? (
                          <td className="py-2 pe-2">
                            <Checkbox
                              checked={selection.has(b.log.id as string)}
                              aria-label={`Sélectionner ${b.nom}`}
                              onCheckedChange={() => basculer(b.log.id as string)}
                            />
                          </td>
                        ) : null}
                        <th scope="row" className="py-2 text-start font-normal">
                          <button
                            type="button"
                            className="hover:text-primary text-start font-medium underline-offset-2 hover:underline"
                            onClick={() => {
                              setMotif("");
                              setOuvert(b.log.id);
                            }}
                          >
                            {b.nom}
                          </button>
                        </th>
                        <td className="py-2 tabular-nums">
                          {b.jours}
                          <span className="text-muted-foreground">/{b.attendus}</span>
                        </td>
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            <BarreDeGroupe
                              largeur={72}
                              repartition={repartitionDuGroupe(
                                competences.map((o) => o.id as string),
                                (id) => b.etat(id).niveau,
                              )}
                              titre={`${b.nom} — ${b.competencesConfirmees} compétences confirmées sur ${competences.length}`}
                            />
                            <span className="text-muted-foreground text-[11px] tabular-nums">
                              {b.competencesConfirmees}/{competences.length}
                            </span>
                          </span>
                        </td>
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            <BarreDeGroupe
                              largeur={72}
                              repartition={repartitionDuGroupe(
                                connaissances.map((o) => o.id as string),
                                (id) => b.etat(id).niveau,
                              )}
                              titre={`${b.nom} — ${b.connaissancesDeclarees} connaissances travaillées sur ${connaissances.length}`}
                            />
                            <span className="text-muted-foreground text-[11px] tabular-nums">
                              {b.connaissancesDeclarees}/{connaissances.length}
                            </span>
                          </span>
                        </td>
                        <td className="text-muted-foreground py-2 tabular-nums">{b.echanges}</td>
                        <td className="py-2 text-end">{statut(b)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </PanelCard>
      )}
    </div>
  );
}
