import { describe, expect, it } from "vitest";
import {
  CITATION_KIND_BY_MEDIA_KIND,
  EXPECTED_FACETS_BY_KIND,
  areCitationsVerified,
  availableModes,
  computeContentAiCoverage,
  coversExpectedFacets,
  defaultMode,
  evaluatePublicationGate,
  groupByQueue,
  plannedTierForMode,
  toLearnerAiResource,
  usesExpectedCitationKind,
  type ContentAiProfile,
  type ProgramAiPolicy,
} from "@/domain/contentAi";
import { mediaResources } from "@/infrastructure/mock/mediaFixtures";
import { allContentAiProfiles, programAiPolicies } from "@/infrastructure/mock/contentAiFixtures";
import { checkWebPageUrl, hasValidatedSnapshot } from "@/domain/webPage";

const profileOf = (mediaId: string) => {
  const profile = allContentAiProfiles.find((p) => p.mediaId === mediaId);
  if (!profile) throw new Error(`profil manquant : ${mediaId}`);
  return profile;
};

const policyOf = (programId: string) => {
  const policy = programAiPolicies.find((p) => p.programId === programId);
  if (!policy) throw new Error(`politique manquante : ${programId}`);
  return policy;
};

describe("couverture IA des contenus publiés", () => {
  it("associe un profil à tout support publié", () => {
    const coverage = computeContentAiCoverage(mediaResources, allContentAiProfiles);
    expect(coverage.publishedCount).toBeGreaterThan(0);
    expect(coverage.withProfile).toBe(coverage.publishedCount);
    expect(coverage.coverageRatio).toBe(1);
  });

  it("compte 100 % des supports publiés comme réellement prêts", () => {
    const coverage = computeContentAiCoverage(mediaResources, allContentAiProfiles);
    expect(coverage.ready).toBe(coverage.publishedCount);
    expect(coverage.readyRatio).toBe(1);
    expect(coverage.coverageRatio).toBe(1);
    expect(Math.round(coverage.readyRatio * 100)).toBe(100);
    for (const line of coverage.byKind) {
      expect(line.ready).toBe(line.published);
    }
  });

  it("vérifie support par support le contrat d'exploitation IA des publiés", () => {
    const published = mediaResources.filter((r) => r.status === "published");
    expect(published.length).toBeGreaterThan(0);
    for (const resource of published) {
      const profile = profileOf(resource.id);
      expect(profile.status).toBe("ready");
      expect(profile.programId).toBe(resource.programId);
      expect(profile.mediaKind).toBe(resource.kind);
      expect(coversExpectedFacets(profile)).toBe(true);
      expect(areCitationsVerified(profile)).toBe(true);
      expect(usesExpectedCitationKind(profile)).toBe(true);
      expect(evaluatePublicationGate(resource, profile).allowed).toBe(true);
      const dto = toLearnerAiResource(resource, profile, policyOf(resource.programId));
      expect(dto, `DTO apprenant manquant : ${resource.id}`).toBeDefined();
      expect(dto?.modes.length).toBeGreaterThan(0);
    }
  });

  it("expose côté apprenant autant de ressources IA que de supports publiés du programme", () => {
    for (const policy of programAiPolicies) {
      const publishedOfProgram = mediaResources.filter(
        (r) => r.programId === policy.programId && r.status === "published",
      );
      const learnerResources = mediaResources
        .filter((r) => r.programId === policy.programId)
        .map((r) =>
          toLearnerAiResource(
            r,
            allContentAiProfiles.find((p) => p.mediaId === r.id),
            policy,
          ),
        )
        .filter((r) => r !== undefined);
      expect(learnerResources).toHaveLength(publishedOfProgram.length);
    }
  });

  it("ne conserve des profils non prêts que parmi les supports non publiés", () => {
    const notReady = allContentAiProfiles.filter((p) => p.status !== "ready");
    expect(notReady.length).toBeGreaterThan(0);
    for (const profile of notReady) {
      const resource = mediaResources.find((r) => r.id === profile.mediaId)!;
      expect(resource.status, `${resource.id} ne doit pas être publié`).not.toBe("published");
    }
  });

  it("respecte le contenu extrait et le type de citation attendus par format", () => {
    for (const profile of allContentAiProfiles) {
      expect(usesExpectedCitationKind(profile)).toBe(true);
      if (profile.status === "ready") expect(coversExpectedFacets(profile)).toBe(true);
      expect(EXPECTED_FACETS_BY_KIND[profile.mediaKind].length).toBeGreaterThan(0);
      expect(CITATION_KIND_BY_MEDIA_KIND[profile.mediaKind]).toBeDefined();
    }
  });

  it("n'active jamais d'index ni d'appel IA", () => {
    for (const profile of allContentAiProfiles) {
      expect(profile.indexActivated).toBe(false);
      expect(profile.aiCallsActivated).toBe(false);
    }
  });
});

