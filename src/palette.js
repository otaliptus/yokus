import * as THREE from 'three';
import { applyToonShader } from './art-shader.js';

// Mobile / compact viewport detection (includes iPadOS Safari reporting Mac + multi-touch)
const _ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
export const IS_MOBILE =
  /Mobi|Android|iPhone|iPad|iPod/i.test(_ua) ||
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && /Mac/i.test(_ua));
export const IS_COMPACT_VIEW = () =>
  IS_MOBILE || (typeof innerWidth !== 'undefined' && Math.min(innerWidth, innerHeight) <= 560);

// Cohesive Central Anatolian summer palette inspired by lush 3D pixel dioramas:
// sunlit limestone & warm straw contrasted with deep irrigated greens, terracotta,
// cobalt doors, turquoise river water, and cool indigo-violet shadows.
export const C = Object.freeze({
  ochre: '#cfa052',
  straw: '#e0bc68',
  sand: '#e8cfa0',
  chalk: '#f2ead8',
  plasterWarm: '#e9dcc0',
  mud: '#b48254',
  earth: '#7d5940',
  woodDark: '#5b3f2d',
  woodWarm: '#8c6242',
  stoneLight: '#c4b89f',
  stoneMid: '#9a9180',
  stoneDark: '#6e6a62',
  blue: '#3978a8',
  blueLight: '#5698c4',
  teal: '#4d92b8',
  riverDeep: '#356ba3',
  foam: '#eef6fa',
  greenDark: '#2f5629',
  greenMid: '#4c7c32',
  greenBright: '#72a33e',
  olive: '#8a9944',
  sage: '#6c8256',
  rust: '#c2523a',
  terracotta: '#d46642',
  apricot: '#eb943c',
  cream: '#f5dfa8',
  skin: '#f0cfa0',
  dark: '#383238',
  dusk: '#645c72',
  kilimRed: '#b83c36',
  kilimIndigo: '#344c7a',
  gold: '#f4c762',
});

export const STOP_NAMES = [
  'arrival',
  'teahouse',
  'football',
  'river',
  'bread',
  'house',
  'readingroom',
  'ending',
];

