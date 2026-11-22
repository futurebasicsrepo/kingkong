import * as THREE from 'three';

// Values every custom material reads; render.js keeps them up to date.
export const sharedUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() },
};

// Small noise library shared by all the procedural surfaces. The hashes use
// no trig, so every GPU draws the same pattern.
const NOISE = /* glsl */ `
  float h21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 h22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.2 * vnoise(p * 4.1 + 3.7);
  }
  // 1 inside the box lo..hi, antialiased by the pixel footprint fw.
  float aaBox(vec2 p, vec2 lo, vec2 hi, vec2 fw) {
    vec2 a = smoothstep(lo - fw, lo + fw, p) * (1.0 - smoothstep(hi - fw, hi + fw, p));
    return a.x * a.y;
  }
  // 1 for detail of the given size while it is bigger than a pixel, fading to 0 as it shrinks below one.
  float keep(float footprint) {
    return 1.0 - smoothstep(0.3, 0.75, footprint);
  }
`;

// ---------------------------------------------------------------------------
// Building facades
// ---------------------------------------------------------------------------
// Every building is one stretched box. The shader lays a whole facade over
// it from the box's own size: bays and floors, glazing with a hint of the
// rooms behind it, frames and sills, a shopfront at street level, a parapet
// at the top, and weathering. Windows are mirror glass lit by the sky
// environment; walls are rough masonry.
//
// bay: [bay width, floor height]   win: window rectangle inside a bay (x0, x1, y0, y1)
const STYLES = {
  brick: { id: 0, bay: [3.3, 3.5], win: [0.26, 0.74, 0.22, 0.8], ground: 0.7, parapet: 1.1, edge: 0.5, depth: 5, glass: 0x4c5660, tilt: 0.02 },
  office: { id: 1, bay: [3.6, 3.9], win: [0.14, 0.86, 0.3, 0.9], ground: 5.2, parapet: 1.5, edge: 1.2, depth: 7, glass: 0x5c6a76, tilt: 0.025 },
  glass: { id: 2, bay: [3.2, 4.0], win: [0.03, 0.97, 0.27, 0.985], ground: 6.5, parapet: 1.2, edge: 0.25, depth: 9, glass: 0x8a9aa6, tilt: 0.035 },
  stone: { id: 3, bay: [5.2, 6.4], win: [0.32, 0.68, 0.16, 0.8], ground: 1.6, parapet: 2.2, edge: 1.6, depth: 5, glass: 0x3e464e, tilt: 0.012 },
  plain: { id: 4, bay: [1.3, 3.0], win: [0, 0, 0, 0], ground: 0, parapet: 0, edge: 0, depth: 1, glass: 0x000000, tilt: 0 },
};

const FACADE_VERTEX_PARS = /* glsl */ `
  varying vec3 vBLocal;
  varying vec3 vBView;
  flat varying vec3 vBNormal;
  flat varying vec3 vBSize;
  flat varying float vBSeed;
  flat varying vec3 vBTu;
  flat varying vec3 vBTv;
  flat varying float vBBase;
`;

const FACADE_VERTEX = /* glsl */ `
  #ifdef USE_INSTANCING
    mat4 bM = instanceMatrix;
  #else
    mat4 bM = mat4(1.0);
  #endif
  vec3 bScale = vec3(length(bM[0].xyz), length(bM[1].xyz), length(bM[2].xyz));
  vBLocal = position * bScale;
  vBNormal = normal;
  vBSize = bScale;
  vec3 bh = fract(vec3(bM[3].xzx) * 0.1031 + bScale.xzy * 0.071);
  bh += dot(bh, bh.yzx + 33.33);
  vBSeed = fract((bh.x + bh.y) * bh.z);
  // The view ray in the building's own frame, in metres: this is what lets
  // the rooms behind the glass shift as the camera moves.
  vec3 bCam = (inverse(modelMatrix * bM) * vec4(cameraPosition, 1.0)).xyz;
  vBView = (position - bCam) * bScale;
  vec3 bTu = abs(normal.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vBTu = normalize(normalMatrix * (mat3(bM) * bTu));
  vBTv = normalize(normalMatrix * (mat3(bM) * vec3(0.0, 1.0, 0.0)));
  vBBase = bM[3].y;
`;

const FACADE_FRAGMENT_PARS = /* glsl */ `
  varying vec3 vBLocal;
  varying vec3 vBView;
  flat varying vec3 vBNormal;
  flat varying vec3 vBSize;
  flat varying float vBSeed;
  flat varying vec3 vBTu;
  flat varying vec3 vBTv;
  flat varying float vBBase;
  uniform vec2 uBay;
  uniform vec4 uWin;
  uniform float uGround;
  uniform float uParapet;
  uniform float uEdge;
  uniform float uDepth;
  uniform float uTilt;
  uniform vec3 uGlassTint;
  ${NOISE}
`;

