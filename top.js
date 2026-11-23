"use strict";
// ---------- Oppefra: banen som et rigtigt 2D-spil ----------
// Banen tegnes af grafikkortet pixel for pixel: terrænets højder giver lys og skygge (som på et kort med relief),
// græssets højde giver farven (samme skala som spillet), striberne følger klipperetningen, og bunkere, vand og træer
// får skygger. Spillets egen maskine står ovenpå, set lige oppefra, og hælder med terrænet.

const TOP = { ok: false };
const SUN2 = [-0.62, -0.78];                 // solen står i nordvest (op til venstre på skærmen)
const SUN3 = (() => { const v = [-0.5, -0.63, 0.6]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
const EXAG = 3.6;                            // højderne overdrives lidt i lyset, så man kan fornemme dem på en lille skærm

// Græssets højde → tal 0..255 (logaritmisk 2–600 mm) og tilbage
const GLOG = Math.log(300);
const gEnc = (mm) => Math.max(0, Math.min(255, Math.round(Math.log(Math.max(2, mm) / 2) / GLOG * 255)));

// ---------- terræn til øvebanerne og til opgaver uden højder ----------
function vnoise(seed) {
  const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
// Højder (m), græshøjde (mm) og gamle striber til et kort, der ikke har dem fra spillet
function synthTerrain(map, practice) {
  const N = map.W * map.H, c = map.cell, n1 = vnoise(3.1 + (map.seed || 0)), n2 = vnoise(9.7 + (map.seed || 0));
  const hgt = new Float32Array(N), gmm = new Float32Array(N), lean = new Uint8Array(N), leanS = new Uint8Array(N);
  const amp = practice ? (map.kind === 0 ? 1.2 : map.kind === 1 ? 3.2 : 4.5) : 0;
  const DEF = { 0: 140, 1: 32, 2: 13, 3: 4.5, 4: 10, 5: 25, 6: 60, 7: 0 };
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
    const i = y * map.W + x, X = x * c, Y = y * c, v = map.cells[i], z = v & 7;
    hgt[i] = amp * (0.65 * n1(X / 38, Y / 38) + 0.35 * n2(X / 13, Y / 13) - 0.5);
    let mm = DEF[z] ?? 40;
    if (v & 8) mm = Math.max(mm * 1.7, mm + 4);                 // det, der skal klippes, har fået lov at gro
    gmm[i] = mm;
    // Banens gamle striber (det, der allerede er klippet): 6 m brede bånd frem og tilbage
    if (!(v & 8) && (z === 2 || z === 3 || z === 4 || z === 1)) {
      const band = Math.floor((z === 3 ? X + Y * 0.6 : Y) / (z === 3 ? 2.2 : 6));
      lean[i] = band % 2 ? 64 : 192; leanS[i] = z === 1 ? 90 : 170;
    }
  }
  // Bunkerne sænkes ned i terrænet
  if (amp > 0) for (let i = 0; i < N; i++) if (map.cells[i] & 16) hgt[i] -= 0.25;
  return { hgt, gmm, lean, leanS };
}

// ---------- lys: relief-skygge og fordybninger, regnet én gang pr. bane ----------
function bakeTerrain(map, T) {
  const W = map.W, H = map.H, c = map.cell, N = W * H;
  // Glat højderne lidt (cellerne er 0,5 m – lyset skal være blødt)
  const blur = (src, r) => {
    const tmp = new Float32Array(N), out = new Float32Array(N);
    for (let y = 0; y < H; y++) { let s = 0, n = 0; for (let x = -r; x < W + r; x++) {
      if (x + r < W) { s += src[y * W + Math.min(W - 1, x + r)]; n++; }
      if (x - r - 1 >= 0) { s -= src[y * W + x - r - 1]; n--; }
      if (x >= 0 && x < W) tmp[y * W + x] = s / Math.max(1, n); } }
    for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let y = -r; y < H + r; y++) {
      if (y + r < H) { s += tmp[Math.min(H - 1, y + r) * W + x]; n++; }
      if (y - r - 1 >= 0) { s -= tmp[(y - r - 1) * W + x]; n--; }
      if (y >= 0 && y < H) out[y * W + x] = s / Math.max(1, n); } }
    return out;
  };
  const hs = blur(T.hgt, 1), big = blur(T.hgt, Math.max(2, Math.round(4 / c)));
  let lo = 1e9, hi = -1e9; for (let i = 0; i < N; i++) { lo = Math.min(lo, hs[i]); hi = Math.max(hi, hs[i]); }
  T.hLo = lo; T.hHi = hi;
  const tex = new Uint8Array(N * 4);
  const flatL = SUN3[2];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const dx = (hs[y * W + Math.min(W - 1, x + 1)] - hs[y * W + Math.max(0, x - 1)]) / (2 * c) * EXAG;
    const dy = (hs[Math.min(H - 1, y + 1) * W + x] - hs[Math.max(0, y - 1) * W + x]) / (2 * c) * EXAG;
    const l = Math.hypot(dx, dy, 1), nx = -dx / l, ny = -dy / l, nz = 1 / l;
    const sh = Math.max(0.6, Math.min(1.35, (nx * SUN3[0] + ny * SUN3[1] + nz * SUN3[2]) / flatL));   // 1 = fladt
    const ao = 1 + Math.max(-0.35, Math.min(0.25, (hs[i] - big[i]) * 1.6));      // fordybninger er mørkere
    const hc = Math.min(65535, Math.round((hs[i] - lo) * 1000));                  // mm over det laveste punkt
    tex[i * 4] = Math.max(0, Math.min(255, Math.round(sh * 128)));
    tex[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(ao * 128)));
    tex[i * 4 + 2] = Math.min(255, hc >> 8); tex[i * 4 + 3] = hc & 255;
  }
  T.hsm = hs;
  return tex;
}
// Terrænets højde (m) og hældning et sted på banen (til maskinen og farten)
function terrainAt(x, y) {
  const T = M && M.terr; if (!T || !T.hsm) return { h: 0, gx: 0, gy: 0 };
  const m = M.map, c = m.cell, W = m.W, H = m.H;
  const fx = Math.max(0, Math.min(W - 1.001, x / c - 0.5)), fy = Math.max(0, Math.min(H - 1.001, y / c - 0.5));
  const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
  const g = (X, Y) => T.hsm[Math.min(H - 1, Y) * W + Math.min(W - 1, X)];
  const h00 = g(ix, iy), h10 = g(ix + 1, iy), h01 = g(ix, iy + 1), h11 = g(ix + 1, iy + 1);
  const h = h00 + (h10 - h00) * ax + (h01 - h00) * ay + (h00 - h10 - h01 + h11) * ax * ay;
  return { h, gx: ((h10 - h00) * (1 - ay) + (h11 - h01) * ay) / c, gy: ((h01 - h00) * (1 - ax) + (h11 - h10) * ax) / c };
}

