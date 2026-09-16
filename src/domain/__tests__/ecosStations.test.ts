/**
 * CE QUE L'APPRENANT VOIT DE L'ECOS SIMULÉ — la règle posée par Stef le 16/09 :
 * l'équipe coche la modalité, puis choisit les stations ; sans sélection,
 * l'apprenant ne voit rien.
 */
import { describe, expect, it } from "vitest";
import { ECOS_EXTERNAL_STATIONS, ecosStationsOffertes, estEcosSimule } from "../ecos";
import type { AssessmentModality, CohortAssessmentLink } from "../assessmentModality";

const modalite = (patch: Partial<AssessmentModality>): AssessmentModality =>
  ({
    id: "mod-ecos",
    programId: "prog-a",
    name: "ECOS simulé",
    mode: "online",
    subtype: "ecos",
    usage: "self_assessment",
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:00:00Z",
    ...patch,
  }) as AssessmentModality;

const lien = (patch: Partial<CohortAssessmentLink>): CohortAssessmentLink => ({
  programId: "prog-a",
  cohortId: "coh-a",
  modalityId: "mod-ecos",
  isOpen: true,
  freeAccess: true,
  ...patch,
});

describe("l'ECOS simulé se reconnaît au format ET au lieu", () => {
  it("un ECOS en ligne est un ECOS simulé", () => {
    expect(estEcosSimule(modalite({}))).toBe(true);
  });

  it("un ECOS en présentiel (fin de stage, national à blanc) n'en est pas un", () => {
    expect(estEcosSimule(modalite({ mode: "in_person" }))).toBe(false);
  });

  it("un QCM en ligne n'en est pas un", () => {
    expect(estEcosSimule(modalite({ subtype: "qcm" }))).toBe(false);
  });
});

describe("les stations offertes à une promotion", () => {
  it("sans sélection, l'apprenant ne voit rien", () => {
    expect(ecosStationsOffertes([modalite({})], [lien({})])).toEqual([]);
  });

  it("une sélection vide vaut aucune station", () => {
    expect(ecosStationsOffertes([modalite({})], [lien({ ecosStations: [] })])).toEqual([]);
  });

  it("rend les stations cochées, dans l'ordre du catalogue", () => {
    const cles = [ECOS_EXTERNAL_STATIONS[2]!.key, ECOS_EXTERNAL_STATIONS[0]!.key];
    const offertes = ecosStationsOffertes([modalite({})], [lien({ ecosStations: cles })]);
    expect(offertes.map((s) => s.key)).toEqual([
      ECOS_EXTERNAL_STATIONS[0]!.key,
      ECOS_EXTERNAL_STATIONS[2]!.key,
    ]);
  });

  it("ignore une clé que le catalogue ne connaît plus", () => {
    const offertes = ecosStationsOffertes(
      [modalite({})],
      [lien({ ecosStations: ["station-disparue", ECOS_EXTERNAL_STATIONS[1]!.key] })],
    );
    expect(offertes.map((s) => s.key)).toEqual([ECOS_EXTERNAL_STATIONS[1]!.key]);
  });

  it("ne lit que les liens de la modalité d'ECOS simulé", () => {
    const offertes = ecosStationsOffertes(
      [modalite({}), modalite({ id: "mod-qcm", subtype: "qcm" })],
      [
        lien({ modalityId: "mod-qcm", ecosStations: [ECOS_EXTERNAL_STATIONS[4]!.key] }),
        lien({ ecosStations: [ECOS_EXTERNAL_STATIONS[0]!.key] }),
      ],
    );
    expect(offertes.map((s) => s.key)).toEqual([ECOS_EXTERNAL_STATIONS[0]!.key]);
  });

  it("sans modalité d'ECOS simulé, rien n'est offert", () => {
    expect(
      ecosStationsOffertes(
        [modalite({ mode: "in_person" })],
        [lien({ ecosStations: [ECOS_EXTERNAL_STATIONS[0]!.key] })],
      ),
    ).toEqual([]);
  });
});