describe("garde de publication", () => {
  it("bloque un support dont les références ne sont pas contrôlées", () => {
    const resource = mediaResources.find((m) => m.id === "med-diu-ppt-doppler")!;
    const gate = evaluatePublicationGate(resource, profileOf("med-diu-ppt-doppler"));
    expect(gate.allowed).toBe(false);
    expect(gate.reasons.join(" ")).toContain("références");
  });

  it("exige une décision explicite pour un lien externe simple non publié", () => {
    const profile = profileOf("med-diu-lien-societe");
    expect(profile.linkDecision).toBe("convert_to_web_page");
    const { linkDecision: _decision, ...rest } = profile;
    const withoutDecision: ContentAiProfile = rest;
    const resource = mediaResources.find((m) => m.id === "med-diu-lien-societe")!;
    expect(resource.status).not.toBe("published");
    expect(evaluatePublicationGate(resource, withoutDecision).reasons.join(" ")).toContain(
      "décision explicite",
    );
  });

  it("autorise un support prêt et contrôlé", () => {
    const resource = mediaResources.find((m) => m.id === "med-diu-ppt-coupes")!;
    const gate = evaluatePublicationGate(resource, profileOf("med-diu-ppt-coupes"));
    expect(gate.allowed).toBe(true);
    expect(areCitationsVerified(profileOf("med-diu-ppt-coupes"))).toBe(true);
  });
});

describe("files de traitement", () => {
  it("classe chaque profil dans une file", () => {
    const queues = groupByQueue(allContentAiProfiles);
    const total =
      queues.to_process.length +
      queues.to_review.length +
      queues.ready.length +
      queues.outdated.length;
    expect(total).toBe(allContentAiProfiles.length);
    expect(queues.to_review.some((p) => p.mediaId === "med-diu-ppt-doppler")).toBe(true);
    expect(queues.to_process.some((p) => p.mediaId === "med-diu-qcm-valves")).toBe(true);
    expect(queues.outdated.some((p) => p.mediaId === "med-dfasm-cas-syncope")).toBe(true);
    // Les files de travail ne contiennent aucun support publié hors « Prêts ».
    for (const profile of [...queues.to_process, ...queues.to_review, ...queues.outdated]) {
      const resource = mediaResources.find((r) => r.id === profile.mediaId)!;
      expect(resource.status).not.toBe("published");
    }
  });
});