// Time-of-day lighting keys driven by story progress (0..7)
// Note: THREE.Color automatically converts hex sRGB -> linear, so shadowTint stays
// luminous lavender-periwinkle (#757fb6..#6b6ea8) — airy & cozy like full-20.png!
export const TIME_OF_DAY = [
  // 0: Arrival — bright, clear early afternoon
  {
    sunColor: '#fff7e0',
    midColor: '#dcd2c0',
    shadowTint: '#7a85bd',
    sunDir: [-14, 24, 12],
    skyTop: '#6aa4cc',
    skyHorizon: '#e9dbb6',
    skyBottom: '#c9a66b',
    fog: '#dfd0a8',
    gradeWarm: [1.02, 1.0, 0.95],
  },
  // 1: Tea house — warm dappled afternoon
  {
    sunColor: '#fff4d6',
    midColor: '#dad0bc',
    shadowTint: '#7882bc',
    sunDir: [-15, 22, 11],
    skyTop: '#6ca4c8',
    skyHorizon: '#ebd7ad',
    skyBottom: '#c59d63',
    fog: '#dfcaa0',
    gradeWarm: [1.03, 1.0, 0.94],
  },
  // 2: Football — mid-afternoon golden dust haze
  {
    sunColor: '#ffedc2',
    midColor: '#dcc7a8',
    shadowTint: '#7b80b6',
    sunDir: [-18, 19, 10],
    skyTop: '#78a5c2',
    skyHorizon: '#efd29e',
    skyBottom: '#c9985a',
    fog: '#e5c690',
    gradeWarm: [1.05, 1.0, 0.92],
  },
  // 3: River — cooler willow shade, crisp highlights
  {
    sunColor: '#f7f5e2',
    midColor: '#ccd6cc',
    shadowTint: '#6e83bc',
    sunDir: [-17, 18, 11],
    skyTop: '#639ec7',
    skyHorizon: '#dce4cc',
    skyBottom: '#9eb48c',
    fog: '#cde0ca',
    gradeWarm: [0.99, 1.02, 0.99],
  },
  // 4: Bread oven — late afternoon amber sun (point light adds warm fire glow!)
  {
    sunColor: '#ffdfa8',
    midColor: '#d4b59c',
    shadowTint: '#7572aa',
    sunDir: [-21, 14, 9],
    skyTop: '#6c8bb0',
    skyHorizon: '#f0b67d',
    skyBottom: '#bd7c4d',
    fog: '#dea878',
    gradeWarm: [1.06, 0.99, 0.9],
  },
  // 5: Great-grandfather's house — rich golden hour, peach walls, long shadows
  {
    sunColor: '#ffd08f',
    midColor: '#d9b096',
    shadowTint: '#7770ae',
    sunDir: [-24, 11, 8],
    skyTop: '#667ca6',
    skyHorizon: '#f2a870',
    skyBottom: '#b8704a',
    fog: '#df9d6c',
    gradeWarm: [1.09, 0.99, 0.88],
  },
  // 6: Reading room — warm golden hour interior
  {
    sunColor: '#ffd89c',
    midColor: '#d4bba6',
    shadowTint: '#7a75ad',
    sunDir: [-20, 15, 9],
    skyTop: '#667ca6',
    skyHorizon: '#f2a870',
    skyBottom: '#b8704a',
    fog: '#d89b6e',
    gradeWarm: [1.06, 0.99, 0.9],
  },
  // 7: Ending — serene rose-lavender twilight dusk
  {
    sunColor: '#f4b89e',
    midColor: '#b9a6c4',
    shadowTint: '#616096',
    sunDir: [-25, 9, 6],
    skyTop: '#4c5982',
    skyHorizon: '#d99396',
    skyBottom: '#8c616c',
    fog: '#b8828b',
    gradeWarm: [1.04, 0.96, 0.99],
  },
];

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
export const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

export function mulberry32(seed = 0x59a31) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, z) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

export function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  return lerp(
    lerp(hash2(ix, iz), hash2(ix + 1, iz), u),
    lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), u),
    v
  );
}

export function fbm2(x, z) {
  return noise2(x * 0.11, z * 0.11) * 0.65 + noise2(x * 0.29 + 17.3, z * 0.29 - 9.1) * 0.35;
}

// Road control points winding gracefully uphill from z=48 (off-screen entry) to z=-44
export const ROAD_CONTROL_XZ = [
  [1.2, 48],
  [0.5, 38],
  [0.2, 29],
  [-1.0, 21],
  [-0.8, 13],
  [-1.6, 5],
  [-1.8, -4],
  [-1.2, -14.5],
  [-0.4, -22],
  [0.6, -30],
  [0.2, -38],
  [0.0, -44],
];

// River centre Z as a gentle diagonal curve across the valley (kept cleanly north of football pitch!)
export function riverCenterZ(x) {
  return -14.8 + Math.sin(x * 0.06) * 0.9 + x * 0.04;
}

export const RIVER_HALF_WIDTH = 2.65;

export function isInRiver(x, z, pad = 0) {
  return Math.abs(z - riverCenterZ(x)) < RIVER_HALF_WIDTH + pad;
}

