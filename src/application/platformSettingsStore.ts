/**
 * État LOCAL du paramétrage plateforme (le temps de la session).
 *
 * Rien n'est persisté ni transmis : les modifications de fiche, les paramètres
 * et les courriels préparés vivent en mémoire, comme le reste de la maquette.
 */
import { useSyncExternalStore } from "react";
import type {
  NotificationRule,
  PlatformGeneralSettings,
  ProgramPlatformSettings,
} from "@/domain/platformSettings";
import type { AccountStatus, PersonEditInput } from "@/domain/platformDirectory";
import type { PersonId, ProgramId } from "@/domain/types";

export interface PersonOverride {
  readonly fullName: string;
  readonly email: string;
  readonly status: AccountStatus;
  readonly notifyByEmail: boolean;
  readonly reason: string;
  readonly updatedAt: string;
}

export interface PreparedMailing {
  readonly id: string;
  readonly subject: string;
  readonly groupKeys: readonly string[];
  readonly recipients: number;
  readonly preparedAt: string;
  /** Toujours « préparé » : aucune expédition réelle. */
  readonly state: "prepared_not_sent";
}

export interface PlatformSettingsState {
  readonly general: PlatformGeneralSettings;
  readonly byProgram: Readonly<Record<string, ProgramPlatformSettings>>;
  readonly notificationRules: readonly NotificationRule[];
  readonly personOverrides: Readonly<Record<string, PersonOverride>>;
  readonly preparedMailings: readonly PreparedMailing[];
}

const DEFAULT_STATE: PlatformSettingsState = {
  general: {
    platformName: "Campus Santé Augmenté",
    supportEmail: "support@campus-sante-augmente.fr",
    retentionMonths: 60,
    requireHumanValidation: true,
    aiEnabled: false,
    storageQuotaGb: 200,
  },
  byProgram: {},
  notificationRules: [
    {
      kind: "logbook_validation",
      channel: "email",
      cadence: "daily",
      audienceLabel: "Responsables de stage",
    },
    {
      kind: "document_missing",
      channel: "email",
      cadence: "weekly",
      audienceLabel: "Administrateurs de programme",
    },
    {
      kind: "session_convocation",
      channel: "sms",
      cadence: "immediate",
      audienceLabel: "Apprenants convoqués",
    },
    {
      kind: "ai_quota_alert",
      channel: "in_app",
      cadence: "immediate",
      audienceLabel: "Administrateurs plateforme",
    },
  ],
  personOverrides: {},
  preparedMailings: [],
};

let current: PlatformSettingsState = DEFAULT_STATE;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PlatformSettingsState {
  return current;
}

function emit(next: PlatformSettingsState): void {
  current = next;
  for (const listener of listeners) listener();
}

export function resetPlatformSettings(): void {
  emit(DEFAULT_STATE);
}

export function usePlatformSettings(): PlatformSettingsState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setGeneralSettings(general: PlatformGeneralSettings): void {
  emit({ ...current, general });
}

export function setProgramSettings(settings: ProgramPlatformSettings): void {
  emit({
    ...current,
    byProgram: { ...current.byProgram, [settings.programId]: settings },
  });
}

export function programSettingsFor(
  state: PlatformSettingsState,
  programId: ProgramId,
  fallback: ProgramPlatformSettings,
): ProgramPlatformSettings {
  return state.byProgram[programId] ?? fallback;
}

export function setNotificationRule(index: number, rule: NotificationRule): void {
  const rules = current.notificationRules.map((r, i) => (i === index ? rule : r));
  emit({ ...current, notificationRules: rules });
}

export function savePersonOverride(personId: PersonId, input: PersonEditInput): void {
  const override: PersonOverride = {
    fullName: input.fullName.trim(),
    email: input.email.trim(),
    status: input.status,
    notifyByEmail: input.notifyByEmail,
    reason: input.reason.trim(),
    updatedAt: new Date().toISOString(),
  };
  emit({
    ...current,
    personOverrides: { ...current.personOverrides, [personId]: override },
  });
}

export function addPreparedMailing(args: {
  readonly subject: string;
  readonly groupKeys: readonly string[];
  readonly recipients: number;
}): void {
  const mailing: PreparedMailing = {
    id: `mail-${current.preparedMailings.length + 1}`,
    subject: args.subject.trim(),
    groupKeys: args.groupKeys,
    recipients: args.recipients,
    preparedAt: new Date().toISOString(),
    state: "prepared_not_sent",
  };
  emit({ ...current, preparedMailings: [mailing, ...current.preparedMailings] });
}
