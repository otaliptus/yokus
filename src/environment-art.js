import * as THREE from 'three';
import {
  C,
  V,
  ground,
  riverCenterZ,
  RIVER_HALF_WIDTH,
  fbm2,
  noise2,
  clamp,
  lerp,
  smooth,
  mulberry32,
  matte,
  mossyStoneMat,
  mesh,
  box,
  sphere,
  cyl,
  place,
  beamBetween,
  plainMaterial,
  canvasTexture,
  IS_MOBILE,
} from './palette.js';
import { applyToonShader } from './art-shader.js';

// Multi-biome Central Anatolian terrain:
// Rich emerald/olive greens around the river, irrigation ditch, orchards & village gardens;
// warm golden-ochre & sun-baked straw on the outer steppe hills — never flat mustard.
export function makeTerrain(mask) {
  const segs = IS_MOBILE ? 72 : 140;
  const geo = new THREE.PlaneGeometry(210, 210, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);

  const straw = new THREE.Color('#d8b35f');
  const ochre = new THREE.Color('#c29148');
  const warmSand = new THREE.Color('#e3c98a');
  const lushGreen = new THREE.Color('#5a8832');
  const deepGreen = new THREE.Color('#3e692a');
  const oliveGreen = new THREE.Color('#7f943c');
  const riverBed = new THREE.Color('#6b7b68');

  const tmp = new THREE.Color();

  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i) - 8;
    p.setZ(i, z);
    p.setY(i, ground(x, z) - 0.03);

    const n = fbm2(x, z);
    const n2 = noise2(x * 0.055 + 7, z * 0.055 - 13);

    // Base steppe variation
    if (n < 0.44) tmp.copy(ochre).lerp(straw, n / 0.44);
    else tmp.copy(straw).lerp(warmSand, (n - 0.44) / 0.56);

    // Irrigated green belts: river valley, village gardens, ditch corridor, hilltop orchard
    const rDist = Math.abs(z - riverCenterZ(x));
    const riverGreen = 1 - smooth((rDist - RIVER_HALF_WIDTH) / 7.5);
    const ditchDist = mask.ditchSamples.length ? mask.distanceToDitch(x, z) : 99;
    const ditchGreen = 1 - smooth((ditchDist - 0.4) / 3.4);

    // Lush green meadows along the village road, arrival, gardens & hilltop house!
    const villageCorridor =
      Math.exp(-Math.pow((x + 0.5) / 22.0, 2)) *
      (1 - smooth((Math.abs(z + 2) - 52) / 16));
    const meadowPatch = smooth((n2 - 0.16) / 0.36) * villageCorridor * 0.92;

    // Keep the football pitch pad clearly warm dusty ochre!
    const onPitch =
      Math.abs(x - 10.5) < 6.8 && Math.abs(z - 0.5) < 9.2 ? 1.0 : 0.0;

    const greenFactor = clamp(
      Math.max(riverGreen * 0.95, ditchGreen * 0.92, meadowPatch) * (1 - onPitch),
      0,
      1
    );

    if (greenFactor > 0.01) {
      const grassTone = n > 0.52 ? oliveGreen : n > 0.3 ? lushGreen : deepGreen;
      tmp.lerp(grassTone, greenFactor);
    }

    // Darken riverbed slightly under water
    if (rDist < RIVER_HALF_WIDTH + 0.5) {
      tmp.lerp(riverBed, (1 - smooth(rDist / (RIVER_HALF_WIDTH + 0.5))) * 0.65);
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, matte);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  terrain.userData.noCastShadow = true;
  terrain.name = 'anatolian-terrain';
  return terrain;
}

