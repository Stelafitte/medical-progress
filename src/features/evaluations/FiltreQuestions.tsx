/**
 * LE FILTRE D'UNE SÉRIE DE QCM — le même pour l'étudiant et pour l'équipe.
 *
 * Stef (15/09) : « l'étudiant choisit le thème, l'item, le sous-item, le rang
 * A et/ou B et/ou ABC, le nombre ». Quatre axes, un seul composant, partagé
 * par « Je m'évalue maintenant » (étudiant) et « Ajouter une fenêtre »
 * (équipe) — pour que les deux parlent le même langage et lisent la même
 * banque.
 *
 *   - Thèmes : ceux du référentiel (outcome_themes), quand il y en a ;
 *   - Items : les chapitres de la banque (un chapitre = un item CNEC), lus
 *     avec leurs comptes ;
 *   - Sous-items : les sections des items choisis — ils n'apparaissent que
 *     lorsqu'au moins un item est choisi, pour ne pas noyer l'écran sous 740
 *     pastilles ;
 *   - Rangs : A, B, C, combinables.
 *
 * Rien de coché sur un axe = pas de filtre sur cet axe.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useDataAccess } from "@/application/session";
import type { OutcomeTheme, ProgramId } from "@/domain/types";
import type { QuestionSectionRow } from "@/application/ports/repositories";

export type Rang = "A" | "B" | "C";
export const RANGS: readonly Rang[] = ["A", "B", "C"];

export interface FiltreValeur {
  readonly themeIds: readonly string[];
  readonly chapters: readonly number[];
  readonly sections: readonly string[];
  readonly ranks: readonly Rang[];
}

export const FILTRE_VIDE: FiltreValeur = { themeIds: [], chapters: [], sections: [], ranks: [] };

/** Une clé stable pour les `queryKey` : le filtre en une chaîne. */
export const cleFiltre = (v: FiltreValeur): string =>
  [
    [...v.themeIds].sort().join(","),
    [...v.chapters].sort((a, b) => a - b).join(","),
    [...v.sections].sort().join(","),
    [...v.ranks].sort().join(","),
  ].join("|");

/** « CHAPITRE 1: Item 221 Athérome… » → « Item 221 Athérome… ». */
const titreItem = (row: QuestionSectionRow): string =>
  row.chapterTitle.replace(/^chapitre\s*\d+\s*[:.\-–—]\s*/i, "");

/** Le thème du référentiel qui porte cet item (« Item 221 — … »), s'il existe. */
export const themePourItem = (
  themes: readonly OutcomeTheme[],
  itemCode: string,
): OutcomeTheme | undefined =>
  themes.find((t) => new RegExp(`^item\\s*${itemCode}\\b`, "i").test(t.label.trim()));

const CHIP = "rounded-full border px-3 py-1 text-xs";
const CHIP_ON = "bg-primary text-primary-foreground border-primary";
const CHIP_OFF = "border-border hover:bg-muted";

