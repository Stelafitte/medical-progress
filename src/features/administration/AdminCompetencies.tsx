/**
 * « Compétences » — savoir-faire à acquérir en stage ou en simulation :
 * référentiel, import, et suivi nominatif de l'acquisition par cohorte.
 * Le suivi affiché est une maquette déterministe (aucune donnée réelle).
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { personNameFor, useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import {
  buildCompetenceCoverage,
  buildLearnerCompetenceRows,
  competenceOutcomes,
  parseReferentialText,
} from "@/features/administration/competenceTrackingViewModel";
import { NATURE_LABELS_FR } from "@/domain/mastery";
import { CompetenceCreationForm } from "@/features/administration/CompetenceCreationForm";
import { createLocalCompetence, useLocalCompetences } from "@/application/competenceDraftStore";
import {
  COMPETENCE_MASTERY_LABELS_FR,
  EMPTY_NEW_COMPETENCE_INPUT,
  mergeOutcomes,
  type CompetenceNature,
} from "@/domain/competenceDraft";
import type { CurriculumVersionId, ProgramId } from "@/domain/types";

export function AdminCompetencies() {
  const { data, isPending } = useProgramAdmin();
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const localCompetences = useLocalCompetences(data?.program?.id);

  const cohorts = data?.cohorts ?? [];
  const selectedId = cohortId ?? defaultPilotCohortId(cohorts);
  const enrollments = (data?.enrollments ?? []).filter((e) => e.cohortId === selectedId);
  /** Liste UNIQUE : compétences du dépôt et compétences créées dans la session. */
  const outcomes = useMemo(
    () => mergeOutcomes(data?.outcomes ?? [], localCompetences),
    [data?.outcomes, localCompetences],
  );
  const programId = (data?.program?.id ?? "program-unknown") as ProgramId;
  const curriculumVersionId = (data?.versions[0]?.id ?? "cv-unknown") as CurriculumVersionId;

  const learnerRows = useMemo(
    () => buildLearnerCompetenceRows(enrollments, outcomes),
    [enrollments, outcomes],
  );
  const coverage = useMemo(
    () => buildCompetenceCoverage(enrollments, outcomes),
    [enrollments, outcomes],
  );
  const parsed = useMemo(() => parseReferentialText(importText), [importText]);
  /** Seules les lignes de nature compétence peuvent rejoindre ce référentiel. */
  const importable = useMemo(
    () =>
      parsed.filter(
        (row) => row.nature === "simulated_competence" || row.nature === "real_competence",
      ),
    [parsed],
  );

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const scoped = competenceOutcomes(outcomes);
  const simulated = scoped.filter((o) => o.nature === "simulated_competence");
  const real = scoped.filter((o) => o.nature === "real_competence");
  const averagePercent =
    learnerRows.length === 0
      ? 0
      : Math.round(learnerRows.reduce((n, r) => n + r.percent, 0) / learnerRows.length);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Compétences"
        level={1}
        action={<MockBadge />}
        description="Savoir-faire à acquérir en stage ou en simulation, référentiel importable et suivi nominatif d'acquisition."
      />

      <ScopeNotice>
        Une compétence en situation réelle ne peut jamais être déclarée acquise par l'apprenant
        seul : la validation par un tiers habilité est obligatoire. Les états affichés ici sont
        simulés de façon déterministe.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={NATURE_LABELS_FR.simulated_competence} value={simulated.length} />
        <StatCard label={NATURE_LABELS_FR.real_competence} value={real.length} />
        <StatCard label="Apprenants suivis" value={enrollments.length} />
        <StatCard label="Acquisition moyenne" value={`${averagePercent} %`} />
      </div>

      <Tabs defaultValue="referentiel" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="referentiel" className="min-h-11 flex-none text-xs sm:text-sm">
            Référentiel
          </TabsTrigger>
          <TabsTrigger value="suivi" className="min-h-11 flex-none text-xs sm:text-sm">
            Suivi d'acquisition
          </TabsTrigger>
          <TabsTrigger value="import" className="min-h-11 flex-none text-xs sm:text-sm">
            Import d'un référentiel
          </TabsTrigger>
        </TabsList>

        <TabsContent value="referentiel" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {(["simulated_competence", "real_competence"] as const).map((nature) => {
              const list = scoped.filter((o) => o.nature === nature);
              return (
                <PanelCard
                  key={nature}
                  title={NATURE_LABELS_FR[nature]}
                  description={`${list.length} compétence(s) configurée(s)`}
                >
                  <ul className="space-y-1 text-sm">
                    {list.map((outcome) => (
                      <li key={outcome.id} className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {outcome.code}
                        </Badge>
                        <span>{outcome.label}</span>
                        <span className="text-muted-foreground text-xs">
                          cible {COMPETENCE_MASTERY_LABELS_FR[outcome.targetMastery]}
                        </span>
                        {localCompetences.some((local) => local.id === outcome.id) ? (
                          <Badge variant="outline" className="font-normal">
                            créée dans cette session
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                    {list.length === 0 ? (
                      <li className="text-muted-foreground">Aucune compétence.</li>
                    ) : null}
                  </ul>
                </PanelCard>
              );
            })}
          </div>

          <PanelCard
            title="Créer une compétence"
            description="Le même outil de création est disponible ici et dans le « Concepteur de programme » : la liste est unique."
            action={<MockBadge />}
          >
            <CompetenceCreationForm
              programId={programId}
              curriculumVersionId={curriculumVersionId}
              idPrefix="competences-tab"
              submitLabel="Créer la compétence"
              hint="La compétence rejoint la liste unique : elle est aussitôt proposée dans le « Concepteur de programme »."
            />
          </PanelCard>

          <PanelCard
            title="Là où ces compétences se travaillent et se prouvent"
            description="Une compétence se prouve en stage, en simulation ou lors d'une évaluation : les modalités se règlent dans les onglets dédiés."
          >
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/espace/administration/stages">
                  Terrains de stage et validation
                  <ArrowRight className="ms-1 size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/espace/administration/evaluations">
                  Évaluations et ECOS
                  <ArrowRight className="ms-1 size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/espace/administration/pilotage">
                  Suivi par promotion dans Pilotage
                  <ArrowRight className="ms-1 size-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </PanelCard>
        </TabsContent>

        <TabsContent value="suivi" className="space-y-6">
          <CohortSelector cohorts={cohorts} value={selectedId} onChange={setCohortId} />

          <PanelCard
            title="Acquisition par apprenant"
            description="Validations obtenues, déclarations en attente et compétences non commencées."
          >
            {learnerRows.length === 0 ? (
              <EmptyState>Aucun apprenant inscrit dans cette cohorte.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Apprenant</TableHead>
                      <TableHead className="text-right">Validées</TableHead>
                      <TableHead className="text-right">En attente</TableHead>
                      <TableHead className="text-right">Non commencées</TableHead>
                      <TableHead className="w-40">Avancement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {learnerRows.map((row) => (
                      <TableRow key={row.enrollmentId}>
                        <TableCell className="font-medium">
                          {personNameFor(data, row.enrollmentId)}
                        </TableCell>
                        <TableCell className="text-right">{row.validated}</TableCell>
                        <TableCell className="text-right">{row.declared}</TableCell>
                        <TableCell className="text-right">{row.notStarted}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Progress value={row.percent} />
                            <span className="text-muted-foreground text-xs">{row.percent} %</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </PanelCard>

          <PanelCard
            title="Couverture par compétence"
            description="Repérer les savoir-faire que la cohorte n'acquiert pas."
          >
            {coverage.length === 0 ? (
              <EmptyState>Aucune compétence à suivre.</EmptyState>
            ) : (
              <ul className="space-y-2 text-sm">
                {[...coverage]
                  .sort((a, b) => a.percent - b.percent)
                  .map((row) => (
                    <li key={row.outcomeId} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {row.code}
                        </Badge>
                        <span>{row.label}</span>
                        <span className="text-muted-foreground text-xs">
                          {row.validatedLearners} validées · {row.declaredLearners} en attente
                        </span>
                      </div>
                      <Progress value={row.percent} />
                    </li>
                  ))}
              </ul>
            )}
          </PanelCard>
        </TabsContent>

        <TabsContent value="import" className="space-y-6">
          <PanelCard
            title="Importer un référentiel de compétences"
            description="Collez un tableau CSV/TSV : code, intitulé, nature (connaissance, simulation, réelle). Analyse locale uniquement."
            action={<MockBadge />}
          >
            <Textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              rows={6}
              placeholder={"C-12;Coupe parasternale grand axe;simulation\nC-13;Mesure du VTI;réelle"}
              aria-label="Référentiel à importer"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{parsed.length} ligne(s) reconnue(s)</Badge>
              <Badge variant="outline">{importable.length} compétence(s) importable(s)</Badge>
              <Button
                size="sm"
                className="min-h-11"
                disabled={importable.length === 0}
                onClick={() => {
                  let added = 0;
                  for (const row of importable) {
                    const outcome = createLocalCompetence({
                      input: {
                        ...EMPTY_NEW_COMPETENCE_INPUT,
                        code: row.code,
                        label: row.label,
                        nature: row.nature as CompetenceNature,
                      },
                      programId,
                      curriculumVersionId,
                    });
                    if (outcome) added += 1;
                  }
                  setImported(added);
                  setImportText("");
                }}
              >
                Importer {importable.length} compétence(s)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11"
                onClick={() => setImportText("")}
              >
                Effacer
              </Button>
              {imported !== null ? (
                <span className="text-muted-foreground text-sm">
                  {imported} compétence(s) ajoutée(s) au référentiel de cette session.
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Les lignes de nature « connaissance » ou non précisée sont ignorées : elles relèvent de
              l'onglet « Base de connaissances ».
            </p>
            {parsed.length > 0 ? (
              <ul className="mt-4 space-y-1 text-sm">
                {parsed.slice(0, 12).map((row, index) => (
                  <li key={`${row.code}-${index}`} className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {row.code}
                    </Badge>
                    <span>{row.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {row.nature === "unknown" ? "nature à préciser" : NATURE_LABELS_FR[row.nature]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </PanelCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
