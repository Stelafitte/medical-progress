import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, HeartPulse, Mail, Menu, RotateCcw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useUnreadMessages } from "@/features/messages/useUnreadMessages";
import { HeaderSearch } from "@/components/layout/header-search";
import { ProgramSwitcher } from "@/components/program-switcher";
import { isRouteWithinSpaces, landingRouteFor, navSpacesFor } from "@/components/layout/navigation";
import { useSession } from "@/application/session";
import { initials } from "@/lib/initials";
import { ROLE_LABELS_FR, roleAssignmentKey } from "@/domain/roles";
import { IS_DEV } from "@/lib/env";
import type { PersonId, Program, RoleAssignment } from "@/domain/types";

const linkClass =
  "flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";
const activeClass = { className: "bg-secondary text-secondary-foreground" };

/** Libellé de démonstration affiché à côté de chaque identité simulée. */
const DEMO_PROFILE_HINTS: Record<string, string> = {
  "per-learner": "apprenant DIU et DFASM",
  "per-learner-2": "apprenant DIU",
  "per-supervisor": "responsable de stage DIU",
  "per-supervisor-2": "responsable de stage DFASM",
  "per-teacher": "enseignant DIU",
  "per-admin": "administrateur des deux programmes",
  "per-platform-admin": "administrateur plateforme",
};

/** Libellé lisible d'une assignation de rôle réelle, pour le sélecteur "voir en tant que". */
function roleAssignmentLabel(role: RoleAssignment, programs: readonly Program[]): string {
  const base = ROLE_LABELS_FR[role.role];
  if (role.scope.kind === "platform") return `${base} — Plateforme`;
  const program = programs.find((p) => "programId" in role.scope && p.id === role.scope.programId);
  const programLabel = program?.name ?? "programme inconnu";
  if (role.scope.kind === "program") return `${base} — ${programLabel}`;
  if (role.scope.kind === "cohort") return `${base} — ${programLabel} (cohorte)`;
  return `${base} — ${programLabel} (stage)`;
}

