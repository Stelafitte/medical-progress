/**
 * Choisir ce que le programme RETIENT, et retirer ce qu'il ne veut plus.
 *
 * Un seul composant, monté à trois endroits : le Concepteur de programme, et
 * les onglets Connaissances et Compétences. C'est la règle du projet — une
 * entité, un mécanisme, plusieurs portes d'entrée — et c'est aussi ce qui
 * évite qu'on puisse cocher dans un écran ce qu'on ne peut pas décocher dans
 * l'autre.
 *
 * DEUX GESTES QU'IL NE FAUT PAS CONFONDRE, et que le texte de bas de bloc
 * explique à l'écran :
 *
 *   * **retenir / sortir du parcours** (`retained_at`) — l'acquis reste dans le
 *     référentiel du programme, visible et modifiable ici, mais il n'apparaît
 *     PAS dans le passeport de l'étudiant. C'est le geste courant : décider ce
 *     qui est exigé cette année.
 *   * **retirer du programme** — l'acquis est ARCHIVÉ. Réversible, jamais
 *     supprimé, mais il quitte toutes les listes actives.
 *
 * Cocher ne fait rien tant qu'un bouton n'a pas été utilisé. Une case qui
 * écrirait au clic rendrait impossible de préparer une sélection.
 */
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssociationItem } from "@/domain/outcomeAssociation";

/**
 * Le type de ligne vit dans le domaine, avec la fonction qui les construit
 * (`outcomeAssociationItems`). Les écrans ne fabriquent plus leurs lignes à la
 * main : c'est ce qui les faisait diverger.
 */
export type { AssociationItem } from "@/domain/outcomeAssociation";