// ---------- græsset: farve efter højde (skærmens farver, afstemt efter spillet) ----------
const GSTOP = [
  [3, [140, 172, 86]], [5, [130, 165, 80]], [8, [110, 150, 80]], [13, [104, 148, 66]], [20, [92, 134, 58]],
  [30, [80, 120, 50]], [45, [70, 106, 44]], [80, [58, 90, 38]], [150, [47, 75, 33]], [300, [42, 64, 31]], [600, [60, 70, 38]],
];

const TOP_VS = `
varying vec2 vP;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const TOP_FS = `
precision highp float;
uniform sampler2D terrT, grassT, maskT;
uniform vec2 WH, CN, CG; uniform float cellM, hocC, tz, hRange, contour, ppm, time;
uniform vec3 gs[11]; uniform float gm[11]; uniform vec4 guide; uniform float guideOn, roughMM;
varying vec2 vP;
float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { return 0.5 * n(p) + 0.3 * n(p * 2.03 + 7.1) + 0.2 * n(p * 4.01 + 3.7); }
// Tuer: små celler med en top i midten og mørke mellemrum (højt græs set oppefra)
float tuft(vec2 p) { vec2 i = floor(p), f = fract(p); float d = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = vec2(hh(i + g), hh(i + g + 17.3)); d = min(d, length(g + o - f)); }
  return d; }
vec3 gcol(float mm) {
  vec3 c = gs[0];
  for (int k = 1; k < 11; k++) { if (mm > gm[k - 1]) c = mix(gs[k - 1], gs[k], clamp(log(mm / gm[k - 1]) / log(gm[k] / gm[k - 1]), 0.0, 1.0)); }
  return c / 255.0;
}
vec4 tx(sampler2D t, vec2 c) { return texture2D(t, (c + 0.5) / CN); }
vec4 tg(vec2 c) { return texture2D(grassT, (c + 0.5) / CG); }
// Terrænet: lys, fordybning og højde – glat mellem cellerne
vec3 terr(vec2 cc) {
  vec2 p = cc - 0.5, i = floor(p), f = fract(p);
  vec4 a = tx(terrT, i), b = tx(terrT, i + vec2(1.0, 0.0)), c = tx(terrT, i + vec2(0.0, 1.0)), d = tx(terrT, i + vec2(1.0, 1.0));
  float ha = a.b * 65280.0 + a.a * 255.0, hb = b.b * 65280.0 + b.a * 255.0, hc = c.b * 65280.0 + c.a * 255.0, hd = d.b * 65280.0 + d.a * 255.0;
  vec4 m = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  return vec3(m.r * 2.0, m.g * 2.0, mix(mix(ha, hb, f.x), mix(hc, hd, f.x), f.y) / 1000.0);
}
// Bunker/vand/sti som et blødt felt (gennemsnit af fire forskudte opslag – så sandkanten ikke bliver takket)
float blk(vec4 v) { return step(15.5, mod(floor(v.a * 255.0 + 0.5), 32.0)); }
float blAt(vec2 c) { vec2 p = c - 0.5, i = floor(p), f = fract(p);
  return mix(mix(blk(tg(i)), blk(tg(i + vec2(1.0, 0.0))), f.x), mix(blk(tg(i + vec2(0.0, 1.0))), blk(tg(i + vec2(1.0, 1.0))), f.x), f.y); }
