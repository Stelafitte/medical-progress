/**
 * RETIRÉ le 27/08/2026 : les modalités d'évaluation sont désormais lues et
 * créées pour de vrai via `dataAccess.assessments` (table `assessment_modalities`,
 * RPC Supabase `create_assessment_modality`), plus via ce store local en mémoire.
 * Fichier conservé vide (non supprimable depuis l'environnement d'édition
 * utilisé, même contrainte que `accessGrantStore.ts`) : aucun import ne doit
 * plus en dépendre.
 */
export {};