// Continuous hillside terrain rising smoothly as z decreases (uphill toward the house),
// with flat carved pads for the tea terrace, football pitch, bread courtyard, and house yard,
// plus a carved channel for the river.
export function ground(x, z) {
  // Gentle steady climb uphill from z=+38 (y~0) to z=-48 (y~2.15)
  const baseSlope = 0.025 * (38 - z);

  // Rolling Anatolian hills away from the village corridor (damped cleanly along river valley!)
  const rDistRaw = Math.abs(z - riverCenterZ(x));
  const valleyFade = smooth((rDistRaw - (RIVER_HALF_WIDTH + 1.0)) / 6.5);
  const corridor = Math.exp(-Math.pow((x - 1.0) * 0.085, 2));
  const hills =
    (1 - corridor) *
    valleyFade *
    (1.15 * Math.sin(x * 0.07 + z * 0.03) +
      0.55 * Math.cos(z * 0.08 - x * 0.05) +
      0.35 * Math.max(0, Math.abs(x) - 18) * 0.14);

  let y = baseSlope + hills + 0.08 * Math.sin(z * 0.07);

  // Flatten football pitch pad cleanly at x in [3.5..17.5], z in [-8.5..9.5]
  const pitchDx = Math.max(0, Math.abs(x - 10.5) - 6.6);
  const pitchDz = Math.max(0, Math.abs(z - 0.5) - 9.0);
  const pitchBlend = Math.exp(-(pitchDx * pitchDx + pitchDz * pitchDz) * 0.35);
  const pitchY = 0.025 * (38 - 0.5);
  y = lerp(y, pitchY, pitchBlend);

  // Flatten tea terrace pad at x in [-13..-2.5], z in [12.5..22.5]
  const teaDx = Math.max(0, Math.abs(x + 7.5) - 4.8);
  const teaDz = Math.max(0, Math.abs(z - 17.5) - 4.5);
  const teaBlend = Math.exp(-(teaDx * teaDx + teaDz * teaDz) * 0.45);
  const teaY = 0.025 * (38 - 17.5) + 0.04;
  y = lerp(y, teaY, teaBlend);

  // Flatten bread courtyard pad at x in [3.0..11.5], z in [-32..-24]
  const breadDx = Math.max(0, Math.abs(x - 7.2) - 3.8);
  const breadDz = Math.max(0, Math.abs(z + 28.0) - 3.6);
  const breadBlend = Math.exp(-(breadDx * breadDx + breadDz * breadDz) * 0.45);
  const breadY = 0.025 * (38 - -28.0) + 0.03;
  y = lerp(y, breadY, breadBlend);

  // Flatten top house terrace & interior pad at x in [-7..7], z in [-54..-40]
  const houseDx = Math.max(0, Math.abs(x) - 6.2);
  const houseDz = Math.max(0, Math.abs(z + 47.0) - 6.5);
  const houseBlend = Math.exp(-(houseDx * houseDx + houseDz * houseDz) * 0.35);
  const houseY = 0.025 * (38 - -47.0) + 0.12;
  y = lerp(y, houseY, houseBlend);

  // Carve smooth riverbed channel
  const rDist = Math.abs(z - riverCenterZ(x));
  if (rDist < RIVER_HALF_WIDTH + 1.8) {
    const channel = 1 - smooth((rDist - (RIVER_HALF_WIDTH - 0.5)) / 2.3);
    y -= channel * 0.58;
  }

  return y;
}

export function riverSurfaceY() {
  return 0.025 * (38 - -14.2) - 0.24;
}

// Unified spatial exclusion mask so grass, pebbles, and trees never clip into
// roads, river, ditch, pitch, terraces, or building interiors.
export class WorldMask {
  constructor(road) {
    this.roadSamples = Array.from({ length: 220 }, (_, i) => road.getPoint(i / 219));
    this.ditchSamples = [];
    this.rects = []; // { x, z, hw, hd }
    this.circles = []; // { x, z, r }
  }

  addRect(cx, cz, w, d) {
    this.rects.push({ x: cx, z: cz, hw: w * 0.5, hd: d * 0.5 });
  }

  addCircle(cx, cz, r) {
    this.circles.push({ x: cx, z: cz, r });
  }

  setDitchSamples(points) {
    this.ditchSamples = points;
  }