float blSoft(vec2 c) { return 0.25 * (blAt(c + vec2(-0.6, -0.2)) + blAt(c + vec2(0.6, 0.2)) + blAt(c + vec2(0.2, -0.6)) + blAt(c + vec2(-0.2, 0.6))); }
// Cellerne (græshøjde, gammel stribe, flag): den værdi, der dækker mest af de fire nærmeste – giver bløde, runde kanter
vec4 cellAt(vec2 cc, out float bl, out float edge) {
  vec2 p = cc - 0.5, i = floor(p), f = fract(p);
  vec4 v0 = tg(i), v1 = tg(i + vec2(1.0, 0.0)), v2 = tg(i + vec2(0.0, 1.0)), v3 = tg(i + vec2(1.0, 1.0));
  float w0 = (1.0 - f.x) * (1.0 - f.y), w1 = f.x * (1.0 - f.y), w2 = (1.0 - f.x) * f.y, w3 = f.x * f.y;
  // blokeret (bunker, vand, sti) som et glat felt
  float b0 = step(15.5, mod(floor(v0.a * 255.0 + 0.5), 32.0)), b1 = step(15.5, mod(floor(v1.a * 255.0 + 0.5), 32.0));
  float b2 = step(15.5, mod(floor(v2.a * 255.0 + 0.5), 32.0)), b3 = step(15.5, mod(floor(v3.a * 255.0 + 0.5), 32.0));
  bl = b0 * w0 + b1 * w1 + b2 * w2 + b3 * w3;
  float s0 = w0 + (v1.a == v0.a ? w1 : 0.0) + (v2.a == v0.a ? w2 : 0.0) + (v3.a == v0.a ? w3 : 0.0);
  float s1 = w1 + (v0.a == v1.a ? w0 : 0.0) + (v2.a == v1.a ? w2 : 0.0) + (v3.a == v1.a ? w3 : 0.0);
  float s2 = w2 + (v0.a == v2.a ? w0 : 0.0) + (v1.a == v2.a ? w1 : 0.0) + (v3.a == v2.a ? w3 : 0.0);
  float s3 = w3 + (v0.a == v3.a ? w0 : 0.0) + (v1.a == v3.a ? w1 : 0.0) + (v2.a == v3.a ? w2 : 0.0);
  vec4 r = v0; float s = s0;
  if (s1 > s) { r = v1; s = s1; } if (s2 > s) { r = v2; s = s2; } if (s3 > s) { r = v3; s = s3; }
  edge = s;
  // græshøjden glat inden for samme slags (så klippekanten ikke ses som firkanter)
  float gsum = 0.0, wsum = 0.0;
  if (v0.a == r.a) { gsum += v0.r * w0; wsum += w0; } if (v1.a == r.a) { gsum += v1.r * w1; wsum += w1; }
  if (v2.a == r.a) { gsum += v2.r * w2; wsum += w2; } if (v3.a == r.a) { gsum += v3.r * w3; wsum += w3; }
  r.r = gsum / max(wsum, 1e-4);
  return r;
}
void main() {
  vec2 wp = vP;
  float px = 1.0 / ppm;                                   // én skærmpixel i meter
  vec2 ins = min(wp, WH - wp); float inF = smoothstep(-12.0, 0.0, min(ins.x, ins.y));
  // Kanterne mellem zonerne bølger lidt, som en rigtig klippet kant
  vec2 wv = vec2(n(wp * 0.35) + 0.5 * n(wp * 1.1), n(wp * 0.35 + 17.3) + 0.5 * n(wp * 1.1 + 4.7)) - 0.75;
  vec2 cc = (wp + wv * 0.3) / cellM;
  bool outside = cc.x < 0.0 || cc.y < 0.0 || cc.x > CN.x || cc.y > CN.y;
  vec3 tr = terr(clamp(wp / cellM, vec2(0.5), CN - 0.5));
  float bl, edge;
  vec2 gc = clamp(cc * (CG / CN), vec2(0.5), CG - 0.5);
  vec4 ce = cellAt(gc, bl, edge);
  bl = blSoft(gc);
  float flags = floor(ce.a * 255.0 + 0.5);
  float zone = mod(flags, 8.0), need = mod(floor(flags / 8.0), 2.0), btype = mod(floor(flags / 32.0), 4.0);
  float mm = 2.0 * exp(ce.r * ${GLOG.toFixed(6)});
  vec2 leanD = vec2(cos(ce.g * 6.2831853), sin(ce.g * 6.2831853)); float leanS = ce.b;
  if (outside) {
    // uden for kortet: kanten af kortet fortsætter og glider over i almindelig rough – ingen synlig firkant
    float dOut = max(max(-wp.x, wp.x - WH.x), max(-wp.y, wp.y - WH.y));
    float o = smoothstep(0.0, 18.0, dOut);
    mm = mix(mm, roughMM, o); leanS *= 1.0 - o; bl *= 1.0 - smoothstep(0.0, 2.0, dOut); need = 0.0;
    if (o > 0.5) zone = 0.0;
  }
  if (zone < 0.5 && mm > 60.0) mm *= 0.7 + 0.8 * n(wp / 6.0);        // roughen: tuer i mange højder – samme inden for og uden for kortet
  // Klippet her af dig?
  float cut = 0.0; vec2 cdir = vec2(1.0, 0.0);
  if (!outside && abs(zone - tz) < 0.5 && bl < 0.5) {
    vec4 mk = texture2D(maskT, vec2(wp.x / WH.x, 1.0 - wp.y / WH.y));
    cut = smoothstep(0.15, 0.6, mk.a);
    if (mk.a > 0.01) cdir = normalize(mk.rg * 2.0 - 1.0 + vec2(1e-4));
  }
  if (cut > 0.0) mm = mix(mm, hocC, cut);
  // ---- græsset ----
  vec3 col = gcol(mm);
  float fadeF = clamp(ppm / 60.0, 0.0, 1.0);             // fine detaljer kun, når man er tæt på
  float tall = smoothstep(35.0, 140.0, mm);
  // fint korn (kort græs) og tuer (højt græs)
  float grain = n(wp * 38.0) * 0.6 + n(wp * 91.0) * 0.4;
  col *= mix(1.0, 0.9 + 0.2 * grain, mix(0.5, 1.0, fadeF) * (1.0 - tall));
  float tf = tuft(wp * mix(2.6, 1.6, smoothstep(150.0, 450.0, mm)) + 0.6 * vec2(n(wp * 1.7), n(wp * 1.7 + 9.0)));
  float tufty = smoothstep(0.1, 0.9, tf);
  // højt græs: strå, der ligger hver sin vej i hver tue
  vec2 ti = floor(wp * 2.6); float ta = hh(ti) * 6.2831853; vec2 td = vec2(cos(ta), sin(ta));
  float blade = n(vec2(dot(wp, td) * 5.0, dot(wp, vec2(-td.y, td.x)) * 70.0));
  float texA = mix(0.45, 1.0, fadeF);                     // langt væk: roligere (det ser uroligt ud, når tuerne bliver til støj)
  col *= mix(1.0, mix(1.0, (1.12 - 0.3 * tufty) * (0.82 + 0.36 * blade), texA), tall);
  col += tall * fadeF * smoothstep(320.0, 560.0, mm) * (1.0 - tufty) * step(0.93, hh(floor(wp * 12.0))) * vec3(0.10, 0.09, 0.05);   // enkelte frøstande
  col *= 0.92 + 0.16 * fbm(wp * 0.18);                    // store, rolige pletter
  // gamle striber og dine egne
  float st = dot(leanD, vec2(${SUN2[0]}, ${SUN2[1]})) * leanS * 0.17 * (1.0 - tall);
  float cs = dot(cdir, vec2(${SUN2[0]}, ${SUN2[1]}));
  st = mix(st, cs * 0.2 * (1.0 - smoothstep(30.0, 60.0, hocC)), cut);
  col *= 1.0 + st;
  // klippet græs: fine linjer i klipperetningen (bladene ligger ned den vej)
  vec2 ld = normalize(mix(leanD, cdir, cut) + 1e-4);
  float lines = n(vec2(dot(wp, ld) * 3.0, dot(wp, vec2(-ld.y, ld.x)) * 55.0));
  col *= 1.0 + (lines - 0.5) * 0.16 * fadeF * (1.0 - tall) * max(cut, leanS);
  // kanten til det uklippede (lidt skygge fra det høje græs ved siden af)
  col *= 1.0 - 0.12 * cut * (1.0 - smoothstep(0.6, 0.98, texture2D(maskT, vec2(wp.x / WH.x, 1.0 - wp.y / WH.y)).a)) * (1.0 - tall);
  // ---- bunker, vand, sti ----
  if (bl > 0.02) {
    vec3 bc;
    if (btype > 0.5 && btype < 1.5) {
      float dep = smoothstep(0.5, 1.0, bl);
      bc = mix(vec3(0.24, 0.36, 0.36), vec3(0.10, 0.22, 0.30), dep);
      bc += vec3(0.05) * n(wp * vec2(0.6, 3.0) + time * 0.3) * dep;     // små krusninger
    } else if (btype > 1.5 && btype < 2.5) {
      bc = vec3(0.62, 0.58, 0.50) * (0.92 + 0.1 * n(wp * 20.0));
    } else if (btype > 2.5) {
      bc = vec3(0.30, 0.20, 0.13) * (0.85 + 0.3 * n(wp * 6.0));            // bed med flis
    } else {
      bc = vec3(0.86, 0.78, 0.58) * (0.93 + 0.08 * n(wp * 30.0)) * (0.97 + 0.04 * sin(dot(wp, vec2(0.7, 0.7)) * 22.0));  // sand med rivespor
    }
    // læbe: den side, der vender væk fra solen, ligger i skygge
    float gx = dFdx(bl) / max(px, 1e-4), gy = dFdy(bl) / max(px, 1e-4);
    vec2 g = vec2(gx, -gy);
    float lip = clamp(dot(normalize(g + 1e-5), vec2(${SUN2[0]}, ${-SUN2[1]})), -1.0, 1.0) * smoothstep(0.0, 1.2, length(g));
    bc *= 1.0 - 0.2 * max(0.0, -lip) * (1.0 - smoothstep(0.5, 0.95, bl)) * inF;
    col = mix(col * (1.0 - 0.18 * smoothstep(0.0, 0.5, bl) * inF), bc, smoothstep(0.42, 0.58, bl));
  }
  // ---- terrænets lys og skygge ----
  // uden for kortet kendes terrænet ikke: lyset glider ud til fladt
  float shade = mix(1.0, tr.x, 0.95 * inF), ao = mix(1.0, tr.y, inF);
  col *= shade * mix(1.0, ao, 0.9);
  float hn = hRange > 0.05 ? tr.z / hRange : 0.5;
  col *= 0.94 + 0.12 * hn;                                // højt liggende lidt lysere, lavninger lidt mørkere
  // højdekurver (25 cm og 1 m)
  if (contour > 0.0 && !outside) {
    float z = tr.z / 0.25, fw = max(fwidth(z), 1e-4);
    float ln = 1.0 - smoothstep(0.0, fw * 1.2, abs(fract(z + 0.5) - 0.5));
    float z4 = tr.z, fw4 = max(fwidth(z4), 1e-4);
    float ln4 = 1.0 - smoothstep(0.0, fw4 * 1.6, abs(fract(z4 + 0.5) - 0.5));
    col *= 1.0 - contour * (0.09 * ln + 0.16 * ln4);
  }
  // hjælpelinjen til næste træk: en stiplet, lys streg
  if (guideOn > 0.0) {
    vec2 a = guide.xy, b = guide.zw, ab = b - a; float L = max(length(ab), 1e-3);
    float t = clamp(dot(wp - a, ab) / (L * L), -0.15, 1.15), dl = length(wp - (a + ab * t));
    float dash = step(0.5, fract(t * L / 1.6));
    float lw = max(0.06, 1.6 * px);
    col = mix(col, vec3(1.0, 0.98, 0.85), guideOn * 0.55 * dash * (1.0 - smoothstep(lw, lw + 1.5 * px, dl)));
  }
  // vignet
  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0)), 1.0);
}`;

// Trækroner set oppefra (lyset oppe fra venstre) – tre slags med hver sin karakter:
// løvtræ (eg/bøg: tunge, klumpede kroner), nåletræ (gran: en stjerne af grene om toppen) og birk (let og luftig).
// Hver krone får sin egen skygge med samme form.
function canopyTex(kind, seed) {
  const S = 256, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const g = cv.getContext("2d"), R = (k) => { const s = Math.sin(seed * 91.7 + k * 12.9) * 43758.5; return s - Math.floor(s); };
  const L = (-0.62), Ly = (-0.78);   // solen
  const blob = (x, y, r, hue, sat, lum, alpha = 1) => {
    const gr = g.createRadialGradient(x + L * r * 0.45, y + Ly * r * 0.45, r * 0.05, x, y, r);
    gr.addColorStop(0, `hsla(${hue},${sat}%,${lum + 9}%,${alpha})`);
    gr.addColorStop(0.55, `hsla(${hue},${sat}%,${lum}%,${alpha})`);
    gr.addColorStop(0.9, `hsla(${hue},${sat + 2}%,${lum - 4}%,${alpha * 0.9})`);
    gr.addColorStop(1, `hsla(${hue},${sat}%,${lum - 6}%,0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
  };
  const C = S / 2;
  if (kind === 1) {
    // gran: mørk kerne og grene som spidse stråler, lysest mod solen
    const hue = 140 + R(1) * 14, n = 26 + Math.floor(R(2) * 10);
    blob(C, C, S * 0.3, hue, 30, 14);
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.283 + R(k + 3) * 0.3, len = S * (0.34 + R(k + 5) * 0.12), lit = Math.cos(a) * L + Math.sin(a) * Ly;
      g.strokeStyle = `hsl(${hue},${32 + lit * 6}%,${17 + lit * 9 + R(k) * 4}%)`; g.lineWidth = S * 0.05; g.lineCap = "round";
      g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * len, C + Math.sin(a) * len); g.stroke();
      for (let t = 0.35; t < 1; t += 0.16) {   // sidegrene
        const px = C + Math.cos(a) * len * t, py = C + Math.sin(a) * len * t, sl = len * 0.22 * (1 - t);
        g.lineWidth = S * 0.018;
        for (const sd of [-1, 1]) { const b = a + sd * 0.9; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(b) * sl, py + Math.sin(b) * sl); g.stroke(); }
      }
    }
    blob(C + L * 6, C + Ly * 6, S * 0.07, hue, 25, 30);   // toppen
  } else if (kind === 2) {
    // birk: lys gulgrøn, luftig – mange små klatter med huller imellem
    const hue = 78 + R(1) * 14;
    for (let k = 0; k < 70; k++) {
      const a = R(k + 2) * 6.283, r = Math.sqrt(R(k + 9)) * S * 0.36;
      blob(C + Math.cos(a) * r, C + Math.sin(a) * r, S * (0.05 + R(k + 4) * 0.05), hue, 38, 36 + R(k) * 8, 0.92);
    }
    g.strokeStyle = "rgba(235,230,215,0.28)"; g.lineWidth = 2;
    for (let k = 0; k < 5; k++) { const a = R(k + 30) * 6.283; g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * S * 0.25, C + Math.sin(a) * S * 0.25); g.stroke(); }
  } else {
    // løvtræ: tunge klumper i tre lag – mørke huller nederst, lyse toppe mod solen
    const hue = 92 + R(1) * 30, sat = 34 + R(2) * 12;
    const lumps = 7 + Math.floor(R(3) * 5);
    for (let k = 0; k < lumps; k++) {
      const a = k / lumps * 6.283 + R(k + 4), r = S * (0.18 + R(k + 6) * 0.12);
      blob(C + Math.cos(a) * r, C + Math.sin(a) * r, S * (0.17 + R(k + 8) * 0.06), hue, sat, 20);
    }
    blob(C, C, S * 0.26, hue, sat, 22);
    for (let k = 0; k < 40; k++) {   // lysere bladklynger ovenpå
      const a = R(k + 20) * 6.283, r = Math.sqrt(R(k + 40)) * S * 0.33;
      blob(C + Math.cos(a) * r + L * 6, C + Math.sin(a) * r + Ly * 6, S * (0.04 + R(k + 60) * 0.05), hue + 4, sat, 28 + R(k) * 8);
    }
  }
  // løv: fin prik-struktur
  const id = g.getImageData(0, 0, S, S), d = id.data;
  for (let k = 0; k < S * S; k++) { const f = 0.84 + 0.32 * R(k * 0.37 + 5); d[k * 4] *= f; d[k * 4 + 1] *= f; d[k * 4 + 2] *= f; }
  g.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // skyggen: kronens form, sløret og mørk
  const sc = document.createElement("canvas"); sc.width = sc.height = 128;
  const sg = sc.getContext("2d"); sg.filter = "blur(5px)"; sg.drawImage(cv, 8, 8, 112, 112);
  sg.filter = "none"; sg.globalCompositeOperation = "source-in"; sg.fillStyle = "rgba(8,18,6,0.62)"; sg.fillRect(0, 0, 128, 128);
  const sh = new THREE.CanvasTexture(sc);
  return { tex, sh, kind };
}
function shadowTex() {
  const S = 64, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const g = cv.getContext("2d"), gr = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  gr.addColorStop(0, "rgba(10,20,8,0.55)"); gr.addColorStop(0.6, "rgba(10,20,8,0.4)"); gr.addColorStop(1, "rgba(10,20,8,0)");
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}

