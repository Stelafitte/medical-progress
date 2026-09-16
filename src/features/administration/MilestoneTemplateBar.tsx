/**
 * Relever un rétroplanning en modèle, et reposer un modèle sur une promotion.
 *
 * POURQUOI UN FICHIER À PART. Le bloc « Jalons » fait déjà 600 lignes et porte
 * une saisie, un graphique manipulable et des suppressions à l'unité. Les
 * modèles ont leur propre cycle — lister, nommer, simuler, poser — et le
 * mélanger à la saisie aurait rendu les deux illisibles.
 *
 * LA SIMULATION N'EST PAS UNE POLITESSE. « Poser un modèle » peut ne rien
 * poser du tout (tous les chapitres sont déjà datés), n'en poser qu'une
 * partie (des chapitres du modèle n'existent pas ici), ou tout remplacer. Ces
 * trois issues ne se devinent pas depuis le nom du modèle. Le bouton
 * « Simuler » demande au SERVEUR ce qui se passerait — la même fonction, en
 * mode à blanc. On n'affiche donc jamais une prévision calculée ici : elle
 * finirait par diverger de ce que la base fait vraiment.
 *
 * Conséquence tenue partout dans ce composant : dès que le modèle, la
 * promotion ou le mode changent, le rapport affiché est JETÉ. Un rapport qui
 * survivrait à un changement de mode décrirait une opération que le bouton ne
 * ferait plus.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDataAccess } from "@/application/session";
import {
  MILESTONE_TEMPLATE_ISSUE_LABELS_FR,
  describeApplyReport,
  describeMilestoneTemplateWriteError,
  milestoneTemplateApplyIssues,
  milestoneTemplateSaveIssues,
  templateLastWeek,
  type MilestoneTemplate,
  type MilestoneTemplateApplyMode,
  type MilestoneTemplateApplyReport,
  type MilestoneTemplateId,
} from "@/domain/milestoneTemplate";
import type { CohortId, ProgramId } from "@/domain/types";

const MODE_LABELS: Record<MilestoneTemplateApplyMode, string> = {
  keep: "Compléter",
  replace: "Remplacer",
};

const MODE_HINTS: Record<MilestoneTemplateApplyMode, string> = {
  keep: "Les chapitres déjà datés dans cette promotion ne sont pas touchés.",
  replace:
    "Les jalons existants sont supprimés puis reposés. Refusé si un apprenant a déjà décalé l'un d'eux.",
};

export function MilestoneTemplateBar({
  programId,
  cohortId,
  cohortLabel,
  themeLabels,
  milestoneCount,
  promotionLastWeek,
  onApplied,
}: {
  programId: ProgramId;
  /** Vide tant qu'aucune promotion n'est choisie : tout est alors désactivé. */
  cohortId: string;
  cohortLabel?: string;
  themeLabels: readonly string[];
  /** Jalons actuellement posés sur cette promotion. */
  milestoneCount: number;
  promotionLastWeek?: number;
  onApplied: () => void;
}) {
  const dataAccess = useDataAccess();
  const [templates, setTemplates] = useState<readonly MilestoneTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const [templateId, setTemplateId] = useState<string>("");
  const [mode, setMode] = useState<MilestoneTemplateApplyMode>("keep");
  const [report, setReport] = useState<MilestoneTemplateApplyReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTemplates(await dataAccess.plan.listTemplates(programId));
    } catch (reason) {
      setTemplates([]);
      setError(describeMilestoneTemplateWriteError(reason));
    }
  }, [dataAccess, programId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = templates?.find((template) => template.id === templateId);

  const saveIssues = milestoneTemplateSaveIssues({
    label: name,
    milestoneCount,
    existingLabels: (templates ?? []).map((template) => template.label),
  });

  const applyIssues = selected
    ? milestoneTemplateApplyIssues({
        items: selected.items,
        themeLabels,
        ...(promotionLastWeek === undefined ? {} : { promotionLastWeek }),
      })
    : [];

  /** Tout changement de cible périme le rapport : il décrirait une autre opération. */
  function forget() {
    setReport(null);
    setDone(null);
    setError(null);
  }

  async function save() {
    setBusy(false);
    setSaving(true);
    forget();
    try {
      await dataAccess.plan.saveTemplate({ cohortId: cohortId as CohortId, label: name.trim() });
      setName("");
      await load();
      setDone(`Modèle enregistré : ${milestoneCount} jalon(s) relevés.`);
    } catch (reason) {
      setError(describeMilestoneTemplateWriteError(reason));
    } finally {
      setSaving(false);
    }
  }

  async function run(dryRun: boolean) {
    if (selected === undefined) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await dataAccess.plan.applyTemplate({
        templateId: selected.id,
        cohortId: cohortId as CohortId,
        mode,
        dryRun,
      });
      setReport(result);
      if (!dryRun) {
        setDone(describeApplyReport(result));
        setReport(null);
        onApplied();
      }
    } catch (reason) {
      setReport(null);
      setError(describeMilestoneTemplateWriteError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: MilestoneTemplateId) {
    setBusy(true);
    forget();
    try {
      await dataAccess.plan.deleteTemplate(id);
      setTemplateId("");
      await load();
    } catch (reason) {
      setError(describeMilestoneTemplateWriteError(reason));
    } finally {
      setBusy(false);
    }
  }

  const noCohort = cohortId === "";

  /*
   * POURQUOI le bouton « Relever le modèle » est éteint, dit à voix haute.
   *
   * Il l'était en silence tant que le nom n'était pas saisi : rien ne
   * distinguait « il vous manque un nom » de « ce geste est impossible ici ».
   * Stef, le 02/09, sur un bouton grisé sans motif — deux fois dans la même
   * journée, sur deux écrans différents. Un bouton désactivé sans raison
   * affichée est un cul-de-sac.
   */
  const saveBlockedReason = noCohort
    ? "Choisissez d'abord une promotion."
    : name.trim() === ""
      ? "Donnez un nom au modèle pour pouvoir le relever."
      : saveIssues.length > 0
        ? saveIssues.map((issue) => MILESTONE_TEMPLATE_ISSUE_LABELS_FR[issue]).join(" ")
        : "";

  return (
    <section
      className="border-border space-y-3 rounded-lg border p-4"
      aria-label="Modèles de rétroplanning"
    >
      <h4 className="text-sm font-medium">Modèles de rétroplanning</h4>

      {/* ---------------- relever ---------------- */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="template-name">Enregistrer ce rétroplanning comme modèle</Label>
          <Input
            id="template-name"
            className="min-h-11 sm:w-72"
            placeholder="DFASM cardio — 11 semaines"
            value={name}
            disabled={noCohort}
            onChange={(event) => {
              setName(event.target.value);
              forget();
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={noCohort || saving || name.trim() === "" || saveIssues.length > 0}
          onClick={() => void save()}
        >
          {saving ? "Enregistrement…" : "Relever le modèle"}
        </Button>
        {saveBlockedReason === "" ? null : (
          <p className="text-muted-foreground w-full text-xs">{saveBlockedReason}</p>
        )}
      </div>

      {/* ---------------- reposer ---------------- */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="template-pick">Partir d'un modèle</Label>
          <select
            id="template-pick"
            className="border-border bg-background min-h-11 rounded-md border px-2 text-sm sm:w-72"
            value={templateId}
            disabled={noCohort || (templates ?? []).length === 0}
            onChange={(event) => {
              setTemplateId(event.target.value);
              forget();
            }}
          >
            <option value="">Choisir un modèle…</option>
            {(templates ?? []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.label} ({template.items.length} jalons, jusqu'à la semaine{" "}
                {templateLastWeek(template.items) ?? "?"})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">Sur les jalons déjà posés</span>
          <div className="flex gap-2">
            {(["keep", "replace"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={mode === value ? "default" : "outline"}
                className="min-h-11"
                title={MODE_HINTS[value]}
                onClick={() => {
                  setMode(value);
                  forget();
                }}
              >
                {MODE_LABELS[value]}
              </Button>
            ))}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={noCohort || busy || selected === undefined || applyIssues.length > 0}
          onClick={() => void run(true)}
        >
          Simuler
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={noCohort || busy || selected === undefined || applyIssues.length > 0}
          onClick={() => void run(false)}
        >
          Poser sur {cohortLabel ?? "cette promotion"}
        </Button>
        {selected ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => void remove(selected.id)}
          >
            Supprimer ce modèle
          </Button>
        ) : null}
      </div>

      {applyIssues.length > 0 ? (
        <ul className="text-destructive space-y-1 text-xs">
          {applyIssues.map((issue) => (
            <li key={issue}>{MILESTONE_TEMPLATE_ISSUE_LABELS_FR[issue]}</li>
          ))}
        </ul>
      ) : null}

      {report ? (
        <p className="text-sm">
          <Badge variant="outline" className="me-2 font-normal">
            Simulation
          </Badge>
          {describeApplyReport(report, { dryRun: true })}
        </p>
      ) : null}

      {done ? <p className="text-sm">{done}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <p className="text-muted-foreground text-xs">
        Un modèle porte des chapitres et des semaines, jamais des acquis : la composition de chaque
        jalon se recalcule à l'arrivée depuis le chapitre du programme d'accueil. C'est ce qui lui
        permet de servir une autre promotion, une autre année, sans rien traîner de l'ancienne.
        {noCohort ? " Choisissez d'abord une promotion." : ""}
      </p>
    </section>
  );
}
