/**
 * Historique LOCAL des campagnes préparées (mémoire du navigateur uniquement).
 *
 * Aucune persistance : l'historique disparaît au rechargement de la page.
 * Aucun envoi : une campagne préparée n'est jamais expédiée et ne produit
 * jamais de `DeliveryAttempt` « sent » ou « delivered ».
 */
import { useSyncExternalStore } from "react";
import type {
  CommCampaignId,
  CommunicationCampaign,
  ScheduleTrigger,
  ScheduledMessageStatus,
} from "@/domain/communication";
import type { IsoDateTime } from "@/domain/types";

export interface PreparedCampaign {
  readonly campaign: CommunicationCampaign;
  readonly trigger: ScheduleTrigger;
  readonly triggerLabel: string;
  readonly audienceLabel: string;
  readonly recipientCount: number;
  readonly preparedAt: IsoDateTime;
  /** Toujours `pending` ou `cancelled` : rien n'est jamais dispatché. */
  readonly dispatchStatus: ScheduledMessageStatus;
  readonly isSimulated: true;
}

let current: readonly PreparedCampaign[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly PreparedCampaign[] {
  return current;
}

function emit(next: readonly PreparedCampaign[]): void {
  current = next;
  for (const listener of listeners) listener();
}

export function addPreparedCampaign(entry: PreparedCampaign): void {
  emit([entry, ...current]);
}

/** Annulation locale : autorisée tant que la campagne n'est pas dispatchée. */
export function cancelPreparedCampaign(id: CommCampaignId): void {
  emit(
    current.map((entry) =>
      entry.campaign.id === id && entry.dispatchStatus !== "dispatched"
        ? {
            ...entry,
            dispatchStatus: "cancelled",
            campaign: { ...entry.campaign, status: "cancelled" },
          }
        : entry,
    ),
  );
}

export function resetPreparedCampaigns(): void {
  emit([]);
}

export function usePreparedCampaigns(): readonly PreparedCampaign[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