export function AppShell() {
  const {
    person,
    people,
    programs,
    setActivePersonId,
    resetDemoSession,
    signOut,
    roles,
    rolesForAccess,
    activeRole,
    setActiveRole,
    rolesInActiveProgram,
    activeProgram,
    isSimulated,
  } = useSession();

  const [mobileOpen, setMobileOpen] = useState(false);
  /** Demande de recalage vers la première page accessible du nouveau profil. */
  const [pendingLanding, setPendingLanding] = useState(false);
  const navigate = useNavigate();

  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Périmètre plateforme : « Tous les programmes ». Aucun programme n'est le
  // périmètre courant, donc le bandeau programme est retiré. À l'inverse, dès
  // qu'un programme est ouvert, le bandeau plateforme disparaît.
  const isPlatformScope =
    pathname.startsWith("/espace/programmes") || pathname.startsWith("/espace/plateforme");

  // navSpacesFor doit refléter le RÔLE ACTIF ("voir en tant que"), jamais
  // l'union de tous les rôles réels de la personne — sinon la navigation
  // affiche tous les espaces (apprenant + encadrant + admin) simultanément,
  // même quand un seul rôle est sélectionné.
  const allSpaces = navSpacesFor(
    rolesForAccess,
    activeProgram.id,
    activeProgram.config,
    activeProgram.code,
  );
  const spaces = isPlatformScope
    ? allSpaces.filter((space) => space.key === "platform_admin")
    : allSpaces.filter((space) => space.key !== "platform_admin");

  /*
   * « MON PROFIL » N'EST DANS AUCUNE NAVIGATION SAUF `LEARNER_NAV`.
   *
   * Le bloc de pied du menu mobile l'ajoutait donc pour tout le monde : sans
   * lui, un administrateur de programme n'aurait aucun acces a sa fiche. Mais
   * chez l'APPRENANT il faisait doublon — l'entree de `LEARNER_NAV` puis le
   * bloc de pied, deux fois « Mon profil » dans le meme menu (constate par
   * Stef le 10/09).
   *
   * On garde donc le bloc, et on ne l'ajoute que si aucune entree visible n'y
   * mene deja. Retirer l'entree de `LEARNER_NAV` aurait ete l'autre correctif
   * possible, et il aurait ete FAUX : le bloc de pied n'existe que dans le
   * `SheetContent` mobile, l'apprenant aurait perdu « Mon profil » dans la
   * barre laterale desktop.
   */
  const profilDejaDansLaNav = spaces.some((space) =>
    space.entries.some((entry) => entry.to === "/espace/profil"),
  );

  /*
   * « ARCHITECTURE » A ETE RETIRE DE LA NAVIGATION (Stef, 10/09).
   *
   * Il etait garde par `IS_DEV`, et il s'affichait POURTANT sur le telephone
   * d'un etudiant et dans l'espace encadrant : le bundle en ligne porte donc
   * `import.meta.env.DEV === true`. Un ecran interne ne doit pas dependre d'un
   * drapeau de compilation qu'une seule commande de trop suffit a inverser --
   * `build:dev` au lieu de `build`. On retire le lien ; la route reste, non
   * referencee, jusqu'a suppression du fichier.
   */
  const nonLus = useUnreadMessages();

  const defaultPersonName = people[0]?.fullName ?? "profil par défaut";

  /** L'admin plateforme peut quitter un programme pour revenir au bandeau général. */
  const canReturnToPlatform =
    !isPlatformScope && allSpaces.some((space) => space.key === "platform_admin");

  /**
   * Après un changement d'identité simulée, l'écran conservé pouvait ne plus
   * être autorisé (« Accès restreint »). On recale sur la première page
   * réellement accessible pour les rôles du nouveau profil.
   */
  useEffect(() => {
    if (!pendingLanding) return;
    setPendingLanding(false);
    if (isRouteWithinSpaces(allSpaces, pathname)) return;
    void navigate({ to: landingRouteFor(allSpaces), replace: true });
  }, [allSpaces, navigate, pathname, pendingLanding]);

  const switchPerson = (id: PersonId) => {
    setActivePersonId(id);
    setPendingLanding(true);
  };

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 md:hidden"
                aria-label="Ouvrir le menu de navigation"
              >
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Campus Santé Augmenté</SheetTitle>
                <p className="text-xs text-muted-foreground">
                  Formation, compétences et développement professionnel
                </p>
              </SheetHeader>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Programme actif
                </p>
                <ProgramSwitcher variant="full" />
              </div>
              {canReturnToPlatform ? (
                <div className="mt-4">
                  <Button asChild variant="outline" size="sm" className="w-full justify-start">
                    <Link to="/espace/plateforme" onClick={() => setMobileOpen(false)}>
                      <ArrowLeft className="size-4" aria-hidden />
                      Quitter le programme
                    </Link>
                  </Button>
                </div>
              ) : null}
              <nav aria-label="Navigation mobile" className="mt-4 flex flex-col gap-4">
                {spaces.map((space) => (
                  <div key={space.key} className="flex flex-col gap-1">
                    <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {space.label}
                    </p>
                    {space.entries.map(({ to, label, icon: Icon, exact }) => (
                      <Link
                        key={to}
                        to={to}
                        activeOptions={{ exact }}
                        className={linkClass}
                        activeProps={activeClass}
                        onClick={() => setMobileOpen(false)}
                      >
                        <Icon className="size-4" aria-hidden />
                        {label}
                      </Link>
                    ))}
                  </div>
                ))}
                {profilDejaDansLaNav ? null : (
                  <div className="border-t border-border pt-4">
                    <Link
                      to="/espace/profil"
                      className={linkClass}
                      activeProps={activeClass}
                      onClick={() => setMobileOpen(false)}
                    >
                      <UserRound className="size-4" aria-hidden />
                      Mon profil
                    </Link>
                  </div>
                )}
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2 text-foreground">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg hero-gradient text-primary-foreground">
              <HeartPulse className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9rem] font-semibold leading-tight sm:text-base">
                Campus Santé Augmenté
              </span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">
                Formation, compétences et développement professionnel
              </span>
            </span>
          </Link>

          <div className="ms-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            {canReturnToPlatform ? (
              <Button asChild variant="outline" size="sm" className="hidden lg:inline-flex">
                <Link to="/espace/plateforme">
                  <ArrowLeft className="size-4" aria-hidden />
                  Quitter le programme
                </Link>
              </Button>
            ) : null}
            {/*
              LE CHAMP DE RECHERCHE, AVANT LE SELECTEUR DE PROGRAMME (14/09).
              Il ne s affiche que pour un apprenant du programme actif : le
              composant se retire lui-meme sinon. Aucune entree n est ajoutee a
              `LEARNER_NAV` -- chercher est un geste, pas un dixieme onglet.
            */}
            <HeaderSearch />
            {/* Sur smartphone, le programme actif se choisit dans le menu latéral. */}
            <div className="hidden sm:block">
              <ProgramSwitcher />
            </div>
            {/*
              LA PASTILLE DE NON-LUS, A COTE DU PROFIL (Stef, 10/09).
              ELLE N APPARAIT QUE S IL Y A QUELQUE CHOSE A LIRE. Une enveloppe
              permanente a zero occupe la barre sans rien dire : le seul moment
              ou cet element sert, c est quand il compte.
              ELLE NE COUTE AUCUNE REQUETE SUR LA MESSAGERIE : le compteur lit
              les memes cles de cache que l ecran.
            */}
            {nonLus.total > 0 && nonLus.destination ? (
              <Button asChild variant="ghost" size="sm" className="relative shrink-0 px-2">
                <Link to={nonLus.destination} aria-label={`${nonLus.total} message(s) non lu(s)`}>
                  <Mail className="size-5" aria-hidden />
                  <span
                    aria-hidden
                    className="bg-live text-primary-foreground absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold leading-4"
                  >
                    {nonLus.total > 9 ? "9+" : nonLus.total}
                  </span>
                </Link>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-auto gap-2 px-2 py-1"
                  aria-label={`Menu utilisateur — ${person.fullName}`}
                >
                  <span
                    aria-hidden
                    className="grid size-8 place-items-center rounded-full hero-gradient text-xs font-semibold text-primary-foreground"
                  >
                    {initials(person.fullName)}
                  </span>
                  <span className="hidden text-right sm:block">
                    <span className="block text-sm font-medium text-foreground">
                      {person.fullName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {isSimulated ? "Session simulée" : "Connecté (Supabase)"}
                    </span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>
                  <span className="block">{person.fullName}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {rolesInActiveProgram.length > 0
                      ? rolesInActiveProgram.map((r) => ROLE_LABELS_FR[r]).join(" · ")
                      : "Aucun rôle"}{" "}
                    — {activeProgram.code}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/espace/profil" className="flex items-center gap-2">
                    <UserRound className="size-4" aria-hidden />
                    Mon profil
                  </Link>
                </DropdownMenuItem>
                {isSimulated ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Changer de profil de démonstration
                    </DropdownMenuLabel>
                    {rolesInActiveProgram.length === 0 ? (
                      <p className="px-2 pb-1 text-xs text-muted-foreground">
                        Ce profil n'a aucun rôle dans {activeProgram.code} : sélectionnez le
                        programme correspondant.
                      </p>
                    ) : null}
                    <DropdownMenuRadioGroup
                      value={person.id}
                      onValueChange={(value) => switchPerson(value as PersonId)}
                    >
                      {people.map((p) => (
                        <DropdownMenuRadioItem key={p.id} value={p.id}>
                          <span className="flex flex-col">
                            <span>{p.fullName}</span>
                            <span className="text-xs text-muted-foreground">
                              {DEMO_PROFILE_HINTS[p.id] ?? "rôle de démonstration"}
                            </span>
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        resetDemoSession();
                        setPendingLanding(true);
                      }}
                    >
                      <RotateCcw className="size-4" aria-hidden />
                      Revenir au profil par défaut ({defaultPersonName})
                    </DropdownMenuItem>
                    <p className="px-2 pb-2 text-xs text-muted-foreground">
                      Le profil et le programme choisis sont conservés pendant la session de
                      l'onglet (sessionStorage), jamais au-delà.
                    </p>
                  </>
                ) : (
                  <>
                    {roles.length > 1 ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                          Voir en tant que
                        </DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={activeRole ? roleAssignmentKey(activeRole) : ""}
                          onValueChange={(value) => {
                            const next = roles.find((r) => roleAssignmentKey(r) === value) ?? null;
                            setActiveRole(next);
                            setPendingLanding(true);
                          }}
                        >
                          {roles.map((r) => (
                            <DropdownMenuRadioItem
                              key={roleAssignmentKey(r)}
                              value={roleAssignmentKey(r)}
                            >
                              {roleAssignmentLabel(r, programs)}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                        <p className="px-2 pb-1 text-xs text-muted-foreground">
                          Les écrans affichés correspondent uniquement au rôle choisi ci-dessus.
                        </p>
                      </>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void signOut()}>
                      Se déconnecter
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <nav
          aria-label="Navigation principale"
          className="mx-auto hidden max-w-6xl px-4 sm:px-6 md:block"
        >
          <ul className="flex flex-wrap items-center gap-1 pb-2">
            {canReturnToPlatform ? (
              <li className="lg:hidden">
                <Link to="/espace/plateforme" className={linkClass}>
                  <ArrowLeft className="size-4" aria-hidden />
                  Quitter le programme
                </Link>
              </li>
            ) : null}
            {spaces.map((space) => (
              <li key={space.key} className="flex flex-wrap items-center gap-1">
                <span className="sr-only">{space.label}</span>
                {space.entries.map(({ to, label, icon: Icon, exact }) => (
                  <Link
                    key={to}
                    to={to}
                    activeOptions={{ exact }}
                    className={linkClass}
                    activeProps={activeClass}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="contenu" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      {/*
        LE PIED DE PAGE DISAIT « DONNEES DE DEMONSTRATION » — SUR TOUTES LES
        PAGES, Y COMPRIS EN SESSION SUPABASE REELLE (09/09).
        C'etait vrai en aout ; ce ne l'est plus. Le referentiel, les jalons, le
        carnet de stage, les preuves et les messages sont en base, et un
        etudiant qui lit « donnees de demonstration » sous son propre carnet
        n'a aucune raison de faire confiance a ce qu'il vient d'y ecrire.
        C'est le meme retrait que celui du mot « prototype » demande par Stef
        le meme jour sur la vue d'ensemble.

        CE QU'ON GARDE, PARCE QUE C'EST LA REGLE ET NON UN CONSTAT : aucune
        donnee de patient n'a sa place ici. Formulee comme une consigne et non
        comme une promesse — la plateforme ne peut pas garantir ce qu'un
        etudiant tape dans un champ libre, elle peut dire ce qui s'y fait.
      */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          Socle multi-programmes — aucune donnée de patient ne doit être saisie sur cette
          plateforme.
        </div>
      </footer>
    </div>
  );
}