function buildTop() {
  if (!G3) return false;
  const m = M.map, Wm = m.W * m.cell, Hm = m.H * m.cell;
  if (!TOP.scene) {
    TOP.scene = new THREE.Scene();
    TOP.scene.background = new THREE.Color(0x24341f);
    TOP.cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 500);
    TOP.cam.up.set(0, 0, -1);
    TOP.scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x6a7a50, 1.5));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.6); sun.position.set(SUN3[0] * 100, 120, SUN3[1] * 100); TOP.scene.add(sun);
    TOP.shTex = shadowTex();
    TOP.canopy = [canopyTex(0, 1), canopyTex(0, 2), canopyTex(0, 3), canopyTex(1, 4), canopyTex(1, 5), canopyTex(2, 6), canopyTex(0, 7)];
    TOP.objs = [];
  }
  for (const o of TOP.objs) TOP.scene.remove(o);
  TOP.objs = [];
  const add = (o) => { TOP.scene.add(o); TOP.objs.push(o); return o; };
  // Data til grafikkortet
  const T = M.terr, N = m.W * m.H;
  const tt = bakeTerrain(m, T);
  // Cellerne (0,5 m) forfines 4 gange: hver lille celle får den slags, der dækker mest i en blød cirkel omkring den.
  // Så bliver kanterne mellem green, forkrave, fairway og rough runde kurver i stedet for trapper.
  const U = 4, GW = m.W * U, GH = m.H * U, gt = new Uint8Array(GW * GH * 4);
  const code = new Uint8Array(N); for (let i = 0; i < N; i++) code[i] = gEnc(T.gmm[i]);
  const keyv = new Int32Array(49), keyw = new Float32Array(49);
  for (let fy = 0; fy < GH; fy++) for (let fx = 0; fx < GW; fx++) {
    const px = (fx + 0.5) / U, py = (fy + 0.5) / U, cx = Math.floor(px), cy = Math.floor(py);
    let nk = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const X = Math.min(m.W - 1, Math.max(0, cx + dx)), Y = Math.min(m.H - 1, Math.max(0, cy + dy));
      const ddx = cx + dx + 0.5 - px, ddy = cy + dy + 0.5 - py, w = Math.exp(-(ddx * ddx + ddy * ddy) / 4.5);
      const v = m.cells[Y * m.W + X] & 0x7f;
      let k = 0; while (k < nk && keyv[k] !== v) k++;
      if (k === nk) { keyv[nk] = v; keyw[nk] = 0; nk++; }
      keyw[k] += w;
    }
    let best = 0; for (let k = 1; k < nk; k++) if (keyw[k] > keyw[best]) best = k;
    const v = keyv[best];
    // den nærmeste celle af den slags giver græshøjde og gamle striber
    let src = Math.min(m.H - 1, cy) * m.W + Math.min(m.W - 1, cx);
    if ((m.cells[src] & 0x7f) !== v) {
      let bd = 9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = Math.min(m.W - 1, Math.max(0, cx + dx)), Y = Math.min(m.H - 1, Math.max(0, cy + dy)), j = Y * m.W + X;
        if ((m.cells[j] & 0x7f) !== v) continue;
        const d = (X + 0.5 - px) ** 2 + (Y + 0.5 - py) ** 2; if (d < bd) { bd = d; src = j; }
      }
    }
    const o = (fy * GW + fx) * 4;
    gt[o] = code[src]; gt[o + 1] = T.lean[src]; gt[o + 2] = T.leanS[src]; gt[o + 3] = v;
  }
  const dtex = (a, w, h, lin) => { const t = new THREE.DataTexture(a, w, h, THREE.RGBAFormat, THREE.UnsignedByteType); t.magFilter = t.minFilter = THREE.NearestFilter; t.flipY = false; t.needsUpdate = true; return t; };
  if (TOP.terrT) { TOP.terrT.dispose(); TOP.grassT.dispose(); }
  TOP.terrT = dtex(tt, m.W, m.H); TOP.grassT = dtex(gt, GW, GH);
  const gs = GSTOP.map((s) => new THREE.Vector3(...s[1])), gm = GSTOP.map((s) => s[0]);
  // roughen uden for kortet: samme højde som roughen på kortet (medianen), så der ikke ses en firkant
  const rs = []; for (let i = 0; i < N; i += 7) if ((m.cells[i] & 7) === 0 && !(m.cells[i] & 16)) rs.push(T.gmm[i]);
  rs.sort((a, b) => a - b); const roughMed = rs.length ? rs[rs.length >> 1] : 140;
  TOP.uni = {
    terrT: { value: TOP.terrT }, grassT: { value: TOP.grassT }, maskT: { value: G3.maskT },
    WH: { value: new THREE.Vector2(Wm, Hm) }, CN: { value: new THREE.Vector2(m.W, m.H) }, CG: { value: new THREE.Vector2(GW, GH) }, cellM: { value: m.cell },
    hocC: { value: m.hoc || (m.kind === 0 ? 4 : m.kind === 1 ? 13 : 45) }, tz: { value: m.zone }, hRange: { value: Math.max(0.01, T.hHi - T.hLo) },
    contour: { value: store.get("contour", 1) * 0.6 }, roughMM: { value: roughMed }, guide: { value: new THREE.Vector4() }, guideOn: { value: 0 }, ppm: { value: 20 }, time: { value: 0 }, gs: { value: gs }, gm: { value: gm },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: TOP.uni, vertexShader: TOP_VS, fragmentShader: TOP_FS, extensions: { derivatives: true } });
  const pad = 220;                                          // jorden fortsætter langt ud, så der aldrig ses en flad kant
  const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(Wm + pad * 2, Hm + pad * 2), mat));
  ground.rotation.x = -Math.PI / 2; ground.position.set(Wm / 2, 0, Hm / 2);
  // Træer: rundt om banen og i den høje rough langt fra det, der klippes
  const trees = [];
  const n1 = vnoise(5.5);
  const farFromPlay = (x, y, r) => {
    const cx = Math.floor(x / m.cell), cy = Math.floor(y / m.cell), R = Math.ceil(r / m.cell);
    for (let yy = cy - R; yy <= cy + R; yy += 2) for (let xx = cx - R; xx <= cx + R; xx += 2) {
      if (xx < 0 || yy < 0 || xx >= m.W || yy >= m.H) continue;
      const v = m.cells[yy * m.W + xx]; if ((v & 7) !== 0 || (v & 8) || (v & 16)) return false;
    }
    return true;
  };
  const tp = 120;
  for (let k = 0; k < 4000 && trees.length < 520; k++) {
    const x = -tp + Math.random() * (Wm + tp * 2), y = -tp + Math.random() * (Hm + tp * 2);
    const inside = x > 0 && y > 0 && x < Wm && y < Hm;
    const dOut = Math.max(-x, x - Wm, -y, y - Hm, 0);
    // træerne står i grupper – og tættere og tættere ude i skoven omkring banen
    if (n1(x / 40, y / 40) < 0.5 - Math.min(0.35, dOut / 120)) continue;
    const r = 2.4 + Math.random() * 3.8;
    if (inside ? !farFromPlay(x, y, r + 6) : (x > -6 && y > -6 && x < Wm + 6 && y < Hm + 6)) continue;
    trees.push([x, y, r]);
  }
  const tg = new THREE.PlaneGeometry(1, 1); tg.rotateX(-Math.PI / 2);
  // samme materiale deles af alle træer af en slags (billigere at tegne)
  if (!TOP.cmat) TOP.cmat = TOP.canopy.map((c) => [new THREE.MeshBasicMaterial({ map: c.sh, transparent: true, depthWrite: false }), new THREE.MeshBasicMaterial({ map: c.tex, transparent: true, depthWrite: false })]);
  trees.sort((a, b) => a[2] - b[2]);
  for (const [x, y, r] of trees) {
    const v = Math.floor(Math.random() * TOP.canopy.length), conif = TOP.canopy[v].kind === 1, rr = conif ? r * 0.8 : r;
    const sh = add(new THREE.Mesh(tg, TOP.cmat[v][0]));
    sh.position.set(x - SUN2[0] * rr * 1.1, 0.05, y - SUN2[1] * rr * 1.1); sh.scale.set(rr * 2.5, 1, rr * 2.5); sh.renderOrder = 2;
    const cn = add(new THREE.Mesh(tg, TOP.cmat[v][1]));
    cn.position.set(x, 8 + rr, y); cn.scale.set(rr * 2.3, 1, rr * 2.3); cn.renderOrder = 5;
  }
  // Maskinens skygge (blød, forskudt væk fra solen)
  TOP.msh = add(new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ map: TOP.shTex, transparent: true, depthWrite: false, opacity: 0.85 })));
  TOP.msh.renderOrder = 3;
  TOP.ppm = store.get("ppm" + m.kind, m.kind === 0 ? 40 : m.kind === 1 ? 18 : 12);
  TOP.cx = M.x; TOP.cy = M.y;
  TOP.ok = true;
  return true;
}
function useTop() { return camMode === 0 && TOP.ok && !!G3 && !G3bad; }
function zoomTop(f) { TOP.ppm = Math.max(4, Math.min(120, TOP.ppm * f)); store.set("ppm" + M.map.kind, TOP.ppm); }

