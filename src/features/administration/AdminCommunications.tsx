import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { NO_REAL_SEND_FR } from "@/domain/administration";

export function AdminCommunications() {
  const { data, isPending } = useProgramAdmin();
  const [templateId, setTemplateId] = useState<string>("");
  const [body, setBody] = useState("");
  const [prepared, setPrepared] = useState<string | null>(null);

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Communications"
        level={1}
        action={<MockBadge label="Simulé — aucun envoi" />}
        description="Messages individuels, de groupe ou de promotion, modèles et relances préparées."
      />

      <ScopeNotice>{NO_REAL_SEND_FR}</ScopeNotice>

      <PanelCard title="Préparer une communication">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="modele" className="mb-1 block text-sm font-medium">
              Modèle de message
            </label>
            <Select
              value={templateId}
              onValueChange={(v) => {
                setTemplateId(v);
                setBody(data.messageTemplates.find((t) => t.id === v)?.body ?? "");
              }}
            >
              <SelectTrigger id="modele">
                <SelectValue placeholder="Choisir un modèle" />
              </SelectTrigger>
              <SelectContent>
                {data.messageTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label} — {t.audience}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label htmlFor="contenu-message" className="mb-1 block text-sm font-medium">
            Contenu
          </label>
          <Textarea
            id="contenu-message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Contenu du message (aucun envoi réel)."
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={body.trim().length === 0}
            onClick={() => setPrepared("Communication préparée (non envoyée) — démonstration.")}
          >
            Préparer l'envoi
          </Button>
          <Button size="sm" variant="outline" disabled>
            Programmer une relance automatique (prévu)
          </Button>
        </div>
        {prepared ? <p className="text-sm text-muted-foreground">{prepared}</p> : null}
      </PanelCard>

      <PanelCard title="Historique des envois préparés">
        {data.sendHistory.length === 0 ? (
          <EmptyState>Aucun envoi préparé.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.sendHistory.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {data.messageTemplates.find((t) => t.id === h.templateId)?.label ?? "Message"}
                </span>
                <span className="text-muted-foreground">
                  {h.audienceLabel} · {h.recipients} destinataire(s) ·{" "}
                  {new Date(h.preparedAt).toLocaleDateString("fr-FR")}
                </span>
                <Badge variant="outline" className="font-normal">
                  préparé, non envoyé
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
