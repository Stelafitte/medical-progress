import { useQuery } from "@tanstack/react-query";
import { Camera, ShieldAlert } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useDataAccess } from "@/application/session";
import * as fx from "@/infrastructure/mock/fixtures";
import { ROLE_LABELS_FR } from "@/domain/roles";
import { PHOTO_NO_GUARANTEE_FR } from "@/domain/stageLog";

const FREQUENCY_FR: Record<string, string> = {
  per_entry: "à chaque activité",
  weekly: "hebdomadaire",
  per_placement: "par stage",
  per_semester: "par semestre",
};

/**
 * Administration : « Modèles de carnets de stage ».
 * Vue de configuration en lecture (commutateurs de démonstration non
 * persistés) : un seul moteur, une configuration par programme / module /
 * cohorte.
 */
export function StageLogTemplatesSection() {
  const dataAccess = useDataAccess();
  const { data, isPending } = useQuery({
    queryKey: ["stage-log-templates"],
    queryFn: () => dataAccess.stageLogs.listTemplates(),
  });

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  return (
    <section className="space-y-4" aria-labelledby="titre-modeles-carnets">
      <SectionHeading
        id="titre-modeles-carnets"
        title="Modèles de carnets de stage"
        description="Activation par programme, module/cursus et cohorte. Configuration de démonstration : aucune modification n'est enregistrée."
        action={
          <Badge variant="outline" className="font-normal">
            Simulé
          </Badge>
        }
      />

      <div className="grid gap-4">
        {data.map((template) => {
          const program = fx.programs.find((p) => p.id === template.programId);
          const cohorts =
            template.cohortIds.length === 0
              ? "toutes les cohortes du programme"
              : template.cohortIds
                  .map((id) => fx.cohorts.find((c) => c.id === id)?.label ?? id)
                  .join(" · ");
          return (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {program?.code ?? template.programId}
                  </Badge>
                  <CardTitle className="text-base">{template.label}</CardTitle>
                  <Badge variant="outline" className="font-normal">
                    version {template.version}
                  </Badge>
                  <div className="ms-auto flex items-center gap-2">
                    <Label htmlFor={`actif-${template.id}`} className="text-xs font-normal">
                      Activé
                    </Label>
                    <Switch
                      id={`actif-${template.id}`}
                      checked={template.enabled}
                      aria-label={`Activation du modèle ${template.label}`}
                    />
                  </div>
                </div>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">{template.moduleLabel}</Badge>
                  <Badge variant="outline">Cohortes : {cohorts}</Badge>
                  <Badge variant="outline">
                    Fréquence : {FREQUENCY_FR[template.entryFrequency]}
                  </Badge>
                  <Badge variant="outline">
                    Validateur : {ROLE_LABELS_FR[template.validatorRole]}
                  </Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="font-medium">Champs configurés</p>
                    <ul className="mt-1 list-disc space-y-1 ps-5 text-muted-foreground">
                      {template.fields.map((field) => (
                        <li key={field.key}>
                          {field.label} — {field.required ? "obligatoire" : "facultatif"}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">Objectifs et quotas</p>
                    <ul className="mt-1 list-disc space-y-1 ps-5 text-muted-foreground">
                      {template.objectives.map((objective) => (
                        <li key={objective.key}>
                          {objective.label} — {objective.quota} ({FREQUENCY_FR[objective.frequency]})
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <Camera className="size-4 text-primary" aria-hidden />
                    Photos autorisées
                    <Badge variant={template.photoPolicy.enabled ? "secondary" : "outline"}>
                      {template.photoPolicy.enabled ? "section activée" : "section désactivée"}
                    </Badge>
                  </p>
                  <ul className="space-y-2">
                    {template.photoPolicy.allowedObjects.map((object) => (
                      <li key={object.id} className="rounded-md bg-muted/50 p-2">
                        <p className="font-medium">
                          {object.label}{" "}
                          <Badge variant="outline" className="align-middle text-[10px]">
                            {object.required ? "obligatoire" : "facultatif"}
                          </Badge>
                          {object.custom ? (
                            <Badge variant="secondary" className="ml-1 align-middle text-[10px]">
                              autre objet personnalisé
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{object.framingInstruction}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">
                      Maximum {template.photoPolicy.maxPhotosPerEntry} photo(s) par entrée
                    </Badge>
                    <Badge variant="outline">
                      Validation responsable :{" "}
                      {template.photoPolicy.supervisorValidationRequired ? "requise" : "non requise"}
                    </Badge>
                    <Badge variant="outline">
                      Objet personnalisé :{" "}
                      {template.photoPolicy.allowCustomObject ? "autorisé" : "interdit"}
                    </Badge>
                    <Badge variant="outline">
                      Durée de conservation : {template.photoPolicy.retentionPolicyLabel}
                    </Badge>
                  </div>
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Seuls des fragments explicitement autorisés peuvent être photographiés : aucune
                    option ne permet de demander un document intégral. {PHOTO_NO_GUARANTEE_FR}
                  </p>
                  <Button type="button" variant="outline" size="sm" disabled>
                    Modifier le modèle — disponible après activation du backend
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
