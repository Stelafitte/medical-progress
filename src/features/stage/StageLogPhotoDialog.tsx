import { useState } from "react";
import { AlertTriangle, Camera, ImagePlus, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  PHOTO_BANNER_FR,
  PHOTO_CHECKLIST,
  PHOTO_DECLARATION_FR,
  PHOTO_NO_GUARANTEE_FR,
  buildPlaceholderAttachment,
  evaluatePhotoAttach,
  photoRequirement,
  type PhotoChecklistKey,
  type PhotoRequirementId,
  type StageLogPhotoAttachment,
  type StageLogTemplate,
} from "@/domain/stageLog";

/**
 * Écran de confirmation AVANT toute sélection d'image :
 * objet attendu imposé par le modèle, checklist obligatoire, déclaration
 * explicite. Aucune image réelle n'est lue ni stockée : la pièce jointe est un
 * placeholder de démonstration.
 */
export function StageLogPhotoDialog({
  template,
  currentPhotoCount,
  onAttach,
}: {
  template: StageLogTemplate;
  currentPhotoCount: number;
  onAttach: (photo: StageLogPhotoAttachment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [requirementId, setRequirementId] = useState<PhotoRequirementId | null>(null);
  const [checked, setChecked] = useState<readonly PhotoChecklistKey[]>([]);
  const [declared, setDeclared] = useState(false);

  const decision = evaluatePhotoAttach(template, {
    requirementId,
    checked,
    declarationConfirmed: declared,
    currentPhotoCount,
  });
  const requirement = photoRequirement(template, requirementId);

  const reset = () => {
    setRequirementId(null);
    setChecked([]);
    setDeclared(false);
  };

  const toggle = (key: PhotoChecklistKey, value: boolean) =>
    setChecked((prev) => (value ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)));

  const attach = () => {
    if (!requirement || !decision.allowed) return;
    onAttach(buildPlaceholderAttachment(requirement, new Date().toISOString()));
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Camera className="size-4" aria-hidden />
          Prendre une photo / Choisir une photo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Photo d'un fragment autorisé</DialogTitle>
          <DialogDescription>
            {template.label} — version {template.version}. Seul le fragment défini par
            l'administrateur du programme peut être photographié.
          </DialogDescription>
        </DialogHeader>

        <p
          role="note"
          className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {PHOTO_BANNER_FR}
        </p>

        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <strong>Règle absolue :</strong> la photo ne doit contenir aucun élément nominatif ou
          identifiant patient — nom, prénom, date de naissance, IPP/NIP, numéro de séjour ou de
          dossier, adresse, coordonnées, code-barres ou QR code.
        </p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Objet attendu de la photo</legend>
          <RadioGroup
            value={requirementId ?? ""}
            onValueChange={(value) => setRequirementId(value as PhotoRequirementId)}
          >
            {template.photoPolicy.allowedObjects.map((object) => (
              <div key={object.id} className="flex items-start gap-2">
                <RadioGroupItem value={object.id} id={`objet-${object.id}`} className="mt-1" />
                <Label htmlFor={`objet-${object.id}`} className="font-normal leading-snug">
                  {object.label}
                  {object.required ? (
                    <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                      obligatoire
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                      facultatif
                    </Badge>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {object.framingInstruction}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Checklist obligatoire avant la prise de vue
          </legend>
          {PHOTO_CHECKLIST.map((item) => (
            <div key={item.key} className="flex items-start gap-2">
              <Checkbox
                id={`check-${item.key}`}
                className="mt-0.5"
                checked={checked.includes(item.key)}
                onCheckedChange={(value) => toggle(item.key, value === true)}
              />
              <Label htmlFor={`check-${item.key}`} className="font-normal leading-snug">
                {item.label}
              </Label>
            </div>
          ))}
        </fieldset>

        <div className="flex items-start gap-2 rounded-md border border-border p-3">
          <Checkbox
            id="declaration-nominatif"
            className="mt-0.5"
            checked={declared}
            onCheckedChange={(value) => setDeclared(value === true)}
          />
          <Label htmlFor="declaration-nominatif" className="font-normal leading-snug">
            {PHOTO_DECLARATION_FR} <span aria-hidden>*</span>
          </Label>
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {PHOTO_NO_GUARANTEE_FR} Conservation : {template.photoPolicy.retentionPolicyLabel}.
          Maximum {template.photoPolicy.maxPhotosPerEntry} photo(s) par entrée.
        </p>

        {!decision.allowed ? (
          <ul role="alert" className="space-y-1 rounded-md border border-border p-3 text-sm">
            {decision.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}

        <DialogFooter className="flex-wrap items-center gap-2">
          <Badge variant="outline">Pièce jointe de démonstration</Badge>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button type="button" className="gap-2" disabled={!decision.allowed} onClick={attach}>
            <ImagePlus className="size-4" aria-hidden />
            Joindre le fragment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