// Sunlit packed-earth village road with soft ruts and warm hand-laid stone edging
export function makeRoad(road, rng) {
  const group = new THREE.Group();
  const verts = [];
  const cols = [];
  const idx = [];
  const N = 220;
  const M = 10;
  const halfW = 1.55;

  const earth = new THREE.Color('#cfa36e');
  const sunCenter = new THREE.Color('#dfc08c');
  const rut = new THREE.Color('#9a734a');
  const edgeCol = new THREE.Color('#b6925c');

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = road.getPoint(t);
    const tan = road.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const w = halfW + (noise2(t * 48, 9) - 0.5) * 0.16;

    for (let j = 0; j <= M; j++) {
      const u = (j / M) * 2 - 1;
      const q = p.clone().addScaledVector(side, w * u);
      const rDist = Math.abs(q.z - riverCenterZ(q.x));
      // Slightly lift road cleanly across terrain (bridge deck covers the river crossing)
      q.y = ground(q.x, q.z) + (rDist < RIVER_HALF_WIDTH + 0.8 ? -0.15 : 0.032);
      verts.push(q.x, q.y, q.z);

      const rutMask = Math.exp(-Math.pow((Math.abs(u) - 0.42) / 0.11, 2)) * 0.62;
      const centerGlow = Math.exp(-Math.pow(u / 0.35, 2)) * 0.35;
      const edgeMask = smooth((Math.abs(u) - 0.8) / 0.2);

      const c = earth
        .clone()
        .lerp(sunCenter, centerGlow)
        .lerp(rut, rutMask)
        .lerp(edgeCol, edgeMask * 0.5);
      const grain = (fbm2(q.x * 2, q.z * 2) - 0.5) * 0.04;
      c.offsetHSL(0, 0, grain);
      cols.push(c.r, c.g, c.b);
    }
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      idx.push(a, a + 1, a + M + 1, a + 1, a + M + 2, a + M + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const roadMesh = new THREE.Mesh(geo, matte);
  roadMesh.receiveShadow = true;
  roadMesh.castShadow = false;
  roadMesh.userData.noCastShadow = true;
  group.add(roadMesh);

  // Hand-placed sunlit curb stones along road edges (echoing full-20.png's crisp stone borders!)
  const stonePositions = [];
  for (let i = 3; i < N - 3; i += 3) {
    const t = i / N;
    const p = road.getPoint(t);
    const rDist = Math.abs(p.z - riverCenterZ(p.x));
    if (rDist < RIVER_HALF_WIDTH + 2.2) continue;
    const tan = road.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    for (const sgn of [-1, 1]) {
      if (rng() < 0.28) continue;
      // Leave clean openings into tea terrace, football gate, river path & bread yard
      if (sgn < 0 && p.z > 13 && p.z < 22) continue;
      if (sgn > 0 && p.z > 1.8 && p.z < 6.4) continue;
      if (sgn < 0 && p.z > -11.5 && p.z < -8.0) continue;
      if (sgn > 0 && p.z < -23.5 && p.z > -32) continue;
      const sx = p.x + side.x * sgn * (halfW + 0.14);
      const sz = p.z + side.z * sgn * (halfW + 0.14);
      stonePositions.push({ x: sx, z: sz, yaw: Math.atan2(tan.x, tan.z) + (rng() - 0.5) * 0.25 });
    }
  }

  const curbGeo = new THREE.BoxGeometry(0.32, 0.14, 0.52);
  const curbMat = plainMaterial('#ffffff');
  const curbs = new THREE.InstancedMesh(curbGeo, curbMat, stonePositions.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  stonePositions.forEach((sp, i) => {
    dummy.position.set(sp.x, ground(sp.x, sp.z) + 0.055, sp.z);
    dummy.rotation.set(0, sp.yaw, (rng() - 0.5) * 0.08);
    dummy.scale.set(0.85 + rng() * 0.35, 0.8 + rng() * 0.45, 0.8 + rng() * 0.5);
    dummy.updateMatrix();
    curbs.setMatrixAt(i, dummy.matrix);
    col.set(i % 3 === 0 ? C.stoneLight : i % 3 === 1 ? '#b8ad94' : C.stoneMid);
    curbs.setColorAt(i, col);
  });
  curbs.instanceMatrix.needsUpdate = true;
  curbs.instanceColor.needsUpdate = true;
  curbs.castShadow = true;
  curbs.receiveShadow = true;
  group.add(curbs);

  return group;
}

// Clear winding irrigation ditch (arık) running along the RIGHT edge of the road
// from arrival (z=38) up to just before the tea house (z=14) and on the LEFT side
// from z=10 to the river — strictly CLEAR of the football pitch!
export function makeIrrigationDitch(road, mask) {
  const group = new THREE.Group();
  const ditchPoints = [];
  // Segment 1: right side of road from offscreen arrival (t=0.0) up to fountain (t=0.35)
  const seg1 = [];
  for (let i = 0; i <= 30; i++) {
    const t = lerp(0.0, 0.35, i / 30);
    const p = road.getPoint(t);
    const tan = road.getTangent(t);
    const right = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const wobble = Math.sin(i * 0.45) * 0.14;
    const q = p.clone().addScaledVector(right, 2.55 + wobble);
    q.y = ground(q.x, q.z) + 0.03;
    seg1.push(q);
    ditchPoints.push(q);
  }
  // Segment 2: left side of road between tea house and river (ends cleanly before river seat!)
  const seg2 = [];
  for (let i = 0; i <= 20; i++) {
    const t = lerp(0.41, 0.57, i / 20);
    const p = road.getPoint(t);
    const tan = road.getTangent(t);
    const left = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
    const wobble = Math.sin(i * 0.5) * 0.12;
    const q = p.clone().addScaledVector(left, 2.65 + wobble);
    q.y = ground(q.x, q.z) + 0.03;
    seg2.push(q);
    ditchPoints.push(q);
  }

  mask.setDitchSamples(ditchPoints);

  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      base: { value: new THREE.Color('#5a98cc') },
      foam: { value: new THREE.Color('#e8f4fa') },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float time; uniform vec3 base; uniform vec3 foam; varying vec2 vUv;
      void main() {
        float flow = fract(vUv.x * 16.0 + time * 0.55);
        float glint = step(0.86, flow) * step(0.25, vUv.y) * step(vUv.y, 0.75);
        float edge = step(0.85, abs(vUv.y * 2.0 - 1.0));
        vec3 col = mix(base, foam, max(glint * 0.75, edge * 0.25));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  for (const seg of [seg1, seg2]) {
    const verts = [];
    const uvs = [];
    const idx = [];
    const halfW = 0.34;
    for (let i = 0; i < seg.length; i++) {
      const p = seg[i];
      const next = seg[Math.min(seg.length - 1, i + 1)];
      const prev = seg[Math.max(0, i - 1)];
      const dir = next.clone().sub(prev).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const l = p.clone().addScaledVector(side, -halfW);
      const r = p.clone().addScaledVector(side, halfW);
      verts.push(l.x, l.y, l.z, r.x, r.y, r.z);
      uvs.push(i / (seg.length - 1), 0, i / (seg.length - 1), 1);
      if (i < seg.length - 1) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, waterMat);
    m.receiveShadow = false;
    m.castShadow = false;
    m.userData.noCastShadow = true;
    m.userData.noReceivedShadow = true;
    group.add(m);
  }

  group.userData.waterMat = waterMat;
  return group;
}

// Sculpted painterly tree canopies (echoing full-20.png's lush billowing foliage!)
// Uses dense layered rounded foliage puffs + crisp leaf texture cards so trees look
// thick, warm, and sculpted with clear 3-tone value separation (never confetti sticks!).
function leafBlobTexture(seed) {
  return canvasTexture(32, 32, (ctx) => {
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = '#ffffff';
    const r = mulberry32(seed);
    ctx.beginPath();
    ctx.arc(16, 16, 10, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r() * 0.4;
      const rad = 5 + r() * 4.5;
      ctx.beginPath();
      ctx.arc(16 + Math.cos(a) * rad, 16 + Math.sin(a) * rad, 5.5 + r() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

const LEAF_TEX = [leafBlobTexture(101), leafBlobTexture(202)];

const TREE_PALETTES = {
  mulberry: ['#2a5226', '#467a2f', '#72a83d'],
  poplar: ['#325a2b', '#558435', '#87ad46'],
  willow: ['#2f5d32', '#4f863c', '#7eb24f'],
  apricot: ['#35612a', '#5b8a36', '#8cb546'],
  pomegranate: ['#942b24', '#c9452c', '#ea7334'], // Vivid red-orange accent like full-20.png!
  goldAutumn: ['#9e6324', '#cf8c2d', '#efb842'], // Warm gold accent tree!
};

export function makeLeafCloud(rx, ry, rz, rng, kind = 'mulberry', count = 42, scaleBoost = 1.0) {
  const palette = (TREE_PALETTES[kind] || TREE_PALETTES.mulberry).map((c) => new THREE.Color(c));
  const geo = new THREE.IcosahedronGeometry(0.55, 1);
  const mat = plainMaterial('#ffffff', {}, { wind: 'leaf' });
  const meshInst = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  for (let i = 0; i < count; i++) {
    let x, y, z;
    if (kind === 'willow' && i < count * 0.55) {
      const a = (i / (count * 0.55)) * Math.PI * 2 + rng() * 0.3;
      const t = rng();
      const rad = rx * (0.55 + t * 0.48);
      x = Math.cos(a) * rad;
      z = Math.sin(a) * rad;
      y = ry * 0.45 - t * ry * 1.45;
    } else {
      const a = rng() * Math.PI * 2;
      const v = rng() * 2 - 1;
      const r = Math.sqrt(Math.max(0, 1 - v * v));
      const shell = 0.55 + rng() * 0.48;
      x = Math.cos(a) * r * rx * shell;
      z = Math.sin(a) * r * rz * shell;
      y = v * ry * shell;
    }

    const s = (0.65 + rng() * 0.65) * scaleBoost * (kind === 'poplar' ? 0.65 : 0.92);
    dummy.position.set(x, y, z);
    dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    dummy.scale.set(s * (0.9 + rng() * 0.3), s * (0.75 + rng() * 0.35), s * (0.9 + rng() * 0.3));
    dummy.updateMatrix();
    meshInst.setMatrixAt(i, dummy.matrix);

    // Paint clear 3-tone value separation: dark interior/bottom, rich mid, bright sunlit top-left
    const hScore = clamp((y / Math.max(0.1, ry)) * 0.5 + 0.5, 0, 1);
    const sunScore = clamp((-x / Math.max(0.1, rx)) * 0.3 + 0.5, 0, 1);
    const score = hScore * 0.68 + sunScore * 0.32;
    const toneIdx = score > 0.66 ? 2 : score > 0.33 ? 1 : 0;
    col.copy(palette[toneIdx]);
    col.offsetHSL((rng() - 0.5) * 0.018, 0, (rng() - 0.5) * 0.03);
    meshInst.setColorAt(i, col);
  }

  meshInst.instanceMatrix.needsUpdate = true;
  meshInst.instanceColor.needsUpdate = true;
  meshInst.castShadow = true;
  meshInst.receiveShadow = true;
  meshInst.userData.foliage = true;
  meshInst.layers.enable(1);
  return meshInst;
}

export function makeTree(rng, kind = 'mulberry', scale = 1.0, occluder = false) {
  const g = new THREE.Group();
  if (kind === 'poplar') {
    const h = (5.4 + rng() * 1.8) * scale;
    place(cyl(0.11 * scale, 0.19 * scale, h * 0.48, C.woodDark, 7), 0, h * 0.24, 0, g);
    const crown = makeLeafCloud(0.88 * scale, h * 0.38, 0.88 * scale, rng, 'poplar', 34, scale * 0.95);
    crown.position.y = h * 0.68;
    if (occluder) crown.userData.occluder = true;
    g.add(crown);
  } else if (kind === 'willow') {
    const h = 3.4 * scale;
    place(cyl(0.18 * scale, 0.3 * scale, h * 0.85, C.woodDark, 8), 0, h * 0.42, 0, g);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      g.add(
        beamBetween(
          V(0, h * 0.68, 0),
          V(Math.cos(a) * 1.1 * scale, h * 1.05, Math.sin(a) * 1.1 * scale),
          0.065 * scale,
          C.woodDark
        )
      );
    }
    const crown = makeLeafCloud(1.85 * scale, 1.45 * scale, 1.85 * scale, rng, 'willow', 48, scale * 0.95);
    crown.position.y = h * 1.1;
    if (occluder) crown.userData.occluder = true;
    g.add(crown);
  } else {
    // Broad orchard / mulberry / pomegranate / gold accent tree
    const h = (kind === 'mulberry' ? 4.2 : 3.2) * scale;
    place(cyl(0.16 * scale, 0.28 * scale, h * 0.62, C.woodDark, 8), 0, h * 0.31, 0, g);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5 + 0.4;
      g.add(
        beamBetween(
          V(0, h * 0.48, 0),
          V(Math.cos(a) * 0.95 * scale, h * 0.78, Math.sin(a) * 0.95 * scale),
          0.075 * scale,
          C.woodDark
        )
      );
    }
    const rx = (kind === 'mulberry' ? 2.4 : 1.55) * scale;
    const ry = (kind === 'mulberry' ? 1.35 : 1.1) * scale;
    const crown = makeLeafCloud(rx, ry, rx * 0.95, rng, kind, kind === 'mulberry' ? 56 : 36, scale);
    crown.position.y = h * 0.88;
    if (occluder) crown.userData.occluder = true;
    g.add(crown);

    if (kind === 'apricot') {
      const fruits = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(0.08 * scale, 0),
        plainMaterial(C.apricot),
        14
      );
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 14; i++) {
        const a = rng() * Math.PI * 2;
        const r = (0.4 + rng() * 0.95) * scale;
        dummy.position.set(
          Math.cos(a) * r,
          h * 0.85 + (rng() - 0.5) * 0.9 * scale,
          Math.sin(a) * r
        );
        dummy.updateMatrix();
        fruits.setMatrixAt(i, dummy.matrix);
      }
      fruits.instanceMatrix.needsUpdate = true;
      g.add(fruits);
    }
  }
  return g;
}

// Sculpted mossy boulder clusters (signature look of full-20.png!)
export function makeBoulderCluster(rng, count = 5, spread = 1.4, scale = 1.0) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const r = (0.34 + rng() * 0.44) * scale;
    const rock = mesh(new THREE.IcosahedronGeometry(r, 1), i % 2 ? C.stoneMid : '#8c8374', 0.04, mossyStoneMat);
    const a = (i / count) * Math.PI * 2 + rng() * 0.6;
    const d = i === 0 ? 0 : (0.35 + rng() * 0.65) * spread;
    rock.position.set(Math.cos(a) * d, r * 0.42, Math.sin(a) * d);
    rock.scale.set(1.0 + rng() * 0.45, 0.58 + rng() * 0.35, 0.9 + rng() * 0.4);
    rock.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);
  }
  return g;
}

// Delicate 1-px vertical pixel grass strokes (like full-20.png & full-45.png!)
// Strictly masked by WorldMask so ZERO tufts appear in water, road, pitch, or rooms.
function grassStrokeTexture() {
  return canvasTexture(24, 24, (ctx) => {
    ctx.clearRect(0, 0, 24, 24);
    const r = mulberry32(414);
    for (let i = 0; i < 5; i++) {
      const x = 3 + i * 4 + Math.floor(r() * 2);
      const h = 11 + Math.floor(r() * 10);
      ctx.fillStyle = i % 2 ? '#f4f8e0' : '#dce6c0';
      ctx.fillRect(x, 24 - h, 2, h);
    }
  });
}

function grassCardGeo() {
  const geo = new THREE.BufferGeometry();
  const p = [];
  const uv = [];
  const idx = [];
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI * 0.5;
    const dx = Math.cos(a) * 0.15;
    const dz = Math.sin(a) * 0.15;
    const b = p.length / 3;
    p.push(-dx, 0, -dz, dx, 0, dz, dx, 0.36, dz, -dx, 0.36, -dz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function makeGrass(rng, mask, count = 4200) {
  const mat = plainMaterial(
    '#ffffff',
    { map: grassStrokeTexture(), alphaTest: 0.45, side: THREE.DoubleSide },
    { wind: 'grass' }
  );
  const inst = new THREE.InstancedMesh(grassCardGeo(), mat, count);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  const greens = ['#3b6a29', '#528331', '#6e9d3b', '#86aa42'].map((c) => new THREE.Color(c));
  const drys = ['#bfa14a', '#cfa952', '#a88a3e', '#d6b963'].map((c) => new THREE.Color(c));

  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 10) {
    attempts++;
    const x = (rng() - 0.5) * 62;
    const z = 42 - rng() * 100;
    if (mask.isBlocked(x, z, 0.25)) continue;

    // Clump naturally so grass reads like painted patches (like full-45.png!)
    const clump = fbm2(x * 1.4, z * 1.4);
    const rDist = Math.abs(z - riverCenterZ(x));
    const dDist = mask.distanceToDitch(x, z);
    const nearWater = rDist < RIVER_HALF_WIDTH + 5.5 || dDist < 2.8;
    if (!nearWater && clump < 0.36 + rng() * 0.22) continue;

    const s = 0.55 + rng() * 0.55;
    const hs = nearWater ? 1.15 : 0.8;
    dummy.position.set(x, ground(x, z) - 0.01, z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(s, s * hs, s);
    dummy.updateMatrix();
    inst.setMatrixAt(placed, dummy.matrix);

    const villageGreen =
      nearWater || (Math.abs(x + 1) < 16 && z < 38 && z > -50 && noise2(x * 0.06, z * 0.06) > 0.34);
    col.copy(villageGreen ? greens[placed % greens.length] : drys[placed % drys.length]);
    col.offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.05);
    inst.setColorAt(placed, col);
    placed++;
  }

  inst.count = placed;
  inst.instanceMatrix.needsUpdate = true;
  inst.instanceColor.needsUpdate = true;
  inst.castShadow = false;
  inst.receiveShadow = false;
  inst.userData.noCastShadow = true;
  inst.userData.noReceivedShadow = true;
  inst.userData.foliage = true;
  inst.layers.enable(1);
  return inst;
}

// Wildflowers & little red/cream/gold accent dots sprinkled in lush meadows
export function makeWildflowers(rng, mask, count = 220) {
  const geo = new THREE.IcosahedronGeometry(0.075, 0);
  const mat = plainMaterial('#ffffff');
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const cols = ['#d94a38', '#f5dfa8', '#e6a83c', '#c86fa0'].map((c) => new THREE.Color(c));
  let n = 0;
  for (let i = 0; i < count * 8 && n < count; i++) {
    const x = (rng() - 0.5) * 44;
    const z = 39 - rng() * 90;
    if (mask.isBlocked(x, z, 0.5)) continue;
    dummy.position.set(x, ground(x, z) + 0.14, z);
    dummy.scale.setScalar(0.75 + rng() * 0.5);
    dummy.updateMatrix();
    inst.setMatrixAt(n, dummy.matrix);
    col.copy(cols[n % cols.length]);
    inst.setColorAt(n, col);
    n++;
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  inst.instanceColor.needsUpdate = true;
  inst.castShadow = false;
  inst.userData.noCastShadow = true;
  inst.userData.foliage = true;
  inst.layers.enable(1);
  return inst;
}

// Golden wheat patches & irrigated vegetable beds
export function makeAgriculture(rng) {
  const root = new THREE.Group();

  // Golden wheat fields placed cleanly outside the village corridor & pitch
  const wheatPlots = [
    [9.5, 31, 7.5, 7],
    [-16, 33, 8, 7],
    [22, 18, 9, 8],
    [-21, 7, 9, 8],
    [22, -22, 8.5, 7],
    [-19, -31, 8, 7],
  ];

  const wheatTex = canvasTexture(24, 24, (ctx) => {
    ctx.clearRect(0, 0, 24, 24);
    for (let i = 0; i < 5; i++) {
      const x = 3 + i * 4;
      ctx.fillStyle = '#d4aa4c';
      ctx.fillRect(x, 7, 2, 17);
      ctx.fillStyle = '#fae088';
      ctx.fillRect(x - 1, 2, 3, 7);
    }
  });

  const wheatMat = plainMaterial(
    '#ffffff',
    { map: wheatTex, alphaTest: 0.42, side: THREE.DoubleSide },
    { wind: 'wheat' }
  );
  const wGeo = grassCardGeo();
  wGeo.scale(1.25, 1.75, 1.25);

  const totalStalks = wheatPlots.length * 140;
  const stalks = new THREE.InstancedMesh(wGeo, wheatMat, totalStalks);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let n = 0;
  for (const [cx, cz, w, d] of wheatPlots) {
    const pad = place(box(w, 0.05, d, '#be9642', 0.03), cx, ground(cx, cz) + 0.01, cz, root);
    pad.castShadow = false;
    pad.userData.noCastShadow = true;
    for (let i = 0; i < 140; i++) {
      const sx = cx + (rng() - 0.5) * (w - 0.6);
      const sz = cz + (rng() - 0.5) * (d - 0.6);
      dummy.position.set(sx, ground(sx, sz) + 0.02, sz);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      const s = 0.8 + rng() * 0.35;
      dummy.scale.set(s, s * (0.9 + rng() * 0.35), s);
      dummy.updateMatrix();
      stalks.setMatrixAt(n, dummy.matrix);
      col.set(i % 4 === 0 ? '#f5d26c' : '#e0b548');
      stalks.setColorAt(n++, col);
    }
  }
  stalks.instanceMatrix.needsUpdate = true;
  stalks.instanceColor.needsUpdate = true;
  stalks.castShadow = false;
  stalks.receiveShadow = false;
  stalks.userData.noCastShadow = true;
  stalks.userData.foliage = true;
  stalks.layers.enable(1);
  root.add(stalks);

  // Neat lush vegetable garden plots beside houses (fully instanced: 2 draw calls instead of ~210!)
  const gardens = [
    [-7.5, 31, 5.2, 4.6],
    [8.2, 22, 4.6, 4.2],
    [-9.0, 5.5, 4.8, 5.2],
    [-9.5, -6.5, 5.0, 4.4],
    [-8.5, -24, 4.8, 4.6],
    [-8.5, -42, 4.8, 4.2],
    [8.5, -42, 4.8, 4.2],
  ];
  const bushList = [];
  const fruitList = [];
  for (const [cx, cz, w, d] of gardens) {
    const soil = place(box(w, 0.06, d, '#6d5239', 0.03), cx, ground(cx, cz) + 0.02, cz, root);
    soil.castShadow = false;
    soil.userData.noCastShadow = true;
    for (let row = 0; row < 4; row++) {
      const rz = cz + (row - 1.5) * (d * 0.21);
      for (let colIdx = 0; colIdx < 6; colIdx++) {
        const rx = cx + (colIdx - 2.5) * (w * 0.145);
        const gy = ground(rx, rz);
        const rad = 0.18 + rng() * 0.06;
        bushList.push({ x: rx, y: gy + 0.16, z: rz, rad, bright: row % 2 === 1 });
        if (rng() < 0.25) {
          fruitList.push({ x: rx + 0.06, y: gy + 0.24, z: rz + 0.04 });
        }
      }
    }
  }
  const bushInst = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    plainMaterial('#ffffff'),
    bushList.length
  );
  bushList.forEach((b, i) => {
    dummy.position.set(b.x, b.y, b.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(b.rad * 1.2, b.rad * 0.78, b.rad * 1.1);
    dummy.updateMatrix();
    bushInst.setMatrixAt(i, dummy.matrix);
    col.set(b.bright ? C.greenBright : C.greenMid);
    bushInst.setColorAt(i, col);
  });
  bushInst.instanceMatrix.needsUpdate = true;
  bushInst.instanceColor.needsUpdate = true;
  bushInst.castShadow = false;
  bushInst.userData.noCastShadow = true;
  root.add(bushInst);

  if (fruitList.length) {
    const fruitInst = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.055, 0),
      plainMaterial(C.rust),
      fruitList.length
    );
    fruitList.forEach((f, i) => {
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      fruitInst.setMatrixAt(i, dummy.matrix);
    });
    fruitInst.instanceMatrix.needsUpdate = true;
    fruitInst.castShadow = false;
    fruitInst.userData.noCastShadow = true;
    root.add(fruitInst);
  }

  return root;
}

// Walls: dry stone and weathered mud-brick
export function dryStoneWall(parent, x, z, length = 6, axis = 'x', height = 0.72, rng = Math.random) {
  const cols = Math.max(2, Math.floor(length / 0.52));
  const rows = Math.max(2, Math.round(height / 0.24));
  const stones = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    plainMaterial('#ffffff', {}, { moss: true }),
    cols * rows
  );
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  let n = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const along = (col - (cols - 1) / 2) * (length / cols) + (row % 2) * 0.14;
      const px = x + (axis === 'x' ? along : (rng() - 0.5) * 0.08);
      const pz = z + (axis === 'z' ? along : (rng() - 0.5) * 0.08);
      dummy.position.set(px, ground(px, pz) + 0.13 + row * 0.23, pz);
      dummy.rotation.set(rng() * 0.25, rng() * 3, rng() * 0.15);
      dummy.scale.set(axis === 'x' ? 0.31 : 0.21, 0.14 + rng() * 0.035, axis === 'z' ? 0.31 : 0.21);
      dummy.updateMatrix();
      stones.setMatrixAt(n, dummy.matrix);
      colour.set(row % 3 === 0 ? C.stoneLight : C.stoneMid).offsetHSL(0, 0, (rng() - 0.5) * 0.06);
      stones.setColorAt(n++, colour);
    }
  }
  stones.instanceMatrix.needsUpdate = true;
  stones.instanceColor.needsUpdate = true;
  stones.castShadow = true;
  stones.receiveShadow = true;
  parent.add(stones);
  return stones;
}