  distanceToRoad(x, z) {
    let best = Infinity;
    for (const p of this.roadSamples) {
      const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }

  distanceToDitch(x, z) {
    let best = Infinity;
    for (const p of this.ditchSamples) {
      const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }

  isBlocked(x, z, pad = 0) {
    if (isInRiver(x, z, 0.35 + pad)) return true;
    if (this.distanceToRoad(x, z) < 1.85 + pad) return true;
    if (this.ditchSamples.length && this.distanceToDitch(x, z) < 0.55 + pad) return true;
    for (const r of this.rects) {
      if (Math.abs(x - r.x) < r.hw + pad && Math.abs(z - r.z) < r.hd + pad) return true;
    }
    for (const c of this.circles) {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + pad) * (c.r + pad)) return true;
    }
    return false;
  }
}

export function colourGeometry(geo, colour = C.ochre, variation = 0) {
  const col = new THREE.Color(colour);
  const pos = geo.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const n = variation
      ? (Math.sin(i * 12.9898 + pos.getX(i) * 3.1 + pos.getZ(i) * 5.7) * 0.5 + 0.5) * variation -
        variation * 0.5
      : 0;
    arr[i * 3] = clamp(col.r + n, 0, 1);
    arr[i * 3 + 1] = clamp(col.g + n, 0, 1);
    arr[i * 3 + 2] = clamp(col.b + n, 0, 1);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export const TOON = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
TOON.minFilter = TOON.magFilter = THREE.NearestFilter;
TOON.generateMipmaps = false;
TOON.needsUpdate = true;

export const matte = applyToonShader(
  new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TOON })
);

export const mossyStoneMat = applyToonShader(
  new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TOON }),
  { moss: true }
);

export function mesh(geo, colour = C.ochre, variation = 0.025, mat = matte) {
  return new THREE.Mesh(colourGeometry(geo, colour, variation), mat);
}

export function box(w, h, d, colour = C.ochre, variation = 0.02) {
  return mesh(new THREE.BoxGeometry(w, h, d), colour, variation);
}

export function sphere(r, colour = C.ochre, detail = 1, variation = 0.02) {
  return mesh(new THREE.IcosahedronGeometry(r, detail), colour, variation);
}

export function cyl(rt, rb, h, colour = C.ochre, segments = 10, variation = 0.02) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, segments), colour, variation);
}

export function capsule(r, length, colour = C.ochre) {
  return mesh(new THREE.CapsuleGeometry(r, length, 3, 8), colour, 0.015);
}

export function place(o, x, y, z, parent) {
  o.position.set(x, y, z);
  if (parent) parent.add(o);
  return o;
}

export function shadow(o, cast = true, receive = true) {
  o.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = cast;
      n.receiveShadow = receive;
    }
  });
  return o;
}

export function beamBetween(a, b, r, colour = C.dark) {
  const d = a.distanceTo(b);
  const o = cyl(r, r, d, colour, 7);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}

export function canvasTexture(w, h, paint, nearest = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) {
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  } else {
    t.anisotropy = 2;
  }
  return t;
}

export function plainMaterial(colour, extra = {}, shaderOpts = {}) {
  const m = new THREE.MeshToonMaterial({ color: colour, gradientMap: TOON, ...extra });
  return applyToonShader(m, shaderOpts);
}

export class GameClock {
  constructor(speed = 1) {
    this.speed = clamp(Number(speed) || 1, 0.1, 100);
    this.elapsed = 0;
    this.last = 0;
  }
  tick(now) {
    if (!this.last) this.last = now;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000)) * this.speed;
    this.last = now;
    this.elapsed += dt;
    return dt;
  }
  advance(seconds, update) {
    const left = Math.max(0, Number(seconds) || 0);
    const step = 0.05;
    const n = Math.min(24000, Math.ceil(left / step));
    for (let i = 0; i < n; i++) {
      const dt = Math.min(step, left - i * step);
      if (dt <= 0) break;
      this.elapsed += dt;
      update(dt);
    }
  }
}
