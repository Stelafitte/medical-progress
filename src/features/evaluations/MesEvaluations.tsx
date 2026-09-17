/**
 * « Mes évaluations » — ce que MA promotion rencontre, et quand.
 *
 * Lot D (15/09). Jusqu'ici l'onglet ne montrait que l'ECOS virtuel : le
 * référentiel d'évaluation était réservé à l'équipe. Depuis la migration
 * 20260915090000, l'apprenant lit les modalités servies à sa promotion, ses
 * dates, et rien d'autre — la RLS décide, l'écran n'infère rien.
 *
 * DEUX ÉTAGÈRES, c'est la distinction posée le 13/09 :
 *   - « quand je veux » : les auto-évaluations, en continu, sans date ;
 *   - « programmé pour moi » : formatives, validantes, certifiantes, avec leurs
 *     dates — les prochaines en premier, les passées repliées.
 * Une modalité datable sans date pour ma promotion est dite « non datée » :
 * l'étudiant sait qu'elle existe, il sait qu'on ne lui a pas encore dit quand.
 *
 * L'ECOS virtuel reste en dessous : c'est la seule évaluation que le hub sait
 * FAIRE PASSER lui-même, les autres se passent ailleurs.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, ChevronRight, MapPin, Play } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panneau, Vide } from "@/features/evaluations/ui-apprenant";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { useDataAccess, useSession } from "@/application/session";
import {
  FILTRE_VIDE,
  FiltreQuestions,
  cleFiltre,
  type FiltreValeur,
} from "@/features/evaluations/FiltreQuestions";
import {
  ASSESSMENT_MODE_LABELS_FR,
  ASSESSMENT_SUBTYPE_LABELS_FR,
  ASSESSMENT_USAGE_LABELS_FR,
  sessionState,
  usageSeDate,
  windowState,
  type AssessmentModality,
  type AssessmentSession,
  type AssessmentUsage,
  type CohortAssessmentLink,
} from "@/domain/assessmentModality";
import { ecosStationsOffertes } from "@/domain/ecos";
import type { OutcomeTheme } from "@/domain/types";

const CE_QUE_CA_ENGAGE: Record<AssessmentUsage, string> = {
  self_assessment: "Vous vous y exercez quand vous voulez. Rien n'est retenu contre vous.",
  formative: "Passage attendu, résultat commenté, sans effet sur la validation du stage.",
  validation_exam: "Le passage conditionne la validation de votre stage.",
  certification: "Épreuve certifiante, au-delà du stage.",
};

const EYEBROW = "text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase";

/**
 * ⚠️ MÊME CLÉ, MÊME REQUÊTE. `EcosVirtuelView` appelle ce hook pour savoir
 * quelles stations sont offertes à la promotion : la clé étant identique, il ne
 * part AUCUNE requête de plus et les deux écrans ne peuvent pas diverger.
 */
export function useMesEvaluations() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();
  const cohortId = activeEnrollment?.cohortId ?? null;
  return useQuery({
    queryKey: ["mes-evaluations", activeProgram.id, cohortId],
    queryFn: async () => {
      const [modalities, sessions, links, themes] = await Promise.all([
        data.assessments.listAssessmentModalities(activeProgram.id),
        data.assessments.listAssessmentSessions(activeProgram.id),
        data.assessments.listCohortAssessmentLinks(activeProgram.id),
        data.outcomes.listOutcomeThemes(activeProgram.id),
      ]);
      /*
       * La RLS a déjà borné à mes promotions. On reborne à MA promotion active
       * par prudence : un étudiant réinscrit d'une année sur l'autre a deux
       * inscriptions, et son écran doit parler de celle en cours.
       */
      const mesLiens = links.filter((l) => cohortId === null || l.cohortId === cohortId);
      const miennes = new Set(mesLiens.map((l) => l.modalityId));
      return {
        modalities: modalities.filter((m) => miennes.has(m.id)),
        sessions: sessions.filter((s) => cohortId === null || s.cohortId === cohortId),
        links: mesLiens,
        themes,
      };
    },
  });
}

