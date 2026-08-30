import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useSupervision } from "@/features/supervision/useSupervision";
import { NO_REAL_SEND_FR } from "@/domain/administration";

export function SupervisionMessages() {
  const { data, isPending } = useSupervision();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [prepared, setPrepared] = useState<string | null>(null);

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Messagerie et notifications"
        level={1}
        action={<MockBadge label="Simulé — aucun envoi" />}
        description="Échanges avec les étudiants encadrés et l'administration du programme."
      />

      <ScopeNotice>{NO_REAL_SEND_FR}</ScopeNotice>

      <PanelCard title="Préparer un message" description="Aucune expédition dans cette maquette.">
        <div>
          <label htmlFor="sujet" className="mb-1 block text-sm font-medium">
            Objet
          </label>
          <Input id="sujet" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label htmlFor="corps" className="mb-1 block text-sm font-medium">
            Message
          </label>
          <Textarea id="corps" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <Button
          size="sm"
          disabled={subject.trim().length === 0 || body.trim().length === 0}
          onClick={() => setPrepared("Message préparé (non envoyé) — démonstration.")}
        >
          Préparer l'envoi
        </Button>
        {prepared ? <p className="text-sm text-muted-foreground">{prepared}</p> : null}
      </PanelCard>

      <PanelCard title="Historique simulé" description="Messages et relances de démonstration.">
        {data.messages.length === 0 ? (
          <EmptyState>Aucun message dans ce programme.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {data.messages.map((m) => (
              <li key={m.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.subject}</span>
                  <Badge variant="outline" className="font-normal">
                    {m.kind === "reminder" ? "relance" : "message"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.sentAt).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
