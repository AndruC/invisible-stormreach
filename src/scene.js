/* Stormreach at night: a procedural diorama built from the chart shapes in data.js. */
const City3D = (typeof THREE === "undefined") ? null : (() => {
  const DEBUG = /(^|[?&])debug(=|&|$)/.test(location.search) || location.hash === "#debug";
  const SCALE = 0.2;
  const toWorld = (mx, my) => [(mx - 454) * SCALE, (my - 600) * SCALE];
  const toChart = (x, z) => [x / SCALE + 454, z / SCALE + 600];

  let renderer, scene, camera, controls, composer, bloomPass, clock;
  let W = 0, H = 0, panelPx = 0, panelPy = 0, lowQuality = false, reduceMotion = false;
  const hooks = {};
  const U = { time: { value: 0 }, flash: { value: 0 }, dawn: { value: 0 }, rain: { value: .9 }, moon: { value: 0 }, calm: { value: 0 },
    titan: { value: 0 }, offerings: { value: 0 }, bonfires: { value: 0 }, cut: { value: new THREE.Vector4(0, 0, 0, 0) }, fogBank: { value: 0 }, reveal: { value: new THREE.Vector4(0, 0, 0, 0) }, pixel: { value: 600 }, fogColor: { value: new THREE.Color(0x0b1317) }, fogDensity: { value: .0085 } };
  let target = { rain: .9, lightning: .8, dawn: 0, moon: 0, calm: 0, titan: 0, offerings: 0, bonfires: 0, cut: 0, reveal: 0, fog: 0, flood: 0 };
  let cur = { ...target };
  const pickables = [];
  let pins = [], labels = [], visionCols = [];
  let flight = null, idleOrbit = null, introFlight = null, dawnPush = null;
  let currentKey = null, hoverKey = null;
  let emperorHead, beamGroup, lighthouseBeam, hemi, moonLight, emperorLight, flashLight, titanLight, titanGroup;
  let floaters = [], ships = [], airship;
  let skyMat, waterMat;
  let boltMesh, boltLife = 0, nextBolt = 3;
  let fpsSamples = [], adaptiveDone = false;

  /* ---------- noise ---------- */
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); a *= .5; f *= 2.03; } return s; }
  let seed = 1337;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rr = (a, b) => a + (b - a) * rnd();

  /* ---------- chart masks (Path2D rasters) ---------- */
  const MW = 454, MH = 600; // half-resolution chart rasters
  const masks = {};
  function raster(draw, blur) {
    const c = document.createElement("canvas"); c.width = MW; c.height = MH;
    const g = c.getContext("2d"); g.scale(MW / 908, MH / 1199); draw(g);
    let src = c;
    if (blur) { const c2 = document.createElement("canvas"); c2.width = MW; c2.height = MH; const g2 = c2.getContext("2d"); g2.filter = `blur(${blur}px)`; g2.drawImage(c, 0, 0); src = c2; }
    const d = src.getContext("2d").getImageData(0, 0, MW, MH).data; const out = new Float32Array(MW * MH);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
    return out;
  }
  let glowCanvas, glowTex, roadPolys = [];
  function sampleRoads() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.style.cssText = "position:absolute;width:0;height:0;visibility:hidden"; document.body.appendChild(svg);
    roadPolys = SHAPES.roads.map(d => { const el = document.createElementNS("http://www.w3.org/2000/svg", "path"); el.setAttribute("d", d); svg.appendChild(el); const L = el.getTotalLength(); const pts = []; for (let i = 0; i <= 160; i++) { const q = el.getPointAtLength(L * i / 160); pts.push([q.x, q.y]); } return pts; });
    svg.remove();
  }
  function roadNear(mx, my) { // distance (chart units) and tangent angle of the nearest road
    let bd = 1e9, ang = 0;
    for (const pts of roadPolys) for (let i = 0; i < pts.length - 1; i += 2) { const a = pts[i]; const d = (a[0] - mx) ** 2 + (a[1] - my) ** 2; if (d < bd) { bd = d; const b = pts[Math.min(i + 2, pts.length - 1)]; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); } }
    return [Math.sqrt(bd), ang];
  }
  function ringPath(a) { let d = "M" + a[0] + "," + a[1]; for (let i = 2; i < a.length; i += 2) d += "L" + a[i] + "," + a[i + 1]; return d + "Z"; }
  function planPath(list) { return new Path2D(list.map(rings => rings.map(ringPath).join("")).join("")); }
  function buildMasks() {
    glowCanvas = document.createElement("canvas"); glowCanvas.width = MW; glowCanvas.height = MH;
    glowTex = new THREE.CanvasTexture(glowCanvas); glowTex.flipY = false; glowTex.minFilter = THREE.LinearFilter; glowTex.magFilter = THREE.LinearFilter;
    U.glow = { value: glowTex }; U.glowAmt = { value: 1 };
    masks.land = raster(g => {
      g.fillStyle = "#fff"; g.fillRect(0, 0, 908, 1199); g.fillStyle = "#000";
      g.fill(planPath(PLAN.water), "evenodd");
    }, 2.2);
    masks.inland = raster(g => { g.fillStyle = "#fff"; g.fillRect(0, 0, 908, 1199); g.fillStyle = "#000"; g.fill(planPath(PLAN.water), "evenodd"); }, 26);
    masks.city = raster(g => { g.fillStyle = "#fff"; g.fill(new Path2D(ringPath(PLAN.city))); }, 6);
    masks.stone = raster(g => { g.fillStyle = "#fff"; g.fill(planPath(PLAN.stone.filter(t => t[0] === 1).map(t => t.slice(1))), "evenodd"); }, 0);
    masks.human = raster(g => { g.fillStyle = "#fff"; PLAN.human.forEach(r => g.fill(new Path2D(ringPath(r)))); }, 0);
    masks.jungle = raster(g => { g.fillStyle = "#fff"; SHAPES.jungle.forEach(p => g.fill(new Path2D(p))); }, 8);
    masks.road = raster(g => { g.strokeStyle = "#fff"; g.lineWidth = 9; g.lineCap = "round"; SHAPES.roads.forEach(p => g.stroke(new Path2D(p))); }, 1.5);
  }
  function sample(m, mx, my) {
    let fx = mx * MW / 908 - .5, fy = my * MH / 1199 - .5;
    fx = Math.max(0, Math.min(MW - 1.001, fx)); fy = Math.max(0, Math.min(MH - 1.001, fy));
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, i = y0 * MW + x0;
    const a = m[i], b = m[i + 1], c = m[i + MW], d = m[i + MW + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /* ---------- terrain height (world units) ---------- */
  const HILLS = [[530, 640, 170, 4.2], [343, 330, 140, 3.2], [430, 120, 130, 3.6], [640, 390, 120, 2.6], [200, 300, 120, 1.6], [700, 700, 110, 2.2]];
  const FLAT = [[514, 812, 125], [660, 985, 60], [350, 440, 42], [343, 292, 38], [705, 687, 50], [176, 612, 56]];
  function upliftRaw(mx, my) {
    const inland = sample(masks.inland, mx, my);
    let u = 6.2 * smooth(.5, .97, inland);
    for (const [hx, hy, r, a] of HILLS) { const d = Math.hypot(mx - hx, my - hy) / r; u += a * Math.exp(-d * d * 1.6); }
    return u * smooth(.6, .95, inland + .25);
  }
  function uplift(mx, my) {
    let u = upliftRaw(mx, my);
    for (const [fx, fy, r] of FLAT) { const d = Math.hypot(mx - fx, my - fy); if (d < r) u += (upliftRaw(fx, fy) - u) * smooth(r, r * .65, d); }
    // terraces: broad plateaus joined by steep giant-built banks
    const step = 1.75, q = u / step, f = q - Math.floor(q);
    return (Math.floor(q) + smooth(.8, 1, f)) * step;
  }
  // the Southwatch river under the Black Freighter, from its mooring out to the bay: [distance, position along it]
  function river(mx, my) { const ax = 176, ay = 170, bx = 60, by = 286, vx = bx - ax, vy = by - ay; const t = Math.max(0, Math.min(1, ((mx - ax) * vx + (my - ay) * vy) / (vx * vx + vy * vy))); return [Math.hypot(mx - ax - vx * t, my - ay - vy * t), t]; }
  const RIVER_PTS = []; for (let i = 0; i <= 24; i++) for (const o of [-22, 0, 22]) { const t = i / 24; RIVER_PTS.push([176 - 116 * t + o * .707, 170 + 116 * t + o * .707]); }
  // a footprint that touches the river or spans it
  const nearRiver = pts => pts.some(([x, y]) => river(x, y)[0] < 32) || RIVER_PTS.some(([x, y]) => pointIn(pts, x, y));
  const offSilverwall = (mx, my) => smooth(975, 1015, my) * smooth(425, 455, mx) * smooth(615, 590, mx);
  function heightChart(mx, my) {
    let land = sample(masks.land, mx, my);
    const outside = Math.max(-mx, mx - 908, -my, my - 1199, 0);
    if (outside > 0) land = Math.max(0, Math.min(1, land + (fbm(mx * .006, my * .006, 3) - .48) * 1.6 * Math.min(1, outside / 120)));
    if (my > 1199) land *= 1 - smooth(1199, 1240, my);
    land *= 1 - offSilverwall(mx, my); // no causeway running out from under Silverwall // past the chart's seaward edge there is only sea (the mask's last row would otherwise run on as a causeway)
    const city = sample(masks.city, mx, my);
    let h = -4.2 + 5.6 * smooth(.25, .75, land);
    const wild = 1 - city;
    h += land > .5 ? (fbm(mx * .012, my * .012) - .45) * (0.8 + wild * 6.5) * smooth(.5, .8, land) : 0;
    // cliffs: the Emperor's promontory and the eastern cliffs past the shipyard
    const cliff = (cx, cy, r, amp) => { const d = Math.hypot(mx - cx, my - cy); return amp * smooth(r, r * .35, d); };
    h += cliff(66, 768, 64, 10) * smooth(.45, .7, land);
    h += cliff(424, 966, 46, 7.5) * smooth(.45, .7, land);
    h += cliff(706, 335, 40, 2.8) * smooth(.45, .7, land); // Deneith's hill
    // the trench where every earlier people stopped building, east of Locksmith Square
    { const T = [[612, 742], [600, 860], [568, 962], [548, 1060]]; let td = 1e9; for (let i = 0; i < T.length - 1; i++) { const [ax, ay] = T[i], [bx, by] = T[i + 1]; const vx = bx - ax, vy = by - ay; const t = Math.max(0, Math.min(1, ((mx - ax) * vx + (my - ay) * vy) / (vx * vx + vy * vy))); td = Math.min(td, Math.hypot(mx - ax - vx * t, my - ay - vy * t)); }
      h -= 3.2 * smooth(16, 7, td) * smooth(.5, .8, land); }
    if (outside < 40) h += uplift(mx, my) * smooth(.5, .8, land) * (1 - smooth(0, 40, outside));
    // far ranges beyond the chart (inland is up/left on the chart)
    const out = Math.max(0, -my - 60) + Math.max(0, mx - 1100) * .6 + Math.max(0, -mx - 260) * .18;
    h += Math.min(46, out * .05 * (0.6 + fbm(mx * .004, my * .004, 3))) * smooth(.4, .8, land);
    // the Southwatch river: a channel from the Freighter's mooring out to the bay
    { const [rd, t] = river(mx, my); const k = smooth(30, 16, rd) * smooth(0, .06, t); if (k > 0) h = h + (-3.4 - h) * k; }
    return h;
  }
  const heightAt = (x, z) => { const [mx, my] = toChart(x, z); return heightChart(mx, my); };

  /* ---------- materials ---------- */
  const mats = {};
  const matCache = new Map();
  function stdMat(color, opts = {}) {
    if (opts.map || opts.envMap || opts.unique) { const { unique, ...o } = opts; return new THREE.MeshStandardMaterial({ color, roughness: .92, metalness: 0, ...o }); }
    const key = color + JSON.stringify(opts); let m = matCache.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: .92, metalness: 0, ...opts }); matCache.set(key, m); }
    return m;
  }

  /* ---------- builders ---------- */
  function buildTerrain() {
    const size = 700, seg = lowQuality ? 280 : 470;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const cSea = new THREE.Color(0x0b1c1f), cSand = new THREE.Color(0x5d5544), cCity = new THREE.Color(0x3d3a33), cRoad = new THREE.Color(0x5a5145),
      cJungle = new THREE.Color(0x13261a), cGrass = new THREE.Color(0x253325), cRock = new THREE.Color(0x3b3d39), cCliff = new THREE.Color(0x5a5448), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i); const [mx, my] = toChart(x, z);
      const h = heightChart(mx, my); pos.setY(i, h); const land = sample(masks.land, mx, my);
      const city = sample(masks.city, mx, my), jungle = Math.max(sample(masks.jungle, mx, my), 1 - smooth(.2, .9, city) * (mx > -80 && mx < 990 && my > -80 && my < 1280 ? 1 : 0)), road = sample(masks.road, mx, my);
      tmp.copy(cGrass).lerp(cJungle, smooth(.3, .8, jungle));
      tmp.lerp(cCity, smooth(.35, .75, city) * (1 - smooth(.6, 1, jungle) * .7));
      tmp.lerp(cRoad, road * .8 * city);
      if (h > 9) tmp.lerp(cRock, smooth(9, 20, h));
      { const sl = Math.abs(heightChart(mx + 3, my) - h) + Math.abs(heightChart(mx, my + 3) - h); if (sl > .9 && land > .5) tmp.lerp(cCliff, smooth(.9, 2.2, sl)); }
      tmp.lerp(cSand, smooth(1.6, .25, h) * smooth(-1.5, .2, h));
      tmp.lerp(cSea, smooth(-.2, -2.5, h));
      const n = .88 + .24 * vnoise(mx * .08, my * .08); tmp.multiplyScalar(n);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const tmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97, metalness: 0 });
    tmat.onBeforeCompile = sh => {
      sh.uniforms.uCut = U.cut; sh.uniforms.uGlow = U.glow; sh.uniforms.uGlowAmt = U.glowAmt;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform vec4 uCut; uniform sampler2D uGlow; uniform float uGlowAmt;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(.3,.17,.07) * texture2D(uGlow, vec2(vWPos.x / 181.6 + .5, vWPos.z / 239.8 + .5005)).r * uGlowAmt;').replace('void main() {', 'void main() {\n  if (uCut.w > 0.01 && distance(vWPos.xz, uCut.xz) < uCut.w) discard;');
    };
    const mesh = new THREE.Mesh(geo, tmat);
    scene.add(mesh);
    // the land runs on to the horizon: a coarse ring beyond the detailed ground
    const og = new THREE.PlaneGeometry(2600, 2600, 160, 160); og.rotateX(-Math.PI / 2); const op = og.attributes.position, oc = new Float32Array(op.count * 3);
    for (let i = 0; i < op.count; i++) { const x = op.getX(i), z = op.getZ(i); const inner = Math.max(Math.abs(x), Math.abs(z)) < 345; const [mx, my] = toChart(x, z); const h = heightChart(mx, my) - (inner ? 6 : 0); op.setY(i, h);
      const k = .75 + .3 * vnoise(x * .02, z * .02); const c = h < -.5 ? [.04, .1, .11] : h > 14 ? [.16, .18, .16] : [.08, .15, .1]; oc.set([c[0] * k, c[1] * k, c[2] * k], i * 3); }
    og.setAttribute("color", new THREE.BufferAttribute(oc, 3)); og.computeVertexNormals();
    const omat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }); omat.onBeforeCompile = tmat.onBeforeCompile; omat.customProgramCacheKey = () => "outer";
    scene.add(new THREE.Mesh(og, omat));
  }

  const GLSL_NOISE = `
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
      return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
    float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }`;

  function buildSky() {
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: U.time, uFlash: U.flash, uDawn: U.dawn, uRain: U.rain, uMoon: U.moon, uBeamTop: { value: new THREE.Vector3(0, 160, 0) } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: GLSL_NOISE + `
        varying vec3 vDir; uniform float uTime,uFlash,uDawn,uRain,uMoon; uniform vec3 uBeamTop;
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 zen = mix(vec3(.012,.02,.032), vec3(.32,.38,.52), uDawn);
          vec3 hor = mix(vec3(.05,.075,.088), vec3(.88,.62,.5), uDawn);
          vec3 col = mix(hor, zen, smoothstep(-.02,.55,h));
          // moon behind cloud
          vec3 md = normalize(vec3(.45,.42,-.78));
          float mg = max(dot(d,md),0.);
          col += vec3(.55,.62,.72) * (pow(mg,900.)*1.6 + pow(mg,24.)*.22) * uMoon * (1.-uDawn);
          // cloud deck
          vec2 cp = d.xz/(h+.18)*1.6 + vec2(uTime*.012, uTime*.004);
          float cl = fbm(cp) ; float cover = mix(.36, .62, uRain);
          float c = smoothstep(cover-.12, cover+.18, cl) * smoothstep(-.05,.12,h);
          vec3 ccol = mix(vec3(.035,.045,.055), vec3(.55,.5,.52), uDawn) + uFlash*vec3(.55,.6,.8)*(.4+cl);
          col = mix(col, ccol, c*.92);
          float bh = max(dot(d, normalize(uBeamTop - cameraPosition)), 0.);
          col += vec3(1.,.72,.38) * (pow(bh, 260.)*.4 + pow(bh, 40.)*.07) * (.35 + c) * (1.-uDawn*.8);
          // stars in clear patches
          vec2 sp = floor(d.xz/(h+.05)*180.);
          float st = step(.9965, h21(sp)) * (1.-c) * smoothstep(.15,.5,h) * (1.-uRain) * (1.-uDawn);
          col += st*vec3(.8,.85,1.)*.9;
          // the Roc King's black cloud, always on the southern horizon (-x)
          vec3 rd = normalize(vec3(-1.,0.,.12));
          float ra = max(dot(normalize(vec3(d.x,0.,d.z)), rd),0.);
          float tower = .1 + .22*smoothstep(.9,.995,ra) + .08*vn(vec2(atan(d.z,d.x)*30., 1.));
          float rmass = smoothstep(.9,.985,ra) * smoothstep(tower, tower - .035, h) * smoothstep(-.06,.0,h);
          col += vec3(.05,.07,.09) * smoothstep(.25,.0,abs(h-.02)) * uMoon * (1.-uDawn);
          float rn = fbm(vec2(atan(d.z,d.x)*14., h*24.) + uTime*.03);
          float roc = smoothstep(.25,.6, rmass*(.6+rn*.8));
          float inner = (pow(vn(vec2(uTime*3.1, 2.)),10.)*1.6 + .06)*smoothstep(.35,.0,h);
          col = mix(col, vec3(.008,.006,.012) + vec3(.25,.2,.45)*inner*rn, roc);
          col += uFlash*vec3(.08,.09,.12)*(1.-c*.5);
          gl_FragColor = vec4(col,1.);
        }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat); sky.renderOrder = -10; scene.add(sky);
  }

  function buildWater() {
    const geo = new THREE.PlaneGeometry(2600, 2600, lowQuality ? 140 : 260, lowQuality ? 140 : 260); geo.rotateX(-Math.PI / 2);
    waterMat = new THREE.ShaderMaterial({
      transparent: true, uniforms: { uGlow: U.glow, uGlowAmt: U.glowAmt, uRain: U.rain, uCut: U.cut, uReveal: U.reveal, uTime: U.time, uFlash: U.flash, uDawn: U.dawn, uCalm: U.calm, uFogColor: U.fogColor, uFogDensity: U.fogDensity, uBeam: { value: new THREE.Vector3() }, uMoon: U.moon, uLh: { value: new THREE.Vector3() }, uLhDir: { value: new THREE.Vector2(1, 0) }, uLhClip: { value: 1e4 } },
      vertexShader: `uniform float uTime,uCalm; varying vec3 vW; varying vec3 vN;
        vec3 wave(vec2 p){ float a = mix(.22,.05,uCalm);
          float h = sin(dot(p,vec2(.13,.08))+uTime*.9)*a + sin(dot(p,vec2(-.07,.19))+uTime*1.3)*a*.6 + sin(dot(p,vec2(.31,-.27))+uTime*2.1)*a*.25;
          float dx = cos(dot(p,vec2(.13,.08))+uTime*.9)*a*.13 + cos(dot(p,vec2(-.07,.19))+uTime*1.3)*a*.6*-.07 + cos(dot(p,vec2(.31,-.27))+uTime*2.1)*a*.25*.31;
          float dz = cos(dot(p,vec2(.13,.08))+uTime*.9)*a*.08 + cos(dot(p,vec2(-.07,.19))+uTime*1.3)*a*.6*.19 + cos(dot(p,vec2(.31,-.27))+uTime*2.1)*a*.25*-.27;
          return vec3(h,dx,dz); }
        void main(){ vec3 p = position; vec4 w = modelMatrix*vec4(p,1.); vec3 wv = wave(w.xz); w.y += wv.x; vW = w.xyz; vN = normalize(vec3(-wv.y,1.,-wv.z)); gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: GLSL_NOISE + `uniform float uTime,uFlash,uDawn,uFogDensity,uMoon; uniform vec3 uFogColor,uBeam,uLh; uniform vec2 uLhDir; uniform float uLhClip; uniform vec4 uCut,uReveal; uniform sampler2D uGlow; uniform float uGlowAmt,uRain; varying vec3 vW; varying vec3 vN;
        vec2 cuv(vec2 w){ return vec2(w.x/181.6+.5, w.y/239.8+.5005); }
        void main(){
          if (uCut.w > 0.01 && distance(vW.xz, uCut.xz) < uCut.w) discard;
          vec3 n = normalize(vN + vec3(vn(vW.xz*1.7+uTime*.6)-.5, 0., vn(vW.zx*1.9-uTime*.5)-.5)*.18);
          vec3 v = normalize(cameraPosition - vW);
          float fr = pow(1.-max(dot(n,v),0.),4.);
          vec3 deep = mix(vec3(.006,.022,.028), vec3(.12,.17,.2), uDawn);
          vec3 skyc = mix(vec3(.04,.06,.075), vec3(.7,.55,.5), uDawn) + uFlash*vec3(.5,.55,.7);
          vec3 col = mix(deep, skyc, fr*.85+.05);
          // the Emperor's beam on the water
          vec3 l = normalize(uBeam - vW); vec3 hv = normalize(l+v);
          float sp = pow(max(dot(n,hv),0.), 260.) * 1.1 / (1.+distance(uBeam.xz,vW.xz)*.02);
          col += vec3(1.,.78,.4)*sp*(1.-uDawn*.8);
          // the city's lights, broken up on the swell
          vec2 away = normalize(vW.xz - cameraPosition.xz + vec2(.0001));
          vec2 wob = n.xz * 6.;
          float gl = texture2D(uGlow, cuv(vW.xz + away*1.5 + wob)).r*.5 + texture2D(uGlow, cuv(vW.xz + away*4. + wob*1.4)).r*.35 + texture2D(uGlow, cuv(vW.xz + away*8. + wob*2.)).r*.25;
          col += vec3(1.,.6,.26) * gl * uGlowAmt * (.55 + fr) * 1.3;
          // rain rings
          vec2 cell = floor(vW.xz*.7); vec2 fc = fract(vW.xz*.7) - .5; float hh = h21(cell); float tt = fract(uTime*1.3 + hh*7.);
          float ring = smoothstep(.05,.0,abs(length(fc - (vec2(h21(cell+3.1), h21(cell+7.7))-.5)*.4) - tt*.4)) * (1.-tt) * step(.35, hh);
          col += vec3(.35,.42,.5) * ring * uRain * .35;
          // moon glitter
          vec3 md = normalize(vec3(.45,.42,-.78)); float ms = pow(max(dot(n, normalize(md+v)),0.),220.);
          col += vec3(.6,.7,.85)*ms*uMoon*2.;
          // lighthouse sweep
          vec2 to = vW.xz-uLh.xz; float ang = dot(normalize(to), uLhDir);
          col += vec3(.95,.92,.8)*smoothstep(.985,1.,ang)*exp(-length(to)*.025)*.35*(1.-uDawn)*smoothstep(uLhClip, uLhClip - 2., length(to));
          float fd = 1.-exp(-pow(uFogDensity*length(cameraPosition-vW),2.));
          float clear = uReveal.w * smoothstep(uReveal.y, uReveal.y * .45, distance(vW.xz, uReveal.xz));
          col += vec3(.0,.06,.07) * clear;
          gl_FragColor = vec4(mix(col, uFogColor, fd), 1. - clear * .72);
        }`
    });
    const water = new THREE.Mesh(geo, waterMat); water.position.y = 0; water.renderOrder = -1; scene.add(water);
  }

  function buildRain() {
    const N = lowQuality ? 2500 : 7000; const pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2 * 4);
    for (let i = 0; i < N; i++) { const sx = Math.random(), sy = Math.random(), sz = Math.random(), sp = .8 + Math.random() * .5;
      for (let k = 0; k < 2; k++) { const j = (i * 2 + k); seed.set([sx, sy, sz, k === 0 ? sp : -sp], j * 4); } }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.time, uRain: U.rain, uCenter: { value: new THREE.Vector3() }, uFlash: U.flash },
      vertexShader: `attribute vec4 aSeed; uniform float uTime,uRain; uniform vec3 uCenter; varying float vA;
        void main(){ vec3 box = vec3(70.,40.,70.); float sp = abs(aSeed.w);
          vec3 p = aSeed.xyz*box; p.y = mod(p.y - uTime*26.*sp, box.y);
          p.x = uCenter.x + mod(p.x - uCenter.x + uTime*3., box.x) - box.x*.5;
          p.z = uCenter.z + mod(p.z - uCenter.z, box.z) - box.z*.5;
          p.y += uCenter.y - 6.;
          if(aSeed.w < 0.){ p += vec3(-.18, 1.8, 0.)*(.6+uRain*.5); }
          vA = step(aSeed.x*.999, uRain) * (aSeed.w<0.?0.:1.);
          gl_Position = projectionMatrix*viewMatrix*vec4(p,1.); }`,
      fragmentShader: `varying float vA; uniform float uFlash; void main(){ gl_FragColor = vec4(vec3(.62,.7,.8)*(.6+uFlash), 1.)*vA*.6; }` });
    const rain = new THREE.LineSegments(g, m); rain.frustumCulled = false; rain.userData.mat = m; scene.add(rain); hooks.rain = rain;
  }

  /* generic point sprites with per-point color/size/phase, optional rise animation */
  function pointsMat(kind) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: kind === "smoke" ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: { uTime: U.time, uPixel: U.pixel, uDawn: U.dawn, uGate: { value: 1 }, uFogColor: U.fogColor, uFogDensity: U.fogDensity },
      vertexShader: `attribute vec3 aColor; attribute vec3 aMeta; uniform float uTime,uPixel,uGate,uDawn; varying vec3 vC; varying float vA; varying float vDist; varying float vMode;
        void main(){ vec3 p = position; float size = aMeta.x, ph = aMeta.y, mode = aMeta.z; float a = 1.;
          if(mode < .5){ a = .82 + .18*sin(uTime*(2.+ph*3.)+ph*40.); a *= (1.-uDawn*.85); }
          else if(mode < 1.5){ float t = fract(uTime*.11 + ph); p.y += t*9.; p.x += sin(t*6.+ph*9.)*.9*t; p.z += cos(t*5.+ph*7.)*.9*t; size *= .6+t*2.6; a = (1.-t)*smoothstep(0.,.1,t)*.55; }
          else if(mode < 2.5){ float t = fract(uTime*.9 + ph); p.y += t*3.5; p.x += sin(t*9.+ph*20.)*.35; p.z += cos(t*7.+ph*11.)*.35; size *= 1.2-t; a = (1.-t)*(.6+.4*sin(uTime*20.+ph*50.)); }
          else if(mode < 3.5){ float t = fract(uTime*.05 + ph); p.y += t*6.; p.x += sin(uTime*.7+ph*10.)*.6; a = sin(t*3.14159)*.85; }
          else if(mode < 4.5){ p.y += sin(uTime*1.3+ph*30.)*.06; a = .75+.25*sin(uTime*3.+ph*20.); }
          else if(mode > 5.5){ float t = fract(uTime*.035 + ph); p.y -= t*16.; p.x += sin(uTime*.8+ph*12.)*1.4*t; p.z += cos(uTime*.6+ph*9.)*1.4*t; a = sin(t*3.14159)*.75*(1.-uDawn*.5); }
          else { p.y = .12 + sin(uTime*1.1+ph*20.)*.05; a = .38*(.7+.3*sin(uTime*2.3+ph*30.))*(1.-uDawn*.85); size *= 3.2; }
          a *= uGate; vC = aColor; vA = a; vMode = mode;
          vec4 mv = modelViewMatrix*vec4(p,1.); vDist = -mv.z; gl_PointSize = clamp(size*1.9*uPixel/max(-mv.z,.1), ${kind === "smoke" ? "2." : "3."}, 140.); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; varying float vDist; varying float vMode; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime;
        void main(){ vec2 q = gl_PointCoord-.5; float r = length(q); float f = smoothstep(.5,.0,r);
          ${kind === "smoke" ? "f = smoothstep(.5,.15,r)*.5;" : "f = f*f + smoothstep(.12,.0,r)*.6;"}
          if (vMode > 4.5 && vMode < 5.5) { f = smoothstep(.5,.0,abs(q.x)*4.5) * smoothstep(.5,.05,abs(q.y)) * (.55+.45*sin(q.y*38.+uTime*5.+vDist)); }
          float fog = exp(-pow(uFogDensity*vDist*.45,2.));
          gl_FragColor = vec4(vC*fog, f*vA*(${kind === "smoke" ? "fog" : "1."})); }`
    });
  }
  function makePoints(list, kind) { // list: [x,y,z,r,g,b,size,phase,mode]
    const n = list.length, p = new Float32Array(n * 3), c = new Float32Array(n * 3), m = new Float32Array(n * 3);
    list.forEach((e, i) => { p.set(e.slice(0, 3), i * 3); c.set(e.slice(3, 6), i * 3); m.set(e.slice(6, 9), i * 3); });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("aColor", new THREE.BufferAttribute(c, 3)); g.setAttribute("aMeta", new THREE.BufferAttribute(m, 3));
    const pts = new THREE.Points(g, pointsMat(kind)); pts.frustumCulled = false; scene.add(pts);
    if (kind === "light" && !makePoints.noReflect) {
      const refl = list.filter(e => e[8] !== 5 && e[1] > -.5 && e[1] < 14 && sample(masks.land, ...toChart(e[0], e[2])) < .4).map(e => [e[0], 0, e[2], e[3], e[4], e[5], e[6], e[7], 5]);
      if (refl.length) { makePoints.noReflect = true; const r = makePoints(refl, "light"); makePoints.noReflect = false; pts.userData.refl = r; }
    }
    return pts;
  }

  /* ---------- city fabric ---------- */
  const exclusions = [];
  function excluded(mx, my) { if (river(mx, my)[0] < 30 || offSilverwall(mx, my) > .2) return true; for (const [ex, ey, r] of exclusions) if ((mx - ex) ** 2 + (my - ey) ** 2 < r * r) return true; return false; }
  function buildHouses() {
    const N = lowQuality ? 3200 : 6500;
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
    const roof = new THREE.ConeGeometry(.75, .6, 4, 1); roof.rotateY(Math.PI / 4); roof.translate(0, .3, 0);
    const tent = new THREE.ConeGeometry(.6, .9, 6, 1); tent.translate(0, .45, 0);
    const houses = new THREE.InstancedMesh(box, stdMat(0xffffff, { roughness: .95 }), N);
    const roofs = new THREE.InstancedMesh(roof, stdMat(0xffffff, { flatShading: true }), N);
    const tents = new THREE.InstancedMesh(tent, stdMat(0xffffff, { flatShading: true }), N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    const wall = [0x7d7464, 0x8a826f, 0x6b665b, 0x948670, 0x5f5a51, 0x806c56, 0x8f8a7a, 0x7a6a5c], roofC = [0x5e3a2a, 0x4a4640, 0x6f4730, 0x3c4442, 0x80583a, 0x6a3a30], tentC = [0x8f7c5c, 0x7e4434, 0x6a7566, 0x9c8e70, 0x5c6d7a];
    const windows = [];
    const g = glowCanvas.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, MW, MH); g.globalCompositeOperation = "lighter";
    let n = 0, nr = 0, nt = 0;
    // a jittered grid, oriented to the nearest road, with alleys left empty
    const cell = 9.5; const cells = [];
    for (let gy = 0; gy < 1199; gy += cell) for (let gx = 0; gx < 908; gx += cell) cells.push([gx, gy]);
    for (let i = cells.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [cells[i], cells[j]] = [cells[j], cells[i]]; }
    for (const [gx, gy] of cells) {
      if (n >= N) break;
      const [rd, rang] = roadNear(gx, gy);
      // alleys: every third band along the local street direction stays open
      const along = gx * Math.cos(rang) + gy * Math.sin(rang), across = -gx * Math.sin(rang) + gy * Math.cos(rang);
      if (Math.floor(across / cell) % 3 === 2 && rnd() < .85) continue;
      const mx = gx + rr(-2, 2), my = gy + rr(-2, 2);
      const city = sample(masks.city, mx, my), land = sample(masks.land, mx, my), road = sample(masks.road, mx, my);
      if (city < .55 || land < .7 || road > .3 || excluded(mx, my) || inSilverwall(mx, my)) continue;
      if (sample(masks.stone, mx, my) > .05 || sample(masks.human, mx, my) > .05) continue;
      { const dn = nearestDistrict(mx, my); const crowded = dn === "Cross" || dn === "Harbor" || dn === "Marketplace"; if (dn === "Coasthold") continue; let near = 0; for (const [ox, oy] of [[5, 0], [-5, 0], [0, 5], [0, -5], [8, 8], [-8, -8]]) near = Math.max(near, sample(masks.stone, mx + ox, my + oy)); if (near < .5 && rnd() < (crowded ? .15 : .8)) continue; }
      if (rnd() < .18) continue;
      const [x, z] = toWorld(mx, my); const y = heightAt(x, z);
      if (y < .35 || y > 13) continue;
      const district = nearestDistrict(mx, my);
      const poor = district === "Cross" || district === "Harbor" || district === "Southwatch";
      const rich = district === "Respite" || district === "Oldgate" || district === "Silverwall";
      const w = rr(.35, rich ? .8 : .6), d = rr(.3, rich ? .7 : .55), h = rr(.3, .65);
      const ang = -(rd < 60 ? rang : vnoise(mx * .01, my * .01) * 3.1) + (rnd() < .5 ? 0 : Math.PI / 2) + rr(-.08, .08);
      e.set(0, ang, 0); q.setFromEuler(e);
      const isTent = poor && rnd() < .42; if (isTent) {
        const yl = footGround(x, z, Math.max(w, d) * .6); s.set(w, rr(.7, 1.2) + (y - yl), d); p.set(x, yl - .05, z); m.compose(p, q, s); tents.setMatrixAt(nt, m); tents.setColorAt(nt, c.setHex(tentC[(rnd() * tentC.length) | 0])); nt++;
      } else {
        const yl = footGround(x, z, Math.max(w, d) * .6); s.set(w, h + (y - yl), d); p.set(x, yl - .1, z); m.compose(p, q, s); houses.setMatrixAt(n, m); houses.setColorAt(n, c.setHex(wall[(rnd() * wall.length) | 0]).multiplyScalar(rr(.85, 1.15))); n++;
        if (rnd() < .7) { s.set(w * 1.15, rr(.5, 1.1), d * 1.15); p.set(x, y - .1 + h, z); m.compose(p, q, s); roofs.setMatrixAt(nr, m); roofs.setColorAt(nr, c.setHex(roofC[(rnd() * roofC.length) | 0])); nr++; }
      }
      if (rnd() < .9) {
        const tent = isTent; const hh = tent ? .7 : h; const lf = rr(.25, .8), sw = tent ? .52 * (1 - lf * .85) : .52; // a tent narrows as it rises
        const side = rnd() < .5 ? 1 : -1; const off = new THREE.Vector3(side * w * sw, lf * hh, rr(-.3, .3) * d * (tent ? 1 - lf : 1)).applyEuler(e);
        const warm = rnd(); const col = warm < .9 ? [1, .6 + rnd() * .16, .26] : warm < .94 ? [.75, .85, .9] : [1, .35, .2];
        windows.push([x + off.x, y + off.y, z + off.z, ...col, rr(.2, .32), rnd(), 0]);
        if (rnd() < .45) { const off2 = new THREE.Vector3(-side * w * sw, lf * hh, rr(-.3, .3) * d * (tent ? 1 - lf : 1)).applyEuler(e); windows.push([x + off2.x, y + off2.y, z + off2.z, ...col, rr(.16, .26), rnd(), 0]); }
      }
    }
    houses.count = n; roofs.count = nr; tents.count = nt;
    [houses, roofs, tents].forEach(im => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; scene.add(im); });
    makePoints(windows, "light");
    paintGlow(windows.concat(giantLights));
  }
  const glowExtra = [];
  function paintGlow(windows) {
    const g = glowCanvas.getContext("2d"); g.globalCompositeOperation = "source-over"; g.fillStyle = "#000"; g.fillRect(0, 0, MW, MH); g.globalCompositeOperation = "lighter";
    const dot = (x, z, a, r) => { const [mx, my] = toChart(x, z); const px = mx * MW / 908, py = my * MH / 1199; const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); };
    for (const w of windows) dot(w[0], w[2], .08, 6);
    for (const [x, z, a, r] of glowExtra) dot(x, z, a, r);
    g.globalCompositeOperation = "source-over"; g.strokeStyle = "#000"; g.lineWidth = 4; g.strokeRect(0, 0, MW, MH);
    glowTex.needsUpdate = true;
  }
  function nearestDistrict(mx, my) { let best = "", bd = 1e9; for (const [n, x, y] of DISTRICT_LABELS) { const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = n; } } return best; }

  function mergeGeos(list) { // non-indexed merge of position+normal
    const parts = list.map(gm => gm.index ? gm.toNonIndexed() : gm); let n = 0; parts.forEach(gm => n += gm.attributes.position.count);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    parts.forEach(gm => { gm.computeVertexNormals(); pos.set(gm.attributes.position.array, o * 3); nor.set(gm.attributes.normal.array, o * 3); o += gm.attributes.position.count; });
    const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); return out;
  }
  function buildJungle() {
    const N = lowQuality ? 3400 : 7600;
    const crown = new THREE.IcosahedronGeometry(1, 1); const cp = crown.attributes.position;
    for (let i = 0; i < cp.count; i++) { const k = .85 + .3 * hash(cp.getX(i) * 3.1, cp.getZ(i) * 2.7 + cp.getY(i)); cp.setXYZ(i, cp.getX(i) * k, cp.getY(i) * k * .62, cp.getZ(i) * k); }
    crown.translate(0, .9, 0);
    const fronds = []; const trunk = new THREE.CylinderGeometry(.07, .12, 4, 5); trunk.translate(0, 2, 0); fronds.push(trunk);
    for (let i = 0; i < 6; i++) { const f = new THREE.ConeGeometry(.25, 2.2, 3); f.rotateZ(Math.PI / 2 + .45); f.translate(1.05, 3.7, 0); f.rotateY(i / 6 * Math.PI * 2); fronds.push(f); }
    const palmG = mergeGeos(fronds);
    const im = new THREE.InstancedMesh(crown, stdMat(0xffffff, { flatShading: true }), N + (lowQuality ? 1500 : 3500));
    const palms = new THREE.InstancedMesh(palmG, stdMat(0xffffff, { flatShading: true, side: THREE.DoubleSide }), Math.floor(N * .2));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const greens = [0x1d3a24, 0x284a2c, 0x33502e, 0x22402a, 0x2c4630];
    let n = 0, np = 0, tries = 0;
    while (n < N && tries < N * 20) {
      tries++;
      const x = rr(-340, 340), z = rr(-340, 340); const [mx, my] = toChart(x, z);
      const land = sample(masks.land, mx, my); if (land < .7) continue;
      const inChart = mx > 0 && mx < 908 && my > 0 && my < 1199;
      const city = inChart ? sample(masks.city, mx, my) : 0;
      if (city > .35 && !(inChart && sample(masks.jungle, mx, my) > .5)) continue;
      if (inChart && excluded(mx, my)) continue;
      const y = heightAt(x, z); if (y < .6) continue;
      const near = Math.hypot(x, z) < 150;
      if (near && rnd() < .16 && np < palms.count) {
        const sc = rr(.8, 1.3); q.setFromEuler(new THREE.Euler(rr(-.12, .12), rr(0, 6.28), rr(-.12, .12))); s.set(sc, sc * rr(.85, 1.25), sc); p.set(x, y - .1, z); m.compose(p, q, s);
        palms.setMatrixAt(np, m); palms.setColorAt(np, c.setHex(greens[(rnd() * greens.length) | 0]).multiplyScalar(rr(1, 1.3))); np++; continue;
      }
      const sc = rr(1.5, 2.4) * (inChart ? 1 : 1.4);
      q.setFromEuler(new THREE.Euler(rr(-.08, .08), rr(0, 6.28), rr(-.08, .08)));
      s.set(sc * rr(.85, 1.2), sc * rr(.8, 1.2), sc * rr(.85, 1.2)); p.set(x, y - .2, z); m.compose(p, q, s); im.setMatrixAt(n, m);
      im.setColorAt(n, c.setHex(greens[(rnd() * greens.length) | 0]).multiplyScalar(rr(.88, 1.12))); n++;
    }
    // sparse giants of the canopy out toward the horizon
    for (let t2 = 0; t2 < 30000 && n < im.instanceMatrix.count; t2++) {
      const x = rr(-1100, 1100), z = rr(-1100, 1100); if (Math.max(Math.abs(x), Math.abs(z)) < 340) continue; const [mx, my] = toChart(x, z); if (sample(masks.land, mx, my) < .7) continue;
      const y = heightChart(mx, my); if (y < .6) continue; const sc = rr(4, 8); q.setFromEuler(new THREE.Euler(0, rr(0, 6.28), 0)); s.set(sc, sc * rr(.7, 1), sc); p.set(x, y - .5, z); m.compose(p, q, s); im.setMatrixAt(n, m); im.setColorAt(n, c.setHex(greens[(rnd() * greens.length) | 0]).multiplyScalar(rr(.7, 1))); n++;
    }
    im.count = n; palms.count = np;
    [im, palms].forEach(o => { o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; scene.add(o); });
  }

  /* ---------- landmarks ---------- */
  const stone = () => stdMat(0x77746a, { flatShading: true });
  function footGround(x, z, r) { // lowest ground under a footprint of radius r
    let lo = heightAt(x, z); if (r < .2) return lo;
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.2832; lo = Math.min(lo, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
    lo = Math.min(lo, heightAt(x + r * .4, z), heightAt(x - r * .4, z), heightAt(x, z + r * .4), heightAt(x, z - r * .4));
    return Math.max(lo, heightAt(x, z) - 2.6);
  }
  function placeAt(obj, mx, my, dy = 0, key) {
    const [x, z] = toWorld(mx, my);
    obj.position.set(0, 0, 0); obj.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(obj);
    const r = bb.isEmpty() ? 0 : Math.min(30, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * .45);
    obj.position.set(x, Math.max(footGround(x, z, r) + dy, heightAt(x, z) - 2.6), z); scene.add(obj);
    if (key) { obj.traverse(o => { if (o.isMesh) o.userData.place = key; }); pickables.push(obj); }
    return obj;
  }
  function mesh(geo, mat, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); return o; }

  let emperorMat, emperorGroup, lighthouseGroup, spireGroup;
  function buildEmperor() {
    exclusions.push([72, 776, 40]);
    const g = new THREE.Group(); const mat = stdMat(0x8d8a7d, { flatShading: true, roughness: .88, unique: true }); emperorMat = mat;
    const dark = stdMat(0x5e5d55, { flatShading: true, roughness: .95 }); const moss = stdMat(0x4d5442, { flatShading: true, roughness: 1 });
    g.add(mesh(new THREE.CylinderGeometry(4.6, 5.4, 1.6, 9), dark, 0, .8, 0));
    g.add(mesh(new THREE.CylinderGeometry(3.7, 4.2, 1.2, 9), mat, 0, 2.2, 0));
    // robe: hem, pinched waist, folds
    const robe = new THREE.CylinderGeometry(1.6, 3.6, 12.5, 14, 6); const rp = robe.attributes.position;
    for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), z = rp.getZ(i), y = rp.getY(i), a = Math.atan2(z, x); const k = 1 + .08 * Math.sin(a * 7 + y * .15) + (y < -4 ? .06 : 0); rp.setX(i, x * k); rp.setZ(i, z * k); }
    robe.computeVertexNormals(); g.add(mesh(robe, mat, 0, 9.05, 0));
    g.add(mesh(new THREE.CylinderGeometry(3.7, 3.9, 1.1, 14), moss, 0, 3.35, 0));
    // chest, broad shoulders, cowl draped over them
    g.add(mesh(new THREE.CylinderGeometry(2.6, 1.7, 4.4, 12), mat, 0, 17.3, 0));
    const cowl = mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * .55), dark, 0, 18.9, -.35); cowl.scale.set(3.3, 1.6, 2.4); g.add(cowl);
    [-1, 1].forEach(sd => {
      const sh = mesh(new THREE.SphereGeometry(1.6, 10, 8), mat, sd * 3.0, 18.5, 0); sh.scale.set(1, .8, 1); g.add(sh);
      const upper = mesh(new THREE.CylinderGeometry(.85, 1, 3.8, 8), mat, sd * 3.25, 16.4, .35); upper.rotation.z = sd * .1; g.add(upper);
      const fore = mesh(new THREE.CylinderGeometry(.7, .85, 3.6, 8), mat, sd * 1.6, 15.2, 2.0); fore.position.set(sd * 1.5, 16.2, 1.7); fore.rotation.set(Math.PI / 2 - .9, 0, sd * -.85); g.add(fore);
      // hanging bell sleeve, making the V of a robed figure with joined hands
      const sleeve = mesh(new THREE.ConeGeometry(1.25, 6.2, 9, 1, true), dark, sd * 2.1, 12.3, 1.3); sleeve.rotation.z = sd * .12; g.add(sleeve);
      // the hands: two slabs meeting at the fingertips
      const hand = mesh(new THREE.BoxGeometry(.32, 2.5, .95), mat, sd * .2, 18.2, 2.6); hand.rotation.z = sd * -.12; g.add(hand);
    });
    // the head: hooded, bearded, bowed a little toward the sea
    emperorHead = new THREE.Group(); emperorHead.position.set(0, 19.4, .15); emperorHead.rotation.x = .14;
    const skull = mesh(new THREE.SphereGeometry(1.3, 12, 10), mat, 0, 1.35, 0); skull.scale.set(1, 1.22, 1.06); emperorHead.add(skull);
    const hood = mesh(new THREE.SphereGeometry(1.62, 12, 8, 0, Math.PI * 2, 0, Math.PI * .6), dark, 0, 1.55, -.25); hood.scale.set(1, 1.18, 1.08); emperorHead.add(hood);
    const brow = mesh(new THREE.BoxGeometry(1.55, .26, .4), dark, 0, 1.78, 1.12); emperorHead.add(brow);
    [-1, 1].forEach(sd => { const eye = mesh(new THREE.SphereGeometry(.24, 8, 6), stdMat(0x2e2d29, { flatShading: true }), sd * .43, 1.48, 1.2); eye.scale.z = .4; emperorHead.add(eye); });
    const nose = mesh(new THREE.ConeGeometry(.24, .75, 4), mat, 0, 1.1, 1.36); nose.rotation.x = -Math.PI / 2 + .35; emperorHead.add(nose);
    const beard = mesh(new THREE.BoxGeometry(1.6, 2.4, .6), mat, 0, -.4, .78); beard.rotation.x = .15; emperorHead.add(beard);
    g.add(emperorHead);
    const boulders = []; for (let i = 0; i < 9; i++) { const c = mesh(new THREE.DodecahedronGeometry(rr(.4, 1.2), 0), dark); const a = rr(0, 6.28), r = rr(5, 7.5); c.position.set(Math.cos(a) * r, .45, Math.sin(a) * r); g.add(c); boulders.push(c); }
    // the beam, rising from the hands and fading in at its base so it never paints the face
    beamGroup = new THREE.Group(); beamGroup.position.set(0, 19.6, 2.75);
    const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: U.time, uDawn: U.dawn },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: GLSL_NOISE + `varying vec2 vUv; uniform float uTime,uDawn; void main(){
        float edge = pow(sin(vUv.x*3.14159),2.); float fade = pow(1.-vUv.y, 1.6) * smoothstep(0., .02, vUv.y) * (1. - smoothstep(.2, .55, vUv.y));
        float shimmer = .8 + .2*vn(vec2(vUv.x*3., vUv.y*12. - uTime*2.));
        gl_FragColor = vec4(vec3(1.,.8,.45)*edge*fade*shimmer*(1.-uDawn)*.4, 1.); }` });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, .35, 260, 24, 1, true), bm); beam.position.y = 130; beamGroup.add(beam);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.35, .12, 260, 12, 1, true), bm); core.position.y = 130; beamGroup.add(core);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(.45, 16, 12), new THREE.MeshBasicMaterial({ color: 0xb89a62 })); glow.scale.setScalar(.7); glow.position.y = .3; beamGroup.add(glow);
    g.add(beamGroup);
    emperorLight = new THREE.PointLight(0xffc773, 2.6, 130, 1.5); emperorLight.position.set(0, 19, 5); g.add(emperorLight);
    g.rotation.y = .35; // facing the open sea
    g.scale.setScalar(1.9); emperorGroup = g;
    placeAt(g, 72, 776, -.6, "emperor");
    { // the promontory falls away under the pedestal's seaward edge: a footing of the same stone reaches down to it
      const ex0 = g.position.x, ez0 = g.position.z, S = 1.9; let lo = g.position.y;
      for (let a = 0; a < 24; a++) for (const r of [4, 7, 10.3]) lo = Math.min(lo, heightAt(ex0 + Math.cos(a / 24 * 6.283) * r, ez0 + Math.sin(a / 24 * 6.283) * r));
      const depth = (g.position.y - lo) / S + .4; if (depth > .5) { const foot = mesh(new THREE.CylinderGeometry(5.4, 6.4, depth, 9), dark, 0, -depth / 2 + .05, 0); foot.userData.place = "emperor"; g.add(foot); }
      g.updateMatrixWorld(true); const wp = new THREE.Vector3();
      for (const c of boulders) { c.getWorldPosition(wp); if (heightAt(wp.x, wp.z) < g.position.y - .8) g.remove(c); } }
    hooks.emperorFacing = new THREE.Vector3(Math.sin(.35), 0, Math.cos(.35));
    hooks.emperorTop = 42; hooks.emperorAxis = g.position.clone();
    // the traveler, sitting at its feet with a small lantern
    const lantern = makePoints([[0, 0, 0, 1, .72, .38, .12, .3, 0]], "light"); const fwd = hooks.emperorFacing;
    const ep = emperorGroup.position; lantern.position.set(ep.x + fwd.x * 7.4 + fwd.z * 1.6, ep.y + 1.6 * 1.9 + .35, ep.z + fwd.z * 7.4 - fwd.x * 1.6); // on the pedestal, at its feet
    hooks.travelerLantern = lantern;
  }

  function buildLighthouse() {
    exclusions.push([126, 830, 30]);
    const g = new THREE.Group(); const mat = stone();
    g.add(mesh(new THREE.CylinderGeometry(1.3, 2.1, 11, 10), mat, 0, 5.5, 0));
    g.add(mesh(new THREE.CylinderGeometry(1.7, 1.4, 1, 10), mat, 0, 11.4, 0));
    const crystal = mesh(new THREE.OctahedronGeometry(.6, 0), new THREE.MeshBasicMaterial({ color: 0xd9c9a0 }), 0, 12.9, 0); crystal.scale.y = 1.5; g.add(crystal); hooks.crystal = crystal;
    lighthouseBeam = new THREE.Group(); lighthouseBeam.position.set(0, 12.9, 0); // at the crystal's heart
    const lb = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uDawn: U.dawn, uClip: { value: 1e4 } },
      vertexShader: `varying vec2 vUv; varying float vAlong; void main(){ vUv=uv; vAlong = 110. - position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; varying float vAlong; uniform float uDawn, uClip; void main(){ if (vAlong > uClip) discard; float e = pow(sin(vUv.x*3.14159),3.); float stop = smoothstep(uClip, uClip - 3., vAlong); // the statue takes the light
        gl_FragColor = vec4(vec3(1.,.95,.82)*e*pow(vUv.y,2.2)*smoothstep(0.,.012,1.-vUv.y)*.16*(1.-uDawn)*stop, 1.); }` });
    hooks.lhClip = lb.uniforms.uClip;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(.15, 6, 220, 24, 1, true), lb); const tilt = .03; cone.rotation.z = Math.PI / 2 - tilt; cone.position.set(110 * Math.cos(tilt), -110 * Math.sin(tilt), 0); // narrow end exactly at the crystal, leaning a little toward the sea
    lighthouseBeam.add(cone); g.add(lighthouseBeam);
    g.scale.setScalar(.75); lighthouseGroup = g;
    placeAt(g, 126, 830, 0, "lighthouse");
  }

  function buildTalon() {
    const geo = new THREE.ConeGeometry(1.6, 12, 9, 6); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + (vnoise(p.getX(i) * 2, y * .7) - .5) * .5; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    geo.computeVertexNormals();
    const t = mesh(geo, stdMat(0x3e423f, { flatShading: true }), 0, 5, 0);
    const g = new THREE.Group(); g.add(t); const [x, z] = toWorld(228, 920); g.position.set(x, footGround(x, z, 1.7) + .7, z); scene.add(g);
    t.userData.place = "shargons-talon"; pickables.push(g);
    const flames = []; for (let i = 0; i < 9; i++) { const a = rr(0, 6.28), y = rr(2, 9.5), r = 1.45 * (1 - (y + 1) / 12) + .05; flames.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r, 1, .55, .2, .32, rnd(), 0]); }
    makePoints(flames, "light");
  }

  function buildSpire() {
    exclusions.push([476, 430, 16]);
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(.55, 1.5, 24, 10), stdMat(0x2b4d78, { roughness: .5, metalness: .3, emissive: 0x06111f }), 0, 12, 0));
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.TorusGeometry(1.45 - i * .19, .09, 6, 20), stdMat(0xc79a3c, { metalness: .7, roughness: .4 }), 0, 3 + i * 4.4, 0).rotateX(Math.PI / 2));
    g.add(mesh(new THREE.SphereGeometry(.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9fd0ff }), 0, 24.4, 0));
    // an airship, moored, with its ring of bound air
    airship = new THREE.Group(); airship.position.set(4.2, 21, 0);
    const hull = mesh(new THREE.SphereGeometry(1, 16, 10), stdMat(0x5a4632, { roughness: .8 })); hull.scale.set(3.2, .9, 1.1); airship.add(hull);
    const deck = mesh(new THREE.BoxGeometry(5, .25, 1.4), stdMat(0x3b2e22)); deck.position.y = .6; airship.add(deck);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, .14, 8, 48), new THREE.MeshBasicMaterial({ color: 0xbfe3ff })); ring.rotation.y = Math.PI / 2; ring.scale.set(1.25, 1, 1); airship.add(ring); airship.userData.ring = ring;
    airship.add(mesh(new THREE.CylinderGeometry(.03, .03, 4.2), stdMat(0x222222), -1.4, -1.7, 0));
    g.add(airship);
    spireGroup = g;
    placeAt(g, 476, 430, -.2, "falconers-spire");
  }

  function buildPalace() {
    exclusions.push([343, 292, 22]);
    const g = new THREE.Group(); const mat = stdMat(0x6d6457, { flatShading: true });
    g.add(mesh(new THREE.BoxGeometry(7, 3.2, 5), mat, 0, 1.6, 0));
    g.add(mesh(new THREE.BoxGeometry(4, 5, 3), mat, 0, 2.5, -1));
    [[-3.2, -2.2], [3.2, -2.2], [-3.2, 2.2], [3.2, 2.2]].forEach(([x, z]) => { g.add(mesh(new THREE.CylinderGeometry(.6, .7, 6, 8), mat, x, 3, z)); g.add(mesh(new THREE.ConeGeometry(.85, 1.6, 8), stdMat(0x3a2b24, { flatShading: true }), x, 6.8, z)); });
    g.add(mesh(new THREE.BoxGeometry(3, .5, 2), mat, 0, .25, 3.4));
    placeAt(g, 343, 292, 0, "marketplace");
    const lights = []; for (let i = 0; i < 26; i++) { const [x, z] = toWorld(343 + rr(-36, 36), 292 + rr(-26, 26)); lights.push([x, heightAt(x, z) + rr(.6, 4.5), z, 1, .7, .35, .18, rnd(), 0]); }
    makePoints(lights, "light");
  }

  function buildBazaar() {
    exclusions.push([350, 440, 32]);
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(5.4, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(); const p = geo.attributes.position;
    const pal = [[.49, .14, .09], [.6, .23, .11], [.42, .11, .13], [.66, .33, .16], [.55, .17, .12]]; const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); const r = Math.hypot(x, z); const a = Math.atan2(z, x);
      p.setY(i, y * .8 * (1 + .08 * Math.sin(a * 8)) + Math.pow(Math.max(0, 1 - r / 5.4), 2) * 1.6); }
    for (let f = 0; f < p.count; f += 3) { const c = pal[(hash(Math.floor(p.getX(f) * .9), Math.floor(p.getZ(f) * .9)) * pal.length) | 0]; for (let k = 0; k < 3; k++) col.set(c, (f + k) * 3); }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    g.add(mesh(geo, stdMat(0xffffff, { vertexColors: true, side: THREE.DoubleSide, emissive: 0x5a1408, emissiveIntensity: .9, roughness: .95, flatShading: true })));
    const val = new THREE.CylinderGeometry(5.5, 5.55, .5, 32, 1, true); g.add(mesh(val, stdMat(0x8a2a16, { side: THREE.DoubleSide, emissive: 0x3a0c04 }), 0, .25, 0));
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.add(mesh(new THREE.CylinderGeometry(.07, .08, 1.2), stdMat(0x2b2018), Math.cos(a) * 5.75, .6, Math.sin(a) * 5.75)); }
    placeAt(g, 350, 440, -.4, "bazaar");
    const [x, z] = toWorld(350, 440); const y = heightAt(x, z);
    const warm = new THREE.PointLight(0xff5a2e, 2, 15, 1.8); warm.position.set(x, y + 1.3, z); scene.add(warm);
    const bunt = []; for (let i = 0; i < 40; i++) { const a = i / 40 * 6.283; bunt.push([x + Math.cos(a) * 5.7, y + .55 + Math.sin(i) * .05, z + Math.sin(a) * 5.7, ...[[1, .3, .2], [1, .75, .3], [.4, .8, .5], [.9, .9, .7]][i % 4], .12, rnd(), 4]); }
    makePoints(bunt, "light");
  }

  function lathe(pts, segs = 48) { return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs); }
  function buildSilverwall() {
    exclusions.push([540, 784, 30], [512, 846, 14], [660, 985, 48], [614, 912, 30], [667, 836, 20]);
    const wall = new THREE.Mesh(lathe([[19.4, 0], [20.4, 0], [20.4, 7], [19.4, 7], [19.4, 0]], 96), stdMat(0x6d6a62, { roughness: .9, flatShading: true }));
    wall.scale.set(1, 1, .7); placeAt(wall, 514, 812, -.3, "locksmith-square");
    const cubeRT = new THREE.WebGLCubeRenderTarget(lowQuality ? 64 : 128); hooks.cubeCam = new THREE.CubeCamera(1, 600, cubeRT);
    const silver = new THREE.MeshStandardMaterial({ color: 0xc4ccd0, metalness: .9, roughness: .34, envMap: cubeRT.texture, envMapIntensity: .38, side: THREE.BackSide });
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(19.32, 19.32, 6.9, 96, 1, true), silver); inner.scale.set(1, 1, .7); inner.position.y = 3.45;
    const wg = new THREE.Group(); wg.add(inner); placeAt(wg, 514, 812, -.3, "locksmith-square");
    { const [x, z] = toWorld(514, 812); hooks.cubeCam.position.set(x, heightAt(x, z) + 3, z); scene.add(hooks.cubeCam); }
    // stalls and the night crowd inside the mirror
    const awn = [0x8a2a1c, 0x2c5a6a, 0x8a6a2a, 0x4a6a3a, 0x6a3a6a];
    for (let i = 0; i < 16; i++) { const a = rr(0, 6.28), r = rr(.45, .85); const mx = 514 + Math.cos(a) * 92 * r, my = 812 + Math.sin(a) * 64 * r; if (Math.hypot(mx - 540, my - 784) < 30 || Math.hypot(mx - 512, my - 846) < 12) continue;
      const st = new THREE.Group(); st.add(mesh(new THREE.BoxGeometry(1, .7, .7), stdMat(0x4e3e2e), 0, .35, 0)); const aw = mesh(new THREE.BoxGeometry(1.25, .06, .95), stdMat(awn[i % awn.length], { emissive: 0x100804 }), 0, 1.05, 0); aw.rotation.x = .18; st.add(aw); st.rotation.y = -a; placeAt(st, mx, my, 0); }
    const crowd = []; for (let i = 0; i < 170; i++) { const a = rr(0, 6.28), r = Math.sqrt(rnd()) * .9; const [x, z] = toWorld(514 + Math.cos(a) * 92 * r, 812 + Math.sin(a) * 64 * r); crowd.push([x, heightAt(x, z) + .5, z, ...(rnd() < .75 ? [1, rr(.55, .75), .3] : [.7, .8, 1]), .13, rnd(), 4]); }
    makePoints(crowd, "light");
    // bridges over the Coasthold trench
    [[606, 812, .12], [584, 918, .35]].forEach(([mx, my, rot]) => { const b = new THREE.Group(); b.add(mesh(new THREE.BoxGeometry(7, .5, 1.6), stdMat(0x6a665c, { flatShading: true }), 0, 0, 0)); [-3.6, 3.6].forEach(x => b.add(mesh(new THREE.BoxGeometry(1.2, 2.4, 2), stdMat(0x5d5850, { flatShading: true }), x, 1, 0))); b.rotation.y = rot; placeAt(b, mx, my, 2.6); });
    // the Red Ring arena
    const arena = new THREE.Group();
    arena.add(mesh(lathe([[2.4, 0], [4.4, 0], [4.4, 2.2], [4.1, 2.2], [2.6, .5], [2.4, .5]], 40), stdMat(0x5e4a3c, { flatShading: true })));
    arena.add(mesh(new THREE.CylinderGeometry(2.45, 2.45, .2, 32), stdMat(0x7a2c1f, { emissive: 0x2a0905 }), 0, .2, 0));
    placeAt(arena, 540, 784, 0, "red-ring");
    const torches = []; for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; const [x, z] = toWorld(540, 784); torches.push([x + Math.cos(a) * 4.3, heightAt(x, z) + 2.5, z + Math.sin(a) * 4.3, 1, .5, .2, .3, rnd(), 0]); }
    makePoints(torches, "light");
    // Eldred's Pool
    const pool = new THREE.Group(); { const rim = mesh(new THREE.TorusGeometry(2.4, .35, 8, 40), stdMat(0x2e4a3a, { roughness: .5, flatShading: true }), 0, .3, 0); rim.rotation.x = Math.PI / 2; pool.add(rim);
      pool.add(mesh(new THREE.CylinderGeometry(2.3, 2.3, .1, 40), new THREE.MeshStandardMaterial({ color: 0x0c1a16, metalness: .6, roughness: .2 }), 0, .25, 0));
      const km = stdMat(0x3e5a48, { flatShading: true }); [-1, 1].forEach(sd => { const f = new THREE.Group(); f.add(mesh(new THREE.BoxGeometry(.4, 1.1, .3), km, 0, 1.1, 0)); f.add(mesh(new THREE.BoxGeometry(.12, .9, .12), km, 0, .35, 0)); f.add(mesh(new THREE.BoxGeometry(.25, .3, .25), km, 0, 1.8, .05)); [-1, 1].forEach(a => { const arm = mesh(new THREE.BoxGeometry(.1, .8, .1), km, a * .3, 1.9, 0); arm.rotation.z = a * .3; f.add(arm); }); f.position.set(0, .2, sd * .3); f.rotation.y = sd > 0 ? 0 : Math.PI; pool.add(f); }); }
    pool.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, .05, 28), new THREE.MeshStandardMaterial({ color: 0x0d2a2c, metalness: .9, roughness: .05 }), 0, .14, 0));
    pool.add(mesh(new THREE.BoxGeometry(.25, 1.1, .25), stdMat(0x2c5a4a), 0, .7, 0));
    placeAt(pool, 512, 846, 0, "eldreds-pool");
    // Kol Korran: a wall so thick the tower is only a glow above it
    const kk = new THREE.Group(); kk.add(mesh(lathe([[2.6, 0], [4.2, 0], [4.2, 5], [2.6, 5], [2.6, 0]], 40), stdMat(0x5b5a55, { flatShading: true })));
    kk.add(mesh(new THREE.CylinderGeometry(1, 1.4, 6.5, 8), stdMat(0x2f2f33, { flatShading: true }), 0, 3.25, 0));
    kk.add(mesh(new THREE.SphereGeometry(.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a }), 0, 6.8, 0));
    placeAt(kk, 660, 985, 0, "kol-korran");
    // Kundarak's enclave and moat
    const kund = new THREE.Group(); kund.add(mesh(new THREE.BoxGeometry(4, 3.2, 3.6), stdMat(0x5d5850, { flatShading: true }), 0, 1.6, 0));
    [[-2, -1.8], [2, -1.8], [-2, 1.8], [2, 1.8]].forEach(([x, z]) => kund.add(mesh(new THREE.CylinderGeometry(.5, .55, 4.4, 8), stdMat(0x55514a), x, 2.2, z)));
    kund.add(mesh(new THREE.TorusGeometry(3.6, .45, 6, 32), new THREE.MeshStandardMaterial({ color: 0x0c2328, metalness: .8, roughness: .1 }), 0, .05, 0).rotateX(Math.PI / 2));
    placeAt(kund, 614, 912, 0);
    // the Titanswalk: seven giants nobody can name
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Group(); const m = stone();
      s.add(mesh(new THREE.CylinderGeometry(.55, .8, 4.6, 7), m, 0, 2.3, 0)); s.add(mesh(new THREE.BoxGeometry(1.4, .6, .8), m, 0, 4.7, 0)); s.add(mesh(new THREE.BoxGeometry(.7, .9, .7), m, 0, 5.4, 0));
      s.rotation.y = rr(-.2, .2); placeAt(s, 420 + i * 8 + (i % 2) * 3, 740 + i * 6 + (i % 2 ? 12 : 0), 0);
    }
  }

  function buildDelera() {
    exclusions.push([705, 687, 40]);
    const mat = stdMat(0x3f4a38, { flatShading: true }), tomb = stdMat(0x6e6b61, { flatShading: true });
    for (let i = 0; i < 14; i++) { const m = mesh(new THREE.SphereGeometry(rr(1.2, 2.6), 10, 6, 0, 6.3, 0, 1.6), mat); m.scale.y = .55; placeAt(m, 705 + rr(-36, 36), 687 + rr(-30, 30), -.2, "delera-watch"); }
    for (let i = 0; i < 22; i++) { const m = mesh(new THREE.BoxGeometry(rr(.5, 1.3), rr(.5, 1.8), rr(.5, 1)), tomb); m.rotation.y = rr(0, 3); placeAt(m, 705 + rr(-30, 30), 687 + rr(-26, 26), .3, "delera-watch"); }
    const bones = []; for (let i = 0; i < 360; i++) { const a = rr(0, 6.28), r = rr(38, 46); const [x, z] = toWorld(705 + Math.cos(a) * r, 687 + Math.sin(a) * r * .85); bones.push([x, heightAt(x, z) + .08, z, .85, .82, .72, .07, rnd(), 4]); }
    makePoints(bones, "light");
    for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 10 + ring * 4; k++) { const a = k / (10 + ring * 4) * 6.283 + ring; const r = 12 + ring * 9; const tb = mesh(new THREE.BoxGeometry(.9, .8 + ring * .25, .6), tomb); tb.rotation.y = -a; placeAt(tb, 705 + Math.cos(a) * r, 687 + Math.sin(a) * r * .85, .35 + ring * .3, "delera-watch"); }
    [[690, 676], [722, 700]].forEach(([mx, my]) => { const d = new THREE.Group(); d.add(mesh(new THREE.CylinderGeometry(1.5, 1.6, 1.6, 12), tomb, 0, .8, 0)); d.add(mesh(new THREE.SphereGeometry(1.5, 12, 8, 0, 6.3, 0, 1.6), stdMat(0x5d6a5a, { flatShading: true }), 0, 1.6, 0)); placeAt(d, mx, my, 0, "delera-watch"); });
    const wisps = []; for (let i = 0; i < 40; i++) { const [x, z] = toWorld(705 + rr(-40, 40), 687 + rr(-34, 34)); wisps.push([x, heightAt(x, z) + .3, z, .45, 1, .6, .35, rnd(), 3]); }
    hooks.wisps = makePoints(wisps, "light");
  }

  function buildFloaters() {
    const mat = stdMat(0x6f6a5e, { flatShading: true }), green = stdMat(0x2c4a26, { flatShading: true });
    const spots = [[606, 572, 15], [560, 640, 19], [660, 600, 12], [520, 520, 22], [420, 470, 17], [470, 380, 24], [640, 700, 16], [380, 620, 13], [700, 520, 20], [560, 470, 27]];
    spots.forEach(([mx, my, hh], i) => {
      const g = new THREE.Group();
      const r = rr(1.4, 3.4); const geo = new THREE.IcosahedronGeometry(r, 1); const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setY(k, y > 0 ? y * .25 : y * rr(.8, 1.4)); p.setX(k, p.getX(k) * rr(.85, 1.15)); }
      geo.computeVertexNormals(); g.add(mesh(geo, mat));
      if (i % 3 !== 1) for (let k = 0; k < 6; k++) { const b = mesh(new THREE.IcosahedronGeometry(rr(.25, .6), 0), green, rr(-r * .6, r * .6), r * .3, rr(-r * .6, r * .6)); g.add(b); }
      if (i % 2 === 0) { // a house hung underneath
        const hut = mesh(new THREE.BoxGeometry(.9, .7, .8), stdMat(0x6a5440), rr(-.6, .6), -r * 1.4 - .8, 0); g.add(hut);
        const rope = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(hut.position.x, -r * .9, 0), new THREE.Vector3(hut.position.x, hut.position.y + .35, 0)]);
        g.add(new THREE.Line(rope, new THREE.LineBasicMaterial({ color: 0x5a4a38 })));
        const lamp = makePoints([[0, 0, 0, 1, .65, .3, .22, rnd(), 0]], "light"); scene.remove(lamp); lamp.position.set(hut.position.x + .46, hut.position.y, 0); g.add(lamp);
      }
      // trailing roots
      const roots = []; for (let k = 0; k < 10; k++) { const a = rr(0, 6.28), rr2 = rr(0, r * .8); const x = Math.cos(a) * rr2, z = Math.sin(a) * rr2; roots.push(new THREE.Vector3(x, -r * .7, z), new THREE.Vector3(x + rr(-.3, .3), -r * .7 - rr(1, 3), z)); }
      g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(roots), new THREE.LineBasicMaterial({ color: 0x3d4a34, transparent: true, opacity: .7 })));
      const [x, z] = toWorld(mx, my); g.position.set(x, heightAt(x, z) + hh, z); g.userData = { base: g.position.clone(), ph: rnd() * 6.28, r: rr(.6, 2.4) };
      g.traverse(o => { if (o.isMesh) o.userData.place = "floating-ruins"; }); pickables.push(g);
      scene.add(g); floaters.push(g);
    });
  }

  function buildRuins() {
    const m = stone();
    // stone heads in threes, each with its own face
    const headSpots = [[452, 516], [300, 580], [250, 700], [520, 630], [390, 300], [600, 380], [470, 120], [210, 260], [640, 760], [350, 500]];
    const eyeM = stdMat(0x1a1a18), braidM = stdMat(0x5f5c53, { flatShading: true });
    const heroAz = ((PLACES["stone-heads"].cam || {}).az || 0) * Math.PI / 180;
    headSpots.forEach(([mx, my], gi) => {
      for (let k = 0; k < 3; k++) {
        const g = new THREE.Group(); const sc = rr(.8, 1.3) * (gi === 0 ? 1.6 : 1);
        const head = mesh(new THREE.SphereGeometry(1, 12, 10), m); head.scale.set(.85, 1.12, .9); g.add(head);
        g.add(mesh(new THREE.BoxGeometry(1.45, .22, .36), m, 0, .38, .76));
        [-1, 1].forEach(sd => { g.add(mesh(new THREE.SphereGeometry(.17, 8, 6), eyeM, sd * .3, .2, .8)); g.add(mesh(new THREE.CylinderGeometry(.13, .1, 1.4, 6), braidM, sd * .86, -.45, -.05)); });
        const nose = mesh(new THREE.ConeGeometry(.16, .5, 4), m, 0, -.02, .96); nose.rotation.x = -Math.PI / 2 + .3; g.add(nose);
        const mood = rr(-.18, .18); const lip = mesh(new THREE.BoxGeometry(.62, .09, .18), m, 0, -.42, .82); lip.rotation.z = mood; g.add(lip); g.add(mesh(new THREE.BoxGeometry(.56, .08, .16), m, 0, -.52, .8));
        g.scale.setScalar(sc);
        const yaw = gi === 0 ? heroAz + rr(-.6, .6) : rr(0, 6.28);
        g.rotation.set(rr(-.25, .2), yaw, rr(-.25, .25));
        placeAt(g, mx + Math.cos(k * 2.1 + gi) * (gi === 0 ? 10 : 7), my + Math.sin(k * 2.1 + gi) * (gi === 0 ? 10 : 7), sc * .62, gi === 0 ? "stone-heads" : null);
        if (gi === 0 && k === 0) { const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); const base = g.position.clone().addScaledVector(fwd, .9 * sc); makePoints([[base.x, base.y - .45 * sc, base.z, 1, .75, .4, .12, .3, 0], [base.x + .25, base.y - .5 * sc, base.z, .55, .8, .25, .1, .6, 4]], "light"); }
      }
    });
    // the great inland gate of Oldgate
    const gate = new THREE.Group(); gate.add(mesh(new THREE.BoxGeometry(2.2, 12, 2.2), m, -4, 6, 0)); gate.add(mesh(new THREE.BoxGeometry(2.2, 9, 2.2), m, 4, 4.5, 0)); const lint = mesh(new THREE.BoxGeometry(6, 1.6, 2), m, -2.4, 12.3, 0); lint.rotation.z = -.12; gate.add(lint);
    gate.rotation.y = .2; placeAt(gate, 330, 50, -.4);
    // circles of visions
    VISIONS.forEach(([mx, my], i) => { exclusions.push([mx, my, 8]); const g = new THREE.Group(); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283; const st = mesh(new THREE.BoxGeometry(.28, rr(.9, 1.5), .22), m, Math.cos(a) * 1.4, .5, Math.sin(a) * 1.4); st.rotation.y = -a; g.add(st); } placeAt(g, mx, my, -.1, "vision-" + i); });
  }

  function buildRigging() {
    const pm = stone(), pts = [], anchors = [];
    // slender pillars of the old city carry most of the ropes
    [[320, 590], [372, 640], [400, 596], [336, 660], [300, 630], [392, 670], [350, 560], [420, 640]].forEach(([mx, my]) => {
      const h = rr(6, 10), r = rr(.45, .7); const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 9), pm, 0, h / 2, 0));
      for (let k = 0; k < 4; k++) { const a = rr(0, 6.28), y = rr(2, h - 1); const hut = mesh(new THREE.BoxGeometry(rr(.5, .8), rr(.4, .6), rr(.5, .8)), stdMat(0x6b5845, { flatShading: true }), Math.cos(a) * (r + .3), y, Math.sin(a) * (r + .3)); hut.rotation.y = -a; g.add(hut); }
      placeAt(g, mx, my, -.2); const [x, z] = toWorld(mx, my); const y0 = heightAt(x, z);
      for (let k = 0; k < 4; k++) anchors.push(new THREE.Vector3(x + rr(-.4, .4), y0 + rr(2.5, h - .5), z + rr(-.4, .4)));
    });
    for (let i = 0, got = 0; i < 400 && got < 30; i++) { const mx = 352 + rr(-75, 75), my = 615 + rr(-55, 55); const t = surfaceAt(mx, my); const [x, z] = toWorld(mx, my); if (t > heightAt(x, z) + 1.5) { anchors.push(new THREE.Vector3(x, t + .05, z)); got++; } }
    const laundry = new THREE.InstancedMesh(new THREE.PlaneGeometry(.32, .42), stdMat(0xffffff, { side: THREE.DoubleSide, roughness: 1 }), 600); let nl = 0;
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(.32, .05, .9), stdMat(0x6a5440), 900); let np = 0;
    const lamps = [];
    for (let i = 0; i < 140; i++) {
      const a = anchors[(rnd() * anchors.length) | 0], b = anchors[(rnd() * anchors.length) | 0]; const d = a.distanceTo(b); if (d < 2.5 || d > 11) continue;
      const bridge = i % 9 === 0 && d < 9; const sag = d * (bridge ? .07 : .12); let prev = a;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      for (let k = 1; k <= 12; k++) { const t = k / 12; const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(prev, p);
        if (bridge && np < 900) { q.setFromEuler(new THREE.Euler(0, yaw + Math.PI / 2, 0)); mm.compose(p, q, sc); planks.setMatrixAt(np++, mm); }
        else if (rnd() < .3 && k < 12 && nl < 600) { q.setFromEuler(new THREE.Euler(0, yaw + Math.PI / 2, rr(-.1, .1))); mm.compose(new THREE.Vector3(p.x, p.y - .24, p.z), q, sc); laundry.setMatrixAt(nl, mm); laundry.setColorAt(nl, c.setHex([0xb8a68a, 0x8a3a2a, 0x6a7a8a, 0xc8bea0, 0x5a6a4a][(rnd() * 5) | 0])); nl++; }
        prev = p; }
      if (rnd() < .3) lamps.push([a.x, a.y - .2, a.z, 1, .66, .3, .17, rnd(), 4]);
    }
    laundry.count = nl; planks.count = np; [laundry, planks].forEach(o => { o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; scene.add(o); });
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9a8262, transparent: true, opacity: .8 })));
    makePoints(lamps, "light");
  }


  /* ---------- the giants' city, as the chart draws it, and the human city in its ruins ---------- */
  function ringPts(a) { const pts = []; for (let i = 0; i < a.length; i += 2) pts.push([a[i], a[i + 1]]); return pts; }
  function centroid(pts) { let x = 0, y = 0; pts.forEach(p => { x += p[0]; y += p[1]; }); return [x / pts.length, y / pts.length]; }
  function shapeOf(rings) {
    const toV = ([mx, my]) => { const [x, z] = toWorld(mx, my); return new THREE.Vector2(x, -z); };
    const sh = new THREE.Shape(ringPts(rings[0]).map(toV));
    for (let k = 1; k < rings.length; k++) sh.holes.push(new THREE.Path(ringPts(rings[k]).map(toV)));
    return sh;
  }
  function groundOf(pts) {
    let lo = 1e9, sum = 0, n = 0; const take = (x, y) => { const hh = heightChart(x, y); lo = Math.min(lo, hh); sum += hh; n++; };
    pts.forEach(([x, y]) => take(x, y));
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; pts.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    const sx = Math.max(3, (x1 - x0) / 5), sy = Math.max(3, (y1 - y0) / 5);
    for (let y = y0; y <= y1; y += sy) for (let x = x0; x <= x1; x += sx) if (pointIn(pts, x, y)) take(x, y);
    return { lo, avg: sum / n };
  }
  function pointIn(pts, x, y) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
  function polyArea(pts) { let a = 0; for (let k = 0; k < pts.length; k++) { const p1 = pts[k], p2 = pts[(k + 1) % pts.length]; a += p1[0] * p2[1] - p2[0] * p1[1]; } return Math.abs(a) / 2; }
  function nearPlace(pts) { for (const k in PLACES) { const p = PLACES[k]; if (p.d === "beyond") continue; if (pointIn(pts, p.x, p.y) && (p.d === "inn" || polyArea(pts) < 1800)) return true; if (p.d === "inn" && pts.some(q => (q[0] - p.x) ** 2 + (q[1] - p.y) ** 2 < 144)) return true; for (const q of pts) if ((q[0] - p.x) ** 2 + (q[1] - p.y) ** 2 < 30) return true; } return false; }
  function brokenTop(x, z, top, base) { return top - Math.max(0, vnoise(x * .32, z * .32) * 1.5 - .35) * Math.min(1, (top - base) * .5); }
  function inSilverwall(mx, my) { const r = Math.sqrt(((mx - 514) / 100) ** 2 + ((my - 812) / 70) ** 2); return Math.abs(r - 1) < .1; } // the silver wall's own band
  const giantLights = [];
  function buildGiantCity() {
    exclusions.push([535, 283, 30], [530, 193, 16], [706, 335, 22]);
    const LV = PLAN.levels.map(v => v * 1.22), pos = [], nor = [], col = [], c = new THREE.Color(); const stoneTone = [0x77736a, 0x6c6a63, 0x807b70, 0x66655f, 0x74706a];
    const add = (geo, color) => { const g = geo.index ? geo.toNonIndexed() : geo; const P = g.attributes.position.array, N = g.attributes.normal.array; for (let i = 0; i < P.length; i += 3) { pos.push(P[i], P[i + 1], P[i + 2]); nor.push(N[i], N[i + 1], N[i + 2]); const up = N[i + 1] > .5; const shade = up ? .78 : .92; col.push(color.r * shade * (up ? .92 : 1), color.g * shade, color.b * shade * (up ? .9 : 1)); } g.dispose(); };
    const footprints = new Map(), allTiers = [];
    const kept = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    const bbOf = pts => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; pts.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }); return [x0, y0, x1, y1]; };
    for (const tier of PLAN.stone) {
      const lv = tier[0], rings = tier.slice(1), pts = ringPts(rings[0]); if (pts.length < 3) continue;
      const [cx, cy] = centroid(pts);
      if (DEBUG) { const why = excluded(cx, cy) ? 'excluded' : inSilverwall(cx, cy) ? 'silverwall' : nearPlace(pts) ? 'nearPlace' : null; const dn = nearestDistrict(cx, cy); const k = dn + ':' + (why || 'kept'); hooks.tierStats = hooks.tierStats || {}; hooks.tierStats[k] = (hooks.tierStats[k] || 0) + 1; }
      if (excluded(cx, cy) || inSilverwall(cx, cy) || nearPlace(pts) || nearRiver(pts)) continue;
      let gr;
      if (lv === 1) gr = groundOf(pts);
      else {
        // find the tier this one stands on; without one it would float
        const probe = [[cx, cy], ...pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 6)) === 0)];
        const parent = kept[lv - 1].find(k => { const [x0, y0, x1, y1] = k.bb; return probe.every(([x, y]) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1 && (pointIn(k.pts, x, y) || k.pts.some(q => (q[0] - x) ** 2 + (q[1] - y) ** 2 < 9))); });
        if (!parent || parent.pier) continue;
        gr = parent.gr;
      }
      const pier = gr.avg < .3;
      if (pier && lv > 1) continue;
      const base = pier ? -1.4 : (lv === 1 ? gr.lo - 1.0 : Math.min(gr.avg + LV[lv - 1] - 1.3, groundOf(pts).lo - 1.0));
      const top = pier ? .55 : gr.avg + LV[lv];
      if (top - base < .2) continue;
      kept[lv].push({ pts, bb: bbOf(pts), gr, pier });
      const geo0 = new THREE.ExtrudeGeometry(shapeOf(rings), { depth: top - base, bevelEnabled: false, curveSegments: 1 }); const geo = geo0.index ? geo0.toNonIndexed() : geo0;
      geo.rotateX(-Math.PI / 2); geo.translate(0, base, 0);
      let capTris = null;
      if (!pier) { const gp = geo.attributes.position; const onTop = new Uint8Array(gp.count); for (let k = 0; k < gp.count; k++) if (gp.getY(k) > top - .01) { onTop[k] = 1; gp.setY(k, brokenTop(gp.getX(k), gp.getZ(k), top, base)); }
        const ct = []; for (let k = 0; k + 2 < gp.count; k += 3) if (onTop[k] && onTop[k + 1] && onTop[k + 2]) for (let j = 0; j < 3; j++) ct.push(gp.getX(k + j), gp.getY(k + j), gp.getZ(k + j)); capTris = new Float32Array(ct); }
      c.setHex(stoneTone[(hash(Math.round(cx), Math.round(cy)) * stoneTone.length) | 0]).multiplyScalar(pier ? .75 : .98 + lv * .06);
      if (hash(cx * 1.7, cy * .3) < .25) c.lerp(new THREE.Color(0x56664c), .3); // moss
      add(geo, c);
      // the human city lives in the ruins: lit openings in the old walls, shacks on the old tops
      if (!pier) allTiers.push({ pts, top, base, capTris });
      if (!pier) {
        const per = pts.length; const lit = Math.min(10, Math.ceil(per / 3));
        for (let k = 0; k < lit; k++) { if (hash(cx + k, cy - k) > .5) continue; const a = pts[(hash(cx * k, cy) * per) | 0]; const [x, z] = toWorld(a[0], a[1]); giantLights.push([x, rr(base + .4, top - .3), z, 1, .6 + rnd() * .15, .26, rr(.18, .28), rnd(), 0]); }
        if (lv === 1 || lv === 2) { const f = footprints.get(lv) || []; f.push({ pts, top }); footprints.set(lv, f); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeBoundingSphere();
    const ruinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true });
    ruinMat.onBeforeCompile = sh => {
      sh.uniforms.uCut = U.cut;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform vec4 uCut;\n' + GLSL_NOISE)
        .replace('void main() {', 'void main() {\n  if (uCut.w > 0.01 && distance(vWPos.xz, uCut.xz) < uCut.w) discard;')
        .replace('#include <color_fragment>', `#include <color_fragment>
  { vec3 wn = normalize(cross(dFdx(vWPos), dFdy(vWPos))); float up = abs(wn.y);
    float row = floor(vWPos.y / .62); float along = (abs(wn.x) > abs(wn.z) ? vWPos.z : vWPos.x) + row * .73;
    float fy = fract(vWPos.y / .62), fx = fract(along / 1.55);
    float joint = max(1. - smoothstep(.0, .05, fy), 1. - smoothstep(.0, .03, fx)) * (1. - up) * .5;
    float blk = h21(vec2(floor(along / 1.55), row));
    float streak = vn(vec2(along * 2.6, vWPos.y * .18));
    vec3 c = diffuseColor.rgb * (.86 + blk * .24) * (.84 + .3 * streak) * (1. - joint * .5);
    float moss = up * smoothstep(.42, .78, vn(vWPos.xz * .55)) + (1. - up) * smoothstep(.62, .92, vn(vec2(along * .5, vWPos.y * .9))) * .6;
    diffuseColor.rgb = mix(c, vec3(.25, .29, .22), moss * .6); }`);
    };
    const stoneMesh = new THREE.Mesh(g, ruinMat);
    stoneMesh.matrixAutoUpdate = false; scene.add(stoneMesh); hooks.giantStone = stoneMesh;

    // human buildings where the chart draws them: walls and a pitched roof
    const hp = [], hn = [], hc = []; const wallT = [0x8e7a5e, 0x9a8466, 0x7a6650, 0xa08c6a, 0x86705a], roofT = [0x6e3a26, 0x5a3424, 0x7a4a2c, 0x4a3a30, 0x8a5a34];
    const addH = (geo, color) => { const gg = geo.index ? geo.toNonIndexed() : geo; const P = gg.attributes.position.array, N = gg.attributes.normal.array; for (let i = 0; i < P.length; i += 3) { hp.push(P[i], P[i + 1], P[i + 2]); hn.push(N[i], N[i + 1], N[i + 2]); hc.push(color.r, color.g, color.b); } gg.dispose(); };
    for (const r of PLAN.human) {
      const pts = ringPts(r); if (pts.length < 3) continue; if (pts.some(([x, y]) => Math.hypot(x - 176, y - 612) < 56)) continue; const [cx, cy] = centroid(pts); if (excluded(cx, cy) || inSilverwall(cx, cy) || nearRiver(pts)) continue;
      const gr = groundOf(pts); if (gr.avg < .2) continue;
      const hh = .55 + hash(cx, cy) * .6, base = gr.lo - .3, sh = shapeOf([r]);
      const w1 = new THREE.ExtrudeGeometry(sh, { depth: gr.avg + hh - base, bevelEnabled: false }); w1.rotateX(-Math.PI / 2); w1.translate(0, base, 0); addH(w1, c.setHex(wallT[(hash(cy, cx) * 5) | 0]));
      const rf = new THREE.ExtrudeGeometry(sh, { depth: .12, bevelEnabled: true, bevelThickness: .08, bevelSize: .12, bevelOffset: 0, bevelSegments: 1 }); rf.rotateX(-Math.PI / 2); rf.translate(0, gr.avg + hh, 0); addH(rf, c.setHex(roofT[(hash(cx * 3, cy) * 5) | 0]));
      const per = pts.length; for (let k = 0; k < Math.min(6, per); k++) { if (rnd() < .35) continue; const a = pts[(rnd() * per) | 0], b = pts[(rnd() * per) | 0]; const [x, z] = toWorld((a[0] * 2 + b[0]) / 3, (a[1] * 2 + b[1]) / 3); giantLights.push([x, gr.avg + hh * rr(.35, .8), z, 1, .62 + rnd() * .14, .26, rr(.18, .27), rnd(), 0]); }
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.Float32BufferAttribute(hp, 3)); hg.setAttribute("normal", new THREE.Float32BufferAttribute(hn, 3)); hg.setAttribute("color", new THREE.Float32BufferAttribute(hc, 3)); hg.computeBoundingSphere();
    const humanMesh = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, flatShading: true })); humanMesh.matrixAutoUpdate = false; scene.add(humanMesh); hooks.humanMesh = humanMesh;

    bakeRuinTop(allTiers);
    // shacks squatting on top of the giants' masonry
    const N = lowQuality ? 1400 : 3600; const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0); const ropes = [];
    const shacks = new THREE.InstancedMesh(box, stdMat(0xffffff, { flatShading: true, roughness: .95, unique: true }), N);
    const roof = new THREE.ConeGeometry(.75, .6, 4, 1); roof.rotateY(Math.PI / 4); roof.translate(0, .3, 0);
    const roofs = new THREE.InstancedMesh(roof, stdMat(0xffffff, { flatShading: true, unique: true }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(); let n = 0;
    const tops = [...(footprints.get(1) || []), ...(footprints.get(2) || [])]; hooks.shackFloor = []; hooks.shacks = shacks;
    for (let tries = 0; tries < N * 12 && n < N && tops.length; tries++) {
      const f = tops[(rnd() * tops.length) | 0]; let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9; f.pts.forEach(([x, y]) => { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); });
      if ((maxx - minx) * (maxy - miny) < 40) continue;
      const mx = rr(minx, maxx), my = rr(miny, maxy);
      if (sample(masks.stone, mx, my) < .9 || excluded(mx, my) || inSilverwall(mx, my)) continue;
      // only on the topmost surface at this spot
      const [x, z] = toWorld(mx, my); const w = rr(.35, .7), d = rr(.3, .6), hh = rr(.3, .6);
      if (hash(mx, my) < .45) continue;
      let yTop = 1e9; for (const [ox, oy] of [[0, 0], [w * 2.5, d * 2.5], [-w * 2.5, d * 2.5], [w * 2.5, -d * 2.5], [-w * 2.5, -d * 2.5]]) yTop = Math.min(yTop, surfaceAt(mx + ox, my + oy)); if (yTop < -50) continue; yTop -= .06;
      q.setFromEuler(new THREE.Euler(0, rr(0, 3.14), 0)); sc.set(w, hh, d); pp.set(x, yTop, z); m4.compose(pp, q, sc); shacks.setMatrixAt(n, m4); hooks.shackFloor.push(n); shacks.setColorAt(n, c.setHex(wallT[(rnd() * 5) | 0]).multiplyScalar(.85));
      let roofY = yTop + hh;
      if (rnd() < .4 && n < N - 1) { const w2 = w * rr(.7, 1.05), d2 = d * rr(.7, 1.05), h2 = rr(.3, .55); n++; sc.set(w2, h2, d2); pp.set(x + rr(-.08, .08), roofY, z + rr(-.08, .08)); m4.compose(pp, q, sc); shacks.setMatrixAt(n, m4); shacks.setColorAt(n, c.setHex(wallT[(rnd() * 5) | 0]).multiplyScalar(.8));
        sc.set(1e-4, 1e-4, 1e-4); m4.compose(pp, q, sc); roofs.setMatrixAt(n - 1, m4); roofY += h2; if (rnd() < .6) giantLights.push([x - w2 * .52, roofY - h2 * .5, z, 1, .62, .26, .18, rnd(), 0]); }
      sc.set(w * 1.15, rr(.3, .5), d * 1.15); pp.set(x, roofY, z); m4.compose(pp, q, sc); roofs.setMatrixAt(n, m4); roofs.setColorAt(n, c.setHex(roofT[(rnd() * 5) | 0]));
      if (rnd() < .28) { const gy = heightAt(x + .6, z + .4); if (yTop - gy > 1.2) ropes.push(new THREE.Vector3(x + .6, yTop + .2, z + .4), new THREE.Vector3(x + .6 + rr(-.2, .2), gy, z + .4 + rr(-.2, .2))); }
      if (rnd() < .6) giantLights.push([x + w * .52, yTop + hh * .5, z, 1, .62, .26, .2, rnd(), 0]);
      n++;
    }
    if (ropes.length) scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ropes), new THREE.LineBasicMaterial({ color: 0x8a7458, transparent: true, opacity: .7 })));
    shacks.count = roofs.count = n; [shacks, roofs].forEach(o => { o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; scene.add(o); });
    makePoints(giantLights, "light");
  }


  /* ---------- the busy wards: warehouses on the quays, stalls in the markets, a dwarven quarter ---------- */
  function buildDensity() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), c = new THREE.Color();
    // open ground: no masonry that was actually built (the chart's stone includes tiers dropped to keep places clear), no human block
    const bare = (mx, my) => surfaceAt(mx, my) < -50;
    const free = (mx, my, pad = 0) => sample(masks.land, mx, my) > .75 && bare(mx, my) && sample(masks.human, mx, my) < .05 && !excluded(mx, my) && !inSilverwall(mx, my) && (pad <= 0 || (bare(mx + pad, my) && bare(mx - pad, my) && bare(mx, my + pad) && bare(mx, my - pad)));
    const lights = [];
    // 1. warehouses along the harbor's quays, turned to the water
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
    const gable = new THREE.CylinderGeometry(.5, .5, 1, 3, 1); gable.rotateZ(Math.PI / 2); gable.rotateX(-Math.PI / 2); gable.scale(1, .7, 1.15); gable.translate(0, .25 * .7, 0);
    const WN = lowQuality ? 600 : 1800; const wh = new THREE.InstancedMesh(box, stdMat(0xffffff, { flatShading: true, roughness: .95 }), WN), whr = new THREE.InstancedMesh(gable, stdMat(0xffffff, { flatShading: true }), WN);
    let nw = 0;
    const HARBOR_N = lowQuality ? 120 : 260;
    for (let t = 0; t < 9000 && nw < HARBOR_N; t++) {
      const mx = rr(60, 470), my = rr(560, 760); if (nearestDistrict(mx, my) !== "Harbor") continue;
      const inl = sample(masks.inland, mx, my); if (inl < .45 || inl > .8 || !free(mx, my, 4)) continue;
      const [x, z] = toWorld(mx, my); const [, ang] = roadNear(mx, my); const L = rr(1.8, 3.4), D = rr(.9, 1.3), Hh = rr(.8, 1.3); const yl = footGround(x, z, L * .5);
      q.setFromEuler(new THREE.Euler(0, -ang + (rnd() < .5 ? 0 : Math.PI / 2), 0)); sc.set(L, Hh + (heightAt(x, z) - yl), D); pp.set(x, yl - .05, z); m4.compose(pp, q, sc); wh.setMatrixAt(nw, m4); wh.setColorAt(nw, c.setHex([0x6e5e48, 0x7a6a52, 0x5e5446, 0x847050][(rnd() * 4) | 0]));
      sc.set(L * 1.04, D * 1.1, D * 1.1); pp.set(x, yl - .05 + Hh + (heightAt(x, z) - yl), z); m4.compose(pp, q, sc); whr.setMatrixAt(nw, m4); whr.setColorAt(nw, c.setHex([0x4a3426, 0x5a3a28, 0x3e3a36][(rnd() * 3) | 0]));
      if (rnd() < .5) lights.push([x, yl + Hh * .4, z, 1, .62, .26, .22, rnd(), 0]);
      nw++;
    }
    // 1b. the same timber halls and lodging houses packed into the open ground of the other wards, turned to their streets
    { const taken = new Set(), cell = (mx, my) => ((mx / 7) | 0) + "," + ((my / 7) | 0);
      const clearOfPlaces = (mx, my) => { for (const k in PLACES) { const p = PLACES[k]; if ((p.x - mx) ** 2 + (p.y - my) ** 2 < 14 * 14) return false; } return true; };
      for (let t = 0; t < 60000 && nw < WN; t++) {
        const mx = rr(40, 880), my = rr(60, 1150); const dn = nearestDistrict(mx, my); if (dn === "Harbor" || dn === "Coasthold") continue;
        if (sample(masks.city, mx, my) < .6 || sample(masks.road, mx, my) > .25 || !free(mx, my, 3) || !clearOfPlaces(mx, my)) continue;
        const k = cell(mx, my); if (taken.has(k)) continue;
        const [x, z] = toWorld(mx, my); const [rd, ang] = roadNear(mx, my); const L = rr(1.3, rd < 20 ? 2.8 : 2.2), D = rr(.8, 1.2), Hh = rr(.7, 1.5); const yl = footGround(x, z, L * .5);
        if (heightAt(x, z) - yl > 1.6) continue; // not on a terrace edge
        taken.add(k);
        q.setFromEuler(new THREE.Euler(0, -ang + (rnd() < .65 ? 0 : Math.PI / 2) + rr(-.06, .06), 0)); sc.set(L, Hh + (heightAt(x, z) - yl), D); pp.set(x, yl - .05, z); m4.compose(pp, q, sc); wh.setMatrixAt(nw, m4); wh.setColorAt(nw, c.setHex([0x6e5e48, 0x7a6a52, 0x5e5446, 0x847050, 0x6a5440][(rnd() * 5) | 0]).multiplyScalar(rr(.9, 1.08)));
        sc.set(L * 1.04, D * 1.1, D * 1.1); pp.set(x, yl - .05 + Hh + (heightAt(x, z) - yl), z); m4.compose(pp, q, sc); whr.setMatrixAt(nw, m4); whr.setColorAt(nw, c.setHex([0x4a3426, 0x5a3a28, 0x3e3a36, 0x55301f][(rnd() * 4) | 0]));
        if (rnd() < .4) lights.push([x, yl + Hh * .45, z, 1, .62, .26, .2, rnd(), 0]);
        nw++;
      }
      // and up on the broken tops of the giant masonry, wherever a footprint finds level stone
      for (let t = 0; t < 40000 && nw < WN; t++) {
        const mx = rr(40, 880), my = rr(60, 1150); if (nearestDistrict(mx, my) === "Coasthold" || excluded(mx, my) || inSilverwall(mx, my) || !clearOfPlaces(mx, my)) continue;
        const k = cell(mx, my); if (taken.has(k)) continue;
        const [x, z] = toWorld(mx, my); const [, ang] = roadNear(mx, my); const L = rr(1.2, 2.4), D = rr(.8, 1.1), Hh = rr(.6, 1.2);
        const a0 = -ang + (rnd() < .5 ? 0 : Math.PI / 2), ca = Math.cos(a0), sa = Math.sin(a0);
        const hs = []; for (const [u, v] of [[0, 0], [.5, .5], [.5, -.5], [-.5, .5], [-.5, -.5]]) { const wx = x + (u * L * ca + v * D * sa), wz = z + (-u * L * sa + v * D * ca); const [cx, cy] = toChart(wx, wz); hs.push(surfaceAt(cx, cy)); }
        const lo = Math.min(...hs), hi = Math.max(...hs); if (lo < -50 || hi - lo > .35 || lo < heightAt(x, z) + 1) continue; // whole footprint on one level of stone
        taken.add(k);
        q.setFromEuler(new THREE.Euler(0, a0, 0)); sc.set(L, Hh + (hi - lo), D); pp.set(x, lo - .05, z); m4.compose(pp, q, sc); wh.setMatrixAt(nw, m4); wh.setColorAt(nw, c.setHex([0x6e5e48, 0x7a6a52, 0x5e5446, 0x847050, 0x6a5440][(rnd() * 5) | 0]).multiplyScalar(rr(.9, 1.08)));
        sc.set(L * 1.04, D * 1.1, D * 1.1); pp.set(x, hi - .05 + Hh, z); m4.compose(pp, q, sc); whr.setMatrixAt(nw, m4); whr.setColorAt(nw, c.setHex([0x4a3426, 0x5a3a28, 0x3e3a36, 0x55301f][(rnd() * 4) | 0]));
        if (rnd() < .4) lights.push([x, lo + Hh * .45, z, 1, .62, .26, .2, rnd(), 0]);
        nw++;
      }
      hooks.halls = nw; }
    // 2. crates and barrels stacked on the quays and piers
    const CN = lowQuality ? 300 : 700; const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(.28, .28, .28).translate(0, .14, 0), stdMat(0xffffff, { flatShading: true }), CN); let nc = 0;
    for (let t = 0; t < 12000 && nc < CN; t++) {
      const mx = rr(60, 470), my = rr(600, 800); const inl = sample(masks.inland, mx, my); if (inl < .35 || inl > .65 || sample(masks.land, mx, my) < .7 || !free(mx, my)) continue;
      const [x, z] = toWorld(mx, my); const n = 1 + (rnd() * 4) | 0;
      const fy = footGround(x, z, .5); let below = null; for (let k = 0; k < n && nc < CN; k++) { q.setFromEuler(new THREE.Euler(0, rr(0, 1.6), 0)); const s1 = below && k > 1 ? Math.min(below.s, rr(.7, 1.1)) : rr(.8, 1.4); sc.set(s1, s1, s1);
        if (k > 1 && below) pp.set(below.x + rr(-.04, .04), below.top, below.z + rr(-.04, .04)); else pp.set(x + (k ? .36 : 0), fy, z + rr(-.05, .05));
        below = { x: pp.x, z: pp.z, top: pp.y + .28 * s1, s: s1 }; m4.compose(pp, q, sc); crates.setMatrixAt(nc, m4); crates.setColorAt(nc, c.setHex([0x7a5a38, 0x6a4e30, 0x8a6a40, 0x5a4a3a][(rnd() * 4) | 0])); nc++; }
    }
    // 3. market stalls with bright awnings, filling the plazas and lining the roads
    const SN = lowQuality ? 380 : 900; const stall = new THREE.InstancedMesh(new THREE.BoxGeometry(.6, .45, .45).translate(0, .225, 0), stdMat(0xffffff, { flatShading: true }), SN);
    const awn = new THREE.InstancedMesh(new THREE.BoxGeometry(.8, .04, .62).translate(0, .62, 0), stdMat(0xffffff, { emissive: 0x0c0604 }), SN); let ns = 0;
    const awnC = [0x9a3a2a, 0x2a6a7a, 0xb08a3a, 0x6a3a7a, 0x3a7a4a, 0xa0522d, 0xc8b070];
    for (let t = 0; t < 20000 && ns < SN; t++) {
      const mx = rr(180, 520), my = rr(260, 700); const dn = nearestDistrict(mx, my); if (dn !== "Marketplace" && dn !== "Cross") continue;
      if (!free(mx, my) || sample(masks.road, mx, my) > .55) continue; if (sample(masks.city, mx, my) < .6) continue;
      const [x, z] = toWorld(mx, my); const [rd, ang] = roadNear(mx, my); if (rd > 40 && rnd() < .5) continue;
      q.setFromEuler(new THREE.Euler(0, -ang + rr(-.1, .1) + (rnd() < .5 ? 0 : Math.PI), 0)); sc.set(1, 1, 1); pp.set(x, footGround(x, z, .4) - .02, z); m4.compose(pp, q, sc); stall.setMatrixAt(ns, m4); stall.setColorAt(ns, c.setHex(0x5a4632)); awn.setMatrixAt(ns, m4); awn.setColorAt(ns, c.setHex(awnC[(rnd() * awnC.length) | 0]));
      if (rnd() < .35) lights.push([x, pp.y + .55, z, 1, .66, .3, .16, rnd(), 4]);
      ns++;
    }
    // 4. Coasthold: a dwarven quarter laid out on a grid, stout and square
    const DN = lowQuality ? 260 : 520; const dh = new THREE.InstancedMesh(box, stdMat(0xffffff, { flatShading: true, roughness: .8 }), DN); let nd = 0; const ga = .32;
    for (let gy = 800; gy < 1060 && nd < DN; gy += 7) for (let gx = 600; gx < 800 && nd < DN; gx += 7) {
      const u = Math.floor(gx / 7), v = Math.floor(gy / 7); if (u % 5 === 0 || v % 4 === 0) continue; // streets
      const mx = 700 + (gx - 700) * Math.cos(ga) - (gy - 930) * Math.sin(ga), my = 930 + (gx - 700) * Math.sin(ga) + (gy - 930) * Math.cos(ga);
      if (nearestDistrict(mx, my) !== "Coasthold" && nearestDistrict(mx, my) !== "Silverwall") continue;
      if (!free(mx, my) || mx < 600) continue; if (Math.hypot(mx - 614, my - 912) < 32 || Math.hypot(mx - 660, my - 985) < 50 || Math.hypot(mx - 667, my - 836) < 22) continue;
      const [x, z] = toWorld(mx, my); const yl = footGround(x, z, .7); const hh = rr(.7, 1.3);
      q.setFromEuler(new THREE.Euler(0, -ga, 0)); sc.set(1.1, hh + heightAt(x, z) - yl, 1.1); pp.set(x, yl - .05, z); m4.compose(pp, q, sc); dh.setMatrixAt(nd, m4); dh.setColorAt(nd, c.setHex([0x6a665c, 0x5e5a52, 0x76705f, 0x625c50][(rnd() * 4) | 0]));
      if (rnd() < .6) lights.push([x + .56, yl + hh * .5, z, 1, .72, .38, .2, rnd(), 0]);
      nd++;
    }
    // the Citadel of the Twelve: a hall ringed by twelve towers
    const cit = new THREE.Group(); const cm = stdMat(0x7a7468, { flatShading: true }); cit.add(mesh(new THREE.BoxGeometry(6, 3.2, 4.4), cm, 0, 1.6, 0));
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; cit.add(mesh(new THREE.CylinderGeometry(.45, .55, 4.4 + (k % 3) * .6, 8), cm, Math.cos(a) * 4.8, 2.2, Math.sin(a) * 3.8)); cit.add(mesh(new THREE.ConeGeometry(.6, 1, 8), stdMat(0x3a3d44, { flatShading: true }), Math.cos(a) * 4.8, 4.9 + (k % 3) * .6, Math.sin(a) * 3.8)); }
    cit.rotation.y = .3; placeAt(cit, 667, 836, 0);
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; const [x, z] = toWorld(667, 836); lights.push([x + Math.cos(a + .3) * 4.8, heightAt(x, z) + 3.4, z + Math.sin(a + .3) * 3.8, 1, .78, .45, .22, rnd(), 0]); }
    [wh, whr, crates, stall, awn, dh].forEach((o, i) => { o.count = [nw, nw, nc, ns, ns, nd][i]; o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; scene.add(o); });
    makePoints(lights, "light"); for (const e of lights) glowExtra.push([e[0], e[2], .1, 6]);
  }

  /* ---------- a building for every place the account names ---------- */
  function buildHeroes() {
    const L = [], smokeL = [];
    const at = (key) => { const p = PLACES[key]; exclusions.push([p.x, p.y, 9]); return [p.x, p.y]; };
    const lit = (g, dx, dy, dz, col = [1, .7, .35], size = .4, mode = 0) => { g.updateMatrixWorld(true); const v = new THREE.Vector3(dx, dy, dz).applyMatrix4(g.matrixWorld); L.push([v.x, v.y, v.z, ...col, size, rnd(), mode]); };
    const house = (g, w, h, d, wallC, roofC, x = 0, z = 0) => { g.add(mesh(new THREE.BoxGeometry(w, h, d), stdMat(wallC, { flatShading: true }), x, h / 2, z)); const rg = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); rg.rotateY(Math.PI / 4); const r = mesh(rg, stdMat(roofC, { flatShading: true }), x, h + h * .3, z); r.scale.set(w * 1.12, h * .6, d * 1.12); g.add(r); };
    const put = (g, key, rot = 0) => { const [mx, my] = at(key); g.rotation.y = rot; placeAt(g, mx, my, -.05, key); return g; };
    let g;
    // the Temple of the Sovereign Host, where the gods are dragons
    g = new THREE.Group(); [[6.4, 1.5], [4.6, 1.5], [3, 1.5]].forEach(([w, h], i) => g.add(mesh(new THREE.BoxGeometry(w, h, w), stdMat(0x7a7262, { flatShading: true }), 0, h / 2 + i * 1.5, 0)));
    const gold = new THREE.MeshBasicMaterial({ color: 0xffc85a }); [0, Math.PI / 4].forEach(r => { const st = mesh(new THREE.BoxGeometry(1.1, 1.1, .08), gold, 0, 2.8, 3.25); st.rotation.z = r; g.add(st); });
    const neck = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 4.5, 0), new THREE.Vector3(.3, 6, .4), new THREE.Vector3(.1, 7.2, 1.2), new THREE.Vector3(-.2, 7.6, 2)]), 20, .28, 6); g.add(mesh(neck, stdMat(0x9a7a3a, { metalness: .6, roughness: .4, flatShading: true })));
    put(g, "sovereign-host", .3); lit(g, 0, 1, 3.4, [1, .78, .4], .55); lit(g, -.2, 7.6, 2, [1, .8, .45], .35);
    // Dannel's Pride: a giant's tower jutting from the street at an angle, crowded with refugees
    g = new THREE.Group(); const tw = mesh(new THREE.CylinderGeometry(2.2, 2.5, 14, 12), stone(), 0, 4, 0); tw.rotation.z = .5; g.add(tw);
    for (let i = 0; i < 18; i++) { const a = rr(0, 6.28), r = rr(3, 7); const h = mesh(new THREE.BoxGeometry(rr(.6, 1), rr(.5, .9), rr(.6, 1)), stdMat(0x6a5a48, { flatShading: true }), Math.cos(a) * r, .4, Math.sin(a) * r); h.rotation.y = a; g.add(h); }
    put(g, "dannels-pride", .7); for (let i = 0; i < 26; i++) lit(g, rr(-7, 7), rr(.3, 1.2), rr(-7, 7), [1, rr(.55, .7), .25], .2);
    // the Black Wrack, with its wall of notices
    g = new THREE.Group(); house(g, 6, 2.4, 3.4, 0x5e4e3e, 0x3a2a22);
    const nc = document.createElement("canvas"); nc.width = 128; nc.height = 64; const ng = nc.getContext("2d"); ng.fillStyle = "#3a2c20"; ng.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 60; i++) { ng.fillStyle = ["#e8dcc0", "#d8c8a0", "#f0e8d0", "#c8b890"][i % 4]; ng.save(); ng.translate(rnd() * 128, rnd() * 64); ng.rotate(rr(-.2, .2)); ng.fillRect(-6, -5, rr(8, 14), rr(7, 11)); ng.restore(); }
    const nt = new THREE.CanvasTexture(nc); g.add(mesh(new THREE.PlaneGeometry(5.6, 2), new THREE.MeshStandardMaterial({ map: nt, emissive: 0x2a2010, emissiveMap: nt, emissiveIntensity: .5, roughness: 1 }), 0, 1.2, 1.72));
    put(g, "black-wrack", -.2); lit(g, -2.6, 1, 1.8, [1, .72, .35], .45); lit(g, 2.6, 1, 1.8, [1, .72, .35], .45);
    // a circle of standing stones in the Marketplace
    g = new THREE.Group(); for (let k = 0; k < 11; k++) { const a = k / 11 * 6.283; const st = mesh(new THREE.BoxGeometry(.4, rr(1.4, 2.4), .3), stone(), Math.cos(a) * 2.4, .8, Math.sin(a) * 2.4); st.rotation.y = -a; g.add(st); } put(g, "circle-of-visions"); lit(g, 0, .3, 0, [.5, .75, 1], .3, 3);
    // the Crypt of the Guard: a low tomb by the water, the sea in its vaults
    g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(4, 1.6, 3), stdMat(0x5a5e5a, { flatShading: true }), 0, .6, 0)); g.add(mesh(new THREE.BoxGeometry(1.4, .9, .3), stdMat(0x1a1e20), 0, .5, 1.52));
    put(g, "crypt-of-the-guard", .4); lit(g, 0, .5, 1.7, [.5, .75, 1], .35); for (let i = 0; i < 6; i++) lit(g, rr(-2, 2), .2, rr(1.6, 3), [.4, .7, .9], .1, 3);
    // the Old Catacombs: the top of a fallen tower, a sealed door, a drummer
    g = new THREE.Group(); const ft = mesh(new THREE.CylinderGeometry(2, 2.2, 5, 10), stone(), 0, 1, 0); ft.rotation.x = .35; g.add(ft); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; const m = mesh(new THREE.BoxGeometry(.6, .7, .6), stone(), Math.cos(a) * 1.9, 2.5 + .3, Math.sin(a) * 1.9); m.rotation.y = -a; ft.add(m); } // the crenellations ride the tower's tilt
    g.add(mesh(new THREE.BoxGeometry(1.2, 1.6, .3), stdMat(0x262a2c), 0, .8, 2.1)); put(g, "old-catacombs", .2); lit(g, 0, .8, 2.3, [.45, .7, 1], .4); lit(g, 1.6, .5, 2.6, [1, .65, .3], .25);
    // Hammersmith's Inn: a long hall with a chimney
    g = new THREE.Group(); house(g, 6.5, 2.2, 3, 0x5a4a3a, 0x3a3230); g.add(mesh(new THREE.CylinderGeometry(.35, .45, 2.4, 8), stdMat(0x3d3732), 2.4, 3.4, 0));
    put(g, "hammersmiths", .1); for (let i = 0; i < 5; i++) lit(g, -2.6 + i * 1.3, 1.1, 1.55, [1, .62, .26], .35); g.updateMatrixWorld(true); { const v = new THREE.Vector3(2.4, 4.6, 0).applyMatrix4(g.matrixWorld); for (let i = 0; i < 14; i++) smokeL.push([v.x, v.y, v.z, .16, .17, .18, rr(.9, 1.5), rnd(), 1]); }
    // the Riedran consulate: white and tiered, crimson lanterns
    g = new THREE.Group(); [[2.2, 2], [1.7, 1.8], [1.2, 1.6], [.7, 1.4]].forEach(([r, h], i) => g.add(mesh(new THREE.CylinderGeometry(r * .92, r, h, 8), stdMat(0xd8d4cc, { flatShading: true }), 0, h / 2 + [0, 2, 3.8, 5.4][i], 0)));
    put(g, "riedran-consulate"); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; lit(g, Math.cos(a) * 2.3, 2, Math.sin(a) * 2.3, [1, .2, .18], .28); }
    // the Stormreach Recruiters: a hanging sign and a pair of torches
    g = new THREE.Group(); house(g, 3, 2.4, 2.6, 0x6a5e4e, 0x4a2e24); g.add(mesh(new THREE.BoxGeometry(1.2, .6, .08), stdMat(0x8a6a3a), 0, 2.1, 1.7));
    put(g, "recruiters"); lit(g, -1.1, 1.6, 1.5, [1, .55, .2], .45, 2); lit(g, 1.1, 1.6, 1.5, [1, .55, .2], .45, 2);
    // Kreldo's hovel in Cross
    g = new THREE.Group(); house(g, 1.8, 1, 1.6, 0x4e4236, 0x3a2e26); put(g, "cross-hovel", .5); lit(g, 0, .45, .85, [1, .55, .22], .3); lit(g, .5, .25, .9, [.4, .9, .5], .12, 4);
    // the inn where the Traveler keeps a temple tonight
    g = new THREE.Group(); house(g, 3.6, 2.2, 3, 0x6e5e48, 0x5a3424); put(g, "travelers-inn", .3); for (let i = 0; i < 4; i++) lit(g, -1.3 + i * .85, 1.1, 1.55, [1, .7, .35], .3); lit(g, 1.9, 1.9, 1.6, [1, .8, .45], .3, 4);
    // Von Ruthvek's: a museum of a shop, cold light on old things
    g = new THREE.Group(); house(g, 3.4, 2.6, 3, 0x7a7466, 0x34383a); put(g, "von-ruthveks", -.3); for (let i = 0; i < 3; i++) lit(g, -1 + i, 1.1, 1.55, [.85, .9, 1], .4);
    // Shadows: a narrow dark house with one violet door
    g = new THREE.Group(); house(g, 1.6, 3.2, 1.6, 0x2e2a2c, 0x1e1a1c); put(g, "shadows", .6); lit(g, 0, .6, .85, [.6, .35, 1], .3);
    // Temple Row: a row of small shrines, each its own color, incense rising
    g = new THREE.Group(); for (let i = 0; i < 8; i++) { const sh = mesh(new THREE.BoxGeometry(.9, 1.2, .9), stdMat([0x7a6a5a, 0x6a5a6a, 0x5a6a5a, 0x7a5a4a][i % 4], { flatShading: true }), -5.6 + i * 1.6, .6, 0); g.add(sh); g.add(mesh(new THREE.ConeGeometry(.7, .7, 4), stdMat(0x4a3a2a, { flatShading: true }), -5.6 + i * 1.6, 1.55, 0)); }
    put(g, "temple-row", .4); for (let i = 0; i < 8; i++) { lit(g, -5.6 + i * 1.6, .6, .5, [[1, .4, .3], [1, .8, .3], [.5, 1, .6], [.6, .6, 1], [1, .5, .9]][i % 5], .3); g.updateMatrixWorld(true); const v = new THREE.Vector3(-5.6 + i * 1.6, 1.9, 0).applyMatrix4(g.matrixWorld); for (let k = 0; k < 5; k++) smokeL.push([v.x, v.y, v.z, .3, .28, .3, rr(.4, .7), rnd(), 1]); }
    // the Temple district at dusk: shrouded figures gliding, and their lamps
    g = new THREE.Group(); for (let i = 0; i < 5; i++) { const f = mesh(new THREE.ConeGeometry(.35, 1.9, 6), stdMat(0x5a1418, { emissive: 0x1a0204 }), -3 + i * 1.5, .95, rr(-.4, .4)); g.add(f); g.add(mesh(new THREE.SphereGeometry(.22, 8, 6), stdMat(0x4a1014), -3 + i * 1.5, 1.95, f.position.z)); }
    put(g, "twilight-streets", 1.1); for (let i = 0; i < 5; i++) lit(g, -3 + i * 1.5, 1.4, .3, [.9, .25, .3], .16, 4);
    // the Iron Watch: a blockhouse and its sentries, cold eyes open
    g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(5, 2.6, 3.6), stdMat(0x4e5256, { flatShading: true }), 0, 1.3, 0)); for (let i = 0; i < 6; i++) { const w = new THREE.Group(); w.add(mesh(new THREE.BoxGeometry(.45, .8, .3), stdMat(0x6a6e72, { metalness: .6, roughness: .5 }), 0, .7, 0)); w.add(mesh(new THREE.BoxGeometry(.3, .3, .3), stdMat(0x5a5e62, { metalness: .6, roughness: .5 }), 0, 1.25, 0)); w.position.set(-2.5 + i, 0, 2.4); g.add(w); }
    put(g, "iron-watch", -.2); for (let i = 0; i < 6; i++) lit(g, -2.5 + i, 1.28, 2.56, [.55, .8, 1], .12);
    // the Sloths: tailors' stalls under bright cloth
    g = new THREE.Group(); for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; const st = new THREE.Group(); st.add(mesh(new THREE.BoxGeometry(1, .7, .7), stdMat(0x4e3e2e), 0, .35, 0)); st.add(mesh(new THREE.BoxGeometry(1.3, .05, 1), stdMat([0x9a3a2a, 0x2a6a7a, 0xb08a3a, 0x6a3a7a][i % 4], { emissive: 0x100804 }), 0, 1.05, 0)); st.position.set(Math.cos(a) * 3, 0, Math.sin(a) * 3); st.rotation.y = -a; g.add(st); }
    put(g, "the-sloths"); for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; lit(g, Math.cos(a) * 3, .9, Math.sin(a) * 3, [1, .7, .35], .22); }
    // the Rubble Warren: broken stone, children's lanterns in the tunnels
    g = new THREE.Group(); for (let i = 0; i < 26; i++) { const r = mesh(new THREE.DodecahedronGeometry(rr(.4, 1.1), 0), stone(), rr(-4, 4), rr(0, .8), rr(-4, 4)); r.rotation.set(rr(0, 3), rr(0, 3), 0); g.add(r); }
    put(g, "rubble-warren"); for (let i = 0; i < 7; i++) lit(g, rr(-3.5, 3.5), .25, rr(-3.5, 3.5), [1, .78, .4], .12, 4);
    // Grindstone: a gatehouse with the black banner of the Swords
    g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(1.4, 4, 1.4), stone(), -2, 2, 0)); g.add(mesh(new THREE.BoxGeometry(1.4, 4, 1.4), stone(), 2, 2, 0)); g.add(mesh(new THREE.BoxGeometry(5.4, 1, 1.5), stone(), 0, 4.4, 0));
    g.add(mesh(new THREE.PlaneGeometry(1.4, 2.2), stdMat(0x111114, { side: THREE.DoubleSide, emissive: 0x050505 }), 0, 2.8, .8)); put(g, "grindstone", .5); lit(g, -2, 3, .9, [1, .55, .22], .35); lit(g, 2, 3, .9, [1, .55, .22], .35);
    // the Harbormaster's house
    g = new THREE.Group(); house(g, 4, 3, 3.2, 0x6a604e, 0x4a2e24); put(g, "harbor", -.1); for (let i = 0; i < 4; i++) lit(g, -1.4 + i * .95, 1.8, 1.65, [1, .7, .32], .32);
    // Whitewash's fountain
    g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(1.6, 1.8, .6, 16), stdMat(0xc8ccc8, { flatShading: true }), 0, .3, 0)); g.add(mesh(new THREE.CylinderGeometry(.25, .3, 1.6, 8), stdMat(0xc8ccc8), 0, .9, 0));
    put(g, "whitewash"); lit(g, 0, .7, 0, [.6, .9, 1], .7); for (let i = 0; i < 12; i++) lit(g, rr(-1.4, 1.4), rr(.6, 1.8), rr(-1.4, 1.4), [.75, .95, 1], .1, 3);
    makePoints(L, "light"); makePoints(smokeL, "smoke");
    for (const e of L) glowExtra.push([e[0], e[2], .12, 7]);
  }

  function buildDistrictLife() {
    const m = stone();
    // Forgelight furnaces and the Foundry
    const smoke = [], fire = [], lights = [];
    const chim = (mx, my, h, n = 1) => { const [x, z] = toWorld(mx, my); const y = heightAt(x, z); scene.add(mesh(new THREE.CylinderGeometry(.35, .5, h, 8), stdMat(0x3d3732), x, y + h / 2, z)); for (let i = 0; i < 14 * n; i++) smoke.push([x + rr(-.2, .2), y + h, z + rr(-.2, .2), .16, .17, .18, rr(.9, 1.6), rnd(), 1]); lights.push([x, y + h + .1, z, 1, .45, .15, .55, rnd(), 0]); };
    [[718, 467, 6], [700, 450, 5], [735, 485, 4.5], [580, 420, 4], [620, 440, 3.5]].forEach(c => chim(...c));
    [[190, 548, 7, 2], [175, 535, 6], [205, 560, 5.5]].forEach(c => chim(...c)); // Tharashk refinery
    const ref = mesh(new THREE.BoxGeometry(6, 2.6, 4), stdMat(0x45403a, { flatShading: true })); ref.geometry.translate(0, 1.3, 0); placeAt(ref, 190, 548, 0);
    for (let i = 0; i < 22; i++) { const [x, z] = toWorld(718 + rr(-20, 20), 467 + rr(-20, 20)); lights.push([x, heightAt(x, z) + rr(.3, 1.2), z, 1, rr(.35, .55), .12, rr(.25, .45), rnd(), 0]); }
    // Molou's Distillery: copper vats
    for (let i = 0; i < 5; i++) { const v = mesh(new THREE.CylinderGeometry(.8, .9, 2.2, 14), stdMat(0xa05a2c, { metalness: .8, roughness: .35, emissive: 0x200800 })); v.geometry.translate(0, 1.1, 0); placeAt(v, 240 + (i % 3) * 12 - 12, 388 + Math.floor(i / 3) * 14, 0, "molous"); }
    // the Keep of the Silver Flame and the Livewood Theater
    const keep = new THREE.Group(); keep.add(mesh(new THREE.BoxGeometry(3, 4, 3), m, 0, 2, 0)); keep.add(mesh(new THREE.ConeGeometry(1.2, 7, 8), stdMat(0xc0c8cc, { metalness: .7, roughness: .3 }), 0, 7.5, 0)); placeAt(keep, 530, 193, 0);
    lights.push([...(() => { const [x, z] = toWorld(530, 193); return [x, heightAt(x, z) + 11.2, z]; })(), .75, .85, 1, .9, .5, 0]);
    const theater = mesh(lathe([[3, 0], [6, 0], [6, 2.4], [5.6, 2.4], [3.2, .4], [3, .4]], 30), stdMat(0x4c3b2a, { flatShading: true })); placeAt(theater, 535, 283, 0);
    // paper lanterns in the Temple district, everbright lamps in Whitewash
    for (let i = 0; i < 160; i++) { const [x, z] = toWorld(560 + rr(-70, 70), 200 + rr(-80, 80)); const hue = [[1, .3, .25], [1, .7, .25], [.4, .9, .5], [.5, .6, 1], [1, .45, .8]][(rnd() * 5) | 0]; lights.push([x, heightAt(x, z) + rr(1.2, 2.6), z, ...hue, .2, rnd(), 4]); }
    for (let i = 0; i < 90; i++) { const [x, z] = toWorld(440 + rr(-60, 60), 70 + rr(-40, 40)); lights.push([x, heightAt(x, z) + rr(1, 2), z, .78, .88, 1, .18, rnd(), 0]); }
    // Grindstone's Rosewood: a ruin under crimson ivy
    const rose = new THREE.Group(); for (let i = 0; i < 6; i++) rose.add(mesh(new THREE.CylinderGeometry(.5, .6, rr(2, 5), 8), stdMat(0x5a1f22, { flatShading: true, emissive: 0x1a0204 }), Math.cos(i) * 2.4, 1.6, Math.sin(i) * 2.4)); placeAt(rose, 256, 256, 0);
    // the Iron Watch: cold light, nobody sleeping
    for (let i = 0; i < 10; i++) { const [x, z] = toWorld(636 + rr(-10, 10), 352 + rr(-10, 10)); lights.push([x, heightAt(x, z) + .8, z, .6, .8, 1, .2, rnd(), 0]); }
    // Deneith's keep across the river
    const den = new THREE.Group(); den.add(mesh(new THREE.BoxGeometry(3.4, 4.5, 3.4), m, 0, 2.25, 0)); [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].forEach(([x, z]) => den.add(mesh(new THREE.CylinderGeometry(.55, .6, 5.5, 8), m, x, 2.75, z))); placeAt(den, 706, 335, 0);
    // the Waterworks: pipes and steam
    for (let i = 0; i < 3; i++) { const p = mesh(new THREE.CylinderGeometry(.55, .55, 7, 12), stdMat(0x3c3f3e, { metalness: .5, roughness: .6 })); p.rotation.z = Math.PI / 2; p.rotation.y = .9 + i * .1; placeAt(p, 118 + i * 5, 648 + i * 4, .8, "waterworks"); }
    for (let i = 0; i < 26; i++) { const [x, z] = toWorld(112 + rr(-6, 10), 652 + rr(-6, 8)); smoke.push([x, 1.2, z, .32, .36, .38, rr(.9, 1.5), rnd(), 1]); }
    // the Tents of Rushemé and their fires
    const yurts = [];
    for (let i = 0; i < 9; i++) { const yurt = new THREE.Group(); const r = rr(2.2, 3.2); yurt.add(mesh(new THREE.CylinderGeometry(r, r, 2, 10), stdMat(0x7a6648, { flatShading: true }), 0, 1, 0)); yurt.add(mesh(new THREE.ConeGeometry(r * 1.08, 2.5, 10), stdMat(0x5e4c36, { flatShading: true }), 0, 3.25, 0)); placeAt(yurt, 170 + rr(-50, 50), 112 + rr(-36, 36), -.1, "tents-of-rusheme"); yurts.push([yurt.position.x, yurt.position.z, r]); }
    // campfires in the open between the tents: clear of every tent and giant, on level ground, ringed with stones
    { const giants = [[240, 140], [150, 92], [200, 70], [170, 112]].map(([a, b]) => toWorld(a, b)); const fires = []; const ringM = stdMat(0x3a3632, { flatShading: true });
      for (let t = 0; t < 400 && fires.length < 4; t++) {
        const [x, z] = toWorld(170 + rr(-55, 55), 112 + rr(-40, 40)); const y = heightAt(x, z);
        if (yurts.some(([yx, yz, r]) => Math.hypot(x - yx, z - yz) < r + 2.2) || giants.some(([gx, gz]) => Math.hypot(x - gx, z - gz) < 4.5) || fires.some(([fx, fz]) => Math.hypot(x - fx, z - fz) < 5)) continue;
        if (Math.abs(heightAt(x + 1, z) - y) + Math.abs(heightAt(x, z + 1) - y) > .35 || y < .5) continue;
        const [cmx, cmy] = toChart(x, z); if (sample(masks.human, cmx, cmy) > .02 || sample(masks.stone, cmx, cmy) > .02 || excluded(cmx, cmy)) continue;
        fires.push([x, z]); exclusions.push([cmx, cmy, 9]); // later builders (halls, shacks, ruins) keep their distance
        for (let k = 0; k < 24; k++) fire.push([x + rr(-.3, .3), y + .15 + rr(0, .5), z + rr(-.3, .3), 1, rr(.35, .55), .08, rr(.35, .7), rnd(), 2]);
        for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283; const st = mesh(new THREE.DodecahedronGeometry(rr(.13, .2), 0), ringM, x + Math.cos(a) * .6, y + .06, z + Math.sin(a) * .6); scene.add(st); }
        for (let k = 0; k < 8; k++) smoke.push([x + rr(-.15, .15), y + .8, z + rr(-.15, .15), .2, .2, .21, rr(.8, 1.3), rnd(), 1]);
      } }
    const gm = stdMat(0x6b5444, { flatShading: true });
    const giantAt = (mx, my, rot, sit) => { const gg = new THREE.Group(); const h = sit ? 4 : 6.2;
      gg.add(mesh(new THREE.BoxGeometry(2.2, h * .55, 1.4), gm, 0, h * .55, 0)); gg.add(mesh(new THREE.BoxGeometry(1, h * .45, 1.2), gm, -.6, h * .22, sit ? .8 : 0)); gg.add(mesh(new THREE.BoxGeometry(1, h * .45, 1.2), gm, .6, h * .22, sit ? .8 : 0));
      [-1, 1].forEach(sd => { const arm = mesh(new THREE.BoxGeometry(.6, h * .45, .6), gm, sd * 1.45, h * .6, .2); arm.rotation.x = sit ? -.8 : -.2; gg.add(arm); });
      gg.add(mesh(new THREE.SphereGeometry(.75, 10, 8), gm, 0, h * .9 + .5, 0)); gg.rotation.y = rot; placeAt(gg, mx, my, sit ? -1 : 0, "tents-of-rusheme"); };
    giantAt(240, 140, -1.2, false); giantAt(150, 92, .6, true); giantAt(200, 70, 2.2, false);
    giantAt(170, 112, 0, true);
    lights.push((() => { const [x, z] = toWorld(240, 140); return [x + 1.4, heightAt(x, z) + 6.6, z, 1, .75, .4, .5, .2, 0]; })());
    // the Black Freighter, moored in the river
    const fr = new THREE.Group(); const hull = mesh(new THREE.BoxGeometry(5, 1.2, 1.8), stdMat(0x24503e, { flatShading: true, roughness: .5 })); fr.add(hull); fr.add(mesh(new THREE.BoxGeometry(3, 1, 1.4), stdMat(0x2f2620), .3, 1.1, 0));
    const [fx, fz] = toWorld(150, 196); fr.position.set(fx, .35, fz); fr.rotation.y = Math.PI / 4; scene.add(fr); fr.traverse(o => { if (o.isMesh) o.userData.place = "black-freighter"; }); pickables.push(fr);
    for (let i = 0; i < 8; i++) lights.push([fx + rr(-2, 2), 1.6, fz + rr(-.8, .8), 1, .7, .3, .2, rnd(), 0]);
    // Blackbriar, up the coast: a dark field and one lit manor
    { const briarG = new THREE.IcosahedronGeometry(1, 0); const thorn = new THREE.ConeGeometry(.12, .7, 4);
      const briar = new THREE.InstancedMesh(briarG, stdMat(0x1a1015, { flatShading: true }), 140), thorns = new THREE.InstancedMesh(thorn, stdMat(0x2a1a1a, { flatShading: true }), 280);
      const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(); let nb = 0, nth = 0;
      for (let i = 0; i < 140; i++) { const mx = 860 + rr(-50, 70), my = 410 + rr(-70, 70); if (Math.abs(my - 404) < 5) continue; const [x, z] = toWorld(mx, my); const y = heightAt(x, z); const r = rr(.9, 1.6);
        q.setFromEuler(new THREE.Euler(0, rr(0, 6), 0)); sc.set(r, r * .45, r); pp.set(x, y + .1, z); mm.compose(pp, q, sc); briar.setMatrixAt(nb++, mm);
        for (let k = 0; k < 2; k++) { q.setFromEuler(new THREE.Euler(rr(-.8, .8), 0, rr(-.8, .8))); sc.set(1, 1, 1); pp.set(x + rr(-r, r) * .6, y + r * .4, z + rr(-r, r) * .6); mm.compose(pp, q, sc); thorns.setMatrixAt(nth++, mm); } }
      briar.count = nb; thorns.count = nth; [briar, thorns].forEach(o => { o.instanceMatrix.needsUpdate = true; o.userData.place = "blackbriar"; scene.add(o); pickables.push(o); });
      const manor = new THREE.Group(); manor.add(mesh(new THREE.BoxGeometry(4, 2.5, 3), stdMat(0x4a4038, { flatShading: true }), 0, 1.25, 0)); const mr = mesh(new THREE.ConeGeometry(3.2, 1.6, 4), stdMat(0x2e2622, { flatShading: true }), 0, 3.3, 0); mr.rotation.y = Math.PI / 4; mr.scale.set(1, 1, .75); manor.add(mr);
      placeAt(manor, 905, 404, 0, "blackbriar"); const [mx0, mz0] = toWorld(905, 404); const my0 = heightAt(mx0, mz0); for (let i = 0; i < 6; i++) lights.push([mx0 - 1.5 + i * .6, my0 + 1.3, mz0 + 1.55, 1, .78, .42, .3, rnd(), 0]);
      for (let k = 0; k < 16; k++) { const mx = 802 + k * 7.5 + 3.75; const [px, pz] = toWorld(mx, 404); const y0 = heightAt(toWorld(mx - 3.75, 404)[0], pz), y1 = heightAt(toWorld(mx + 3.75, 404)[0], pz); const seg = mesh(new THREE.BoxGeometry(1.55, .06, .7), stdMat(0x8a8070), px, (y0 + y1) / 2 + .06, pz); seg.rotation.z = Math.atan2(y1 - y0, 1.5); scene.add(seg); } }
    // Lyrandar shipyard: ribs of unfinished hulls
    for (let s = 0; s < 3; s++) { const g = new THREE.Group(); for (let k = 0; k < 8; k++) { const rib = mesh(new THREE.TorusGeometry(1.1, .07, 4, 12, Math.PI), stdMat(0x7a6247), k * .6 - 2.1, 1, 0); rib.rotation.set(0, Math.PI / 2, Math.PI); g.add(rib); } g.rotation.y = .9; placeAt(g, 383 + s * 9, 868 + s * 18, .3); }
    // Fisher's Folly: huts on stilts over the water
    for (let i = 0; i < 18; i++) { const g = new THREE.Group(); const h = rr(1.2, 2); g.add(mesh(new THREE.BoxGeometry(rr(.7, 1.2), .7, rr(.7, 1.1)), stdMat(0x4e4134, { flatShading: true }), 0, h + .35, 0)); for (let k = 0; k < 4; k++) g.add(mesh(new THREE.CylinderGeometry(.05, .05, h + .5), stdMat(0x3b2f24), (k % 2 - .5) * .7, (h + .5) / 2 - .4, (k > 1 ? .5 : -.5) * .7)); const [x, z] = toWorld(238 + rr(-24, 24), 790 + rr(-10, 22)); g.position.set(x, -.2, z); g.rotation.y = rr(0, 3); scene.add(g); g.traverse(o => { if (o.isMesh) o.userData.place = "fishers-folly"; }); pickables.push(g); if (rnd() < .6) lights.push([x + .5, h + .6, z, 1, .65, .3, .2, rnd(), 0]); }
    // harbor piers
    const pierMat = stdMat(0x3f342a);
    [[157, 740, 4, 70], [202, 734, 4, 58], [248, 745, 4, 80], [296, 736, 4, 62], [338, 743, 40, 4]].forEach(([mx, my, w, d]) => { const [x, z] = toWorld(mx, my); scene.add(mesh(new THREE.BoxGeometry(w * SCALE, .3, d * SCALE), pierMat, x, .3, z)); });
    // ships
    const hullG = new THREE.BoxGeometry(1, 1, 1); const hp = hullG.attributes.position; for (let i = 0; i < hp.count; i++) { if (hp.getY(i) < 0) { hp.setX(i, hp.getX(i) * .7); hp.setZ(i, hp.getZ(i) * .35); } if (hp.getZ(i) > .4 && hp.getY(i) > 0) hp.setX(i, hp.getX(i) * .6); } hullG.computeVertexNormals();
    const shipSpots = [[185, 767, 1.6], [225, 770, -1.5], [270, 790, 1.5], [312, 768, -1.6], [190, 840, .4], [300, 850, 2.1], [342, 902, .8], [120, 900, 1.2], [260, 1010, 2.6], [483, 1187, .3]];
    shipSpots.forEach(([mx, my, rot], i) => {
      const g = new THREE.Group(); const L = rr(3, 4.6);
      const hull = mesh(hullG, stdMat(i === 6 ? 0x5a2a20 : 0x3a2c22, { flatShading: true })); hull.scale.set(1.2, .9, L); hull.position.y = .25; g.add(hull);
      const mastH = L * 1.15; g.add(mesh(new THREE.CylinderGeometry(.07, .09, mastH), stdMat(0x2b2119), 0, mastH / 2 + .5, 0));
      const sailC = i === 6 ? 0xb4542e : i === 3 ? 0x8a6a9a : 0x8f8676;
      const sg = new THREE.PlaneGeometry(L * .55, mastH * .55, 6, 4); const spos = sg.attributes.position; for (let k = 0; k < spos.count; k++) { const u = spos.getX(k) / (L * .275); spos.setZ(k, (1 - u * u) * .35); } sg.computeVertexNormals();
      const sail = mesh(sg, stdMat(sailC, { side: THREE.DoubleSide, emissive: i === 6 ? 0x2a0c04 : 0x080706 }), 0, mastH * .55 + .5, 0); sail.rotation.y = Math.PI / 2; g.add(sail);
      const yard = mesh(new THREE.CylinderGeometry(.04, .04, L * .62), stdMat(0x2b2119), 0, mastH * .82 + .5, 0); yard.rotation.x = Math.PI / 2; g.add(yard);
      const [x, z] = toWorld(mx, my); if (DEBUG && heightAt(x, z) > -.6) console.warn("ship aground", mx, my); g.position.set(x, 0, z); g.rotation.y = rot; g.userData = { ph: rnd() * 6, base: new THREE.Vector3(x, 0, z), rot }; scene.add(g); ships.push(g);
      lights.push([x, 1.4, z, 1, .7, .35, .2, rnd(), 4]);
    });
    // offerings for Pirate's Moon: candles adrift in the harbor
    const off = []; for (let i = 0; i < 520; i++) { const [x, z] = toWorld(rr(100, 360), rr(712, 900)); if (sample(masks.land, ...toChart(x, z)) > .3) continue; off.push([x, .3, z, 1, .78, .45, .3, rnd(), 4]); }
    hooks.offerings = makePoints(off, "light");
    // bonfires for Shacklebreak
    const bf = []; [[343, 330], [350, 500], [470, 820], [260, 640], [560, 260], [200, 240], [600, 450]].forEach(([mx, my]) => { const [x, z] = toWorld(mx, my); const y = heightAt(x, z); for (let k = 0; k < 40; k++) bf.push([x + rr(-.5, .5), y + .1, z + rr(-.5, .5), 1, rr(.3, .55), .08, rr(.6, 1.1), rnd(), 2]); });
    hooks.bonfires = makePoints(bf, "light");
    // the Burning Titan, wicker on the eastern cliffs
    titanGroup = new THREE.Group();
    const wc = document.createElement("canvas"); wc.width = wc.height = 64; const wg = wc.getContext("2d"); wg.fillStyle = "#2a1a10"; wg.fillRect(0, 0, 64, 64); wg.strokeStyle = "#7a5631"; wg.lineWidth = 5;
    for (let i = -64; i < 128; i += 12) { wg.beginPath(); wg.moveTo(i, 0); wg.lineTo(i + 64, 64); wg.stroke(); wg.beginPath(); wg.moveTo(i + 64, 0); wg.lineTo(i, 64); wg.stroke(); }
    const wt = new THREE.CanvasTexture(wc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(3, 4);
    const wick = stdMat(0xffffff, { map: wt, roughness: 1 });
    titanGroup.add(mesh(new THREE.CylinderGeometry(1.2, 1.8, 7, 7, 3), wick, 0, 3.5, 0)); titanGroup.add(mesh(new THREE.SphereGeometry(1.1, 7, 5), wick, 0, 8, 0));
    const a1 = mesh(new THREE.CylinderGeometry(.35, .35, 5, 5), wick, -2.1, 7.5, 0); a1.rotation.z = .7; titanGroup.add(a1); const a2 = mesh(new THREE.CylinderGeometry(.35, .35, 5, 5), wick, 2.1, 7.5, 0); a2.rotation.z = -.7; titanGroup.add(a2);
    placeAt(titanGroup, 420, 968, 0, "titan-cliffs");
    const tf = []; const [tx, tz] = toWorld(420, 968); const ty = heightAt(tx, tz); for (let k = 0; k < 260; k++) { const yy = rr(0, 9); tf.push([tx + rr(-1.6, 1.6) * (1 - yy / 14), ty + yy, tz + rr(-1.2, 1.2), .95, rr(.22, .45), .05, rr(.5, 1.15) * (1 - yy / 16), rnd(), 2]); }
    hooks.titanFire = makePoints(tf, "light");
    const crowd = []; for (let k = 0; k < 320; k++) { const a = rr(0, 6.28), r = rr(3, 9); crowd.push([tx + Math.cos(a) * r, ty + .5, tz + Math.sin(a) * r, 1, rr(.25, .75), .12, rr(.12, .2), rnd(), 4]); }
    hooks.titanCrowd = makePoints(crowd, "light");
    titanLight = new THREE.PointLight(0xff7a2a, 0, 38, 2); titanLight.position.set(tx, ty + 6, tz); scene.add(titanLight);
    makePoints(smoke, "smoke"); makePoints(fire, "light"); makePoints(lights, "light");
  }

  function buildDistant() {
    // Xarkon's spire: a single sandstone needle in its own storm, far inland
    const sp = mesh(new THREE.CylinderGeometry(1.2, 7, 90, 7), new THREE.MeshBasicMaterial({ color: 0x3a2c20, fog: false })); sp.position.set(-410, 30, -10); scene.add(sp);
    const storm = mesh(new THREE.CircleGeometry(38, 24), new THREE.MeshBasicMaterial({ color: 0x07080b, fog: false, transparent: true, opacity: .85, side: THREE.DoubleSide })); storm.rotation.x = Math.PI / 2; storm.position.set(-410, 82, -10); scene.add(storm);
    hooks.xarkon = new THREE.PointLight(0x8fb4ff, 0, 400, 1); hooks.xarkon.position.set(-410, 70, -10); scene.add(hooks.xarkon);
    // a volcano with a dull red throat
    const vol = mesh(new THREE.ConeGeometry(70, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x06080a, fog: false })); vol.position.set(-200, 10, -800); scene.add(vol);
    makePoints([[-200, 41, -800, 1, .25, .08, 60, .2, 0]], "light");
    // lightning bolt mesh, reused
    boltMesh = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, fog: false })); scene.add(boltMesh);
  }


  /* ---------- below: the undercity shaft and the drowned streets of the harbor ---------- */
  const SHAFT = [176, 612], SHAFT_R = 8;
  function buildDepths() {
    exclusions.push([SHAFT[0], SHAFT[1], 52]);
    const [sx, sz] = toWorld(...SHAFT); const gy = Math.max(heightAt(sx, sz), .5);
    const g = new THREE.Group(); g.position.set(sx, 0, sz); scene.add(g); hooks.depths = g; g.visible = false;
    U.cut.value.set(sx, gy, sz, 0);
    const depth = 46;
    // strata walls
    const wallG = new THREE.CylinderGeometry(SHAFT_R + .05, SHAFT_R + .05, depth, 48, 23, true); const wp = wallG.attributes.position; const wc = new Float32Array(wp.count * 3);
    const strata = [[.32, .29, .24], [.24, .22, .2], [.28, .3, .22], [.17, .2, .22], [.3, .25, .2], [.12, .11, .13]];
    for (let i = 0; i < wp.count; i++) { const y = wp.getY(i); const k = Math.min(strata.length - 1, Math.floor((depth / 2 - y) / depth * strata.length)); const n = .75 + .5 * vnoise(Math.atan2(wp.getZ(i), wp.getX(i)) * 5, y * .6); const c = strata[k]; wc.set([c[0] * n, c[1] * n, c[2] * n], i * 3); }
    wallG.setAttribute("color", new THREE.BufferAttribute(wc, 3));
    const wall = mesh(wallG, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.BackSide, roughness: 1, flatShading: true }), 0, gy - depth / 2, 0); g.add(wall);
    const lip = mesh(new THREE.TorusGeometry(SHAFT_R + .15, .35, 6, 48), stdMat(0x3a352c, { flatShading: true }), 0, gy - .1, 0); lip.rotation.x = Math.PI / 2; g.add(lip);
    const pts = [];
    // 1. the giants' sewers: vaulted arches around the wall, dripping
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; const arch = mesh(new THREE.TorusGeometry(2.1, .45, 6, 14, Math.PI), stdMat(0x6a665c, { flatShading: true }), Math.cos(a) * (SHAFT_R - .4), gy - 6, Math.sin(a) * (SHAFT_R - .4)); arch.rotation.y = -a + Math.PI / 2; g.add(arch); }
    for (let i = 0; i < 40; i++) { const a = rr(0, 6.28), r = rr(2, SHAFT_R - .6); pts.push([Math.cos(a) * r, gy - rr(3, 9), Math.sin(a) * r, .4, .6, .7, .05, rnd(), 3]); }
    // 2. the mantis-folk tunnels: curving tubes in curves no human would choose
    for (let i = 0; i < 5; i++) { const y0 = gy - rr(12, 16); const cps = []; for (let k = 0; k < 5; k++) { const a = rr(0, 6.28), r = rr(0, SHAFT_R - 1); cps.push(new THREE.Vector3(Math.cos(a) * r, y0 + rr(-1.5, 1.5), Math.sin(a) * r)); }
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cps), 40, .36, 7), stdMat(0x3e3a2c, { flatShading: true })));
      cps.forEach(v => pts.push([v.x, v.y + .6, v.z, .55, 1, .45, .16, rnd(), 0])); }
    // 3. the sea devils' drowned halls: a dark water floor with columns breaking the surface
    const pool = mesh(new THREE.CylinderGeometry(SHAFT_R - .1, SHAFT_R - .1, .2, 40), new THREE.MeshStandardMaterial({ color: 0x08303a, emissive: 0x031a22, metalness: .6, roughness: .15, transparent: true, opacity: .85 }), 0, gy - 22, 0); g.add(pool);
    for (let i = 0; i < 9; i++) { const a = rr(0, 6.28), r = rr(1, SHAFT_R - 1); g.add(mesh(new THREE.CylinderGeometry(.3, .35, 3.5, 7), stdMat(0x3c4a48, { flatShading: true }), Math.cos(a) * r, gy - 22 + rr(-.5, 1), Math.sin(a) * r)); pts.push([Math.cos(a) * r, gy - 21.5, Math.sin(a) * r, .2, .8, .9, .2, rnd(), 0]); }
    // 4. the giants' city, sunk whole, dust on the tables
    const floorY = gy - 33; g.add(mesh(new THREE.CylinderGeometry(SHAFT_R - .1, SHAFT_R - .1, .3, 40), stdMat(0x3a342b), 0, floorY, 0));
    for (let i = 0; i < 26; i++) { const a = rr(0, 6.28), r = rr(.5, SHAFT_R - 1); const h = rr(.8, 3.2); const b = mesh(new THREE.BoxGeometry(rr(.6, 1.6), h, rr(.6, 1.6)), stdMat(0x7a7262, { flatShading: true }), Math.cos(a) * r, floorY + h / 2, Math.sin(a) * r); b.rotation.y = rr(0, 3); g.add(b); if (rnd() < .5) pts.push([Math.cos(a) * r, floorY + h + .2, Math.sin(a) * r, 1, .78, .45, .12, rnd(), 0]); }
    // 5. and below that, the thing they were trying to reach, or to hold down
    const sig = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.time },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; uniform float uTime; void main(){ vec2 q = vUv-.5; float r = length(q)*2.; float a = atan(q.y,q.x);
        float ring = smoothstep(.04,.0,abs(r-.62)) + smoothstep(.03,.0,abs(r-.82))*.6 + smoothstep(.02,.0,abs(r-.42+.03*sin(a*7.+uTime)))*.7;
        float spokes = smoothstep(.97,1.,cos(a*9.-uTime*.2))*step(r,.82)*step(.42,r);
        float pulse = .55+.45*sin(uTime*1.1); float core = exp(-r*r*9.)*pulse;
        gl_FragColor = vec4(vec3(.85,.18,.35)*(ring+spokes)*(.5+.5*pulse) + vec3(1.,.35,.55)*core*.8, 1.); }` });
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(SHAFT_R * 1.8, SHAFT_R * 1.8), sig); sigil.rotation.x = -Math.PI / 2; sigil.position.y = gy - depth + .3; g.add(sigil);
    const deep = new THREE.PointLight(0xff3060, 0, 30, 1.4); deep.position.set(0, gy - depth + 3, 0); g.add(deep); hooks.deepLight = deep;
    const pp = makePoints(pts, "light"); scene.remove(pp); g.add(pp);
    // the drowned streets beneath the harbor, visible when the water clears around the Talon
    const [tx, tz] = toWorld(228, 920); U.reveal.value.set(tx, 26, tz, 0);
    const uw = new THREE.Group(); uw.position.set(tx, 0, tz); scene.add(uw); hooks.underwater = uw;
    const um = stdMat(0x3b5650, { flatShading: true, emissive: 0x04100e });
    for (let i = 0; i < 34; i++) { const a = rr(0, 6.28), r = rr(4, 22); const x = Math.cos(a) * r, z = Math.sin(a) * r; const fy = Math.min(-2.2, heightAt(tx + x, tz + z));
      if (i % 3 === 0) { const arch = mesh(new THREE.TorusGeometry(1.4, .3, 5, 10, Math.PI), um, x, fy, z); arch.rotation.y = rr(0, 3); uw.add(arch); }
      else { const h = rr(1, 2.6); uw.add(mesh(new THREE.BoxGeometry(rr(.8, 2), h, rr(.8, 2)), um, x, fy + h / 2 - .3, z)); } }
    const sea = []; for (let i = 0; i < 70; i++) { const a = rr(0, 6.28), r = rr(3, 24); const x = Math.cos(a) * r, z = Math.sin(a) * r; sea.push([tx + x, Math.min(-1.2, heightAt(tx + x, tz + z) + rr(.4, 1.6)), tz + z, .25, .95, .75, .2, rnd(), 3]); }
    hooks.seaLights = makePoints(sea, "light");
  }

  /* lantern-carriers walking the main roads */
  const walkers = [];
  function buildWalkers() {
    const roads = roadPolys.map(pts => pts.map(([mx, my]) => { const [x, z] = toWorld(mx, my); return [x, Math.max(heightChart(mx, my), .3) + .45, z]; }));
    const n = lowQuality ? 70 : 150; const list = [];
    for (let i = 0; i < n; i++) { const w = { road: (rnd() * roads.length) | 0, s: rnd(), v: rr(.004, .012) * (rnd() < .5 ? -1 : 1), side: rr(-.35, .35) }; walkers.push(w); list.push([0, 0, 0, 1, rr(.6, .78), .32, .08, rnd(), 4]); }
    hooks.walkerRoads = roads; hooks.walkers = makePoints(list, "light");
  }
  function stepWalkers(dt) {
    const pos = hooks.walkers.geometry.attributes.position, roads = hooks.walkerRoads, side = 6 * SCALE;
    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i]; w.s += w.v * dt; if (w.s > 1) w.s -= 1; if (w.s < 0) w.s += 1;
      const pts = roads[w.road]; const f = w.s * (pts.length - 1), k = Math.floor(f), t = f - k; const a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)];
      pos.setXYZ(i, a[0] + (b[0] - a[0]) * t + w.side * side, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + w.side * side);
    }
    pos.needsUpdate = true;
  }



  /* the king beneath the waves, glimpsed on the calm night */
  let kraken = null, krakenT = -1, krakenNext = 8;
  function buildKraken() {
    const g = new THREE.Group(); const m = stdMat(0x1a2224, { roughness: .35, metalness: .2, flatShading: true });
    for (let i = 0; i < 3; i++) {
      const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(Math.sin(t * 2.4 + i) * 3 * t, t * (16 - i * 3), Math.cos(t * 3 + i * 2) * 2 * t)); }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 1.4 - i * .25, 8); const gp = geo.attributes.position;
      for (let v = 0; v < gp.count; v++) { const y = gp.getY(v); const k2 = Math.max(.08, 1 - y / (17 - i * 3)); const cx = Math.sin((y / 16) * 2.4 + i) * 3 * (y / 16), cz = Math.cos((y / 16) * 3 + i * 2) * 2 * (y / 16); gp.setX(v, cx + (gp.getX(v) - cx) * k2); gp.setZ(v, cz + (gp.getZ(v) - cz) * k2); }
      geo.computeVertexNormals(); const t = mesh(geo, m, i * 5 - 5, 0, i * 3); t.rotation.y = i * 1.3; g.add(t);
    }
    g.position.set(150, -24, 190); g.visible = false; scene.add(g); kraken = g;
  }

  function buildAtmosphere() {
    // a fog bank that fills the harbor on the night of fog
    const fm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: U.time, uFog: U.fogBank, uFogColor: U.fogColor },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: GLSL_NOISE + `varying vec3 vW; uniform float uTime,uFog; uniform vec3 uFogColor; void main(){ float n = fbm(vW.xz*.03 + vec2(uTime*.02, uTime*.01)); float a = smoothstep(.3,.7,n) * uFog * .85 * smoothstep(260.,80.,length(vW.xz));
        gl_FragColor = vec4(mix(uFogColor, vec3(.35,.4,.45), .5), a); }` });
    const fog = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 1, 1).rotateX(-Math.PI / 2), fm); fog.position.y = 1.6; fog.renderOrder = 2; scene.add(fog); hooks.fog = fog;
    // the scuppers in flood: sheets of water down the low streets to the harbor
    const flood = new THREE.Group(); const wm = new THREE.MeshStandardMaterial({ color: 0x1a3a44, metalness: .7, roughness: .15, transparent: true, opacity: .55, emissive: 0x05121a });
    const fpath = roadPolys[0] ? roadPolys[0].slice(0, 70) : [];
    for (let i = 0; i < fpath.length - 1; i += 2) { const [ax, ay] = fpath[i], [bx, by] = fpath[i + 1]; const [x, z] = toWorld((ax + bx) / 2, (ay + by) / 2); const len = Math.hypot(bx - ax, by - ay) * SCALE * 2.2; const seg = mesh(new THREE.BoxGeometry(len, .06, 1.8), wm, x, heightAt(x, z) + .18, z); seg.rotation.y = -Math.atan2(by - ay, bx - ax); flood.add(seg); }
    scene.add(flood); hooks.flood = flood; flood.visible = false;
    // gulls riding the beam's updraft
    const [ex, ez] = toWorld(72, 776); const gy = heightAt(ex, ez); hooks.gullC = new THREE.Vector3(ex, gy + 52, ez);
    const gl = []; for (let i = 0; i < 22; i++) gl.push([0, 0, 0, .9, .92, .95, .14, i / 22, 4]); makePoints.noReflect = true; hooks.gulls = makePoints(gl, "light"); makePoints.noReflect = false;
    hooks.gullData = gl.map(() => ({ r: rr(6, 16), h: rr(-8, 10), s: rr(.15, .35) * (rnd() < .5 ? -1 : 1), a: rr(0, 6.28) }));
    // petals shed by the flower islands
    const pet = []; floaters.forEach(f => { if (rnd() < .3) return; for (let k = 0; k < 18; k++) pet.push([f.userData.base.x + rr(-2, 2), f.userData.base.y, f.userData.base.z + rr(-2, 2), ...(rnd() < .6 ? [1, .6, .75] : [1, .95, .9]), .1, rnd(), 6]); });
    makePoints.noReflect = true; makePoints(pet, "light"); makePoints.noReflect = false;
  }

  /* ---------- weather & events ---------- */
  function strikeBolt() {
    const ang = rr(0, 6.28), dist = rr(220, 480); const x = Math.cos(ang) * dist + camera.position.x * .3, z = Math.sin(ang) * dist + camera.position.z * .3;
    const pts = []; let px = x, py = 120, pz = z; pts.push(new THREE.Vector3(px, py, pz));
    while (py > 0) { py -= rr(6, 14); px += rr(-6, 6); pz += rr(-6, 6); pts.push(new THREE.Vector3(px, Math.max(py, 0), pz)); }
    boltMesh.geometry.dispose(); boltMesh.geometry = new THREE.BufferGeometry().setFromPoints(pts); boltLife = .35;
    if (hooks.onThunder) hooks.onThunder(Math.min(3.5, dist / 90), cur.lightning);
  }

  /* ---------- pins & labels (HTML overlay) ---------- */
  let overlay;
  function mountPins(el, list, onClick) {
    overlay = el; pins = list.map(p => {
      const b = document.createElement("button"); b.className = "lantern" + (p.kind === "vision" ? " ring" : ""); b.type = "button"; b.setAttribute("aria-label", p.label);
      b.innerHTML = `<span class="lamp"></span><span class="tag"></span>`; b.querySelector(".tag").textContent = p.short || p.label;
      b.addEventListener("click", e => { e.stopPropagation(); onClick(p); });
      b.addEventListener("pointerenter", () => { hoverKey = p.key; hooks.onHover && hooks.onHover(p.key); });
      b.addEventListener("pointerleave", () => { hoverKey = null; hooks.onHover && hooks.onHover(null); });
      b.addEventListener("focus", () => hooks.onHover && hooks.onHover(p.key));
      b.addEventListener("blur", () => hooks.onHover && hooks.onHover(null));
      el.appendChild(b);
      const [x, z] = toWorld(p.x, p.y); return { ...p, el: b, v: new THREE.Vector3(x, heightAt(x, z) + (p.lift || 2.4), z) };
    });
    labels = DISTRICT_LABELS.map(([t, mx, my]) => { const d = document.createElement("div"); d.className = "dlabel"; d.setAttribute("aria-hidden", "true"); d.textContent = t; el.appendChild(d); const [x, z] = toWorld(mx, my); return { el: d, v: new THREE.Vector3(x, heightAt(x, z) + 6, z) }; });
  }
  const tmpV = new THREE.Vector3();
  const lastCam = new Float64Array(33); let overlayDirty = true;
  function updateOverlay() {
    if (!overlay) return;
    if ((occFrame + 1) % 6 === 0) overlayDirty = true;
    { const a = camera.matrixWorld.elements, b = camera.projectionMatrix.elements; let same = !overlayDirty && lastCam[32] === W;
      for (let i = 0; i < 16; i++) { if (lastCam[i] !== a[i] || lastCam[16 + i] !== b[i]) same = false; lastCam[i] = a[i]; lastCam[16 + i] = b[i]; }
      lastCam[32] = W; overlayDirty = false; if (same && !occStale) return; if (!same) occStale = true; var settle = same; }
    const camDist = camera.position.distanceTo(controls.target); const act = document.activeElement;
    const occTurn = settle || (occFrame = (occFrame + 1) % 6) === 0;
    for (const p of pins) {
      if (occTurn && p.el.style.display !== "none") { const o = p.key !== currentKey && occluded(p); if (o !== p.occ) { p.occ = o; p.el.classList.toggle("occluded", o); } }
      tmpV.copy(p.v).project(camera);
      const sx = (tmpV.x * .5 + .5) * W, sy = (-tmpV.y * .5 + .5) * H;
      const vis = tmpV.z < 1 && sx > 16 && sy > 16 && sx < W - panelPx - 16 && sy < H - panelPy - 16;
      if (!vis && act !== p.el) { if (!p.hidden) { p.hidden = true; p.el.style.display = "none"; } continue; }
      if (p.hidden) { p.hidden = false; p.el.style.display = ""; const o = p.key !== currentKey && occluded(p); if (o !== p.occ) { p.occ = o; p.el.classList.toggle("occluded", o); } }
      const x = (tmpV.x * .5 + .5) * W, y = (-tmpV.y * .5 + .5) * H;
      const d = camera.position.distanceTo(p.v); const s = Math.max(.55, Math.min(1.25, 42 / d));
      if (Math.abs(x - (p.x0 || -1e4)) < .35 && Math.abs(y - (p.y0 || -1e4)) < .35 && Math.abs(s - (p.s0 || 0)) < .004) continue;
      p.x0 = x; p.y0 = y; p.s0 = s;
      p.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
      if (p.s !== s.toFixed(2)) { p.s = s.toFixed(2); p.el.style.setProperty("--s", p.s); }
      const zi = 1000 - Math.round(d); if (p.z !== zi) { p.z = zi; p.el.style.zIndex = zi; }
    }
    if (settle) occStale = false;
    const labOp = Math.max(0, Math.min(1, (camDist - 115) / 45));
    for (const l of labels) {
      if (labOp <= 0) { if (l.op !== 0) { l.op = 0; l.el.style.opacity = 0; } continue; }
      tmpV.copy(l.v).project(camera);
      if (tmpV.z > 1) { l.el.style.opacity = 0; l.op = 0; continue; } l.op = labOp;
      l.el.style.opacity = labOp.toFixed(2);
      l.el.style.transform = `translate(${((tmpV.x * .5 + .5) * W).toFixed(1)}px,${((-tmpV.y * .5 + .5) * H).toFixed(1)}px)`;
    }
  }
  let pinFilter = null, occFrame = 0, occStale = true; let ruinTop = null;
  function bakeRuinTop(tiers) { // the highest rendered masonry surface per 2-unit chart cell, rasterized from the real top-cap triangles
    const G = 2, gw = Math.ceil(908 / G), gh = Math.ceil(1199 / G); ruinTop = { G, gw, gh, a: new Float32Array(gw * gh).fill(-99) };
    for (const { capTris } of tiers) { if (!capTris) continue;
      for (let t = 0; t < capTris.length; t += 9) {
        const [ax, ay] = toChart(capTris[t], capTris[t + 2]), [bx, by] = toChart(capTris[t + 3], capTris[t + 5]), [cx, cy] = toChart(capTris[t + 6], capTris[t + 8]);
        const ha = capTris[t + 1], hb = capTris[t + 4], hc = capTris[t + 7]; const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) / G)), x1 = Math.min(gw - 1, Math.floor(Math.max(ax, bx, cx) / G)), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) / G)), y1 = Math.min(gh - 1, Math.floor(Math.max(ay, by, cy) / G));
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
          const px = gx * G + G / 2, py = gy * G + G / 2; const w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w3 = 1 - w1 - w2;
          if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue; const hgt = w1 * ha + w2 * hb + w3 * hc; const k = gy * gw + gx; if (hgt > ruinTop.a[k]) ruinTop.a[k] = hgt;
        } } }
  }
  function surfaceAt(mx, my) { if (!ruinTop || mx < 0 || my < 0 || mx >= 908 || my >= 1199) return -99; return ruinTop.a[Math.floor(my / ruinTop.G) * ruinTop.gw + Math.floor(mx / ruinTop.G)]; }
  function blockedAt(x, y, z) { const [mx, my] = toChart(x, z); if (ruinTop && mx >= 0 && my >= 0 && mx < 908 && my < 1199) { const v = ruinTop.a[Math.floor(my / ruinTop.G) * ruinTop.gw + Math.floor(mx / ruinTop.G)]; if (y < v) return true; } return y < heightChart(mx, my) - .3; }
  const occA = new THREE.Vector3(), occP = new THREE.Vector3();
  function occluded(p) { return blockedAt(p.v.x, p.v.y, p.v.z) || lineBlocked(p.v, p.key); }
  function lineBlocked(v, key) { // is the sightline from the camera to v cut by ground, masonry or the statue?
    occA.copy(camera.position); const L = occA.distanceTo(v);
    const N = Math.max(14, Math.min(90, Math.ceil(L / 1.5)));
    for (let i = 1; i < N; i++) { occP.lerpVectors(occA, v, i / N); if (L * (1 - i / N) < 2) break;
      if (blockedAt(occP.x, occP.y, occP.z)) return true;
      if (hooks.emperorAxis && key !== "emperor") { const e = hooks.emperorAxis; const dx = occP.x - e.x, dz = occP.z - e.z; const hy = occP.y - e.y, rr2 = hy < 5.3 ? 10.3 : hy < 20 ? 7.8 : 6.5; if (dx * dx + dz * dz < rr2 * rr2 && hy > 0 && hy < 44) return true; } }
    return false;
  }
  function setPinFilter(keys) { pinFilter = keys ? new Set(keys) : null; for (const p of pins) p.el.classList.toggle("filtered", !!pinFilter && !pinFilter.has(p.key)); overlayDirty = true; }
  function setPinStates(seenFn, hereKey) {
    for (const p of pins) { const sn = p.kind !== "vision" && seenFn(p.key), here = p.key === hereKey; p.el.classList.toggle("seen", sn); p.el.classList.toggle("here", here);
      p.el.setAttribute("aria-label", p.label + (sn ? ", visited" : "")); if (here) p.el.setAttribute("aria-current", "location"); else p.el.removeAttribute("aria-current"); }
    overlayDirty = true;
    occStale = true;
  }

  /* ---------- camera ---------- */
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function viewFor(key) {
    let mx, my, cam;
    if (key && key.startsWith("vision-")) { const v = VISIONS[+key.slice(7)]; mx = v[0]; my = v[1]; cam = { az: 0, el: 45, d: 16 }; }
    else { const p = PLACES[key]; cam = p.cam || {}; mx = cam.focus ? cam.focus[0] : p.x; my = cam.focus ? cam.focus[1] : p.y; }
    const [x, z] = toWorld(mx, my); const gy = heightAt(x, z);
    const tgt = new THREE.Vector3(x, Math.max(gy, 0) + (cam.h || 1), z);
    const az = (cam.az ?? 0) * Math.PI / 180, el = (cam.el ?? 30) * Math.PI / 180, d = (cam.d ?? 22) * 1.55;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

    let pos = tgt.clone().addScaledVector(dir, d);
    if (hooks.giantStone && cam.look !== "south") {
      // nothing is cut away, so the eye needs a clear line: no masonry, buildings, or rooftop shacks between it and the place
      const rc = new THREE.Raycaster(), solid = [hooks.giantStone, hooks.humanMesh].filter(Boolean), q = new THREE.Vector3();
      const clear = (v, dd) => { rc.set(tgt, v); rc.far = dd; if (rc.intersectObjects(solid, false).length) return false;
        for (let k = 3; k <= dd; k += 1) { q.copy(tgt).addScaledVector(v, k); const [qx, qy] = toChart(q.x, q.z); let top = heightChart(qx, qy);
          if (ruinTop && qx >= 0 && qy >= 0 && qx < 908 && qy < 1199) top = Math.max(top, ruinTop.a[Math.floor(qy / ruinTop.G) * ruinTop.gw + Math.floor(qx / ruinTop.G)]);
          if (q.y < top + 1.8) return false; } return true; };
      const dirOf = (a, e) => new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
      let best = null; const deg = Math.PI / 180;
      for (const dd of [d, d * .75, d * .55]) { // keep the authored angle if possible: swing first, then climb (cap ~50°), then come closer
        for (const off of [0, 20, -20, 40, -40, 60, -60, 90, -90]) { const v = dirOf(az + off * deg, el); if (clear(v, dd)) { best = [v, dd]; break; } }
        for (let e = el + .14; !best && e <= .88; e += .14) for (const off of [0, 30, -30, 60, -60]) { const v = dirOf(az + off * deg, e); if (clear(v, dd)) { best = [v, dd]; break; } }
        if (best) break; }
      if (best) pos = tgt.clone().addScaledVector(best[0], best[1]);
    }
    if (cam.look === "south") { pos = new THREE.Vector3(x + 8, Math.max(gy, 0) + 30, z + 4); tgt.set(Math.max(-218, x - 140), Math.max(gy, 0) + 12, z + 18); }
    pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + 1.4, .9);
    return { pos, tgt };
  }
  function flyTo(pos, tgt, dur = 2.6, done) {
    idleOrbit = null; introFlight = null; dawnPush = null; hooks.onHover && hooks.onHover(null);
    if (reduceMotion || dur <= 0) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); flight = null; done && done(); return; }
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    const dist = p0.distanceTo(pos); const lift = Math.min(40, dist * .35);
    flight = { p0, t0, p1: pos.clone(), t1: tgt.clone(), t: 0, dur: Math.max(1.2, Math.min(dur, 1 + dist / 25)), lift, done };
  }
  function stepFlight(dt) {
    if (!flight) return;
    flight.t += dt / flight.dur; const k = ease(Math.min(1, flight.t));
    camera.position.lerpVectors(flight.p0, flight.p1, k); camera.position.y += Math.sin(k * Math.PI) * flight.lift;
    controls.target.lerpVectors(flight.t0, flight.t1, k);
    if (flight.t >= 1) { const done = flight.done; flight = null; done && done(); }
  }


  /* ---------- performance: fold every static mesh into one mesh per material ---------- */
  const pickSpheres = [];
  function mergeStatic(dynamicRoots) {
    scene.updateMatrixWorld(true);
    const dyn = new Set(dynamicRoots.filter(Boolean));
    const isDyn = o => { for (let q = o; q; q = q.parent) if (dyn.has(q)) return true; return false; };
    const base = THREE.Material.prototype.onBeforeCompile;
    const buckets = new Map(); const merged = [];
    // remember where the merged landmarks were, for clicking
    for (const pk of pickables.slice()) { if (isDyn(pk)) continue; const box = new THREE.Box3().setFromObject(pk); if (box.isEmpty()) continue; const sz = box.getSize(new THREE.Vector3()); if (Math.max(sz.x, sz.z) > 16) continue; let key = null; pk.traverse(o => { if (!key && o.userData && o.userData.place) key = o.userData.place; }); if (key) pickSpheres.push({ box, key }); }
    scene.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || isDyn(o) || !o.visible) return;
      const m = o.material; if (!m || Array.isArray(m) || !m.isMeshStandardMaterial || m.map || m.envMap || m.transparent || m.onBeforeCompile !== base) return;
      const g = o.geometry; if (!g.attributes.normal || g.attributes.position.count > 40000) return;
      for (let q = o.parent; q && q !== scene; q = q.parent) if (!q.visible) return;
      merged.push(o);
      let b = buckets.get(m); if (!b) { b = { mat: m, list: [] }; buckets.set(m, b); } b.list.push(o);
    });
    for (const { mat, list } of buckets.values()) {
      const useColor = !!mat.vertexColors; let n = 0;
      const parts = list.map(o => { let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld); n += g.attributes.position.count; return g; });
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = useColor ? new Float32Array(n * 3) : null; let off = 0;
      for (const g of parts) { const c = g.attributes.position.count; P.set(g.attributes.position.array, off * 3); N.set(g.attributes.normal.array, off * 3); if (C) { if (g.attributes.color) C.set(g.attributes.color.array, off * 3); else C.fill(1, off * 3, (off + c) * 3); } off += c; g.dispose(); }
      const mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.BufferAttribute(P, 3)); mg.setAttribute("normal", new THREE.BufferAttribute(N, 3)); if (C) mg.setAttribute("color", new THREE.BufferAttribute(C, 3));
      mg.computeBoundingSphere();
      const mm = new THREE.Mesh(mg, mat); mm.matrixAutoUpdate = false; scene.add(mm);
      for (const o of list) o.parent && o.parent.remove(o);
    }
    // drop emptied groups and freeze what is left still
    for (let k = pickables.length - 1; k >= 0; k--) { let has = false; pickables[k].traverse(o => { if (o.isMesh || o.isPoints) has = true; }); if (!has) pickables.splice(k, 1); }
    scene.children.slice().forEach(o => { if (o.isGroup && !dyn.has(o)) { let has = false; o.traverse(c => { if (c !== o && !c.isGroup) has = true; }); if (!has) scene.remove(o); } });
    scene.traverse(o => { if (!isDyn(o) && o !== scene && !o.isCamera) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
  }
  function mergeWithin(g) {
    if (!g) return; g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(); const buckets = new Map();
    g.traverse(o => { if (!o.isMesh || o.isInstancedMesh || o === g) return; const m = o.material; if (Array.isArray(m) || m.map || m.envMap || !o.geometry.attributes.normal) return; let b = buckets.get(m); if (!b) buckets.set(m, b = []); b.push(o); });
    for (const [mat, list] of buckets) {
      if (list.length < 2) continue; const useColor = !!mat.vertexColors; let n = 0; const tmp = new THREE.Matrix4();
      const parts = list.map(o => { const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); geo.applyMatrix4(tmp.multiplyMatrices(inv, o.matrixWorld)); n += geo.attributes.position.count; return geo; });
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = useColor ? new Float32Array(n * 3) : null; let off = 0;
      for (const geo of parts) { const c = geo.attributes.position.count; P.set(geo.attributes.position.array, off * 3); N.set(geo.attributes.normal.array, off * 3); if (C) { if (geo.attributes.color) C.set(geo.attributes.color.array, off * 3); else C.fill(1, off * 3, (off + c) * 3); } off += c; geo.dispose(); }
      const mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.BufferAttribute(P, 3)); mg.setAttribute("normal", new THREE.BufferAttribute(N, 3)); if (C) mg.setAttribute("color", new THREE.BufferAttribute(C, 3)); mg.computeBoundingSphere();
      const mm = new THREE.Mesh(mg, mat); mm.renderOrder = list[0].renderOrder; g.add(mm); list.forEach(o => o.parent.remove(o));
    }
  }
  function pickAt(ray, noOcc) {
    const cands = ray.intersectObjects(pickables, true).filter(h => h.object.userData.place).map(h => ({ d: h.distance, key: h.object.userData.place, pt: h.point }));
    for (const ps of pickSpheres) { const q = ray.ray.intersectBox(ps.box, new THREE.Vector3()); if (q) cands.push({ d: q.distanceTo(ray.ray.origin), key: ps.key, pt: q }); }
    cands.sort((a, b) => a.d - b.d);
    const vis = cands.find(c => noOcc || !lineBlocked(c.pt, c.key));
    return vis ? vis.key : null;
  }

  /* ---------- public ---------- */
  function init(container, opts = {}) {
    try { return initInner(container, opts); } catch (e) { console.error(e); try { renderer && renderer.setAnimationLoop(null); renderer && renderer.dispose(); renderer && renderer.forceContextLoss(); renderer && renderer.domElement.remove(); } catch (e2) {} renderer = null; return false; }
  }
  function initInner(container, opts = {}) {
    Object.assign(hooks, opts);
    { const mq = matchMedia("(prefers-reduced-motion: reduce)"); reduceMotion = mq.matches; mq.addEventListener && mq.addEventListener("change", e => { reduceMotion = e.matches; occStale = true; if (reduceMotion) { if (kraken) { kraken.visible = false; krakenT = -1; } if (flight) { flight.t = 1; stepFlight(0); } } }); }
    lowQuality = opts.lowQuality ?? (Math.min(screen.width, screen.height) < 700 || navigator.hardwareConcurrency <= 4);
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !lowQuality });
    } catch (e) { return false; }
    if (!renderer.getContext()) return false;
    renderer.setPixelRatio(Math.min(devicePixelRatio, lowQuality ? 1.25 : 1.75));
    renderer.setClearColor(0x05080a); if (lowQuality) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.32; }
    container.appendChild(renderer.domElement);
    renderer.domElement.addEventListener("webglcontextlost", e => { e.preventDefault(); renderer.setAnimationLoop(null); hooks.onLost && hooks.onLost(); });
    scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x0b1317, .0085);
    camera = new THREE.PerspectiveCamera(48, 1, .2, 2400);
    camera.position.set(-20, 80, 300);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI * .47; controls.minDistance = 5; controls.maxDistance = 330;
    controls.target.set(-6, 0, 10); controls.zoomSpeed = .8; controls.rotateSpeed = .5; controls.panSpeed = .7; controls.screenSpacePanning = false;
    controls.addEventListener("start", () => { flight = null; idleOrbit = null; introFlight = null; dawnPush = null; hooks.onUserMove && hooks.onUserMove(); });
    hemi = new THREE.HemisphereLight(0x4a6a9a, 0x2a1c12, .62); scene.add(hemi);
    moonLight = new THREE.DirectionalLight(0x9fb5d8, .45); moonLight.position.set(60, 90, -70); scene.add(moonLight);
    flashLight = new THREE.DirectionalLight(0xc8d6ff, 0); flashLight.position.set(-50, 100, 40); scene.add(flashLight);
    seed = 1337; sampleRoads(); buildMasks(); exclusions.push([176, 612, 56]);
    buildSky(); buildWater(); buildTerrain();
    buildEmperor(); buildLighthouse(); buildTalon(); buildSpire(); buildPalace(); buildBazaar(); buildSilverwall(); buildDelera();
    buildFloaters(); buildRuins(); buildDistrictLife(); buildHeroes(); buildGiantCity(); buildRigging(); buildDensity(); buildDistant(); buildDepths(); buildKraken(); buildAtmosphere(); buildHouses(); buildWalkers(); buildJungle(); buildRain();
    const [bx, bz] = toWorld(72, 776); waterMat.uniforms.uBeam.value.set(bx, 60, bz); skyMat.uniforms.uBeamTop.value.set(bx + 1.2, 170, bz + 6);
    const [lx, lz] = toWorld(126, 830); waterMat.uniforms.uLh.value.set(lx, 0, lz);
    if (!lowQuality && THREE.EffectComposer && THREE.UnrealBloomPass) {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), .95, .6, .55); composer.addPass(bloomPass);
      const grade = new THREE.ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: U.time, uDawn: U.dawn },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uDawn; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*7.)*43758.5453); }
          void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 q = vUv-.5; float v = 1.-dot(q,q)*1.1;
            vec3 x = c.rgb * 1.32; vec3 col = clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.) * v; col = mix(col, col*vec3(.92,.98,1.1), .35*(1.-uDawn)); col += (h(vUv*800.)-.5)*.018;
            gl_FragColor = vec4(col, 1.); }` });
      composer.addPass(grade);
    }
    // click directly on landmarks
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
    let pointers = 0; renderer.domElement.addEventListener("pointerdown", e => { pointers++; down = (e.button === 0 && pointers === 1) ? [e.clientX, e.clientY, e.pointerId] : null; });
    renderer.domElement.addEventListener("pointercancel", () => { pointers = Math.max(0, pointers - 1); down = null; });
    ["pointermove", "pointerdown", "wheel", "keydown", "touchmove"].forEach(ev => addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true }));
    renderer.domElement.addEventListener("pointerup", e => {
      pointers = Math.max(0, pointers - 1); const d0 = down; down = null;
      if (!d0 || e.pointerId !== d0[2] || e.button !== 0 || Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 6) return;
      const r = renderer.domElement.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(ndc, camera); const key = pickAt(ray);
      if (key && hooks.onPick) hooks.onPick(key);
    });
    refreshCube();
    [hooks.depths, hooks.underwater, hooks.flood].forEach(mergeWithin);
    mergeStatic([hooks.giantStone, emperorGroup, lighthouseGroup, spireGroup, titanGroup, kraken, hooks.depths, hooks.underwater, hooks.flood, hooks.fog, hooks.cubeCam, ...floaters, ...ships, ...visionCols]);
    clock = new THREE.Clock();
    resize(); addEventListener("resize", resize);
    renderer.setAnimationLoop(frame);
    return true;
  }
  function resize() {
    const r = renderer.domElement.parentElement.getBoundingClientRect(); W = r.width; H = r.height;
    renderer.setSize(W, H, false); renderer.domElement.style.width = W + "px"; renderer.domElement.style.height = H + "px";
    camera.aspect = W / H; applyOffset(); if (composer) composer.setSize(W, H);
    U.pixel.value = H * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
  }
  function applyOffset() {
    if ((panelPx > 0 || panelPy > 0) && W > 0) camera.setViewOffset(W, H, panelPx / 2, panelPy / 2, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  const FOG_NIGHT = new THREE.Color(0x0b1317), FOG_DAWN = new THREE.Color(0x8d7f7c), UP = new THREE.Vector3(0, 1, 0), tmpOff = new THREE.Vector3();
  let cubeAt = 0; function refreshCube() { if (!hooks.cubeCam) return; const inner = scene.children.filter(o => o.isGroup && o.children[0] && o.children[0].material && o.children[0].material.envMap); inner.forEach(o => o.visible = false); const px = U.pixel.value; U.pixel.value = (lowQuality ? 64 : 128) / 2; const hide = [hooks.rain, hooks.titanFire, hooks.titanCrowd, hooks.bonfires, beamGroup].filter(Boolean); const was = hide.map(o => o.visible); hide.forEach(o => o.visible = false); hooks.cubeCam.update(renderer, scene); U.pixel.value = px; hide.forEach((o, i) => o.visible = was[i]); inner.forEach(o => o.visible = true); }
  let lastInput = 0, sinceDraw = 0; const fpsRaw = [];
  function frame() {
    // while the reader is reading and nothing is moving on purpose, draw at half rate
    const raw = clock.getDelta(); sinceDraw += raw;
    if (!adaptiveDone) fpsRaw.push(Math.min(.2, raw));
    const calm = !flight && !(introFlight && !reduceMotion) && !dawnPush && !(idleOrbit && !reduceMotion) && boltLife <= 0 && performance.now() - lastInput > 2500;
    if (calm && sinceDraw < 1 / 31) return;
    const dt = Math.min(.05, sinceDraw); sinceDraw = 0; const t = clock.elapsedTime;
    U.time.value = t;
    // ease weather toward the night's state
    const k = 1 - Math.exp(-dt * .8);
    for (const key in target) cur[key] += (target[key] - cur[key]) * k;
    U.rain.value = cur.rain; U.dawn.value = cur.dawn; U.moon.value = cur.moon; U.calm.value = cur.calm;
    hooks.rain.visible = cur.rain > .02; overlayDirty = overlayDirty || !!flight;
    hooks.offerings.material.uniforms.uGate.value = cur.offerings; hooks.offerings.visible = cur.offerings > .02;
    for (const [o, v] of [[hooks.offerings, cur.offerings], [hooks.bonfires, cur.bonfires], [hooks.titanFire, cur.titan], [hooks.titanCrowd, cur.titan]]) { const r = o && o.userData.refl; if (r) { r.material.uniforms.uGate.value = v; r.visible = v > .02; } }
    hooks.bonfires.material.uniforms.uGate.value = cur.bonfires; hooks.bonfires.visible = cur.bonfires > .02;
    hooks.titanFire.material.uniforms.uGate.value = cur.titan; hooks.titanFire.visible = cur.titan > .02;
    hooks.titanCrowd.material.uniforms.uGate.value = cur.titan; hooks.titanCrowd.visible = cur.titan > .02;
    U.glowAmt.value = (1 - cur.dawn * .8) * (1 + cur.bonfires * .3);
    titanLight.intensity = cur.titan * (1.4 + Math.sin(t * 13) * .18 + Math.sin(t * 7.3) * .12);
    titanGroup.visible = cur.titan > .02 || target.titan > 0 || cur.titanBuilt;
    // fog and light by weather and dawn
    U.fogColor.value.copy(FOG_NIGHT).lerp(FOG_DAWN, cur.dawn); scene.fog.color.copy(U.fogColor.value);
    U.fogDensity.value = .0011 + cur.rain * .0017 - cur.dawn * .0004; scene.fog.density = U.fogDensity.value;
    renderer.setClearColor(U.fogColor.value);
    // lightning
    if (!reduceMotion && cur.lightning > .05) { nextBolt -= dt; if (nextBolt <= 0) { strikeBolt(); nextBolt = rr(4, 14) / (cur.lightning + .1); } }
    if (boltLife > 0) { boltLife -= dt; const f = Math.max(0, boltLife / .35); const flick = f * (.6 + .4 * Math.sin(t * 90)); U.flash.value = flick * 1.2; boltMesh.material.opacity = flick; }
    else { U.flash.value *= .85; boltMesh.material.opacity = 0; }
    hemi.intensity = .6 + cur.moon * .22 + cur.dawn * .9 + U.flash.value * 1.8;
    if ((cur.dawn > .5) !== frame.dawnLit) { frame.dawnLit = cur.dawn > .5; hemi.color.setHex(frame.dawnLit ? 0x9aa7c0 : 0x4a6a9a); }
    moonLight.intensity = .5 + cur.moon * .45 + cur.dawn * .9;
    flashLight.intensity = U.flash.value * 2.2;
    hooks.xarkon.intensity = Math.pow(Math.max(0, Math.sin(t * 2.7) * Math.sin(t * 5.3)), 8) * 6 * (1 - cur.dawn);
    // the Emperor: beam pulse, and at dawn, the head turns a little toward the city
    beamGroup.scale.x = beamGroup.scale.z = 1 + Math.sin(t * .7) * .05;
    emperorLight.intensity = 2.2 * (1 - cur.dawn * .8) + Math.sin(t * 1.3) * .15;
    emperorHead.rotation.y = cur.dawn * .62;
    lighthouseBeam.rotation.y = t * .35; hooks.crystal.rotation.y = t * .35;
    const lhA = t * .35; waterMat.uniforms.uLhDir.value.set(Math.cos(-lhA), Math.sin(-lhA));
    { // where the sweep meets the Emperor, the beam ends: a ray against the statue's silhouette at the lamp's height
      const lp = lighthouseGroup.position, e = hooks.emperorAxis, dx = Math.cos(lhA), dz = -Math.sin(lhA), fx = lp.x - e.x, fz = lp.z - e.z;
      const yl = (lp.y + 12.9 * .75 - e.y) / 1.9, R = 1.9 * (yl < 2.8 ? 5.4 : yl < 15.3 ? 3.6 - 2 * (yl - 2.8) / 12.5 : yl < 19.5 ? 2.6 : 0);
      const bq = fx * dx + fz * dz, disc = bq * bq - (fx * fx + fz * fz - R * R); const hit = R > 0 && disc > 0 ? -bq - Math.sqrt(disc) : -1;
      const d = hit > 0 ? hit : 1e4; hooks.lhClip.value = d / .75; waterMat.uniforms.uLhClip.value = d; }
    if (airship) { airship.position.y = 21 + Math.sin(t * .6) * .35; airship.rotation.y = Math.sin(t * .2) * .15; airship.userData.ring.rotation.x = t * 1.6; }
    for (const f of floaters) { const u = f.userData; f.position.set(u.base.x + Math.cos(t * .05 + u.ph) * u.r, u.base.y + Math.sin(t * .4 + u.ph) * .5, u.base.z + Math.sin(t * .05 + u.ph) * u.r); f.rotation.y = t * .02 + u.ph; }
    const sw = 1 - cur.calm * .8; for (const s of ships) { const u = s.userData; s.position.y = Math.sin(t * 1.1 + u.ph) * .12 * sw; s.rotation.z = Math.sin(t * .9 + u.ph) * .05 * sw; s.rotation.x = Math.sin(t * .7 + u.ph * 2) * .03 * sw; }
    hooks.rain.material.uniforms.uCenter.value.copy(camera.position);
    U.cut.value.w = cur.cut * SHAFT_R; hooks.depths.visible = cur.cut > .01; hooks.deepLight.intensity = cur.cut * (1.6 + Math.sin(t * 1.1) * .8);
    U.reveal.value.w = cur.reveal; hooks.seaLights.visible = cur.reveal > .01; hooks.underwater.visible = cur.reveal > .01;
    stepWalkers(dt);
   
    if (cubeAt && performance.now() > cubeAt) { cubeAt = 0; refreshCube(); }
    U.fogBank.value = cur.fog; hooks.fog.visible = cur.fog > .01; hooks.flood.visible = cur.flood > .05; hooks.flood.children.forEach(c => { c.material.opacity = .55 * cur.flood; });
    { const gp = hooks.gulls.geometry.attributes.position, C = hooks.gullC; hooks.gullData.forEach((d, i) => { d.a += d.s * dt; gp.setXYZ(i, C.x + Math.cos(d.a) * d.r, C.y + d.h + Math.sin(d.a * 3 + i) * .6, C.z + Math.sin(d.a) * d.r); }); gp.needsUpdate = true; hooks.gulls.visible = cur.dawn < .95; }
    if (kraken) {
      if (krakenT < 0 && cur.calm > .6 && cur.dawn < .1 && !reduceMotion) { krakenNext -= dt; if (krakenNext <= 0) { krakenT = 0; kraken.visible = true; kraken.rotation.y = rr(0, 6.28); } }
      if (krakenT >= 0) { krakenT += dt; const up = Math.min(1, krakenT / 5) * (krakenT < 12 ? 1 : Math.max(0, 1 - (krakenT - 12) / 6)); kraken.position.y = -24 + up * 22; kraken.children.forEach((c, i) => { c.rotation.z = Math.sin(t * .6 + i) * .18; });
        if (krakenT > 18) { krakenT = -1; kraken.visible = false; krakenNext = rr(35, 70); } }
    }
    // camera
    if (introFlight) { if (!reduceMotion) introFlight.t += dt; const I = introFlight; const a = I.a0 + I.t * .01; camera.position.set(I.c[0] + Math.sin(a) * I.r, I.y + Math.sin(I.t * .1) * 3, I.c[2] + Math.cos(a) * I.r); controls.target.set(...I.c); }
    else if (flight) stepFlight(dt);
    else if (dawnPush) { dawnPush.t = Math.min(1, dawnPush.t + dt / 7); camera.position.lerpVectors(dawnPush.from, dawnPush.to, ease(dawnPush.t)); controls.target.copy(dawnPush.c); }
    else if (idleOrbit && !reduceMotion) { const o = idleOrbit; o.a += dt; const off = tmpOff.copy(o.base).sub(o.c); off.applyAxisAngle(UP, Math.sin(o.a * .05) * .35); camera.position.copy(o.c).add(off); camera.position.y += Math.sin(o.a * .13) * 1.2; controls.target.copy(o.c); }
    controls.update();
    const gy = heightAt(camera.position.x, camera.position.z); if (camera.position.y < gy + 1) camera.position.y = gy + 1;
    controls.target.x = Math.max(-220, Math.min(220, controls.target.x)); controls.target.z = Math.max(-240, Math.min(240, controls.target.z));
    if (composer) composer.render(); else renderer.render(scene, camera);
    updateOverlay();
    // adapt quality if the first seconds run slow
    if (!adaptiveDone) { if (fpsRaw.length > 150) { adaptiveDone = true; const avg = fpsRaw.slice(30).reduce((a, b) => a + b, 0) / (fpsRaw.length - 30); if (avg > 1 / 28) { renderer.setPixelRatio(Math.max(.75, renderer.getPixelRatio() * .7)); if (composer && avg > 1 / 22) { bloomPass && bloomPass.dispose && bloomPass.dispose(); composer = null; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.32; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); } else if (composer) composer.setPixelRatio(renderer.getPixelRatio()); resize(); } } }
  }

  return {
    init, mountPins, setPinStates, heightAt, toWorld,
    flyToPlace(key, dur) { const v = viewFor(key); flyTo(v.pos, v.tgt, dur); currentKey = key; target.cut = key === "waterworks" ? 1 : 0; target.reveal = key === "shargons-talon" ? 1 : 0; },
    seatWithEmperor(dur = 3.2, n = 0) { currentKey = "emperor"; overlayDirty = true; target.cut = 0; target.reveal = 0; dawnPush = null;
      const [x, z] = toWorld(72, 776); const gy = heightAt(x, z); const top = hooks.emperorTop;
      const c = new THREE.Vector3(x, gy + top * .5, z);
      const look = { 1: [262, 700], 2: [208, 612], 4: [420, 968], 5: [262, 800], 6: [800, 300], 7: [476, 430], 8: [343, 330], 9: [1204, 1550] }[n];
      let a = -1.05, R = 88, hy = gy + 14;
      if (look) { const [lx, lz] = toWorld(...look); a = Math.atan2(lx - x, lz - z) + Math.PI + .62; R = n === 2 ? 70 : 84; hy = gy + 26; }
      if (n === 3) { hy = gy + 6; R = 80; }
      if (W < 700 && n !== "dawn") { c.y = gy + top * .82; R = 110; }
      if (n === "dawn") { a = .5; R = 96; hy = gy + 30; c.y = gy + top * .72; }
      const pos = new THREE.Vector3(x + Math.sin(a) * R, hy, z + Math.cos(a) * R);
      pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + 3);
      if (typeof n === "number" && NIGHT_STATES[n] && NIGHT_STATES[n].lightning > 0) nextBolt = 1.5;
      flyTo(pos, c, dur, () => { if (n === "dawn" && !reduceMotion) { dawnPush = { t: 0, c, from: pos.clone(), to: c.clone().add(pos.clone().sub(c).setLength(62)) }; } else idleOrbit = { c, base: pos.clone(), a: 0 }; });
    },
    overview(dur = 3) { currentKey = null; overlayDirty = true; target.cut = 0; target.reveal = 0; flyTo(new THREE.Vector3(-10, 190, 200), new THREE.Vector3(-4, 0, 8), dur); },
    startIntro() { const narrow = W < 700; introFlight = narrow ? { t: 0, a0: .05, r: 95, y: 34, c: [-60, 22, 30] } : { t: 0, a0: .77, r: 150, y: 36, c: [-30, 10, 10] }; nextBolt = 1.5; },
    stopIntro() { introFlight = null; },
    setNight(st) { cubeAt = performance.now() + 3800; const keep = { cut: target.cut, reveal: target.reveal }; target = { rain: st.rain ?? 0, lightning: st.lightning ?? 0, dawn: st.dawn ? 1 : 0, moon: st.moon ?? 0, calm: st.calm ? 1 : 0, titan: st.titan === "burning" ? 1 : 0, offerings: st.offerings ? 1 : 0, bonfires: st.bonfires ? 1 : 0, fog: st.fog ? 1 : 0, flood: st.flood ? 1 : 0, ...keep }; cur.titanBuilt = st.titanBuilt; },
    setPinFilter,
    setPanel(px, py = 0) { panelPx = px; panelPy = py; if (camera) applyOffset(); },
    showVision(i) {
      const [mx, my] = VISIONS[i]; const [x, z] = toWorld(mx, my); const y = heightAt(x, z);
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: U.time, uAge: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: GLSL_NOISE + `varying vec2 vUv; uniform float uTime,uAge; void main(){ float life = smoothstep(0.,1.5,uAge)*smoothstep(12.,8.,uAge);
          float b = vn(vec2(vUv.x*12., vUv.y*6.-uTime*1.5)); float bands = .5+.5*sin(vUv.y*60.-uTime*4.);
          gl_FragColor = vec4(mix(vec3(.4,.8,1.),vec3(1.,.85,.6),vUv.y)*b*bands*(1.-vUv.y)*life*.9,1.); }` });
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 9, 24, 1, true), m); col.position.set(x, y + 4.5, z); scene.add(col);
      visionCols.forEach(v => { scene.remove(v); v.geometry.dispose(); v.material.dispose(); }); visionCols = [col];
      let last = performance.now(); const tick = () => { const now = performance.now(); m.uniforms.uAge.value += Math.min(.1, (now - last) / 1000); last = now; if (m.uniforms.uAge.value < 12 && visionCols.includes(col)) requestAnimationFrame(tick); else if (visionCols.includes(col)) { scene.remove(col); col.geometry.dispose(); m.dispose(); visionCols = visionCols.filter(v => v !== col); } }; tick();
    },
    get ready() { return !!renderer; },
    tierStats() { return hooks.tierStats; },
    floatCheckReal(maxN = 400) { const rc = new THREE.Raycaster(), m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); const down = new THREE.Vector3(0, -1, 0);
      const idx = hooks.shackFloor.slice(); for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
      let n = 0, bad = 0, worst = 0, none = 0; const gaps = [];
      for (const i of idx.slice(0, maxN)) { hooks.shacks.getMatrixAt(i, m); m.decompose(p, q, sc); if (sc.x < .001) continue; n++;
        let gap = 1e9; for (const [ox, oz] of [[0, 0], [.4, .4], [-.4, .4], [.4, -.4], [-.4, -.4]]) { const dx = (ox * sc.x), dz = (oz * sc.z); rc.set(new THREE.Vector3(p.x + dx, p.y + 40, p.z + dz), down); rc.far = 80;
          const hs = rc.intersectObject(hooks.giantStone, false); const below = hs.filter(h => h.point.y <= p.y + 1); const g = !below.length ? 1e9 : Math.max(0, p.y - Math.max(...below.map(h => h.point.y))); gap = Math.min(gap, g); }
        if (gap > 1e8) { none++; continue; } gaps.push(gap); if (gap > .35) { bad++; worst = Math.max(worst, gap); } }
      gaps.sort((a, b) => a - b); return { checked: n, floating: bad, worst: +worst.toFixed(2), noStoneBelow: none, p95: +(gaps[Math.floor(gaps.length * .95)] || 0).toFixed(2) }; },
    probeScreen(px, py) { if (!DEBUG) return null; const r = renderer.domElement.getBoundingClientRect(); const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1), camera);
      return rc.intersectObjects(scene.children, true).slice(0, 3).map(h => { const o = h.object; return { t: o.type, c: o.material.color && o.material.color.getHexString(), y: +h.point.y.toFixed(2), d: +h.distance.toFixed(1) }; }); },
    coverage(x0, y0, x1, y1, st = 8) { if (!DEBUG) return null; let out = ""; for (let my = y0; my <= y1; my += st) { for (let mx = x0; mx <= x1; mx += st) {
        const land = sample(masks.land, mx, my), city = sample(masks.city, mx, my), stone = sample(masks.stone, mx, my), human = sample(masks.human, mx, my), road = sample(masks.road, mx, my), top = surfaceAt(mx, my);
        out += land < .75 ? "~" : excluded(mx, my) ? "x" : top > -50 ? "S" : human > .05 ? "h" : stone > .05 ? "s" : road > .25 ? "=" : city < .6 ? "," : "."; } out += "\n"; } return out; },
    pickScreen(px, py, noOcc) { if (!DEBUG) return null; const r = renderer.domElement.getBoundingClientRect(); const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1), camera); return pickAt(rc, noOcc); },
    stats() { let objs = 0, meshes = 0, pts = 0; scene.traverse(o => { objs++; if (o.isMesh) meshes++; if (o.isPoints) pts++; }); return { halls: hooks.halls, objs, meshes, pts, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: renderer.info.programs.length, geos: renderer.info.memory.geometries }; }
  };
})();
