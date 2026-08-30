import { useState } from "react";
import { Eye, Info } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Éléments pouvant être inclus dans un partage ou export personnel. */
const SHARE_ITEMS: ReadonlyArray<{ id: string; label: string; hint: string }> = [
  { id: "connaissances", label: "Connaissances", hint: "Ce que je sais." },
  {
    id: "competences-simulees",
    label: "Compétences simulées",
    hint: "Situations simulées, dont ECOS.",
  },
  {
    id: "competences-reelles",
    label: "Compétences réelles",
    hint: "Situations cliniques validées par un encadrant.",
  },
  { id: "preuves", label: "Preuves", hint: "Détail des preuves d'acquisition." },
  { id: "validations", label: "Validations", hint: "Décisions et commentaires des validateurs." },
  { id: "stages", label: "Expériences de stage", hint: "Terrains, périodes et encadrants." },
  { id: "historique", label: "Historique", hint: "Chronologie des acquisitions." },
  { id: "jalons", label: "Prochains jalons", hint: "Objectifs et échéances à venir." },
];

const DEFAULT_SHARED = new Set(["connaissances", "competences-simulees", "jalons"]);

/**
 * Préférences de présentation destinées UNIQUEMENT au partage / export
 * personnel. Elles ne restreignent jamais le dossier institutionnel.
 * État React en mémoire : rien n'est enregistré.
 */
export function PassportVisibilitySection() {
  const [shared, setShared] = useState<ReadonlySet<string>>(DEFAULT_SHARED);

  const toggle = (id: string) => {
    setShared((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section aria-labelledby="titre-presentation">
      <SectionHeading
        id="titre-presentation"
        title="Présentation de mon Passeport"
        description="Choisissez ce qui apparaît dans un partage ou un export que vous initiez vous-même."
        action={<Badge variant="outline">Démonstration — non enregistré</Badge>}
      />

      <Card>
        <CardHeader>
          <Eye className="size-5 text-primary" aria-hidden />
          <CardTitle className="text-base">Partage et export personnels</CardTitle>
          <CardDescription>
            Ces préférences ne concernent que vos partages et exports. Le dossier institutionnel
            complet reste visible des professionnels autorisés (enseignants, encadrants de stage,
            administration) : aucun élément ne peut leur être masqué depuis cet écran.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <Info className="mt-0.5 size-4 text-primary" aria-hidden />
            Démonstration — non enregistré : les choix ci-dessous restent en mémoire de la page.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {SHARE_ITEMS.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
              >
                <div>
                  <Label htmlFor={`partage-${item.id}`} className="text-sm font-medium">
                    {item.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                </div>
                <Switch
                  id={`partage-${item.id}`}
                  checked={shared.has(item.id)}
                  onCheckedChange={() => toggle(item.id)}
                  aria-describedby="titre-presentation"
                />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {shared.size} élément(s) inclus dans le partage de démonstration.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
