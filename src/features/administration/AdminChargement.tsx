/**
 * CE QUE L'ADMINISTRATION AFFICHE TANT QUE SON PÉRIMÈTRE N'EST PAS LÀ.
 *
 * `useProgramAdmin` charge tout le programme d'un coup ; si UN appel échoue
 * (une migration pas encore passée en base, un droit manquant), l'écran
 * restait sur un squelette gris, indéfiniment, sans un mot — mesuré le
 * 15/09 : « column assessment_sessions.closes_on does not exist », et dix
 * onglets muets. Ici : le squelette tant qu'on charge, et l'erreur en clair
 * dès qu'il y en a une.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function AdminChargement({ error }: { readonly error: unknown }) {
  if (!error) return <Skeleton className="h-80 w-full" />;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="border-destructive/40 bg-destructive/5 rounded-md border p-4 text-sm">
      <p className="font-medium">Le programme n'a pas pu être chargé.</p>
      <p className="text-muted-foreground mt-1 break-words">{message}</p>
      <p className="text-muted-foreground mt-2 text-xs">
        Si le message parle d'une colonne ou d'une fonction inconnue, une migration n'a pas encore
        été exécutée en base.
      </p>
    </div>
  );
}