// Runs in place of <color_fragment>. Leaves the surface colour in
// diffuseColor and the rest of the surface description in the b* variables,
// which later hooks feed into the lighting.
const FACADE_FRAGMENT = /* glsl */ `
  #include <color_fragment>
  float bRough = 0.9;
  float bMetal = 0.0;
  float bGlass = 0.0;
  vec3 bEmit = vec3(0.0);
  vec2 bTilt = vec2(0.0);
  {
    vec3 an = abs(vBNormal);
    vec3 base = diffuseColor.rgb;
    float seed = vBSeed;
    float H = vBSize.y;
    float y = vBLocal.y;
    float lum = dot(base, vec3(0.3, 0.55, 0.15));

    #if STYLE == 4
      // Roof plant, gates, anything small and metal: ribbed panels.
      float ribU = (an.x > 0.5 ? vBLocal.z : vBLocal.x) / 0.42;
      float ribK = keep(fwidth(ribU)) * step(an.y, 0.5);
      vec3 col = base * mix(1.0, 0.72 + 0.28 * smoothstep(0.0, 0.5, fract(ribU)), ribK);
      col *= 0.86 + 0.22 * vnoise(vBLocal.xy * 0.9 + vBLocal.zz * 0.7 + seed * 31.0);
      col *= mix(0.72, 1.0, smoothstep(0.0, 1.2, y));
      diffuseColor.rgb = col;
      bRough = 0.6;
      bMetal = 0.35;
    #else
    if (an.y < 0.5) {
      bool xFace = an.x > 0.5;
      float width = xFace ? vBSize.z : vBSize.x;
      float u = xFace ? vBLocal.z : vBLocal.x;
      float faceId = xFace ? (vBNormal.x > 0.0 ? 1.0 : 2.0) : (vBNormal.z > 0.0 ? 3.0 : 4.0);
      vec3 rd = normalize(vBView);
      float rdu = xFace ? rd.z : rd.x;
      float rdin = max(1e-3, -(xFace ? rd.x * sign(vBNormal.x) : rd.z * sign(vBNormal.z)));

      // Thin slabs (cornices, setbacks, parapet walls) carry no windows.
      float thin = step(H, uBay.y * 1.3);
      // Setbacks start above the street, so they have no shopfront or base course.
      float street = step(vBBase, 0.5);
      float ground = uGround * street;
      float bays = max(1.0, floor((width - 2.0 * uEdge) / uBay.x));
      float bayW = (width - 2.0 * uEdge) / bays;
      float ub = (u + width * 0.5 - uEdge) / bayW;
      float floorsN = max(1.0, floor((H - ground - uParapet) / uBay.y));
      float flH = (H - ground - uParapet) / floorsN;
      float fy = (y - ground) / flH;
      vec2 cell = vec2(floor(ub), floor(fy));
      vec2 f = vec2(fract(ub), fract(fy));
      vec2 fw = vec2(fwidth(ub), fwidth(fy));
      float fwMax = max(fw.x, fw.y);
      float detail = keep(fwMax);
      float inGrid = step(0.0, ub) * step(ub, bays) * step(0.0, fy) * step(fy, floorsN) * (1.0 - thin);
      float atGround = step(y, ground) * (1.0 - thin) * street;
      float roomId = h21(cell + faceId * 17.0 + seed * 91.0);
      float roomId2 = h21(cell * 1.7 + faceId * 5.0 + seed * 37.0);

      // ---- wall ---------------------------------------------------------
      vec3 wall = base;
      float wallRough = 0.92;
      #if STYLE == 0
        // Brick in running bond, unless the house has been painted or stuccoed.
        float painted = smoothstep(0.34, 0.42, lum);
        base = mix(base, mix(vec3(lum), base, 0.78) * 0.86, 1.0 - painted);
        vec2 bc = vec2(u / 0.56, y / 0.19);
        bc.x += 0.5 * mod(floor(bc.y), 2.0);
        vec2 bf = fract(bc);
        float bk = keep(max(fwidth(bc.x), fwidth(bc.y)) * 1.4) * (1.0 - painted);
        float mortar = max(1.0 - smoothstep(0.05, 0.11, bf.x), 1.0 - smoothstep(0.1, 0.2, bf.y));
        vec3 brick = base * (0.82 + 0.36 * h21(floor(bc) + seed * 7.0));
        brick = mix(brick, brick * vec3(0.7, 0.62, 0.6), step(0.9, h21(floor(bc) * 1.3 + 3.0)));
        vec3 mortarCol = mix(base, vec3(0.44, 0.42, 0.39), 0.55);
        wall = mix(base, mix(brick, mortarCol, mortar), bk);
      #elif STYLE == 1
        // Limestone or concrete: piers between the bays, a spandrel under each window.
        float pier = 1.0 - aaBox(vec2(f.x, 0.5), vec2(0.07, 0.0), vec2(0.93, 1.0), vec2(fw.x, 0.01));
        float span = (1.0 - smoothstep(uWin.z - 0.02, uWin.z, f.y)) * (1.0 - pier);
        float panel = aaBox(f, vec2(0.2, 0.06), vec2(0.8, uWin.z - 0.07), fw) * inGrid;
        wall = base * mix(1.0, 1.07, pier * inGrid);
        wall = mix(wall, base * 0.86, span * inGrid * detail);
        wall = mix(wall, base * 0.74, panel * detail);
        vec2 jc = vec2(u / 1.9, y / 0.95);
        float jk = keep(max(fwidth(jc.x), fwidth(jc.y)) * 1.5);
        float joint = max(1.0 - smoothstep(0.0, 0.035, fract(jc.x + 0.5 * mod(floor(jc.y), 2.0))), 1.0 - smoothstep(0.0, 0.06, fract(jc.y)));
        wall *= 1.0 - 0.16 * joint * jk * (1.0 - panel);
      #elif STYLE == 2
        // Curtain wall: the "wall" is the aluminium between panes.
        wall = mix(vec3(0.2, 0.22, 0.24), base * 0.5, 0.45);
        wallRough = 0.3;
      #else
        // Cut stone in big courses.
        vec2 sc = vec2(u / 2.6, y / 1.3);
        sc.x += 0.5 * mod(floor(sc.y), 2.0);
        vec2 sf = fract(sc);
        float sk = keep(max(fwidth(sc.x), fwidth(sc.y)) * 1.4);
        float sj = max(1.0 - smoothstep(0.0, 0.03, sf.x), 1.0 - smoothstep(0.0, 0.055, sf.y));
        wall = base * (0.9 + 0.2 * h21(floor(sc) + seed * 5.0) * sk);
        wall *= 1.0 - 0.3 * sj * sk;
        // Pilasters between the bays and a string course at each floor.
        float pil = (1.0 - aaBox(vec2(f.x, 0.5), vec2(0.1, 0.0), vec2(0.9, 1.0), vec2(fw.x, 0.01))) * inGrid;
        wall *= 1.0 + 0.07 * pil;
        float course = (1.0 - smoothstep(0.035, 0.05, f.y)) * inGrid * detail;
        wall = mix(wall, base * 1.12, course);
        wall *= 1.0 - 0.3 * smoothstep(0.05, 0.065, f.y) * (1.0 - smoothstep(0.065, 0.11, f.y)) * inGrid * detail;
      #endif

      // Weather: broad blotches, streaks running down from the roof line, soot near the pavement.
      float blotch = fbm(vec2(u, y) * 0.06 + seed * 40.0 + faceId * 9.0);
      float streak = vnoise(vec2(u * 1.1 + seed * 13.0, y * 0.08));
      #if STYLE == 2
        float grimeAmt = 0.25;
      #else
        float grimeAmt = 1.0;
      #endif
      wall *= 1.0 - grimeAmt * (0.2 * (blotch - 0.45) + 0.14 * streak * smoothstep(H * 0.2, H, y) * smoothstep(0.35, 0.75, streak));
      wall *= mix(0.74, 1.0, smoothstep(0.0, 3.2, y) * grimeAmt + (1.0 - grimeAmt));

      vec3 col = wall;
      bRough = wallRough;

      // ---- upper-floor windows -------------------------------------------
      vec2 w0 = uWin.xz;
      vec2 w1 = uWin.yw;
      float win = aaBox(f, w0, w1, fw) * inGrid;
      #if STYLE == 0
        // A door takes the place of one ground-floor window.
        float doorBay = floor(h21(vec2(seed * 53.0, faceId)) * bays);
        float isDoor = step(abs(cell.x - doorBay), 0.5) * step(abs(cell.y), 0.5) * inGrid;
        float door = aaBox(f, vec2(0.3, -0.25), vec2(0.7, 0.74), fw) * isDoor;
        win *= 1.0 - isDoor;
        // Stone sill and lintel.
        float sill = aaBox(f, vec2(w0.x - 0.05, w0.y - 0.075), vec2(w1.x + 0.05, w0.y), fw) * inGrid * (1.0 - isDoor);
        float lintel = aaBox(f, vec2(w0.x - 0.05, w1.y), vec2(w1.x + 0.05, w1.y + 0.085), fw) * inGrid * (1.0 - isDoor);
        vec3 trimCol = mix(vec3(0.5, 0.48, 0.44), base * 1.5, 0.25);
        col = mix(col, trimCol, max(sill, lintel) * detail);
        // Soot under the sill.
        col *= 1.0 - 0.22 * aaBox(f, vec2(w0.x, 0.0), vec2(w1.x, w0.y - 0.075), fw) * inGrid * detail * smoothstep(0.0, w0.y, f.y);
      #endif
      #if STYLE == 3
        float sill = aaBox(f, vec2(w0.x - 0.06, w0.y - 0.05), vec2(w1.x + 0.06, w0.y), fw) * inGrid;
        float hood = aaBox(f, vec2(w0.x - 0.08, w1.y), vec2(w1.x + 0.08, w1.y + 0.06), fw) * inGrid;
        col = mix(col, base * 1.14, max(sill, hood) * detail);
        col *= 1.0 - 0.3 * aaBox(f, vec2(w0.x - 0.08, w1.y + 0.06), vec2(w1.x + 0.08, w1.y + 0.085), fw) * inGrid * detail;
      #endif

      // Frame around the opening and bars across it.
      #if STYLE == 2
        vec2 px = vec2(0.07 / bayW, 0.07 / flH);
      #else
        vec2 px = vec2(0.14 / bayW, 0.14 / flH);
      #endif
      float inner = aaBox(f, w0 + px, w1 - px, fw);
      float bars = 1.0;
      #if STYLE == 2 || STYLE == 1
        // One mullion down the middle of each bay.
        bars = smoothstep(px.x * 0.5, px.x * 0.5 + fw.x, abs(f.x - 0.5));
      #else
        float meet = mix(w0.y, w1.y, 0.52);
        bars = smoothstep(px.y * 0.4, px.y * 0.4 + fw.y, abs(f.y - meet));
        bars *= mix(1.0, smoothstep(px.x * 0.3, px.x * 0.3 + fw.x, abs(f.x - 0.5)), step(0.5, roomId2));
      #endif
      float pane = inner * bars;
      #if STYLE == 0
        vec3 frameCol = mix(vec3(0.74, 0.72, 0.68), vec3(0.1, 0.1, 0.11), step(0.72, h21(vec2(seed * 11.0, 2.0))));
        float frameMetal = 0.0;
      #else
        vec3 frameCol = vec3(0.14, 0.145, 0.15);
        float frameMetal = 0.7;
      #endif
      float frame = win * (1.0 - pane) * detail;
      col = mix(col, frameCol, frame);
      bRough = mix(bRough, 0.45, frame);
      bMetal = mix(bMetal, frameMetal, frame);
      // The reveal: the top and one side of the opening sit in shadow.
      float reveal = win * (smoothstep(w1.y - px.y * 3.2, w1.y - px.y, f.y) * 0.55 + (1.0 - smoothstep(w0.x + px.x, w0.x + px.x * 3.4, f.x)) * 0.3);

      // What is behind the glass: a box room, found by following the view ray.
      vec3 ro = vec3(f, 0.0);
      vec3 rr = vec3(rdu / bayW, rd.y / flH, rdin / uDepth);
      rr += step(abs(rr), vec3(1e-5)) * 2e-5;
      vec3 tt = (step(vec3(0.0), rr) - ro) / rr;
      float tHit = min(tt.x, min(tt.y, tt.z));
      vec3 hp = ro + rr * tHit;
      float back = step(tt.z, min(tt.x, tt.y) + 1e-4);
      float ceilFloor = (1.0 - back) * step(tt.y, tt.x);
      vec3 roomTone = mix(vec3(0.5, 0.45, 0.4), vec3(0.72, 0.7, 0.66), roomId2);
      float shade = back > 0.5 ? 0.8 : (ceilFloor > 0.5 ? (rr.y > 0.0 ? 1.05 : 0.5) : 0.68);
      vec3 room = roomTone * shade * mix(1.0, 0.3, hp.z);
      // Something standing against the back wall, and a ceiling light.
      room *= 1.0 - 0.45 * back * step(hp.y, 0.38) * step(0.25, fract(hp.x * 2.0 + roomId));
      #if STYLE == 0
        float lightOn = step(0.9, roomId);
        float dayLevel = 0.13;
      #elif STYLE == 2
        float lightOn = step(0.8, roomId);
        float dayLevel = 0.2;
      #else
        float lightOn = step(0.82, roomId);
        float dayLevel = 0.14;
      #endif
      vec3 interior = room * mix(vec3(dayLevel), vec3(1.25, 1.0, 0.68) * (0.55 + 0.6 * roomId2), lightOn);
      interior += lightOn * ceilFloor * step(0.0, rr.y) * vec3(0.5, 0.45, 0.3) * (1.0 - hp.z);

      // Blinds or curtains, drawn to a different height in every window.
      float blindLen = step(0.42, roomId2) * (0.15 + 0.7 * h21(cell + seed * 3.3 + faceId));
      float blind = step(mix(w1.y, w0.y, blindLen), f.y);
      vec3 blindCol = mix(vec3(0.62, 0.6, 0.55), vec3(0.42, 0.36, 0.3), step(0.8, roomId));
      float slat = 0.9 + 0.1 * step(0.5, fract(f.y * flH * 9.0)) * keep(fw.y * flH * 9.0);

      vec3 tint = uGlassTint;
      #if STYLE == 2
        tint = mix(uGlassTint, base * 1.5, 0.55);
        blind *= 0.55;
      #endif
      float tintL = dot(tint, vec3(0.33));
      vec3 seen = mix(interior, blindCol * slat * 0.55, blind);
      float paneK = pane * win;
      // Up close each pane is drawn; far away the facade settles to its average.
      float cover = (w1.x - w0.x) * (w1.y - w0.y) * 0.9 * inGrid;
      float glass = mix(cover, paneK, detail);
      col = mix(col, tint, glass);
      col *= 1.0 - reveal * (1.0 - paneK) * detail;
      bRough = mix(bRough, 0.07, glass);
      bMetal = mix(bMetal, 1.0, glass);
      bGlass = glass;
      bEmit = seen * (1.0 - tintL) * glass * mix(0.6, 1.0, detail) * (1.0 - reveal * 0.6);
      bTilt = (h22(cell * vec2(2.0, 1.0) + floor(f.x * 2.0) + faceId * 3.0 + seed * 7.0) - 0.5) * uTilt * glass * detail;

      #if STYLE == 2
        // Spandrel band under the vision glass.
        float spandrel = aaBox(f, vec2(uWin.x, 0.03), vec2(uWin.y, uWin.z - 0.02), fw) * inGrid * bars * detail;
        vec3 spanCol = mix(tint * 0.5, vec3(0.16, 0.18, 0.2), 0.45);
        col = mix(col, spanCol, spandrel);
        bMetal = mix(bMetal, 0.85, spandrel);
        bRough = mix(bRough, 0.22, spandrel);
      #endif

      // ---- street level ---------------------------------------------------
      #if STYLE == 1 || STYLE == 2
      {
        float gb = max(1.0, floor(width / 6.5));
        float gu = (u / width + 0.5) * gb;
        vec2 gf = vec2(fract(gu), y / max(ground, 0.01));
        vec2 gfw = vec2(fwidth(gu), fwidth(y / max(ground, 0.01)));
        float gdet = keep(max(gfw.x, gfw.y));
        float shopId = h21(vec2(floor(gu), seed * 71.0 + faceId));
        #if STYLE == 2
          float shopTop = 0.86;
          vec3 gwall = vec3(0.17, 0.17, 0.18);
          float gwallRough = 0.35;
        #else
          float shopTop = 0.7;
          vec3 gwall = wall * 0.82;
          float gwallRough = 0.85;
        #endif
        float shop = aaBox(gf, vec2(0.07, 0.07), vec2(0.93, shopTop), gfw) * atGround;
        float mull = smoothstep(0.02, 0.02 + gfw.x * 3.0, abs(fract(gf.x * 3.0 + 0.5) - 0.5));
        col = mix(col, gwall, atGround);
        bRough = mix(bRough, gwallRough, atGround);
        bMetal = mix(bMetal, 0.0, atGround);
        bEmit *= 1.0 - atGround;
        // Shop interiors are lit, warm or cool.
        vec3 shopLight = mix(vec3(0.9, 0.74, 0.5), vec3(0.62, 0.7, 0.78), step(0.6, shopId)) * (0.25 + 0.45 * shopId);
        float deep = 1.0 - smoothstep(0.0, 1.0, (gf.y - 0.07) * 1.1 + rd.y * 0.6);
        vec3 shopSeen = shopLight * mix(0.35, 1.0, deep) * (0.75 + 0.25 * step(0.5, fract(gf.x * 5.0 + shopId * 3.0)));
        float shopGlass = shop * mix(0.8, mull, gdet);
        col = mix(col, vec3(0.3, 0.33, 0.36), shopGlass);
        bRough = mix(bRough, 0.06, shopGlass);
        bMetal = mix(bMetal, 1.0, shopGlass);
        bEmit = mix(bEmit, shopSeen * 0.62, shopGlass);
        bGlass = max(bGlass * (1.0 - atGround), shopGlass);
        #if STYLE == 1
          // An awning or sign band over each shop, in the shop's own colour.
          float band = aaBox(gf, vec2(0.05, 0.72), vec2(0.95, 0.9), gfw) * atGround * gdet;
          vec3 awn = shopId < 0.25 ? vec3(0.32, 0.05, 0.05) : shopId < 0.5 ? vec3(0.04, 0.16, 0.1) : shopId < 0.75 ? vec3(0.05, 0.08, 0.2) : vec3(0.07, 0.07, 0.07);
          col = mix(col, awn, band);
          bRough = mix(bRough, 0.8, band);
          bMetal = mix(bMetal, 0.0, band);
          bEmit *= 1.0 - band;
        #endif
        bTilt *= 1.0 - atGround;
      }
      #elif STYLE == 0
        // Front door and the step up to it.
        float dsel = h21(vec2(seed * 29.0, 4.0));
        vec3 doorCol = dsel < 0.25 ? vec3(0.03, 0.09, 0.05) : dsel < 0.5 ? vec3(0.22, 0.03, 0.03) : dsel < 0.75 ? vec3(0.02, 0.04, 0.1) : vec3(0.03, 0.03, 0.03);
        float doorPanel = aaBox(f, vec2(0.36, 0.05), vec2(0.64, 0.6), fw);
        // Stone base course.
        col = mix(col, mix(vec3(0.5, 0.48, 0.45), base, 0.35) * 0.85, atGround);
        col = mix(col, doorCol * (0.75 + 0.5 * doorPanel), door * detail);
        col = mix(col, vec3(0.5, 0.48, 0.44), aaBox(vec2(ub - doorBay, y / max(ground, 0.01)), vec2(0.2, 0.0), vec2(0.8, 0.55), vec2(fw.x, 0.02)) * atGround * detail);
        bRough = mix(bRough, 0.5, door * detail);
        bMetal *= 1.0 - door;
        bEmit *= 1.0 - door;
      #else
        col = mix(col, base * 0.82, atGround);
      #endif

      // ---- top: cornice and parapet ---------------------------------------
      float nearTop = H - y;
      #if STYLE == 0
        float corn = step(nearTop, 0.85) * (1.0 - thin);
        float dent = step(0.5, fract(u / 0.5)) * keep(fwidth(u / 0.5));
        vec3 cornCol = mix(vec3(0.4, 0.39, 0.36), base * 0.6, step(0.5, h21(vec2(seed * 3.0, 9.0))));
        col = mix(col, cornCol * (0.9 + 0.1 * dent), corn);
        col *= 1.0 - 0.4 * smoothstep(0.85, 0.95, nearTop) * (1.0 - smoothstep(0.95, 1.5, nearTop)) * (1.0 - thin);
      #elif STYLE == 1 || STYLE == 3
        float corn = step(nearTop, 0.5) * (1.0 - thin);
        col = mix(col, base * 1.12, corn);
        col *= 1.0 - 0.32 * smoothstep(0.5, 0.58, nearTop) * (1.0 - smoothstep(0.58, 1.1, nearTop)) * (1.0 - thin);
      #else
        col = mix(col, vec3(0.2, 0.21, 0.23), step(nearTop, 0.35) * (1.0 - thin));
      #endif
      if (thin > 0.5) {
        #if STYLE == 2
          col = mix(vec3(0.2, 0.21, 0.23), base * 0.6, 0.4);
          bRough = 0.35;
          bMetal = 0.6;
        #else
          col = wall * 1.08;
        #endif
      }
      diffuseColor.rgb = col;
    } else {
      // The roof: a membrane or gravel field inside a parapet.
      vec2 rp = vBLocal.xz;
      float edge = min(vBSize.x * 0.5 - abs(rp.x), vBSize.z * 0.5 - abs(rp.y));
      float small = step(min(vBSize.x, vBSize.z), 3.0);
      float coping = (1.0 - smoothstep(0.45, 0.6, edge)) * (1.0 - small);
      float rk = keep(max(fwidth(rp.x), fwidth(rp.y)) * 2.0);
      vec3 field = mix(vec3(0.13, 0.13, 0.14), vec3(0.3, 0.29, 0.27), step(0.45, h21(vec2(seed * 17.0, 1.0))) * 0.8);
      #if STYLE == 2
        field = vec3(0.34, 0.35, 0.36);
      #endif
      field *= 0.8 + 0.4 * fbm(rp * 0.22 + seed * 19.0);
      field *= 0.9 + 0.2 * vnoise(rp * 3.3) * rk;
      // Seams in the roofing and a dark margin where water sits against the parapet.
      field *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.06, fract(rp.x / 2.6 + seed))) * rk;
      field *= mix(0.62, 1.0, clamp(smoothstep(0.6, 2.4, edge) + small, 0.0, 1.0));
      vec3 cope = mix(base * 0.85, vec3(0.5, 0.49, 0.46), 0.45);
      diffuseColor.rgb = mix(field, cope, coping);
      bRough = mix(0.95, 0.7, coping);
    }
    #endif
  }
`;