export function mudBrickWall(parent, x, z, length = 6, axis = 'x', height = 0.82) {
  const g = new THREE.Group();
  parent.add(g);
  const w = axis === 'x' ? length : 0.36;
  const d = axis === 'z' ? length : 0.36;
  const y = ground(x, z);
  place(box(w, height, d, C.mud, 0.05), x, y + height * 0.5, z, g);
  // Warm stone coping on top
  place(box(w + 0.06, 0.1, d + 0.06, C.stoneLight, 0.03), x, y + height + 0.04, z, g);
  return g;
}

// Limewash wall texture with subtle plaster wear & damp plinth
let cachedLimeMat = null;
export function limewashMaterial() {
  if (cachedLimeMat) return cachedLimeMat;
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    const r = mulberry32(1936);
    ctx.fillStyle = '#f3ebd8';
    ctx.fillRect(0, 0, w, h);
    // Warm mud-brick peek patches near corners and base
    for (let p = 0; p < 7; p++) {
      const px = Math.floor(p < 4 ? (p % 2 ? 4 : 108) : 24 + r() * 76);
      const py = Math.floor(86 + r() * 32);
      const pw = 6 + Math.floor(r() * 8);
      const ph = 4 + Math.floor(r() * 5);
      ctx.fillStyle = '#c8a57a';
      ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
      ctx.fillStyle = '#ad7c4e';
      ctx.fillRect(px, py, pw, ph);
    }
    // Stone plinth wash along bottom
    const grad = ctx.createLinearGradient(0, h * 0.8, 0, h);
    grad.addColorStop(0, 'rgba(130,115,92,0)');
    grad.addColorStop(1, 'rgba(116,104,88,0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
    for (let i = 0; i < 450; i++) {
      ctx.fillStyle = `rgba(110,88,62,${r() * 0.045})`;
      ctx.fillRect(r() * w, r() * h, 1, 1);
    }
  });
  cachedLimeMat = plainMaterial('#ffffff', { map: tex });
  return cachedLimeMat;
}

