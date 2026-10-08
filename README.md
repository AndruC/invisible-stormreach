# Invisible Stormreach

An interactive homage to Italo Calvino's *Invisible Cities*, set in Stormreach (Eberron) and based on the *City of Stormreach* sourcebook (Wizards of the Coast).
A traveler describes fifty cities over ten nights to the Emperor, the stone giant on the harbor cliffs that faces the sea and has never seen the city behind it.
The city is a procedural three.js diorama. Lanterns open the vignettes, the weather follows the nights, and dawn comes in the epilogue.

## Build

```
python build.py
```

This writes:

- `dist/site/`: the standalone site (deployed to GitHub Pages at https://andruc.github.io/invisible-stormreach/ by `.github/workflows/pages.yml` on every push to `main`). three.js r147 is bundled from `vendor/three/` (MIT).
- `dist/preview.html`: the same page, to open locally.
- `dist/invisible-stormreach.html`: the claude.ai artifact version, with no doctype (the artifact host adds the skeleton).

## Source

| file | what it holds |
| --- | --- |
| `src/content.js` | the prose: 50 vignettes, 10 night frames, epilogue |
| `src/data.js` | places (chart coordinates and camera hints), nights, per-night weather, street voices, visions, chart shapes |
| `src/scene.js` | `City3D`: terrain from the chart shapes, sea, sky, landmarks, weather, the undercity shaft, camera flights, lantern overlay |
| `src/app.js` | reading order, hash routing and history, panel, contents, wander, read tracking, 2D chart (also the fallback without WebGL) |
| `src/audio.js` | synthesized storm: rain, swell, wind, thunder, the Emperor's hum |
| `src/styles.css`, `src/template.html` | the page |

Chart coordinates follow the sourcebook map (908 × 1199, west at the top). `toWorld` maps them to the 3D scene at 0.2 units per chart unit.

## Fan content

Invisible Stormreach is unofficial Fan Content permitted under the [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy). Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