export function buildingMaterial(style = 'brick', opts = {}) {
  const s = STYLES[style] || STYLES.brick;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, ...opts });
  mat.defines = { ...(mat.defines || {}), STYLE: s.id };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBay = { value: new THREE.Vector2(s.bay[0], s.bay[1]) };
    shader.uniforms.uWin = { value: new THREE.Vector4(s.win[0], s.win[1], s.win[2], s.win[3]) };
    shader.uniforms.uGround = { value: s.ground };
    shader.uniforms.uParapet = { value: s.parapet };
    shader.uniforms.uEdge = { value: s.edge };
    shader.uniforms.uDepth = { value: s.depth };
    shader.uniforms.uTilt = { value: s.tilt };
    shader.uniforms.uGlassTint = { value: new THREE.Color(s.glass) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FACADE_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FACADE_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FACADE_FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', FACADE_FRAGMENT)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = bRough;\nmetalnessFactor = bMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + vBTu * bTilt.x + vBTv * bTilt.y);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bEmit;')
      // Glass should mirror the sky at full strength even though the
      // environment is turned down for ambient light.
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectSpecular *= 1.0 + 0.45 * bGlass;');
  };
  mat.customProgramCacheKey = () => 'facade-' + style;
  return mat;
}

// ---------------------------------------------------------------------------
// Ground: asphalt, paving, plaza stone and grass, drawn from world position
// ---------------------------------------------------------------------------
const WORLD_VERTEX_PARS = /* glsl */ `
  varying vec3 vWPos;
  flat varying vec3 vONormal;
`;
const WORLD_VERTEX = /* glsl */ `
  vec4 wPos4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wPos4 = instanceMatrix * wPos4;
  #endif
  vWPos = (modelMatrix * wPos4).xyz;
  vONormal = normal;
`;

