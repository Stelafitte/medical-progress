import { useMemo, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { aConfirmer, learnerName, useSupervision } from "@/features/supervision/useSupervision";

/**
 * Mes étudiants.
 *
 * DEUX RENDUS POUR UNE SEULE DONNEE (10/09) : le tableau obligeait à faire
 * défiler horizontalement pour atteindre « Ouvrir », ce qui rend le bouton
 * introuvable au téléphone -- et les tests de Stef se font au téléphone ou sur
 * tablette. Sous 640 px on passe donc en cartes, chaque carte portant son
 * bouton pleine largeur. Au-dessus, le tableau reste : il compare mieux.
 */
export function SupervisionStudents() {
  const { data, isPending } = useSupervision();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.enrollments
      .map((enrollment) => ({
        enrollment,
        name: learnerName(data, enrollment.id),
        assignment: data.assignments.find((a) => a.enrollmentId === enrollment.id),
        confirmations: aConfirmer(data, enrollment.id),
        logs: data.logsToValidate.filter((l) => l.enrollmentId === enrollment.id).length,
      }))
      .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()));
  }, [data, query]);

  if (isPending || !data) return <Skeleton className="h-72 w-full" />;

  const detail = rows.find((r) => r.enrollment.id === selected) ?? null;
  const terrain = (enrollmentId: string) => {
    const affectation = data.assignments.find((a) => a.enrollmentId === enrollmentId);
    return data.placements.find((p) => p.id === affectation?.placementId)?.name ?? "—";
  };

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Mes étudiants"
        level={1}
        description="Fiche synthétique par étudiant : progression, activité de stage et dernier contact."
      />

      <ScopeNotice>
        Seuls les étudiants affectés à vos stages apparaissent ici. Aucun accès aux autres étudiants
        de la promotion.
      </ScopeNotice>

      <div className="max-w-sm">
        <label htmlFor="filtre-etudiants" className="mb-1 block text-sm font-medium">
          Filtrer par nom
        </label>
        <Input
          id="filtre-etudiants"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom de l'étudiant"
        />
      </div>

      {rows.length === 0 ? (
        <div className="surface-panel">
          <EmptyState>Aucun étudiant ne correspond au filtre.</EmptyState>
        </div>
      ) : (
        <>
          {/* TELEPHONE : une carte par étudiant, bouton pleine largeur. */}
          <ul className="space-y-3 sm:hidden">
            {rows.map((row) => (
              <li key={row.enrollment.id} className="surface-panel space-y-3 p-4">
                <div className="space-y-1">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-muted-foreground">{terrain(row.enrollment.id)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="font-normal">
                    {row.logs} carnet(s) à décider
                  </Badge>
                  <Badge variant="secondary" className="font-normal">
                    {row.confirmations} compétence(s) à confirmer
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setSelected(row.enrollment.id)}
                >
                  Ouvrir la fiche
                </Button>
              </li>
            ))}
          </ul>

          {/* TABLETTE ET PC : le tableau, qui compare mieux. */}
          <div className="surface-panel hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Étudiant</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Carnets à décider</TableHead>
                  <TableHead className="text-right">Compétences à confirmer</TableHead>
                  <TableHead className="text-right">Fiche</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.enrollment.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{terrain(row.enrollment.id)}</TableCell>
                    <TableCell className="text-right">{row.logs}</TableCell>
                    <TableCell className="text-right">{row.confirmations}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected(row.enrollment.id)}
                      >
                        Ouvrir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {detail ? (
        <PanelCard
          title={`Fiche — ${detail.name}`}
          description="Synthèse d'encadrement."
          action={
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Fermer
            </Button>
          }
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Stage</dt>
              <dd>{terrain(detail.enrollment.id)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Activité de stage</dt>
              <dd>{detail.logs} carnet(s) soumis à décider.</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Compétences réelles</dt>
              <dd>
                {detail.confirmations} en attente de votre confirmation — aucune acquisition sans
                validation humaine.
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Connaissances</dt>
              <dd>Progression suivie dans le passeport de l'étudiant.</dd>
            </div>
          </dl>
        </PanelCard>
      ) : null}
    </div>
  );
}
