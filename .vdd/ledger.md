# VDD Ledger: Invisible Stormreach (app + scene logic)

Ceremony: Roast (review-only, no automated test suite by user choice) · Started: 2026-10-08
Spec: .vdd/spec.md · Scope: src/app.js, src/scene.js (with data.js, plan.js, template.html, styles.css for context)
Adversaries: fresh general-purpose subagent each round, alternating sonnet / opus.

## Beads

- [ ] **E1** Reading experience is correct and robust
  - [ ] **I1.1** Routing and reading order (SEQ, hash, Next/Back, Index, Drift, seen state)
  - [ ] **I1.2** Panel, focus, inert, chart dialog, fallbacks
- [ ] **E2** The 3D city is coherent
  - [ ] **I2.1** Plan tiers, grounding, roofs (nothing floats unintentionally)
  - [ ] **I2.2** Camera framing, cutaway/press, night seats, dawn
  - [ ] **I2.3** Lanterns: visibility, occlusion, filtering, states
  - [ ] **I2.4** Frame loop: throttling, reduced motion, weather/night state, shaft

## Round log

| Round | Mode | Adversary model | Confirmed | Disputed | Nitpick | Hallucinated | Converged? |
|---|---|---|---|---|---|---|---|
| 1 | code | general-purpose/sonnet | 9 | 0 | 3 | 0 | no |
| 2 | code | general-purpose/opus | 7 | 0 | 2 | 0 | no |
| 3 | code | general-purpose/sonnet | 9 | 0 | 2 | 0 | no |
| 4 | code | general-purpose/opus | 9 | 0 | 1 | 0 | no |
| 5 | code | general-purpose/sonnet | 8 | 0 | 2 | 0 | no |
| 6 | code | general-purpose/opus | 12 | 0 | 0 | 0 | no (circuit breaker) |

## Findings

