import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { useDataAccess, useSession } from "@/application/session";
import {
  AI_FALLBACK_POLICIES,
  AI_FALLBACK_POLICY_COST_FR,
  AI_FALLBACK_POLICY_HINTS_FR,
  AI_FALLBACK_POLICY_LABELS_FR,
  describeLearnerAvailability,
  isSettingsInconsistent,
  type AiFallbackPolicy,
  type ProgramAiSettings,
} from "@/domain/programAi";

/**
 * REGLAGE DE L'ASSISTANT IA — ECRITURE REELLE (09/09).
 *
 * Avant cet ecran, `program_ai_settings` n'etait touchee par AUCUN fichier de
 * `src/` : le reglage n'existait que si quelqu'un l'ecrivait a la main dans
 * l'editeur SQL. Un garde-fou que seul son auteur sait deplacer n'est pas un
 * reglage.
 *
 * TROIS CHOSES SUR LE MEME ECRAN, ET C'EST VOULU : l'interrupteur, le plafond,
 * la politique de repli — plus la CONSOMMATION DU MOIS a cote. Un plafond sans
 * compteur ne se pilote pas : on le pose au jugé, on ne le revisite jamais.
 *
 * CE PANNEAU A REMPLACE `AiCreditsSection` sur cet ecran (09/09), qui restait
 * une comptabilite de maquette — enveloppes par periode, paliers de modele,
 * mode vocal — dont rien n'existe en base. Elle est debranchee, pas supprimee.
 * Tous les chiffres d'ici viennent de `program_ai_usage_this_month`.
 */

/** Le formulaire, separe de l'etat enregistre : on compare pour savoir si on peut enregistrer. */
type Brouillon = {
  readonly enabled: boolean;
  readonly cap: string;
  readonly policy: AiFallbackPolicy;
};

function versBrouillon(settings: ProgramAiSettings): Brouillon {
  return {
    enabled: settings.enabled,
    cap: String(settings.monthlyCreditCap),
    policy: settings.fallbackPolicy,
  };
}

/**
 * `cap` EST UNE CHAINE DANS LE BROUILLON, un entier a l'enregistrement. Un
 * `input type=number` controle par un `number` empeche d'effacer le champ pour
 * retaper : la valeur repasse a zero entre deux frappes, et zero est un reglage
 * SIGNIFIANT ici (il coupe l'outil). On garde donc le texte tel qu'il est tape
 * et on ne le convertit qu'au moment d'ecrire.
 */
function capValide(brouillon: Brouillon): number | undefined {
  if (!/^\d+$/.test(brouillon.cap.trim())) return undefined;
  const valeur = Number.parseInt(brouillon.cap, 10);
  return Number.isSafeInteger(valeur) && valeur >= 0 ? valeur : undefined;
}

function aChange(brouillon: Brouillon, settings: ProgramAiSettings): boolean {
  const cap = capValide(brouillon);
  return (
    brouillon.enabled !== settings.enabled ||
    brouillon.policy !== settings.fallbackPolicy ||
    (cap !== undefined && cap !== settings.monthlyCreditCap)
  );
}