export function limeBox(w, h, d) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), limewashMaterial());
}

export function addRoof(parent, w, d, top, occluder = true) {
  const roof = place(box(w + 0.22, 0.18, d + 0.22, '#bd905d'), 0, top + 0.09, 0, parent);
  if (occluder) roof.userData.occluder = true;
  for (const z of [-d / 2, d / 2]) place(box(w + 0.26, 0.26, 0.18, '#c89e6b'), 0, top + 0.24, z, parent);
  for (const x of [-w / 2, w / 2]) place(box(0.18, 0.26, d, '#c89e6b'), x, top + 0.24, 0, parent);
  // Protruding timber roof beams (authentic Anatolian earthen roofs!)
  for (let i = 0; i < 4; i++) {
    const pole = cyl(0.048, 0.056, d + 0.85, C.woodDark, 6);
    pole.rotation.x = Math.PI / 2;
    place(pole, -w * 0.34 + i * (w * 0.225), top + 0.08, 0, parent);
  }
  return roof;
}

export function addWindow(parent, x, y, z, w = 0.92, h = 0.88, lightsOut = null) {
  place(box(w, h, 0.09, C.blue), x, y, z, parent);
  place(box(w - 0.16, h - 0.16, 0.1, '#262d36'), x, y, z + 0.03, parent);
  place(box(0.04, h - 0.16, 0.04, C.blueLight), x, y, z + 0.09, parent);
  place(box(w - 0.16, 0.04, 0.04, C.blueLight), x, y, z + 0.09, parent);
  // Warm sill
  place(box(w + 0.14, 0.07, 0.16, C.stoneLight), x, y - h * 0.5 - 0.02, z + 0.05, parent);
  if (lightsOut) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.2, h - 0.2),
      new THREE.MeshBasicMaterial({ color: '#ffd480' })
    );
    glow.position.set(x, y, z + 0.095);
    glow.visible = false;
    parent.add(glow);
    lightsOut.push(glow);
  }
}

export function addDoorFrame(parent, x, y, z, w = 1.08, h = 1.96, darkInterior = true) {
  place(box(w, h, 0.1, C.blue), x, y, z, parent);
  place(box(w - 0.18, h - 0.14, 0.11, darkInterior ? '#22262c' : C.blueLight), x, y - 0.02, z + 0.04, parent);
  place(box(w + 0.42, 0.14, 0.65, C.stoneLight), x, 0.07, z + 0.34, parent);
}

