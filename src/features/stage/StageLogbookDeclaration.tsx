/**
 * MON CARNET DE STAGE — la forme « carnet dématérialisé » (16/09).
 *
 * L'apprenant d'un DIU ne coche pas des jours de présence : il tient une liste
 * de ce qu'il a réalisé, face à ce qui est attendu de lui — « 150 ETT, 50 ETO,
 * 50 échos de stress ». Le modèle est configuré par l'équipe (onglet
 * Évaluations → Carnets de stage) ; cet écran le remplit.
 *
 * CE QU'IL DÉCLARE, CE QU'IL NE PROUVE PAS. Un compte saisi ici est une
 * DÉCLARATION : elle ne vaut pas acquisition, exactement comme la déclaration
 * d'une compétence. C'est l'encadrant qui la confirme, et une déclaration
 * modifiée après confirmation la reperd — l'encadrant a confirmé un chiffre,
 * pas une promesse.
 *
 * ⚠️ ÉTAT LOCAL PENDANT LA FRAPPE, ÉCRITURE À LA SORTIE DU CHAMP — la même
 * règle que « Mon expérience d'acquisition » (10/09) : enregistrer à chaque
 * touche enverrait une requête par caractère.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess } from "@/application/session";
import { avancementDeLItem } from "@/domain/stageTracking";
import type { StageLogTemplate } from "@/domain/stageLog";
import type { EnrollmentId } from "@/domain/types";

export function StageLogbookDeclaration({
  enrollmentId,
  templateId,
}: {
  readonly enrollmentId: EnrollmentId;
  readonly templateId: string;
}) {
  const dataAccess = useDataAccess();
  const [erreur, setErreur] = useState<string | null>(null);

  const carnets = useQuery({
    queryKey: ["carnets-de-stage-apprenant", templateId],
    queryFn: () => dataAccess.stageLogs.listTemplates(),
  });
  const declarations = useQuery({
    queryKey: ["mon-carnet", enrollmentId],
    queryFn: () => dataAccess.stageLogs.listLogbookReports(enrollmentId),
  });

  const modele: StageLogTemplate | undefined = (carnets.data ?? []).find(
    (c) => c.id === templateId,
  );

  if (carnets.isPending || declarations.isPending) return <Skeleton className="h-40 w-full" />;
  if (!modele) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Le carnet demandé par votre programme n'est pas lisible pour l'instant.
      </p>
    );
  }

  const declare = (cle: string) => (declarations.data ?? []).find((d) => d.objectiveKey === cle);

  const total = modele.objectives.reduce((s, o) => s + o.quota, 0);
  const fait = modele.objectives.reduce((s, o) => s + (declare(o.key)?.declaredCount ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
      <div className="px-4 pb-3.5 pt-4">
        <h2 className="font-display text-[16.5px] leading-tight tracking-[-0.01em]">
          {modele.label}
        </h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {modele.description || "Ce que votre programme attend de vous pendant ce stage."} —{" "}
          <b style={{ fontVariantNumeric: "tabular-nums" }}>{fait}</b> déclaré(s) sur {total}.
        </p>
      </div>
      {erreur ? <p className="text-destructive px-4 pb-2 text-xs">{erreur}</p> : null}
      <ul className="divide-y divide-border border-t">
        {modele.objectives.map((objectif) => {
          const ligne = declare(objectif.key);
          const etat = avancementDeLItem(ligne?.declaredCount ?? 0, objectif.quota);
          return (
            <LigneObjectif
              key={objectif.key}
              label={objectif.label}
              attendu={etat.attendu}
              pourcent={etat.pourcent}
              valeur={ligne?.declaredCount ?? 0}
              note={ligne?.note ?? ""}
              confirme={Boolean(ligne?.validatedAt)}
              onEnregistrer={async (compte, note) => {
                setErreur(null);
                try {
                  await dataAccess.stageLogs.declareLogbookCount({
                    enrollmentId,
                    templateId: modele.id,
                    objectiveKey: objectif.key,
                    count: compte,
                    note,
                  });
                  await declarations.refetch();
                } catch (reason) {
                  setErreur(
                    reason instanceof Error ? reason.message : "Enregistrement impossible.",
                  );
                }
              }}
            />
          );
        })}
      </ul>
    </section>
  );
}

function LigneObjectif({
  label,
  attendu,
  pourcent,
  valeur,
  note,
  confirme,
  onEnregistrer,
}: {
  readonly label: string;
  readonly attendu: number;
  readonly pourcent: number;
  readonly valeur: number;
  readonly note: string;
  readonly confirme: boolean;
  readonly onEnregistrer: (compte: number, note: string) => Promise<void>;
}) {
  const [compte, setCompte] = useState(String(valeur));
  const [texte, setTexte] = useState(note);

  useEffect(() => {
    setCompte(String(valeur));
    setTexte(note);
  }, [valeur, note]);

  const envoyer = () => {
    const n = Number.parseInt(compte, 10);
    const propre = Number.isFinite(n) && n >= 0 ? n : 0;
    if (propre === valeur && texte === note) return;
    void onEnregistrer(propre, texte);
  };

  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-display text-[16.5px] leading-tight tracking-[-0.01em]">
              {label}
            </span>
            <span
              className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {valeur} / {attendu}
            </span>
            {confirme ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-foreground">
                <BadgeCheck className="size-3.5" aria-hidden />
                confirmé
              </span>
            ) : null}
          </p>
          <span className="mt-2 flex h-[3px] overflow-hidden rounded-sm bg-card-sunk" aria-hidden>
            <span className="block h-full bg-field" style={{ width: `${pourcent}%` }} />
          </span>
        </div>
        <div className="w-24 space-y-1">
          <Label htmlFor={`compte-${label}`} className="text-xs">
            Réalisés
          </Label>
          <Input
            id={`compte-${label}`}
            inputMode="numeric"
            value={compte}
            onChange={(e) => setCompte(e.target.value)}
            onBlur={envoyer}
          />
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <Label htmlFor={`note-${label}`} className="text-xs">
          Précision (facultative)
        </Label>
        <Input
          id={`note-${label}`}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={envoyer}
          placeholder="Contexte, services, encadrant…"
        />
      </div>
    </li>
  );
}