function drawTop() {
  const G = G3, dt = G.dtLast || 0.016;
  if (G.mower.parent !== TOP.scene) TOP.scene.add(G.mower);
  // Maskinen: på banen, drejet og hældende med terrænet
  const tr = terrainAt(M.x, M.y);
  G.mower.position.set(M.x, 1.5, M.y);
  G.mower.rotation.set(0, 0, 0);
  const tilt = new THREE.Euler(Math.atan(tr.gy * 0.9), -M.h, -Math.atan(tr.gx * 0.9), "XYZ");
  G.mower.quaternion.setFromEuler(new THREE.Euler(0, -M.h, 0));
  const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan(tr.gy), 0, -Math.atan(tr.gx)));
  G.mower.quaternion.premultiply(tq);
  void tilt;
  if (G.spin && G.spin.length) {
    G.spinA += M.v * dt;
    const q = new THREE.Quaternion();
    for (const s of G.spin) { q.setFromAxisAngle(s.axis, -G.spinA * s.k); s.b.quaternion.copy(q).multiply(s.q0); }
  }
  const w = M.mw.w, L = Math.max(1.4, w * 0.9 + 1);
  TOP.msh.position.set(M.x - SUN2[0] * 0.7 - Math.cos(M.h) * L * 0.25, 0.06, M.y - SUN2[1] * 0.7 - Math.sin(M.h) * L * 0.25);
  TOP.msh.rotation.y = -M.h; TOP.msh.scale.set(L * 1.5, 1, w * 1.25);
  // Kameraet følger maskinen blødt og kigger lidt frem, hvor den kører
  const lead = Math.min(6, Math.abs(M.v) * 1.4);
  const tx = M.x + Math.cos(M.h) * lead * Math.sign(M.v || 1), ty = M.y + Math.sin(M.h) * lead * Math.sign(M.v || 1);
  const k = 1 - Math.exp(-3.2 * dt);
  TOP.cx += (tx - TOP.cx) * k; TOP.cy += (ty - TOP.cy) * k;
  const W = innerWidth, H = innerHeight, ppm = TOP.ppm;
  const c = TOP.cam; c.left = -W / 2 / ppm; c.right = W / 2 / ppm; c.top = H / 2 / ppm; c.bottom = -H / 2 / ppm;
  c.position.set(TOP.cx, 200, TOP.cy); c.lookAt(TOP.cx, 0, TOP.cy); c.updateProjectionMatrix();
  // Klippesporet til grafikkortet
  const now = performance.now();
  if (M.maskDirty && now - M.maskAt > 60) { G.maskT.needsUpdate = true; M.maskDirty = false; M.maskAt = now; }
  TOP.uni.ppm.value = ppm * Math.min(2, devicePixelRatio || 1);
  TOP.uni.time.value = now / 1000;
  if (M.guide) { TOP.uni.guide.value.set(...M.guide); TOP.uni.guideOn.value = Math.min(1, TOP.uni.guideOn.value + dt * 2); } else TOP.uni.guideOn.value = 0;
  // lige-striber i info-linjen
  const lg = lineGrade();
  if (lg !== null && lg !== TOP.lastGrade) { TOP.lastGrade = lg; const el = document.getElementById("lineq"); if (el) el.textContent = `Lige striber: ${lg} %`; }
  clipStepTop(dt);
  G.r.render(TOP.scene, c);
}

