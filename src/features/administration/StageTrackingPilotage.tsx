/**
 * DE QUOI LA TRACE DU STAGE EST FAITE — le bloc que l'atelier déplie sous la
 * ligne « Journal de stage ».
 *
 * Stef, 16/09 : « si la case Journal de stage est cochée, alors se déplient les
 * différentes modalités : suivi de stage dématérialisé, carnet dématérialisé
 * selon un modèle, carnet physique, attestation du responsable. Choix multiple
 * possible. »
 *
 * ⚠️ CE BLOC DÉCIDE POUR LE PROGRAMME, PAS POUR LA PROMOTION. Le DIU ne change
 * pas de nature d'une année sur l'autre : le réglage vit sur la modalité
 * (`assessment_modalities.stage_tracking`), pas sur le lien promotion↔modalité.
 * C'est la seule chose de cet atelier qui ne soit pas propre à la promotion —
 * et l'écran le dit en toutes lettres.
 *
 * Comme les stations d'ECOS, les cases sont une INTENTION : c'est
 * « Enregistrer les modifications », en bas du bloc, qui les porte en base.
 */
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  STAGE_TRACKING_HINTS_FR,
  STAGE_TRACKING_LABELS_FR,
  STAGE_TRACKING_MODES,
  type StageTrackingMode,
} from "@/domain/stageTracking";
import type { AssessmentModality } from "@/domain/assessmentModality";
import type { StageLogTemplate } from "@/domain/stageLog";

const SELECT_CLASS = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";

function memeChoix(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const g = [...a].sort();
  const d = [...b].sort();
  return g.every((x, i) => x === d[i]);
}

export function StageTrackingPilotage({
  modality,
  carnets,
  editable,
  modes,
  templateId,
  onChange,
}: {
  readonly modality: AssessmentModality;
  readonly carnets: readonly StageLogTemplate[];
  readonly editable: boolean;
  readonly modes: readonly StageTrackingMode[];
  readonly templateId: string | undefined;
  readonly onChange: (modes: readonly StageTrackingMode[], templateId: string | undefined) => void;
}) {
  const enBase = modality.stageTracking ?? [];
  const modifie =
    !memeChoix(modes, enBase) || (templateId ?? "") !== (modality.stageLogTemplateId ?? "");
  const carnetsServis = carnets.filter((c) => c.enabled || c.id === templateId);

  function basculer(mode: StageTrackingMode, voulu: boolean) {
    const suivants = STAGE_TRACKING_MODES.filter((m) => (m === mode ? voulu : modes.includes(m)));
    onChange(suivants, suivants.includes("logbook_digital") ? templateId : undefined);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">
          De quoi la trace est faite{" "}
          <span className="text-muted-foreground font-normal">
            — pour tout le programme, pas seulement cette promotion
          </span>
        </p>
        {modifie ? (
          <Badge variant="outline" className="text-muted-foreground font-normal">
            à enregistrer
          </Badge>
        ) : null}
      </div>

      <ul className="space-y-2">
        {STAGE_TRACKING_MODES.map((mode) => {
          const id = `trace-${modality.id}-${mode}`;
          return (
            <li key={mode} className="border-border flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={modes.includes(mode)}
                disabled={!editable}
                onCheckedChange={(v) => basculer(mode, v === true)}
              />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
                <span className="block text-sm font-medium">{STAGE_TRACKING_LABELS_FR[mode]}</span>
                <span className="text-muted-foreground block text-xs">
                  {STAGE_TRACKING_HINTS_FR[mode]}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {modes.includes("logbook_digital") ? (
        <div className="space-y-1">
          <Label htmlFor={`carnet-${modality.id}`} className="text-xs">
            Modèle de carnet servi
          </Label>
          {carnetsServis.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Aucun carnet configuré pour ce programme. Créez-en un dans « Carnets de stage », plus
              bas : nom, items et nombres attendus.
            </p>
          ) : (
            <select
              id={`carnet-${modality.id}`}
              className={`${SELECT_CLASS} w-full`}
              value={templateId ?? ""}
              disabled={!editable}
              onChange={(e) => onChange(modes, e.target.value || undefined)}
            >
              <option value="">— choisir un carnet —</option>
              {carnetsServis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · {c.objectives.length} item(s)
                </option>
              ))}
            </select>
          )}
        </div>
      ) : null}

      {modes.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Rien de coché : le module Stage décide seul, comme avant — si le programme a un stage,
          l'étudiant tient son suivi de présence.
        </p>
      ) : null}
      {modes.length > 0 &&
      !modes.some((m) => m === "presence_digital" || m === "logbook_digital") ? (
        <p className="text-muted-foreground text-xs">
          Aucune trace n'est tenue dans le hub : l'étudiant n'a rien à remplir, et c'est le
          responsable de stage qui atteste, au bilan.
        </p>
      ) : null}
    </div>
  );
}
