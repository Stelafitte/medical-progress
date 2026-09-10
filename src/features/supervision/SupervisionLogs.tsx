import { SectionHeading } from "@/components/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { learnerName, useSupervision } from "@/features/supervision/useSupervision";
import { PresenceCalendar } from "@/features/supervision/PresenceCalendar";

/**
 * CARNETS A VALIDER — recentré sur la présence (10/09).
 *
 * ⚠️ CE QUE CETTE PAGE FAISAIT JUSQU'ICI, et pourquoi elle est refaite. Elle
 * mélangeait trois choses sans dire laquelle on validait : un module de revue
 * par carnet, un « traitement rapide groupé » dont les trois boutons
 * n'écrivaient rien (« Démonstration : … aucune écriture réelle »), et un
 * historique qualifié de « journal simulé ». Question de Stef, 10/09 : « on
 * valide quoi ici ? » — la page ne répondait pas.
 *
 * ELLE VALIDE DES JOURS DE PRESENCE, sur une PERIODE, avec un commentaire.
 * C'est ce que porte `stage_log_validations` depuis le 31/08, et rien d'autre.
 * Les compétences ont leur propre onglet et leur propre geste.
 */
export function SupervisionLogs() {
  const { data, isPending } = useSupervision();

  if (isPending || !data) return <Skeleton className="h-72 w-full" />;

  const decisions = data.logsToValidate
    .flatMap((log) =>
      log.validations.map((v) => ({
        log,
        validation: v,
        nom: learnerName(data, log.enrollmentId),
      })),
    )
    .sort((a, b) => b.validation.decidedAt.localeCompare(a.validation.decidedAt));

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Carnets à valider"
        level={1}
        description="Les jours de présence déclarés par vos étudiants, semaine par semaine, et le commentaire laissé."
      />

      <ScopeNotice>
        Vous ne voyez que les carnets des étudiants de vos groupes d'encadrement. Le périmètre est
        posé en base, pas par cet écran.
      </ScopeNotice>

      <PanelCard
        title="Présence déclarée"
        description="Une case par jour ouvré. Cliquez une semaine pour lire les journées et décider."
      >
        <PresenceCalendar scope={data} />
      </PanelCard>

      <PanelCard title="Historique des décisions" description="Conservé par carnet et par période.">
        {decisions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune décision enregistrée à ce jour.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {decisions.map((d) => (
              <li key={`${d.log.id}-${d.validation.decidedAt}`}>
                <span className="text-muted-foreground">
                  {new Date(d.validation.decidedAt).toLocaleDateString("fr-FR")}
                </span>{" "}
                — {d.nom} :{" "}
                {d.validation.decision === "validated" ? "validé" : "correction demandée"}
                {d.validation.comment ? (
                  <span className="text-muted-foreground"> · {d.validation.comment}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
