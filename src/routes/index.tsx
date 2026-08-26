import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Info, Layers, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campus Santé Augmenté — Formation, compétences et développement professionnel" },
      {
        name: "description",
        content:
          "Un socle commun et configurable pour suivre connaissances, compétences simulées et compétences réelles validées en formation médicale universitaire.",
      },
      {
        property: "og:title",
        content: "Campus Santé Augmenté — Formation, compétences et développement professionnel",
      },
      {
        property: "og:description",
        content:
          "Socle universitaire multi-programmes : connaissances, compétences simulées et compétences réelles validées.",
      },
    ],
  }),
  component: HomePage,
});

const PRINCIPLES = [
  {
    icon: Layers,
    title: "Un moteur, plusieurs programmes",
    text: "Une architecture logicielle unique capable de porter des parcours variés tout en maintenant une cohérence pédagogique.",
  },
  {
    icon: BadgeCheck,
    title: "Des preuves fiables",
    text: "QCM, simulation, activité réelle ou stage : une compétence réelle exige toujours la validation d'un tiers habilité.",
  },
  {
    icon: Zap,
    title: "Trois natures d'acquis",
    text: "Connaissance, compétence simulée et compétence réelle sont distinguées explicitement dans le modèle.",
  },
];

const PROGRAMS = [
  {
    badge: "Diplôme Inter-Universitaire",
    title: "DIU Échocardiographie",
    text: "Formation spécialisée en imagerie ultrasonore cardiaque.",
  },
  {
    badge: "DFASM",
    title: "DFASM Cardiologie",
    text: "Socle de connaissances fondamentales en pathologie cardiovasculaire.",
  },
];

function HomePage() {
  return (
    <div className="min-h-screen w-full bg-campus-mist font-body text-campus-navy antialiased">
      <header className="relative overflow-hidden bg-campus-navy py-24 text-campus-mist">
        <div className="absolute inset-0 opacity-10" aria-hidden>
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="campus-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#campus-grid)" />
          </svg>
        </div>

        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <h1 className="mb-6 font-heading text-5xl font-bold tracking-tight md:text-6xl">
            Campus Santé Augmenté
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-xl text-campus-mist/80">
            Formation, compétences et développement professionnel pour les acteurs de la santé.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              to="/espace"
              className="rounded-lg bg-campus-blue px-8 py-4 font-semibold text-campus-mist transition hover:bg-campus-navy-mid"
            >
              Entrer dans l'espace
            </Link>
            <Link
              to="/espace/passeport"
              className="rounded-lg border border-campus-mist/20 bg-campus-mist/5 px-8 py-4 font-semibold text-campus-mist backdrop-blur-sm transition hover:bg-campus-mist/10"
            >
              Voir un passeport
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto -mt-16 max-w-7xl px-6 pb-20">
        <h2 className="sr-only">Principes du socle</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {PRINCIPLES.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="flex flex-col rounded-xl bg-card p-8 shadow-card transition hover:shadow-raised"
            >
              <span className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-campus-mist text-campus-blue">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="mb-3 font-heading text-xl font-bold">{title}</h3>
              <p className="text-sm leading-relaxed text-campus-navy-mid/70">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <h2 className="mb-8 font-heading text-2xl font-bold text-campus-navy-mid">
          Programmes de formation
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {PROGRAMS.map(({ badge, title, text }) => (
            <article
              key={title}
              className="group relative rounded-xl border border-campus-navy/10 bg-card p-6 transition hover:border-campus-blue hover:shadow-card"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="mb-2 inline-block rounded bg-campus-mist px-3 py-1 text-xs font-bold uppercase tracking-wider text-campus-navy-mid">
                    {badge}
                  </span>
                  <h3 className="mt-2 font-heading text-xl font-bold">{title}</h3>
                  <p className="mt-2 text-sm text-campus-navy-mid/60">{text}</p>
                </div>
                <span className="text-campus-blue opacity-0 transition group-hover:opacity-100">
                  <ArrowRight className="h-6 w-6" aria-hidden />
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="mx-auto mt-8 max-w-7xl px-6">
        <div className="rounded-lg border-l-4 border-campus-blue bg-campus-navy-mid/5 p-4">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 shrink-0 text-campus-blue" aria-hidden />
            <p className="text-sm font-medium text-campus-navy-mid">
              Note : cette itération fonctionne avec des données de démonstration — aucune base de
              données, aucune authentification réelle, aucun appel d'intelligence artificielle.
            </p>
          </div>
        </div>
      </div>

      <footer className="mt-24 border-t border-campus-navy/10 bg-card py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="text-center md:text-left">
              <span className="font-heading font-bold text-campus-navy">
                Campus Santé Augmenté
              </span>
              <p className="mt-1 text-sm text-campus-navy-mid/50">
                Socle universitaire multi-programmes — usage interne.
              </p>
            </div>
            <div className="flex gap-8 text-sm font-medium text-campus-navy-mid/70">
              <Link to="/espace/profil" className="hover:text-campus-blue">
                Mon profil
              </Link>
              <Link to="/espace/ressources" className="hover:text-campus-blue">
                Ressources
              </Link>
              <Link to="/espace/messages" className="hover:text-campus-blue">
                Messages
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
