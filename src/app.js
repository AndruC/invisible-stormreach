/* The traveler's account: reading order, routing, panel, chart, and the bridge to the 3D city. */
const CITIES = [...CITIES_A, ...CITIES_B, ...CITY_EXTRA];
const BY = Object.fromEntries(CITIES.map(c => [c.id, c]));
const SEQ = [];
NIGHTS.forEach((ids, n) => { SEQ.push({ type: "frame", n }); ids.forEach(id => SEQ.push({ type: "city", id, n })); });
SEQ.push({ type: "epilogue", n: 9 });
const catCount = {};
SEQ.forEach(s => { if (s.type === "city") { const c = BY[s.id]; catCount[c.cat] = (catCount[c.cat] || 0) + 1; c.num = catCount[c.cat]; } });
const seqIndex = id => SEQ.findIndex(s => s.type === "city" && s.id === id);
const TOTAL = CITIES.length;

let seen = new Set();
try { const arr = JSON.parse(localStorage.getItem("sr-seen") || "[]"); if (Array.isArray(arr)) seen = new Set(arr.filter(id => typeof id === "string" && Object.prototype.hasOwnProperty.call(BY, id))); } catch (e) { }
const saveSeen = () => { try { localStorage.setItem("sr-seen", JSON.stringify([...seen])); } catch (e) { } };

let pos = 0, mode = "nights", driftNote = "", has3D = false, lastNight = -1, panelOpen = true, started = false;
const $ = s => document.querySelector(s);
const reader = $("#reader");
const mqMobile = matchMedia("(max-width: 860px)");
// trusted static HTML: story and frame bodies from content.js (they carry <em> and speaker spans). Everything else that reaches innerHTML goes through esc().
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- weather and camera follow the reading ---------- */
function nightState(s) {
  if (s.type === "epilogue") return DAWN_STATE;
  return { ...NIGHT_STATES[s.n], titanBuilt: s.n < 4 };
}
function syncWorld(fly = true) {
  const s = SEQ[pos];
  const nKey = s.type === "epilogue" ? 10 : s.n;
  if (nKey !== lastNight) {
    lastNight = nKey; const st = nightState(s);
    if (has3D) City3D.setNight(st);
    Storm.set({ rain: st.rain, calm: st.calm ? 1 : 0 });
    $("#weather").textContent = s.type === "epilogue" ? "Before dawn" : `Night ${ROMAN[s.n]} · ${st.label}`;
    if (started && mode === "nights") nightCard(s.type === "epilogue" ? "Epilogue" : "Night " + ROMAN[s.n], st.label);
  }
  Storm.set({ hum: s.type === "city" ? 0 : 1 });
  if (!has3D || !fly) return;
  if (mode === "index") { City3D.setPinFilter(null); City3D.overview(); return; }
  City3D.setPinFilter(s.type === "city" ? null : (s.type === "epilogue" ? ["emperor"] : ["emperor", ...NIGHTS[s.n].map(id => BY[id].place)]));
  if (s.type === "city") City3D.flyToPlace(BY[s.id].place);
  else City3D.seatWithEmperor(3.2, s.type === "epilogue" ? "dawn" : s.n);
}

function nightCard(title, label) {
  const c = $("#nightcard"); c.innerHTML = `<span>${esc(title)}</span><b>${esc(label)}</b>`;
  c.hidden = false; c.classList.remove("play"); void c.offsetWidth; c.classList.add("play");
  clearTimeout(nightCard.t); nightCard.t = setTimeout(() => { c.hidden = true; }, 4200);
}

