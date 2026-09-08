import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useSession } from "@/application/session";
import { FieldHeader } from "@/components/field-header";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS_FR, rolesInContext } from "@/domain/roles";
import * as fx from "@/infrastructure/mock/fixtures";
import { initials } from "@/lib/initials";
import { AccountSecuritySection } from "./AccountSecuritySection";
import { IdentityForm } from "./IdentityForm";
import { PassportVisibilitySection } from "./PassportVisibilitySection";

export function ProfileView() {
  const { person, programs, enrollments, roles, isSimulated, reloadSession } = useSession();

  const memberships = programs
    .map((program) => {
      const enrollment = enrollments.find((e) => e.programId === program.id);
      const cohort = enrollment ? fx.cohorts.find((c) => c.id === enrollment.cohortId) : undefined;
      const contextualRoles = rolesInContext(roles, {
        programId: program.id,
        ...(cohort ? { cohortId: cohort.id } : {}),
      });

      return { program, cohort, enrollment, contextualRoles };
    })
    .filter((m) => m.enrollment || m.contextualRoles.length > 0);

  return (
    <div className="space-y-7">
      {/*
        LE PLUS SOBRE DES HUIT ONGLETS — resister a la tentation de le decorer.
        Le bandeau porte l'identite et rien d'autre : aucun chiffre ne dit quoi
        que ce soit d'utile sur un profil.
      */}
      <FieldHeader eyebrow={person.email} title={person.fullName} />

      {/* LA CARTE D'IDENTITE, SOULEVEE SUR LE BANDEAU comme la carte de
        synthese du Passeport et celle de la vue d'ensemble. */}
      <section className="-mt-[38px] overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-4 px-4 pb-3.5 pt-4">
          <span
            aria-hidden
            className="hero-gradient grid size-14 shrink-0 place-items-center rounded-full text-lg font-semibold text-primary-foreground"
          >
            {initials(person.fullName)}
          </span>
          <div className="min-w-0">
            <p className="font-display text-[19px] leading-tight tracking-[-0.015em]">
              {person.fullName}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {isSimulated
                ? "Compte simulé — aucune donnée réelle"
                : "Compte connecté — données Supabase"}
            </p>
          </div>
          {/*
            LE STATUT PASSE DE LA PASTILLE A L'ETIQUETTE. « Simulé » dans une
            boite bordee pesait autant que le nom de la personne, juste a cote.
          */}
          <span className={`${EYEBROW} ms-auto text-muted-foreground`} style={TABULAIRE}>
            {isSimulated ? "Simulé" : "Connecté"}
          </span>
        </div>

        <div className="grid gap-6 border-t px-4 pb-4 pt-4 md:grid-cols-2">
          <div className="space-y-3">
            <p className={`${EYEBROW} text-muted-foreground`}>Mes informations</p>
            {isSimulated ? (
              <>
                <Button type="button" variant="outline" disabled className="justify-start">
                  <Lock className="size-4" aria-hidden />
                  Modifier ma fiche
                </Button>
                <p className="text-[12.5px] text-muted-foreground">
                  Indisponible en session simulée : aucune fiche réelle derrière ce compte.
                </p>
              </>
            ) : (
              <IdentityForm
                initialFullName={person.fullName}
                email={person.email}
                submitLabel="Enregistrer ma fiche"
                onSaved={reloadSession}
              />
            )}
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="profil-langue"
              className="block text-[12.5px] font-normal text-muted-foreground"
            >
              Langue de l'interface
            </Label>
            <p
              id="profil-langue"
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            >
              Français (fr-FR)
            </p>
            <p className="text-[12.5px] text-muted-foreground">
              Préférence unique dans cette itération.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="titre-appartenances">
        {/* LE CHAPEAU « Roles contextualises du compte, en lecture seule »
          SAUTE : la liste le montre d'elle-meme, rien n'y est modifiable. */}
        <h2
          id="titre-appartenances"
          className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]"
        >
          Programmes, cohortes et rôles
        </h2>
        {memberships.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Aucun programme rattaché à ce compte.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {memberships.map(({ program, cohort, enrollment, contextualRoles }) => (
              <li
                key={program.id}
                className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]"
              >
                <p className={`${EYEBROW} text-muted-foreground`} style={TABULAIRE}>
                  {program.code}
                </p>
                <p className="mt-1.5 font-display text-[16.5px] leading-tight tracking-[-0.01em]">
                  {program.name}
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {cohort ? cohort.label : "Aucune cohorte rattachée"}
                  {enrollment ? ` · inscription ${enrollment.status}` : ""}
                </p>
                <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
                  {contextualRoles.length > 0
                    ? contextualRoles.map((role) => ROLE_LABELS_FR[role]).join(" · ")
                    : "Aucun rôle"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccountSecuritySection />

      <PassportVisibilitySection />

      <p className="text-[12.5px] text-muted-foreground">
        Pour votre progression dans le programme sélectionné, ouvrez{" "}
        <Link to="/espace/passeport" className="font-medium text-primary underline">
          Mon Passeport Éducatif
        </Link>
        .
      </p>
    </div>
  );
}