export function makeVillageHouse(parent, rng, x, z, style = 'lime', turn = 0, windowLights = []) {
  const g = new THREE.Group();
  g.position.set(x, ground(x, z), z);
  g.rotation.y = turn;
  parent.add(g);

  const w = 4.9 + rng() * 1.1;
  const d = 4.2 + rng() * 0.8;
  const h = style === 'balcony' ? 4.35 + rng() * 0.35 : 2.8 + rng() * 0.5;
  const body = style === 'mud' ? box(w, h, d, C.mud, 0.05) : limeBox(w, h, d);
  place(body, 0, h * 0.5, 0, g);
  addRoof(g, w, d, h, false);
  addDoorFrame(g, 0.0, 0.98, d * 0.5 + 0.03, 1.02, 1.9, false);

  if (style === 'balcony') {
    // Ground-floor windows flanking the door cleanly
    for (const xx of [-w * 0.32, w * 0.32]) {
      addWindow(g, xx, 1.32, d * 0.5 + 0.04, 0.78, 0.74, windowLights);
    }
    // Authentic upper-story wooden balcony with external timber staircase & cozy lookout chair!
    const deckY = 2.48;
    const bw = w * 0.78;
    const balD = 1.42;
    const zFront = d * 0.5 + balD;
    const stairX = w * 0.5 + 0.56;
    const stairZ0 = d * 0.5 - 2.15;
    const stairZ1 = d * 0.5 + 0.76;

    // Main balcony deck extending seamlessly into the right stair landing
    const deckLeft = -bw * 0.5;
    const deckRight = w * 0.5 + 1.08;
    const deckW = deckRight - deckLeft;
    const deckCx = (deckLeft + deckRight) * 0.5;
    place(box(deckW, 0.13, balD, C.woodWarm), deckCx, deckY, d * 0.5 + balD * 0.5, g);

    // Diagonal timber corbels (eliböğründe) under main balcony + sturdy corner posts under the stair landing
    for (const xx of [deckLeft + 0.36, 0, bw * 0.42]) {
      g.add(beamBetween(V(xx, deckY - 0.68, d * 0.5 + 0.04), V(xx, deckY - 0.04, zFront - 0.12), 0.055, C.woodDark));
    }
    for (const px of [w * 0.5 + 0.14, deckRight - 0.08]) {
      place(cyl(0.055, 0.068, deckY, C.woodDark, 7), px, deckY * 0.5, zFront - 0.1, g);
    }

    // Front balcony balustrade (full width) + left end rail + outer right landing rail (stair entry stays wide open!)
    const postCount = 9;
    for (let i = 0; i < postCount; i++) {
      const bx = lerp(deckLeft + 0.08, deckRight - 0.08, i / (postCount - 1));
      place(cyl(0.024, 0.028, 0.68, C.woodDark, 6), bx, deckY + 0.36, zFront - 0.06, g);
    }
    place(cyl(0.042, 0.042, deckW, C.woodWarm, 7), deckCx, deckY + 0.72, zFront - 0.06, g).rotation.z = Math.PI / 2;
    // Left side rail
    for (const sz of [d * 0.5 + 0.35, d * 0.5 + 0.85]) {
      place(cyl(0.024, 0.028, 0.68, C.woodDark, 6), deckLeft + 0.06, deckY + 0.36, sz, g);
    }
    place(cyl(0.04, 0.04, balD - 0.1, C.woodWarm, 7), deckLeft + 0.06, deckY + 0.72, d * 0.5 + balD * 0.5, g).rotation.x = Math.PI / 2;
    // Right landing outer rail (from stair top forward to front rail)
    place(cyl(0.024, 0.028, 0.68, C.woodDark, 6), deckRight - 0.06, deckY + 0.36, stairZ1 + 0.25, g);
    place(cyl(0.04, 0.04, zFront - stairZ1, C.woodWarm, 7), deckRight - 0.06, deckY + 0.72, (stairZ1 + zFront) * 0.5, g).rotation.x = Math.PI / 2;

    // External Anatolian timber staircase climbing up the +X wall onto the balcony landing!
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const sy = lerp(0.12, deckY - 0.06, t);
      const sz = lerp(stairZ0, stairZ1, t);
      place(box(1.02, 0.1, 0.34, C.woodWarm), stairX, sy, sz, g);
    }
    // Diagonal wooden stair stringers & outer sloped handrail
    for (const ox of [-0.46, 0.46]) {
      g.add(beamBetween(V(stairX + ox, 0.08, stairZ0 - 0.12), V(stairX + ox, deckY - 0.04, stairZ1 + 0.06), 0.055, C.woodDark));
    }
    g.add(beamBetween(V(stairX + 0.48, 0.78, stairZ0 - 0.05), V(stairX + 0.48, deckY + 0.72, stairZ1 + 0.04), 0.038, C.woodWarm));
    for (const f of [0.0, 0.35, 0.7, 1.0]) {
      const py = lerp(0.1, deckY, f);
      const pz = lerp(stairZ0 - 0.05, stairZ1 + 0.04, f);
      place(cyl(0.024, 0.028, 0.72, C.woodDark, 6), stairX + 0.48, py + 0.36, pz, g);
    }
    // Mid-stair support post down to ground
    place(cyl(0.05, 0.06, deckY * 0.55, C.woodDark, 7), stairX + 0.46, deckY * 0.27, lerp(stairZ0, stairZ1, 0.55), g);

    // Real upper balcony doorway behind the balcony!
    addDoorFrame(g, 0.15, deckY + 0.82, d * 0.5 + 0.03, 0.92, 1.56, true);
    // Bright woven kilim draped over the upper balcony rail!
    place(box(0.84, 0.68, 0.06, C.kilimRed), 0.42, deckY + 0.36, zFront + 0.02, g);
    place(box(0.84, 0.13, 0.07, C.gold), 0.42, deckY + 0.36, zFront + 0.025, g);
    place(box(0.84, 0.11, 0.07, C.kilimIndigo), 0.42, deckY + 0.14, zFront + 0.025, g);

    // Cozy wooden lookout chair on the left side of the balcony facing outward (+Z) to sit & watch the village!
    const chairX = deckLeft + 0.78;
    const chairZ = d * 0.5 + 0.66;
    const chair = new THREE.Group();
    chair.position.set(chairX, deckY + 0.065, chairZ);
    g.add(chair);
    for (const lx of [-0.2, 0.2]) {
      for (const lz of [-0.2, 0.2]) {
        place(cyl(0.024, 0.028, 0.4, C.woodDark, 6), lx, 0.2, lz, chair);
      }
    }
    place(box(0.5, 0.06, 0.48, C.woodWarm), 0, 0.41, 0, chair);
    place(box(0.42, 0.06, 0.4, C.kilimRed), 0, 0.46, 0.01, chair);
    place(box(0.5, 0.46, 0.055, C.woodDark), 0, 0.66, -0.21, chair);
    place(box(0.46, 0.07, 0.065, C.woodWarm), 0, 0.9, -0.21, chair);
    for (const sx of [-0.24, 0.24]) {
      place(box(0.055, 0.045, 0.44, C.woodWarm), sx, 0.62, -0.01, chair);
    }
    // Little geranium pot beside the balcony chair
    makeGeraniumTin(g, deckLeft + 0.26, deckY + 0.065, zFront - 0.3, 0.78);

    g.userData.balconyMeta = {
      w,
      d,
      deckY,
      deckLeft,
      deckRight,
      balD,
      stairX,
      stairZ0,
      stairZ1,
      chairLocal: V(chairX, deckY + 0.065, chairZ),
    };
  } else {
    for (const xx of [-w * 0.28, w * 0.28]) {
      addWindow(g, xx, h * 0.6, d * 0.5 + 0.04, 0.84, 0.78, windowLights);
    }
  }

  // Stacked firewood by the house corner
  for (let i = 0; i < 6; i++) {
    const log = cyl(0.08, 0.09, 0.9, C.woodDark, 6);
    log.rotation.z = Math.PI / 2;
    place(log, -w * 0.5 - 0.45, 0.1 + Math.floor(i / 2) * 0.14, -0.8 + (i % 2) * 0.22, g);
  }
  return g;
}

export function teaSign() {
  const tex = canvasTexture(96, 32, (ctx, w, h) => {
    ctx.fillStyle = '#b83c32';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f5e4bc';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    const glyphs = {
      C: ['0111', '1000', '1000', '1000', '0111'],
      A: ['0110', '1001', '1111', '1001', '1001'],
      Y: ['1001', '1001', '0110', '0100', '0100'],
    };
    ctx.fillStyle = '#fff3d4';
    ['C', 'A', 'Y'].forEach((l, k) => {
      glyphs[l].forEach((row, y) => {
        [...row].forEach((v, x) => {
          if (v === '1') ctx.fillRect(16 + k * 24 + x * 4, 7 + y * 3, 3, 3);
        });
      });
    });
    // Cedilla under Ç
    ctx.fillRect(22, 23, 3, 3);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.52), plainMaterial('#ffffff', { map: tex }));
}

export function makeTeaTable(x, z, baseY) {
  const g = new THREE.Group();
  place(cyl(0.62, 0.58, 0.09, C.woodWarm, 14), x, baseY + 0.64, z, g);
  place(cyl(0.09, 0.13, 0.6, C.woodDark, 8), x, baseY + 0.3, z, g);
  for (const dx of [-0.84, 0.84]) {
    const sgn = Math.sign(dx);
    // Wooden seat facing inward toward the table
    place(box(0.46, 0.07, 0.46, C.woodWarm), x + dx, baseY + 0.39, z, g);
    // Backrest positioned on the OUTER side (behind the seated person's back, leaving front/sides open!)
    place(box(0.06, 0.36, 0.46, C.woodDark), x + dx + sgn * 0.21, baseY + 0.6, z, g);
    for (const sx of [-0.17, 0.17]) {
      for (const zz of [-0.17, 0.17]) {
        place(cyl(0.028, 0.034, 0.38, C.woodDark, 6), x + dx + sx, baseY + 0.19, z + zz, g);
      }
    }
  }
  return g;
}

// Classic Turkish tulip tea glass (ince belli): subtle pinched waist, rounded lower belly & flared lip!
export function makeTeaSaucer(scale = 1.0) {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  place(cyl(0.145, 0.112, 0.026, C.chalk, 16), 0, -0.013, 0, g);
  const ring = place(mesh(new THREE.TorusGeometry(0.13, 0.0065, 4, 16), C.kilimRed, 0), 0, 0.002, 0, g);
  ring.rotation.x = Math.PI / 2;
  g.traverse((o) => {
    if (o.isMesh) {
      o.receiveShadow = false;
      o.userData.noReceivedShadow = true;
    }
  });
  return g;
}

