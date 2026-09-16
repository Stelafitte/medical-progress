/**
 * CONFIGURER UN CARNET DE STAGE — l'onglet Évaluations, sous l'atelier.
 *
 * Stef, 16/09 : « il doit y avoir dans l'onglet Admin Évaluation : configurer
 * carnet de stage : nom, date de création ou modification, types et noms
 * d'items en texte libre, et nombre pour chacun. Ex ETT : 150, ETO : 50, écho
 * stress : 50. Une fois configuré, il apparaît dans les carnets de stage
 * disponibles à la Conception. »
 *
 * ⚠️ L'OBJET EXISTAIT DEPUIS LE 31/08, SANS ÉCRAN. `stage_log_templates`
 * portait déjà `objectives` = {clé, libellé, quota} — c'est exactement
 * « ETT : 150 ». On ne crée donc aucune table jumelle : cet écran lui donne
 * enfin ses portes d'écriture (migration 20260916220000).
 *
 * LA CLÉ D'UN ITEM EST DÉRIVÉE DE SON LIBELLÉ, côté base, et ne change plus
 * ensuite : corriger « ETT » en « ETT (transthoracique) » ne fait pas perdre
 * à l'étudiant les 43 examens qu'il a déjà déclarés.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { useDataAccess } from "@/application/session";
import type { ProgramId } from "@/domain/types";
import type { StageLogTemplate } from "@/domain/stageLog";

interface ItemSaisi {
  readonly label: string;
  readonly quota: string;
}

const VIDE: readonly ItemSaisi[] = [{ label: "", quota: "" }];

export function StageLogbookTemplates({ programId }: { readonly programId: ProgramId }) {
  const dataAccess = useDataAccess();
  const [ouvert, setOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<StageLogTemplate | null>(null);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<readonly ItemSaisi[]>(VIDE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carnets = useQuery({
    queryKey: ["carnets-de-stage", programId],
    queryFn: () => dataAccess.stageLogs.listTemplates(programId),
  });

  function nouveau() {
    setEnEdition(null);
    setNom("");
    setDescription("");
    setItems(VIDE);
    setError(null);
    setOuvert(true);
  }

  function reprendre(carnet: StageLogTemplate) {
    setEnEdition(carnet);
    setNom(carnet.label);
    setDescription(carnet.description);
    setItems(
      carnet.objectives.length > 0
        ? carnet.objectives.map((o) => ({ label: o.label, quota: String(o.quota) }))
        : VIDE,
    );
    setError(null);
    setOuvert(true);
  }

  async function enregistrer() {
    setBusy(true);
    setError(null);
    try {
      await dataAccess.stageLogs.upsertStageLogTemplate({
        programId,
        ...(enEdition ? { templateId: enEdition.id } : {}),
        label: nom,
        description,
        objectives: items
          .filter((i) => i.label.trim().length > 0)
          .map((i) => ({ label: i.label.trim(), quota: Number.parseInt(i.quota, 10) || 0 })),
      });
      setOuvert(false);
      await carnets.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function basculerActif(carnet: StageLogTemplate) {
    setError(null);
    try {
      await dataAccess.stageLogs.archiveStageLogTemplate(carnet.id, !carnet.enabled);
      await carnets.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Changement impossible.");
    }
  }

  const liste = carnets.data ?? [];

  return (
    <PanelCard
      title="Carnets de stage"
      description="Un carnet = un nom et des items comptés (« ETT : 150 »). Une fois configuré, il est proposé à la Conception, sous « Journal de stage »."
      action={
        <Button type="button" size="sm" className="min-h-9 gap-1" onClick={nouveau}>
          <Plus className="size-4" aria-hidden />
          Nouveau carnet
        </Button>
      }
    >
      {error ? <p className="text-destructive mb-3 text-sm">{error}</p> : null}

      {carnets.isPending ? <Skeleton className="h-20 w-full" /> : null}

      {!carnets.isPending && liste.length === 0 && !ouvert ? (
        <EmptyState>
          Aucun carnet configuré. Le DFASM n'en a pas besoin — ses étudiants cochent leurs journées
          de présence. Un DIU, lui, en demande un : « 150 ETT, 50 ETO, 50 échos de stress ».
        </EmptyState>
      ) : null}

      {liste.length > 0 ? (
        <ul className="divide-border border-border mb-4 divide-y rounded-md border">
          {liste.map((carnet) => (
            <li key={carnet.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{carnet.label}</span>
                {carnet.description ? (
                  <span className="text-muted-foreground"> · {carnet.description}</span>
                ) : null}
                <span className="text-muted-foreground block text-xs">
                  {carnet.objectives.length} item(s) ·{" "}
                  {carnet.objectives.reduce((s, o) => s + o.quota, 0)} au total
                  {carnet.updatedAt
                    ? ` · modifié le ${formatFrDate(carnet.updatedAt.slice(0, 10))}`
                    : ""}
                </span>
              </span>
              {carnet.enabled ? null : (
                <Badge variant="outline" className="text-muted-foreground font-normal">
                  retiré
                </Badge>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9"
                onClick={() => reprendre(carnet)}
              >
                Modifier
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-9"
                onClick={() => void basculerActif(carnet)}
              >
                {carnet.enabled ? "Retirer" : "Remettre"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {ouvert ? (
        <div className="border-border space-y-3 rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="carnet-nom" className="text-xs">
                Nom du carnet
              </Label>
              <Input
                id="carnet-nom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Carnet du DIU d'échocardiographie"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="carnet-desc" className="text-xs">
                Description (facultative)
              </Label>
              <Input
                id="carnet-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Liste des examens réalisés pendant le stage"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">
              Items comptés{" "}
              <span className="text-muted-foreground font-normal">
                — un libellé libre, un nombre attendu
              </span>
            </p>
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li key={index} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1 space-y-1">
                    <Label htmlFor={`item-label-${index}`} className="text-xs">
                      Libellé
                    </Label>
                    <Input
                      id={`item-label-${index}`}
                      value={item.label}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x, i) => (i === index ? { ...x, label: e.target.value } : x)),
                        )
                      }
                      placeholder="ETT"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label htmlFor={`item-quota-${index}`} className="text-xs">
                      Nombre
                    </Label>
                    <Input
                      id={`item-quota-${index}`}
                      inputMode="numeric"
                      value={item.quota}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x, i) => (i === index ? { ...x, quota: e.target.value } : x)),
                        )
                      }
                      placeholder="150"
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-11 shrink-0"
                    aria-label={`Retirer l'item ${index + 1}`}
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9 gap-1"
              onClick={() => setItems((prev) => [...prev, { label: "", quota: "" }])}
            >
              <Plus className="size-4" aria-hidden />
              Ajouter un item
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={busy || nom.trim().length === 0}
              onClick={() => void enregistrer()}
            >
              {busy
                ? "Enregistrement…"
                : enEdition
                  ? "Enregistrer les corrections"
                  : "Créer le carnet"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => setOuvert(false)}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
    </PanelCard>
  );
}
