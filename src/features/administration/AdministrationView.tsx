import { useQuery } from "@tanstack/react-query";
import { useDataAccess } from "@/application/session";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StageLogTemplatesSection } from "@/features/administration/StageLogTemplatesSection";
import { StageLogsReceived } from "@/features/stage/StageLogReviewSection";


export function AdministrationView() {
  const data = useDataAccess();
  const { data: result, isPending } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const programs = await data.programs.listPrograms();
      const cohorts = await data.programs.listCohorts();
      const versions = (
        await Promise.all(programs.map((p) => data.programs.listCurriculumVersions(p.id)))
      ).flat();
      return { programs, cohorts, versions };
    },
  });

  if (isPending || !result) return <Skeleton className="h-80 w-full" />;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Administration"
        level={1}
        description="Un seul moteur, plusieurs programmes configurés. Lecture seule dans cette itération."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {result.programs.map((program) => (
          <Card key={program.id}>
            <CardHeader>
              <Badge variant="secondary" className="w-fit font-mono text-xs">
                {program.code}
              </Badge>
              <CardTitle className="text-base">{program.name}</CardTitle>
              <CardDescription>
                {program.institution} · ≈ {program.annualLearnerEstimate} apprenants/an
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">
                Stages : {program.config.placementsEnabled ? "activés" : "désactivés"}
              </Badge>
              <Badge variant="outline">
                Simulation : {program.config.simulationEnabled ? "activée" : "désactivée"}
              </Badge>
              <Badge variant="outline">Validation humaine obligatoire</Badge>
              <Badge variant="outline">
                {result.versions.filter((v) => v.programId === program.id).length} référentiel(s)
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <section aria-labelledby="titre-cohortes">
        <SectionHeading id="titre-cohortes" title="Cohortes" />
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cohorte</TableHead>
                <TableHead>Programme</TableHead>
                <TableHead>Année</TableHead>
                <TableHead className="text-right">Apprenants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.cohorts.map((cohort) => (
                <TableRow key={cohort.id}>
                  <TableCell className="font-medium">{cohort.label}</TableCell>
                  <TableCell>
                    {result.programs.find((p) => p.id === cohort.programId)?.name}
                  </TableCell>
                  <TableCell>{cohort.academicYear}</TableCell>
                  <TableCell className="text-right">{cohort.learnerCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <StageLogTemplatesSection />

      <StageLogsReceived />
    </div>
  );
}

