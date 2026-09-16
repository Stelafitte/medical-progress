/**
 * LES ÉVALUATIONS D'UNE PROMOTION — bloc unique, sans modes.
 *
 * Stef (14/09, tard) : « quand je choisis une promotion, en dessous doit
 * apparaître le contenu des modalités d'évaluation de cette promotion ; le
 * contenu peut être différent d'une promotion à l'autre ; pas deux boutons
 * lecture / construction ». Voici ce que ça donne.
 *
 * TROIS COUCHES, UN ÉCRAN, UNE PROMOTION À LA FOIS :
 *   1. le catalogue — tout ce qui est possible (`assessmentCatalogue.ts`) ;
 *   2. la modalité, configurée UNE FOIS pour le programme — format, lieu,
 *      usage, consignes (`assessment_modalities`) ;
 *   3. ce que CETTE promotion en fait — l'utilise ou non
 *      (`cohort_assessment_modalities`), et quand (`assessment_sessions`).
 *
 * On clique une promotion en tête. En dessous : ses modalités, présentes ou
 * à créer, par usage. Une case cochée = « cette promotion utilise cette
 * modalité » ; si la modalité n'existait pas encore, la cocher la crée. Une
 * ligne cochée se déplie : sa configuration (commune aux promotions qui la
 * partagent), ses dates POUR CETTE PROMOTION, et le retrait.
 *
 * Le même composant sert l'onglet « Évaluations », le Concepteur (étape 1) et
 * le pilotage (lecture seule, promotion imposée).
 */
import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Pencil, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PanelCard, StatCard } from "@/features/professional/mock-ui";
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
  type CohortAssessmentLink,
} from "@/domain/assessmentModality";
import { catalogueRows, type CatalogueRow } from "@/domain/assessmentCatalogue";
import { AssessmentModalityForm } from "@/features/administration/AssessmentModalityForm";
import { QcmPilotage } from "@/features/administration/QcmPilotage";
import { EcosPilotage } from "@/features/administration/EcosPilotage";
import { estEcosSimule } from "@/domain/ecos";
import type { Cohort, OutcomeTheme, ProgramId } from "@/domain/types";
import type { QuestionBankRow } from "@/application/ports/repositories";

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

const SELECT_CLASS = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";

/* ------------------------------------------------------------------ */
/* Les promotions, en tête                                              */
/* ------------------------------------------------------------------ */