const GROUND_FRAGMENT = /* glsl */ `
  #include <color_fragment>
  float gRough = 0.9;
  float gMetal = 0.0;
  {
    vec2 p = vWPos.xz;
    vec3 base = diffuseColor.rgb;
    float fwp = max(fwidth(p.x), fwidth(p.y));
    float top = step(0.5, abs(vONormal.y));
    vec3 col = base;
    #if GROUND_KIND == 0
      // ---- asphalt --------------------------------------------------------
      float grit = vnoise(p * 7.0) * 0.55 + vnoise(p * 19.0) * 0.45;
      float gk = keep(fwp * 9.0);
      float wear = fbm(p * 0.045 + 3.0);
      float patchN = vnoise(p * 0.11 + 40.0);
      col = base * (0.84 + 0.3 * wear);
      col = mix(col, col * 0.72, smoothstep(0.62, 0.66, patchN) * 0.7);
      col *= mix(1.0, 0.78 + 0.44 * grit, gk);
      float crack = 1.0 - smoothstep(0.0, 0.02, abs(vnoise(p * 0.33 + 9.0) - 0.5));
      col *= 1.0 - 0.4 * crack * keep(fwp * 2.0);
      gRough = mix(0.88, 0.74, wear);
      // Street grid: gutters, tyre tracks and zebra crossings.
      vec2 s = (fract(p / uGrid.x + 0.5) - 0.5) * uGrid.x;
      vec2 as = abs(s);
      float inside = step(uGridExt.x, p.x) * step(p.x, uGridExt.y) * step(uGridExt.z, p.y) * step(p.y, uGridExt.w) * uGrid.z;
      float hs = uGrid.y;
      float nsStreet = step(as.x, hs);
      float ewStreet = step(as.y, hs);
      float gutter = max(nsStreet * smoothstep(hs - 1.6, hs, as.x), ewStreet * smoothstep(hs - 1.6, hs, as.y));
      col *= 1.0 - 0.22 * gutter * inside;
      float tracks = nsStreet * (1.0 - ewStreet) * (1.0 - smoothstep(0.5, 1.1, abs(abs(as.x - 4.4) - 0.9)))
                   + ewStreet * (1.0 - nsStreet) * (1.0 - smoothstep(0.5, 1.1, abs(abs(as.y - 4.4) - 0.9)));
      col *= 1.0 - 0.1 * tracks * inside;
      gRough -= 0.1 * tracks * inside;
      float zk = keep(fwp * 1.4);
      float zebraNS = step(as.x, hs - 0.9) * step(hs + 1.6, as.y) * step(as.y, hs + 5.2) * step(fract(s.x / 1.7), 0.52);
      float zebraEW = step(as.y, hs - 0.9) * step(hs + 1.6, as.x) * step(as.x, hs + 5.2) * step(fract(s.y / 1.7), 0.52);
      float stopNS = step(as.x, hs - 0.9) * step(hs + 6.6, as.y) * step(as.y, hs + 7.2) * step(0.0, s.x * s.y);
      float stopEW = step(as.y, hs - 0.9) * step(hs + 6.6, as.x) * step(as.x, hs + 7.2) * step(s.x * s.y, 0.0);
      float paint = max(max(zebraNS, zebraEW), max(stopNS, stopEW)) * inside;
      float worn = 0.55 + 0.45 * smoothstep(0.25, 0.6, vnoise(p * 1.7 + 5.0));
      col = mix(col, vec3(0.74, 0.73, 0.69) * (0.8 + 0.2 * grit), paint * worn * mix(0.5, 1.0, zk));
      // Manhole covers.
      vec2 mc = floor(p / 31.0);
      vec2 mo = (h22(mc) - 0.5) * 22.0;
      float md = length(p - (mc + 0.5) * 31.0 - mo);
      float cover = (1.0 - smoothstep(0.55, 0.62, md)) * step(0.45, h21(mc + 3.0)) * keep(fwp * 1.2);
      col = mix(col, vec3(0.1, 0.095, 0.09) * (0.8 + 0.4 * step(0.5, fract(md * 5.0))), cover);
      gMetal = cover * 0.6;
      gRough = mix(gRough, 0.5, cover);
    #else
      float isGrass = step(base.r * 1.12, base.g);
      float lum = dot(base, vec3(0.3, 0.55, 0.15));
      float isPlaza = (1.0 - isGrass) * step(0.44, lum);
      // ---- paving -----------------------------------------------------------
      vec2 q = isPlaza > 0.5 ? p / vec2(2.4, 1.2) : p / 1.6;
      q.x += isPlaza * 0.5 * mod(floor(q.y), 2.0);
      vec2 qf = fract(q);
      float qk = keep(max(fwidth(q.x), fwidth(q.y)) * 1.6);
      float jw = isPlaza > 0.5 ? 0.02 : 0.035;
      float joint = max(1.0 - smoothstep(jw, jw * 2.2, qf.x), 1.0 - smoothstep(jw, jw * 2.2, qf.y));
      float slabTone = h21(floor(q) + 11.0);
      vec3 pave = base * (0.86 + 0.2 * slabTone * qk);
      pave *= 0.86 + 0.26 * fbm(p * 0.09 + 17.0);
      pave *= 1.0 - 0.3 * joint * qk;
      pave *= mix(1.0, 0.82 + 0.36 * vnoise(p * 6.0), keep(fwp * 7.0));
      // Old chewing gum and oil spots.
      pave *= 1.0 - 0.3 * step(0.86, vnoise(p * 1.9 + 60.0)) * keep(fwp * 2.5) * (1.0 - isPlaza);
      // Darker banding across big plazas.
      pave *= 1.0 - 0.1 * isPlaza * step(0.86, fract(p.x / 14.4)) * keep(fwp * 0.2);
      float paveRough = mix(0.86, 0.58, isPlaza) - 0.12 * slabTone * isPlaza;
      // ---- grass ------------------------------------------------------------
      float gN = fbm(p * 0.07 + 5.0);
      float fine = vnoise(p * 2.7) * 0.6 + vnoise(p * 6.1) * 0.4;
      vec3 grass = mix(base * 0.62, base * 1.12, gN);
      grass = mix(grass, vec3(0.3, 0.3, 0.1), 0.3 * smoothstep(0.5, 0.8, fbm(p * 0.03 + 21.0)));
      grass *= mix(1.0, 0.72 + 0.56 * fine, keep(fwp * 3.5));
      // Drifts of fallen leaves: soft warm patches, it is autumn.
      float drift = smoothstep(0.55, 0.8, fbm(p * 0.11 + 70.0)) * (0.5 + 0.5 * vnoise(p * 1.3 + 9.0));
      grass = mix(grass, vec3(0.34, 0.2, 0.06), drift * 0.35);
      col = mix(pave, grass, isGrass);
      gRough = mix(paveRough, 1.0, isGrass);
      // The kerb face.
      col = mix(base * 0.62, col, top);
    #endif
    diffuseColor.rgb = col;
  }
`;

