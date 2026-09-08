/**
 * Mes messages — point de réception apprenant (100 % simulé).
 * Aucun envoi, aucune réception réelle : les éléments listés proviennent de
 * données de démonstration alignées sur le domaine des communications.
 */
import { useState } from "react";
import { FieldHeader } from "@/components/field-header";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
    <div className="space-y-7">
      <FieldHeader
        eyebrow={activeProgram.name}
        title="Mes messages"
        figures={[
          { value: DEMO_MESSAGES.length, label: "messages" },
          { value: unread.length, label: "non lus" },
        ]}
      />

      <section>
        <h2 className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]">
          Boîte de réception
        </h2>
        {/*
          LE PERIMETRE EST RAPPELE DANS LA CARTE, PAS AU-DESSUS. Le bandeau
          `ScopeNotice` flottait entre le titre de page et le contenu, encadre
          et souligne d'une icone : il criait plus fort que les messages
          eux-memes. Il redevient une note de pied, sous un filet, a l'interieur
          de l'objet qu'il qualifie — le meme geste que sur le pave de stage.
        */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
          {DEMO_MESSAGES.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              Aucun message pour l'instant.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {DEMO_MESSAGES.map((message) => {
                const isRead = readIds.includes(message.id);
                return (
                  <li key={message.id} className="flex items-start gap-3 px-4 py-3.5">
                    {/*
                      LE NON-LU EST PORTE PAR LA GRAISSE ET UN MARQUEUR, jamais
                      par la couleur seule : un daltonien, un ecran en plein
                      soleil ou un mode contraste eleve la perdent.
                    */}
                    <span
                      className={`mt-2 size-2 shrink-0 rounded-full ${isRead ? "bg-transparent" : "bg-live"}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-display text-[16.5px] leading-tight tracking-[-0.01em] ${
                          isRead ? "text-muted-foreground" : ""
                        }`}
                      >
                        {message.subject}
                        {isRead ? null : <span className="sr-only"> (non lu)</span>}
                      </p>
                      <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
                        {message.body}
                      </p>
                      {/*
                        LES QUATRE PASTILLES GRISES DEVIENNENT UNE SEULE LIGNE.
                        Categorie, canal et date disaient trois choses de meme
                        rang dans trois boites : un rang de badges pese autant
                        que l'objet du message, qu'il est cense qualifier.
                      */}
                      <p className={`${EYEBROW} mt-2 text-muted-foreground`} style={TABULAIRE}>
                        {MESSAGE_CATEGORY_LABELS_FR[message.category]} ·{" "}
                        {message.channel === "email" ? "e-mail" : "application"} ·{" "}
                        {new Date(message.receivedAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    {isRead ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => setReadIds([...readIds, message.id])}
                      >
                        Marquer comme lu
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            {COMMUNICATION_NO_REAL_SEND_FR}
          </p>
        </div>
      </section>

      <p className={`${EYEBROW} pt-2 text-center text-muted-foreground`}>
        Simulé — aucune réception réelle
      </p>
    </div>
  );
}
