const manifestUrl = new URL("../manifest.json", location.href);
const manifest = await fetch(manifestUrl).then((r) => {
  if (!r.ok) throw new Error(`Manifest inaccessible (${r.status})`);
  return r.json();
});
const q = (selector) => document.querySelector(selector);
const ui = {
  title: q("#course-title"), position: q("#position"), image: q("#slide-image"),
  audio: q("#audio"), seek: q("#seek"), time: q("#time"), previous: q("#previous"),
  play: q("#play"), next: q("#next"), speed: q("#speed"), transcript: q("#transcript"),
};
const storageKey = `campus-sante-player:${manifest.course.id}:${manifest.course.version}`;
const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
let current = Math.min(saved?.slideIndex || 0, manifest.slides.length - 1);
let resumeAt = saved?.currentTime || 0;
const asset = (path) => path ? new URL(path, manifestUrl).href : "";
const clock = (seconds) => Number.isFinite(seconds)
  ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "0:00";

function persist() {
  localStorage.setItem(storageKey, JSON.stringify({
    slideIndex: current, currentTime: ui.audio.currentTime || 0,
  }));
}

async function render({ autoplay = false } = {}) {
  const slide = manifest.slides[current];
  ui.title.textContent = manifest.course.title;
  ui.position.textContent = `Diapositive ${slide.index}/${manifest.course.slideCount} · ${slide.title || "Sans titre"}`;
  ui.image.src = asset(slide.imageUrl);
  ui.image.alt = `Diapositive ${slide.index} : ${slide.title || "sans titre"}`;
  ui.audio.src = asset(slide.audioUrl);
  ui.audio.playbackRate = Number(ui.speed.value);
  ui.previous.disabled = current === 0;
  ui.next.disabled = current === manifest.slides.length - 1;
  ui.play.disabled = !slide.audioUrl;
  ui.play.textContent = slide.audioUrl ? "Lecture" : "Pas d’audio";
  ui.seek.value = 0;
  ui.transcript.textContent = slide.transcriptUrl
    ? await fetch(asset(slide.transcriptUrl)).then((r) => r.text())
    : "Transcription non encore disponible pour ce prototype.";
  ui.audio.addEventListener("loadedmetadata", () => {
    if (resumeAt) ui.audio.currentTime = Math.min(resumeAt, ui.audio.duration || resumeAt);
    resumeAt = 0;
    if (autoplay) ui.audio.play();
  }, { once: true });
  persist();
}

function move(delta, autoplay = false) {
  const target = Math.max(0, Math.min(manifest.slides.length - 1, current + delta));
  if (target !== current) { current = target; resumeAt = 0; render({ autoplay }); }
}

ui.play.addEventListener("click", () => ui.audio.paused ? ui.audio.play() : ui.audio.pause());
ui.previous.addEventListener("click", () => move(-1));
ui.next.addEventListener("click", () => move(1));
ui.speed.addEventListener("change", () => { ui.audio.playbackRate = Number(ui.speed.value); });
ui.audio.addEventListener("play", () => { ui.play.textContent = "Pause"; });
ui.audio.addEventListener("pause", () => { ui.play.textContent = "Lecture"; });
ui.audio.addEventListener("ended", () => move(1, true));
ui.audio.addEventListener("timeupdate", () => {
  const duration = ui.audio.duration || 0;
  ui.seek.value = duration ? String((ui.audio.currentTime / duration) * 1000) : "0";
  ui.time.value = `${clock(ui.audio.currentTime)} / ${clock(duration)}`;
  persist();
});
ui.seek.addEventListener("input", () => {
  ui.audio.currentTime = (ui.audio.duration || 0) * (Number(ui.seek.value) / 1000);
});
addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") move(-1);
  if (event.key === "ArrowRight") move(1);
  if (event.key === " ") { event.preventDefault(); ui.play.click(); }
});
render();