// Afklip set oppefra: små grønne stumper, der kastes frem og lægger sig
const TCLIP_N = 1600;
function clipInitTop() {
  if (TOP.clip) { TOP.scene.add(TOP.clip.pts); return; }
  const g = new THREE.BufferGeometry();
  const P = new Float32Array(TCLIP_N * 3).fill(-1000), C = new Float32Array(TCLIP_N * 3);
  g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("color", new THREE.BufferAttribute(C, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true }));
  pts.frustumCulled = false; pts.renderOrder = 4;
  TOP.clip = { pts, P, C, V: new Float32Array(TCLIP_N * 3), life: new Float32Array(TCLIP_N), next: 0, acc: 0 };
  TOP.scene.add(pts);
}
function clipSpawnTop(nCells) {
  const K = TOP.clip; if (!K) return;
  K.acc += nCells * 0.8;
  const fx = Math.cos(M.h), fz = Math.sin(M.h), sx = -fz, sz = fx, w = M.mw.w, v = Math.max(0.3, Math.abs(M.v));
  while (K.acc >= 1) {
    K.acc -= 1;
    const i = K.next; K.next = (K.next + 1) % TCLIP_N;
    const o = (Math.random() - 0.5) * w;
    K.P[i * 3] = M.x + fx * 0.3 + sx * o; K.P[i * 3 + 1] = 0.4; K.P[i * 3 + 2] = M.y + fz * 0.3 + sz * o;
    const fw = v * (0.5 + Math.random());
    K.V[i * 3] = fx * fw + (Math.random() - 0.5) * 1.2; K.V[i * 3 + 1] = 0; K.V[i * 3 + 2] = fz * fw + (Math.random() - 0.5) * 1.2;
    K.life[i] = 0.5 + Math.random() * 0.6;
    const g = 0.5 + Math.random() * 0.25;
    K.C[i * 3] = g * 0.62; K.C[i * 3 + 1] = g; K.C[i * 3 + 2] = g * 0.35;
  }
}
function clipStepTop(dt) {
  const K = TOP.clip; if (!K) return;
  for (let i = 0; i < TCLIP_N; i++) {
    if (K.life[i] <= 0) continue;
    K.life[i] -= dt;
    K.V[i * 3] *= 1 - 4 * dt; K.V[i * 3 + 2] *= 1 - 4 * dt;
    K.P[i * 3] += K.V[i * 3] * dt; K.P[i * 3 + 2] += K.V[i * 3 + 2] * dt;
    if (K.life[i] <= 0) K.P[i * 3 + 1] = -1000;
  }
  K.pts.geometry.attributes.position.needsUpdate = true; K.pts.geometry.attributes.color.needsUpdate = true;
}

// Knibe-zoom med to fingre på banen
(function pinch() {
  const el = document.getElementById("cv3"), ptr = new Map(); let d0 = 0, z0 = 0;
  el.addEventListener("pointerdown", (e) => { ptr.set(e.pointerId, [e.clientX, e.clientY]); if (ptr.size === 2) { const [a, b] = [...ptr.values()]; d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); z0 = TOP.ppm; } });
  el.addEventListener("pointermove", (e) => {
    if (!ptr.has(e.pointerId)) return; ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size === 2 && useTop() && d0 > 0) { const [a, b] = [...ptr.values()]; TOP.ppm = Math.max(4, Math.min(120, z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / d0)); }
  });
  const up = (e) => { ptr.delete(e.pointerId); if (ptr.size < 2) d0 = 0; if (M && M.map) store.set("ppm" + M.map.kind, TOP.ppm); };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", (e) => { if (useTop()) { e.preventDefault(); zoomTop(e.deltaY < 0 ? 1.12 : 1 / 1.12); } }, { passive: false });
})();