export function ProgramAiSettingsSection() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { activeProgram } = useSession();

  const { data: charge, isPending } = useQuery({
    queryKey: ["program-ai", activeProgram.id],
    queryFn: async () => {
      const [settings, usage] = await Promise.all([
        data.programAi.getSettings(activeProgram.id),
        data.programAi.getUsageThisMonth(activeProgram.id),
      ]);
      return { settings, usage };
    },
  });

  const [brouillon, setBrouillon] = useState<Brouillon | undefined>(undefined);

  /*
   * ON NE REECRIT LE BROUILLON QUE SUR UN CHANGEMENT DE PROGRAMME, pas a chaque
   * relecture : un rafraichissement de fond ne doit pas effacer une saisie en
   * cours. Le brouillon est repris de l'etat enregistre apres chaque ecriture,
   * explicitement, dans `onSuccess`.
   */
  useEffect(() => {
    setBrouillon(undefined);
  }, [activeProgram.id]);

  const enregistrer = useMutation({
    mutationFn: async (valeurs: { enabled: boolean; cap: number; policy: AiFallbackPolicy }) =>
      data.programAi.saveSettings({
        programId: activeProgram.id,
        enabled: valeurs.enabled,
        monthlyCreditCap: valeurs.cap,
        fallbackPolicy: valeurs.policy,
      }),
    onSuccess: (enregistre) => {
      setBrouillon(versBrouillon(enregistre));
      void queryClient.invalidateQueries({ queryKey: ["program-ai", activeProgram.id] });
      toast.success(describeLearnerAvailability(enregistre));
    },
    /*
     * LE MESSAGE DE LA BASE EST REMONTE TEL QUEL. Le declencheur
     * `program_ai_settings_guard` refuse d'ouvrir l'IA sans moteur, et sa phrase
     * dit exactement ce qui manque (« aucun fournisseur actif », « aucune cle
     * enregistree »). La reecrire en « une erreur est survenue » couterait
     * l'information au moment ou elle sert.
     */
    onError: (erreur: unknown) => {
      const message = erreur instanceof Error ? erreur.message : "Enregistrement refusé.";
      toast.error(message);
    },
  });

  if (isPending || !charge) return <Skeleton className="h-64 w-full" />;

  const settings = charge.settings;
  const usage = charge.usage;
  const courant = brouillon ?? versBrouillon(settings);
  const cap = capValide(courant);
  const modifiable = aChange(courant, settings) && cap !== undefined;

  return (
    <div className="space-y-6">
      <ScopeNotice>
        Réglage de l'assistant IA de <strong>{activeProgram.name}</strong>. Il s'applique à tous les
        apprenants du programme, immédiatement.
      </ScopeNotice>

      {isSettingsInconsistent(settings) ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            L'assistant est ouvert mais aucun moteur n'est enregistré pour ce programme : les
            questions échoueront. Enregistrez une clé de fournisseur, ou fermez l'assistant.
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Crédits ce mois-ci" value={usage.creditsTotal} />
        <StatCard label="Messages" value={usage.messagesTotal} hint="Questions et réponses" />
        <StatCard label="Apprenants actifs" value={usage.learnersActive} hint="Ce mois-ci" />
        <StatCard
          label="Au plafond"
          value={usage.learnersAtCap}
          hint={
            usage.learnersAtCap > 0
              ? "Ces apprenants ne peuvent plus poser de question"
              : "Personne n'est bloqué"
          }
        />
      </div>

      <PanelCard
        title="Ouverture et plafond"
        description="Ce que l'apprenant peut faire, et jusqu'où."
        action={<Bot className="text-primary size-5" aria-hidden />}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="ai-enabled" className="text-sm font-medium">
                Assistant IA ouvert aux apprenants
              </Label>
              <p className="text-muted-foreground text-xs">
                {describeLearnerAvailability({
                  ...settings,
                  enabled: courant.enabled,
                  monthlyCreditCap: cap ?? settings.monthlyCreditCap,
                })}
              </p>
            </div>
            <Switch
              id="ai-enabled"
              checked={courant.enabled}
              onCheckedChange={(valeur) => setBrouillon({ ...courant, enabled: valeur })}
              aria-label="Ouvrir ou fermer l'assistant IA pour ce programme"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-cap" className="text-sm font-medium">
              Plafond mensuel par apprenant (crédits)
            </Label>
            <Input
              id="ai-cap"
              inputMode="numeric"
              className="max-w-40"
              value={courant.cap}
              onChange={(evenement) => setBrouillon({ ...courant, cap: evenement.target.value })}
              aria-describedby="ai-cap-aide"
            />
            <p id="ai-cap-aide" className="text-muted-foreground text-xs">
              Un modèle léger vaut 1 crédit, un modèle avancé 4, le vocal 12. À 0, aucune question
              n'est acceptée.
              {cap === undefined ? " Saisissez un nombre entier positif ou nul." : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Moteur :</span>
            <Badge variant={settings.activeProvider ? "secondary" : "outline"}>
              {settings.activeProvider ?? "aucun"}
            </Badge>
            <span className="text-muted-foreground">
              se règle avec la clé du fournisseur, pas ici.
            </span>
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title="Quand l'assistant doit-il répondre ?"
        description="C'est ce réglage qui décide du coût d'une question."
      >
        <RadioGroup
          value={courant.policy}
          onValueChange={(valeur) =>
            setBrouillon({ ...courant, policy: valeur as AiFallbackPolicy })
          }
          className="space-y-3"
        >
          {AI_FALLBACK_POLICIES.map((politique) => (
            <div key={politique} className="flex items-start gap-3 rounded-md border px-3 py-3">
              <RadioGroupItem value={politique} id={`ai-policy-${politique}`} className="mt-1" />
              <div className="min-w-0 space-y-1">
                <Label htmlFor={`ai-policy-${politique}`} className="text-sm font-medium">
                  {AI_FALLBACK_POLICY_LABELS_FR[politique]}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {AI_FALLBACK_POLICY_HINTS_FR[politique]}
                </p>
                <p className="text-xs font-medium">{AI_FALLBACK_POLICY_COST_FR[politique]}</p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </PanelCard>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          className="min-h-11"
          disabled={!modifiable || enregistrer.isPending}
          onClick={() => {
            if (cap === undefined) return;
            enregistrer.mutate({ enabled: courant.enabled, cap, policy: courant.policy });
          }}
        >
          {enregistrer.isPending ? "Enregistrement…" : "Enregistrer le réglage"}
        </Button>
        {aChange(courant, settings) ? (
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => setBrouillon(versBrouillon(settings))}
          >
            Annuler les modifications
          </Button>
        ) : null}
      </div>
    </div>
  );
}