export function makeTulipTeaGlass(scale = 1.0, withSaucer = true) {
  const g = new THREE.Group();
  g.scale.setScalar(scale);

  // Authentic big Turkish tea glass silhouette: full rounded base belly, tasteful subtle pinched waist (~24% narrower), flared tulip lip
  const glassPts = [
    new THREE.Vector2(0.044, 0.0),
    new THREE.Vector2(0.058, 0.018),
    new THREE.Vector2(0.076, 0.064),
    new THREE.Vector2(0.078, 0.098),
    new THREE.Vector2(0.064, 0.142),
    new THREE.Vector2(0.059, 0.168),
    new THREE.Vector2(0.066, 0.214),
    new THREE.Vector2(0.075, 0.256),
    new THREE.Vector2(0.077, 0.264),
  ];
  const shell = new THREE.Mesh(
    new THREE.LatheGeometry(glassPts, 18),
    plainMaterial('#eef7f5', { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })
  );
  shell.renderOrder = 3;
  g.add(shell);

  // Thick crystal glass bottom puck so the base reads clearly on the white saucer
  const baseGlass = place(cyl(0.052, 0.044, 0.022, '#dcebe8', 16), 0, 0.011, 0, g);
  baseGlass.material = plainMaterial('#e4f0ee', { transparent: true, opacity: 0.55 });

  // Matching tulip-curved deep glowing ruby tea liquid inside (tavşan kanı!)
  const liquid = new THREE.Group();
  const liqPts = [
    new THREE.Vector2(0.001, 0.018),
    new THREE.Vector2(0.048, 0.022),
    new THREE.Vector2(0.069, 0.064),
    new THREE.Vector2(0.071, 0.098),
    new THREE.Vector2(0.057, 0.142),
    new THREE.Vector2(0.053, 0.168),
    new THREE.Vector2(0.055, 0.204),
    new THREE.Vector2(0.001, 0.206),
  ];
  const liqBody = new THREE.Mesh(new THREE.LatheGeometry(liqPts, 18), plainMaterial('#a8240c'));
  liquid.add(liqBody);
  const topDisc = place(cyl(0.055, 0.055, 0.01, '#dc521c', 16), 0, 0.205, 0, liquid);
  topDisc.material = plainMaterial('#dc521c');
  g.add(liquid);

  // Crisp bright highlight rim
  const rim = place(mesh(new THREE.TorusGeometry(0.075, 0.0055, 5, 16), C.chalk, 0), 0, 0.262, 0, g);
  rim.rotation.x = Math.PI / 2;

  // White porcelain saucer with subtle red trim ring
  if (withSaucer) {
    place(cyl(0.145, 0.112, 0.026, C.chalk, 16), 0, -0.013, 0, g);
    const ring = place(mesh(new THREE.TorusGeometry(0.13, 0.0065, 4, 16), C.kilimRed, 0), 0, 0.002, 0, g);
    ring.rotation.x = Math.PI / 2;
  }

  g.traverse((o) => {
    if (o.isMesh) {
      o.receiveShadow = false;
      o.userData.noReceivedShadow = true;
    }
  });

  g.userData = { liquid, shell };
  return g;
}

export function makeGeraniumTin(parent, x, y, z, scale = 1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  place(cyl(0.16 * scale, 0.13 * scale, 0.3 * scale, C.chalk, 10), 0, 0.15 * scale, 0, g);
  place(cyl(0.13 * scale, 0.13 * scale, 0.03 * scale, C.woodDark, 10), 0, 0.3 * scale, 0, g);
  for (let i = 0; i < 5; i++) {
    const a = i * 2.39;
    place(
      cyl(0.015 * scale, 0.02 * scale, 0.28 * scale, C.greenDark, 5),
      Math.sin(a) * 0.08 * scale,
      0.4 * scale,
      Math.cos(a) * 0.08 * scale,
      g
    ).rotation.z = Math.sin(a) * 0.2;
    place(
      sphere(0.068 * scale, i % 2 ? '#d93d32' : '#ef6552', 0),
      Math.sin(a) * 0.11 * scale,
      0.56 * scale,
      Math.cos(a) * 0.11 * scale,
      g
    );
  }
  return g;
}

export function makeFountain(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, ground(x, z), z);
  parent.add(g);
  place(box(2.3, 1.65, 0.56, C.stoneLight), 0, 0.82, 0, g);
  place(box(2.48, 0.14, 0.68, C.stoneMid), 0, 1.68, 0, g);
  place(box(0.84, 1.05, 0.04, '#5a6e72'), 0, 0.74, 0.29, g);
  place(cyl(0.05, 0.06, 0.55, C.woodDark, 8), 0, 1.12, 0.48, g).rotation.x = Math.PI / 2;
  place(cyl(0.96, 1.08, 0.32, C.stoneMid, 14), 0, 0.16, 1.05, g);
  const basin = place(cyl(0.8, 0.8, 0.02, C.teal, 16), 0, 0.32, 1.05, g);
  basin.material = plainMaterial('#5a98cc');
  const stream = place(box(0.04, 0.75, 0.04, C.foam), 0, 0.74, 0.75, g);
  g.userData.stream = stream;
  return g;
}

export function makeStorkNest(parent, x, z) {
  const y = ground(x, z) + 5.5;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  place(cyl(0.75, 0.6, 0.24, C.woodDark, 12), 0, 0, 0, g);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.add(
      beamBetween(
        V(Math.cos(a) * 0.28, 0.1, Math.sin(a) * 0.28),
        V(Math.cos(a + 0.5) * 0.84, 0.04 + (i % 3) * 0.05, Math.sin(a + 0.5) * 0.84),
        0.026,
        C.earth
      )
    );
  }
  const bird = new THREE.Group();
  bird.position.y = 0.28;
  g.add(bird);
  const body = place(sphere(0.3, C.chalk, 1), 0, 0.44, 0, bird);
  body.scale.set(0.75, 1.2, 0.86);
  for (const s of [-1, 1]) {
    place(sphere(0.18, C.dark, 1), s * 0.17, 0.42, -0.04, bird).scale.set(0.55, 1, 0.9);
    place(cyl(0.018, 0.022, 0.56, C.rust, 6), s * 0.09, 0.04, 0.03, bird);
  }
  const neck = new THREE.Group();
  neck.position.set(0, 0.64, 0.1);
  bird.add(neck);
  place(cyl(0.055, 0.075, 0.56, C.chalk, 8), 0, 0.22, 0, neck).rotation.x = -0.22;
  place(sphere(0.11, C.chalk, 1), 0, 0.52, 0.13, neck);
  const beak = place(mesh(new THREE.ConeGeometry(0.036, 0.34, 6), C.rust), 0, 0.51, 0.34, neck);
  beak.rotation.x = Math.PI / 2;
  return { bird, neck };
}

export function makeLaundry(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, ground(x, z), z);
  parent.add(g);
  for (const xx of [-2.1, 2.1]) place(cyl(0.048, 0.068, 2.25, C.woodDark, 7), xx, 1.12, 0, g);
  g.add(beamBetween(V(-2.1, 2.08, 0), V(2.1, 2.0, 0), 0.014, C.dark));
  const cloths = [];
  const colors = ['#f2ead8', '#4f8db8', '#d4523c', '#ebb94d'];
  for (let i = 0; i < 4; i++) {
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.68, 0.88, 2, 2),
      plainMaterial(colors[i], { side: THREE.DoubleSide })
    );
    cloth.position.set(-1.35 + i * 0.9, 1.56, 0);
    cloth.userData.phase = i * 0.9;
    g.add(cloth);
    cloths.push(cloth);
  }
  return cloths;
}

export function makeBlueCart(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, ground(x, z), z);
  g.rotation.y = -0.38;
  parent.add(g);
  place(box(1.65, 0.22, 2.35, C.blue), 0, 0.66, 0, g);
  for (const xx of [-0.84, 0.84]) place(box(0.1, 0.62, 2.25, C.blue), xx, 0.98, 0, g);
  place(box(1.7, 0.62, 0.1, C.blue), 0, 0.98, -1.13, g);
  for (const xx of [-1.02, 1.02]) {
    const wheel = place(cyl(0.52, 0.52, 0.11, C.woodDark, 14), xx, 0.52, 0.28, g);
    wheel.rotation.z = Math.PI / 2;
    const hub = place(cyl(0.16, 0.16, 0.15, C.woodWarm, 10), xx, 0.52, 0.28, g);
    hub.rotation.z = Math.PI / 2;
  }
  for (const xx of [-0.55, 0.55]) g.add(beamBetween(V(xx, 0.65, 1), V(xx, 0.28, 3.2), 0.045, C.woodWarm));
  return g;
}

export function makeChicken(parent, rng, x, z) {
  const g = new THREE.Group();
  g.position.set(x, ground(x, z), z);
  parent.add(g);
  place(sphere(0.145, C.chalk, 1), 0, 0.22, 0, g);
  const head = new THREE.Group();
  head.position.set(0, 0.35, 0.1);
  g.add(head);
  place(sphere(0.078, C.chalk, 1), 0, 0, 0, head);
  place(sphere(0.03, C.kilimRed, 0), 0, 0.08, -0.01, head);
  place(mesh(new THREE.ConeGeometry(0.026, 0.09, 4), C.apricot), 0, 0, 0.095, head).rotation.x = Math.PI / 2;
  for (const xx of [-0.055, 0.055]) place(cyl(0.014, 0.014, 0.17, C.apricot, 5), xx, 0.085, 0, g);
  g.userData.phase = rng() * 6;
  return { g, head };
}

export function makeSheep(parent, rng, x, z) {
  const g = new THREE.Group();
  g.position.set(x, ground(x, z), z);
  g.rotation.y = rng() * 6;
  parent.add(g);
  place(sphere(0.32, C.chalk, 1), 0, 0.44, 0, g).scale.set(1.05, 0.9, 1.35);
  for (let i = 0; i < 4; i++) {
    place(sphere(0.16, C.chalk, 1), (rng() - 0.5) * 0.4, 0.5 + (rng() - 0.5) * 0.16, (rng() - 0.5) * 0.5, g);
  }
  place(sphere(0.13, C.dark, 1), 0, 0.43, 0.48, g).scale.set(0.75, 1, 1);
  for (const xx of [-0.18, 0.18]) {
    for (const zz of [-0.22, 0.22]) place(cyl(0.028, 0.032, 0.32, C.dark, 6), xx, 0.16, zz, g);
  }
  return g;
}

