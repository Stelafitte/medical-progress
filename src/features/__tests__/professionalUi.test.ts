/**
 * Contrats des espaces professionnels vérifiés au niveau source :
 * navigation distincte, protection des routes, absence d'envoi ou de stockage réel.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const routeFiles = readdirSync(new URL("../../routes", import.meta.url));

const navigation = read("src/components/layout/navigation.ts");

describe("navigation par rôle", () => {
  it("expose quatre espaces distincts", () => {
    for (const nav of [
      "LEARNER_NAV",
      "SUPERVISION_NAV",
      "PROGRAM_ADMIN_NAV",
      "PLATFORM_ADMIN_NAV",
    ]) {
      expect(navigation).toContain(nav);
    }
  });

  it("nomme explicitement les deux espaces professionnels", () => {
    expect(navigation).toContain("Supervision des stages");
    expect(navigation).toContain("Administration des programmes");
    expect(navigation).toContain("Administration plateforme");
  });
});

describe("protection des routes", () => {
  const supervisionRoutes = routeFiles.filter(
    (f) => f.startsWith("espace.encadrement.") && f !== "espace.encadrement.tsx",
  );
  const adminRoutes = routeFiles.filter(
    (f) => f.startsWith("espace.administration.") && f !== "espace.administration.tsx",
  );

  it("chaque écran d'encadrement est gardé par canAccessSupervision", () => {
    /* SEPT, ET PLUS NEUF (10/09) : « Cas et questions » et « Alertes » ont ete
       supprimes -- le premier n'avait aucun contenu, le second devenait une
       seconde boite que personne n'ouvre. Le compte reste verrouille pour que
       la disparition d'un onglet passe par une decision, pas par un oubli. */
    expect(supervisionRoutes.length).toBeGreaterThanOrEqual(7);
    for (const file of supervisionRoutes) {
      const source = read(`src/routes/${file}`);
      expect(source).toContain("canAccessSupervision");
      expect(source).toContain("AccessRestricted");
    }
  });

  it("chaque écran d'administration est gardé par canAccessProgramAdministration", () => {
    expect(adminRoutes.length).toBeGreaterThanOrEqual(7);
    for (const file of adminRoutes) {
      const source = read(`src/routes/${file}`);
      // Les anciennes URL conservées ne rendent rien : elles redirigent vers
      // l'onglet courant, lui-même gardé.
      if (source.includes("throw redirect(")) {
        expect(source).toContain("/espace/administration/");
        continue;
      }
      expect(source).toContain("canAccessProgramAdministration");
      expect(source).toContain("AccessRestricted");
    }
  });

  it("l'administration plateforme est gardée séparément", () => {
    const source = read("src/routes/espace.plateforme.tsx");
    expect(source).toContain("canAccessPlatformAdministration");
    expect(source).not.toContain("canAccessProgramAdministration");
  });
});

describe("périmètre visible", () => {
  it("l'encadrant ne charge que ses affectations", () => {
    const hook = read("src/features/supervision/useSupervision.ts");
    expect(hook).toContain("listAssignmentsForSupervisor");
    /*
     * LE PERIMETRE EST DANS LA REQUETE, PLUS DANS UN FILTRE APRES COUP (10/09).
     * `scopedToSupervisedEnrollments` ne gardait que des listes de maquette
     * chargees pour tout le programme ; elles ont disparu. Ce qui reste est
     * demande par identifiants d'inscription -- une liste qu'on n'a jamais
     * chargee ne peut pas fuir.
     */
    expect(hook).toContain("supervisedEnrollmentIds");
    expect(hook).toContain("listEnrollmentsByIds(enrollmentIds)");
    expect(hook).not.toContain("scopedToSupervisedEnrollments");
  });

  it("l'administration ne charge que le programme actif", () => {
    const hook = read("src/features/administration/useProgramAdmin.ts");
    expect(hook).toContain("activeProgram.id");
    expect(hook).not.toContain("listPrograms()");
  });
});

describe("aucune opération réelle", () => {
  const files = [
    "src/features/supervision/SupervisionMessages.tsx",
    "src/features/administration/AdminDocuments.tsx",
    "src/features/administration/PlatformAdminView.tsx",
  ].map((p) => [p, read(p)] as const);

  it("n'utilise ni stockage navigateur ni requête réseau", () => {
    for (const [path, source] of files) {
      expect(source, path).not.toContain("localStorage");
      expect(source, path).not.toContain("sessionStorage");
      expect(source, path).not.toContain("fetch(");
    }
  });

  /* ⚠️ CE CONTRAT A PERDU LA MOITIE DE SON OBJET LE 10/09, ET C'EST VOULU.
     Il gardait un assistant de communication « simule » qui devait ANNONCER ne
     rien envoyer. Cet assistant a ete supprime : il ne savait rien envoyer, ses
     listes etaient vides faute de donnees de maquette, et il portait le meme
     vocabulaire que l'ecran qui, lui, agit -- Stef s'y est trouve bloque en
     croyant utiliser le vrai outil. Ce qui reste garde est le vocabulaire du
     domaine, encore lu par d'autres ecrans. La garde de l'ecran REEL est plus
     bas : « envois reels de la communication interne ». */
  it("le domaine continue de nommer l'absence d'envoi là où elle subsiste", () => {
    expect(read("src/domain/administration.ts")).toContain("Aucun envoi réel");
  });

  it("l'assistant simulé ne réapparaît pas", () => {
    /* Le remettre reintroduirait deux ecrans au meme vocabulaire, dont un seul
       agit. Si un jour il revient, que ce soit une decision, pas un oubli. */
    expect(routeFiles).not.toContain("espace.administration.communications.simule.tsx");
    expect(read("src/routes/espace.administration.communications.tsx")).toContain(
      "CommunicationDirectorySection",
    );
  });

  it("marque la conservation comme à définir avant backend", () => {
    expect(read("src/features/administration/AccessGrantSection.tsx")).toContain(
      "RETENTION_TBD_FR",
    );
  });
});

