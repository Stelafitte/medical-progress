/**
 * Mes messages — point de réception apprenant (100 % simulé).
 * Aucun envoi, aucune réception réelle : les éléments listés proviennent de
 * données de démonstration alignées sur le domaine des communications.
 */
import { useState } from "react";
import { FieldHeader } from "@/components/field-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { useSession } from "@/application/session";
import {
  COMMUNICATION_NO_REAL_SEND_FR,
  MESSAGE_CATEGORY_LABELS_FR,
  type MessageCategory,
} from "@/domain/communication";

interface DemoMessage {
  readonly id: string;
  readonly subject: string;
  readonly body: string;
  readonly category: MessageCategory;
  readonly receivedAt: string;
  readonly channel: "email" | "in_app";
}

const DEMO_MESSAGES: readonly DemoMessage[] = [
  {
    id: "msg-1",
    subject: "Ouverture du module Doppler",
    body: "Le cours sonorisé « Bases physiques du Doppler » est disponible dans vos ressources.",
    category: "announcement",
    receivedAt: "2026-08-18T09:00:00Z",
    channel: "in_app",
  },
  {
    id: "msg-2",
    subject: "Rappel : dépôt de votre carnet de stage",
    body: "Votre encadrant attend la contre-signature de deux gestes enregistrés cette semaine.",
    category: "reminder",
    receivedAt: "2026-08-21T07:30:00Z",
    channel: "email",
  },
  {
    id: "msg-3",
    subject: "Convocation à l'atelier de simulation",
    body: "Atelier ECOS le 3 septembre, 14 h, plateau de simulation — présence obligatoire.",
    category: "convocation",
    receivedAt: "2026-08-24T16:15:00Z",
    channel: "email",
  },
];

export function LearnerMessagesView() {
  const { activeProgram, activeEnrollment } = useSession();
  const [readIds, setReadIds] = useState<readonly string[]>([]);

  if (!activeEnrollment) {
    return (
      <p className="text-sm text-muted-foreground">Aucune inscription active pour ce programme.</p>
    );
  }
  if (!activeProgram) return <Skeleton className="h-64 w-full" />;

  const unread = DEMO_MESSAGES.filter((m) => !readIds.includes(m.id));

  return (
    <div className="space-y-8">
      <FieldHeader
        eyebrow={activeProgram.name}
        title="Mes messages"
        figures={[
          { value: DEMO_MESSAGES.length, label: "messages" },
          { value: unread.length, label: "non lus" },
        ]}
      />

      <ScopeNotice>{COMMUNICATION_NO_REAL_SEND_FR}</ScopeNotice>

      <PanelCard
        title="Boîte de réception"
        action={<MockBadge label="Simulé — aucune réception réelle" />}
      >
        {DEMO_MESSAGES.length === 0 ? (
          <EmptyState>Aucun message pour l'instant.</EmptyState>
        ) : (
          <ul className="space-y-4">
            {DEMO_MESSAGES.map((message) => {
              const isRead = readIds.includes(message.id);
              return (
                <li key={message.id} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      LE NON-LU EST PORTE PAR LA GRAISSE ET UN MARQUEUR, jamais
                      par la couleur seule : un daltonien, un ecran en plein
                      soleil ou un mode contraste eleve la perdent.
                    */}
                    <span
                      className={`size-2 shrink-0 rounded-full ${isRead ? "bg-transparent" : "bg-primary"}`}
                      aria-hidden
                    />
                    <span className={isRead ? "text-muted-foreground" : "font-semibold"}>
                      {message.subject}
                      {isRead ? null : <span className="sr-only"> (non lu)</span>}
                    </span>
                    <Badge variant="outline" className="font-normal">
                      {MESSAGE_CATEGORY_LABELS_FR[message.category]}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {message.channel === "email" ? "e-mail" : "application"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.receivedAt).toLocaleDateString("fr-FR")}
                    </span>
                    {isRead ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setReadIds([...readIds, message.id])}
                      >
                        Marquer comme lu
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{message.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
