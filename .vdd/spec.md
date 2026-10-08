# Invisible Stormreach: behavioral spec (app + scene logic)

Single self-contained page (built by `python build.py` into `dist/invisible-stormreach.html`; local preview `dist/preview.html`). three.js r147 UMD from jsdelivr. Host constraints: no alert/confirm/prompt, localStorage may throw, only bare `#token` hashes reach the page, external scripts only from jsdelivr/cdnjs/unpkg.

## Reading order and routing (src/app.js)
- SEQ = for each of 10 nights: a frame page, then that night's 5 story pages (NIGHTS in data.js); then one epilogue ("dawn"). 61 items. Every one of the 50 stories appears exactly once.
- Hash forms: `#<story-id>`, `#night-N` (N = 1..10), `#dawn`, `#index`. Invalid hashes are ignored. Loading with a valid hash skips the intro and opens that item (or the Index). Every navigation the reader makes (Next/Back, arrows, Index, a story from the Index, Drift, lanterns, chart, rings to stories) pushes one history entry; leaving the intro replaces the entry instead. The browser's Back/Forward replay those entries (closing the chart if open). Re-selecting the current item adds no entry.
- "Next"/"Back" and ArrowRight/ArrowLeft move through SEQ in Read-in-order mode; arrows are ignored with modifier keys, while the chart dialog is open, while the account is hidden, or on lantern buttons. Back/Next keep keyboard focus in the step bar; other navigation focuses the new page heading. Back is disabled on the first item; Next on the last.
- Contents (the `#index` mode) lists the ten nights as chapters, each with its five stories in reading order and a read count, then the epilogue; choosing one returns to Nights mode at that story. The Index also lists the ten nights and dawn, and has a two-step "Forget" (disarms when focus leaves) that clears seen state. Drift picks an unseen story near the current place (falls back to any other story when all are seen) and opens it.
- A story counts as seen when opened; seen state persists in localStorage when available, and the page works when localStorage throws.
- The weather label and night title card change when the night changes; the epilogue uses the dawn state.

## Panel, focus, accessibility
- Story navigation (Back / position / Next) is pinned to the bottom of the reading panel, outside the scrolling text, on desktop and mobile. Hidden in Index mode.
- Before Begin (intro showing): the stage, header, and panel are inert; Begin has focus. Escape on the intro begins. After Begin they are interactive.
- When the panel is hidden ("Hide the account"), its reader and navigation leave the tab order.
- The chart is a modal dialog in 3D mode (rest of page inert while open); closing returns focus to the Chart button; choosing a place from the chart focuses the opened story's heading. Escape closes a vision first, then the chart.
- If three.js fails to load or WebGL is unavailable or the context is lost, the 2D chart replaces the 3D city and the reader still works.

## Scene (src/scene.js, City3D)
- The city plan (src/plan.js) comes from the sourcebook chart: giant stone tiers stacked by level, human buildings, water, city extent. Upper tiers must stand on a kept lower tier; tiers near/containing a named place may be dropped to keep it clear.
- Nothing that is not intentionally aloft (floating islands and their hanging huts, airship, gulls, rope bridges/laundry, lanterns/lights) floats above the surface beneath it. Ships and the Black Freighter float on water. Rooftop shacks sit on the actual (broken) ruin top. Landmarks bed into the lowest ground under their footprint (sinking no more than 2.6 below the centre height). Roofs align with their walls.
- Flying to a place frames it: the camera tries azimuth offsets before raising elevation (cap ~50°). Nothing is cut away or pressed down around the camera; models always render whole.
- Night frames seat the camera on the Emperor with a per-night view; the epilogue pushes in at dawn while the head turns toward the city and the beam fades.
- Lanterns (HTML buttons over the canvas): seen/here states; hidden when off-screen (unless focused); faded when occluded by masonry or the statue; clicks on landmarks follow the same line of sight (no picking through ground or unpressed masonry); on night frames only that night's places plus the Emperor are shown.
- Rendering draws at ~30 fps when idle (no flight, intro, dawn push, idle orbit, lightning, or input in 2.5 s), full rate otherwise. Reduced motion: no flights (cuts), no intro orbit motion, no lightning flashes, no kraken.
- The undercity shaft at the Waterworks opens the ground (terrain, outer terrain and water discard inside the cut) only while that place is viewed.