// kind 0: the asphalt sheet under everything. kind 1: slabs laid on top
// (pavement, plazas, lawns), told apart by their instance colour.
// grid: { pitch, half, x0, x1, z0, z1 } describes the street grid so the
// asphalt can paint crossings at the junctions.
export function groundMaterial(kind = 0, color = 0xffffff, grid = null) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
  mat.defines = { GROUND_KIND: kind };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrid = { value: new THREE.Vector3(grid ? grid.pitch : 78, grid ? grid.half : 9, grid ? 1 : 0) };
    shader.uniforms.uGridExt = { value: new THREE.Vector4(grid ? grid.x0 : 0, grid ? grid.x1 : 0, grid ? grid.z0 : 0, grid ? grid.z1 : 0) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLD_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WORLD_VERTEX_PARS}\nuniform vec3 uGrid;\nuniform vec4 uGridExt;\n${NOISE}`)
      .replace('#include <color_fragment>', GROUND_FRAGMENT)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = gRough;\nmetalnessFactor = gMetal;');
  };
  mat.customProgramCacheKey = () => 'ground-' + kind + (grid ? '-grid' : '');
  return mat;
}

// ---------------------------------------------------------------------------
// Landmarks and street furniture: baked, vertex-coloured, flat-shaded meshes
// ---------------------------------------------------------------------------
// Gives them the grain of real material: mottling, masonry joints on pale
// stone, grit on anything dark and flat, and grime where walls meet ground.
export function decorMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLD_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WORLD_VERTEX_PARS}\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float dRough = 0.82;
        float dMetal = 0.0;
        {
          vec3 base = diffuseColor.rgb;
          vec3 wn = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
          float up = abs(wn.y);
          float lum = dot(base, vec3(0.3, 0.55, 0.15));
          float sat = max(base.r, max(base.g, base.b)) - min(base.r, min(base.g, base.b));
          float side = abs(wn.x) > abs(wn.z) ? vWPos.z : vWPos.x;
          vec2 wp = up > 0.6 ? vWPos.xz : vec2(side, vWPos.y);
          float fwp = max(fwidth(wp.x), fwidth(wp.y));
          vec3 col = base * (0.84 + 0.3 * fbm(wp * 0.13 + 9.0));
          col *= mix(1.0, 0.82 + 0.36 * vnoise(wp * 5.0), keep(fwp * 6.0));
          // Pale, grey-ish surfaces are stone: give them courses.
          float stone = smoothstep(0.22, 0.34, lum) * (1.0 - smoothstep(0.16, 0.3, sat));
          vec2 sc = up > 0.6 ? wp / vec2(2.2, 2.2) : wp / vec2(2.4, 1.2);
          sc.x += 0.5 * mod(floor(sc.y), 2.0) * (1.0 - step(0.6, up));
          float sk = keep(max(fwidth(sc.x), fwidth(sc.y)) * 1.6);
          float joint = max(1.0 - smoothstep(0.0, 0.03, fract(sc.x)), 1.0 - smoothstep(0.0, 0.05, fract(sc.y)));
          col *= 1.0 - 0.24 * joint * sk * stone;
          col *= 1.0 + 0.1 * (h21(floor(sc)) - 0.5) * sk * stone;
          // Rain streaks down walls, dirt at the foot.
          float streak = vnoise(vec2(side * 0.9, vWPos.y * 0.07));
          col *= 1.0 - 0.18 * smoothstep(0.45, 0.85, streak) * (1.0 - up) * stone;
          col *= mix(0.72, 1.0, clamp(smoothstep(0.2, 2.8, vWPos.y) + up, 0.0, 1.0));
          // Painted steel and bronze catch the light.
          float metalish = smoothstep(0.3, 0.5, sat) * (1.0 - step(0.6, up)) * step(base.g, base.b * 1.05 + 0.02) * step(base.r, base.b);
          dMetal = 0.45 * metalish;
          dRough = mix(0.84, 0.5, metalish);
          // Water in fountains and ponds: pale blue, flat, shiny.
          float water = step(0.6, up) * step(base.r * 1.6, base.b) * step(0.25, base.b);
          dRough = mix(dRough, 0.08, water);
          col = mix(col, base * 0.55, water);
          diffuseColor.rgb = col;
        }`
      )
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = dRough;\nmetalnessFactor = dMetal;');
  };
  mat.customProgramCacheKey = () => 'decor';
  return mat;
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------
// One flat sheet per river. Ripples are a handful of moving waves summed in
// the shader; the sky reflection comes from the environment map, so there is
// no second render of the scene.
export function waterMaterial(color = 0x1c4a5c) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.94 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLD_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WORLD_VERTEX_PARS}\nuniform float uTime;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec2 wGrad = vec2(0.0);
        {
          vec2 p = vWPos.xz;
          float t = uTime;
          float fwp = max(fwidth(p.x), fwidth(p.y));
          // The current runs along the river (z), wind chop crosses it.
          vec2 d1 = normalize(vec2(0.25, 1.0));
          vec2 d2 = normalize(vec2(-0.6, 0.8));
          vec2 d3 = normalize(vec2(0.9, 0.35));
          vec2 d4 = normalize(vec2(-0.35, -1.0));
          wGrad += d1 * cos(dot(p, d1) * 0.55 + t * 0.9) * 0.05;
          wGrad += d2 * cos(dot(p, d2) * 1.3 + t * 1.5) * 0.045 * keep(fwp * 0.4);
          wGrad += d3 * cos(dot(p, d3) * 2.9 - t * 2.2) * 0.04 * keep(fwp * 0.9);
          wGrad += d4 * cos(dot(p, d4) * 5.3 + t * 3.1) * 0.03 * keep(fwp * 1.7);
          float e = 0.35;
          vec2 q = p * 0.9 + vec2(t * 0.25, t * 0.6);
          float n0 = vnoise(q);
          wGrad += vec2(vnoise(q + vec2(e, 0.0)) - n0, vnoise(q + vec2(0.0, e)) - n0) * 0.5 * keep(fwp * 0.9);
          float depthTone = 0.75 + 0.5 * fbm(p * 0.035 + vec2(0.0, t * 0.02));
          diffuseColor.rgb *= depthTone;
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(normalize(vec3(-wGrad.x, 1.0, -wGrad.y)), 0.0)).xyz);'
      )
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectSpecular *= 1.35;');
  };
  mat.customProgramCacheKey = () => 'water';
  return mat;
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------
// The crown geometry carries baked shading in its vertex colours; the shader
// adds leaf-scale mottling and the glow of sun coming through the canopy.
export function foliageMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = sharedUniforms.uSunDir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLD_VERTEX_PARS}\nvarying vec3 vLeafPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WORLD_VERTEX}\nvLeafPos = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WORLD_VERTEX_PARS}\nvarying vec3 vLeafPos;\nuniform vec3 uSunDir;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec3 leafGlow = vec3(0.0);
        {
          vec3 lp = vLeafPos * 17.0;
          float fwl = max(fwidth(lp.x), max(fwidth(lp.y), fwidth(lp.z)));
          float n = vnoise(lp.xz + lp.y * 1.9) * 0.5 + vnoise(lp.xy * 1.3 + lp.z * 2.3 + 4.0) * 0.5;
          float n2 = vnoise(lp.yz * 2.3 + lp.x * 1.1 + 9.0);
          float big = vnoise(vWPos.xz * 0.5 + vWPos.y * 0.35);
          vec3 leaf = diffuseColor.rgb;
          // Real foliage is darker and duller than a paint swatch.
          leaf = mix(vec3(dot(leaf, vec3(0.3, 0.55, 0.15))), leaf, 0.82) * 0.5;
          float lk = keep(fwl * 1.2);
          leaf *= mix(1.0, 0.55 + 0.9 * n, lk) * (0.8 + 0.4 * big);
          // Gaps in the canopy read as dark holes.
          leaf *= 1.0 - 0.6 * smoothstep(0.58, 0.82, n2) * lk;
          diffuseColor.rgb = leaf;
          vec3 toEye = normalize(cameraPosition - vWPos);
          float through = pow(clamp(dot(-toEye, uSunDir), 0.0, 1.0), 3.0);
          leafGlow = diffuseColor.rgb * through * 0.9;
        }`
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += leafGlow;');
  };
  mat.customProgramCacheKey = () => 'foliage';
  return mat;
}

// Kept for anything that still wants a simple gradient dome.
export function skyMaterial(top, horizon, bottom) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHorizon: { value: new THREE.Color(horizon) },
      uBottom: { value: new THREE.Color(bottom) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, clamp(-h * 4.0, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Flat-shaded material for characters and props.
export function flat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
}