export function ProgramAssociationList({
  title,
  items,
  busyIds,
  removeLabel,
  onRemove,
  onSetRetained,
}: {
  title: string;
  items: readonly AssociationItem[];
  busyIds: ReadonlySet<string>;
  removeLabel: string;
  onRemove: (ids: readonly string[]) => void;
  onSetRetained?: (ids: readonly string[], retained: boolean) => Promise<void>;
}) {
  const retainable = onSetRetained !== undefined;

  // État enregistré en base, tel que le parent vient de le relire.
  const persisted = useMemo(
    () => new Set(items.filter((item) => item.retained === true).map((item) => item.id)),
    [items],
  );
  // Signature de l'état enregistré : elle change quand le parent recharge la
  // liste après une écriture, et c'est le seul moment où l'on a le droit
  // d'écraser les cases que l'utilisateur est en train de manipuler.
  const persistedSignature = items.map((item) => `${item.id}:${item.retained === true}`).join("|");

  const [selected, setSelected] = useState<ReadonlySet<string>>(persisted);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rankFilter, setRankFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  useEffect(() => {
    setSelected(persisted);
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedSignature]);

  const ranks = useMemo(
    () => [...new Set(items.map((i) => i.rank).filter((r): r is string => Boolean(r)))].sort(),
    [items],
  );
  const groups = useMemo(
    () => [...new Set(items.map((i) => i.groupLabel).filter((g): g is string => Boolean(g)))],
    [items],
  );

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (needle === "" || item.label.toLowerCase().includes(needle)) &&
          (rankFilter === "" || item.rank === rankFilter) &&
          (groupFilter === "" || item.groupLabel === groupFilter),
      ),
    [items, needle, rankFilter, groupFilter],
  );

  if (items.length === 0) return null;

  const toggle = (id: string, checked: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  /**
   * Les boutons n'agissent que sur ce qui est VISIBLE.
   *
   * Un filtre qui cacherait des éléments tout en les emportant dans un retrait
   * serait le pire des deux mondes — c'est la règle déjà tenue par le filtre de
   * chemin de l'import de corpus : ce que vous voyez est ce qui se passera.
   */
  const selectedIds = visible.filter((item) => selected.has(item.id)).map((item) => item.id);
  const busy = selectedIds.some((id) => busyIds.has(id));

  const toRetain = visible
    .filter((item) => selected.has(item.id) && item.retained !== true)
    .map((item) => item.id);
  const toRelease = visible
    .filter((item) => !selected.has(item.id) && item.retained === true)
    .map((item) => item.id);
  const dirty = toRetain.length > 0 || toRelease.length > 0;

  const save = async () => {
    if (!onSetRetained || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (toRetain.length > 0) await onSetRetained(toRetain, true);
      if (toRelease.length > 0) await onSetRetained(toRelease, false);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Échec de l'enregistrement des sélections.",
      );
    } finally {
      setSaving(false);
    }
  };

  const renderItem = (item: AssociationItem) => (
    <li key={item.id} className="flex items-center gap-2">
      <Checkbox
        checked={selected.has(item.id)}
        disabled={busyIds.has(item.id) || saving}
        onCheckedChange={(checked) => toggle(item.id, checked === true)}
        aria-label={
          retainable ? `Retenir ${item.label} pour le parcours` : `Sélectionner ${item.label}`
        }
      />
      {item.rank ? (
        <Badge variant="outline" className="font-mono text-[10px] font-normal">
          {item.rank}
        </Badge>
      ) : null}
      <span className="text-sm">{item.label}</span>
      {retainable && item.retained !== true ? (
        <span className="text-muted-foreground rounded border px-1.5 py-0.5 text-xs">
          hors parcours
        </span>
      ) : null}
    </li>
  );

  const grouped = groups.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-medium">{title}</p>
        <span className="text-muted-foreground text-xs">
          {items.filter((i) => i.retained === true).length} retenu(s) sur {items.length}
          {visible.length !== items.length ? ` · ${visible.length} affiché(s)` : ""}
        </span>
      </div>

      {items.length > 12 ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`assoc-search-${title}`} className="text-muted-foreground text-xs">
              Rechercher
            </Label>
            <Input
              id={`assoc-search-${title}`}
              value={search}
              placeholder="Code ou intitulé…"
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-9 w-56"
            />
          </div>
          {ranks.length > 0 ? (
            <select
              aria-label="Filtrer par rang"
              className="border-border bg-background min-h-9 rounded-md border px-2 text-sm"
              value={rankFilter}
              onChange={(e) => setRankFilter(e.target.value)}
            >
              <option value="">Tous les rangs</option>
              {ranks.map((r) => (
                <option key={r} value={r}>
                  Rang {r}
                </option>
              ))}
            </select>
          ) : null}
          {groups.length > 1 ? (
            <select
              aria-label="Filtrer par chapitre"
              className="border-border bg-background min-h-9 max-w-72 rounded-md border px-2 text-sm"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">Tous les chapitres</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun élément ne correspond à ce filtre.</p>
      ) : grouped ? (
        <div className="space-y-1">
          {groups
            .filter((g) => visible.some((i) => i.groupLabel === g))
            .map((group) => {
              const inGroup = visible.filter((i) => i.groupLabel === group);
              const retenus = inGroup.filter((i) => i.retained === true).length;
              return (
                <details
                  key={group}
                  className="border-border rounded-md border px-3 py-2"
                  // Ouvert d'office quand un filtre est actif : sinon on
                  // chercherait et on ne verrait que des titres fermés.
                  open={needle !== "" || rankFilter !== "" || groupFilter !== ""}
                >
                  <summary className="cursor-pointer text-sm">
                    {group}{" "}
                    <span className="text-muted-foreground text-xs">
                      — {inGroup.length} acquis
                      {retainable ? `, ${retenus} retenu(s)` : ""}
                    </span>
                  </summary>
                  <ul className="mt-2 space-y-1.5">{inGroup.map(renderItem)}</ul>
                </details>
              );
            })}
          {visible.some((i) => !i.groupLabel) ? (
            <details className="border-border rounded-md border px-3 py-2">
              <summary className="cursor-pointer text-sm">
                Non rangés{" "}
                <span className="text-muted-foreground text-xs">
                  — {visible.filter((i) => !i.groupLabel).length} acquis
                </span>
              </summary>
              <ul className="mt-2 space-y-1.5">
                {visible.filter((i) => !i.groupLabel).map(renderItem)}
              </ul>
            </details>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-1.5">{visible.map(renderItem)}</ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/*
          Sur 327 lignes, cocher une à une n'est pas une option. Ce bouton
          n'agit que sur ce qui est AFFICHÉ : filtrer par chapitre ou par rang
          puis tout basculer est le geste réel — « je retiens les rangs A de
          cet item, pas les rangs B ».
        */}
        {visible.length > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={saving || busy}
            onClick={() => {
              const tousCoches = visible.every((item) => selected.has(item.id));
              setSelected((previous) => {
                const next = new Set(previous);
                for (const item of visible) {
                  if (tousCoches) next.delete(item.id);
                  else next.add(item.id);
                }
                return next;
              });
            }}
          >
            {visible.every((item) => selected.has(item.id))
              ? `Tout décocher (${visible.length})`
              : `Tout cocher (${visible.length})`}
          </Button>
        ) : null}
        {retainable ? (
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            disabled={!dirty || saving || busy}
            onClick={() => void save()}
          >
            {saving ? "Enregistrement…" : "Activer les sélections pour intégration au programme"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={selectedIds.length === 0 || busy || saving}
          onClick={() => {
            onRemove(selectedIds);
            setSelected(new Set());
          }}
        >
          {busy
            ? "Retrait en cours…"
            : `${removeLabel}${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {retainable
          ? "Cocher ne change rien tant que vous n'avez pas utilisé un bouton. Décocher puis activer sort l'élément du parcours sans le supprimer : il reste dans cette liste, mais disparaît du passeport de l'étudiant. Le retrait, lui, archive l'élément — réversible, jamais supprimé. Les boutons n'agissent que sur ce qui est affiché."
          : "Cocher ne retire rien : la sélection reste jusqu'à ce que vous utilisiez ce bouton. Le retrait est réversible — l'élément est archivé, jamais supprimé."}
      </p>
      {saveError ? <p className="text-destructive text-xs">{saveError}</p> : null}
    </div>
  );
}
