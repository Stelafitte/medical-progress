/**
 * LES DOSSIERS PROGRESSIFS D'UNE PROMOTION — le bloc que l'atelier déplie sous
 * une ligne « Cas cliniques progressifs », « Mini-dossier progressif » ou
 * « KFP ».
 *
 * Stef (16/09) : « quand je clique Cas cliniques progressifs, je devrais avoir
 * la liste des mini-DP ». La voici : la banque servie à cette promotion, puis
 * les dossiers qu'elle contient, un par ligne, avec leur item, leur nombre
 * d'étapes et l'état de leur relecture.
 *
 * CE QU'UN DOSSIER N'EST PAS. Une série de QCM. Ses étapes ne sortent JAMAIS
 * dans une série libre (`case_id is null` dans `pick_questions`, migration
 * 20260915220000) : un dossier se joue entier, dans l'ordre, sans retour. Il
 * n'y a donc ni filtre ni fenêtre programmée ici — seulement le choix de la
 * banque et ce qu'elle porte.
 *
 * ⚠️ « VALIDÉ » DIT LA RELECTURE HUMAINE, PAS LA PUBLICATION. Les 21 dossiers
 * du premier lot sont produits par IA : le drapeau vient du fichier et ne
 * change rien à ce que l'étudiant voit. Il est affiché pour que l'équipe sache
 * ce qu'il lui reste à relire.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess } from "@/application/session";
import { CASE_KIND_LABELS_FR } from "@/domain/questionCaseImport";
import type { CohortAssessmentLink } from "@/domain/assessmentModality";
import type { Cohort, ProgramId } from "@/domain/types";
import type { QuestionBankRow } from "@/application/ports/repositories";
import { DossiersResultats } from "@/features/administration/DossiersResultats";
import { SelectionEnregistrable } from "@/features/administration/SelectionEnregistrable";

const SELECT_CLASS = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";

export function DossiersPilotage({
  programId,
  cohort,
  cle,
  link,
  banques,
  editable,
  selection,
  onSelection,
  onChanged,
}: {
  readonly programId: ProgramId;
  readonly cohort: Cohort;
  /** Préfixe stable des champs : survit à la création de la modalité. */
  readonly cle: string;
  /** Absent tant que la modalité n'est pas rattachée à la promotion. */
  readonly link: CohortAssessmentLink | undefined;
  readonly banques: readonly QuestionBankRow[];
  readonly editable: boolean;
  /** L'intention en cours, calculée depuis la liste complète du lot. */
  readonly selection: (tous: readonly string[]) => readonly string[];
  readonly onSelection: (ids: readonly string[]) => void;
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * LA BANQUE AVANT L'ENREGISTREMENT (Stef, 17/09). Tant que le rattachement
   * n'existe pas, il n'y a rien à écrire : le choix vit ici, le temps que
   * « Enregistrer » crée le lien. Une fois le lien là, ce réglage-ci
   * s'enregistre AUSSITÔT — c'est un réglage unique, et un interrupteur qui
   * attend un bouton plus bas trompe.
   */
  const [sourceVoulue, setSourceVoulue] = useState<string>("");

  /* Une banque de QCM n'a pas sa place ici : on ne garde que celles qui portent des dossiers. */
  const banquesDeDossiers = banques.filter((b) => (b.cases ?? 0) > 0);
  const source = link?.questionSource ?? sourceVoulue;

  const dossiers = useQuery({
    queryKey: ["dossiers-de-la-banque", programId, source],
    enabled: source !== "",
    queryFn: () => dataAccess.assessments.listQuestionCases(programId, source),
  });

  async function regler(patch: { readonly isOpen?: boolean; readonly questionSource?: string }) {
    if (!link) {
      /* Rien à écrire encore : on retient le lot voulu, l'enregistrement fera le reste. */
      if (patch.questionSource !== undefined) setSourceVoulue(patch.questionSource);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await dataAccess.assessments.setCohortAssessmentPilotage({
        cohortId: cohort.id,
        assessmentModalityId: link.modalityId,
        isOpen: patch.isOpen ?? link.isOpen,
        questionSource: patch.questionSource ?? link.questionSource ?? "",
        freeAccess: link.freeAccess,
      });
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Réglage impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium">
        Pilotage <span className="text-muted-foreground font-normal">— pour cette promotion</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Switch
          id={`dossiers-open-${cle}`}
          checked={link?.isOpen ?? true}
          disabled={!editable || busy || !link}
          onCheckedChange={(v) => void regler({ isOpen: v })}
        />
        <Label htmlFor={`dossiers-open-${cle}`} className="text-sm font-normal">
          {(link?.isOpen ?? true) ? "Ouvert" : "Fermé"}
          <span className="text-muted-foreground">
            {" "}
            —{" "}
            {link
              ? link.isOpen
                ? "l'étudiant peut lancer un dossier"
                : "l'étudiant voit la modalité mais ne lance rien"
              : "réglable dès que la modalité sera enregistrée"}
          </span>
        </Label>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`dossiers-source-${cle}`} className="text-xs">
          Banque de dossiers servie
        </Label>
        {banquesDeDossiers.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Aucun lot de dossiers importé pour ce programme. Déposez-en un dans le panneau « Banque
            de questions », plus bas : c'est le fichier qui dit ce qu'il est.
          </p>
        ) : (
          <select
            id={`dossiers-source-${cle}`}
            className={`${SELECT_CLASS} w-full`}
            value={source}
            disabled={!editable || busy}
            onChange={(e) => void regler({ questionSource: e.target.value })}
          >
            <option value="">— choisir un lot —</option>
            {banquesDeDossiers.map((b) => (
              <option key={b.source} value={b.source}>
                {b.source} · {b.cases} dossier(s)
                {b.fileName ? ` · ${b.fileName}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {source !== "" ? (
        <div className="space-y-2">
          {dossiers.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {dossiers.isError ? (
            <p className="text-destructive text-xs">
              {dossiers.error instanceof Error ? dossiers.error.message : "Lecture impossible."}
            </p>
          ) : null}
          {dossiers.data ? (
            <SelectionEnregistrable
              titre="Les dossiers servis"
              precision="joués entiers, dans l'ordre, sans retour"
              cle={`dossier-${cle}`}
              editable={editable && !busy}
              selection={selection(dossiers.data.map((d) => d.id))}
              enBase={link?.servedCaseIds}
              toutSiAbsente
              onSelection={onSelection}
              vide="Ce lot ne porte aucun dossier publié."
              elements={dossiers.data.map((d) => ({
                id: d.id,
                label: d.itemCode ? `${d.title} · ${d.itemCode}` : d.title,
                ...(d.chapterTitle ? { detail: d.chapterTitle } : {}),
                aDroite: (
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-normal">
                      {CASE_KIND_LABELS_FR[d.kind]}
                    </Badge>
                    <Badge variant="secondary" className="font-normal">
                      {d.steps} étape(s)
                    </Badge>
                    <Badge
                      variant="outline"
                      className={d.validated ? "font-normal" : "text-muted-foreground font-normal"}
                    >
                      {d.validated ? "relu" : "à relire"}
                    </Badge>
                  </span>
                ),
              }))}
            />
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      {/*
        LES RÉSULTATS SOUS LE PILOTAGE, comme pour le QCM : tout ce qui concerne
        les dossiers de cette promotion est au même endroit. Ils sont vides tant
        que personne n'a joué — et ils le disent, plutôt que d'afficher des zéros
        qu'on prendrait pour des scores.
      */}
      <DossiersResultats cohort={cohort} />
    </div>
  );
}