function PromotionsEnTete({
  cohorts,
  links,
  sessions,
  selected,
  onSelect,
  imposed,
}: {
  readonly cohorts: readonly Cohort[];
  readonly links: readonly CohortAssessmentLink[];
  readonly sessions: readonly AssessmentSession[];
  readonly selected: string | null;
  readonly onSelect: (cohortId: string) => void;
  readonly imposed: boolean;
}) {
  return (
    <PanelCard
      title="Promotions"
      description={
        imposed
          ? "La promotion pilotée."
          : "Chaque promotion a son propre contenu d'évaluation. Cliquez-en une : ce qui suit est à elle."
      }
    >
      {cohorts.length === 0 ? (
        <EmptyState>
          Aucune promotion ouverte sur ce programme. Créez-en une (Concepteur, étape 2) : c'est
          elle qui portera les évaluations.
        </EmptyState>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {cohorts.map((cohort) => {
            const servies = links.filter((l) => l.cohortId === cohort.id).length;
            const datees = sessions.filter((s) => s.cohortId === cohort.id).length;
            const active = selected === cohort.id;
            return (
              <li key={cohort.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={imposed}
                  onClick={() => onSelect(cohort.id)}
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
                  <span className="ml-auto flex flex-wrap gap-1">
                    <Badge variant={servies > 0 ? "secondary" : "outline"} className="font-normal">
                      {servies === 0 ? "aucune modalité" : `${servies} modalité(s)`}
                    </Badge>
                    <Badge variant={datees > 0 ? "secondary" : "outline"} className="font-normal">
                      {datees === 0 ? "aucune date" : `${datees} date(s)`}
                    </Badge>
                  </span>
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
/* Les dates d'une modalité, pour la promotion choisie                  */
/* ------------------------------------------------------------------ */

function SessionRow({
  session,
  editable,
  onChanged,
}: {
  readonly session: AssessmentSession;
  readonly editable: boolean;
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [busy, setBusy] = useState(false);
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
      {session.location ? <span className="text-muted-foreground text-xs">{session.location}</span> : null}
      {session.notes ? <span className="text-muted-foreground text-xs">· {session.notes}</span> : null}
      <Badge variant={passee ? "secondary" : "outline"} className="font-normal">
        {passee ? "passée" : "à venir"}
      </Badge>
      {editable ? (
        <Button type="button" size="sm" variant="ghost" className="min-h-9" disabled={busy} onClick={() => void supprimer()}>
          Supprimer
        </Button>
      ) : null}
    </li>
  );
}

function AjouterUneDate({
  modality,
  cohortId,
  onChanged,
}: {
  readonly modality: AssessmentModality;
  readonly cohortId: string;
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [date, setDate] = useState("");
  const [lieu, setLieu] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ajouter() {
    if (!date) return;
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

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor={`d-${modality.id}`} className="text-xs">
            Date
          </Label>
          <Input id={`d-${modality.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-11" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`l-${modality.id}`} className="text-xs">
            Lieu (optionnel)
          </Label>
          <Input
            id={`l-${modality.id}`}
            value={lieu}
            placeholder="Salle de simulation, amphi B, en ligne…"
            onChange={(e) => setLieu(e.target.value)}
            className="min-h-11"
          />
        </div>
        <Button type="button" size="sm" className="min-h-11" disabled={busy || !date} onClick={() => void ajouter()}>
          {busy ? "Ajout…" : "Ajouter cette date"}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Une ligne : une modalité, pour la promotion choisie                  */
/* ------------------------------------------------------------------ */

function LigneModalite({
  programId,
  cohort,
  row,
  utilisee,
  cochee,
  onToggle,
  ouverte,
  onOuvrir,
  sessions,
  link,
  banques,
  themes,
  editable,
  onChanged,
}: {
  readonly programId: ProgramId;
  readonly cohort: Cohort;
  readonly row: CatalogueRow;
  /** Ce que la BASE dit : cette promotion utilise cette modalité. */
  readonly utilisee: boolean;
  /** Ce que la CASE dit : l'intention, enregistrée ou pas encore. */
  readonly cochee: boolean;
  readonly onToggle: (rowId: string, voulue: boolean) => void;
  /**
   * ⚠️ L'OUVERTURE EST PORTÉE PAR LE BLOC, PAS PAR LA LIGNE (16/09).
   *
   * Cocher une entrée de catalogue puis enregistrer CHANGE L'IDENTIFIANT de la
   * ligne (`catalogue:ecos-simule` devient l'identifiant réel de la modalité) :
   * React démonte le composant et en remonte un autre, donc tout état local —
   * et tout `useRef` qui surveillait « vient-elle d'être rattachée ? » — repart
   * de zéro. C'est pour cela que le dépliage automatique ne se produisait pas.
   * Le bloc, lui, retient une clé stable qui survit à la création.
   */
  readonly ouverte: boolean;
  readonly onOuvrir: (ouverte: boolean) => void;
  readonly sessions: readonly AssessmentSession[];
  /** Le lien promotion ↔ modalité, quand il existe : il porte le pilotage. */
  readonly link: CohortAssessmentLink | undefined;
  readonly banques: readonly QuestionBankRow[];
  readonly themes: readonly OutcomeTheme[];
  readonly editable: boolean;
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const cohortId = cohort.id;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enAttente = cochee !== utilisee;
  const estQcm = row.modality?.subtype === "qcm";
  /* Un ECOS SIMULÉ est un ECOS en ligne : il se pilote station par station. */
  const estEcos = row.modality !== undefined && estEcosSimule(row.modality);
  /*
   * Stef (16/09) : « dès qu'on clique sur la case, le contenu apparaît ».
   * Une ligne cochée se déplie donc AVANT l'enregistrement — elle dit alors ce
   * qu'elle attend — et le reste après.
   */
  const depliable = (utilisee || cochee) && (row.modality !== undefined || row.entry !== undefined);

  const modality = row.modality;
  const surMesure = row.entry === undefined;
  const nom = modality?.name ?? row.entry?.name ?? "";
  const subtype = modality?.subtype ?? row.entry?.subtype;
  const mode = modality?.mode ?? row.entry?.mode;
  const usage = row.usage;
  const dates = modality
    ? sessions
        .filter((s) => s.modalityId === modality.id && s.cohortId === cohortId)
        .sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn))
    : [];

  /*
   * Cocher ne change RIEN en base (Stef, 14/09 soir) : c'est une intention,
   * enregistrée par le bouton en bas du bloc — comme dans le Concepteur pour
   * les acquis. La ligne ne fait que remonter la case au bloc.
   */
  async function retirerDuProgramme() {
    if (!modality) return;
    setBusy(true);
    setError(null);
    try {
      await dataAccess.assessments.archiveAssessmentModality(modality.id);
      onOuvrir(false);
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
        {editable ? (
          <Checkbox
            checked={cochee}
            disabled={busy}
            onCheckedChange={(checked) => onToggle(row.id, checked === true)}
            aria-label={`${nom} pour cette promotion`}
          />
        ) : null}
        {depliable ? (
          <button
            type="button"
            className="text-left text-sm font-medium underline-offset-4 hover:underline"
            aria-expanded={ouverte}
            onClick={() => onOuvrir(!ouverte)}
          >
            {nom}
          </button>
        ) : (
          <span className={`text-sm ${cochee ? "font-medium" : "text-muted-foreground"}`}>{nom}</span>
        )}
        {enAttente ? (
          <Badge variant="outline" className="text-muted-foreground font-normal">
            {cochee ? "à enregistrer" : "à retirer"}
          </Badge>
        ) : null}
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
        {utilisee && usageSeDate(usage) && !estQcm ? (
          <Badge variant={dates.length > 0 ? "secondary" : "outline"} className="font-normal">
            {dates.length === 0 ? "non datée" : `${dates.length} date(s)`}
          </Badge>
        ) : null}
        {utilisee && estQcm && dates.length > 0 ? (
          <Badge variant="secondary" className="font-normal">
            {dates.length} fenêtre(s)
          </Badge>
        ) : null}
        {utilisee && !usageSeDate(usage) && !estQcm ? (
          <Badge variant="outline" className="font-normal">
            en continu
          </Badge>
        ) : null}
        {utilisee && link && !link.isOpen ? (
          <Badge variant="outline" className="text-destructive font-normal">
            fermé
          </Badge>
        ) : null}
        {utilisee && estQcm && link ? (
          <Badge variant="outline" className="font-normal">
            {link.questionSource ? `banque ${link.questionSource}` : "sans banque"}
            {link.freeAccess && link.questionSource ? " · accès libre" : ""}
          </Badge>
        ) : null}
        {utilisee && estEcos && link ? (
          <Badge
            variant={(link.ecosStations?.length ?? 0) > 0 ? "secondary" : "outline"}
            className="font-normal"
          >
            {(link.ecosStations?.length ?? 0) > 0
              ? `${link.ecosStations?.length} station(s)`
              : "aucune station"}
          </Badge>
        ) : null}
        {depliable ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto min-h-9 gap-1"
            aria-expanded={ouverte}
            onClick={() => onOuvrir(!ouverte)}
          >
            {ouverte ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
            {ouverte ? "Replier" : "Détail"}
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-destructive px-3 pb-2 text-xs">{error}</p> : null}

      {/*
        COCHÉE MAIS PAS ENCORE ENREGISTRÉE : la ligne s'ouvre quand même et dit
        ce qu'elle attend. Ses réglages (stations, banque, dates) ont besoin du
        rattachement à la promotion pour exister — un panneau vide ferait croire
        à une panne.
      */}
      {!utilisee && cochee && ouverte && row.entry ? (
        <div className="border-border space-y-2 border-t p-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">Format</dt>
              <dd>{ASSESSMENT_SUBTYPE_LABELS_FR[row.entry.subtype]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Lieu</dt>
              <dd>{ASSESSMENT_MODE_LABELS_FR[row.entry.mode]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Ce qu'elle engage</dt>
              <dd>{ASSESSMENT_USAGE_LABELS_FR[row.entry.usage]}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-muted-foreground text-xs">Consignes</dt>
              <dd>{row.entry.notes}</dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs">
            Cochée, pas encore enregistrée. <strong>Enregistrer</strong>, en bas du bloc, rattache
            cette modalité à la promotion : ses réglages s'ouvriront ici même.
          </p>
        </div>
      ) : null}

      {utilisee && modality && ouverte ? (
        <div className="border-border space-y-4 border-t p-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">
                Caractéristiques{" "}
                <span className="text-muted-foreground font-normal">
                  — communes à toutes les promotions qui utilisent cette modalité
                </span>
              </p>
              {editable ? (
                <Button type="button" size="sm" variant="outline" className="min-h-9 gap-1" onClick={() => setEditing((v) => !v)}>
                  <Pencil className="size-3.5" aria-hidden />
                  {editing ? "Fermer" : "Modifier"}
                </Button>
              ) : null}
            </div>
            {editing ? (
              <AssessmentModalityForm
                programId={programId}
                existing={modality}
                idPrefix={`edit-${modality.id}`}
                hint="Format, lieu, usage et consignes sont modifiés en place, pour toutes les promotions qui partagent cette modalité."
                onCreated={() => {
                  setEditing(false);
                  onChanged?.();
                }}
              />
            ) : (
              <dl className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground text-xs">Format</dt>
                  <dd>{ASSESSMENT_SUBTYPE_LABELS_FR[modality.subtype]}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Lieu</dt>
                  <dd>{ASSESSMENT_MODE_LABELS_FR[modality.mode]}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Ce qu'elle engage</dt>
                  <dd>{ASSESSMENT_USAGE_LABELS_FR[modality.usage]}</dd>
                </div>
                {modality.notes ? (
                  <div className="sm:col-span-3">
                    <dt className="text-muted-foreground text-xs">Consignes</dt>
                    <dd>{modality.notes}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </div>

          {estEcos && link ? (
            <EcosPilotage
              cohort={cohort}
              modality={modality}
              link={link}
              editable={editable}
              onChanged={onChanged}
            />
          ) : estQcm && link ? (
            <QcmPilotage
              programId={programId}
              cohort={cohort}
              modality={modality}
              link={link}
              banques={banques}
              themes={themes}
              sessions={sessions}
              editable={editable}
              onChanged={onChanged}
            />
          ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium">
              Temporalité <span className="text-muted-foreground font-normal">— pour cette promotion</span>
            </p>
            {!usageSeDate(modality.usage) ? (
              <p className="text-muted-foreground text-xs">
                En continu, du début à la fin du stage : une auto-évaluation ne se date pas.
              </p>
            ) : (
              <>
                {dates.length === 0 ? (
                  <p className="text-muted-foreground text-xs">Aucune date posée pour cette promotion.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {dates.map((s) => (
                      <SessionRow key={s.id} session={s} editable={editable} onChanged={onChanged} />
                    ))}
                  </ul>
                )}
                {editable ? <AjouterUneDate modality={modality} cohortId={cohortId} onChanged={onChanged} /> : null}
              </>
            )}
          </div>
          )}

          {editable ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-muted-foreground text-xs">
                Décocher la case retire la modalité de cette promotion seulement.
              </span>
              <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={busy} onClick={() => void retirerDuProgramme()}>
                Retirer du programme entier
              </Button>
            </div>
          ) : null}
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
  links,
  cohorts,
  banques = [],
  themes = [],
  onChanged,
  editable = true,
  cohortFilter: imposed,
  children,
}: {
  readonly programId: ProgramId;
  readonly modalities: readonly AssessmentModality[];
  readonly sessions: readonly AssessmentSession[];
  readonly links: readonly CohortAssessmentLink[];
  readonly cohorts: readonly Cohort[];
  /** Les banques de questions du programme, pour le pilotage des QCM. */
  readonly banques?: readonly QuestionBankRow[];
  /** Les thèmes du référentiel, pour filtrer une série de QCM. */
  readonly themes?: readonly OutcomeTheme[];
  /** Relit modalités, liens et épreuves après toute écriture. */
  readonly onChanged?: (() => void) | undefined;
  /** `false` dans le pilotage : lecture seule. */
  readonly editable?: boolean;
  /** Le pilotage impose sa promotion. */
  readonly cohortFilter?: string | undefined;
  /** L'import assisté, rendu par l'appelant. */
  readonly children?: ReactNode;
}) {
  const dataAccess = useDataAccess();
  const [chosen, setChosen] = useState<string | null>(null);
  // Sans choix explicite, la première promotion : l'écran n'arrive jamais vide.
  const cohortId = imposed ?? chosen ?? cohorts[0]?.id ?? null;
  const cohort = cohorts.find((c) => c.id === cohortId);

  const rows = useMemo(() => catalogueRows(modalities), [modalities]);
  const utilisees = useMemo(
    () => new Set(links.filter((l) => l.cohortId === cohortId).map((l) => l.modalityId)),
    [links, cohortId],
  );
  const estUtilisee = (row: CatalogueRow) => row.modality !== undefined && utilisees.has(row.modality.id);

  /*
   * LA SÉLECTION EN ATTENTE. Clé = identifiant de ligne, valeur = ce que la
   * case veut. Vide = rien à enregistrer. Changer de promotion la vide : une
   * intention posée sur test SL n'a rien à faire sur la centurie A.
   */
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /*
   * LES LIGNES OUVERTES, PAR UNE CLÉ QUI SURVIT À LA CRÉATION.
   *
   * L'identifiant d'une ligne change quand on l'enregistre : une entrée de
   * catalogue (`catalogue:ecos-simule`) devient la modalité réelle. La clé
   * d'ouverture est donc celle du CATALOGUE quand elle existe — la seule chose
   * qui ne bouge pas de part et d'autre de l'enregistrement.
   */
  const cleDOuverture = (row: CatalogueRow) => row.entry?.key ?? row.modality?.id ?? row.id;
  const [ouvertes, setOuvertes] = useState<ReadonlySet<string>>(new Set());
  const ouvrir = (cle: string, ouverte: boolean) =>
    setOuvertes((prev) => {
      const next = new Set(prev);
      if (ouverte) next.add(cle);
      else next.delete(cle);
      return next;
    });

  const choisir = (id: string) => {
    setChosen(id);
    setPending(new Map());
    setOuvertes(new Set());
    setSaveError(null);
  };
  const toggle = (rowId: string, voulue: boolean) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    /* Cocher OUVRE la ligne aussitôt (Stef, 16/09) ; décocher la referme. */
    ouvrir(cleDOuverture(row), voulue);
    setPending((prev) => {
      const next = new Map(prev);
      if (voulue === estUtilisee(row)) next.delete(rowId);
      else next.set(rowId, voulue);
      return next;
    });
  };
  const estCochee = (row: CatalogueRow) => pending.get(row.id) ?? estUtilisee(row);

  /*
   * Enregistrer : créer ce qui n'existe pas, lier ce qui est voulu, délier ce
   * qui ne l'est plus — dans cet ordre, ligne par ligne, puis relire. Une
   * ligne en échec n'empêche pas les autres ; l'erreur est dite.
   */
  async function enregistrer() {
    if (!cohortId || pending.size === 0) return;
    setSaving(true);
    setSaveError(null);
    const erreurs: string[] = [];
    for (const [rowId, voulue] of pending) {
      const row = rows.find((r) => r.id === rowId);
      if (!row) continue;
      try {
        let id = row.modality?.id;
        if (!id && voulue && row.entry) {
          const created = await dataAccess.assessments.createAssessmentModality({
            programId,
            name: row.entry.name,
            mode: row.entry.mode,
            subtype: row.entry.subtype,
            usage: row.entry.usage,
            notes: row.entry.notes,
          });
          id = created.id;
        }
        if (id) await dataAccess.assessments.setCohortAssessmentModality(cohortId, id, voulue);
      } catch (reason) {
        const nom = row.modality?.name ?? row.entry?.name ?? rowId;
        erreurs.push(`${nom} : ${reason instanceof Error ? reason.message : "échec"}`);
      }
    }
    setPending(new Map());
    setSaving(false);
    if (erreurs.length > 0) setSaveError(erreurs.join(" · "));
    onChanged?.();
  }

  const datesDeLaPromo = sessions.filter((s) => s.cohortId === cohortId);
  const compter = (usage: AssessmentUsage) =>
    rows.filter((r) => estUtilisee(r) && r.usage === usage).length;

  return (
    <div className="space-y-6">
      <PromotionsEnTete
        cohorts={imposed ? cohorts.filter((c) => c.id === imposed) : cohorts}
        links={links}
        sessions={sessions}
        selected={cohortId}
        onSelect={choisir}
        imposed={imposed !== undefined}
      />

      {cohort ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Auto-évaluations" value={compter("self_assessment")} />
            <StatCard label="Formatives" value={compter("formative")} />
            <StatCard label="Validantes" value={compter("validation_exam")} />
            <StatCard label="Dates posées" value={datesDeLaPromo.length} />
          </div>

          <PanelCard
            title={`Évaluations de ${cohort.label}`}
            description={
              editable
                ? "Tout ce qui est possible, par ce que l'épreuve engage. Cochez pour que cette promotion l'utilise — la modalité est créée si besoin. Dépliez pour ses caractéristiques et ses dates."
                : "Ce que cette promotion rencontrera, et quand."
            }
          >
            <div className="space-y-5">
              {ORDRE_DES_USAGES.map((usage) => {
                const lignes = rows
                  .filter((r) => r.usage === usage)
                  .filter((r) => editable || estUtilisee(r));
                return (
                  <section key={usage} className="space-y-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="text-sm font-medium">{ASSESSMENT_USAGE_LABELS_FR[usage]}</h3>
                      <span className="text-muted-foreground text-xs">
                        {compter(usage) === 0 ? "aucune utilisée" : `${compter(usage)} utilisée(s)`} ·{" "}
                        {CE_QUE_L_USAGE_ENGAGE[usage]}
                      </span>
                    </div>
                    {lignes.length === 0 ? (
                      <p className="text-muted-foreground border-border rounded-md border border-dashed px-3 py-2.5 text-xs">
                        Rien de prévu à ce titre pour cette promotion.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {lignes.map((r) => (
                          <LigneModalite
                            key={r.id}
                            programId={programId}
                            cohort={cohort}
                            row={r}
                            utilisee={estUtilisee(r)}
                            cochee={estCochee(r)}
                            onToggle={toggle}
                            ouverte={ouvertes.has(cleDOuverture(r))}
                            onOuvrir={(v) => ouvrir(cleDOuverture(r), v)}
                            sessions={sessions}
                            link={
                              r.modality
                                ? links.find((l) => l.cohortId === cohort.id && l.modalityId === r.modality?.id)
                                : undefined
                            }
                            banques={banques}
                            themes={themes}
                            editable={editable}
                            onChanged={onChanged}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>

            {editable ? (
              <div className="border-border mt-5 space-y-2 border-t pt-4">
                {saveError ? <p className="text-destructive text-sm">{saveError}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={saving || pending.size === 0}
                    onClick={() => void enregistrer()}
                  >
                    {saving
                      ? "Enregistrement…"
                      : pending.size === 0
                        ? "Enregistrer les modifications"
                        : `Enregistrer les modifications (${pending.size})`}
                  </Button>
                  {pending.size > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={saving}
                      onClick={() => setPending(new Map())}
                    >
                      Annuler
                    </Button>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">
                  Cocher ne change rien tant que vous n'avez pas enregistré. À l'enregistrement,
                  une modalité cochée est créée si besoin, puis servie à cette promotion ; une
                  modalité décochée lui est retirée, avec ses dates. Les caractéristiques et les
                  dates, elles, se règlent dans le détail d'une ligne enregistrée.
                </p>
              </div>
            ) : null}
          </PanelCard>

          {editable ? (
            <PanelCard
              title="Créer une modalité sur mesure"
              description={`Pour ce que le catalogue ne propose pas. Elle est créée pour le programme et aussitôt utilisée par ${cohort.label}.`}
            >
              <AssessmentModalityForm
                programId={programId}
                hint="La modalité rejoint la liste ci-dessus dans son groupe, cochée pour cette promotion, prête à être datée."
                onCreated={(created) => {
                  void dataAccess.assessments
                    .setCohortAssessmentModality(cohort.id, created.id, true)
                    .then(() => onChanged?.());
                }}
              />
            </PanelCard>
          ) : null}

          {editable ? children : null}
        </>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Ce que l'étudiant voit, dans « Mes évaluations » : les modalités servies à sa promotion,
        leurs caractéristiques et leurs dates — rien d'autre. Une modalité non cochée pour sa
        promotion lui reste invisible.
      </p>
    </div>
  );
}