| ID | Round | Sev | Class | Summary | Resolution / evidence | Guard |
|---|---|---|---|---|---|---|
| R1-F1 | 1 | high | CONFIRMED | resize/setPanel un-inerted page behind open chart | syncInert is sole owner and includes chart-open (app.js syncInert) | probe vdd_b1/verify_r1.js: inert stays [true,true,true] after resize |
| R1-F2 | 1 | medium | CONFIRMED | Night I card never shown after Begin | begin() resets lastNight | probe: card shown after Begin |
| R1-F3 | 1 | medium | CONFIRMED | Index kept night's lantern filter | setPinFilter(null) before overview | probe: 58/58 lanterns in Index |
| R1-F4 | 1 | medium | CONFIRMED | Shift+Arrow navigated | shiftKey added to modifier guard | probe: hash unchanged |
| R1-F5 | 1 | medium | CONFIRMED | dropping composer lost tone mapping | renderer ACES + exposure when composer dropped | code read |
| R1-F6 | 1 | medium | CONFIRMED | reduced-motion intro rendered full rate | calm excludes frozen intro | code read |
| R1-F7 | 1 | low | CONFIRMED | expired vision column not disposed | dispose + drop from visionCols | code read |
| R1-F8 | 1 | low | CONFIRMED | pick on right-click / multi-touch / stale down | button 0, single pointer, pointerId match, reset | code read |
| R1-F9 | 1 | low | CONFIRMED | mode buttons double-render; Nights re-rolls | guards + clear driftNote | code read |
| R1-F10 | 1 | low | NITPICK | `x || true`, stub onUserMove | removed | n/a |
| R1-F11 | 1 | low | NITPICK | #night-01 accepted | regex `^night-(10|[1-9])$` | code read |
| R3-F1 | 3 | medium | CONFIRMED | Emperor sank 3.2 (cap 2.6) because dy added after clamp | cap applied to final y in placeAt | code read |
| R3-F2 | 3 | medium | CONFIRMED | fallback chart stayed aria-modal; aria-expanded stale after context loss | enterFallback(): role=region, no aria-modal, expanded=false | probe verify_r3.js |
| R3-F3 | 3 | medium | CONFIRMED | vision dismiss reachable behind chart modal | opening the chart hides the vision | probe: vision hidden |
| R3-F4 | 3 | medium | CONFIRMED | south look pose rejected by maxPolarAngle and target bounds | pose above target, target inside bounds | screenshot shots31/horizon |
| R3-F5 | 3 | low | CONFIRMED | arrows at ends re-ran transitions | bounds-check before goTo | probe: hash stays #dawn |
| R3-F6 | 3 | low | CONFIRMED | stale drift note on hash navigation | cleared in hashchange | code read |
| R3-F7 | 3 | low | CONFIRMED | prototype keys passed seen filter | hasOwnProperty | probe: "1 of 50" with constructor/toString/__proto__/harbor |
| R3-F8 | 3 | low | CONFIRMED | spires never applied (lv never == LV.length-1); dead pillar/wall blocks; unused setInert | top tier = LV.length-2; dead blocks removed. Spires later rolled back at the user's request (looked out of place); top tiers end at their level height again | screenshot r4_night1.png: even skyline |
| R3-F10 | 3 | low | CONFIRMED | partial init failure leaked canvas/context | init wraps initInner; disposes and removes canvas on throw | code read |
| R3-F9 | 3 | low | NITPICK | debug instrumentation shipped; naive floatCheck misleading | tierStats behind DEBUG; debugShack and floatCheck removed; floatCheckReal kept | n/a |
| R3-F11 | 3 | low | NITPICK | duplicated cube capture, init missed fire/beam | init calls refreshCube | n/a |
| R2-F1 | 2 | high | CONFIRMED | 2D fallback: chart pin before Begin opened a story behind the intro | visitPlace begins the reading first | probe verify_r2.js: started=true, panel not inert, heading Blackbriar |
| R2-F2 | 2 | high | CONFIRMED | Emperor lantern occluded by its own statue on night frames | statue cylinder skips the emperor pin; seat/overview set the scene's current key | probe: class "lantern here" |
| R2-F3 | 2 | medium | CONFIRMED | hash change during intro opened story but URL said #night-1 | begin("none") then goTo(i, true) | probe: hash #bazaar, heading The Bazaar |
| R2-F4 | 2 | medium | CONFIRMED | human buildings/shacks over the open shaft | shaft exclusion before all builds; human polygons near shaft skipped | code read |
| R2-F5 | 2 | medium | CONFIRMED | shacks floated vs real mesh; floatCheck was circular | surface grid rasterized from the real broken top-cap triangles; floatCheckReal raycasts the stone mesh | floatCheckReal: 0/986 floating |
| R2-F6 | 2 | medium | CONFIRMED | reduced motion: occlusion never ran | occlusion settles on first still frame after change and on un-hide | probe (reduced): [3,4,6,6,8] occluded |
| R2-F7 | 2 | low | CONFIRMED | stale seen ids inflated ledger | filter to real ids, clamp bar | probe: "0 of 50" with junk storage |
| R2-F8 | 2 | low | NITPICK | some titles/labels still unescaped; comment false | all titles, CATS, night card, lantern tag escaped/textContent | n/a |
| R2-F9 | 2 | low | NITPICK | Emperor "here" in Index | here=null outside Nights | n/a |
| R4-F1 | 4 | high | CONFIRMED | fallback: chart usable behind intro; ring before Begin opened a vision behind the intro | pattern fix: syncInert makes every top-level region inert by elimination (intro only / chart only / all but intro); rings call begin first | probe verify_r4.js: fallback inert = only intro live |
| R4-F2 | 4 | medium | CONFIRMED | arrow keys navigated with the 3D chart modal open | single canNavigate() gate (started and no chart modal) | probe: hash unchanged |
| R4-F3 | 4 | medium | CONFIRMED | upper tiers overhanging their parent floated over air | upper tier base = min(parent base, own ground lo - 1) | floatCheckReal 0/800 |
| R4-F4 | 4 | medium | CONFIRMED | occluded() clobbered tmpV holding the projected pin | own scratch vector occAB | code read |
| R4-F5 | 4 | medium | CONFIRMED | focus lost to body after dismissing vision / Forget | dismissVision restores opener or reader heading; Forget focuses heading | code read |
| R4-F6 | 4 | medium | CONFIRMED | hash change while chart open left page inert behind it | hashchange closes chart first | probe: chart hidden, panel live |
| R4-F7 | 4 | low | CONFIRMED | Shargon's Talon at y=0 floated/sank against seabed | bedded via footGround | code read |
| R4-F8 | 4 | low | CONFIRMED | Blackbriar path one flat 24-unit box over slopes | 16 terrain-following segments | code read |
| R4-F9 | 4 | low | CONFIRMED | Night X reused the default seat view | look entry for night 10 (Night I keeps default by design) | screenshot r4_night10.png |
| R4-F10 | 4 | low | NITPICK | VISIONS text and district labels unescaped; duplicated numerals | esc(); ROMAN reused | n/a |
| R5-F1 | 5 | high | CONFIRMED | Black Freighter and 3 ships buried under terrain (fixed y, no water check) | Southwatch river carved from the mooring to the bay (terrain, exclusions, tiers/buildings spanning it dropped); ships moved to sampled water; DEBUG warns if a ship is aground; freighter view looks up the river | probe verify_r5.js: ground -3.4/-4.2 at all hulls; screenshot r5_fr_wide.png |
| R5-F2 | 5 | medium | CONFIRMED | Emperor pedestal, boulders, traveler lantern over open sea | footing cylinder down to lowest ground under the pedestal; boulders over a drop removed; lantern on the pedestal | screenshot r5_night1.png |
| R5-F3 | 5 | medium | CONFIRMED | Next/Back stole focus to the heading | goTo(from) keeps focus in the step bar (falls back to the other button / heading) | probe: activeElement "next"; Enter advances again |
| R5-F4 | 5 | medium | CONFIRMED | landmark picking ignored occlusion | pickAt shares lineBlocked() with lanterns; nearest unblocked candidate wins | probe pick_r5.js: 36/36 pickable landmarks still pickable with occlusion on |
| R5-F5 | 5 | low | CONFIRMED | arrows changed story and reopened a hidden account | arrows ignored while account hidden; spec updated | probe: hash unchanged |
| R5-F6 | 5 | low | CONFIRMED | reduced-motion read once | change listener | code read |
| R5-F7 | 5 | low | NITPICK | dead `tall`, tomb y, write-only hooks/c.night | removed; debug hooks stay (pickScreen gated by DEBUG) | n/a |
| R5-F8 | 5 | low | CONFIRMED | closeChart got MouseEvent as refocus | () => closeChart(true) | code read |
| R5-F9 | 5 | low | CONFIRMED | Forget never disarmed; Index nights/Forget not in spec | disarms on blur; count from TOTAL; spec updated | code read |
| R5-F10 | 5 | low | NITPICK | CDN scripts without SRI | deferred: host artifact wrapper; low risk, logged as residual | n/a |
| R6-F1 | 6 | high | CONFIRMED | Traveler's Inn sealed inside giant masonry on 3 of 6 inn picks (nearPlace skipped the inn) | inn no longer skipped; any tier containing it or within 12 units dropped | probe inns_r6.js + screenshots r6_inn2/r6_inn4 (walls and windows visible) |
| R6-F2 | 6 | medium | CONFIRMED | sightline sampled in 14 fixed steps; lantern inside stone not faded | samples every ~1.5 units (14..90); lantern inside masonry counts as occluded | pick_r5.js 36/36 still pickable; prof 60 fps |
| R6-F3 | 6 | medium | CONFIRMED | off-screen / under-panel lanterns visible to Tab | hidden unless the anchor is 16px inside the canvas area left of / above the panel | code read |
| R6-F4 | 6 | low | CONFIRMED | stacked crates floated | each lifted crate sits on the one below | code read |
| R6-F5 | 6 | low | CONFIRMED | tents not bedded; lights off the cone | footGround bedding; lights follow the cone taper | floatCheckReal 0/995 |
| R6-F6 | 6 | low | CONFIRMED | statue occluder radius too small | radius by height: pedestal 10.3, robe 7.8, upper 6.5 | code read |
| R6-F7 | 6 | low | CONFIRMED | 12 identical vision lantern names | "Circle of Visions, ring N" | code read |
| R6-F8 | 6 | low | CONFIRMED | vision animation never replayed (removed nonexistent "fade") | removes "show" | code read |
| R6-F9 | 6 | low | CONFIRMED | Wander flashed a Night I card over the Index | card only in Nights mode | code read |
| R6-F10 | 6 | low | CONFIRMED | hash to current item with chart open lost focus | closeChart(true) when nothing navigates | code read |
| R6-F11 | 6 | low | CONFIRMED | vision column double dispose | tick disposes only if still owned | code read |
| R6-F12 | 6 | low | CONFIRMED | reduced motion turned on mid-kraken/flight kept animating | change listener hides kraken, finishes flight | code read |
| R1-F12 | 1 | low | NITPICK | unescaped titles | titles escaped; bodies documented as trusted static HTML (carry <em>) | n/a |