describe("modes et coûts par programme", () => {
  it("met le vocal en avant pour le DFASM et jamais par défaut pour le DIU", () => {
    const dfasm = policyOf("prog-dfasm-cardio");
    const diu = policyOf("prog-diu-echo");
    expect(dfasm.voicePromoted).toBe(true);
    expect(diu.voiceEnabled).toBe(true);
    expect(diu.voicePromoted).toBe(false);

    const dfasmProfile = profileOf("med-dfasm-video-ecg");
    expect(defaultMode(dfasm, dfasmProfile)).toBe("voice");
    const diuProfile = profileOf("med-diu-ppt-coupes");
    expect(defaultMode(diu, diuProfile)).not.toBe("voice");
    expect(availableModes(diu, diuProfile)).toContain("voice");
  });

  it("documente l'escalade de coûts sans jamais appeler de modèle", () => {
    expect(plannedTierForMode("ask")).toBe("light_model");
    expect(plannedTierForMode("guided_clinical_case")).toBe("advanced_model");
    expect(plannedTierForMode("voice")).toBe("realtime_voice");
  });

  it("désactive tous les modes si la politique coupe le vocal et le profil est vide", () => {
    const policy: ProgramAiPolicy = {
      programId: "prog-diu-echo",
      allowedModes: ["voice"],
      voiceEnabled: false,
      voicePromoted: false,
      note: "test",
    };
    expect(availableModes(policy, profileOf("med-diu-ppt-coupes"))).toHaveLength(0);
  });
});

describe("DTO apprenant", () => {
  it("n'expose que les supports publiés, prêts et contrôlés", () => {
    const diu = policyOf("prog-diu-echo");
    expect(
      toLearnerAiResource(
        mediaResources.find((m) => m.id === "med-diu-ppt-doppler")!,
        profileOf("med-diu-ppt-doppler"),
        diu,
      ),
    ).toBeUndefined();

    const dto = toLearnerAiResource(
      mediaResources.find((m) => m.id === "med-diu-ppt-coupes")!,
      profileOf("med-diu-ppt-coupes"),
      diu,
    );
    expect(dto?.citations.every((c) => c.verified)).toBe(true);
    expect(JSON.stringify(dto)).not.toContain(".pptx");
  });

  it("expose l'URL canonique d'une page web mais jamais son HTML", () => {
    const dto = toLearnerAiResource(
      mediaResources.find((m) => m.id === "med-dfasm-web-referentiel-cv")!,
      profileOf("med-dfasm-web-referentiel-cv"),
      policyOf("prog-dfasm-cardio"),
    );
    expect(dto?.canonicalUrl).toContain("https://");
    expect(JSON.stringify(dto)).not.toContain("rawHtml");
  });
});

describe("instantané de page web", () => {
  it("valide l'URL sans jamais l'appeler", () => {
    const ok = checkWebPageUrl({ url: "https://exemple.fr/page?x=1#a" });
    expect(ok.urlValid).toBe(true);
    expect(ok.canonicalUrl).toBe("https://exemple.fr/page");
    expect(ok.simulated).toBe(true);
    expect(checkWebPageUrl({ url: "pas-une-url" }).canQueue).toBe(false);
  });

  it("conserve l'instantané validé et signale l'actualisation à contrôler", () => {
    const web = mediaResources.find((m) => m.id === "med-dfasm-web-referentiel-cv")!.webPage!;
    expect(hasValidatedSnapshot(web)).toBe(true);
    expect(web.refreshToReview).toBe(true);
    expect(web.validatedSnapshot?.rawHtmlStored).toBe(false);
    expect(web.networkFetchActivated).toBe(false);
  });

  it("garde l'instantané validé exploitable malgré une actualisation à contrôler", () => {
    const profile = profileOf("med-dfasm-web-referentiel-cv");
    expect(profile.status).toBe("ready");
    expect(profile.sourceVersion).toBe("instantané 2026-08");
    expect(profile.alerts.join(" ")).toContain("Actualisation à contrôler");
  });

  it("exploite l'ancien lien externe converti en page web HTML validée", () => {
    const resource = mediaResources.find((m) => m.id === "med-diu-lien-guidelines")!;
    expect(resource.kind).toBe("web_page");
    expect(resource.status).toBe("published");
    expect(hasValidatedSnapshot(resource.webPage!)).toBe(true);
    const profile = profileOf("med-diu-lien-guidelines");
    expect(profile.status).toBe("ready");
    expect(evaluatePublicationGate(resource, profile).allowed).toBe(true);
  });
});