describe("envois reels de la communication interne", () => {
  const dialogues = read("src/features/administration/CommunicationSendDialogs.tsx");
  const annuaire = read("src/features/administration/CommunicationDirectorySection.tsx");
  const connecteur = read("src/infrastructure/supabase/communicationDirectory.ts");

  it("n'ecrit jamais directement dans les tables de campagne", () => {
    /* La regle du 04/09 tient : l'ecriture appartient a ce qui a vu le
       resultat SMTP. Le navigateur cree un BROUILLON par fonction, et rien
       d'autre. Une policy `insert` ouverte serait un retour en arriere. */
    for (const source of [dialogues, annuaire, connecteur]) {
      expect(source).not.toContain('.from("communication_campaigns")');
      expect(source).not.toContain('.from("communication_deliveries")');
      expect(source).not.toContain('.from("notification_rules")');
    }
    expect(connecteur).toContain('rpc("create_communication_campaign"');
  });

  it("le mode essai precede l'envoi, et le bouton reel en depend", () => {
    /* Sans cette dependance, on enverrait sans avoir jamais vu le nombre reel
       de destinataires -- et un envoi ne se rattrape pas. */
    expect(dialogues).toContain("runCampaign(id, true)");
    expect(dialogues).toContain("disabled={!essai");
  });

  it("l'adresse en clair ne remonte jamais dans l'annuaire", () => {
    /* `program_directory` ne rend qu'un masque. Un ecran qui afficherait
       vingt-sept adresses serait un fichier d'adresses a copier. */
    expect(connecteur).toContain("email_masked");
    expect(annuaire).toContain("emailMasked");
    expect(annuaire).not.toContain("row.email");
  });

  it("le vivier et les comptes ne partent pas vers la meme fonction", () => {
    /* Les deux fonctions edge attendent un parametre du meme nom pour des
       identifiants differents : c'est le domaine qui les repartit. */
    expect(dialogues).toContain("planFirstLogin");
    expect(dialogues).toContain("invitePeople");
    expect(dialogues).toContain("resendFirstLogin");
  });
});

/*
 * CES TROIS CONTRATS GARDAIENT LA MAQUETTE (« signature simulée »,
 * `canSignPlacementReport`, `evaluateBulkValidation`) : ils verifiaient que les
 * ecrans d'encadrement ANNONÇAIENT ne rien faire. Depuis le 10/09 ils font, et
 * la garde change de sens -- elle verifie desormais que le geste passe par la
 * base, et par la seule fonction habilitee. Ce qui doit rester impossible n'a
 * pas change : une competence confirmee sans decision humaine, une connaissance
 * validee, un stage clos sans ecriture.
 */
describe("validation humaine et decision", () => {
  it("le bilan de fin de stage écrit une vraie décision, jamais une signature simulée", () => {
    const reports = read("src/features/supervision/SupervisionReports.tsx");
    expect(reports).toContain("validateStageLogBlock");
    expect(reports).not.toContain("signature simulée");
  });

  it("aucune compétence réelle sans confirmation humaine", () => {
    const competences = read("src/features/supervision/SupervisionCompetences.tsx");
    /* La confirmation est un geste humain explicite, porte par la fonction
       `validate_outcome_declaration` : aucun chemin ne valide en masse. */
    expect(competences).toContain("validateOutcomeDeclaration");
    /* Les connaissances theoriques sont hors champ. Le filtre vit dans
       `competencesDuProgramme`, une seule fois, pour que les quatre ecrans
       d'encadrement ne puissent pas en donner quatre versions -- et la base le
       refuse de toute façon. */
    expect(competences).toContain("competencesDuProgramme");
    expect(read("src/features/supervision/useSupervision.ts")).toContain('nature !== "knowledge"');
  });

  it("la décision de carnet porte sur une période de présence", () => {
    const logs = read("src/features/supervision/SupervisionLogs.tsx");
    expect(logs).toContain("PresenceCalendar");
    const calendrier = read("src/features/supervision/PresenceCalendar.tsx");
    expect(calendrier).toContain("validateStageLogBlock");
    expect(calendrier).toContain("coversFrom");
  });
});
