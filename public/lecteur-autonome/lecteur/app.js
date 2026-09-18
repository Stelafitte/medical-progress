/*
 * LECTEUR AUTONOME -- script CLASSIQUE, sans module ni fetch : il doit marcher
 * ouvert par double-clic (file://), ou les deux sont refuses par le navigateur.
 *
 * Par diapositive : le CLIP s'il existe (narration comprise, rendu PowerPoint),
 * sinon l'IMAGE, et l'audio s'il y en a un a part. Meme regle que le lecteur de
 * la plateforme (NarratedDeckStage).
 */
(function () {
  "use strict";
  var manifest = window.COURSE_MANIFEST;
  var $ = function (id) {
    return document.getElementById(id);
  };
  if (!manifest || !manifest.slides || manifest.slides.length === 0) {
    $("course-title").textContent = "Ce dossier ne contient pas de cours lisible.";
    return;
  }

  var slides = manifest.slides;
  var video = $("slide-video");
  var image = $("slide-image");
  var audio = new Audio();
  var speed = $("speed");
  var current = 0;
  var started = false;
  var cle = "campus-hors-ligne:" + manifest.course.id + ":" + manifest.course.version;

  // FILIGRANE NOMINATIF (decision de Stef, 17/09) : le nom de l'etudiant dans le
  // manifeste et un bandeau permanent, pas une incrustation dans l'image.
  if (manifest.learner && manifest.learner.name) {
    $("filigrane").textContent =
      "Copie personnelle de " +
      manifest.learner.name +
      (manifest.learner.email ? " (" + manifest.learner.email + ")" : "") +
      " \u2014 t\u00e9l\u00e9charg\u00e9e le " +
      manifest.downloadedOn +
      " \u2014 ne pas diffuser.";
  } else {
    $("filigrane").hidden = true;
  }

  try {
    var saved = JSON.parse(localStorage.getItem(cle) || "null");
    if (saved && saved.slide >= 0 && saved.slide < slides.length) current = saved.slide;
  } catch (e) {
    /* stockage indisponible : on part du debut */
  }

  $("course-title").textContent = manifest.course.title;
  document.title = manifest.course.title + " \u2014 Cours hors ligne";

  var sommaire = $("sommaire");
  slides.forEach(function (slide, i) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = slide.title || "Diapositive " + slide.index;
    b.addEventListener("click", function () {
      aller(i, started);
    });
    li.appendChild(b);
    sommaire.appendChild(li);
  });

  function persister() {
    try {
      localStorage.setItem(cle, JSON.stringify({ slide: current }));
    } catch (e) {
      /* rien */
    }
  }

  function afficher(autoplay) {
    var slide = slides[current];
    $("position").textContent =
      "Diapositive " +
      slide.index +
      " / " +
      slides.length +
      (slide.title ? " \u00b7 " + slide.title : "");
    audio.pause();
    video.pause();
    if (slide.videoUrl) {
      image.hidden = true;
      video.hidden = false;
      video.poster = slide.imageUrl || "";
      video.src = slide.videoUrl;
      video.playbackRate = Number(speed.value);
      if (autoplay) video.play().catch(function () {});
    } else {
      video.hidden = true;
      video.removeAttribute("src");
      image.hidden = !slide.imageUrl;
      image.src = slide.imageUrl || "";
      image.alt = "Diapositive " + slide.index + (slide.title ? " : " + slide.title : "");
      if (slide.audioUrl) {
        audio.src = slide.audioUrl;
        audio.playbackRate = Number(speed.value);
        if (autoplay) audio.play().catch(function () {});
      }
    }
    $("previous").disabled = current === 0;
    $("next").disabled = current === slides.length - 1;
    Array.prototype.forEach.call(sommaire.querySelectorAll("button"), function (b, i) {
      b.setAttribute("aria-current", i === current ? "true" : "false");
    });
    var bloc = $("transcription-bloc");
    bloc.hidden = !slide.transcript;
    $("transcript").textContent = slide.transcript || "";
    persister();
  }

  function aller(i, autoplay) {
    if (i < 0 || i >= slides.length) return;
    current = i;
    afficher(autoplay);
  }

  function suivante() {
    if (current < slides.length - 1) aller(current + 1, true);
  }

  video.addEventListener("play", function () {
    started = true;
  });
  audio.addEventListener("play", function () {
    started = true;
  });
  video.addEventListener("ended", suivante);
  audio.addEventListener("ended", suivante);
  $("previous").addEventListener("click", function () {
    aller(current - 1, started);
  });
  $("next").addEventListener("click", function () {
    aller(current + 1, started);
  });
  speed.addEventListener("change", function () {
    video.playbackRate = Number(speed.value);
    audio.playbackRate = Number(speed.value);
  });
  document.addEventListener("keydown", function (event) {
    if (event.target && event.target.tagName === "SELECT") return;
    if (event.key === "ArrowLeft") aller(current - 1, started);
    if (event.key === "ArrowRight") aller(current + 1, started);
  });

  afficher(false);
})();
