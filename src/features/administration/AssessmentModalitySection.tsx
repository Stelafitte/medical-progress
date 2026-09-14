/**
 * L'ATELIER DES ÉVALUATIONS D'UN PROGRAMME — bloc unique, deux modes.
 *
 * Le même composant sert trois écrans :
 *   - l'onglet « Évaluations » : `editable`, part en lecture, bascule en
 *     construction ;
 *   - le Concepteur de programme, étape « Évaluations du programme » :
 *     `editable`, part directement en construction ;
 *   - le pilotage : lecture seule, filtré sur la promotion pilotée.
 *
 * TROIS COUCHES SUR UN ÉCRAN (Stef, 14/09 soir) :
 *   1. le catalogue — tout ce qui est possible (`assessmentCatalogue.ts`) ;
 *   2. les modalités du programme — ce qui est retenu et configuré
 *      (`assessment_modalities`) ;
 *   3. les épreuves datées — une modalité × une promotion × une date
 *      (`assessment_sessions`).
 *
 * LECTURE montre 2 et 3 : ce que l'étudiant rencontrera, et quand, pour qui.
 * CONSTRUCTION montre 1, 2 et 3 : tout le catalogue, présent ou pas ; cocher
 * crée, décocher sort du parcours ; une ligne présente se déplie pour être
 * configurée, datée par promotion, ou retirée.
 *
 * Les promotions sont EN TÊTE, avec leur nombre d'épreuves datées : c'est la
 * question que Stef posait à chaque écran — de quelle promotion parle-t-on ?
 */
import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Pencil, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { useDataAccess } from "@/application/session";
import {
  ASSESSMENT_MODE_LABELS_FR,
  ASSESSMENT_SUBTYPE_LABELS_FR,
  ASSESSMENT_USAGE_LABELS_FR,
  sessionState,
  usageSeDate,
  type AssessmentModality,
  type AssessmentSession,
  type AssessmentUsage,
} from "@/domain/assessmentModality";
import { catalogueRows, type CatalogueRow } from "@/domain/assessmentCatalogue";
import { AssessmentModalityForm } from "@/features/administration/AssessmentModalityForm";
import type { Cohort, ProgramId } from "@/domain/types";

/* ------------------------------------------------------------------ */
/* Vocabulaire                                                          */
/* ------------------------------------------------------------------ */

const ORDRE_DES_USAGES: readonly AssessmentUsage[] = [
  "self_assessment",
  "formative",
  "validation_exam",
  "certification",
];

const CE_QUE_L_USAGE_ENGAGE: Record<AssessmentUsage, string> = {
  self_assessment: "L'étudiant s'y exerce quand il veut, en continu. Rien n'est retenu contre lui.",
  formative: "Passage attendu et résultat commenté, sans effet sur la validation.",
  validation_exam: "Le passage conditionne la validation du stage.",
  certification: "Épreuve certifiante, au-delà du programme.",
};

type Mode = "lecture" | "construction";

const SELECT_CLASS = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";

/* ------------------------------------------------------------------ */
/* Les promotions, en tête                                              */
/* ------------------------------------------------------------------ */