/* ---------- reader ---------- */
function ledger() {
  $("#ledger-n").textContent = `${seen.size} of ${TOTAL}`;
  $("#ledger-fill").style.width = Math.min(100, seen.size / TOTAL * 100) + "%";
}
function steps() {
  const s = SEQ[pos];
  const label = s.type === "city" ? `Night ${ROMAN[s.n]} · ${NIGHTS[s.n].indexOf(s.id) + 1} of 5` : (s.type === "frame" ? `Night ${ROMAN[s.n]}` : "Dawn");
  const nxt = SEQ[pos + 1];
  const nextLabel = !nxt ? "The end" : nxt.type === "frame" ? "Next night" : nxt.type === "epilogue" ? "Before dawn" : (s.type === "frame" ? "Into the city" : "Next");
  return `<div class="steps"><button class="prev" type="button" ${pos === 0 ? "disabled" : ""} aria-label="Previous">←</button><span class="pos">${label}</span><button class="next" type="button"${!nxt ? ' data-end=""' : ""}>${nextLabel} <span aria-hidden="true">→</span></button></div>`;
}
function renderNight(s) {
  const f = s.type === "epilogue" ? EPILOGUE : FRAMES[s.n];
  return `<article class="page night"><p class="num">${s.type === "epilogue" ? "Epilogue" : "Night " + ROMAN[s.n]}</p><h2 tabindex="-1">${esc(f.title)}</h2><span class="orn" aria-hidden="true">⁂</span>
  <div class="prose">${f.body.map(p => `<p>${p}</p>`).join("")}</div></article>`;
}
function renderCity(s) {
  const c = BY[s.id], p = PLACES[c.place];
  const pool = HEARD[p.d] || []; const line = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "";
  const nearby = CITIES.filter(o => o.id !== c.id && PLACES[o.place].d === p.d && p.d !== "inn" && p.d !== "beyond");
  return `<article class="page city">${driftNote ? `<p class="drift">${esc(driftNote)}</p>` : ""}
  <div class="kicker"><span class="cat">${esc(CATS[c.cat])} · ${c.num}</span><button class="where" type="button" data-place="${c.place}" title="Show on the map">${esc(p.n)}</button></div>
  <h2 class="title" tabindex="-1">${esc(c.title)}</h2>
  <div class="prose">${c.body.map((t, i) => `<p>${t}</p>` + (i === 0 && line && c.body.length > 1 ? `<aside class="heard pull"><small>Overheard nearby</small><q>${esc(line)}</q></aside>` : "")).join("")}</div>
  ${line && c.body.length < 2 ? `<div class="heard"><small>Overheard nearby</small><q>${esc(line)}</q></div>` : ""}
  ${nearby.length ? `<p class="also"><span>Also in ${esc(DISTRICTS[p.d])}:</span> ${nearby.map(o => `<button type="button" data-go="${o.id}" class="${seen.has(o.id) ? "seen" : ""}">${esc(o.title)}</button>`).join("")}</p>` : ""}
  </article>`;
}
function renderIndex() {
  $("#steps").hidden = true; $("#steps").innerHTML = "";
  // chapters are the nights, in the order the traveler told them; each opens at the Emperor's feet
  const chapters = NIGHTS.map((ids, n) => {
    const read = ids.filter(id => seen.has(id)).length;
    return `<section class="chapter"><h3><button type="button" data-night="${n}"><b>${ROMAN[n]}</b><span class="t">${esc(FRAMES[n].title)}</span><span class="w">${esc(NIGHT_STATES[n].label)}</span></button><span class="read">${read} of ${ids.length}</span></h3>
    <ol>${ids.map((id, k) => `<li><button type="button" data-go="${id}" class="${seen.has(id) ? "seen" : ""}"><span class="n">${k + 1}</span>${esc(BY[id].title)}</button></li>`).join("")}</ol></section>`;
  }).join("") + `<section class="chapter"><h3><button type="button" data-night="dawn"><b>⁂</b><span class="t">${esc(EPILOGUE.title)}</span><span class="w">the epilogue</span></button></h3></section>`;
  reader.innerHTML = `<div class="page index"><h2 tabindex="-1">Contents</h2><p class="lede">Ten nights, five places each, in the order the traveler told them to the Emperor. Each night opens at the statue's feet; then into the city.</p>
  <div class="chapters">${chapters}</div>
  <button class="forget" id="forget" type="button">Forget the places you have seen</button>
  <p class="fineprint">After Italo Calvino&rsquo;s <i>Invisible Cities</i>, set in Eberron&rsquo;s <i>City of Stormreach</i>. Unofficial Fan Content permitted under the <a href="https://company.wizards.com/en/legal/fancontentpolicy" target="_blank" rel="noopener">Fan Content Policy</a>. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. &copy;Wizards of the Coast LLC.</p></div>`;
  reader.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { setMode("nights"); driftNote = ""; goTo(seqIndex(b.dataset.go)); });
  reader.querySelectorAll("[data-night]").forEach(b => b.onclick = () => { setMode("nights"); driftNote = ""; goTo(b.dataset.night === "dawn" ? SEQ.length - 1 : SEQ.findIndex(s => s.type === "frame" && s.n === +b.dataset.night)); });
  const fg = $("#forget"); let armed = false; const label = fg.textContent; fg.onblur = () => { armed = false; fg.textContent = label; };
  fg.onclick = () => { if (!armed) { armed = true; fg.textContent = `Click again to forget all ${TOTAL} places`; return; } seen.clear(); saveSeen(); ledger(); paintPins(); renderIndex(); const h = reader.querySelector("h2"); h && h.focus({ preventScroll: true }); };
}
function wire() {
  const bar = $("#steps"); bar.innerHTML = steps(); bar.hidden = false;
  const p = bar.querySelector(".prev"), n = bar.querySelector(".next");
  if (p) p.onclick = () => { driftNote = ""; goTo(pos - 1, true, "prev"); };
  if (n) n.onclick = () => { driftNote = ""; if (n.hasAttribute("data-end")) backToStart(); else goTo(pos + 1, true, "next"); };
  reader.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { driftNote = ""; goTo(seqIndex(b.dataset.go)); });
  reader.querySelectorAll(".where").forEach(b => b.onclick = () => { if (has3D) { City3D.flyToPlace(b.dataset.place); if (mqMobile.matches) setPanel(false); } else openChart(b.dataset.place); });
}
// the tab title names where the reader is, so each history entry reads clearly in the Back menu
function setTitle() {
  const s = SEQ[pos], h = reader.querySelector("h2"), name = h ? h.textContent.trim() : "";
  const where = !started ? "" : mode === "index" ? "Contents" : s.type === "frame" ? `Night ${ROMAN[s.n]}: ${name}` : name;
  document.title = where ? `Invisible Stormreach · ${where}` : "Invisible Stormreach";
}
// a story counts as read once the reader has stayed with it (8 s with the tab visible) or scrolled to its end, not merely on opening
const READ_MS = 8000;
function markRead(id) { if (!id || seen.has(id)) return; seen.add(id); saveSeen(); ledger(); paintPins(); }
function readWatch(id) {
  clearInterval(readWatch.t); readWatch.id = id; if (!id || seen.has(id)) return;
  let stayed = 0; readWatch.t = setInterval(() => { if (readWatch.id !== id) return clearInterval(readWatch.t); if (document.visibilityState === "visible" && started && mode === "nights") stayed += 500; if (stayed >= READ_MS) { clearInterval(readWatch.t); markRead(id); } }, 500);
}
function render(fly = true) {
  if (mode === "index") { readWatch(null); renderIndex(); paintPins(); syncWorld(fly); reader.scrollTop = 0; setTitle(); return; }
  const s = SEQ[pos];
  reader.innerHTML = s.type === "city" ? renderCity(s) : renderNight(s); setTitle();
  readWatch(s.type === "city" ? s.id : null);
  ledger(); paintPins(); wire(); syncWorld(fly);
  reader.scrollTop = 0;
}
function paintPins() {
  const s = SEQ[pos]; const here = mode !== "nights" ? null : s.type === "city" ? BY[s.id].place : "emperor";
  if (has3D) City3D.setPinStates(k => CITIES.filter(c => c.place === k).every(c => seen.has(c.id)), here);
  paintChart(here);
}
function hashFor(s) { return s.type === "city" ? s.id : (s.type === "frame" ? "night-" + (s.n + 1) : "dawn"); }
// every jump the reader makes is a history entry, so the browser's Back and Forward retrace it (the hashchange handler replays them)
function writeHash(h, replace) { if (location.hash.slice(1) === h) return; try { history[replace ? "replaceState" : "pushState"](null, "", "#" + h); } catch (e) { } }
// write: true pushes, "replace" replaces, false leaves the URL alone (we are following it).
// Focus moves to the new page's heading, except from Back/Next, which keep focus in the step bar.
function goTo(i, write = true, from) {
  pos = Math.max(0, Math.min(SEQ.length - 1, i));
  if (write) writeHash(hashFor(SEQ[pos]), write === "replace");
  if (!panelOpen) setPanel(true);
  render();
  if (!started) return;
  if (from) { const b = $("#steps ." + from), o = $("#steps ." + (from === "next" ? "prev" : "next")); const t = b && !b.disabled ? b : o && !o.disabled ? o : null; if (t) { t.focus({ preventScroll: true }); return; } }
  const h = reader.querySelector("h2"); if (h) h.focus({ preventScroll: true });
}
function setMode(m) {
  mode = m;
  ["nights", "index"].forEach(k => $("#m-" + k).setAttribute("aria-pressed", String(mode === k)));
}
function drift() {
  setMode("nights");
  const s = SEQ[pos]; const from = s.type === "city" ? PLACES[BY[s.id].place] : PLACES["emperor"];
  let pool = CITIES.filter(c => !seen.has(c.id) && (s.type !== "city" || c.id !== s.id));
  if (!pool.length) pool = CITIES.filter(c => s.type !== "city" || c.id !== s.id);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  pool.sort((a, b) => dist(PLACES[a.place], from) - dist(PLACES[b.place], from));
  const near = pool.slice(0, 4); const pick = near[Math.floor(Math.random() * near.length)];
  driftNote = DRIFTS[Math.floor(Math.random() * DRIFTS.length)] + " " + PLACES[pick.place].n.replace(/^(The|A|An) /, m => m.toLowerCase()) + ".";
  goTo(seqIndex(pick.id));
}
function visitPlace(k) {
  if (!started) begin("none");
  if (k.startsWith("vision-")) { showVision(+k.slice(7)); return; }
  const here = CITIES.filter(c => c.place === k); if (!here.length) return;
  const curId = SEQ[pos] && SEQ[pos].id; const idx = here.findIndex(c => c.id === curId);
  const pick = idx >= 0 ? here[(idx + 1) % here.length] : (here.find(c => !seen.has(c.id)) || here[0]);
  driftNote = ""; setMode("nights"); closeChart(false); goTo(seqIndex(pick.id));
}
function dismissVision() {
  const v = $("#vision"); const had = v.contains(document.activeElement); v.hidden = true;
  if (!had) return; const o = dismissVision.opener;
  if (o && o.isConnected && !o.closest("[inert]") && !o.closest("[hidden]")) o.focus({ preventScroll: true }); else { const h = reader.querySelector("h2"); h && h.focus({ preventScroll: true }); }
}
function showVision(i, focus) {
  const opener = document.activeElement;
  if (has3D) { City3D.flyToPlace("vision-" + i, 2); City3D.showVision(i); }
  const v = $("#vision"); v.innerHTML = `<small>Circle of Visions · ring ${[...ROMAN, "XI", "XII"][i]} of XII</small><p>${esc(VISIONS[i][2])}</p><button type="button" aria-label="Dismiss the vision">×</button>`;
  v.hidden = false; v.classList.remove("show"); void v.offsetWidth; v.classList.add("show");
  v.querySelector("button").onclick = () => dismissVision();
  dismissVision.opener = opener;
  if (focus) v.querySelector("button").focus();
  clearTimeout(showVision.t); const hide = () => { if (v.contains(document.activeElement)) { showVision.t = setTimeout(hide, 3000); return; } v.hidden = true; }; showVision.t = setTimeout(hide, 13000);
}