function DateRow({ session }: { readonly session: AssessmentSession }) {
  const passee = sessionState(session, new Date()) === "completed";
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <CalendarDays className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className={passee ? "text-muted-foreground" : "font-medium"}>
        {formatFrDate(session.scheduledOn)}
      </span>
      {session.location ? (
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <MapPin className="size-3.5" aria-hidden />
          {session.location}
        </span>
      ) : null}
      {session.notes ? (
        <span className="text-muted-foreground text-xs">· {session.notes}</span>
      ) : null}
      <Badge variant={passee ? "outline" : "secondary"} className="font-normal">
        {passee ? "passée" : "à venir"}
      </Badge>
    </li>
  );
}

function CarteModalite({
  modality,
  sessions,
  link,
  themes,
}: {
  readonly modality: AssessmentModality;
  readonly sessions: readonly AssessmentSession[];
  readonly link: CohortAssessmentLink | undefined;
  readonly themes: readonly OutcomeTheme[];
}) {
  const [voirPassees, setVoirPassees] = useState(false);
  const miennes = sessions
    .filter((s) => s.modalityId === modality.id)
    .sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn));
  const aVenir = miennes.filter((s) => sessionState(s, new Date()) === "upcoming");
  const passees = miennes.filter((s) => sessionState(s, new Date()) === "completed");
  const seDate = usageSeDate(modality.usage);
  const estQcm = modality.subtype === "qcm";
  /*
    UN DOSSIER PROGRESSIF A SA PROPRE CARTE, pour la même raison que le QCM :
    ce qui compte n'est pas une date, c'est la LISTE de ce qu'on peut jouer
    maintenant. Les 21 mini-DP importés le 16/09 sont restés injouables deux
    jours faute de ce point de lancement.
  */
  /*
   * LE SOUS-TYPE `dp` EST ADMIS DEPUIS LE 17/09 (Stef, après ses tests).
   * L'entrée du catalogue qui convient à 21 mini-DP d'entraînement libre est
   * « Cas cliniques progressifs », en AUTO-ÉVALUATION — « rien n'est retenu
   * contre vous ». Elle est de sous-type `dp` ; ne reconnaître que `mini_dp`
   * et `kfp` obligeait à passer par une modalité FORMATIVE, ce qui change ce
   * que l'épreuve engage. Le lecteur ne doit pas décider de ça.
   */
  const estDossier =
    modality.subtype === "dp" || modality.subtype === "mini_dp" || modality.subtype === "kfp";

  /*
   * UN QCM A SA PROPRE CARTE (15/09). Pas de « date à venir » ni de
   * « en continu » génériques : ce qu'il montre, c'est ce que l'équipe a
   * piloté — ouvert ou fermé, l'accès libre, les fenêtres — et un bouton
   * pour chaque chose qu'on peut lancer maintenant.
   */
  if (estQcm) {
    return (
      <li className="border-border rounded-md border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm">{modality.name}</strong>
          <Badge variant="secondary">{ASSESSMENT_SUBTYPE_LABELS_FR[modality.subtype]}</Badge>
          {link && !link.isOpen ? (
            <Badge variant="outline" className="text-muted-foreground font-normal">
              fermé pour l'instant
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{CE_QUE_CA_ENGAGE[modality.usage]}</p>
        {modality.notes ? <p className="mt-2 text-sm">{modality.notes}</p> : null}
        <CarteQcm modality={modality} sessions={miennes} link={link} themes={themes} />
      </li>
    );
  }

  if (estDossier) {
    return (
      <li className="border-border rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm">{modality.name}</strong>
          <Badge variant="secondary">{ASSESSMENT_SUBTYPE_LABELS_FR[modality.subtype]}</Badge>
          {link && !link.isOpen ? (
            <Badge variant="outline" className="text-muted-foreground font-normal">
              fermé pour l'instant
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{CE_QUE_CA_ENGAGE[modality.usage]}</p>
        {modality.notes ? <p className="mt-2 text-sm">{modality.notes}</p> : null}
        <CarteDossiers modality={modality} link={link} />
      </li>
    );
  }

  return (
    <li className="border-border rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">{modality.name}</strong>
        <Badge variant="secondary">{ASSESSMENT_SUBTYPE_LABELS_FR[modality.subtype]}</Badge>
        <Badge variant="outline">{ASSESSMENT_MODE_LABELS_FR[modality.mode]}</Badge>
        {seDate && miennes.length === 0 ? (
          <Badge variant="outline" className="text-muted-foreground font-normal">
            date à venir, non fixée
          </Badge>
        ) : null}
        {!seDate ? (
          <Badge variant="outline" className="font-normal">
            en continu
          </Badge>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{CE_QUE_CA_ENGAGE[modality.usage]}</p>
      {modality.notes ? <p className="mt-2 text-sm">{modality.notes}</p> : null}

      {seDate && aVenir.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {aVenir.map((s) => (
            <DateRow key={s.id} session={s} />
          ))}
        </ul>
      ) : null}

      {seDate && passees.length > 0 ? (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-9 gap-1 px-2"
            aria-expanded={voirPassees}
            onClick={() => setVoirPassees((v) => !v)}
          >
            {voirPassees ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
            {passees.length} passée(s)
          </Button>
          {voirPassees ? (
            <ul className="mt-1.5 space-y-1.5">
              {passees.map((s) => (
                <DateRow key={s.id} session={s} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Ce qu'un QCM offre à l'étudiant : les fenêtres programmées (ouvertes,
 * à venir, passées) et, si l'équipe l'a permis, le compositeur de série.
 */
/**
 * LA LISTE DES DOSSIERS QU'ON PEUT JOUER MAINTENANT.
 *
 * Même mécanique que le QCM : la promotion a-t-elle cette modalité ouverte, et
 * sur quelle banque ? Mais la présentation diffère, parce que l'objet diffère —
 * un dossier n'est pas un tirage de questions, c'est un PATIENT. On les liste
 * donc nommément, avec leur item et leur nombre d'étapes : l'étudiant choisit
 * un cas, pas un paquet.
 *
 * ON NE MONTRE QUE LES DOSSIERS VALIDÉS. Un dossier encore en relecture n'a
 * rien à faire devant un étudiant : il le prendrait pour argent comptant.
 */
function CarteDossiers({
  modality,
  link,
}: {
  readonly modality: AssessmentModality;
  readonly link: CohortAssessmentLink | undefined;
}) {
  const data = useDataAccess();
  const { activeProgram } = useSession();
  const source = link?.questionSource ?? "";
  const ouvert = Boolean(link?.isOpen) && source !== "";

  const dossiers = useQuery({
    queryKey: ["mes-dossiers", activeProgram.id, source],
    enabled: ouvert,
    queryFn: () => data.assessments.listQuestionCases(activeProgram.id, source),
  });

  if (!ouvert) {
    return (
      <p className="text-muted-foreground mt-3 text-sm">
        Aucun dossier n'est ouvert pour votre promotion pour l'instant.
      </p>
    );
  }

  if (dossiers.isPending) {
    return <p className="text-muted-foreground mt-3 text-sm">Lecture des dossiers…</p>;
  }

  /*
   * LA SÉLECTION DE L'ÉQUIPE FAIT LOI (17/09). `servedCaseIds` absent veut dire
   * « tout le lot, personne n'a trié » ; un tableau VIDE veut dire « aucun », et
   * c'est un choix, pas un oubli. Confondre les deux servirait 21 dossiers à une
   * promotion qui n'en voulait aucun.
   */
  const servis = link?.servedCaseIds;
  const jouables = (dossiers.data ?? [])
    .filter((d) => d.validated)
    .filter((d) => servis === undefined || servis.includes(d.id));

  if (jouables.length === 0) {
    return (
      <p className="text-muted-foreground mt-3 text-sm">
        Aucun dossier validé dans cette banque pour l'instant.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-2">
      {jouables.map((dossier) => (
        <li
          key={dossier.id}
          className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-4 text-sm"
        >
          <div className="min-w-0 flex-1">
            <span className="font-medium">{dossier.title}</span>
            <span className="text-muted-foreground block text-xs">
              {dossier.itemCode ? `Item ${dossier.itemCode} · ` : ""}
              {dossier.steps} étape(s)
              {dossier.chapterTitle ? ` · ${dossier.chapterTitle}` : ""}
            </span>
          </div>
          <Button asChild size="sm" className="min-h-10 gap-1">
            <Link to="/espace/evaluations/dossier" search={{ caseId: dossier.id }}>
              <Play className="size-4" aria-hidden />
              Commencer
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function CarteQcm({
  modality,
  sessions,
  link,
  themes,
}: {
  readonly modality: AssessmentModality;
  readonly sessions: readonly AssessmentSession[];
  readonly link: CohortAssessmentLink | undefined;
  readonly themes: readonly OutcomeTheme[];
}) {
  const now = new Date();
  const ouvertes = sessions.filter((s) => windowState(s, now) === "open");
  const aVenir = sessions.filter((s) => windowState(s, now) === "upcoming");
  const passees = sessions.filter((s) => windowState(s, now) === "closed");
  const peutLancer = Boolean(link?.isOpen && link.questionSource);

  const decrire = (s: AssessmentSession) => {
    const c = s.config;
    if (!c) return "toute la banque";
    const noms = c.themeIds.map((id) => themes.find((t) => t.id === id)?.label).filter(Boolean);
    const items =
      c.sections && c.sections.length > 0
        ? `${c.sections.length} sous-item(s)`
        : c.chapters && c.chapters.length > 0
          ? `${c.chapters.length} item(s)`
          : noms.length === 0
            ? "toute la banque"
            : noms.length > 2
              ? `${noms.length} thèmes`
              : noms.join(", ");
    return [
      `${c.count} question(s)`,
      items,
      c.ranks.length > 0 ? `rang ${c.ranks.join("/")}` : "tous rangs",
    ].join(" · ");
  };

  return (
    <div className="mt-3 space-y-3">
      {ouvertes.length > 0 ? (
        <ul className="space-y-2">
          {ouvertes.map((s) => (
            <li
              key={s.id}
              className="border-primary/40 bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
            >
              <CalendarDays className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="font-medium">
                Ouverte jusqu'au {formatFrDate(s.closesOn ?? s.scheduledOn)}
              </span>
              <span className="text-muted-foreground text-xs">{decrire(s)}</span>
              {s.notes ? <span className="text-muted-foreground text-xs">· {s.notes}</span> : null}
              {peutLancer ? (
                <Button asChild size="sm" className="ml-auto min-h-10 gap-1">
                  <Link
                    to="/espace/evaluations/qcm"
                    search={{ modalityId: modality.id, sessionId: s.id }}
                  >
                    <Play className="size-4" aria-hidden />
                    Commencer
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {aVenir.length > 0 ? (
        <ul className="space-y-1.5">
          {aVenir.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
              <CalendarDays className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span>
                Du {formatFrDate(s.scheduledOn)}
                {s.closesOn ? ` au ${formatFrDate(s.closesOn)}` : ""}
              </span>
              <span className="text-muted-foreground text-xs">{decrire(s)}</span>
              <Badge variant="outline" className="font-normal">
                à venir
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {passees.length > 0 ? (
        <p className="text-muted-foreground text-xs">{passees.length} fenêtre(s) passée(s).</p>
      ) : null}

      {link?.freeAccess && peutLancer ? (
        <ComposerUneSerie modality={modality} themes={themes} />
      ) : null}

      {!link?.freeAccess && ouvertes.length === 0 && peutLancer ? (
        <p className="text-muted-foreground text-xs">
          Rien à lancer aujourd'hui : attendez la prochaine fenêtre.
        </p>
      ) : null}

      <MesResultatsQcm />
    </div>
  );
}

/** Ce que l'étudiant a fait jusqu'ici — ses propres agrégats, lus en base. */
function MesResultatsQcm() {
  const dataAccess = useDataAccess();
  const { activeEnrollment } = useSession();
  const enrollmentId = activeEnrollment?.id;
  const resultats = useQuery({
    queryKey: ["mes-resultats-qcm", enrollmentId],
    queryFn: () => dataAccess.assessments.myQuestionResults(enrollmentId ?? ""),
    enabled: Boolean(enrollmentId),
  });
  const r = resultats.data;
  if (!r || r.attempts === 0) return null;
  return (
    <p className="text-muted-foreground text-xs">
      Vous jusqu'ici : {r.attempts} réponse(s) sur {r.distinctQuestions} question(s)
      {r.avgScore !== undefined ? `, score EDN moyen ${Math.round(r.avgScore * 100)} %` : ""}
      {r.lastAnsweredAt ? ` · dernière le ${formatFrDate(r.lastAnsweredAt)}` : ""}.
    </p>
  );
}

/**
 * « JE M'ÉVALUE MAINTENANT » — l'étudiant compose sa série : thèmes, items,
 * sous-items, rangs (aucun = tous), nombre — le filtre est `FiltreQuestions`,
 * le même que l'équipe. Le compte disponible se lit avant de lancer, pour ne
 * pas demander 40 questions là où il y en a 12.
 */
function ComposerUneSerie({
  modality,
  themes,
}: {
  readonly modality: AssessmentModality;
  readonly themes: readonly OutcomeTheme[];
}) {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState<FiltreValeur>(FILTRE_VIDE);
  const [count, setCount] = useState(20);

  const liens = useQuery({
    queryKey: ["mes-liens", activeProgram.id],
    queryFn: () => data.assessments.listCohortAssessmentLinks(activeProgram.id),
  });
  const source = liens.data?.find(
    (l) => l.modalityId === modality.id && l.cohortId === activeEnrollment?.cohortId,
  )?.questionSource;

  const dispo = useQuery({
    queryKey: ["count-questions", activeProgram.id, source, cleFiltre(filtre)],
    queryFn: () =>
      source
        ? data.assessments.countQuestions({ programId: activeProgram.id, source, ...filtre })
        : Promise.resolve(0),
    enabled: ouvert && Boolean(source),
  });

  const n = dispo.data ?? null;
  const reel = n === null ? count : Math.min(count, n);

  if (!ouvert) {
    return (
      <Button type="button" className="min-h-11 gap-2" onClick={() => setOuvert(true)}>
        <Play className="size-4" aria-hidden />
        Je m'évalue maintenant
      </Button>
    );
  }

  return (
    <div className="border-border space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Composez votre série</p>

      {source ? (
        <FiltreQuestions
          programId={activeProgram.id}
          source={source}
          themes={themes}
          value={filtre}
          onChange={setFiltre}
          idPrefix={`me-${modality.id}`}
        />
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`me-n-${modality.id}`} className="text-xs">
            Nombre de questions
          </Label>
          <Input
            id={`me-n-${modality.id}`}
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            className="min-h-11 w-28"
          />
        </div>
        <span className="text-muted-foreground pb-3 text-xs">
          {n === null ? "…" : n === 0 ? "aucune question avec ce filtre" : `${n} disponible(s)`}
          {n !== null && n > 0 && reel < count ? ` — la série en aura ${reel}` : ""}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild className="min-h-11 gap-2" disabled={n === 0}>
          <Link
            to="/espace/evaluations/qcm"
            search={{
              modalityId: modality.id,
              ...(filtre.themeIds.length > 0 ? { themeIds: filtre.themeIds } : {}),
              ...(filtre.chapters.length > 0 ? { chapters: filtre.chapters } : {}),
              ...(filtre.sections.length > 0 ? { sections: filtre.sections } : {}),
              ...(filtre.ranks.length > 0 ? { ranks: filtre.ranks } : {}),
              count: reel,
            }}
          >
            <Play className="size-4" aria-hidden />
            Lancer {reel} question(s)
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setOuvert(false)}
        >
          Annuler
        </Button>
      </div>
    </div>
  );
}

export function MesEvaluations() {
  const { data, isPending, isError } = useMesEvaluations();

  const { quandJeVeux, programmees } = useMemo(() => {
    const list = data?.modalities ?? [];
    return {
      quandJeVeux: list.filter((m) => !usageSeDate(m.usage)),
      programmees: [...list.filter((m) => usageSeDate(m.usage))].sort((a, b) => {
        // Ce qui engage le plus en premier ; à usage égal, l'ordre du nom.
        const rang: Record<AssessmentUsage, number> = {
          certification: 0,
          validation_exam: 1,
          formative: 2,
          self_assessment: 3,
        };
        return rang[a.usage] - rang[b.usage] || a.name.localeCompare(b.name, "fr");
      }),
    };
  }, [data]);

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (isError || !data) {
    return <Vide>Impossible de lire vos évaluations pour l'instant.</Vide>;
  }

  const sessions = data.sessions;
  const prochaines = sessions
    .filter((s) => sessionState(s, new Date()) === "upcoming")
    .sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn));

  return (
    <div className="space-y-6">
      {data.modalities.length === 0 ? (
        <Panneau
          title="Vos évaluations"
          description="Ce que votre promotion rencontrera pendant le stage."
        >
          <Vide>Pas d'évaluation ou auto-évaluation programmée dans votre parcours.</Vide>
        </Panneau>
      ) : (
        <>
          {prochaines.length > 0 ? (
            <Panneau
              title="Prochaines échéances"
              description="Les épreuves datées à venir pour votre promotion, dans l'ordre."
            >
              <ul className="space-y-1.5">
                {prochaines.map((s) => {
                  const m = data.modalities.find((x) => x.id === s.modalityId);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <CalendarDays className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <span className="font-medium">{formatFrDate(s.scheduledOn)}</span>
                      <span>{m?.name ?? "Épreuve"}</span>
                      {m ? (
                        <Badge variant="outline" className="font-normal">
                          {ASSESSMENT_USAGE_LABELS_FR[m.usage]}
                        </Badge>
                      ) : null}
                      {s.location ? (
                        <span className="text-muted-foreground text-xs">· {s.location}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Panneau>
          ) : null}

          <Panneau
            title="Quand vous voulez"
            description="En continu, du début à la fin du stage. Rien n'est retenu contre vous."
          >
            {quandJeVeux.length === 0 ? (
              <Vide>Aucune auto-évaluation prévue pour votre promotion.</Vide>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {quandJeVeux.map((m) => (
                  <CarteModalite
                    key={m.id}
                    modality={m}
                    sessions={sessions}
                    link={data.links.find((l) => l.modalityId === m.id)}
                    themes={data.themes}
                  />
                ))}
              </ul>
            )}
          </Panneau>

          <Panneau
            title="Programmé pour vous"
            description="Ce qu'on vous demande, et ce qui valide votre stage — avec les dates dès qu'elles sont fixées."
          >
            {programmees.length === 0 ? (
              <Vide>Aucune épreuve programmée pour votre promotion.</Vide>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {programmees.map((m) => (
                  <CarteModalite
                    key={m.id}
                    modality={m}
                    sessions={sessions}
                    link={data.links.find((l) => l.modalityId === m.id)}
                    themes={data.themes}
                  />
                ))}
              </ul>
            )}
          </Panneau>
        </>
      )}

      {/*
        L'annonce de l'ECOS ne s'affiche que s'il y a quelque chose à annoncer :
        les stations sont celles que l'équipe a mises à disposition (16/09).
      */}
      {ecosStationsOffertes(data.modalities, data.links).length > 0 ? (
        <p className={EYEBROW}>ECOS virtuel — à jouer depuis le hub</p>
      ) : null}
    </div>
  );
}