function PromotionsEnTete({
  cohorts,
  sessions,
  selected,
  onSelect,
}: {
  readonly cohorts: readonly Cohort[];
  readonly sessions: readonly AssessmentSession[];
  readonly selected: string | null;
  readonly onSelect: (cohortId: string | null) => void;
}) {
  return (
    <PanelCard
      title="Promotions concernées"
      description="Les modalités valent pour toutes. Les dates, elles, se posent promotion par promotion — cliquez-en une pour ne voir qu'elle."
    >
      {cohorts.length === 0 ? (
        <EmptyState>Aucune promotion ouverte sur ce programme.</EmptyState>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {cohorts.map((cohort) => {
            const datees = sessions.filter((s) => s.cohortId === cohort.id).length;
            const active = selected === cohort.id;
            return (
              <li key={cohort.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(active ? null : cohort.id)}
                  className={`border-border flex w-full flex-wrap items-center gap-2 rounded-md border p-3 text-left text-sm ${
                    active ? "bg-muted ring-primary ring-2" : "hover:bg-muted/50"
                  }`}
                >
                  <Users className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <span className="font-medium">{cohort.label}</span>
                  <Badge variant="outline" className="font-normal">
                    {cohort.academicYear}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {cohort.learnerCount} apprenant(s)
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    stage du {formatFrDate(cohort.startsOn)} au {formatFrDate(cohort.endsOn)}
                  </span>
                  <Badge variant={datees > 0 ? "secondary" : "outline"} className="ml-auto font-normal">
                    {datees === 0 ? "aucune épreuve datée" : `${datees} épreuve(s) datée(s)`}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* Les épreuves datées d'une modalité                                    */
/* ------------------------------------------------------------------ */

function SessionRow({
  session,
  cohorts,
  editable,
  onChanged,
}: {
  readonly session: AssessmentSession;
  readonly cohorts: readonly Cohort[];
  readonly editable: boolean;
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [busy, setBusy] = useState(false);
  const cohort = cohorts.find((c) => c.id === session.cohortId);
  const passee = sessionState(session, new Date()) === "completed";

  async function supprimer() {
    setBusy(true);
    try {
      await dataAccess.assessments.deleteAssessmentSession(session.id);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <CalendarDays className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="font-mono text-xs">{formatFrDate(session.scheduledOn)}</span>
      <span className="font-medium">{cohort?.label ?? "promotion"}</span>
      {session.location ? (
        <span className="text-muted-foreground text-xs">· {session.location}</span>
      ) : null}
      {session.notes ? (
        <span className="text-muted-foreground text-xs">· {session.notes}</span>
      ) : null}
      <Badge variant={passee ? "secondary" : "outline"} className="font-normal">
        {passee ? "passée" : "à venir"}
      </Badge>
      {editable ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-9"
          disabled={busy}
          onClick={() => void supprimer()}
        >
          Supprimer
        </Button>
      ) : null}
    </li>
  );
}

function AjouterUneEpreuve({
  modality,
  cohorts,
  cohortPreselected,
  onChanged,
}: {
  readonly modality: AssessmentModality;
  readonly cohorts: readonly Cohort[];
  readonly cohortPreselected: string | null;
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [cohortId, setCohortId] = useState(cohortPreselected ?? cohorts[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [lieu, setLieu] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ajouter() {
    if (!cohortId || !date) return;
    setBusy(true);
    setError(null);
    try {
      await dataAccess.assessments.createAssessmentSession({
        assessmentModalityId: modality.id,
        cohortId,
        scheduledOn: date,
        location: lieu,
        notes: "",
      });
      setDate("");
      setLieu("");
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (cohorts.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Aucune promotion ouverte : rien à dater pour l'instant.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor={`sess-cohort-${modality.id}`} className="text-xs">
            Promotion
          </Label>
          <select
            id={`sess-cohort-${modality.id}`}
            className={`${SELECT_CLASS} w-full`}
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`sess-date-${modality.id}`} className="text-xs">
            Date
          </Label>
          <Input
            id={`sess-date-${modality.id}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`sess-lieu-${modality.id}`} className="text-xs">
            Lieu (optionnel)
          </Label>
          <Input
            id={`sess-lieu-${modality.id}`}
            value={lieu}
            placeholder="Salle de simulation, amphi B…"
            onChange={(e) => setLieu(e.target.value)}
            className="min-h-11"
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          disabled={busy || !cohortId || !date}
          onClick={() => void ajouter()}
        >
          {busy ? "Ajout…" : "Dater"}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

function EpreuvesDeLaModalite({
  modality,
  sessions,
  cohorts,
  cohortFilter,
  editable,
  onChanged,
}: {
  readonly modality: AssessmentModality;
  readonly sessions: readonly AssessmentSession[];
  readonly cohorts: readonly Cohort[];
  readonly cohortFilter: string | null;
  readonly editable: boolean;
  readonly onChanged?: (() => void) | undefined;
}) {
  if (!usageSeDate(modality.usage)) {
    return (
      <p className="text-muted-foreground text-xs">
        En continu : une auto-évaluation ne se date pas.
      </p>
    );
  }
  const siennes = sessions
    .filter((s) => s.modalityId === modality.id)
    .filter((s) => cohortFilter === null || s.cohortId === cohortFilter)
    .sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn));

  return (
    <div className="space-y-2">
      {siennes.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {cohortFilter ? "Non datée pour cette promotion." : "Non datée."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {siennes.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              cohorts={cohorts}
              editable={editable}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
      {editable ? (
        <AjouterUneEpreuve
          modality={modality}
          cohorts={cohorts}
          cohortPreselected={cohortFilter}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LECTURE — une carte par modalité retenue                              */
/* ------------------------------------------------------------------ */

function CarteLecture({
  modality,
  sessions,
  cohorts,
  cohortFilter,
}: {
  readonly modality: AssessmentModality;
  readonly sessions: readonly AssessmentSession[];
  readonly cohorts: readonly Cohort[];
  readonly cohortFilter: string | null;
}) {
  return (
    <li className="border-border rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">{modality.name}</strong>
        <Badge variant="secondary">{ASSESSMENT_SUBTYPE_LABELS_FR[modality.subtype]}</Badge>
        <Badge variant="outline">{ASSESSMENT_MODE_LABELS_FR[modality.mode]}</Badge>
      </div>
      {modality.notes ? (
        <p className="text-muted-foreground mt-2 text-xs">{modality.notes}</p>
      ) : null}
      <div className="mt-3">
        <EpreuvesDeLaModalite
          modality={modality}
          sessions={sessions}
          cohorts={cohorts}
          cohortFilter={cohortFilter}
          editable={false}
        />
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* CONSTRUCTION — une ligne par possibilité                             */
/* ------------------------------------------------------------------ */

function LigneConstruction({
  programId,
  row,
  sessions,
  cohorts,
  cohortFilter,
  onChanged,
}: {
  readonly programId: ProgramId;
  readonly row: CatalogueRow;
  readonly sessions: readonly AssessmentSession[];
  readonly cohorts: readonly Cohort[];
  readonly cohortFilter: string | null;
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modality = row.modality;
  const presente = modality !== undefined && modality.retainedAt !== undefined;
  const surMesure = row.entry === undefined;
  const nom = modality?.name ?? row.entry?.name ?? "";
  const subtype = modality?.subtype ?? row.entry?.subtype;
  const mode = modality?.mode ?? row.entry?.mode;
  const datees = modality
    ? sessions.filter(
        (s) => s.modalityId === modality.id && (cohortFilter === null || s.cohortId === cohortFilter),
      ).length
    : 0;

  /*
   * Cocher AGIT tout de suite — pas de bouton « Activer » à chercher plus bas.
   * Créer depuis le catalogue, ou retenir/sortir une ligne existante.
   */
  async function basculer(retenue: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (modality) {
        await dataAccess.assessments.setAssessmentModalitiesRetained([modality.id], retenue);
      } else if (row.entry && retenue) {
        await dataAccess.assessments.createAssessmentModality({
          programId,
          name: row.entry.name,
          mode: row.entry.mode,
          subtype: row.entry.subtype,
          usage: row.entry.usage,
          notes: row.entry.notes,
        });
      }
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function retirer() {
    if (!modality) return;
    setBusy(true);
    setError(null);
    try {
      await dataAccess.assessments.archiveAssessmentModality(modality.id);
      setOpen(false);
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Retrait impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border-border rounded-md border">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Checkbox
          checked={presente}
          disabled={busy}
          onCheckedChange={(checked) => void basculer(checked === true)}
          aria-label={`Retenir ${nom} pour le programme`}
        />
        <span className={`text-sm ${presente ? "font-medium" : "text-muted-foreground"}`}>{nom}</span>
        {subtype ? (
          <Badge variant="secondary" className="font-normal">
            {ASSESSMENT_SUBTYPE_LABELS_FR[subtype]}
          </Badge>
        ) : null}
        {mode ? (
          <Badge variant="outline" className="font-normal">
            {ASSESSMENT_MODE_LABELS_FR[mode]}
          </Badge>
        ) : null}
        {surMesure ? (
          <Badge variant="outline" className="font-normal">
            sur mesure
          </Badge>
        ) : null}
        {modality && !presente ? (
          <Badge variant="outline" className="text-muted-foreground font-normal">
            hors parcours
          </Badge>
        ) : null}
        {modality && usageSeDate(modality.usage) ? (
          <Badge variant={datees > 0 ? "secondary" : "outline"} className="font-normal">
            {datees === 0 ? "non datée" : `${datees} date(s)`}
          </Badge>
        ) : null}
        {modality ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto min-h-9 gap-1"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
            {open ? "Replier" : "Configurer et dater"}
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-destructive px-3 pb-2 text-xs">{error}</p> : null}

      {modality && open ? (
        <div className="border-border space-y-4 border-t p-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">Configuration</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9 gap-1"
                onClick={() => setEditing((v) => !v)}
              >
                <Pencil className="size-3.5" aria-hidden />
                {editing ? "Fermer" : "Modifier"}
              </Button>
            </div>
            {editing ? (
              <AssessmentModalityForm
                programId={programId}
                existing={modality}
                idPrefix={`edit-${modality.id}`}
                hint="Le format, le lieu, l'usage et les consignes sont modifiés en place. Les épreuves déjà datées suivent."
                onCreated={() => {
                  setEditing(false);
                  onChanged?.();
                }}
              />
            ) : (
              <p className="text-muted-foreground text-xs">
                {ASSESSMENT_USAGE_LABELS_FR[modality.usage]}
                {modality.notes ? ` — ${modality.notes}` : ""}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">Épreuves datées</p>
            <EpreuvesDeLaModalite
              modality={modality}
              sessions={sessions}
              cohorts={cohorts}
              cohortFilter={cohortFilter}
              editable
              onChanged={onChanged}
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9"
              disabled={busy}
              onClick={() => void retirer()}
            >
              Retirer du programme
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Le bloc                                                              */
/* ------------------------------------------------------------------ */

export function AssessmentModalitySection({
  programId,
  modalities,
  sessions,
  cohorts,
  onChanged,
  editable = true,
  defaultMode = "lecture",
  cohortFilter: cohortFilterImposed,
  children,
}: {
  readonly programId: ProgramId;
  readonly modalities: readonly AssessmentModality[];
  readonly sessions: readonly AssessmentSession[];
  readonly cohorts: readonly Cohort[];
  /** Relit modalités et épreuves après toute écriture. */
  readonly onChanged?: (() => void) | undefined;
  /** `false` dans le pilotage : lecture seule, pas de bascule. */
  readonly editable?: boolean;
  /** Le Concepteur part en construction ; l'onglet part en lecture. */
  readonly defaultMode?: Mode;
  /** Le pilotage impose sa promotion ; sinon l'utilisateur choisit en tête. */
  readonly cohortFilter?: string | undefined;
  /** L'import assisté, rendu par l'appelant, visible en construction. */
  readonly children?: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>(editable ? defaultMode : "lecture");
  const [cohortChosen, setCohortChosen] = useState<string | null>(null);
  const cohortFilter = cohortFilterImposed ?? cohortChosen;

  const rows = useMemo(() => catalogueRows(modalities), [modalities]);
  const retenues = modalities.filter((m) => m.retainedAt !== undefined);

  return (
    <div className="space-y-6">
      <PromotionsEnTete
        cohorts={cohortFilterImposed ? cohorts.filter((c) => c.id === cohortFilterImposed) : cohorts}
        sessions={sessions}
        selected={cohortFilter}
        onSelect={cohortFilterImposed ? () => undefined : setCohortChosen}
      />

      {editable ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Mode">
          <Button
            type="button"
            size="sm"
            variant={mode === "lecture" ? "default" : "outline"}
            className="min-h-10"
            aria-pressed={mode === "lecture"}
            onClick={() => setMode("lecture")}
          >
            Lecture
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "construction" ? "default" : "outline"}
            className="min-h-10"
            aria-pressed={mode === "construction"}
            onClick={() => setMode("construction")}
          >
            Construction
          </Button>
          <span className="text-muted-foreground text-xs">
            {mode === "lecture"
              ? "Ce qui est retenu, et quand."
              : "Tout ce qui est possible : cochez, configurez, datez."}
          </span>
        </div>
      ) : null}

      <PanelCard
        title={mode === "lecture" ? "Ce que l'étudiant rencontrera" : "Toutes les modalités possibles"}
        description={
          mode === "lecture"
            ? "Les modalités retenues, rangées par ce qu'elles engagent, avec leurs épreuves datées."
            : "Le catalogue en entier, présent ou pas, plus ce que le programme a inventé. Une case cochée crée ou retient ; une ligne présente se déplie pour être configurée, datée par promotion, ou retirée."
        }
      >
        {mode === "lecture" && retenues.length === 0 ? (
          <EmptyState>
            Aucune modalité retenue pour ce programme. Passez en construction pour en choisir.
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {ORDRE_DES_USAGES.map((usage) => {
              const lignes =
                mode === "lecture"
                  ? retenues.filter((m) => m.usage === usage)
                  : rows.filter((r) => r.usage === usage);
              return (
                <section key={usage} className="space-y-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="text-sm font-medium">{ASSESSMENT_USAGE_LABELS_FR[usage]}</h3>
                    <span className="text-muted-foreground text-xs">
                      {lignes.length === 0 ? "aucune" : `${lignes.length}`} · {CE_QUE_L_USAGE_ENGAGE[usage]}
                    </span>
                  </div>
                  {lignes.length === 0 ? (
                    <p className="text-muted-foreground border-border rounded-md border border-dashed px-3 py-2.5 text-xs">
                      Rien de prévu à ce titre pour ce programme.
                    </p>
                  ) : mode === "lecture" ? (
                    <ul className="grid gap-3 lg:grid-cols-2">
                      {(lignes as readonly AssessmentModality[]).map((m) => (
                        <CarteLecture
                          key={m.id}
                          modality={m}
                          sessions={sessions}
                          cohorts={cohorts}
                          cohortFilter={cohortFilter}
                        />
                      ))}
                    </ul>
                  ) : (
                    <ul className="space-y-2">
                      {(lignes as readonly CatalogueRow[]).map((r) => (
                        <LigneConstruction
                          key={r.id}
                          programId={programId}
                          row={r}
                          sessions={sessions}
                          cohorts={cohorts}
                          cohortFilter={cohortFilter}
                          onChanged={onChanged}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </PanelCard>

      {mode === "construction" ? (
        <PanelCard
          title="Créer une modalité sur mesure"
          description="Pour ce que le catalogue ne propose pas. Elle rejoint la liste ci-dessus dans son groupe, prête à être datée."
        >
          <AssessmentModalityForm
            programId={programId}
            hint="La modalité créée apparaît immédiatement dans la liste, dans le Concepteur et dans le pilotage."
            onCreated={() => onChanged?.()}
          />
        </PanelCard>
      ) : null}

      {mode === "construction" ? children : null}

      <p className="text-muted-foreground text-xs">
        Ce que l'étudiant voit : rien de tout ceci, pour l'instant. La lecture du référentiel et
        des épreuves est réservée à l'équipe pédagogique ; son onglet « Mes évaluations » ne
        présente encore que les ECOS virtuels. C'est le lot suivant.
      </p>
    </div>
  );
}