export function makeAirMotes(rng, count = 48) {
  const geo = new THREE.BufferGeometry();
  const a = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    a[i * 3] = (rng() - 0.5) * 44;
    a[i * 3 + 2] = 38 - rng() * 92;
    a[i * 3 + 1] = ground(a[i * 3], a[i * 3 + 2]) + 0.9 + rng() * 5.2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = 1.5; }`,
    fragmentShader: `void main(){ gl_FragColor = vec4(1.0, 0.92, 0.68, 0.38); }`,
  });
  return new THREE.Points(geo, mat);
}

// Dense 360-degree surrounding Anatolian woodland ring outside the village radius
// so dragging the camera in any direction reveals warm tree-clad hills instead of empty plains!
export function makePerimeterForest(rng) {
  const group = new THREE.Group();
  const placements = [];
  const riverPad = RIVER_HALF_WIDTH + 3.2;

  const treeCount = IS_MOBILE ? 200 : 420;
  for (let i = 0; i < treeCount; i++) {
    const angle = rng() * Math.PI * 2;
    // Village core is an oval centered at (1, -5) with rx ~ 23, rz ~ 52
    const ring = rng();
    const rx = 25 + ring * 54;
    const rz = 54 + ring * 44;
    const x = 1.0 + Math.cos(angle) * rx + (rng() - 0.5) * 6;
    const z = -5.0 + Math.sin(angle) * rz + (rng() - 0.5) * 6;

    // Keep core village corridor, arrival road, river channel, and small mosque hillside clear
    if (Math.abs(x - 1.0) < 22.5 && z > -53 && z < 45) continue;
    if (Math.abs(x - 1.0) < 6.5 && z >= 45 && z < 60) continue; // Arrival road entry vista
    if (Math.abs(z - riverCenterZ(x)) < riverPad) continue;
    if (Math.hypot(x + 29.0, z + 24.5) < 7.8) continue; // Keep small village mosque & minaret clean

    const kindRoll = rng();
    const kind =
      kindRoll < 0.32
        ? 'poplar'
        : kindRoll < 0.64
        ? 'mulberry'
        : kindRoll < 0.84
        ? 'apricot'
        : kindRoll < 0.94
        ? 'goldAutumn'
        : 'pomegranate';
    placements.push({ x, z, y: ground(x, z), kind, scale: 0.88 + rng() * 0.58, rot: rng() * Math.PI * 2 });
  }

  const count = placements.length;
  if (!count) return group;

  // Instanced trunks
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.24, 2.8, 6);
  const trunkInst = new THREE.InstancedMesh(trunkGeo, plainMaterial(C.woodDark), count);
  // 3 stacked instanced foliage puffs per tree for rich billowing woodland silhouettes
  const puffGeo = new THREE.IcosahedronGeometry(1.05, 1);
  const puffMat = plainMaterial('#ffffff', {}, { wind: 'leaf' });
  const puffInst = new THREE.InstancedMesh(puffGeo, puffMat, count * 3);

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  placements.forEach((p, idx) => {
    const isPoplar = p.kind === 'poplar';
    const th = (isPoplar ? 1.45 : 1.0) * p.scale;
    dummy.position.set(p.x, p.y + 1.3 * th, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.set(p.scale * (isPoplar ? 0.72 : 1.0), th, p.scale * (isPoplar ? 0.72 : 1.0));
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    const pal = TREE_PALETTES[p.kind] || TREE_PALETTES.mulberry;
    const crownBaseY = p.y + (isPoplar ? 3.2 : 2.65) * p.scale;
    const offsets = isPoplar
      ? [
          [0, 0.0, 0, 0.92, 1.45, 0.92],
          [0.14, 1.25, -0.1, 0.76, 1.35, 0.76],
          [-0.1, 2.35, 0.08, 0.54, 1.05, 0.54],
        ]
      : [
          [-0.45, 0.0, 0.25, 1.48, 1.08, 1.42],
          [0.52, 0.28, -0.22, 1.36, 1.02, 1.32],
          [-0.08, 0.92, -0.05, 1.26, 0.96, 1.22],
        ];

    for (let k = 0; k < 3; k++) {
      const [ox, oy, oz, sx, sy, sz] = offsets[k];
      dummy.position.set(p.x + ox * p.scale, crownBaseY + oy * p.scale, p.z + oz * p.scale);
      dummy.rotation.set(0.2 * k, p.rot + k * 1.1, 0.12 * (k - 1));
      dummy.scale.set(sx * p.scale, sy * p.scale, sz * p.scale);
      dummy.updateMatrix();
      puffInst.setMatrixAt(idx * 3 + k, dummy.matrix);
      col.set(pal[k]);
      col.offsetHSL((rng() - 0.5) * 0.015, 0, (rng() - 0.5) * 0.035);
      puffInst.setColorAt(idx * 3 + k, col);
    }
  });

  trunkInst.instanceMatrix.needsUpdate = true;
  trunkInst.castShadow = false;
  trunkInst.receiveShadow = true;
  trunkInst.userData.noCastShadow = true;

  puffInst.instanceMatrix.needsUpdate = true;
  puffInst.instanceColor.needsUpdate = true;
  puffInst.castShadow = false;
  puffInst.receiveShadow = true;
  puffInst.userData.noCastShadow = true;
  puffInst.userData.foliage = true;
  puffInst.layers.enable(1);

  group.add(trunkInst);
  group.add(puffInst);
  return group;
}

// Sculpted silvery-blue Anatolian river trout with forked tail, fins & bright eye!
export function makeDetailedFish(scale = 1.0) {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  const body = place(sphere(0.11, '#b8d6e4', 2), 0, 0, 0, g);
  body.scale.set(0.46, 0.58, 1.65);
  // Warm silvery belly
  const belly = place(sphere(0.095, '#eef6fa', 1), 0, -0.024, 0.01, g);
  belly.scale.set(0.42, 0.42, 1.42);
  // Dorsal fin
  const dorsal = place(box(0.016, 0.065, 0.11, '#7ea8be'), 0, 0.072, -0.01, g);
  dorsal.rotation.x = -0.25;
  // Forked tail pivot (flaps dynamically when caught!)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, -0.17);
  g.add(tailPivot);
  const tailTop = place(box(0.014, 0.065, 0.09, '#8cb4c8'), 0, 0.028, -0.045, tailPivot);
  tailTop.rotation.x = 0.42;
  const tailBot = place(box(0.014, 0.065, 0.09, '#8cb4c8'), 0, -0.028, -0.045, tailPivot);
  tailBot.rotation.x = -0.42;
  // Eyes & tiny speckle spots
  for (const side of [-1, 1]) {
    place(sphere(0.016, '#231e2c', 0), side * 0.042, 0.018, 0.115, g);
    place(sphere(0.012, '#d46e48', 0), side * 0.048, 0.012, 0.02, g);
    place(sphere(0.011, '#d46e48', 0), side * 0.046, 0.008, -0.045, g);
  }
  g.userData = { tailPivot };
  return g;
}

// Authentic blistered Anatolian tandır flatbread texture (golden crust, charred bubbles, flour & seeds!)
let cachedBreadMat = null;
export function flatbreadMaterial() {
  if (cachedBreadMat) return cachedBreadMat;
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    const r = mulberry32(404);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, w * 0.5);
    grad.addColorStop(0, '#f0c574');
    grad.addColorStop(0.68, '#e3ac56');
    grad.addColorStop(0.92, '#c8863a');
    grad.addColorStop(1, '#9d5d28');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle concentric hand-pressed finger dimples
    ctx.strokeStyle = 'rgba(165, 102, 42, 0.25)';
    ctx.lineWidth = 2;
    for (const rad of [18, 34, 48]) {
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Irregular golden-brown & charred tandır oven blisters!
    for (let i = 0; i < 28; i++) {
      const a = r() * Math.PI * 2;
      const dist = 6 + r() * 48;
      const bx = cx + Math.cos(a) * dist;
      const by = cy + Math.sin(a) * dist;
      const br = 2.5 + r() * 6.5;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(92, 45, 18, 0.72)' : 'rgba(156, 86, 32, 0.52)';
      ctx.beginPath();
      ctx.ellipse(bx, by, br, br * (0.65 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      if (i % 4 === 0) {
        ctx.fillStyle = 'rgba(255, 224, 152, 0.35)';
        ctx.beginPath();
        ctx.arc(bx - 1, by - 1, br * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sesame & nigella (çörek otu) seeds + subtle flour dusting
    for (let i = 0; i < 65; i++) {
      const a = r() * Math.PI * 2;
      const dist = r() * 54;
      const sx = cx + Math.cos(a) * dist;
      const sy = cy + Math.sin(a) * dist;
      ctx.fillStyle = i % 3 === 0 ? '#2f2520' : i % 3 === 1 ? '#f8ecd0' : 'rgba(255,248,230,0.45)';
      ctx.fillRect(Math.floor(sx), Math.floor(sy), 2, i % 3 === 2 ? 2 : 1);
    }
  });
  cachedBreadMat = plainMaterial('#ffffff', { map: tex });
  return cachedBreadMat;
}

// Detailed 3-piece tearable tandır flatbread with puffy blistered crust & soft torn interior!
export function makeDetailedFlatbread(radius = 0.25) {
  const root = new THREE.Group();
  const mat = flatbreadMaterial();
  const pieces = [];

  for (let i = 0; i < 3; i++) {
    const piece = new THREE.Group();
    const startA = (i * Math.PI * 2) / 3;
    const sweep = (Math.PI * 2) / 3 - 0.05;
    const midA = startA + sweep * 0.5;

    const wedge = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.02, 0.048, 10, 1, false, startA, sweep),
      mat
    );
    piece.add(wedge);

    // Puffy crust blisters along the outer rim of each piece
    for (let b = 0; b < 3; b++) {
      const ba = startA + (b + 0.5) * (sweep / 3);
      const puff = place(
        sphere(0.042 + (b % 2) * 0.012, b === 1 ? '#b87232' : '#e8b664', 1),
        Math.cos(ba) * radius * 0.72,
        0.022,
        Math.sin(ba) * radius * 0.72,
        piece
      );
      puff.scale.set(1.25, 0.45, 1.15);
    }

    piece.userData.midAngle = midA;
    piece.userData.homePos = piece.position.clone();
    root.add(piece);
    pieces.push(piece);
  }
  root.userData.pieces = pieces;
  return root;
}

// Charming small Central Anatolian village mosque (köy camii) with lead dome, entrance portico & slender minaret
// Placed on the left hillside so it reveals itself gracefully when zoomed out or looking west!
export function makeVillageMosque(parent, x, z, windowLights = []) {
  const g = new THREE.Group();
  const y = ground(x, z);
  g.position.set(x, y, z);
  g.rotation.y = 0.34;
  parent.add(g);

  // Stone foundation plinth so it sits solidly on the hillside slope
  place(box(5.0, 0.75, 5.4, C.stoneMid, 0.03), 0, 0.12, 0, g);

  // Compact whitewashed prayer hall
  const w = 4.2;
  const h = 2.7;
  const d = 4.2;
  place(limeBox(w, h, d), 0, 0.45 + h * 0.5, 0, g);
  // Subtle stone cornice belt
  place(box(w + 0.22, 0.14, d + 0.22, C.stoneLight, 0.02), 0, 0.45 + h + 0.04, 0, g);

  // Octagonal drum + classic lead-blue hemispherical dome + golden finial (alem)
  place(cyl(1.48, 1.56, 0.46, C.chalk, 8), 0, 0.45 + h + 0.3, 0, g);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.48, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
    plainMaterial('#677686')
  );
  dome.position.set(0, 0.45 + h + 0.5, 0);
  g.add(dome);
  place(cyl(0.03, 0.05, 0.58, C.gold, 6), 0, 0.45 + h + 2.18, 0, g);
  place(sphere(0.11, C.gold, 1), 0, 0.45 + h + 2.38, 0, g);

  // Small welcoming front portico (son cemaat yeri) facing the village (+X/+Z)
  place(box(3.2, 0.14, 1.25, '#677686'), 0, 0.45 + 2.15, d * 0.5 + 0.55, g);
  for (const px of [-1.35, -0.45, 0.45, 1.35]) {
    place(cyl(0.065, 0.08, 2.05, C.chalk, 7), px, 0.45 + 1.04, d * 0.5 + 1.05, g);
  }
  addDoorFrame(g, 0, 0.45 + 0.92, d * 0.5 + 0.03, 0.92, 1.78, true);

  // Small arched village mosque windows on front & east (village-facing) sides
  for (const sx of [-1.25, 1.25]) {
    addWindow(g, sx, 0.45 + 1.48, d * 0.5 + 0.04, 0.62, 0.84, windowLights);
  }
  const eastWinGroup = new THREE.Group();
  eastWinGroup.rotation.y = Math.PI * 0.5;
  g.add(eastWinGroup);
  for (const sz of [-1.1, 1.1]) {
    addWindow(eastWinGroup, sz, 0.45 + 1.48, w * 0.5 + 0.04, 0.62, 0.84, windowLights);
  }

  // Slender Anatolian minaret rising beside the northeast corner with a climbable spiral staircase & walkable şerefe balcony!
  const mx = w * 0.5 + 1.35;
  const mz = d * 0.5 - 0.35;
  // Low stone plinth connecting mosque courtyard cleanly to the minaret base
  place(box(1.5, 0.45, 1.4, C.stoneMid, 0.03), w * 0.5 + 0.65, 0.16, mz, g);
  // Square cut-stone base (kaide) + chamfered transition
  place(box(1.12, 2.2, 1.12, C.stoneLight, 0.025), mx, 0.45 + 1.1, mz, g);
  place(cyl(0.45, 0.62, 0.65, C.chalk, 8), mx, 0.45 + 2.52, mz, g);
  // Whitewashed cylindrical shaft (gövde)
  place(cyl(0.38, 0.45, 4.95, C.chalk, 12), mx, 0.45 + 5.28, mz, g);

  // Wider walkable carved balcony (şerefe) with stone corbel & low parapet rim (open where spiral stairs arrive!)
  const balconyY = 8.15;
  const balconyR = 1.34;
  place(cyl(balconyR, 0.46, 0.42, C.stoneLight, 16), mx, balconyY - 0.25, mz, g);
  place(cyl(balconyR, balconyR, 0.14, C.chalk, 16), mx, balconyY - 0.05, mz, g);
  const startLocalAngle = 0.25;
  const totalAngle = Math.PI * 3.0;
  const topArriveAngle = startLocalAngle + totalAngle;
  // Parapet posts & curved rail segments around şerefe (leaving a clean open entry gap at topArriveAngle!)
  const railCount = 14;
  for (let i = 0; i < railCount; i++) {
    const a = (i / railCount) * Math.PI * 2;
    const diff = Math.abs(Math.atan2(Math.sin(a - topArriveAngle), Math.cos(a - topArriveAngle)));
    if (diff < 0.42) continue;
    const px = mx + Math.cos(a) * (balconyR - 0.08);
    const pz = mz + Math.sin(a) * (balconyR - 0.08);
    place(cyl(0.032, 0.036, 0.62, C.stoneLight, 6), px, balconyY + 0.32, pz, g);
    const a2 = ((i + 1) / railCount) * Math.PI * 2;
    const diff2 = Math.abs(Math.atan2(Math.sin(a2 - topArriveAngle), Math.cos(a2 - topArriveAngle)));
    if (diff2 >= 0.42) {
      g.add(
        beamBetween(
          V(px, balconyY + 0.62, pz),
          V(mx + Math.cos(a2) * (balconyR - 0.08), balconyY + 0.62, mz + Math.sin(a2) * (balconyR - 0.08)),
          0.036,
          C.woodWarm
        )
      );
    }
  }

  // Climbable spiral wooden-and-stone staircase winding 1.5 turns right up the minaret shaft to the şerefe!
  const rSpiral = 0.94;
  const yBottom = 0.25;
  const stepCount = 30;
  let prevRailPt = null;
  for (let i = 0; i <= stepCount; i++) {
    const u = i / stepCount;
    const a = startLocalAngle + u * totalAngle;
    const sy = lerp(yBottom, balconyY - 0.04, u);
    const sx = mx + Math.cos(a) * rSpiral;
    const sz = mz + Math.sin(a) * rSpiral;
    const tread = place(box(0.68, 0.09, 0.34, i % 4 === 0 ? C.stoneLight : C.woodWarm), sx, sy, sz, g);
    tread.rotation.y = -a;
    // Support bracket anchored into the minaret shaft
    g.add(beamBetween(V(mx + Math.cos(a) * 0.42, sy - 0.28, mz + Math.sin(a) * 0.42), V(mx + Math.cos(a) * (rSpiral + 0.28), sy - 0.04, mz + Math.sin(a) * (rSpiral + 0.28)), 0.026, C.woodDark));
    // Outer spiral handrail posts & continuous sloped rail
    const rx = mx + Math.cos(a) * (rSpiral + 0.3);
    const rz = mz + Math.sin(a) * (rSpiral + 0.3);
    const railPt = V(rx, sy + 0.68, rz);
    if (i % 2 === 0) {
      place(cyl(0.022, 0.026, 0.68, C.woodDark, 5), rx, sy + 0.34, rz, g);
    }
    if (prevRailPt) {
      g.add(beamBetween(prevRailPt, railPt, 0.028, C.woodWarm));
    }
    prevRailPt = railPt;
  }

  // Upper lantern drum (petek) + conical lead cap (külah) + gold finial!
  place(cyl(0.28, 0.33, 1.55, C.chalk, 10), mx, balconyY + 0.82, mz, g);
  place(mesh(new THREE.ConeGeometry(0.42, 1.75, 12), '#5b6a7c'), mx, balconyY + 2.45, mz, g);
  place(cyl(0.022, 0.032, 0.48, C.gold, 6), mx, balconyY + 3.52, mz, g);
  place(sphere(0.08, C.gold, 0), mx, balconyY + 3.7, mz, g);

  // Small low stone courtyard wall beside the mosque
  place(box(0.45, 0.52, 2.4, C.stoneLight), -w * 0.5 - 0.6, 0.52, d * 0.5 + 0.2, g);

  g.userData.minaretMeta = {
    mx,
    mz,
    turn: 0.34,
    rSpiral,
    yBottom,
    yTop: balconyY + 0.02,
    startLocalAngle,
    totalAngle,
    balconyR,
  };
  return g;
}

export { LEAF_TEX };