export function FiltreQuestions({
  programId,
  source,
  themes,
  value,
  onChange,
  idPrefix,
}: {
  readonly programId: ProgramId;
  readonly source: string;
  readonly themes: readonly OutcomeTheme[];
  readonly value: FiltreValeur;
  readonly onChange: (next: FiltreValeur) => void;
  readonly idPrefix: string;
}) {
  const dataAccess = useDataAccess();
  const sections = useQuery({
    queryKey: ["question-sections", programId, source],
    queryFn: () => dataAccess.assessments.listQuestionSections(programId, source),
  });

  const themesTries = useMemo(() => [...themes].sort((a, b) => a.position - b.position), [themes]);

  /*
   * Les items : un par chapitre, avec le total de ses sections. Le libellé
   * vient du référentiel quand il a un thème « Item 221 — … » (c'est le cas
   * du DFASM-CARDIO : ses thèmes SONT les items), sinon du titre du chapitre
   * importé, sinon du numéro.
   */
  const items = useMemo(() => {
    const parChapitre = new Map<
      number,
      { titre: string; code: string; total: number; sections: QuestionSectionRow[] }
    >();
    for (const r of sections.data ?? []) {
      const it = parChapitre.get(r.chapter) ?? {
        titre: themePourItem(themes, r.itemCode)?.label ?? titreItem(r),
        code: r.itemCode,
        total: 0,
        sections: [],
      };
      it.total += r.published;
      it.sections.push(r);
      parChapitre.set(r.chapter, it);
    }
    return [...parChapitre.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([chapter, it]) => ({ chapter, ...it }));
  }, [sections.data, themes]);

  /*
   * Une banque de QCM se filtre par ITEM : ses questions portent sur des
   * connaissances, pas sur des compétences. Dès que la banque a des
   * chapitres, l'axe « Thèmes » du référentiel ferait doublon (les thèmes du
   * DFASM-CARDIO sont les items) ou tournerait à vide (thèmes de compétences)
   * : il n'apparaît que pour une banque sans chapitres.
   */

  const itemsChoisis = items.filter((it) => value.chapters.includes(it.chapter));

  function basculerTheme(id: string) {
    const on = value.themeIds.includes(id);
    onChange({
      ...value,
      themeIds: on ? value.themeIds.filter((x) => x !== id) : [...value.themeIds, id],
    });
  }
  function basculerItem(chapter: number) {
    const on = value.chapters.includes(chapter);
    onChange({
      ...value,
      chapters: on ? value.chapters.filter((c) => c !== chapter) : [...value.chapters, chapter],
      // Retirer un item retire ses sous-items : on ne filtre pas sur ce qu'on ne voit plus.
      sections: on ? value.sections.filter((k) => !k.startsWith(`${chapter}|`)) : value.sections,
    });
  }
  function basculerSection(key: string) {
    const on = value.sections.includes(key);
    onChange({
      ...value,
      sections: on ? value.sections.filter((k) => k !== key) : [...value.sections, key],
    });
  }
  function basculerRang(r: Rang, on: boolean) {
    onChange({ ...value, ranks: on ? [...value.ranks, r] : value.ranks.filter((x) => x !== r) });
  }

  return (
    <div className="space-y-3">
      {themesTries.length > 0 && items.length === 0 ? (
        <div className="space-y-1">
          <p className="text-xs">Thèmes — aucun coché : tous</p>
          <div className="flex flex-wrap gap-2">
            {themesTries.map((t) => {
              const on = value.themeIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => basculerTheme(t.id)}
                  className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-xs">Items — aucun coché : tous</p>
        {sections.isPending ? (
          <p className="text-muted-foreground text-xs">Lecture de la banque…</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-xs">Cette banque ne porte pas de chapitres.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((it) => {
              const on = value.chapters.includes(it.chapter);
              return (
                <button
                  key={it.chapter}
                  type="button"
                  aria-pressed={on}
                  title={`${it.titre} — ${it.total} question(s)`}
                  onClick={() => basculerItem(it.chapter)}
                  className={`${CHIP} inline-flex max-w-full items-center gap-1 ${on ? CHIP_ON : CHIP_OFF}`}
                >
                  <span className="max-w-[14rem] truncate">{it.titre}</span>
                  <span className="shrink-0 opacity-70">({it.total})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {itemsChoisis.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs">Sous-items — aucun coché : tout l'item</p>
          {itemsChoisis.map((it) => (
            <div key={it.chapter} className="space-y-1">
              {itemsChoisis.length > 1 ? (
                <p className="text-muted-foreground text-xs">{it.titre}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {it.sections.map((s) => {
                  const on = value.sections.includes(s.sectionKey);
                  return (
                    <button
                      key={s.sectionKey}
                      type="button"
                      aria-pressed={on}
                      title={`${s.sectionLabel} — ${s.published} question(s)`}
                      onClick={() => basculerSection(s.sectionKey)}
                      className={`${CHIP} inline-flex max-w-full items-center gap-1 ${on ? CHIP_ON : CHIP_OFF}`}
                    >
                      <span className="max-w-[16rem] truncate">{s.sectionLabel}</span>
                      <span className="shrink-0 opacity-70">({s.published})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <p className="text-xs">Rangs — aucun coché : tous</p>
        {RANGS.map((r) => (
          <div key={r} className="flex items-center gap-1.5">
            <Checkbox
              id={`${idPrefix}-rang-${r}`}
              checked={value.ranks.includes(r)}
              onCheckedChange={(c) => basculerRang(r, c === true)}
            />
            <Label htmlFor={`${idPrefix}-rang-${r}`} className="text-sm font-normal">
              {r}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
