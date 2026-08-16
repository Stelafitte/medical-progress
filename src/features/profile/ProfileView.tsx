import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useSession } from "@/application/session";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS_FR, rolesInContext } from "@/domain/roles";
import * as fx from "@/infrastructure/mock/fixtures";

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter((part) => /\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function ProfileView() {
  const { person, programs, enrollments, roles } = useSession();

  const memberships = programs
    .map((program) => {
      const enrollment = enrollments.find((e) => e.programId === program.id);
      const cohort = enrollment
        ? fx.cohorts.find((c) => c.id === enrollment.cohortId)
        : undefined;
      const contextualRoles = rolesInContext(roles, {
        programId: program.id,
        cohortId: cohort?.id,
      });
      return { program, cohort, enrollment, contextualRoles };
    })
    .filter((m) => m.enrollment || m.contextualRoles.length > 0);

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Mon profil"
        level={1}
        description="Identité globale du compte. Votre parcours dans un programme donné reste dans Mon cursus."
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <span
              aria-hidden
              className="grid size-14 place-items-center rounded-full hero-gradient text-lg font-semibold text-primary-foreground"
            >
              {initials(person.fullName)}
            </span>
            <div>
              <CardTitle className="text-lg">{person.fullName}</CardTitle>
              <CardDescription>Compte simulé — aucune donnée réelle</CardDescription>
            </div>
            <Badge variant="outline" className="ms-auto">
              Simulé
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="profil-email">Adresse e-mail</Label>
            <p
              id="profil-email"
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            >
              {person.email}
            </p>
            <p className="text-xs text-muted-foreground">Lecture seule.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="profil-langue">Langue de l'interface</Label>
            <p
              id="profil-langue"
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            >
              Français (fr-FR)
            </p>
            <p className="text-xs text-muted-foreground">
              Préférence unique dans cette itération.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button type="button" disabled variant="outline">
              <Lock className="size-4" aria-hidden />
              Modifier mon profil — Disponible après activation du compte
            </Button>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="titre-appartenances">
        <SectionHeading
          id="titre-appartenances"
          title="Programmes, cohortes et rôles"
          description="Rôles contextualisés du compte, en lecture seule."
        />
        <ul className="grid gap-4 md:grid-cols-2">
          {memberships.map(({ program, cohort, enrollment, contextualRoles }) => (
            <li key={program.id}>
              <Card className="h-full">
                <CardHeader>
                  <Badge variant="secondary" className="w-fit font-mono text-xs">
                    {program.code}
                  </Badge>
                  <CardTitle className="text-base">{program.name}</CardTitle>
                  <CardDescription>
                    {cohort ? cohort.label : "Aucune cohorte rattachée"}
                    {enrollment ? ` · inscription ${enrollment.status}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {contextualRoles.length > 0 ? (
                    contextualRoles.map((role) => (
                      <Badge key={role} variant="outline">
                        {ROLE_LABELS_FR[role]}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Aucun rôle</span>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun programme rattaché à ce compte.
          </p>
        ) : null}
      </section>

      <p className="text-sm text-muted-foreground">
        Pour votre progression dans le programme sélectionné, ouvrez{" "}
        <Link to="/espace/passeport" className="underline">
          Mon Passeport Éducatif Médical
        </Link>
        .
      </p>
    </div>
  );
}
