import { Link, Outlet } from "@tanstack/react-router";
import { HeartPulse, LayoutDashboard, ShieldCheck, Boxes, IdCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramSwitcher } from "@/components/program-switcher";
import { useSession } from "@/app/session";
import { IS_DEV } from "@/lib/env";

const NAV = [
  { to: "/espace", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { to: "/espace/passeport", label: "Passeport", icon: IdCard, exact: false },
  { to: "/espace/administration", label: "Administration", icon: ShieldCheck, exact: false },
] as const;

export function AppShell() {
  const { person } = useSession();

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
          <Link to="/" className="flex items-center gap-2 text-foreground">
            <span className="grid size-9 place-items-center rounded-lg hero-gradient text-primary-foreground">
              <HeartPulse className="size-5" aria-hidden />
            </span>
            <span className="text-base font-semibold leading-tight">
              Passeport Éducatif Médical
            </span>
          </Link>

          <div className="ms-auto flex items-center gap-3">
            <ProgramSwitcher />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-foreground">{person.fullName}</p>
              <p className="text-xs text-muted-foreground">Session simulée</p>
            </div>
          </div>
        </div>

        <nav aria-label="Navigation principale" className="mx-auto max-w-6xl px-4 sm:px-6">
          <ul className="flex flex-wrap gap-1 pb-2">
            {NAV.map(({ to, label, icon: Icon, exact }) => (
              <li key={to}>
                <Link
                  to={to}
                  activeOptions={{ exact }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  activeProps={{ className: "bg-secondary text-secondary-foreground" }}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
            {IS_DEV ? (
              <li>
                <Link
                  to="/espace/architecture"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  activeProps={{ className: "bg-secondary text-secondary-foreground" }}
                >
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
