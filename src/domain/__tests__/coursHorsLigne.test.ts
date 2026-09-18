import { describe, expect, it } from "vitest";
import { extensionOf, folderNameFor, planOfflineCourse } from "@/domain/coursHorsLigne";

const meta = {
  id: "res-1",
  title: "Échocardiographie normale",
  version: "3",
  learnerName: "Stéphane Lafitte",
  learnerEmail: "s@chu.fr",
  downloadedOn: "18/09/2026",
};

describe("cours hors ligne (18/09)", () => {
  it("lit l'extension sans la requête signée", () => {
    expect(extensionOf("https://x/y/clip.MP4?token=a.b.c", "bin")).toBe("mp4");
    expect(extensionOf("https://x/y/sans-extension?token=1", "jpg")).toBe("jpg");
  });

  it("donne un nom de dossier sûr", () => {
    expect(folderNameFor(meta.title)).toBe("echocardiographie-normale");
    expect(folderNameFor("***")).toBe("cours");
  });

  it("met le clip, l'image, et l'audio seulement sans clip", () => {
    const plan = planOfflineCourse(
      [
        {
          index: 1,
          title: "A",
          videoUrl: "https://s/1.mp4?t",
          imageUrl: "https://s/1.png?t",
          audioUrl: "https://s/1.m4a",
        },
        { index: 2, title: "B", imageUrl: "https://s/2.jpg", audioUrl: "https://s/2.m4a?t" },
      ],
      meta,
    );
    expect(plan.downloads.map((d) => d.path)).toEqual([
      "medias/01-clip.mp4",
      "medias/01-image.png",
      "medias/02-image.jpg",
      "medias/02-audio.m4a",
    ]);
  });

  it("porte le nom de l'étudiant dans un manifeste SCRIPT, sans aucune URL signée", () => {
    const plan = planOfflineCourse(
      [{ index: 1, title: "A", videoUrl: "https://s/1.mp4?token=secret" }],
      meta,
    );
    expect(plan.manifestJs.startsWith("window.COURSE_MANIFEST = ")).toBe(true);
    expect(plan.manifestJs).toContain("Stéphane Lafitte");
    expect(plan.manifestJs).not.toContain("token=");
    expect(plan.manifestJs).not.toContain("https://");
  });
});
