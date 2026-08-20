# PPTX narrated-course proof of concept

This proof of concept converts a narrated PowerPoint into learner-facing web
artifacts without exposing the source PPTX.

## Output contract

```text
course-package/
  manifest.json
  slides/slide-001.png
  audio/slide-001.mp3
  player/index.html
  player/app.js
  player/styles.css
  private/conversion-report.json
```

`manifest.json` is safe for the learner application. Source filenames and
filesystem paths are kept only in `private/conversion-report.json`.

## Windows proof-of-concept conversion

PowerPoint desktop is used only to render slides faithfully. Audio and timing
metadata are extracted directly from OOXML.

```powershell
.\tools\pptx-poc\convert.ps1 `
  -InputPptx 'C:\path\course.pptx' `
  -OutputDir 'C:\path\course-package'
```

Then serve the package over HTTP and open `player/index.html`. Browsers do not
reliably load media from `file://` URLs.

## Production boundary

This is a feasibility tool, not a production upload service. Production must
move conversion to an isolated asynchronous worker, store the PPTX privately,
scan uploads, enforce quotas, and serve only authorized short-lived artifact
URLs.

