import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, HeartPulse, Layers, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

const PILLARS = [
  {
    icon: Layers,
    title: "Un moteur, plusieurs programmes",
    text: "DIU d'Échocardiographie et DFASM Cardiologie partagent le même socle, configuré par programme — jamais deux applications.",
  },
  {
    icon: ShieldCheck,
    title: "Preuves fiables",
    text: "QCM, simulation, activité réelle, stage ou validation humaine. Une compétence réelle exige toujours un tiers validateur.",
  },
  {
    icon: GraduationCap,
    title: "Trois natures d'acquis",
    text: "Connaissance, compétence simulée et compétence réelle sont distinguées explicitement dans le modèle.",
  },
];

function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="hero-gradient text-primary-foreground">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 px-3 py-1 text-xs">
            <HeartPulse className="size-3.5" aria-hidden />
            Socle universitaire — itération 1
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight sm:text-5xl">
            Campus Santé Augmenté
          </h1>
          <p className="mt-3 text-base text-primary-foreground/90 sm:text-lg">
            Formation, compétences et développement professionnel
          </p>
          <p className="mt-4 max-w-2xl text-base text-primary-foreground/85 sm:text-lg">
            Le parcours de formation, ses preuves et ses validations, réunis dans un socle sobre,
            lisible et commun à tous les programmes de la faculté.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link to="/espace">Entrer dans l'espace</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Link to="/espace/passeport">Voir un passeport</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold text-foreground">Principes du socle</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, text }) => (
            <Card key={title}>
              <CardHeader>
                <span className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <p className="mt-12 rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
          Cette première itération fonctionne avec des données de démonstration : aucune base de
          données, aucune authentification réelle, aucun appel d'intelligence artificielle.
        </p>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-muted-foreground">
          Campus Santé Augmenté — socle multi-programmes.
        </div>
      </footer>
    </div>
  );
}