## Hardening

| Tool | Target | Result | CI gate? |
|---|---|---|---|

## Outcome

Circuit breaker reached after round 6 without a converged round (each round still found at least one medium+). Recurring themes:
1. **Placement without a ground/occupancy contract**: objects positioned by fixed y or centroid tests (ships, freighter, Talon, path, inn, crates, tents, Emperor). Fixed case by case; a single "place on surface + reserve footprint" helper used by every builder would close the class.
2. **Accessibility state spread across handlers**: inert/focus/navigation gates. Consolidated in R4 (syncInert by elimination, canNavigate) and the findings since are edge cases, not the pattern.
3. **Line-of-sight approximations** (lanterns, picking) that drift from the real geometry.
Residual: CDN scripts without SRI (R5-F10); occlusion is a sampled approximation, not a raycast.

## Post-loop changes (user requests)
- Top-tier spires rolled back (looked out of place).
- Cutaway (press/discard between camera and place) removed entirely; camera framing instead searches for a clear line (giant stone, human buildings, ruin tops + shack height), swinging, climbing to ~50°, then moving closer. Worst framing cost 97 ms (waterworks).
- History: every reader navigation pushes an entry (`#index` added); Back/Forward replay via hashchange; leaving the intro replaces. Probe hist.js.
- Lighthouse beam and its water sweep end where they meet the Emperor (ray vs statue silhouette at lamp height).
- Land strip running out from under Silverwall (and the chart's seaward edge) turned to sea; structures on it excluded.
