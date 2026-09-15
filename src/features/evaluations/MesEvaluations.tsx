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
import { CalendarDays, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { useDataAccess, useSession } from "@/application/session";
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

const CE_QUE_CA_ENGAGE: Record<AssessmentUsage, string> = {
  self_assessment: "Vous vous y exercez quand vous voulez. Rien n'est retenu contre vous.",
  formative: "Passage attendu, résultat commenté, sans effet sur la validation du stage.",
  validation_exam: "Le passage conditionne la validation de votre stage.",
  certification: "Épreuve certifiante, au-delà du stage.",
};

const EYEBROW = "text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase";

function useMesEvaluations() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();
  const cohortId = activeEnrollment?.cohortId ?? null;
  return useQuery({
    queryKey: ["mes-evaluations", activeProgram.id, cohortId],
    queryFn: async () => {
      const [modalities, sessions, links] = await Promise.all([
        data.assessments.listAssessmentModalities(activeProgram.id),
        data.assessments.listAssessmentSessions(activeProgram.id),
        data.assessments.listCohortAssessmentLinks(activeProgram.id),
      ]);
      /*
       * La RLS a déjà borné à mes promotions. On reborne à MA promotion active
       * par prudence : un étudiant réinscrit d'une année sur l'autre a deux
       * inscriptions, et son écran doit parler de celle en cours.
       */
      const miennes = new Set(
        links.filter((l) => cohortId === null || l.cohortId === cohortId).map((l) => l.modalityId),
      );
      return {
        modalities: modalities.filter((m) => miennes.has(m.id)),
        sessions: sessions.filter((s) => cohortId === null || s.cohortId === cohortId),
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
      {session.notes ? <span className="text-muted-foreground text-xs">· {session.notes}</span> : null}
      <Badge variant={passee ? "outline" : "secondary"} className="font-normal">
        {passee ? "passée" : "à venir"}
      </Badge>
    </li>
  );
}

function CarteModalite({
  modality,
  sessions,
}: {
  readonly modality: AssessmentModality;
  readonly sessions: readonly AssessmentSession[];
}) {
  const [voirPassees, setVoirPassees] = useState(false);
  const miennes = sessions
    .filter((s) => s.modalityId === modality.id)
    .sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn));
  const aVenir = miennes.filter((s) => sessionState(s, new Date()) === "upcoming");
  const passees = miennes.filter((s) => sessionState(s, new Date()) === "completed");
  const seDate = usageSeDate(modality.usage);

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
            {voirPassees ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
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
    return <EmptyState>Impossible de lire vos évaluations pour l'instant.</EmptyState>;
  }

  const sessions = data.sessions;
  const prochaines = sessions
    .filter((s) => sessionState(s, new Date()) === "upcoming")
    .sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn));

  return (
    <div className="space-y-6">
      {data.modalities.length === 0 ? (
        <PanelCard title="Vos évaluations" description="Ce que votre promotion rencontrera pendant le stage.">
          <EmptyState>
            Votre équipe pédagogique n'a pas encore défini d'évaluation pour votre promotion.
            L'ECOS virtuel ci-dessous reste ouvert.
          </EmptyState>
        </PanelCard>
      ) : (
        <>
          {prochaines.length > 0 ? (
            <PanelCard
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
            </PanelCard>
          ) : null}

          <PanelCard
            title="Quand vous voulez"
            description="En continu, du début à la fin du stage. Rien n'est retenu contre vous."
          >
            {quandJeVeux.length === 0 ? (
              <EmptyState>Aucune auto-évaluation prévue pour votre promotion.</EmptyState>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {quandJeVeux.map((m) => (
                  <CarteModalite key={m.id} modality={m} sessions={sessions} />
                ))}
              </ul>
            )}
          </PanelCard>

          <PanelCard
            title="Programmé pour vous"
            description="Ce qu'on vous demande, et ce qui valide votre stage — avec les dates dès qu'elles sont fixées."
          >
            {programmees.length === 0 ? (
              <EmptyState>Aucune épreuve programmée pour votre promotion.</EmptyState>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {programmees.map((m) => (
                  <CarteModalite key={m.id} modality={m} sessions={sessions} />
                ))}
              </ul>
            )}
          </PanelCard>
        </>
      )}

      <p className={EYEBROW}>ECOS virtuel — à jouer depuis le hub</p>
    </div>
  );
}