/* ---------- panel ---------- */
function panelWidth() { const p = $("#panel"); return p.getBoundingClientRect().width; }
function setPanel(open) {
  panelOpen = open; document.body.classList.toggle("panel-closed", !open);
  $("#panel-toggle").setAttribute("aria-expanded", String(open));
  $("#panel-toggle").textContent = open ? (mqMobile.matches ? "Show the city" : "Hide the story") : "Show the story";
  syncInert();
  requestAnimationFrame(updateOffset);
}
function updateOffset() {
  if (!has3D) return;
  if (!panelOpen || !started) { City3D.setPanel(0, 0); return; }
  if (mqMobile.matches) City3D.setPanel(0, $("#panel").getBoundingClientRect().height * .9);
  else City3D.setPanel(panelWidth(), 0);
}

/* ---------- 2D chart (orientation, and the fallback when WebGL is missing) ---------- */
function buildChart() {
  const places = Object.entries(PLACES).filter(([k]) => CITIES.some(c => c.place === k));
  const pins = places.map(([k, p]) => `<g class="cpin" data-place="${k}" tabindex="0" role="button" aria-label="${esc(p.n)}"><circle class="hit" cx="${p.x}" cy="${p.y}" r="22"/><circle class="halo" cx="${p.x}" cy="${p.y}" r="9"/><circle class="dot" cx="${p.x}" cy="${p.y}" r="7"/><title>${esc(p.n)}</title></g>`).join("");
  const rings = VISIONS.map(([x, y], i) => `<g class="cring" data-v="${i}" tabindex="0" role="button" aria-label="Circle of Visions, ring ${i + 1}"><circle class="hit" cx="${x}" cy="${y}" r="22"/><circle class="ring" cx="${x}" cy="${y}" r="10"/></g>`).join("");
  const dl = DISTRICT_LABELS.map(([t, x, y]) => `<text class="cdl" x="${x}" y="${y}" text-anchor="middle">${esc(t)}</text>`).join("");
  const rp = r => { let d = "M" + r[0] + "," + r[1]; for (let i = 2; i < r.length; i += 2) d += "L" + r[i] + "," + r[i + 1]; return d + "Z"; };
  $("#chart-svg").innerHTML = `<svg viewBox="0 0 908 1199" role="group" aria-label="Chart of Stormreach: places and Circles of Visions">
   <rect width="908" height="1199" fill="var(--c-land)"/>${SHAPES.jungle.map(d => `<path d="${d}" fill="var(--c-jungle)"/>`).join("")}
   <path d="${PLAN.water.map(rs => rs.map(rp).join("")).join("")}" fill="var(--c-sea)" fill-rule="evenodd"/>
   <path d="${PLAN.stone.filter(t => t[0] === 1).map(t => t.slice(1).map(rp).join("")).join("")}" fill="#4a4e4c" fill-rule="evenodd" opacity=".9"/>
   <path d="${PLAN.human.map(rp).join("")}" fill="#7a4a2a" opacity=".9"/>
   ${SHAPES.roads.map(d => `<path d="${d}" stroke="var(--madder)" stroke-width="2.5" fill="none" opacity=".7"/>`).join("")}
   <ellipse cx="514" cy="812" rx="100" ry="70" fill="none" stroke="#a9b6bb" stroke-width="5"/>
   ${dl}${rings}${pins}
   <g transform="translate(828,1110)" class="compass"><circle r="30"/><path d="M0,-26 L5,0 L0,26 L-5,0Z" fill="var(--madder)"/><text y="-36">W</text><text y="47">E</text><text x="44" y="5">N</text><text x="-44" y="5">S</text></g></svg>`;
  document.querySelectorAll(".cpin").forEach(g => { const go = () => visitPlace(g.dataset.place); g.onclick = go; g.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
  document.querySelectorAll(".cring").forEach(g => { const go = () => { if (!started) begin("none"); closeChart(false); showVision(+g.dataset.v, true); }; g.onclick = go; g.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
}
function paintChart(here) {
  document.querySelectorAll(".cpin").forEach(g => { const k = g.dataset.place; g.classList.toggle("here", k === here); g.classList.toggle("seen", CITIES.filter(c => c.place === k).every(c => seen.has(c.id))); });
}
function enterFallback() { document.body.classList.add("no3d"); const c = $("#chart"); c.hidden = false; c.removeAttribute("aria-modal"); c.setAttribute("role", "region"); $("#b-chart").setAttribute("aria-expanded", "false"); }
const REGIONS = ["#hdr", "#panel", "#stage", "#vision", "#chart", "#intro"];
function chartModal() { return has3D && !$("#chart").hidden; }
function canNavigate() { return started && !chartModal(); }
// before Begin only the intro is live; while the 3D chart is open only the chart is live; otherwise everything but the intro
function syncInert() {
  const live = !started ? ["#intro"] : chartModal() ? ["#chart"] : REGIONS.filter(r => r !== "#intro");
  for (const sel of REGIONS) { const el = $(sel); if (el) el.inert = !live.includes(sel); }
  $("#reader").inert = $("#steps").inert = !panelOpen || !live.includes("#panel");
}
function openChart(focusPlace) { const c = $("#chart"); c.hidden = false; $("#vision").hidden = true; if (has3D) { $("#b-chart").setAttribute("aria-expanded", "true"); syncInert(); } const g = focusPlace && document.querySelector(`.cpin[data-place="${focusPlace}"]`); (g || c.querySelector(".close")).focus(); }
function closeChart(refocus = true) { if (has3D && !$("#chart").hidden) { $("#chart").hidden = true; $("#b-chart").setAttribute("aria-expanded", "false"); syncInert(); if (refocus) $("#b-chart").focus(); } }

/* ---------- intro ---------- */
function showIndex() { clearTimeout(nightCard.t); $("#nightcard").hidden = true; setMode("index"); render(); const h = reader.querySelector("h2"); h && h.focus({ preventScroll: true }); }
function begin(where) {
  lastNight = -1;
  started = true; document.body.classList.add("started"); setTitle();
  $("#intro").classList.add("gone"); clearTimeout(begin.t); begin.t = setTimeout(() => $("#intro").hidden = true, 900);
  if (has3D) City3D.stopIntro();
  setPanel(true);
  syncInert();
  if (where === "wander") { writeHash("index", true); showIndex(); }
  else if (where !== "none") { setMode("nights"); goTo(0, "replace"); }
}

// "The end" closes the book: back to the opening screen, as a new history entry (Back returns to dawn)
function backToStart(push = true) {
  readWatch(null); closeChart(false); $("#vision").hidden = true; clearTimeout(nightCard.t); $("#nightcard").hidden = true;
  if (push) { try { history.pushState(null, "", location.pathname + location.search); } catch (e) { } }
  started = false; document.body.classList.remove("started"); clearTimeout(begin.t);
  const intro = $("#intro"); intro.hidden = false; void intro.offsetWidth; intro.classList.remove("gone");
  driftNote = ""; setMode("nights"); pos = 0; lastNight = -1; render(false); setTitle();
  if (has3D) City3D.startIntro(); syncInert(); $("#begin").focus({ preventScroll: true });
}

/* ---------- boot ---------- */
function fromHash() {
  const h = (location.hash || "").slice(1);
  if (!h) return -1;
  if (h === "dawn") return SEQ.length - 1;
  const m = h.match(/^night-(10|[1-9])$/); if (m) return SEQ.findIndex(s => s.type === "frame" && s.n === +m[1] - 1);
  const i = seqIndex(h); return i;
}
function boot() {
  buildChart();
  try {
    has3D = typeof City3D !== "undefined" && !!City3D && City3D.init($("#stage"), {
      onPick: k => visitPlace(k),
      onThunder: (d, s) => Storm.thunder(d, s),
      onHover: k => { $("#hover").textContent = k ? (k.startsWith("vision-") ? "A Circle of Visions" : PLACES[k].n) : ""; },
      onLost: () => { has3D = false; enterFallback(); $("#stage").hidden = true; syncInert(); }
    });
  } catch (e) { console.error(e); has3D = false; }
  if (has3D) {
    const pinList = Object.entries(PLACES).filter(([k]) => CITIES.some(c => c.place === k)).map(([k, p]) => ({ key: k, label: p.n, x: p.x, y: p.y, kind: "place", lift: k === "floating-ruins" ? 16 : k === "falconers-spire" ? 4 : k === "emperor" ? 4 : 2.4 }))
      .concat(VISIONS.map(([x, y], i) => ({ key: "vision-" + i, label: "Circle of Visions, ring " + (i + 1), short: "Circle of Visions", x, y, kind: "vision", lift: 1.6 })));
    City3D.mountPins($("#pins"), pinList, p => visitPlace(p.key));
  } else {
    enterFallback();
  }
  $("#m-nights").onclick = () => { if (!started) { begin(); return; } if (mode === "nights") return; driftNote = ""; setMode("nights"); writeHash(hashFor(SEQ[pos])); render(); };
  $("#m-index").onclick = () => { if (!started) { begin("wander"); return; } if (mode === "index") return; driftNote = ""; writeHash("index"); showIndex(); };
  $("#m-drift").onclick = () => { if (!started) begin("none"); drift(); };
  reader.addEventListener("scroll", () => { if (readWatch.id && reader.scrollHeight > reader.clientHeight + 40 && reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 24) markRead(readWatch.id); }, { passive: true });
  $("#b-chart").onclick = () => { $("#chart").hidden ? openChart() : closeChart(); };
  $("#chart .close").onclick = () => closeChart(true);
  $("#b-sound").onclick = () => { const on = Storm.toggle(); $("#b-sound").setAttribute("aria-pressed", String(on)); $("#b-sound").querySelector("span").textContent = on ? "Sound on" : "Sound off"; };
  $("#panel-toggle").onclick = () => setPanel(!panelOpen);
  $("#begin").onclick = () => begin();
  $("#wander").onclick = () => { begin("none"); drift(); };
  $("#intro-sound").onclick = () => { $("#b-sound").click(); $("#intro-sound").textContent = Storm.on ? "Silence the storm" : "Turn on the storm"; };
  addEventListener("keydown", e => {
    if (e.target.closest("input,textarea")) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === "Escape") { if (!$("#vision").hidden) { dismissVision(); return; } if (!$("#chart").hidden && has3D) closeChart(); else if (!started) begin(); return; }
    if (!canNavigate() || !panelOpen || mode !== "nights" || e.target.closest(".lantern")) return;
    const to = e.key === "ArrowRight" ? pos + 1 : e.key === "ArrowLeft" ? pos - 1 : -1; if (to < 0 || to >= SEQ.length) return; driftNote = ""; goTo(to);
  });
  addEventListener("hashchange", () => {
    if (!location.hash && started) { backToStart(false); return; } // Forward onto the opening screen
    if (location.hash === "#index") { driftNote = ""; if (!started) { begin("wander"); return; } if (chartModal()) closeChart(mode === "index"); if (mode !== "index") showIndex(); return; }
    const i = fromHash(); if (i < 0) return; driftNote = ""; if (!started) { begin("none"); setMode("nights"); goTo(i, true); return; } const moving = i !== pos || mode !== "nights"; if (chartModal()) closeChart(!moving); if (moving) { setMode("nights"); goTo(i, false); } });
  addEventListener("resize", () => { setPanel(panelOpen); });
  mqMobile.addEventListener("change", () => setPanel(panelOpen));
  const h = fromHash();
  if (location.hash === "#index") { pos = 0; started = true; document.body.classList.add("started"); $("#intro").hidden = true; setPanel(true); setMode("index"); render(); }
  else if (h >= 0) { pos = h; started = true; document.body.classList.add("started"); $("#intro").hidden = true; setPanel(true); render(); }
  else { pos = 0; render(false); if (has3D) City3D.startIntro(); syncInert(); setTimeout(() => $("#begin").focus({ preventScroll: true }), 50); }
  ledger();
}
boot();
