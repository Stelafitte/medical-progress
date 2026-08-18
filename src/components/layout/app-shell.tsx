import { useState } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { Boxes, HeartPulse, Menu, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { ProgramSwitcher } from "@/components/program-switcher";
import { navSpacesFor } from "@/components/layout/navigation";
import { useSession } from "@/application/session";
import { initials } from "@/lib/initials";
import { ROLE_LABELS_FR } from "@/domain/roles";
import { IS_DEV } from "@/lib/env";
import type { PersonId } from "@/domain/types";

const linkClass =
  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";
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

export function AppShell() {
  const { person, people, setActivePersonId, roles, rolesInActiveProgram, activeProgram, isSimulated } =
    useSession();

  const [mobileOpen, setMobileOpen] = useState(false);

  const spaces = navSpacesFor(roles, activeProgram.id);

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Ouvrir le menu">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
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
                {IS_DEV ? (
                  <Link
                    to="/espace/architecture"
                    className={linkClass}
                    activeProps={activeClass}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Boxes className="size-4" aria-hidden />
                    Architecture
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      dev
                    </Badge>
                  </Link>
                ) : null}
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
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex items-center gap-2 text-foreground">
            <span className="grid size-9 place-items-center rounded-lg hero-gradient text-primary-foreground">
              <HeartPulse className="size-5" aria-hidden />
            </span>
            <span className="text-base font-semibold leading-tight">Mon Passeport Éducatif</span>
          </Link>

          <div className="ms-auto flex items-center gap-3">
            <ProgramSwitcher />
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
                    <span className="block text-xs text-muted-foreground">Session simulée</span>
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
                      onValueChange={(value) => setActivePersonId(value as PersonId)}
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
                  </>
                ) : null}

              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <nav
          aria-label="Navigation principale"
          className="mx-auto hidden max-w-6xl px-4 sm:px-6 md:block"
        >
          <ul className="flex flex-wrap items-center gap-1 pb-2">
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
            {IS_DEV ? (
              <li>
                <Link to="/espace/architecture" className={linkClass} activeProps={activeClass}>
                  <Boxes className="size-4" aria-hidden />
                  Architecture
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    dev
                  </Badge>
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
      </header>

      <main id="contenu" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          Socle multi-programmes — données de démonstration, aucune donnée de santé réelle.
        </div>
      </footer>
    </div>
  );
}
