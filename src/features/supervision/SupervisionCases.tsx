import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { learnerName, useSupervision } from "@/features/supervision/useSupervision";

export function SupervisionCases() {
  const { data, isPending } = useSupervision();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [handled, setHandled] = useState<readonly string[]>([]);

  if (isPending || !data) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Cas et questions"
        level={1}
        action={<MockBadge />}
        description="Cas marqués « à discuter » et questions des apprenants encadrés."
      />

      <ScopeNotice>
        Formulations pédagogiques uniquement : aucun élément nominatif patient n'est saisissable
        dans ce module.
      </ScopeNotice>

      {data.cases.length === 0 ? (
        <EmptyState>Aucun cas ni question sur votre périmètre.</EmptyState>
      ) : (
        <div className="grid gap-4">
          {data.cases.map((item) => {
            const isHandled = item.handled || handled.includes(item.id);
            return (
              <PanelCard
                key={item.id}
                title={item.title}
                description={`${learnerName(data, item.enrollmentId)} · ${
                  item.kind === "case_to_discuss" ? "cas à discuter" : "question de l'apprenant"
                }`}
                action={
                  <Badge variant={isHandled ? "secondary" : "outline"} className="font-normal">
                    {isHandled ? "traité" : "non traité"}
                  </Badge>
                }
              >
                <p>{item.body}</p>
                {item.comments.length > 0 ? (
                  <ul className="space-y-1 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                    {item.comments.map((c) => (
                      <li key={c.at}>
                        {new Date(c.at).toLocaleDateString("fr-FR")} — {c.body}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div>
                  <label
                    htmlFor={`commentaire-${item.id}`}
                    className="mb-1 block text-sm font-medium"
                  >
                    Commentaire d'encadrant
                  </label>
                  <Textarea
                    id={`commentaire-${item.id}`}
                    value={drafts[item.id] ?? ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Réponse pédagogique (démonstration, non enregistrée)."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={(drafts[item.id] ?? "").trim().length === 0}
                  >
                    Ajouter le commentaire
                  </Button>
                  <Button
                    size="sm"
                    variant={isHandled ? "ghost" : "default"}
                    onClick={() =>
                      setHandled((prev) =>
                        prev.includes(item.id)
                          ? prev.filter((x) => x !== item.id)
                          : [...prev, item.id],
                      )
                    }
                  >
                    {isHandled ? "Rouvrir" : "Marquer comme traité"}
                  </Button>
                </div>
              </PanelCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
