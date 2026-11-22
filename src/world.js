import * as THREE from 'three';
import {
  C,
  V,
  TIME_OF_DAY,
  ROAD_CONTROL_XZ,
  ground,
  riverCenterZ,
  riverSurfaceY,
  RIVER_HALF_WIDTH,
  WorldMask,
  mesh,
  box,
  sphere,
  cyl,
  capsule,
  place,
  beamBetween,
  matte,
  mossyStoneMat,
  canvasTexture,
  plainMaterial,
  clamp,
  lerp,
  smooth,
  IS_MOBILE,
} from './palette.js';
import { makeFigure, makeCat, animateFigure, faceFigure, setPose } from './figures.js';
import {
  makeTerrain,
  makeRoad,
  makeIrrigationDitch,
  makeTree,
  makeBoulderCluster,
  makeGrass,
  makeWildflowers,
  makeAgriculture,
  dryStoneWall,
  mudBrickWall,
  limeBox,
  addRoof,
  addWindow,
  addDoorFrame,
  makeVillageHouse,
  teaSign,
  makeTeaTable,
  makeTeaSaucer,
  makeTulipTeaGlass,
  makeGeraniumTin,
  makeFountain,
  makeStorkNest,
  makeLaundry,
  makeBlueCart,
  makeChicken,
  makeSheep,
  makeAirMotes,
  makePerimeterForest,
  makeDetailedFish,
  makeDetailedFlatbread,
  flatbreadMaterial,
  makeVillageMosque,
} from './environment-art.js';
import {
  compileToonArt,
  applyToonShader,
  artTime,
  sunColor,
  midColor,
  shadowTint,
  warmLightPos,
  warmLightIntensity,
} from './art-shader.js';

function points(count, color, size = 0.06, opacity = 0.72) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

// Crisp high-contrast 5x5 pixel diamond marker (gold fill + deep plum outline)
// Readable against lime walls, straw dirt, and sparkling river water!
function makeMarkerTexture() {
  const sz = 7;
  const px = new Uint8Array(sz * sz * 4);
  const setPx = (x, y, r, g, b, a = 255) => {
    const i = (y * sz + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const d = Math.abs(x - 3) + Math.abs(y - 3);
      if (d === 3) setPx(x, y, 44, 36, 72, 255); // Crisp dark plum outline
      else if (d <= 2) setPx(x, y, 255, 224, 130, 255); // Warm gold fill
      if (d === 0) setPx(x, y, 255, 250, 225, 255); // Bright cream sparkle core
    }
  }
  const tex = new THREE.DataTexture(px, sz, sz, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export class World {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.figures = [];
    this.interactables = [];
    this.interactiveMeshes = [];
    this.byId = new Map();
    this.puffs = [];
    this.sparkles = [];
    this.cats = [];
    this.windowLights = [];
    this.obstacles = [];
    this.time = 0;
    this.game = null;

    this.buildEnvironment();
    this.buildRoadAndMask();
    this.buildTerrainAndVegetation();
    this.buildVillageLife();
    this.buildArrival();
    this.buildTeaHouse();
    this.buildFootballPitch();
    this.buildRiver();
    this.buildBreadOven();
    this.buildHouse();
    this.buildReadingRoom();
    this.buildRoadLeaves();
    this.buildEntrances();
    this.buildInteractionMarkers();
    this.makeViews();
    this.prepareOccluders();
  }

  addObstacleBox(cx, cz, w, d) {
    this.obstacles.push({ kind: 'box', cx, cz, hw: w * 0.5, hd: d * 0.5 });
  }

  addObstacleCircle(cx, cz, r) {
    this.obstacles.push({ kind: 'circle', cx, cz, r });
  }

  // True walkable surface height (terrain everywhere + smooth stone ramps & deck top across the river bridge + courtyard flagstones!)
  walkHeight(x, z) {
    const g = ground(x, z);
    const bx = -1.15;
    const bz = riverCenterZ(bx);
    const deckTop = riverSurfaceY() + 0.58;
    if (Math.abs(x - bx) < 2.25) {
      const dz = Math.abs(z - bz);
      if (dz <= 3.75) return Math.max(g, deckTop);
      if (dz < 5.45) {
        const t = smooth((5.45 - dz) / 1.7);
        return lerp(g, deckTop, t);
      }
    }
    if (this.houseY != null && Math.abs(x) < 4.8 && z > -45.9 && z < -39.7) {
      return Math.max(g, this.houseY + 0.06);
    }
    return g;
  }

  // Additional solid footprints used only during post-game free roam (exterior house & village mosque)
  resolveFreeRoamCollisions(pos, radius = 0.3) {
    this.resolveCollisions(pos, radius);
    const extras = [
      { cx: 0, cz: -48.0, hw: 4.15, hd: 3.85 }, // Great-grandfather's house exterior
      { cx: -28.6, cz: -24.5, hw: 2.85, hd: 2.9 }, // Left hillside village mosque
    ];
    for (const ob of extras) {
      const dx = pos.x - ob.cx;
      const dz = pos.z - ob.cz;
      const ox = ob.hw + radius - Math.abs(dx);
      const oz = ob.hd + radius - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) pos.x += dx >= 0 ? ox : -ox;
        else pos.z += dz >= 0 ? oz : -oz;
      }
    }
    // Keep comfortably inside the 210x210 sculpted Anatolian hillside terrain!
    pos.x = clamp(pos.x, -82, 82);
    pos.z = clamp(pos.z, -90, 76);
    return pos;
  }

  // Smoothly push a walking position clear of any registered wall, building, table, vehicle, rock, or post!
  resolveCollisions(pos, radius = 0.32) {
    for (let pass = 0; pass < 2; pass++) {
      for (const ob of this.obstacles) {
        if (ob.active === false) continue;
        if (ob.kind === 'circle') {
          const dx = pos.x - ob.cx;
          const dz = pos.z - ob.cz;
          const minD = ob.r + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < minD * minD && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x = ob.cx + (dx / d) * minD;
            pos.z = ob.cz + (dz / d) * minD;
          }
        } else {
          const dx = pos.x - ob.cx;
          const dz = pos.z - ob.cz;
          const ox = ob.hw + radius - Math.abs(dx);
          const oz = ob.hd + radius - Math.abs(dz);
          if (ox > 0 && oz > 0) {
            if (ox < oz) pos.x += dx >= 0 ? ox : -ox;
            else pos.z += dz >= 0 ? oz : -oz;
          }
        }
      }
    }
    return pos;
  }

  findRoadTForZ(targetZ) {
    let bestT = 0;
    let bestD = Infinity;
    for (let i = 0; i <= 400; i++) {
      const t = i / 400;
      const d = Math.abs(this.road.getPoint(t).z - targetZ);
      if (d < bestD) {
        bestD = d;
        bestT = t;
      }
    }
    return bestT;
  }

  interactive(id, root, { label = id, quietMarker = false } = {}) {
    const meshes = [];
    root.traverse((n) => {
      if (n.isMesh) {
        n.userData.interaction = id;
        if (n.material?.isMeshToonMaterial && !n.material.transparent) {
          const wind = n.material.userData.artWind || '';
          const moss = !!n.material.userData.artMoss;
          n.material = n.material.clone();
          applyToonShader(n.material, { wind, moss });
          n.material.emissive = new THREE.Color('#000000');
          n.material.needsUpdate = true;
        }
        meshes.push(n);
        this.interactiveMeshes.push(n);
      }
    });
    const item = {
      id,
      label,
      root,
      meshes,
      quietMarker,
      hover: 0,
      popTime: 99,
      baseScale: root.scale.clone(),
      glow: meshes.some((m) => !m.material?.transparent),
    };
    this.interactables.push(item);
    this.byId.set(id, item);
    return root;
  }

  popInteractable(id) {
    const item = this.byId.get(id);
    if (item) item.popTime = 0;
  }

  figure(opts, x, z, parent = this.scene) {
    const f = makeFigure(opts);
    f.position.set(x, ground(x, z), z);
    parent.add(f);
    this.figures.push(f);
    return f;
  }

  buildEnvironment() {
    this.scene.fog = new THREE.Fog('#dfd0a8', 42, 145);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color('#6aa4cc') },
          horizon: { value: new THREE.Color('#e9dbb6') },
          bottom: { value: new THREE.Color('#c9a66b') },
        },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP;
          void main(){
            float h = normalize(vP).y;
            vec3 c = h > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.65, h)) : mix(horizon, bottom, smoothstep(0.0, -0.3, h));
            gl_FragColor = vec4(c, 1.0);
          }`,
      })
    );
    this.scene.add(this.sky);

    this.sun = new THREE.DirectionalLight('#ffffff', 1.0);
    this.sun.castShadow = true;
    const shadowRes = IS_MOBILE ? 512 : 1024;
    this.sun.shadow.mapSize.set(shadowRes, shadowRes);
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -22;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 95;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sunOffset = V(-15, 23, 12);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ambientDust = makeAirMotes(this.rng, 56);
    this.scene.add(this.ambientDust);
  }

  buildRoadAndMask() {
    const controls = ROAD_CONTROL_XZ.map(([x, z]) => V(x, this.walkHeight(x, z), z));
    this.road = new THREE.CatmullRomCurve3(controls, false, 'catmullrom', 0.25);
    // Exact road parameter t for each stop's roadside approach (Stop 3 is cleanly SOUTH of the bridge!)
    this.roadT = [
      this.findRoadTForZ(34.5), // 0: Arrival
      this.findRoadTForZ(20.6), // 1: Tea house roadside
      this.findRoadTForZ(4.2),  // 2: Football gate roadside
      this.findRoadTForZ(-9.6), // 3: River bank roadside (SOUTH of bridge!)
      this.findRoadTForZ(-25.0),// 4: Bread courtyard roadside
      this.findRoadTForZ(-38.5),// 5: House courtyard roadside
      1.0,
      1.0,
    ];

    this.mask = new WorldMask(this.road);
    // Reserve clean rectangles for every stop & village building so zero tufts clip!
    this.mask.addRect(-7.5, 17.5, 11.5, 10.5); // Tea house & terrace
    this.mask.addRect(10.5, 0.5, 14.5, 19.5); // Football pitch (completely clean!)
    this.mask.addRect(7.2, -28.0, 9.6, 8.8); // Bread courtyard
    this.mask.addRect(0.0, -47.2, 12.0, 11.5); // House & reading room + yard
    this.mask.addRect(-1.2, -14.8, 5.5, 9.0); // Stone bridge deck

    // Build irrigation ditch first so mask knows ditch coordinates
    this.ditch = makeIrrigationDitch(this.road, this.mask);
    this.scene.add(this.ditch);
    this.scene.add(makeRoad(this.road, this.rng));
  }

  buildTerrainAndVegetation() {
    this.scene.add(makeTerrain(this.mask));
    this.scene.add(makeAgriculture(this.rng));

    // Village houses (register footprints in mask before placing grass!)
    this.village = new THREE.Group();
    this.scene.add(this.village);

    const housePlots = [
      [-11.5, 29.5, 'lime', 0.2],
      [11.2, 26.5, 'balcony', -0.25],
      [12.5, 14.5, 'mud', -0.18],
      [-12.5, -1.5, 'balcony', 0.16],
      [14.5, -19.5, 'lime', -0.2],
      [-13.5, -27.5, 'mud', 0.15],
      [12.8, -37.5, 'balcony', -0.14],
      [-12.2, -39.5, 'lime', 0.12],
    ];
    for (const [hx, hz, style, turn] of housePlots) {
      this.mask.addRect(hx, hz, 7.2, 6.4);
      this.addObstacleBox(hx, hz, 5.8, 5.0);
      makeVillageHouse(this.village, this.rng, hx, hz, style, turn, this.windowLights);
    }

    // Lush sculpted trees framing the road, gardens & hillsides (with vivid accents like full-20.png!)
    const treeList = [
      // Arrival lush foreground framing
      [-8.8, 41.5, 'mulberry', 0.95],
      [-4.6, 43.2, 'goldAutumn', 0.85],
      [6.4, 42.5, 'mulberry', 0.9],
      [-6.2, 36.2, 'pomegranate', 1.05],
      [7.2, 36.5, 'apricot', 1.0],
      [-14.5, 25.0, 'goldAutumn', 1.08],
      [15.5, 31.5, 'mulberry', 0.95],
      // Along road & gardens (keeping pitch clear!)
      [-14.0, 11.0, 'apricot', 1.02],
      [6.0, 18.0, 'pomegranate', 0.92],
      [-8.5, 9.5, 'poplar', 1.0],
      [-9.5, 3.0, 'poplar', 1.12],
      [-8.5, -4.0, 'goldAutumn', 0.95],
      [19.5, 4.0, 'poplar', 1.08],
      [19.5, -4.0, 'poplar', 1.15],
      [19.0, -10.0, 'apricot', 0.95],
      // River valley willows & poplars
      [-10.5, -12.5, 'willow', 1.12],
      [-9.0, -18.5, 'willow', 1.05],
      [4.2, -11.5, 'willow', 1.08],
      [5.5, -18.0, 'willow', 1.0],
      [-14.5, -15.5, 'pomegranate', 1.0],
      // Upper village & lush hilltop house framing
      [-7.0, -21.0, 'apricot', 0.95],
      [-9.0, -32.0, 'goldAutumn', 1.05],
      [14.5, -28.0, 'poplar', 1.05],
      [14.5, -33.0, 'poplar', 1.12],
      [-7.4, -45.5, 'mulberry', 0.82],
      [7.4, -45.5, 'apricot', 0.82],
      [-11.0, -47.0, 'pomegranate', 1.1],
      [10.5, -47.5, 'goldAutumn', 1.08],
      [-6.8, -53.5, 'mulberry', 1.1],
      [6.8, -53.0, 'apricot', 1.05],
    ];
    for (const [tx, tz, kind, sc] of treeList) {
      const t = makeTree(this.rng, kind, sc, false);
      t.position.set(tx, ground(tx, tz), tz);
      this.village.add(t);
    }

    // Poplars marching along outer ridge + dense 360° surrounding woodland beyond village radius!
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? -1 : 1;
      const z = 34 - i * 6.2;
      const x = side * (21 + this.rng() * 3.5);
      const t = makeTree(this.rng, 'poplar', 0.9 + this.rng() * 0.3, false);
      t.position.set(x, ground(x, z), z);
      this.village.add(t);
    }
    this.village.add(makePerimeterForest(this.rng));

    // Sculpted mossy boulder clusters along hillsides & road turns (echoing full-20.png!)
    const boulderSpots = [
      [-4.2, 34.0, 5, 1.3, 0.95],
      [4.8, 28.5, 4, 1.1, 0.85],
      [4.2, 13.0, 4, 1.1, 0.8],
      [-6.5, -9.5, 5, 1.3, 0.9],
      [3.5, -18.5, 5, 1.4, 0.95],
      [-4.8, -33.5, 5, 1.2, 0.88],
      [-5.5, -41.5, 4, 1.1, 0.85],
      [5.5, -41.5, 4, 1.1, 0.85],
    ];
    for (const [bx, bz, cnt, sp, sc] of boulderSpots) {
      const cl = makeBoulderCluster(this.rng, cnt, sp, sc);
      cl.position.set(bx, ground(bx, bz), bz);
      this.village.add(cl);
    }

    // Dry-stone walls enclosing gardens & lanes (registered as solid obstacles!)
    dryStoneWall(this.village, -4.5, 31.0, 6.0, 'z', 0.68, this.rng);
    this.addObstacleBox(-4.5, 31.0, 0.6, 6.1);
    dryStoneWall(this.village, 5.2, 24.5, 5.5, 'z', 0.68, this.rng);
    this.addObstacleBox(5.2, 24.5, 0.6, 5.6);
    dryStoneWall(this.village, -6.0, 5.5, 6.0, 'z', 0.7, this.rng);
    this.addObstacleBox(-6.0, 5.5, 0.6, 6.1);
    dryStoneWall(this.village, -5.8, -24.5, 6.2, 'z', 0.7, this.rng);
    this.addObstacleBox(-5.8, -24.5, 0.6, 6.3);

    // Masked swaying grass & wildflowers (ZERO tufts in water, road, pitch, or buildings!)
    this.scene.add(makeGrass(this.rng, this.mask, IS_MOBILE ? 1600 : 4200));
    this.scene.add(makeWildflowers(this.rng, this.mask, IS_MOBILE ? 120 : 220));
  }

  buildVillageLife() {
    // Charming very small Anatolian village mosque with slender minaret on the left hillside (seen when zoomed out!)
    this.mosque = makeVillageMosque(this.village, -29.0, -24.5, this.windowLights);

    // Wooden power poles cleanly placed clear of all stops (stork nests on the arrival pole!)
    const poleCoords = [
      [6.2, 34],
      [6.6, 20.5],
      [-10.5, -19.5],
      [-10.5, -35.0],
    ];
    for (const [x, z] of poleCoords) {
      const y = ground(x, z);
      place(cyl(0.09, 0.13, 5.6, C.woodDark, 7), x, y + 2.8, z, this.village);
      place(box(1.5, 0.1, 0.1, C.woodDark), x, y + 5.15, z, this.village);
    }
    this.stork = makeStorkNest(this.village, 6.2, 34);

    // Village fountain (çeşme) near arrival
    this.fountain = makeFountain(this.village, 4.6, 22.5);
    makeBlueCart(this.village, 7.6, 27.5);
    this.cloths = makeLaundry(this.village, -10.5, 25.2);

    // Pecking chickens & sleeping village dog
    this.chickens = [];
    for (let i = 0; i < 5; i++) {
      this.chickens.push(makeChicken(this.village, this.rng, -6.5 + this.rng() * 3.2, 24.5 + this.rng() * 3.0));
    }
    const dog = new THREE.Group();
    place(capsule(0.18, 0.44, C.woodWarm), 0, 0.19, 0, dog).rotation.x = Math.PI / 2;
    place(sphere(0.17, C.woodWarm, 1), 0, 0.18, 0.36, dog);
    place(mesh(new THREE.TorusGeometry(0.22, 0.04, 5, 10, Math.PI), C.woodWarm), 0, 0.14, -0.28, dog).rotation.x =
      Math.PI / 2;
    dog.position.set(-5.8, ground(-5.8, 22.8), 22.8);
    this.village.add(dog);

    // Distant grazing sheep flock
    this.sheep = [];
    for (let i = 0; i < 7; i++) {
      this.sheep.push(makeSheep(this.village, this.rng, 19.5 + (i % 3) * 1.4, -15 - Math.floor(i / 3) * 1.6));
    }

    // Drifting ambient birds overhead
    this.birds = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Group();
      const wL = place(box(0.32, 0.03, 0.12, C.dark), -0.16, 0, 0, b);
      const wR = place(box(0.32, 0.03, 0.12, C.dark), 0.16, 0, 0, b);
      b.userData = { wL, wR, phase: i * 1.7, radius: 14 + i * 4, speed: 0.22 + i * 0.04, y: 11 + i * 1.5 };
      this.scene.add(b);
      this.birds.push(b);
    }
  }

  // STOP 0: Arrival — white dolmuş with faded red route stripe, solid 3D obstacle & downhill departure
  buildArrival() {
    this.minibus = new THREE.Group();
    const startPt = this.road.getPoint(0.15);
    this.minibusStart = V(startPt.x + 0.75, startPt.y, startPt.z - 0.6);
    this.minibus.position.copy(this.minibusStart);
    // Oriented facing back downhill (+Z) ready to head back to town after dropping you at the village entrance!
    this.minibus.rotation.y = Math.PI;
    this.scene.add(this.minibus);

    // Dynamic solid 3D collision footprint so the player ALWAYS respects the minibus!
    this.minibusObstacle = {
      kind: 'box',
      cx: this.minibusStart.x,
      cz: this.minibusStart.z,
      hw: 1.38,
      hd: 2.38,
      active: true,
    };
    this.obstacles.push(this.minibusObstacle);

    place(box(2.2, 1.7, 4.2, C.chalk), 0, 1.4, 0, this.minibus);
    place(box(2.08, 0.36, 4.05, C.plasterWarm), 0, 2.15, 0, this.minibus);
    // Faded red Anatolian dolmuş route stripe
    place(box(2.24, 0.22, 4.24, C.rust), 0, 1.04, 0, this.minibus);
    // Tinted windows
    for (const x of [-1.12, 1.12]) place(box(0.06, 0.56, 2.75, '#466a85'), x, 1.74, 0.1, this.minibus);
    place(box(1.75, 0.58, 0.06, '#466a85'), 0, 1.76, -2.12, this.minibus);
    place(box(1.75, 0.56, 0.06, '#466a85'), 0, 1.76, 2.12, this.minibus);
    place(box(1.1, 0.24, 0.05, C.chalk), 0, 1.38, -2.15, this.minibus);
    // Warm front headlights & red taillights
    for (const sx of [-0.72, 0.72]) {
      place(box(0.28, 0.18, 0.06, '#fff2b0'), sx, 0.88, -2.12, this.minibus);
      place(box(0.24, 0.18, 0.06, C.kilimRed), sx, 0.92, 2.12, this.minibus);
    }
    for (const x of [-1.08, 1.08]) {
      for (const z of [-1.3, 1.3]) {
        const wheel = place(cyl(0.38, 0.38, 0.22, C.dark, 12), x, 0.42, z, this.minibus);
        wheel.rotation.z = Math.PI / 2;
      }
    }
    // Passenger sliding doors on +X local (which faces -X toward the player on the roadside!)
    this.busDoorL = place(box(0.06, 1.32, 0.52, C.blue), 1.13, 1.22, -0.82, this.minibus);
    this.busDoorR = place(box(0.06, 1.32, 0.52, C.blue), 1.13, 1.22, -0.28, this.minibus);

    this.arrivalDust = points(72, '#e8c990', 0.16, 0.45);
    this.arrivalDust.visible = false;
    this.scene.add(this.arrivalDust);
  }

  // STOP 1: Tea House (Kahvehane) — spacious terrace under grand mulberry, uncles, photo, ruby tea
  buildTeaHouse() {
    this.terraceY = ground(-7.5, 17.5) + 0.04;

    // Warm sunlit stone-flagged terrace (clear of building & road)
    const terraceGeo = new THREE.CylinderGeometry(4.8, 5.0, 0.14, 24);
    const terrace = place(mesh(terraceGeo, '#d7c39c', 0.025), -6.2, this.terraceY - 0.06, 17.2, this.scene);
    terrace.scale.set(1.12, 1, 0.96);
    terrace.receiveShadow = true;
    terrace.castShadow = false;
    terrace.userData.noCastShadow = true;

    // Tea house building on the left-back edge of the terrace, facing +Z/+X
    this.teahouse = new THREE.Group();
    this.teahouse.position.set(-10.8, this.terraceY, 17.6);
    this.teahouse.rotation.y = Math.PI * 0.5; // Front facade faces +X directly onto the terrace!
    this.scene.add(this.teahouse);

    place(limeBox(5.8, 3.0, 4.4), 0, 1.5, 0, this.teahouse);
    addRoof(this.teahouse, 5.8, 4.4, 3.0, false);
    addDoorFrame(this.teahouse, -0.6, 1.08, 2.22, 1.55, 2.15, true);
    addWindow(this.teahouse, 1.55, 1.8, 2.22, 1.45, 0.85, this.windowLights);
    place(teaSign(), -0.6, 2.58, 2.28, this.teahouse);

    // Framed 1936 vintage sepia/B&W studio portrait of Great-Grandfather Dede inside the lit doorway!
    const photoTex = canvasTexture(160, 200, (ctx, w, h) => {
      // Aged cream mount + warm vintage studio vignette backdrop
      ctx.fillStyle = '#e6dcc5';
      ctx.fillRect(0, 0, w, h);
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.46, w * 0.62);
      bg.addColorStop(0, '#c8bca6');
      bg.addColorStop(0.7, '#9c8f7a');
      bg.addColorStop(1, '#685e50');
      ctx.fillStyle = bg;
      ctx.fillRect(10, 10, w - 20, h - 38);

      // Dignified wool jacket & buttoned waistcoat shoulders
      ctx.fillStyle = '#312b26';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.86, w * 0.36, h * 0.22, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w * 0.14, h * 0.82, w * 0.72, h * 0.08);
      // Warm wool vest + white collared shirt V-neck
      ctx.fillStyle = '#524940';
      ctx.beginPath();
      ctx.moveTo(w * 0.34, h * 0.68);
      ctx.lineTo(w * 0.66, h * 0.68);
      ctx.lineTo(w * 0.6, h * 0.88);
      ctx.lineTo(w * 0.4, h * 0.88);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8dfc9';
      ctx.beginPath();
      ctx.moveTo(w * 0.41, h * 0.65);
      ctx.lineTo(w * 0.59, h * 0.65);
      ctx.lineTo(w * 0.5, h * 0.8);
      ctx.closePath();
      ctx.fill();
      // Vest buttons
      ctx.fillStyle = '#25201c';
      ctx.fillRect(w * 0.49, h * 0.81, 3, 3);
      ctx.fillRect(w * 0.49, h * 0.85, 3, 3);

      // Neck & sculpted warm-lit face
      ctx.fillStyle = '#b9a992';
      ctx.fillRect(w * 0.43, h * 0.58, w * 0.14, h * 0.1);
      // Ears
      ctx.fillStyle = '#baa992';
      ctx.beginPath();
      ctx.ellipse(w * 0.31, h * 0.45, 7, 11, 0, 0, Math.PI * 2);
      ctx.ellipse(w * 0.69, h * 0.45, 7, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.fillStyle = '#d4c6b0';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.46, w * 0.19, h * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      // Soft cheek & jaw shading
      ctx.fillStyle = 'rgba(72, 60, 48, 0.18)';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.56, w * 0.14, h * 0.08, 0, 0, Math.PI);
      ctx.fill();

      // Silver temple hair peeking under cap
      ctx.fillStyle = '#e5dfd2';
      ctx.fillRect(w * 0.31, h * 0.37, 8, 12);
      ctx.fillRect(w * 0.64, h * 0.37, 8, 12);

      // Classic Anatolian flat cap (kasket) with shaded brim
      ctx.fillStyle = '#3b342d';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.3, w * 0.24, h * 0.095, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w * 0.27, h * 0.29, w * 0.46, h * 0.06);
      ctx.fillStyle = '#241f1b';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.355, w * 0.23, h * 0.028, 0, 0, Math.PI * 2);
      ctx.fill();

      // Kind bushy eyebrows & warm smiling eyes
      ctx.fillStyle = '#dcd4c4';
      ctx.fillRect(w * 0.37, h * 0.4, 15, 4);
      ctx.fillRect(w * 0.54, h * 0.4, 15, 4);
      ctx.fillStyle = '#2a241f';
      ctx.fillRect(w * 0.4, h * 0.435, 6, 5);
      ctx.fillRect(w * 0.56, h * 0.435, 6, 5);
      // Warm eye glint
      ctx.fillStyle = '#efe8d8';
      ctx.fillRect(w * 0.41, h * 0.437, 2, 2);
      ctx.fillRect(w * 0.57, h * 0.437, 2, 2);
      // Nose
      ctx.fillStyle = '#9c8c76';
      ctx.fillRect(w * 0.485, h * 0.445, 5, 13);
      ctx.fillRect(w * 0.47, h * 0.5, 10, 4);

      // Iconic proud curved silver-white Anatolian mustache!
      ctx.fillStyle = '#eee7d8';
      ctx.beginPath();
      ctx.ellipse(w * 0.44, h * 0.545, 14, 6, -0.22, 0, Math.PI * 2);
      ctx.ellipse(w * 0.56, h * 0.545, 14, 6, 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6c5f50';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.565, 8, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      // Subtle inner matte rule & crisp embossed "1936"
      ctx.strokeStyle = '#8b7b64';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, w - 20, h - 38);
      ctx.fillStyle = '#5c4d3c';
      ctx.font = 'bold 16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('1936', w * 0.5, h - 10);
    });
    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.68, 0.86),
      new THREE.MeshBasicMaterial({ map: photoTex })
    );
    // Mounted neatly on the limewashed front wall LEFT of the open doorway so çaycı can walk cleanly in & out!
    photo.position.set(-2.06, 1.66, 2.295);
    this.teahouse.add(photo);
    place(box(0.8, 0.98, 0.05, C.woodDark), -2.06, 1.66, 2.25, this.teahouse);
    place(box(0.74, 0.92, 0.052, C.gold), -2.06, 1.66, 2.255, this.teahouse);
    this.dedePhotoWorld = V(-8.5, this.terraceY + 1.66, 19.66);

    // Grand mulberry tree positioned BEHIND the terrace (x=-8.4, z=13.4) so its lush canopy
    // arches over the tables casting dappled shadow while its trunk NEVER blocks the close shot!
    const mulberry = makeTree(this.rng, 'mulberry', 1.38, true);
    mulberry.position.set(-8.6, this.terraceY, 13.4);
    this.scene.add(mulberry);

    // Geraniums by the tea house doorway
    makeGeraniumTin(this.scene, -8.1, this.terraceY, 19.8, 0.95);
    makeGeraniumTin(this.scene, -8.1, this.terraceY, 16.0, 0.9);

    // 4 well-spaced wooden tables on the terrace (zero wall clipping!)
    this.addObstacleBox(-10.8, 17.6, 4.6, 6.0); // Tea house building footprint
    const tables = [
      [-5.3, 18.4], // Player's table (front)
      [-5.6, 15.6], // Neighbouring uncles (tavla table!)
      [-3.3, 16.4], // Uncle with prayer beads
      [-3.7, 13.9], // Quiet back corner table (clear of trunk!)
    ];
    for (const [tx, tz] of tables) {
      this.scene.add(makeTeaTable(tx, tz, this.terraceY));
      this.addObstacleCircle(tx, tz, 0.72);
    }

    // Backgammon (tavla) board on the uncles' neighbouring table!
    const tavla = place(box(0.56, 0.04, 0.44, C.woodDark), -5.6, this.terraceY + 0.71, 15.6, this.scene);
    place(box(0.48, 0.045, 0.36, C.cream), -5.6, this.terraceY + 0.715, 15.6, this.scene);
    for (let i = 0; i < 4; i++) {
      place(cyl(0.032, 0.032, 0.02, i % 2 ? C.kilimRed : C.dark, 8), -5.74 + i * 0.09, this.terraceY + 0.745, 15.52 + (i % 2) * 0.14, this.scene);
    }
    tavla.rotation.y = 0.25;

    // 3 Uncles seated around the neighbouring tables, each with distinct character & their own tulip tea glass!
    const uncleSpecs = [
      {
        x: -6.42,
        z: 15.6,
        lookX: -5.6,
        lookZ: 15.6,
        palette: C.cream,
        vest: C.dusk,
        headwear: 'cap',
        hair: '#5c524a',
        mustache: '#6e645c',
        beads: false,
      },
      {
        x: -4.78,
        z: 15.6,
        lookX: -5.6,
        lookZ: 15.6,
        palette: C.chalk,
        vest: C.dark,
        headwear: 'none',
        hairStyle: 'balding',
        hair: '#968d82',
        mustache: '#968d82',
        glasses: true,
        beads: true,
      },
      {
        x: -2.48,
        z: 16.4,
        lookX: -3.3,
        lookZ: 16.4,
        palette: C.sage,
        vest: C.earth,
        headwear: 'cap',
        hair: '#4a3d33',
        mustache: '#4a3d33',
        beads: false,
      },
    ];
    this.uncles = [];
    this.uncleGlasses = [];
    uncleSpecs.forEach((u, i) => {
      const f = this.figure(
        {
          height: 1.66 - i * 0.02,
          palette: u.palette,
          shirt: C.cream,
          vest: u.vest,
          headwear: u.headwear,
          hairStyle: u.hairStyle || 'parted',
          hair: u.hair,
          mustache: u.mustache,
          glasses: !!u.glasses,
          pose: 'sit',
          beads: u.beads,
          seed: i + 1,
        },
        u.x,
        u.z
      );
      f.position.y = this.terraceY + 0.06;
      faceFigure(f, V(u.lookX, this.terraceY + 1, u.lookZ));
      this.uncles.push(f);
      this.interactive('npc-uncle-' + i, f, { label: 'chat with uncle', quietMarker: true });
      // Uncle's own classic Turkish tulip tea glass on his table (saucer stays on table when Uncle 1 lifts to toast!)
      const gx = lerp(u.x, u.lookX, 0.65);
      const gz = lerp(u.z, u.lookZ, 0.65) + 0.12;
      const uSaucer = makeTeaSaucer(0.85);
      uSaucer.position.set(gx, this.terraceY + 0.71, gz);
      this.scene.add(uSaucer);
      const ug = makeTulipTeaGlass(0.85, false);
      ug.position.set(gx, this.terraceY + 0.71, gz);
      ug.userData.basePos = ug.position.clone();
      this.scene.add(ug);
      this.uncleGlasses.push(ug);
    });

    // Çaycı (tea boy) with apron & real hanging Anatolian brass tray + inside doorway & wall-lean spots!
    this.cayciHome = V(-7.95, this.terraceY, 18.05);
    this.cayciDoorStep = V(-8.48, this.terraceY, 18.2);
    this.cayciInside = V(-9.35, this.terraceY, 18.2); // Inside the open tea house doorway!
    this.cayciLeanSpot = V(-8.26, this.terraceY, 17.05); // Right against the limewashed front wall!
    this.cayci = this.figure(
      {
        height: 1.54,
        palette: C.chalk,
        shirt: C.chalk,
        vest: C.kilimRed,
        apron: true,
        headwear: 'none',
        hairStyle: 'parted',
        hair: '#3a2d24',
        tray: true,
        pose: 'stand',
        seed: 8,
      },
      this.cayciHome.x,
      this.cayciHome.z
    );
    this.cayci.position.y = this.terraceY;
    faceFigure(this.cayci, V(-5.3, this.terraceY + 1, 18.4));
    this.cayciTray = this.cayci.userData.tray;
    this.interactive('npc-cayci', this.cayci, { label: 'chat with tea boy', quietMarker: true });

    // Player's tea table props: classic Turkish tulip tea glass (half size!), sugar dish & silver spoon (village hospitality — no payment needed!)
    const tx = -5.3;
    const tz = 18.4;
    const topY = this.terraceY + 0.71;
    const gx = tx - 0.22; // Positioned on the player's side of the table so hand reaches right to the glass rim!
    const gz = tz + 0.02;

    // Saucer stays resting on the table while ONLY the tulip glass lifts to the player's lips!
    const playerSaucer = makeTeaSaucer(1.0);
    playerSaucer.position.set(gx, topY, gz);
    this.scene.add(playerSaucer);

    this.teaGlass = makeTulipTeaGlass(1.0, false);
    this.teaGlass.position.set(gx, topY, gz);
    this.teaGlassBase = this.teaGlass.position.clone();
    this.scene.add(this.teaGlass);
    this.teaLiquid = this.teaGlass.userData.liquid;
    this.interactive('sip', this.teaGlass, { label: 'drink tea' });

    // Subtle swirling amber ripple ring inside the tulip glass when sugar drops or spoon stirs!
    this.teaRipple = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.056, 14),
      new THREE.MeshBasicMaterial({ color: '#ffdf9e', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    this.teaRipple.rotation.x = -Math.PI / 2;
    this.teaRipple.position.set(0, 0.205, 0);
    this.teaGlass.add(this.teaRipple);

    // Second full tulip glass used cleanly during çaycı refill swap!
    this.servedGlass = makeTulipTeaGlass(1.0, false);
    this.servedGlass.visible = false;
    this.scene.add(this.servedGlass);

    // Optional clickable sugar dish with 2 crisp white sugar cubes (foreground-left of table, clear of glass!)
    this.sugarDish = new THREE.Group();
    this.sugarDish.position.set(tx - 0.18, topY, tz + 0.42);
    place(cyl(0.105, 0.08, 0.028, C.chalk, 12), 0, 0.014, 0, this.sugarDish);
    this.scene.add(this.sugarDish);
    this.sugar = [];
    for (let i = 0; i < 2; i++) {
      const cube = place(
        box(0.044, 0.044, 0.044, C.chalk),
        tx - 0.205 + i * 0.054,
        topY + 0.048,
        tz + 0.42 + (i % 2 ? -0.018 : 0.018),
        this.scene
      );
      cube.userData.home = cube.position.clone();
      this.scene.add(cube);
      this.sugar.push(cube);
    }
    this.interactive('tea-sugar', this.sugarDish, { label: 'add sugar' });

    // Vertical-built silver tea spoon (pinched at top stem y=+0.08, bowl at bottom y=-0.12!)
    // Clearly spaced on the right-front edge of the table so clicking the glass NEVER hits the spoon!
    this.spoon = new THREE.Group();
    place(cyl(0.01, 0.012, 0.22, '#e4ecf2', 8), 0, -0.005, 0, this.spoon);
    const bowl = place(sphere(0.028, '#e4ecf2', 1), 0, -0.12, 0, this.spoon);
    bowl.scale.set(0.75, 1.15, 0.4);
    this.spoonBase = V(tx + 0.32, topY + 0.026, tz + 0.28);
    this.spoon.position.copy(this.spoonBase);
    this.spoon.rotation.set(Math.PI * 0.5, 0.35, 0);
    this.scene.add(this.spoon);
    this.interactive('tea-stir', this.spoon, { label: 'stir tea' });

    // Delicate rising steam above the Turkish tea glass
    this.steam = points(16, '#fff8e2', 0.045, 0.65);
    this.scene.add(this.steam);
    const sp = this.steam.geometry.attributes.position.array;
    for (let i = 0; i < sp.length; i += 3) {
      sp[i] = gx + (this.rng() - 0.5) * 0.05;
      sp[i + 1] = topY + 0.28 + this.rng() * 0.44;
      sp[i + 2] = gz + (this.rng() - 0.5) * 0.05;
    }
  }

  // STOP 2: Football Pitch — completely clear of road, ditch & river, proper 3D goal with sloping net!
  buildFootballPitch() {
    const cx = 10.5;
    const cz = 0.5;
    const fy = ground(cx, cz);
    this.pitchCenter = V(cx, fy, cz);

    this.pitch = new THREE.Group();
    this.scene.add(this.pitch);

    // Low mud-brick wall cleanly separating the pitch from the village road — with an open stone-post gateway at z=2.4..5.6!
    mudBrickWall(this.pitch, 3.0, -3.1, 10.6, 'z', 0.75);
    this.addObstacleBox(3.0, -3.1, 0.55, 10.6);
    mudBrickWall(this.pitch, 3.0, 7.6, 3.6, 'z', 0.75);
    this.addObstacleBox(3.0, 7.6, 0.55, 3.6);
    for (const gz of [2.35, 5.65]) {
      const gy = ground(3.0, gz);
      place(box(0.54, 1.08, 0.54, C.stoneLight, 0.03), 3.0, gy + 0.54, gz, this.pitch);
      place(box(0.62, 0.12, 0.62, C.chalk, 0.02), 3.0, gy + 1.1, gz, this.pitch);
      this.addObstacleBox(3.0, gz, 0.62, 0.62);
    }
    dryStoneWall(this.pitch, cx, 9.6, 13.0, 'x', 0.48, this.rng);
    this.addObstacleBox(cx, 9.6, 13.0, 0.6);

    // Warm dusty ochre pitch with worn darker goalmouths & faded chalk markings
    const field = place(box(12.2, 0.05, 17.8, '#cc9a4c', 0.025), cx, fy - 0.02, cz, this.pitch);
    field.receiveShadow = true;
    field.castShadow = false;
    field.userData.noCastShadow = true;

    for (const gz of [-5.4, 7.2]) {
      const worn = place(mesh(new THREE.CircleGeometry(1, 20), '#ad7b3a', 0.02), cx, fy + 0.014, gz, this.pitch);
      worn.rotation.x = -Math.PI / 2;
      worn.scale.set(2.6, 1.5, 1);
      worn.castShadow = false;
    }

    // Faded broken chalk touchlines
    for (const x of [cx - 5.5, cx + 5.5]) {
      for (let i = 0; i < 8; i++) {
        place(box(0.08, 0.015, 1.65, C.chalk), x, fy + 0.012, -6.5 + i * 2.1, this.pitch);
      }
    }
    for (const z of [-7.3, 8.7]) {
      place(box(11.0, 0.015, 0.08, C.chalk), cx, fy + 0.012, z, this.pitch);
    }
    // Corner stones
    for (const [sx, sz] of [
      [cx - 5.5, -7.3],
      [cx + 5.5, -7.3],
      [cx - 5.5, 8.7],
      [cx + 5.5, 8.7],
    ]) {
      place(sphere(0.18, C.stoneLight, 0), sx, fy + 0.12, sz, this.pitch);
    }

    // Proper 3D football goal at (cx, fy, -6.3) with white posts, crossbar, and sloping 3D net!
    this.goal = new THREE.Group();
    this.goal.position.set(cx, fy, -6.3);
    this.scene.add(this.goal);
    const gw = 4.4;
    const gh = 2.05;
    const gd = 1.35;
    for (const sx of [-gw / 2, gw / 2]) {
      place(cyl(0.065, 0.072, gh, C.chalk, 8), sx, gh / 2, 0, this.goal);
      // Sloping rear stanchions
      this.goal.add(beamBetween(V(sx, gh, 0), V(sx, gh * 0.84, -gd * 0.65), 0.04, C.stoneMid));
      this.goal.add(beamBetween(V(sx, gh * 0.84, -gd * 0.65), V(sx, 0.04, -gd), 0.04, C.stoneMid));
      this.goal.add(beamBetween(V(sx, 0.04, 0), V(sx, 0.04, -gd), 0.038, C.stoneMid));
    }
    place(cyl(0.065, 0.065, gw + 0.14, C.chalk, 8), 0, gh, 0, this.goal).rotation.z = Math.PI / 2;
    place(cyl(0.04, 0.04, gw, C.stoneMid, 8), 0, gh * 0.84, -gd * 0.65, this.goal).rotation.z = Math.PI / 2;
    place(cyl(0.038, 0.038, gw, C.stoneMid, 8), 0, 0.04, -gd, this.goal).rotation.z = Math.PI / 2;

    // 3D net mesh (back, left side, right side, and sloping roof!)
    const netVerts = [];
    // Back net
    for (let i = 0; i <= 10; i++) {
      const x = lerp(-gw / 2, gw / 2, i / 10);
      netVerts.push(V(x, gh * 0.84, -gd * 0.65), V(x, 0.05, -gd));
      // Roof net
      netVerts.push(V(x, gh, 0), V(x, gh * 0.84, -gd * 0.65));
    }
    for (let j = 0; j <= 5; j++) {
      const t = j / 5;
      const y = lerp(0.05, gh * 0.84, t);
      const z = lerp(-gd, -gd * 0.65, t);
      netVerts.push(V(-gw / 2, y, z), V(gw / 2, y, z));
    }
    // Left & right side nets
    for (const sx of [-gw / 2, gw / 2]) {
      for (let j = 1; j <= 4; j++) {
        const t = j / 5;
        const y = lerp(0.05, gh * 0.84, t);
        const zBack = lerp(-gd, -gd * 0.65, t);
        netVerts.push(V(sx, y, 0), V(sx, y, zBack));
      }
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        const zTop = lerp(0, -gd * 0.65, t);
        const yTop = lerp(gh, gh * 0.84, t);
        const zBot = lerp(0, -gd, t);
        netVerts.push(V(sx, yTop, zTop), V(sx, 0.05, zBot));
      }
    }
    this.goalNet = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(netVerts),
      new THREE.LineBasicMaterial({ color: '#f7f1de', transparent: true, opacity: 0.65 })
    );
    this.goal.add(this.goalNet);

    // Crisp white & black pixel football clearly visible on the free-kick spot!
    this.ballSpot = V(cx, fy + 0.24, 2.1);
    this.ball = new THREE.Group();
    this.ball.position.copy(this.ballSpot);
    place(sphere(0.24, '#ffffff', 2, 0), 0, 0, 0, this.ball);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      place(sphere(0.078, C.dark, 0), Math.sin(a) * 0.19, Math.cos(i * 1.9) * 0.14, Math.cos(a) * 0.19, this.ball);
    }
    this.scene.add(this.ball);
    this.interactive('football-ball', this.ball, { label: 'kick' });

    // Grounded pixel shadow disc that tracks the ball in flight!
    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 12),
      new THREE.MeshBasicMaterial({ color: '#3b3759', transparent: true, opacity: 0.45, depthWrite: false })
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.set(cx, fy + 0.025, 2.1);
    this.scene.add(this.ballShadow);

    // Wall of 3 village kids shoulder-to-shoulder between ball and goal (striped jerseys + shorts + socks!)
    this.wall = [];
    const wallSpecs = [
      { palette: C.kilimRed, stripe: C.chalk, hair: '#3b2c22', hairStyle: 'messy' },
      { palette: C.gold, stripe: C.kilimIndigo, hair: '#4d3a2b', hairStyle: 'parted' },
      { palette: C.blue, stripe: C.cream, hair: '#2e241d', hairStyle: 'messy' },
    ];
    for (let i = 0; i < 3; i++) {
      const kx = cx - 0.76 + i * 0.76;
      const kz = -1.6;
      const sp = wallSpecs[i];
      const kid = this.figure(
        {
          height: 1.24 + (i % 2) * 0.04,
          palette: sp.palette,
          stripe: sp.stripe,
          trouser: C.dark,
          shorts: true,
          hair: sp.hair,
          hairStyle: sp.hairStyle,
          child: true,
          pose: 'stand',
          seed: 12 + i,
        },
        kx,
        kz
      );
      faceFigure(kid, this.ballSpot);
      this.wall.push(kid);
    }

    // Diving goalkeeper in bright green kit, cap & keeper gloves!
    this.keeper = this.figure(
      {
        height: 1.32,
        palette: C.greenBright,
        stripe: C.dark,
        trouser: C.dark,
        shorts: true,
        headwear: 'cap',
        gloves: true,
        child: true,
        pose: 'stand',
        seed: 20,
      },
      cx,
      -5.8
    );
    faceFigure(this.keeper, this.ballSpot);
    this.keeper.visible = true;

    // Cheering spectators watching from the touchlines
    this.pitchKids = [];
    for (const [i, [px, pz, col, stripe, hStyle]] of [
      [cx - 4.4, -2.0, C.terracotta, C.cream, 'ponytail'],
      [cx + 4.3, -2.6, C.blueLight, C.chalk, 'messy'],
      [cx - 4.2, 2.3, C.cream, C.kilimRed, 'parted'],
    ].entries()) {
      const kid = this.figure(
        {
          height: 1.2 + i * 0.04,
          palette: col,
          stripe,
          trouser: C.dusk,
          shorts: true,
          hairStyle: hStyle,
          child: true,
          pose: 'stand',
          seed: 90 + i,
        },
        px,
        pz
      );
      faceFigure(kid, this.ballSpot);
      kid.userData.homePos = V(px, fy, pz);
      this.pitchKids.push(kid);
      this.interactive('npc-pitchkid-' + i, kid, { label: 'chat with kid', quietMarker: true });
    }

    // CHILDHOOD PLAYER (takes over during the sepia football free-kick flashback!)
    this.footballChild = this.figure(
      {
        height: 1.14,
        palette: C.rust,
        stripe: C.cream,
        trouser: C.dark,
        shorts: true,
        headwear: 'cap',
        hair: '#3b2d24',
        child: true,
        pose: 'stand',
        seed: 73,
      },
      cx - 0.75,
      3.55
    );
    faceFigure(this.footballChild, this.ballSpot);
    this.footballChild.visible = false;

    // Childhood flashback opposing wall & keeper (all cleanly oriented toward the ball!)
    this.memoryWall = [];
    for (let i = 0; i < 3; i++) {
      const kid = this.figure(
        {
          height: 1.12 + (i % 2) * 0.03,
          palette: i === 1 ? C.gold : C.blue,
          stripe: C.cream,
          trouser: C.dark,
          shorts: true,
          child: true,
          pose: 'stand',
          seed: 120 + i,
        },
        cx - 0.72 + i * 0.72,
        -1.6
      );
      faceFigure(kid, this.ballSpot);
      kid.visible = false;
      this.memoryWall.push(kid);
    }
    this.memoryKeeper = this.figure(
      {
        height: 1.18,
        palette: C.greenMid,
        stripe: C.chalk,
        trouser: C.dark,
        shorts: true,
        gloves: true,
        child: true,
        pose: 'stand',
        seed: 126,
      },
      cx,
      -5.8
    );
    faceFigure(this.memoryKeeper, this.ballSpot);
    this.memoryKeeper.visible = false;

    // Childhood flashback teammates on the sidelines (all face ball initially, sprint to celebrate on goal!)
    this.memoryKids = [];
    const memStartSpots = [
      [cx - 3.9, -1.2, C.rust, C.cream, 'messy'],
      [cx + 3.9, -1.0, C.terracotta, C.chalk, 'ponytail'],
      [cx - 3.7, 1.8, C.gold, C.dark, 'parted'],
      [cx + 3.7, 1.9, C.blueLight, C.cream, 'messy'],
    ];
    for (let i = 0; i < memStartSpots.length; i++) {
      const [mx, mz, pal, st, hs] = memStartSpots[i];
      const kid = this.figure(
        {
          height: 1.1 + (i % 2) * 0.04,
          palette: pal,
          stripe: st,
          trouser: C.dark,
          shorts: true,
          hairStyle: hs,
          child: true,
          pose: 'stand',
          seed: 24 + i,
        },
        mx,
        mz
      );
      kid.userData.memoryHome = V(mx, fy, mz);
      faceFigure(kid, this.ballSpot);
      kid.visible = false;
      this.memoryKids.push(kid);
    }

    // Crisp target reticle ring on the goal plane so aiming feels tactile & accurate!
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.27, 16),
      new THREE.MeshBasicMaterial({ color: '#ffe89e', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false })
    );
    this.aimRing.renderOrder = 11;
    this.aimRing.visible = false;
    this.scene.add(this.aimRing);

    // Crisp pixel power bar (16x3 art pixels, green sweet spot!) + dotted trajectory arc
    this.powerPixels = new Uint8Array(16 * 3 * 4);
    this.powerTexture = new THREE.DataTexture(this.powerPixels, 16, 3, THREE.RGBAFormat);
    this.powerTexture.magFilter = THREE.NearestFilter;
    this.powerTexture.minFilter = THREE.NearestFilter;
    this.powerBar = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.powerTexture, transparent: true, depthTest: false, depthWrite: false })
    );
    this.powerBar.renderOrder = 12;
    this.powerBar.visible = false;
    this.scene.add(this.powerBar);

    this.predictedArc = points(22, '#fff7dc', 2.5, 0.95);
    this.predictedArc.material.sizeAttenuation = false;
    this.predictedArc.material.depthTest = false;
    this.predictedArc.renderOrder = 11;
    this.predictedArc.visible = false;
    this.scene.add(this.predictedArc);

    // Tactile slingshot pull-back ribbon & handle ring from the ball for drag-from-ball free kicks!
    this.dragLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 1),
      new THREE.MeshBasicMaterial({ color: '#ffe48a', transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthTest: false })
    );
    this.dragLine.rotation.x = -Math.PI / 2;
    this.dragLine.renderOrder = 12;
    this.dragLine.visible = false;
    this.scene.add(this.dragLine);

    this.dragKnob = new THREE.Mesh(
      new THREE.RingGeometry(0.13, 0.22, 16),
      new THREE.MeshBasicMaterial({ color: '#fff5cc', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false })
    );
    this.dragKnob.rotation.x = -Math.PI / 2;
    this.dragKnob.renderOrder = 12;
    this.dragKnob.visible = false;
    this.scene.add(this.dragKnob);
  }

  // STOP 3: The River — turquoise stream with stepped white foam, dressed stone bridge,
  // sculpted moss-topped sitting boulder facing OPEN water (zero bridge clipping, zero floating grass!)
  buildRiver() {
    const wy = riverSurfaceY();
    this.riverY = wy;

    // Curved river surface spanning wide across the whole valley (never cuts off in wide dusk vista!)
    const rVerts = [];
    const rUvs = [];
    const rIdx = [];
    const segX = 72;
    const segZ = 6;
    for (let i = 0; i <= segX; i++) {
      const u = i / segX;
      const x = lerp(-70, 70, u);
      const cz = riverCenterZ(x);
      for (let j = 0; j <= segZ; j++) {
        const v = j / segZ;
        const z = cz + (v - 0.5) * (RIVER_HALF_WIDTH * 2.15);
        rVerts.push(x, wy, z);
        rUvs.push(u, v);
      }
    }
    for (let i = 0; i < segX; i++) {
      for (let j = 0; j < segZ; j++) {
        const a = i * (segZ + 1) + j;
        rIdx.push(a, a + 1, a + segZ + 1, a + 1, a + segZ + 2, a + segZ + 1);
      }
    }
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rVerts, 3));
    rGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rUvs, 2));
    rGeo.setIndex(rIdx);

    this.river = new THREE.Mesh(
      rGeo,
      new THREE.ShaderMaterial({
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            time: { value: 0 },
            shallow: { value: new THREE.Color('#6caad6') },
            deep: { value: new THREE.Color('#3b73b0') },
            foam: { value: new THREE.Color('#f0f8fc') },
          },
        ]),
        vertexShader: `
          #include <fog_pars_vertex>
          varying vec3 vWorld;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: `
          uniform float time;
          uniform vec3 shallow;
          uniform vec3 deep;
          uniform vec3 foam;
          varying vec3 vWorld;
          varying vec2 vUv;
          #include <fog_pars_fragment>
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            float edgeDist = abs(vUv.y - 0.5) * 2.0;
            vec3 col = mix(deep, shallow, step(0.45, edgeDist) * 0.72 + 0.15);
            // Stepped crisp pixel shoreline foam (echoing full-20.png's bright blue-white stream!)
            float shoreFoam = step(0.86, edgeDist + 0.06 * sin(vWorld.x * 2.4 + time * 1.4));
            col = mix(col, foam, shoreFoam * 0.85);
            // Scrolling pixel stream ripples & sparkles
            vec2 px = floor(vec2((vWorld.x - time * 0.65) * 4.5, vWorld.z * 5.0));
            float ribbon = step(0.76, fract(px.x * 0.19 + px.y * 0.37));
            col = mix(col, shallow * 1.15, ribbon * 0.35);
            float sparkle = step(0.972, hash(px + floor(time * 2.0)));
            col = mix(col, foam, sparkle);
            // Subtle cool shadow under stone bridge at x in [-3.4..1.0]
            float underBridge = step(-3.3, vWorld.x) * step(vWorld.x, 1.0);
            col = mix(col, deep * 0.68, underBridge * 0.62);
            gl_FragColor = vec4(col, 1.0);
            #include <fog_fragment>
          }`,
      })
    );
    this.river.receiveShadow = false;
    this.river.castShadow = false;
    this.river.userData.noCastShadow = true;
    this.river.userData.noReceivedShadow = true;
    this.scene.add(this.river);

    // Dressed stone village bridge at x = -1.15 carrying the road cleanly over the river + smooth stone approach ramps!
    const bx = -1.15;
    const bz = riverCenterZ(bx);
    const bridgeY = wy + 0.42;
    const bridge = new THREE.Group();
    this.scene.add(bridge);
    place(box(4.2, 0.32, 7.6, C.stoneLight), bx, bridgeY, bz, bridge);
    // Gentle stone approach ramps at north & south bridge ends so road & walking feet transition smoothly!
    for (const endSgn of [-1, 1]) {
      const ramp = place(box(3.9, 0.24, 1.9, C.stoneLight), bx, bridgeY - 0.14, bz + endSgn * 4.55, bridge);
      ramp.rotation.x = endSgn * 0.21;
    }
    for (const side of [-1, 1]) {
      place(box(0.36, 0.58, 7.6, C.stoneMid), bx + side * 1.95, bridgeY + 0.36, bz, bridge);
      place(box(0.44, 0.12, 7.75, C.stoneLight), bx + side * 1.95, bridgeY + 0.68, bz, bridge);
      this.addObstacleBox(bx + side * 1.95, bz, 0.52, 7.7);
      // Stone bridge abutments dipping into the water
      for (const az of [-2.4, 2.4]) {
        place(box(0.75, 0.9, 0.85, C.stoneDark), bx + side * 2.0, wy - 0.05, bz + az, bridge);
      }
    }

    // Mossy stepping boulders in the river with crisp white water-drop foam
    for (const [rx, rzOff] of [
      [-12.0, -0.4],
      [-9.5, 0.6],
      [4.0, -0.5],
      [8.5, 0.4],
    ]) {
      const rz = riverCenterZ(rx) + rzOff;
      const cl = makeBoulderCluster(this.rng, 3, 0.75, 0.8);
      cl.position.set(rx, wy - 0.08, rz);
      this.scene.add(cl);
      for (let s = 0; s < 3; s++) {
        const fm = place(box(0.55 - s * 0.12, 0.02, 0.14, C.foam), rx + 0.52 + s * 0.28, wy + 0.03, rz + s * 0.12, this.scene);
        fm.castShadow = false;
        fm.userData.noCastShadow = true;
      }
    }

    // Reeds along the water edge (strictly outside the bridge deck!)
    for (let i = 0; i < 36; i++) {
      const rx = -17 + i * 0.95;
      if (rx > -3.8 && rx < 1.5) continue; // Keep bridge completely clear!
      const side = i % 2 ? 1 : -1;
      const rz = riverCenterZ(rx) + side * (RIVER_HALF_WIDTH + 0.12);
      const ry = ground(rx, rz);
      place(cyl(0.018, 0.026, 0.55 + (i % 3) * 0.14, C.greenDark, 5), rx, ry + 0.28, rz, this.scene);
      if (i % 3 === 0) {
        place(cyl(0.038, 0.038, 0.16, C.woodDark, 6), rx, ry + 0.62, rz, this.scene);
      }
    }

    // Sculpted flat mossy sitting boulder on the OPEN south bank left of the bridge!
    const sx = -6.0;
    const sz = riverCenterZ(sx) + RIVER_HALF_WIDTH + 0.15; // Right at the dry bank edge!
    const sy = Math.max(ground(sx, sz), wy + 0.08);
    this.riverSeatPos = V(sx, sy + 0.24, sz);

    this.stone = new THREE.Group();
    this.stone.position.set(sx, sy, sz);
    const mainRock = mesh(new THREE.IcosahedronGeometry(0.88, 1), C.stoneMid, 0.03, mossyStoneMat);
    mainRock.scale.set(1.25, 0.42, 0.98);
    mainRock.position.y = 0.12;
    this.stone.add(mainRock);
    const sideRock = mesh(new THREE.IcosahedronGeometry(0.42, 1), C.stoneDark, 0.03, mossyStoneMat);
    sideRock.position.set(0.72, 0.04, 0.22);
    sideRock.scale.set(1.1, 0.55, 0.95);
    this.stone.add(sideRock);
    this.scene.add(this.stone);
    this.interactive('river-stone', this.stone, { label: 'sit by river' });

    // Wooden blue bucket firmly on dry bank right beside the sitting boulder (clickable to drop caught fish in!)
    this.bucket = new THREE.Group();
    const bktX = sx - 0.92;
    const bktZ = sz + 0.58;
    this.bucket.position.set(bktX, ground(bktX, bktZ), bktZ);
    place(cyl(0.3, 0.24, 0.46, C.blue, 12), 0, 0.23, 0, this.bucket);
    const rim = place(mesh(new THREE.TorusGeometry(0.29, 0.025, 6, 14), C.woodDark), 0, 0.45, 0, this.bucket);
    rim.rotation.x = Math.PI / 2;
    place(cyl(0.265, 0.265, 0.03, '#4f90c0', 12), 0, 0.38, 0, this.bucket);
    this.scene.add(this.bucket);
    this.interactive('fish-bucket', this.bucket, { label: 'put fish in bucket' });
    this.bucketFish = [];

    // Forked wooden rod-rest stick beside the sitting boulder — fishing rod sits READY before you sit!
    place(cyl(0.026, 0.032, 0.62, C.woodDark, 6), sx + 0.28, sy + 0.28, sz - 0.35, this.scene);
    this.rodRestPos = V(sx + 0.26, sy + 0.56, sz - 0.28);
    this.rodHoldPos = V(sx + 0.24, sy + 0.88, sz - 0.15);

    // Bamboo fishing rod (visible & propped ready before sitting; lifted cleanly into player's hand when seated!)
    this.rodPivot = new THREE.Group();
    this.rodPivot.position.copy(this.rodRestPos);
    const rodStick = beamBetween(V(0, 0, 0), V(-0.18, 0.78, -2.05), 0.024, C.woodWarm);
    this.rodPivot.add(rodStick);
    this.rodPivot.visible = true;
    this.scene.add(this.rodPivot);

    this.fishingLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => V())),
      new THREE.LineBasicMaterial({ color: '#eef4e8', transparent: true, opacity: 0.85 })
    );
    this.fishingLine.visible = false;
    this.scene.add(this.fishingLine);

    this.bobber = new THREE.Group();
    place(sphere(0.085, C.kilimRed, 1), 0, 0.03, 0, this.bobber);
    place(sphere(0.08, C.chalk, 1), 0, -0.03, 0, this.bobber);
    this.bobber.position.set(sx - 0.5, wy + 0.04, riverCenterZ(sx));
    this.bobber.visible = false;
    this.scene.add(this.bobber);
    this.interactive('fish-reel', this.bobber, { label: 'reel' });

    // Expanding pixel ripple ring around bobber
    this.rippleRing = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.24, 16),
      new THREE.MeshBasicMaterial({ color: C.foam, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    this.rippleRing.rotation.x = -Math.PI / 2;
    this.rippleRing.visible = false;
    this.scene.add(this.rippleRing);

    // Big forgiving water casting zone in front of the sitting rock
    this.castTarget = V(sx - 0.3, wy + 0.05, riverCenterZ(sx) - 0.2);
    this.fishWater = place(
      box(6.2, 0.05, 3.6, C.teal),
      sx - 0.4,
      wy + 0.01,
      riverCenterZ(sx) - 0.2,
      this.scene
    );
    this.fishWater.material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
    this.fishWater.userData.noCastShadow = true;
    this.fishWater.userData.noReceivedShadow = true;
    this.fishWater.userData.noNormal = true;
    this.fishWater.layers.set(0);
    this.interactive('fish-cast', this.fishWater, { label: 'cast' });

    this.splash = points(16, C.foam, 2.5, 0.95);
    this.splash.material.sizeAttenuation = false;
    this.splash.visible = false;
    this.scene.add(this.splash);

    // Detailed wriggling silver river trout (arcs into player's hands on reel, then drops into bucket on click!)
    this.fishFlash = makeDetailedFish(1.25);
    this.fishFlash.position.set(sx, wy + 0.1, riverCenterZ(sx));
    this.fishFlash.visible = false;
    this.scene.add(this.fishFlash);

    // Second mossy bank rock on the left so a present-day village kid sits fishing (letting you take over the spare rod!)
    const friendRock = mesh(new THREE.IcosahedronGeometry(0.66, 1), C.stoneMid, 0.03, mossyStoneMat);
    friendRock.position.set(sx - 1.55, sy + 0.08, sz + 0.04);
    friendRock.scale.set(1.22, 0.44, 0.96);
    this.scene.add(friendRock);

    // Present-day village kid sitting on the left stone (temporarily lends you the ready rod & cheers your catch!)
    this.riverKidSeat = V(sx - 1.55, sy + 0.22, sz + 0.04);
    this.riverKidWatch = V(sx - 2.15, ground(sx - 2.15, sz + 1.05), sz + 1.05);
    this.riverKid = this.figure(
      {
        height: 1.2,
        palette: C.blueLight,
        stripe: C.chalk,
        trouser: C.dark,
        shorts: true,
        hairStyle: 'ponytail',
        hair: '#3e2d22',
        child: true,
        pose: 'sit',
        seed: 35,
      },
      this.riverKidSeat.x,
      this.riverKidSeat.z
    );
    this.riverKid.position.copy(this.riverKidSeat);
    faceFigure(this.riverKid, V(sx - 1.55, wy, riverCenterZ(sx) - 2));
    this.riverKid.userData.action = 'fish';
    this.riverKid.userData.actionUntil = Infinity;
    this.riverKidRod = beamBetween(V(0.2, 0.55, 0.1), V(0.35, 1.4, 1.55), 0.018, C.woodWarm);
    this.riverKid.add(this.riverKidRod);
    this.interactive('npc-riverkid', this.riverKid, { label: 'chat with kid', quietMarker: true });

    // Childhood friend sitting beside you during river memory
    this.friend = this.figure(
      { height: 1.18, palette: C.terracotta, stripe: C.cream, trouser: C.dark, shorts: true, hairStyle: 'messy', child: true, pose: 'sit', seed: 33 },
      sx - 1.55,
      sz + 0.04
    );
    this.friend.position.y = sy + 0.22;
    faceFigure(this.friend, V(sx - 1.55, wy, riverCenterZ(sx) - 2));
    this.friend.add(beamBetween(V(0.2, 0.55, 0.1), V(0.35, 1.4, 1.55), 0.018, C.woodWarm));
    this.friend.visible = false;

    // Childhood player sitting on the main mossy rock during the river sepia memory!
    this.riverChild = this.figure(
      { height: 1.14, palette: C.rust, stripe: C.cream, trouser: C.dark, shorts: true, headwear: 'cap', hair: '#3b2d24', child: true, pose: 'sit', seed: 73 },
      sx,
      sz
    );
    this.riverChild.position.copy(this.riverSeatPos);
    faceFigure(this.riverChild, V(sx, wy, riverCenterZ(sx) - 2.5));
    this.riverChild.userData.action = 'fish';
    this.riverChild.userData.actionUntil = Infinity;
    this.riverChild.visible = false;

    // Animated turquoise river dragonflies!
    this.dragonflies = [];
    for (let i = 0; i < 3; i++) {
      const df = new THREE.Group();
      place(box(0.04, 0.04, 0.22, '#5ad4e6'), 0, 0, 0, df);
      place(box(0.28, 0.02, 0.06, '#e8f8fc'), 0, 0.02, 0.02, df);
      df.userData = { cx: sx - 0.6 + i * 1.4, cz: riverCenterZ(sx) + (i - 1) * 0.7, phase: i * 2.1 };
      this.scene.add(df);
      this.dragonflies.push(df);
    }
  }

  // STOP 4: Tandır Bread Courtyard — richly detailed Anatolian courtyard with clay tandır oven,
  // yer sofrası kneading board, dough balls, oklava, rapata cushion, stacked blistered loaves & warm firelight!
  buildBreadOven() {
    const cx = 7.2;
    const cz = -28.0;
    const y = ground(cx, cz);
    this.ovenCenter = V(cx, y, cz);

    // Walled cozy courtyard with paved earth pad & registered wall obstacles (clean open SW gateway!)
    const yard = place(box(8.8, 0.06, 8.0, '#c8a674', 0.02), cx, y + 0.01, cz, this.scene);
    yard.castShadow = false;
    yard.receiveShadow = true;
    mudBrickWall(this.scene, cx, cz - 4.0, 9.0, 'x', 1.0);
    this.addObstacleBox(cx, cz - 4.0, 9.1, 0.55);
    mudBrickWall(this.scene, cx + 4.4, cz, 8.2, 'z', 0.92);
    this.addObstacleBox(cx + 4.4, cz, 0.55, 8.3);
    mudBrickWall(this.scene, cx - 4.4, cz - 1.8, 4.4, 'z', 0.85);
    this.addObstacleBox(cx - 4.4, cz - 1.8, 0.55, 4.5);
    mudBrickWall(this.scene, cx + 1.8, cz + 4.0, 5.2, 'x', 0.75);
    this.addObstacleBox(cx + 1.8, cz + 4.0, 5.3, 0.55);

    // Fig tree shading the back corner of the courtyard
    const fig = makeTree(this.rng, 'mulberry', 0.92, false);
    fig.position.set(cx + 3.0, y, cz - 2.6);
    this.scene.add(fig);
    this.addObstacleCircle(cx + 3.0, cz - 2.6, 0.55);

    // Authentic Anatolian clay tandır pit oven (stone hearth, tapered plastered clay body,
    // draft vent hole with glowing embers, soot-rimmed lip, and 2 flatbreads baking on the inner wall!)
    this.oven = new THREE.Group();
    this.oven.position.set(cx + 0.3, y, cz - 0.65);
    this.scene.add(this.oven);
    this.addObstacleCircle(cx + 0.3, cz - 0.65, 1.35);

    // Fieldstone hearth base ring + raised stone apron
    place(cyl(1.22, 1.36, 0.34, C.stoneMid, 12), 0, 0.17, 0, this.oven);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      place(sphere(0.18, i % 2 ? C.stoneLight : C.stoneDark, 0), Math.cos(a) * 1.24, 0.14, Math.sin(a) * 1.24, this.oven).scale.set(1.2, 0.65, 1.1);
    }
    // Sculpted hand-plastered clay tandır body + lower air draft vent (kül deliği) with embers!
    place(cyl(0.92, 1.15, 0.84, '#bd8958', 14), 0, 0.72, 0, this.oven);
    place(box(0.32, 0.24, 0.16, '#261a14'), -0.82, 0.42, 0.72, this.oven).rotation.y = -0.75;
    const ventGlow = place(box(0.22, 0.14, 0.08, '#ff8e2b'), -0.8, 0.4, 0.7, this.oven);
    ventGlow.rotation.y = -0.75;
    ventGlow.material = new THREE.MeshBasicMaterial({ color: '#ff9632' });

    // Soot-darkened clay rim collar
    const lip = place(mesh(new THREE.TorusGeometry(0.84, 0.14, 7, 14), '#9e693c', 0.03), 0, 1.14, 0, this.oven);
    lip.rotation.x = Math.PI / 2;
    const sootRim = place(mesh(new THREE.TorusGeometry(0.76, 0.06, 6, 14), '#4c3426', 0.02), 0, 1.18, 0, this.oven);
    sootRim.rotation.x = Math.PI / 2;

    // Deep charred pit interior, glowing ember bed & dancing flame core!
    place(cyl(0.76, 0.68, 0.08, '#291c18', 12), 0, 1.04, 0, this.oven);
    this.fire = place(sphere(0.46, '#ff9836', 1), 0, 1.08, 0, this.oven);
    this.fire.scale.set(1.1, 0.45, 1.1);
    this.fire.material = new THREE.MeshBasicMaterial({ color: '#ffae38' });
    this.fireInner = place(sphere(0.28, '#fff2b0', 0), 0, 1.18, 0.04, this.oven);
    this.fireInner.material = new THREE.MeshBasicMaterial({ color: '#fff2b8' });

    // 2 freshly slapped flatbreads baking on the curved inner hot clay wall!
    const breadMat = flatbreadMaterial();
    for (const [ang, hOff] of [
      [-0.65, 1.07],
      [2.15, 1.06],
    ]) {
      const wallLoaf = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.035, 10), breadMat);
      wallLoaf.position.set(Math.cos(ang) * 0.66, hOff, Math.sin(ang) * 0.66);
      wallLoaf.rotation.z = Math.cos(ang) * 1.15;
      wallLoaf.rotation.x = -Math.sin(ang) * 1.15;
      this.oven.add(wallLoaf);
    }

    // Iron tandır hook (eğsi) leaning neatly on front-right of clay oven (clear of aunt!) + woven rapata pad!
    this.oven.add(beamBetween(V(0.62, 1.24, 0.72), V(0.88, 0.04, 1.06), 0.018, C.dark));
    const rapata = place(sphere(0.17, C.cream, 1), 0.52, 1.16, 0.72, this.oven);
    rapata.scale.set(1.05, 0.38, 1.05);
    place(box(0.22, 0.04, 0.06, C.kilimRed), 0.52, 1.2, 0.72, this.oven);

    // Authentic hammered sheet-iron tandır lid (tandır kapağı / sac kapak) with forged handle perched half-ajar on the back rim!
    this.tandirLid = new THREE.Group();
    this.tandirLid.position.set(-0.34, 1.24, -0.44);
    this.tandirLid.rotation.set(0.24, 0.35, 0.16);
    place(cyl(0.8, 0.86, 0.055, '#474342', 16), 0, 0, 0, this.tandirLid);
    const lidRim = place(mesh(new THREE.TorusGeometry(0.84, 0.028, 6, 16), '#353132', 0.01), 0, -0.01, 0, this.tandirLid);
    lidRim.rotation.x = Math.PI / 2;
    // Crossed forged-iron strap ribs + curved top handle loop
    place(box(1.48, 0.028, 0.075, '#332f30'), 0, 0.036, 0, this.tandirLid);
    place(box(0.075, 0.028, 1.48, '#332f30'), 0, 0.036, 0, this.tandirLid);
    place(mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 12, Math.PI), '#2c2829'), 0, 0.04, 0, this.tandirLid);
    this.oven.add(this.tandirLid);

    // Position the REAL toon shader point light right above the glowing tandır mouth!
    warmLightPos.set(cx + 0.3, y + 1.5, cz - 0.65);

    // Rising bright pixel embers & gentle drifting smoke puffs
    this.embers = points(46, '#ffbe55', 2.6, 0.92);
    this.embers.material.sizeAttenuation = false;
    this.oven.add(this.embers);
    const ep = this.embers.geometry.attributes.position.array;
    for (let i = 0; i < ep.length; i += 3) {
      ep[i] = (this.rng() - 0.5) * 0.85;
      ep[i + 1] = 1.1 + this.rng() * 2.6;
      ep[i + 2] = (this.rng() - 0.5) * 0.85;
    }

    this.smoke = points(24, '#e6d8c8', 0.28, 0.24);
    this.oven.add(this.smoke);
    const sm = this.smoke.geometry.attributes.position.array;
    for (let i = 0; i < sm.length; i += 3) {
      sm[i] = (this.rng() - 0.5) * 0.45;
      sm[i + 1] = 1.4 + this.rng() * 3.8;
      sm[i + 2] = (this.rng() - 0.5) * 0.45;
    }

    // Low round wooden kneading board (yer sofrası) with flour dusting, dough balls (beze) & oklava rolling pin!
    const knX = cx + 1.85;
    const knZ = cz + 1.15;
    place(cyl(0.68, 0.66, 0.08, C.woodWarm, 16), knX, y + 0.22, knZ, this.scene);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      place(cyl(0.035, 0.04, 0.2, C.woodDark, 6), knX + Math.cos(a) * 0.42, y + 0.1, knZ + Math.sin(a) * 0.42, this.scene);
    }
    // White flour dusting + rolled flat dough sheet + slender oklava rolling pin
    place(cyl(0.56, 0.56, 0.01, '#f7f0dc', 14), knX, y + 0.265, knZ, this.scene);
    place(cyl(0.24, 0.24, 0.018, '#f5ebd0', 12), knX - 0.12, y + 0.278, knZ - 0.05, this.scene);
    const oklava = place(cyl(0.016, 0.016, 0.86, C.woodWarm, 8), knX - 0.06, y + 0.298, knZ + 0.08, this.scene);
    oklava.rotation.z = Math.PI / 2;
    oklava.rotation.y = 0.42;
    // 4 plump white dough balls (beze) waiting to be baked!
    for (const [dx, dz] of [
      [0.24, -0.22],
      [0.36, -0.04],
      [0.22, 0.2],
      [0.34, 0.16],
    ]) {
      const ball = place(sphere(0.085, '#f6edd8', 1), knX + dx, y + 0.305, knZ + dz, this.scene);
      ball.scale.set(1.15, 0.72, 1.1);
    }
    this.addObstacleCircle(knX, knZ, 0.72);

    // Cloth-draped wooden table moved CLEANLY to the west-north side (zero collision with player or gate!)
    const tblX = cx - 2.65;
    const tblZ = cz - 1.25;
    place(box(1.55, 0.1, 1.0, C.woodWarm), tblX, y + 0.48, tblZ, this.scene);
    for (const dx of [-0.64, 0.64]) {
      for (const dz of [-0.38, 0.38]) place(cyl(0.04, 0.045, 0.46, C.woodDark, 6), tblX + dx, y + 0.23, tblZ + dz, this.scene);
    }
    // White cloth with warm red Anatolian stripe!
    place(box(1.42, 0.025, 0.88, C.chalk), tblX, y + 0.54, tblZ, this.scene);
    place(box(1.42, 0.028, 0.12, C.kilimRed), tblX, y + 0.545, tblZ + 0.28, this.scene);
    // Stack of freshly baked textured blistered tandır flatbreads!
    for (let i = 0; i < 6; i++) {
      const loaf = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.04, 12), breadMat);
      loaf.position.set(tblX - 0.28 + (i % 2) * 0.08, y + 0.57 + i * 0.042, tblZ - 0.04 + ((i % 3) - 1) * 0.04);
      loaf.rotation.y = i * 0.9;
      this.scene.add(loaf);
    }
    // Terracotta village water jug (testi) & small bowl of village butter/cheese!
    place(sphere(0.14, C.terracotta, 1), tblX + 0.46, y + 0.67, tblZ - 0.16, this.scene).scale.set(0.9, 1.15, 0.9);
    place(cyl(0.048, 0.065, 0.16, C.terracotta, 8), tblX + 0.46, y + 0.84, tblZ - 0.16, this.scene);
    place(cyl(0.12, 0.09, 0.07, C.blueLight, 10), tblX + 0.36, y + 0.585, tblZ + 0.18, this.scene);
    place(sphere(0.085, '#fff5d0', 1), tblX + 0.36, y + 0.62, tblZ + 0.18, this.scene).scale.set(1.0, 0.55, 1.0);
    this.addObstacleBox(tblX, tblZ, 1.7, 1.15);

    // Stacked firewood + dung-cake (tezek) fuel pile along east wall
    for (let i = 0; i < 9; i++) {
      const log = cyl(0.09, 0.1, 1.0, C.woodDark, 6);
      log.rotation.z = Math.PI / 2;
      place(log, cx + 3.2, y + 0.1 + Math.floor(i / 3) * 0.16, cz + 0.4 + (i % 3) * 0.22, this.scene);
    }
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4 - row; col++) {
        place(cyl(0.2, 0.2, 0.075, '#8a6944', 9), cx + 1.8 + col * 0.36 + row * 0.16, y + 0.06 + row * 0.11, cz - 2.6, this.scene);
      }
    }

    // Aunt (white headscarf yazma, terracotta floral top, apron) + younger aunt for bite-memory shimmer
    this.auntHome = V(cx + 1.5, y, cz - 0.35);
    this.aunt = this.figure(
      { height: 1.56, palette: C.terracotta, trouser: C.kilimIndigo, headwear: 'scarf', apron: true, pose: 'stand', seed: 41 },
      this.auntHome.x,
      this.auntHome.z
    );
    faceFigure(this.aunt, this.oven.position);
    this.aunt.userData.action = 'bake';
    this.aunt.userData.actionUntil = Infinity;
    this.interactive('npc-aunt', this.aunt, { label: 'hug aunt', quietMarker: true });

    this.youngAunt = this.figure(
      { height: 1.6, palette: C.blueLight, trouser: C.kilimRed, headwear: 'scarf', apron: true, pose: 'stand', seed: 42 },
      cx + 1.15,
      cz + 0.25
    );
    faceFigure(this.youngAunt, V(cx - 1.55, y + 0.8, cz + 1.4));
    this.youngAunt.visible = false;
    this.youngAunt.userData.action = 'handover';
    this.youngAunt.userData.actionUntil = Infinity;

    // Cozy courtyard eating table + wooden stool so the traveler sits comfortably and eats 3 flatbreads while chatting with Aunt!
    const eatTblX = cx - 0.82;
    const eatTblZ = cz + 1.38;
    const eatTopY = y + 0.68;
    place(box(1.18, 0.08, 0.88, C.woodWarm), eatTblX, eatTopY - 0.04, eatTblZ, this.scene);
    for (const dx of [-0.48, 0.48]) {
      for (const dz of [-0.34, 0.34]) {
        place(cyl(0.036, 0.042, 0.64, C.woodDark, 6), eatTblX + dx, y + 0.32, eatTblZ + dz, this.scene);
      }
    }
    // Embroidered cream table runner + wooden serving platter + small cheese & ayran cup!
    place(box(1.06, 0.02, 0.74, C.chalk), eatTblX, eatTopY + 0.01, eatTblZ, this.scene);
    place(box(1.06, 0.024, 0.11, C.kilimRed), eatTblX, eatTopY + 0.014, eatTblZ + 0.22, this.scene);
    place(cyl(0.32, 0.29, 0.032, C.woodWarm, 14), eatTblX - 0.1, eatTopY + 0.035, eatTblZ - 0.02, this.scene);
    // Small cheese plate & terracotta cup beside the flatbreads
    place(cyl(0.11, 0.09, 0.045, C.blueLight, 10), eatTblX + 0.34, eatTopY + 0.04, eatTblZ - 0.14, this.scene);
    place(box(0.09, 0.05, 0.09, '#fff7dc'), eatTblX + 0.34, eatTopY + 0.07, eatTblZ - 0.14, this.scene);
    place(cyl(0.055, 0.045, 0.13, C.terracotta, 10), eatTblX + 0.32, eatTopY + 0.085, eatTblZ + 0.16, this.scene);
    this.addObstacleBox(eatTblX, eatTblZ, 1.28, 0.96);

    // Wooden stool beside the eating table (left-front side facing table & Aunt!)
    const stoolX = eatTblX - 0.76;
    const stoolZ = eatTblZ + 0.06;
    place(box(0.46, 0.07, 0.46, C.woodWarm), stoolX, y + 0.4, stoolZ, this.scene);
    place(box(0.06, 0.36, 0.46, C.woodDark), stoolX - 0.21, y + 0.61, stoolZ, this.scene);
    for (const sx of [-0.17, 0.17]) {
      for (const sz of [-0.17, 0.17]) {
        place(cyl(0.028, 0.034, 0.39, C.woodDark, 6), stoolX + sx, y + 0.195, stoolZ + sz, this.scene);
      }
    }
    this.breadSeatPos = V(stoolX, y + 0.06, stoolZ);
    this.breadTableTop = V(eatTblX - 0.1, eatTopY + 0.065, eatTblZ - 0.02);

    // Childhood player seated at the courtyard table during bite-memory shimmer!
    this.breadChild = this.figure(
      {
        height: 1.14,
        palette: C.rust,
        stripe: C.cream,
        trouser: C.dark,
        shorts: true,
        headwear: 'cap',
        hair: '#3b2d24',
        child: true,
        pose: 'sit',
        seed: 73,
      },
      stoolX,
      stoolZ
    );
    this.breadChild.position.copy(this.breadSeatPos);
    faceFigure(this.breadChild, V(eatTblX + 0.8, y + 0.8, eatTblZ - 0.5));
    this.breadChild.visible = false;

    // 3 steaming blistered tandır flatbreads stacked cleanly on the wooden platter on the table!
    this.bread = new THREE.Group();
    this.bread.position.copy(this.breadTableTop);
    this.breadBase = this.bread.position.clone();
    this.breadPieces = [];
    for (let i = 0; i < 3; i++) {
      const loaf = makeDetailedFlatbread(0.24 - i * 0.008);
      loaf.position.set((i - 1) * 0.02, i * 0.052, (i % 2 ? 0.015 : -0.015));
      loaf.rotation.y = i * 1.1;
      this.bread.add(loaf);
      this.breadPieces.push(loaf);
    }
    this.scene.add(this.bread);
    this.interactive('bread', this.bread, { label: 'eat flatbread' });

    // Active steaming flatbread carried smoothly to mouth on each of the 3 bites!
    this.breadBitePiece = makeDetailedFlatbread(0.18);
    this.breadBitePiece.visible = false;
    this.scene.add(this.breadBitePiece);

    // Delicate warm steam rising off the stack of fresh flatbreads on the table!
    this.breadSteam = points(12, '#fff8e2', 0.048, 0.58);
    this.scene.add(this.breadSteam);
    const bs = this.breadSteam.geometry.attributes.position.array;
    for (let i = 0; i < bs.length; i += 3) {
      bs[i] = this.breadBase.x + (this.rng() - 0.5) * 0.24;
      bs[i + 1] = this.breadBase.y + 0.12 + this.rng() * 0.38;
      bs[i + 2] = this.breadBase.z + (this.rng() - 0.5) * 0.24;
    }
  }

  // STOP 5: Great-Grandfather's House — golden hour showpiece!
  buildHouse() {
    const y = ground(0, -48);
    this.houseY = y;
    this.house = new THREE.Group();
    this.house.position.set(0, y, -48);
    this.scene.add(this.house);

    // Swept stone-flagged courtyard in front of the house
    const yard = place(box(9.6, 0.08, 6.2, '#ddd0b4', 0.02), 0, 0.02, 5.2, this.house);
    yard.castShadow = false;
    yard.receiveShadow = true;

    // Authentic 2-story Anatolian hilltop village house (konak) with upper cantilevered balcony & real balcony door!
    const shell = place(limeBox(8.2, 5.05, 7.6), 0, 2.525, 0, this.house);
    shell.castShadow = false;
    shell.userData.noCastShadow = true;
    addRoof(this.house, 8.2, 7.6, 5.05, false);

    // Subtle timber string-course belt separating ground floor & upper floor
    place(box(8.34, 0.1, 7.72, C.woodDark), 0, 2.82, 0, this.house);

    // Ground-floor blue-framed windows flanking the entrance cleanly
    for (const wx of [-2.6, 2.6]) {
      addWindow(this.house, wx, 1.54, 3.84, 1.18, 1.04, this.windowLights);
    }
    // Upper-floor blue-framed windows flanking the centered balcony cleanly
    for (const wx of [-2.72, 2.72]) {
      addWindow(this.house, wx, 3.92, 3.84, 1.04, 0.96, this.windowLights);
    }

    // Warm sunlit limestone entrance steps (completely unobstructed!)
    place(box(3.2, 0.2, 1.35, C.chalk), 0, 0.1, 4.55, this.house);
    place(box(2.55, 0.22, 1.05, C.chalk), 0, 0.24, 4.2, this.house);
    // Warm golden sunlit interior doorway portal + carved wood jambs (in front of shell face z=3.80, behind door z=3.88!)
    const hallGlow = place(box(1.38, 2.4, 0.03, '#f7cb7c'), 0, 1.48, 3.825, this.house);
    hallGlow.material = new THREE.MeshBasicMaterial({ color: '#f8ce82' });
    for (const sx of [-0.74, 0.74]) {
      place(box(0.1, 2.52, 0.12, C.woodDark), sx, 1.5, 3.85, this.house);
    }
    place(box(1.58, 0.12, 0.12, C.woodDark), 0, 2.74, 3.85, this.house);

    // Blue wooden door on hinges (swings INWARD smoothly when clicked so player walks right inside!)
    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(-0.7, 0.26, 3.88);
    this.house.add(this.doorPivot);
    place(box(1.4, 2.42, 0.1, C.blue), 0.7, 1.21, 0, this.doorPivot);
    for (let i = 0; i < 4; i++) place(box(1.16, 0.04, 0.03, C.blueLight), 0.7, 0.44 + i * 0.5, 0.06, this.doorPivot);
    place(sphere(0.055, C.gold, 1), 1.18, 1.2, 0.095, this.doorPivot);
    this.interactive('blue-door', this.doorPivot, { label: 'open door' });

    // Proper centered upper-story Anatolian wooden balcony above the entrance (cantilevered on diagonal timber corbels — ZERO posts on the steps!)
    const deckY = 2.88;
    const balW = 3.25;
    place(box(balW, 0.14, 1.16, C.woodWarm), 0, deckY, 4.38, this.house);
    // 4 traditional Anatolian diagonal timber corbel struts (eliböğründe) bracing the balcony neatly to the facade
    for (const cx of [-1.42, -0.82, 0.82, 1.42]) {
      this.house.add(beamBetween(V(cx, deckY - 0.68, 3.84), V(cx, deckY - 0.04, 4.86), 0.058, C.woodDark));
    }
    // Side and front wooden balusters + handrail
    for (let i = 0; i < 8; i++) {
      place(cyl(0.024, 0.03, 0.66, C.woodDark, 6), -1.52 + (i / 7) * 3.04, deckY + 0.36, 4.92, this.house);
    }
    for (const sx of [-1.58, 1.58]) {
      for (const sz of [4.16, 4.54]) {
        place(cyl(0.024, 0.03, 0.66, C.woodDark, 6), sx, deckY + 0.36, sz, this.house);
      }
      place(cyl(0.042, 0.042, 1.12, C.woodWarm, 7), sx, deckY + 0.7, 4.38, this.house).rotation.x = Math.PI / 2;
    }
    place(cyl(0.046, 0.046, balW, C.woodWarm, 7), 0, deckY + 0.7, 4.92, this.house).rotation.z = Math.PI / 2;
    // Real upper-story blue-framed balcony doorway opening out onto the balcony!
    addDoorFrame(this.house, 0, deckY + 0.92, 3.84, 1.24, 1.72, true);
    place(box(0.05, 1.62, 0.04, C.blueLight), 0, deckY + 0.92, 3.91, this.house);
    // Bright Anatolian kilim draped neatly over the center of the upper balcony rail!
    place(box(1.06, 0.72, 0.06, C.kilimRed), 0, deckY + 0.36, 4.97, this.house);
    place(box(1.06, 0.13, 0.07, C.gold), 0, deckY + 0.38, 4.98, this.house);
    place(box(1.06, 0.12, 0.07, C.kilimIndigo), 0, deckY + 0.14, 4.98, this.house);

    // Climbing grapevine rooted cleanly in a terracotta planter at the far-left facade corner (clear of windows & balcony!)
    place(cyl(0.24, 0.18, 0.36, C.terracotta, 10), -3.92, 0.2, 4.02, this.house);
    const vine = makeTree(this.rng, 'mulberry', 0.48, false);
    vine.position.set(-3.92, 0.28, 3.96);
    vine.scale.set(0.46, 1.82, 0.24);
    this.house.add(vine);

    // Whitewashed olive-oil tins brimming with bright red geraniums on steps & yard
    for (const [fx, fy, fz, sc] of [
      [-1.55, 0.2, 4.7, 0.95],
      [1.55, 0.2, 4.7, 0.95],
      [-2.9, 0.05, 4.6, 1.05],
      [2.9, 0.05, 4.6, 1.0],
      [-3.8, 0.05, 5.6, 0.9],
      [3.8, 0.05, 5.6, 0.9],
    ]) {
      makeGeraniumTin(this.house, fx, fy, fz, sc);
    }

    // Low dry-stone courtyard walls (framed cleanly in front so cats have generous breathing room)
    dryStoneWall(this.house, -3.9, 8.2, 4.2, 'x', 0.54, this.rng);
    this.addObstacleBox(-3.9, -39.8, 4.3, 0.6);
    dryStoneWall(this.house, 3.9, 8.2, 4.2, 'x', 0.54, this.rng);
    this.addObstacleBox(3.9, -39.8, 4.3, 0.6);

    // 3 charming distinct cats lounging on the sunlit steps & yard!
    // Cat 0 (black cat): grumpy, naturally lashes tail left & right and refuses to do anything else!
    // Cat 1 (orange tabby): kneads adorable small biscuits & loves being petted!
    // Cat 2 (white cat): bolts behind the house as a joke!
    this.cats = [];
    const catSpecs = [
      { pos: [-1.85, y + 0.08, -42.7], yaw: 0.45, col: C.dusk, accent: C.chalk, stripes: false, biscuits: false, angry: true },
      { pos: [1.95, y + 0.08, -42.8], yaw: -0.55, col: '#d87b34', accent: C.cream, stripes: true, biscuits: true, angry: false },
      { pos: [0.95, y + 0.08, -41.15], yaw: -0.35, col: C.chalk, accent: C.sand, stripes: false, biscuits: false, angry: false },
    ];
    catSpecs.forEach((cs, i) => {
      const cat = makeCat(cs.col, cs.accent, { stripes: cs.stripes, angry: cs.angry });
      cat.position.set(...cs.pos);
      cat.rotation.y = cs.yaw;
      cat.userData.homePos = V(...cs.pos);
      cat.userData.homeYaw = cs.yaw;
      cat.userData.running = false;
      cat.userData.biscuits = cs.biscuits;
      cat.userData.angry = cs.angry;
      this.scene.add(cat);
      this.cats.push(cat);
      if (!cs.angry) this.interactive('cat-' + i, cat, { label: 'pet cat' });
    });
  }

  // STOP 6 & 7: The Reading Room (Cutaway diorama interior) & Ending
  buildReadingRoom() {
    const y = this.houseY;
    this.reading = new THREE.Group();
    this.scene.add(this.reading);

    // Clean raised wooden plank floor (high enough that nothing outside can ever poke through!)
    place(box(7.8, 0.16, 7.6, C.woodWarm, 0.025), 0, y + 0.08, -48, this.reading);

    // Two cutaway lime-washed walls (back wall + left wall with mullioned golden-hour window)
    const backWall = place(box(7.8, 3.6, 0.16, C.chalk), 0, y + 1.88, -51.8, this.reading);
    backWall.material = applyToonShader(matte.clone());
    backWall.material.side = THREE.DoubleSide;
    const leftWall = place(box(0.16, 3.6, 7.6, C.chalk), -3.85, y + 1.88, -48, this.reading);
    leftWall.material = applyToonShader(matte.clone());
    leftWall.material.side = THREE.DoubleSide;

    // Golden-hour window in the left wall
    const win = new THREE.Group();
    win.position.set(-3.72, y + 2.15, -48.6);
    win.rotation.y = Math.PI / 2;
    this.reading.add(win);
    place(box(1.75, 1.55, 0.08, C.blue), 0, 0, 0, win);
    place(box(1.5, 1.3, 0.09, '#ffdf92'), 0, 0, 0.03, win).material = new THREE.MeshBasicMaterial({ color: '#ffe49e' });
    place(box(0.07, 1.32, 0.05, C.chalk), 0, 0, 0.09, win);
    place(box(1.52, 0.07, 0.05, C.chalk), 0, 0, 0.09, win);

    // ONE clean golden sunbeam polygon slanting cleanly across the floor (zero overlapping rects!)
    const beamShape = new THREE.Shape();
    beamShape.moveTo(-3.6, -1.3);
    beamShape.lineTo(1.8, -0.2);
    beamShape.lineTo(2.4, 2.2);
    beamShape.lineTo(-3.6, 1.0);
    beamShape.closePath();
    const sunBeam = new THREE.Mesh(
      new THREE.ShapeGeometry(beamShape),
      new THREE.MeshBasicMaterial({ color: '#ffda88', transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide })
    );
    sunBeam.rotation.x = -Math.PI / 2;
    sunBeam.position.set(0, y + 0.22, -47.9);
    this.reading.add(sunBeam);

    // Rich woven red, indigo & cream Anatolian kilim rug
    place(box(4.8, 0.04, 3.8, C.kilimRed), 0.1, y + 0.18, -47.7, this.reading);
    for (let i = 0; i < 6; i++) {
      place(box(4.6, 0.015, 0.12, i % 2 ? C.kilimIndigo : C.gold), 0.1, y + 0.205, -49.1 + i * 0.56, this.reading);
    }
    for (const sx of [-2.25, 2.45]) place(box(0.14, 0.015, 3.7, C.cream), sx, y + 0.205, -47.7, this.reading);

    // Low wooden bookshelves packed with colorful book spines
    this.shelf = new THREE.Group();
    this.shelf.position.set(0, y + 0.16, -51.4);
    this.reading.add(this.shelf);
    for (const sy of [0.42, 1.02, 1.62]) place(box(5.8, 0.09, 0.5, C.woodDark), 0, sy, 0, this.shelf);
    for (const sx of [-2.85, 0, 2.85]) place(box(0.1, 1.82, 0.5, C.woodDark), sx, 0.91, 0, this.shelf);

    const bookColors = [C.blue, C.kilimRed, C.gold, C.greenMid, C.dusk, C.terracotta, C.cream];
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 22; i++) {
        // Leave clean gap for the selectable glowing book
        if (row === 1 && i === 6) continue;
        const bh = 0.34 + this.rng() * 0.15;
        const bk = place(
          box(0.16, bh, 0.3, bookColors[(i + row * 2) % bookColors.length]),
          -2.55 + i * 0.24,
          0.48 + row * 0.6 + bh * 0.5 - 0.16,
          0.05,
          this.shelf
        );
        bk.rotation.z = (this.rng() - 0.5) * 0.08;
      }
    }

    // Warm lovingly painted framed family portrait of Great-Grandfather Dede on the reading room wall!
    const drawTex = canvasTexture(160, 128, (ctx, w, h) => {
      // Soft golden Anatolian hill backdrop inside warm parchment mat
      ctx.fillStyle = '#efe3c6';
      ctx.fillRect(0, 0, w, h);
      const sky = ctx.createLinearGradient(0, 8, 0, h - 8);
      sky.addColorStop(0, '#c8d6df');
      sky.addColorStop(0.55, '#ebd6a6');
      sky.addColorStop(1, '#c89b62');
      ctx.fillStyle = sky;
      ctx.fillRect(8, 8, w - 16, h - 16);
      // Distant Anatolian rolling hill & cypress silhouette
      ctx.fillStyle = '#9aa87c';
      ctx.beginPath();
      ctx.ellipse(w * 0.25, h * 0.84, 52, 24, 0, Math.PI, Math.PI * 2);
      ctx.ellipse(w * 0.8, h * 0.82, 58, 28, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4e6f3b';
      ctx.beginPath();
      ctx.ellipse(w * 0.84, h * 0.56, 6, 22, 0, 0, Math.PI * 2);
      ctx.fill();

      // Warm dark wool vest & collared cream shirt
      ctx.fillStyle = '#4c4558';
      ctx.beginPath();
      ctx.ellipse(w * 0.48, h * 0.96, 38, 28, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2e6c8';
      ctx.beginPath();
      ctx.moveTo(w * 0.4, h * 0.72);
      ctx.lineTo(w * 0.56, h * 0.72);
      ctx.lineTo(w * 0.48, h * 0.88);
      ctx.closePath();
      ctx.fill();
      // Little open book held warmly in lower corner
      ctx.fillStyle = '#3978a8';
      ctx.fillRect(w * 0.58, h * 0.74, 24, 18);
      ctx.fillStyle = '#f7edd2';
      ctx.fillRect(w * 0.6, h * 0.76, 9, 14);
      ctx.fillRect(w * 0.71, h * 0.76, 9, 14);

      // Kind sunlit face, rosy cheeks, warm eyes & proud silver Anatolian mustache!
      ctx.fillStyle = '#e5be90';
      ctx.fillRect(w * 0.44, h * 0.62, 12, 12);
      ctx.fillStyle = '#f0cfa0';
      ctx.beginPath();
      ctx.ellipse(w * 0.48, h * 0.48, 20, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e09a80';
      ctx.beginPath();
      ctx.ellipse(w * 0.39, h * 0.52, 4.5, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(w * 0.57, h * 0.52, 4.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Silver hair tufts & classic flat cap
      ctx.fillStyle = '#e4dfd2';
      ctx.fillRect(w * 0.34, h * 0.38, 6, 10);
      ctx.fillRect(w * 0.58, h * 0.38, 6, 10);
      ctx.fillStyle = '#6c523c';
      ctx.beginPath();
      ctx.ellipse(w * 0.48, h * 0.3, 24, 11, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3c312b';
      ctx.beginPath();
      ctx.ellipse(w * 0.49, h * 0.33, 25, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Expressive smiling eyes, bushy silver brows & curved silver mustache!
      ctx.fillStyle = '#ded8cc';
      ctx.fillRect(w * 0.39, h * 0.41, 11, 3);
      ctx.fillRect(w * 0.5, h * 0.41, 11, 3);
      ctx.fillStyle = '#252028';
      ctx.fillRect(w * 0.41, h * 0.45, 4, 4);
      ctx.fillRect(w * 0.52, h * 0.45, 4, 4);
      ctx.fillStyle = '#f3eee2';
      ctx.beginPath();
      ctx.ellipse(w * 0.44, h * 0.56, 10, 4.5, -0.2, 0, Math.PI * 2);
      ctx.ellipse(w * 0.52, h * 0.56, 10, 4.5, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Inner gold trim border
      ctx.strokeStyle = '#c89b44';
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 8, w - 16, h - 16);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 1.04), plainMaterial('#ffffff', { map: drawTex }));
    sign.position.set(1.75, y + 2.62, -51.655);
    this.reading.add(sign);
    place(box(1.44, 1.16, 0.05, C.woodDark), 1.75, y + 2.62, -51.71, this.reading);
    place(box(1.37, 1.09, 0.052, C.gold), 1.75, y + 2.62, -51.7, this.reading);

    // Selectable glowing blue-and-gold book on the middle shelf
    this.chosenBook = new THREE.Group();
    this.chosenBook.position.set(-1.11, y + 1.24, -51.25);
    place(box(0.22, 0.48, 0.34, C.blue), 0, 0, 0, this.chosenBook);
    place(box(0.23, 0.08, 0.35, C.gold), 0, 0.12, 0, this.chosenBook);
    this.scene.add(this.chosenBook);
    this.interactive('book', this.chosenBook, { label: 'pick a book' });

    // Open illustrated book resting in the golden sunbeam
    const pageTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#f2e2be';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#6c523b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.36, w * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.34, h * 0.44);
      ctx.lineTo(w * 0.5, h * 0.24);
      ctx.lineTo(w * 0.66, h * 0.44);
      ctx.closePath();
      ctx.stroke();
      for (let j = 0; j < 6; j++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.18, h * 0.62 + j * 14);
        ctx.lineTo(w * (0.72 + (j % 2) * 0.08), h * 0.62 + j * 14);
        ctx.stroke();
      }
    });
    this.openBook = new THREE.Group();
    this.openBook.position.set(0.0, y + 0.78, -46.85);
    this.openBook.rotation.x = -0.55;
    for (const s of [-1, 1]) {
      const page = new THREE.Mesh(
        new THREE.PlaneGeometry(0.46, 0.58),
        plainMaterial('#ffffff', { map: pageTex, side: THREE.DoubleSide })
      );
      page.position.x = s * 0.235;
      page.rotation.y = s * 0.08;
      this.openBook.add(page);
    }
    this.openBook.visible = false;
    this.scene.add(this.openBook);

    // Colorful floor cushions (minder) & 4 village children reading!
    const cushionSpecs = [
      [-2.05, -48.15, C.blue],
      [1.6, -48.3, C.gold],
      [-0.5, -49.4, C.greenMid],
      [2.1, -46.6, C.terracotta],
      [0.0, -46.4, C.kilimRed], // Player's cushion in the golden light!
    ];
    for (const [cx, cz, col] of cushionSpecs) {
      place(box(0.92, 0.18, 0.82, col), cx, y + 0.26, cz, this.reading);
    }

    // Great-Grandfather Dede's heirloom carved walnut reading armchair (koltuk) & little brass-lamp side table!
    this.dedeChairPos = V(-1.52, y + 0.24, -45.88);
    this.dedeChairYaw = 1.88; // Angled warmly toward the open book & grandson in the golden sunbeam!
    this.dedeChair = new THREE.Group();
    this.dedeChair.position.set(this.dedeChairPos.x, y + 0.16, this.dedeChairPos.z);
    this.dedeChair.rotation.y = this.dedeChairYaw;
    this.reading.add(this.dedeChair);
    // Turned dark walnut legs & stretchers
    for (const lx of [-0.36, 0.36]) {
      for (const lz of [-0.34, 0.32]) {
        place(cyl(0.036, 0.044, 0.34, C.woodDark, 8), lx, 0.17, lz, this.dedeChair);
      }
    }
    place(box(0.72, 0.045, 0.045, C.woodDark), 0, 0.12, -0.32, this.dedeChair);
    place(box(0.045, 0.045, 0.64, C.woodDark), -0.36, 0.12, 0, this.dedeChair);
    place(box(0.045, 0.045, 0.64, C.woodDark), 0.36, 0.12, 0, this.dedeChair);
    // Carved wooden seat frame + plush deep burgundy & gold brocade seat cushion!
    place(box(0.82, 0.08, 0.76, C.woodWarm), 0, 0.32, -0.02, this.dedeChair);
    place(box(0.74, 0.12, 0.68, C.kilimRed), 0, 0.4, 0.0, this.dedeChair);
    place(box(0.68, 0.025, 0.12, C.gold), 0, 0.462, 0.16, this.dedeChair);
    // Tall slatted heirloom backrest with arched walnut crest rail & carved side ears!
    for (const bx of [-0.37, 0.37]) {
      place(cyl(0.038, 0.042, 0.98, C.woodDark, 8), bx, 0.8, -0.35, this.dedeChair);
      place(sphere(0.052, C.gold, 1), bx, 1.32, -0.35, this.dedeChair);
    }
    for (let i = -2; i <= 2; i++) {
      place(box(0.055, 0.78, 0.04, C.woodWarm), i * 0.135, 0.82, -0.35, this.dedeChair);
    }
    place(box(0.84, 0.12, 0.08, C.woodDark), 0, 1.26, -0.35, this.dedeChair);
    place(box(0.62, 0.08, 0.085, C.woodWarm), 0, 1.34, -0.35, this.dedeChair);
    // Plush tufted backrest pillow tucked neatly into the chair!
    const backPillow = place(box(0.64, 0.56, 0.14, C.kilimRed), 0, 0.76, -0.25, this.dedeChair);
    backPillow.rotation.x = -0.1;
    place(box(0.64, 0.09, 0.15, C.kilimIndigo), 0, 0.74, -0.245, this.dedeChair).rotation.x = -0.1;
    place(box(0.64, 0.04, 0.155, C.gold), 0, 0.82, -0.245, this.dedeChair).rotation.x = -0.1;
    // Sculpted armrests with carved front posts + warm folded cream wool shawl draped over the left arm!
    for (const sx of [-0.39, 0.39]) {
      place(cyl(0.036, 0.042, 0.34, C.woodDark, 7), sx, 0.48, 0.3, this.dedeChair);
      place(box(0.09, 0.065, 0.72, C.woodWarm), sx, 0.66, -0.02, this.dedeChair);
      place(sphere(0.048, C.woodDark, 1), sx, 0.66, 0.34, this.dedeChair);
    }
    // Folded cream-and-gold knit shawl draped warmly over Dede's armrest
    place(box(0.14, 0.05, 0.34, C.cream), -0.4, 0.705, -0.02, this.dedeChair);
    place(box(0.045, 0.32, 0.32, C.cream), -0.45, 0.54, -0.02, this.dedeChair);
    place(box(0.05, 0.055, 0.32, C.gold), -0.452, 0.44, -0.02, this.dedeChair);

    // Small round Anatolian walnut side table (sehpa) tucked neatly beside Dede's armchair (clear of his walking path!)
    const sehpa = new THREE.Group();
    sehpa.position.set(-2.32, y + 0.16, -46.45);
    this.reading.add(sehpa);
    place(cyl(0.28, 0.26, 0.055, C.woodWarm, 12), 0, 0.48, 0, sehpa);
    place(cyl(0.045, 0.07, 0.46, C.woodDark, 8), 0, 0.23, 0, sehpa);
    place(cyl(0.18, 0.2, 0.04, C.woodDark, 10), 0, 0.02, 0, sehpa);
    // Warm brass-and-cream table lamp + tiny tulip glass on the sehpa
    place(cyl(0.06, 0.08, 0.18, C.gold, 10), -0.06, 0.59, -0.04, sehpa);
    const shade = place(cyl(0.075, 0.14, 0.16, '#fff0c2', 10), -0.06, 0.74, -0.04, sehpa);
    shade.material = new THREE.MeshBasicMaterial({ color: '#ffeaad' });
    const sideCup = makeTulipTeaGlass(0.72, true);
    sideCup.position.set(0.11, 0.52, 0.08);
    sehpa.add(sideCup);

    this.readingKids = [];
    const kidSpots = [
      [-2.05, -48.15, C.terracotta, C.cream, 'ponytail'],
      [1.6, -48.3, C.blue, C.chalk, 'messy'],
      [-0.5, -49.4, C.cream, C.kilimRed, 'parted'],
      [2.1, -46.6, C.greenBright, C.cream, 'ponytail'],
    ];
    kidSpots.forEach(([kx, kz, col, stripe, hStyle], i) => {
      const f = this.figure(
        { height: 1.15 + i * 0.03, palette: col, stripe, trouser: C.dark, shorts: i % 2 === 1, hairStyle: hStyle, child: true, pose: 'sit', seed: 50 + i },
        kx,
        kz
      );
      f.position.y = y + 0.34;
      faceFigure(f, V(0, y, -50.8));
      f.userData.action = 'read';
      f.userData.actionUntil = Infinity;
      const bk = place(box(0.34, 0.04, 0.42, C.chalk), 0, 0.34, 0.44, f);
      bk.rotation.x = -0.38;
      this.readingKids.push(f);
      this.interactive('npc-readkid-' + i, f, { label: 'greet child', quietMarker: true });
    });

    // Player's childhood self & Great-Grandfather Dede (appear at the ending!)
    this.selfChild = this.figure(
      { height: 1.14, palette: C.rust, stripe: C.cream, trouser: C.dark, shorts: true, headwear: 'cap', hair: '#3b2d24', child: true, pose: 'sit', seed: 58 },
      0,
      -46.4
    );
    this.selfChild.position.y = y + 0.34;
    faceFigure(this.selfChild, V(0, y, -51));
    this.selfChild.visible = false;
    this.selfChild.userData.action = 'read';
    this.selfChild.userData.actionUntil = Infinity;

    this.dede = this.figure(
      {
        height: 1.64,
        palette: C.cream,
        shirt: C.cream,
        vest: C.dusk,
        trouser: C.dark,
        headwear: 'cap',
        hair: '#ded8cc',
        mustache: '#e8e2d5',
        pose: 'walk',
        cane: true,
        seed: 61,
      },
      -3.1,
      -46.5
    );
    this.dede.position.y = y + 0.18;
    this.dede.visible = false;
    faceFigure(this.dede, V(0, y, -46.4));

    // Floating golden dust motes in the sunbeam
    this.roomDust = points(80, '#ffe49e', 2.0, 0.65);
    this.roomDust.material.sizeAttenuation = false;
    const dp = this.roomDust.geometry.attributes.position.array;
    for (let i = 0; i < dp.length; i += 3) {
      dp[i] = -3.2 + this.rng() * 6.2;
      dp[i + 1] = y + 0.4 + this.rng() * 2.8;
      dp[i + 2] = -51.0 + this.rng() * 6.2;
    }
    this.reading.add(this.roomDust);
    this.reading.visible = false;
  }

  // Clickable glowing golden uphill chevrons placed cleanly at each stop's open exit/roadway!
  buildRoadLeaves() {
    this.leaves = new Map();
    const leaveSpecs = {
      1: { pos: V(-1.1, ground(-1.1, 17.6) + 0.08, 17.6), yaw: 0.05 }, // Open village road beside tea terrace, clear of uncles!
      2: { pos: V(4.2, ground(4.2, 3.65) + 0.08, 3.65), yaw: Math.PI * 0.45 }, // Right at the open stone pitch gateway heading out!
      3: { pos: V(-1.8, this.walkHeight(-1.8, -11.0) + 0.08, -11.0), yaw: -0.15 }, // Cleanly on the south bridge approach heading north!
      4: { pos: V(3.3, ground(3.3, -26.5) + 0.08, -26.5), yaw: Math.PI * 0.36 }, // Cleanly inside the open bread courtyard gateway!
    };

    const shape = new THREE.Shape();
    shape.moveTo(-0.22, -0.18);
    shape.lineTo(0, 0.12);
    shape.lineTo(0.22, -0.18);
    shape.lineTo(0.22, -0.02);
    shape.lineTo(0, 0.28);
    shape.lineTo(-0.22, -0.02);
    shape.closePath();

    for (let n = 1; n <= 4; n++) {
      const sp = leaveSpecs[n];
      const g = new THREE.Group();
      g.position.copy(sp.pos);
      g.rotation.y = sp.yaw;
      const chevrons = [];
      for (let i = 0; i < 3; i++) {
        const ch = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshBasicMaterial({ color: '#ffe49e', transparent: true, opacity: 0.92, depthTest: false, side: THREE.DoubleSide })
        );
        ch.rotation.x = -Math.PI / 2;
        ch.position.set(0, 0.06, -i * 0.45 + 0.45);
        ch.renderOrder = 11;
        g.add(ch);
        chevrons.push(ch);
      }
      // Subtle warm glow pad underneath
      const hit = place(cyl(0.95, 0.95, 0.04, C.gold, 14), 0, 0.02, 0, g);
      hit.material = plainMaterial('#ffd478', { transparent: true, opacity: 0.18, depthWrite: false });
      g.visible = false;
      this.scene.add(g);
      this.interactive('leave-' + n, g, { label: 'walk uphill' });
      this.leaves.set(n, { group: g, chevrons });
    }
  }

  // Clickable glowing golden entrance pads for Stops 1..5 (when paused on roadside looking around!)
  buildEntrances() {
    this.entrances = new Map();
    // Note: local chevron tip points along -Z, so yaw=+PI/2 points -X (west), yaw=-PI/2 points +X (east), yaw=0 points -Z (north)!
    const specs = {
      1: { pos: V(-3.4, this.terraceY + 0.08, 19.3), yaw: Math.PI * 0.44 }, // Cleanly on sunlit Tea House terrace entry
      2: { pos: V(3.2, this.pitchCenter.y + 0.08, 3.85), yaw: -Math.PI * 0.5 }, // Dead center of open Football stone gate (+X)
      3: { pos: V(-3.6, ground(-3.6, -10.3) + 0.08, -10.3), yaw: Math.PI * 0.42 }, // Grassy bank path down to River stones
      4: { pos: V(3.3, this.ovenCenter.y + 0.08, -26.2), yaw: -Math.PI * 0.4 }, // Open Tandır courtyard gateway (+X/-Z)
      5: { pos: V(0.0, this.houseY + 0.08, -40.3), yaw: 0 }, // Center of Great-Grandfather's front stone gate (-Z)
    };

    const shape = new THREE.Shape();
    shape.moveTo(-0.26, -0.18);
    shape.lineTo(0, 0.16);
    shape.lineTo(0.26, -0.18);
    shape.lineTo(0.26, -0.01);
    shape.lineTo(0, 0.32);
    shape.lineTo(-0.26, -0.01);
    shape.closePath();

    for (let n = 1; n <= 5; n++) {
      const sp = specs[n];
      const g = new THREE.Group();
      g.position.copy(sp.pos);
      g.rotation.y = sp.yaw;
      const chevrons = [];
      for (let i = 0; i < 3; i++) {
        const ch = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshBasicMaterial({ color: '#ffe89e', transparent: true, opacity: 0.92, depthTest: false, side: THREE.DoubleSide })
        );
        ch.rotation.x = -Math.PI / 2;
        ch.position.set(0, 0.06, -i * 0.48 + 0.48);
        ch.renderOrder = 11;
        g.add(ch);
        chevrons.push(ch);
      }
      const hit = place(cyl(1.25, 1.25, 0.04, C.gold, 16), 0, 0.02, 0, g);
      hit.material = plainMaterial('#ffd478', { transparent: true, opacity: 0.22, depthWrite: false });
      g.visible = false;
      this.scene.add(g);
      this.interactive('enter-' + n, g, { label: 'enter' });
      this.entrances.set(n, { group: g, chevrons });
    }
  }

  buildInteractionMarkers() {
    const tex = makeMarkerTexture();
    this.markerBox = new THREE.Box3();
    this.markerCenter = new THREE.Vector3();
    for (const item of this.interactables) {
      const marker = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })
      );
      marker.renderOrder = 15;
      marker.visible = false;
      marker.userData.interaction = item.id;
      this.scene.add(marker);
      item.marker = marker;
      item.meshes.push(marker);
    }
  }

  updateInteractionMarkers(game) {
    const pixelWorld = (game.camera.top - game.camera.bottom) / (game.camera.userData.pixelHeight || 240);
    const hint = game.stops?.hint();
    this._markerFrame = ((this._markerFrame || 0) + 1) % 3;
    for (const item of this.interactables) {
      const marker = item.marker;
      const enabled = game.stops?.isEnabled(item.id) || false;
      marker.visible = enabled;
      if (!enabled) continue;
      // Cache static prop boxes & refresh moving boxes every 3rd frame to avoid heavy per-frame Box3 traversals!
      const dynamic =
        item.id === 'sip' ||
        item.id === 'tea-stir' ||
        item.id === 'football-ball' ||
        item.id.startsWith('cat-') ||
        item.id.startsWith('npc-');
      if (!item._box || (dynamic && this._markerFrame === 0)) {
        item.root.updateWorldMatrix(true, true);
        if (!item._box) item._box = new THREE.Box3();
        item._box.setFromObject(item.root);
      }
      if (item._box.isEmpty()) {
        marker.visible = false;
        continue;
      }
      item._box.getCenter(this.markerCenter);
      const bob = Math.sin(this.time * Math.PI * 2 * 1.35 + item.id.length) * pixelWorld * 2.2;
      const markerY = item.id === 'blue-door' ? this.markerCenter.y + 0.15 : item._box.max.y + 0.34;
      marker.position.set(this.markerCenter.x, markerY + bob, this.markerCenter.z);
      const isHint = item.id === hint;
      const isHover = item.id === game.interactions.hovered;
      const baseMul = item.quietMarker ? 0.68 : 1.0;
      const sz = 7 * pixelWorld * (isHover ? 1.45 : isHint ? 1.3 : baseMul);
      marker.scale.set(sz, sz, 1);
      marker.material.color.set(isHover ? '#ffffff' : isHint ? '#fff5c8' : '#ffd882');
      marker.material.opacity = isHover || isHint ? 1.0 : item.quietMarker ? 0.56 : 0.88;
    }
  }

  // Carefully framed diorama views & exact player spots per stop (verified zero clipping!)
  makeViews() {
    const tY = this.terraceY;
    const fy = this.pitchCenter.y;
    const by = this.ovenCenter.y;
    const hy = this.houseY;

    this.playerSpots = [
      { pos: V(-0.95, ground(-0.95, 34.0), 34.0), pose: 'stand', lookAt: V(0, ground(0, 20), 20) }, // Cleanly clear of minibus door!
      { pos: V(-6.06, tY + 0.06, 18.4), pose: 'sit', lookAt: V(-5.3, tY + 0.9, 18.4) }, // Seated cleanly right at table edge on left chair!
      { pos: V(9.75, fy, 3.55), pose: 'stand', lookAt: V(10.5, fy + 1.0, -6.3) }, // Athletic free-kick stance behind ball with clean run-up!
      { pos: V(-5.0, ground(-5.0, -10.2), -10.2), pose: 'stand', lookAt: this.riverSeatPos }, // Dry grassy bank approaching boulder!
      { pos: this.breadSeatPos.clone(), pose: 'sit', lookAt: V(this.ovenCenter.x + 1.1, by + 1.0, this.ovenCenter.z - 0.1) }, // Seated warmly at courtyard bread table!
      { pos: V(0.0, hy + 0.08, -42.2), pose: 'stand', lookAt: V(0, hy + 1.4, -48) }, // In swept sunlit courtyard!
      { pos: V(0.0, hy + 0.16, -45.6), pose: 'stand', lookAt: V(-1.1, hy + 1.3, -51.2) }, // Inside cozy reading room!
      { pos: V(0.0, hy + 0.34, -46.4), pose: 'sit', lookAt: V(0, hy + 0.8, -51.0) },
    ];

    // Roadside pause spots where the player can drag & look around 360° before choosing to enter each place!
    const roadPt = (n) => this.road.getPoint(this.roadT[n]);
    this.approachSpots = {
      1: { pos: roadPt(1), pose: 'stand', lookAt: V(-5.5, tY + 1.0, 18.0) },
      2: { pos: roadPt(2), pose: 'stand', lookAt: V(8.5, fy + 1.0, 1.0) },
      3: { pos: roadPt(3), pose: 'stand', lookAt: V(-6.0, this.riverY + 0.5, -13.0) },
      4: { pos: roadPt(4), pose: 'stand', lookAt: V(7.2, by + 1.0, -28.0) },
      5: { pos: roadPt(5), pose: 'stand', lookAt: V(0.0, hy + 1.5, -45.5) },
    };

    this.approachViews = {
      1: { target: V(-3.2, tY + 0.9, 19.2), viewHeight: 11.8, yaw: 0.44, pitch: THREE.MathUtils.degToRad(38) },
      2: { target: V(2.4, fy + 0.9, 3.6), viewHeight: 12.6, yaw: 0.28, pitch: THREE.MathUtils.degToRad(38) },
      3: { target: V(-3.8, this.riverY + 0.6, -11.4), viewHeight: 11.8, yaw: 0.26, pitch: THREE.MathUtils.degToRad(38) },
      4: { target: V(3.4, by + 0.9, -26.2), viewHeight: 11.6, yaw: -0.28, pitch: THREE.MathUtils.degToRad(38) },
      5: { target: V(0.0, hy + 1.2, -41.5), viewHeight: 12.0, yaw: 0.18, pitch: THREE.MathUtils.degToRad(36) },
    };

    // Verified obstacle-free forward-flowing entrance & exit waypoints (ZERO backward stepping, ZERO wall/table/bridge clipping!)
    this.stopPaths = {
      0: { exit: [], enter: [] },
      1: {
        enter: [
          V(-3.4, tY + 0.04, 19.5),
          V(-5.6, tY + 0.04, 19.5),
          V(-6.14, tY + 0.04, 19.1),
        ],
        exit: [
          V(-5.78, tY + 0.04, 17.3),
          V(-3.45, tY + 0.04, 17.55),
          V(-1.1, ground(-1.1, 17.1), 17.1),
        ],
      },
      2: {
        enter: [
          V(0.8, ground(0.8, 3.95), 3.95),
          V(3.1, fy, 3.85),
          V(6.6, fy, 3.75),
        ],
        exit: [
          V(6.5, fy, 3.6),
          V(3.0, fy, 3.6),
          V(0.2, ground(0.2, 3.15), 3.15),
        ],
      },
      3: {
        enter: [V(-3.2, ground(-3.2, -9.9), -9.9)],
        exit: [
          V(-4.15, ground(-4.15, -11.4), -11.4),
          V(-1.55, this.walkHeight(-1.55, -10.55), -10.55),
          V(-1.15, this.walkHeight(-1.15, -11.6), -11.6),
        ],
      },
      4: {
        enter: [
          V(2.2, ground(2.2, -25.4), -25.4),
          V(4.2, by, -25.9),
        ],
        exit: [
          V(4.15, by, -26.5),
          V(1.6, ground(1.6, -26.8), -26.8),
        ],
      },
      5: {
        enter: [V(0.0, ground(0.0, -39.8), -39.8)],
        exit: [],
      },
    };

    this.stopViews = [
      // 0: Arrival — wide scenic village entry
      { target: V(0.4, ground(0.4, 33.5) + 0.9, 33.5), viewHeight: 13.0, yaw: 0.42, pitch: THREE.MathUtils.degToRad(40) },
      // 1: Tea house — cozy diorama framing showing player, ruby glass, saucer, sugar, spoon, coins, tavla uncles & photo!
      { target: V(-5.4, tY + 0.85, 17.5), viewHeight: 5.4, yaw: 0.48, pitch: THREE.MathUtils.degToRad(34) },
      // 2: Football — behind & above player, ball nicely positioned with generous pull-back room below for slingshot drag!
      { target: V(10.5, fy + 0.8, -0.45), viewHeight: 11.1, yaw: 0.06, pitch: THREE.MathUtils.degToRad(34) },
      // 3: River — open sparkling river, mossy sitting boulders, river kid, ready rod, bucket & bridge cleanly to the right!
      { target: V(-6.4, this.riverY + 0.4, -13.6), viewHeight: 7.4, yaw: 0.22, pitch: THREE.MathUtils.degToRad(35) },
      // 4: Bread oven — cozy firelit courtyard showing clay tandır, kneading board, aunt, player & flatbread table!
      { target: V(7.0, by + 0.85, -27.5), viewHeight: 6.2, yaw: -0.32, pitch: THREE.MathUtils.degToRad(34) },
      // 5: Great-grandfather's house — golden-hour wide 2-story facade, upper balcony kilim, geraniums, cats & blue door!
      { target: V(0.0, hy + 1.56, -43.5), viewHeight: 9.0, yaw: 0.14, pitch: THREE.MathUtils.degToRad(32) },
      // 6: Reading room — warm cutaway interior diorama showing shelves, sunbeam, kilim & reading kids!
      { target: V(0.0, hy + 1.1, -48.2), viewHeight: 7.0, yaw: 0.18, pitch: THREE.MathUtils.degToRad(38) },
      // 7: Ending — intimate reading room before slow dusk rise
      { target: V(-0.2, hy + 0.85, -47.2), viewHeight: 6.0, yaw: 0.24, pitch: THREE.MathUtils.degToRad(35) },
    ];

    this.finalView = {
      position: V(24, 36, 22),
      target: V(-4.5, ground(-4.5, -13) + 1.0, -13),
    };
  }

  prepareOccluders() {
    this.occluders = [];
    this.occluderFade = { value: 0 };
    this.occlusionRay = new THREE.Raycaster();
    this.occlusionDirection = V();

    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o !== this.sky && !o.material.transparent) {
        o.castShadow = !o.userData.noCastShadow;
      }
      if (o !== this.sky) {
        o.receiveShadow = o.userData.noReceivedShadow ? false : !o.material.transparent;
      }
      if (o.userData.occluder !== true) return;

      o.material = o.material.clone();
      o.userData.cutFade = 0;
      this.occluders.push(o);
      o.onBeforeRender = () => {
        this.occluderFade.value = o.userData.cutFade;
      };
      o.material.onBeforeCompile = (shader) => {
        compileToonArt(shader, { wind: o.material.userData.artWind || '', moss: !!o.material.userData.artMoss });
        shader.uniforms.occluderFade = this.occluderFade;
        shader.fragmentShader = 'uniform float occluderFade;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          'void main() {',
          `void main() {
          vec2 dpx = mod(floor(gl_FragCoord.xy), 2.0);
          float cutoff = dpx.x < 0.5 ? (dpx.y < 0.5 ? 0.0 : 0.5) : (dpx.y < 0.5 ? 0.75 : 0.25);
          if (occluderFade > cutoff) discard;`
        );
      };
      o.material.needsUpdate = true;
      o.material.customProgramCacheKey = () => `yokus-occluder-v3-${o.material.userData.artWind || ''}`;
    });
  }

  updateOccluders(dt, game) {
    this._occFrame = ((this._occFrame || 0) + 1) % 3;
    if (this._occFrame === 1 && this.occluders.length) {
      for (const o of this.occluders) {
        o.visible = true;
        o.userData.cutTarget = 0;
      }
      this.occlusionDirection.copy(game.rig.target).sub(game.camera.position);
      const distance = this.occlusionDirection.length();
      if (distance > 0.01) {
        this.occlusionDirection.normalize();
        this.occlusionRay.set(game.camera.position, this.occlusionDirection);
        this.occlusionRay.far = distance - 0.5;
        for (const hit of this.occlusionRay.intersectObjects(this.occluders, false)) {
          hit.object.userData.cutTarget = 1;
        }
      }
    }
    const k = 1 - Math.exp(-dt * 8);
    for (const o of this.occluders) {
      o.userData.cutFade = lerp(o.userData.cutFade, o.userData.cutTarget || 0, k);
      o.visible = !(o.userData.cutFade > 0.99 && o.userData.cutTarget);
    }
  }

  addWallKid() {
    // Line up every extra wall kid shoulder-to-shoulder on the EXACT same z = -1.6 wall line!
    const i = this.wall.length - 3;
    const side = i % 2 ? -1 : 1;
    const kx = this.pitchCenter.x + side * (1.52 + Math.floor(i / 2) * 0.72);
    const k = this.figure(
      {
        height: 1.24 + (i % 2) * 0.03,
        palette: i % 2 ? C.kilimRed : C.blue,
        stripe: C.cream,
        trouser: C.dark,
        shorts: true,
        child: true,
        pose: 'stand',
        seed: 70 + i,
      },
      kx,
      -1.6
    );
    faceFigure(k, this.ballSpot);
    this.wall.push(k);
    return k;
  }

  spawnPuff(pos, count = 14, color = '#e4c386') {
    if (this.puffs.length > 20) {
      const old = this.puffs.shift();
      this.scene.remove(old.p);
      old.p.geometry.dispose();
      old.p.material.dispose();
    }
    const p = points(count, color, 2.2, 0.85);
    p.material.sizeAttenuation = false;
    const a = p.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] = pos.x + (this.rng() - 0.5) * 0.35;
      a[i + 1] = pos.y + this.rng() * 0.2;
      a[i + 2] = pos.z + (this.rng() - 0.5) * 0.35;
    }
    this.scene.add(p);
    this.puffs.push({ p, life: 0 });
  }

  setFishCount(n) {
    while (this.bucketFish.length < n) {
      const f = makeDetailedFish(0.75);
      this.bucket.add(f);
      this.bucketFish.push(f);
    }
    this.bucketFish.forEach((f, i) => {
      f.visible = i < n;
      const a = i * 2.1;
      const r = 0.06 + (i % 2) * 0.06;
      f.position.set(Math.cos(a) * r, 0.37 + (i % 2) * 0.02, Math.sin(a) * r);
      f.rotation.set(0, a + Math.PI * 0.5, 0);
    });
  }

  animateArrival(t) {
    const bus = this.minibus;
    const sp = this.minibusStart;
    if (t < 2.0) {
      bus.visible = true;
      bus.position.set(sp.x, sp.y, sp.z + 0.08 * Math.sin(t * 2.5));
      bus.rotation.z = Math.sin(t * 18) * 0.008 * Math.max(0, 2.0 - t);
    } else if (t < 11.5) {
      // Dolmuş pulls smoothly DOWNHILL back out of the village along the entry road (NEVER blocking the uphill walk!)
      bus.visible = true;
      const p = smooth((t - 2.0) / 8.5);
      const roadBackX = lerp(sp.x, 1.5, p);
      const roadBackZ = lerp(sp.z, 76.0, p * p * 0.65 + p * 0.35);
      bus.position.set(roadBackX, ground(roadBackX, roadBackZ), roadBackZ);
      bus.rotation.z = 0;
    } else {
      bus.visible = false;
    }
    // Keep solid 3D minibus collision box strictly synced to the live minibus position!
    if (this.minibusObstacle) {
      this.minibusObstacle.cx = bus.position.x;
      this.minibusObstacle.cz = bus.position.z;
      this.minibusObstacle.active = bus.visible;
    }

    const close = smooth((t - 0.6) / 1.1);
    this.busDoorL.rotation.y = close * 1.25;
    this.busDoorR.rotation.y = -close * 1.2;

    // Billowing arrival dust cloud behind departing dolmuş (trailing north behind its rear bumper!)
    this.arrivalDust.visible = t > 1.8 && t < 8.5;
    if (this.arrivalDust.visible) {
      const a = this.arrivalDust.geometry.attributes.position.array;
      for (let i = 0; i < 72; i++) {
        const emit = 1.8 + (i / 72) * 3.4;
        const age = t - emit;
        const j = i * 3;
        if (age < 0) {
          a[j + 1] = -100;
          continue;
        }
        const bp = smooth((emit - 2.0) / 8.5);
        const bx = lerp(sp.x, 1.5, bp);
        const bz = lerp(sp.z, 76.0, bp * bp * 0.65 + bp * 0.35) - 2.1;
        a[j] = bx + Math.sin(i * 7.3) * 0.6 + age * 0.14;
        a[j + 1] = ground(bx, bz) + 0.14 + Math.sin(age * 1.6 + i) * 0.22;
        a[j + 2] = bz - age * 0.35;
      }
      this.arrivalDust.geometry.attributes.position.needsUpdate = true;
      this.arrivalDust.material.opacity = 0.45 * (1 - smooth((t - 5.4) / 3.0));
    }
  }

  updateFootballFeedback(game) {
    const f = game.football;
    if (!f || !this.powerBar) return;
    const charging = f.phase === 'charging';
    const aiming = f.phase === 'aim' || charging;
    const pixelWorld = (game.camera.top - game.camera.bottom) / (game.camera.userData.pixelHeight || 240);

    // Ball ground shadow tracks ball cleanly
    this.ballShadow.position.set(this.ball.position.x, this.pitchCenter.y + 0.025, this.ball.position.z);
    const heightAbove = Math.max(0, this.ball.position.y - this.pitchCenter.y - 0.2);
    this.ballShadow.scale.setScalar(clamp(1.0 - heightAbove * 0.12, 0.45, 1.0));

    // Goal net bulge on score!
    this.goalNet.position.z = f.netTime < 0.75 ? -Math.sin(f.netTime * 22) * 0.16 * (1 - f.netTime / 0.75) : 0;

    // Show 100% WYSIWYG dotted trajectory arc, target ring & slingshot pullback band while actively aiming!
    const activeAim = game.state.stop === 2 && game.state.mode === 'interact' && charging && !f.dragCancelled && !!f.aimPoint;
    this.powerBar.visible = activeAim;
    this.predictedArc.visible = activeAim;
    if (this.aimRing) this.aimRing.visible = activeAim;

    // Crisp golden slingshot pull-back ribbon behind the ball (slingshot mode only!)
    const showDrag = activeAim && f.dragMode === 'slingshot' && !!f.dragWorldEnd;
    if (this.dragLine) {
      this.dragLine.visible = showDrag;
      if (showDrag) {
        const bx = this.ball.position.x;
        const bz = this.ball.position.z;
        const ex = f.dragWorldEnd.x;
        const ez = f.dragWorldEnd.z;
        const dx = ex - bx;
        const dz = ez - bz;
        const len = Math.hypot(dx, dz);
        this.dragLine.position.set((bx + ex) * 0.5, this.pitchCenter.y + 0.14, (bz + ez) * 0.5);
        this.dragLine.scale.set(1, Math.max(0.05, len), 1);
        this.dragLine.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));
      }
    }
    if (this.dragKnob) {
      this.dragKnob.visible = showDrag;
      if (showDrag) {
        this.dragKnob.position.set(f.dragWorldEnd.x, this.pitchCenter.y + 0.15, f.dragWorldEnd.z);
        this.dragKnob.scale.setScalar(0.85 + f.power * 0.35);
      }
    }

    let onFrame = false;
    if (activeAim) {
      const a = this.predictedArc.geometry.attributes.position;
      const kin = game.stops.computeKick(f.aimPoint, f.power || 0.66);
      const p = this.ball.position.clone();
      const prev = p.clone();
      const v = kin.velocity.clone();
      const gz = this.goal.position.z;
      const simDt = kin.flightEst / 21;
      let crossX = f.aimPoint.x;
      let crossY = f.aimPoint.y;
      let crossed = false;
      for (let i = 0; i < 22; i++) {
        a.setXYZ(i, p.x, Math.max(this.pitchCenter.y + 0.18, p.y), p.z);
        prev.copy(p);
        const spd = v.length();
        v.x += kin.curve * simDt;
        v.y -= 9.81 * simDt;
        v.addScaledVector(v, -0.022 * spd * simDt);
        p.addScaledVector(v, simDt);
        if (!crossed && prev.z > gz && p.z <= gz) {
          crossed = true;
          const frac = clamp((prev.z - gz) / Math.max(0.0001, prev.z - p.z), 0, 1);
          crossX = lerp(prev.x, p.x, frac);
          crossY = lerp(prev.y, p.y, frac);
        }
      }
      if (!crossed) {
        crossX = p.x;
        crossY = Math.max(this.pitchCenter.y + 0.2, p.y);
      }
      a.needsUpdate = true;
      onFrame = Math.abs(crossX - this.goal.position.x) < 2.04 && crossY - this.goal.position.y < 1.94;
      if (this.aimRing) {
        this.aimRing.position.set(crossX, crossY, gz + 0.05);
        this.aimRing.material.color.set(onFrame ? '#9bf084' : '#ffd882');
        this.aimRing.scale.setScalar(0.9 + f.power * 0.28);
      }
    }

    if (!activeAim) return;
    this.powerBar.position.copy(game.player.position).add(V(0, 2.25, 0));
    this.powerBar.scale.set(16 * pixelWorld, 3 * pixelWorld, 1);
    const fill = Math.round(clamp(f.power, 0, 1) * 14);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        const border = x === 0 || x === 15 || y === 0 || y === 2;
        let col;
        if (border) col = [44, 36, 72, 255];
        else if (x <= fill) col = onFrame ? [116, 214, 92, 255] : [245, 168, 72, 255];
        else col = [55, 48, 64, 195];
        this.powerPixels[i] = col[0];
        this.powerPixels[i + 1] = col[1];
        this.powerPixels[i + 2] = col[2];
        this.powerPixels[i + 3] = col[3];
      }
    }
    this.powerTexture.needsUpdate = true;
  }

  // Smoothly blend time-of-day sun, shadow tint, sky, fog, warm grade & tandır point-light!
  updateTimeOfDay(game) {
    let stopProg = game.state.stop;
    if (game.rig.walk && game.rig.walk.kind === 'road') {
      const fromStop = game.rig.walk.fromStop ?? Math.max(0, game.state.stop - 1);
      const p = clamp((game.rig.walk.time - game.rig.walk.standLead) / Math.max(0.01, game.rig.walk.duration), 0, 1);
      stopProg = lerp(fromStop, game.rig.walk.to, smooth(p));
    }
    if (game.state.mode === 'freeroam' && game.player) {
      // Gently shift afternoon sunlight as you stroll up & down the hillside (bright lower village -> golden hilltop!)
      stopProg = clamp((36 - game.player.position.z) / 16.5, 0.5, 5.1);
    } else if (game.state.mode === 'ending' || game.state.mode === 'final') {
      stopProg = 7;
    }

    const idx0 = clamp(Math.floor(stopProg), 0, TIME_OF_DAY.length - 1);
    const idx1 = clamp(idx0 + 1, 0, TIME_OF_DAY.length - 1);
    const f = clamp(stopProg - idx0, 0, 1);
    const A = TIME_OF_DAY[idx0];
    const B = TIME_OF_DAY[idx1];
    const tmpCol = this._tmpCol || (this._tmpCol = new THREE.Color());
    const target = this._tmpTarget || (this._tmpTarget = new THREE.Vector3());
    const sunDir = this._tmpSunDir || (this._tmpSunDir = new THREE.Vector3());
    const sRight = this._tmpSRight || (this._tmpSRight = new THREE.Vector3());
    const sUp = this._tmpSUp || (this._tmpSUp = new THREE.Vector3());
    const upAxis = this._upAxis || (this._upAxis = new THREE.Vector3(0, 1, 0));

    sunColor.set(A.sunColor).lerp(tmpCol.set(B.sunColor), f);
    midColor.set(A.midColor).lerp(tmpCol.set(B.midColor), f);
    shadowTint.set(A.shadowTint).lerp(tmpCol.set(B.shadowTint), f);

    this.sky.material.uniforms.top.value.set(A.skyTop).lerp(tmpCol.set(B.skyTop), f);
    this.sky.material.uniforms.horizon.value.set(A.skyHorizon).lerp(tmpCol.set(B.skyHorizon), f);
    this.sky.material.uniforms.bottom.value.set(A.skyBottom).lerp(tmpCol.set(B.skyBottom), f);
    this.scene.fog.color.set(A.fog).lerp(tmpCol.set(B.fog), f);
    const wide = game.state.mode === 'final';
    this.scene.fog.near = wide ? 95 : 54;
    this.scene.fog.far = wide ? 360 : 172;

    game.pipeline.setGradeWarm(
      lerp(A.gradeWarm[0], B.gradeWarm[0], f),
      lerp(A.gradeWarm[1], B.gradeWarm[1], f),
      lerp(A.gradeWarm[2], B.gradeWarm[2], f)
    );

    // Drive directional sun position & texel-snapped shadow camera (zero per-frame heap allocations!)
    this.sunOffset.set(
      lerp(A.sunDir[0], B.sunDir[0], f),
      lerp(A.sunDir[1], B.sunDir[1], f),
      lerp(A.sunDir[2], B.sunDir[2], f)
    );
    if (game.rig.target) target.copy(game.rig.target);
    else target.set(0, 0, 0);
    const extent = Math.max(11, (game.rig.viewHeight || 13) * 1.15);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - extent) > 0.01) {
      sc.left = -extent;
      sc.right = extent;
      sc.top = extent;
      sc.bottom = -extent;
      sc.updateProjectionMatrix();
    }

    sunDir.copy(this.sunOffset).normalize();
    sRight.copy(upAxis).cross(sunDir).normalize();
    sUp.copy(sunDir).cross(sRight).normalize();
    const texel = (extent * 2) / this.sun.shadow.mapSize.x;
    target
      .addScaledVector(sRight, Math.round(target.dot(sRight) / texel) * texel - target.dot(sRight))
      .addScaledVector(sUp, Math.round(target.dot(sUp) / texel) * texel - target.dot(sUp));
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).add(this.sunOffset);
    this.sun.target.updateMatrixWorld();

    // Flickering warm orange tandır firelight (active near stop 4 or when roaming near the bread courtyard!)
    const nearOvenRoam =
      game.state.mode === 'freeroam' &&
      game.player &&
      Math.hypot(game.player.position.x - 7.2, game.player.position.z + 28.0) < 13.5;
    const nearOven = game.state.stop === 4 || nearOvenRoam || (game.rig.walk && game.state.toStop === 4);
    const flicker = 1.9 + Math.sin(this.time * 11.3) * 0.25 + Math.sin(this.time * 23.7) * 0.14;
    warmLightIntensity.value = nearOven ? flicker : 0;
  }

  update(dt, game) {
    this.time += dt;
    artTime.value = this.time;
    this.game = game;

    this.updateTimeOfDay(game);
    this.updateOccluders(dt, game);

    // Target click squash-pop juice!
    for (const item of this.interactables) {
      if (item.popTime < 0.22) {
        item.popTime += dt;
        const p = clamp(item.popTime / 0.22, 0, 1);
        const bounce = 1 + Math.sin(p * Math.PI) * 0.16;
        item.root.scale.copy(item.baseScale).multiplyScalar(bounce);
        if (p >= 1) item.root.scale.copy(item.baseScale);
      }
    }

    // Animate visible nearby figures (smooth joint damping! Skip hidden or far offscreen NPCs for faster mobile CPU!)
    const focus = game.rig.target;
    const wideView = game.state.mode === 'final';
    for (const f of this.figures) {
      if (!f.visible) continue;
      if (!wideView && f !== game.player && focus && f.position.distanceToSquared(focus) > 1300) continue;
      animateFigure(f, this.time, dt);
    }

    const duskLit = game.state.stop === 7 && (game.state.mode === 'final' || game.ending.time > 14);
    for (const light of this.windowLights) light.visible = duskLit;

    for (const [i, c] of this.cloths.entries()) {
      c.rotation.y = Math.sin(this.time * 1.1 + i) * 0.14;
      c.rotation.z = Math.sin(this.time * 0.8 + i) * 0.04;
    }
    this.stork.neck.rotation.y = Math.sin(this.time * 0.35) * 0.28;
    this.stork.bird.rotation.z = Math.sin(this.time * 0.65) * 0.02;
    for (const c of this.chickens) {
      c.head.rotation.x = Math.max(0, Math.sin(this.time * 2.1 + c.g.userData.phase)) * 0.78;
    }
    for (const [i, s] of this.sheep.entries()) {
      s.rotation.x = Math.sin(this.time * 0.5 + i) * 0.015;
    }
    for (const b of this.birds) {
      const u = b.userData;
      const a = this.time * u.speed + u.phase;
      b.position.set(Math.cos(a) * u.radius, u.y + Math.sin(a * 2) * 0.6, -5 + Math.sin(a) * u.radius);
      b.rotation.y = -a;
      const flap = Math.sin(this.time * 7.5 + u.phase) * 0.45;
      u.wL.rotation.z = flap;
      u.wR.rotation.z = -flap;
    }

    // Cats: angry black cat tail-lashing left/right, orange cat biscuits, white cat bounding flee!
    for (const c of this.cats) {
      const u = c.userData;
      if (u.angry) {
        // Grumpy black cat: sits still with narrowed eyes, naturally whipping its tail left & right like an annoyed cat — nothing else!
        const t = this.time;
        const rhythm = 0.78 + 0.22 * Math.sin(t * 1.15);
        const whip = Math.tanh(Math.sin(t * 3.8) * 2.15) * 0.68 + Math.sin(t * 7.6 + 0.6) * 0.08;
        const tipLag = Math.tanh(Math.sin(t * 3.8 - 0.65) * 2.15) * 0.55;
        u.body.position.y = 0.18;
        u.body.scale.z = 1.0 + Math.sin(t * 1.5) * 0.008;
        u.body.rotation.z = 0;
        u.head.rotation.x = 0.03;
        u.head.rotation.z = 0;
        u.tailPivot.rotation.set(0.08 + Math.abs(whip) * 0.14, whip * rhythm, 0);
        if (u.tailMid) u.tailMid.rotation.set(0.06, tipLag * rhythm, 0);
        for (const e of u.eyes) e.scale.y = 0.62;
        continue;
      }
      const pet = u.pet > 0;
      u.happy = lerp(u.happy, pet ? 1 : 0, 1 - Math.exp(-dt * 6));
      if (u.running) {
        const hop = Math.abs(Math.sin(this.time * 16));
        u.body.position.y = 0.18 + hop * 0.12;
        u.body.scale.z = 1.05 + hop * 0.22;
        u.head.rotation.x = -0.18;
        u.tailPivot.rotation.x = 0.85;
        u.tailPivot.rotation.z = Math.sin(this.time * 18) * 0.25;
        for (const e of u.eyes) e.scale.y = 1.2;
        if (u.frontPaws) {
          u.frontPaws.forEach((p, idx) => {
            p.position.y = 0.125 + hop * 0.05;
            p.position.z = 0.19;
            p.rotation.x = Math.sin(this.time * 16 + idx * Math.PI) * 0.55;
          });
        }
      } else {
        u.body.position.y = 0.18;
        u.body.scale.z = 1 + u.happy * 0.16 + Math.sin(this.time * (pet ? 9 : 1.5)) * (pet ? 0.025 : 0.008);
        u.head.rotation.x = pet ? -0.14 + Math.sin(this.time * 2.2) * 0.1 : Math.sin(this.time * 0.6) * 0.03;
        u.tailPivot.rotation.z = Math.sin(this.time * (pet ? 3.5 : 0.9)) * (pet ? 0.35 : 0.12);
        u.tailPivot.rotation.x = u.happy * 0.35;
        for (const e of u.eyes) e.scale.y = pet ? 0.18 : 1.0;

        // Orange cat making small biscuits! Gentle dreamy kneading idle, enthusiastic happy biscuits when petted!
        if (u.frontPaws) {
          if (u.biscuits) {
            const freq = pet ? 6.8 : 3.6;
            const amp = pet ? 1.0 : 0.62;
            const sway = Math.sin(this.time * freq);
            u.body.rotation.z = sway * 0.07 * amp;
            u.head.rotation.z = sway * 0.08 * amp;
            u.frontPaws.forEach((p, idx) => {
              const phase = this.time * freq + idx * Math.PI;
              const lift = Math.max(0, Math.sin(phase));
              const press = Math.max(0, -Math.sin(phase));
              p.position.y = 0.125 + lift * 0.068 * amp - press * 0.015 * amp;
              p.position.z = 0.19 + lift * 0.045 * amp;
              p.rotation.x = -lift * 0.58 * amp + press * 0.22 * amp;
            });
          } else {
            u.body.rotation.z = 0;
            u.head.rotation.z = 0;
            u.frontPaws.forEach((p) => {
              p.position.y = 0.125;
              p.position.z = 0.19;
              p.rotation.x = 0;
            });
          }
        }
      }
    }

    // River & irrigation ditch flow + dragonflies
    this.river.material.uniforms.time.value = this.time;
    this.ditch.userData.waterMat.uniforms.time.value = this.time;
    for (const df of this.dragonflies) {
      const u = df.userData;
      df.position.set(
        u.cx + Math.sin(this.time * 1.4 + u.phase) * 1.2,
        this.riverY + 0.48 + Math.sin(this.time * 3.8 + u.phase) * 0.12,
        u.cz + Math.cos(this.time * 1.9 + u.phase) * 0.85
      );
      df.rotation.y = Math.atan2(Math.cos(this.time * 1.4 + u.phase), -Math.sin(this.time * 1.9 + u.phase));
    }

    // Tea steam & visible liquid drop across 3 sips (active at Stop 1 or when roaming near the tea terrace!)
    const sips = game.tea?.sips || 0;
    const nearTeaRoam =
      game.state.mode === 'freeroam' &&
      game.player &&
      Math.hypot(game.player.position.x + 7.5, game.player.position.z - 17.5) < 16;
    const showTeaSteam = (game.state.stop === 1 || nearTeaRoam) && sips < 3;
    this.steam.visible = showTeaSteam;
    if (showTeaSteam) {
      const sp = this.steam.geometry.attributes.position.array;
      const topY = this.terraceY + 0.71;
      for (let i = 0; i < sp.length; i += 3) {
        sp[i] += Math.sin(this.time * 1.6 + i) * dt * 0.012;
        sp[i + 1] += dt * 0.13;
        if (sp[i + 1] > topY + 0.72) sp[i + 1] = topY + 0.28;
      }
      this.steam.geometry.attributes.position.needsUpdate = true;
      this.steam.material.opacity = 0.68 * (1 - sips / 3);
    }
    const fillRatio = clamp(game.tea?.displayFill ?? (1 - sips * 0.31), 0.06, 1);
    this.teaLiquid.scale.y = fillRatio;

    // Tandır embers, fire flicker & drifting smoke (active near Stop 4, final panorama, or roaming near the bread courtyard!)
    const nearOvenRoamFx =
      game.state.mode === 'freeroam' &&
      game.player &&
      Math.hypot(game.player.position.x - 7.2, game.player.position.z + 28.0) < 20;
    const nearOvenFx =
      game.state.stop === 4 ||
      game.state.mode === 'final' ||
      nearOvenRoamFx ||
      (game.rig.walk && (game.state.toStop === 4 || game.rig.walk.fromStop === 4));
    if (nearOvenFx) {
      const ep = this.embers.geometry.attributes.position.array;
      for (let i = 0; i < ep.length; i += 3) {
        ep[i] += Math.sin(this.time * 2.4 + i) * dt * 0.14;
        ep[i + 1] += dt * (0.35 + (i % 4) * 0.1);
        if (ep[i + 1] > 3.5) ep[i + 1] = 1.1;
      }
      this.embers.geometry.attributes.position.needsUpdate = true;
      const sm = this.smoke.geometry.attributes.position.array;
      for (let i = 0; i < sm.length; i += 3) {
        sm[i] += dt * 0.12 + Math.sin(this.time + i) * dt * 0.06;
        sm[i + 1] += dt * 0.42;
        if (sm[i + 1] > 5.0) {
          sm[i] = (this.rng() - 0.5) * 0.4;
          sm[i + 1] = 1.3;
        }
      }
      this.smoke.geometry.attributes.position.needsUpdate = true;
      this.fire.scale.set(1.1 + Math.sin(this.time * 9) * 0.08, 0.45 + Math.sin(this.time * 13) * 0.1, 1.1);
      this.fireInner.scale.setScalar(0.85 + Math.sin(this.time * 17) * 0.18);
    }

    // Warm rising steam right above the fresh flatbread when held at Stop 4!
    if (this.breadSteam) {
      const bs = this.breadSteam.geometry.attributes.position.array;
      const showBreadSteam = game.state.stop === 4 && (game.bread?.bites || 0) < 3 && this.bread.visible;
      this.breadSteam.visible = showBreadSteam;
      if (showBreadSteam) {
        for (let i = 0; i < bs.length; i += 3) {
          bs[i] += Math.sin(this.time * 2.1 + i) * dt * 0.02;
          bs[i + 1] += dt * 0.18;
          if (bs[i + 1] > this.bread.position.y + 0.55) {
            bs[i] = this.bread.position.x + (this.rng() - 0.5) * 0.22;
            bs[i + 1] = this.bread.position.y + 0.04;
            bs[i + 2] = this.bread.position.z + (this.rng() - 0.5) * 0.22;
          }
        }
        this.breadSteam.geometry.attributes.position.needsUpdate = true;
      }
    }

    // Flapping tail on caught trout & swimming bucket fish!
    if (this.fishFlash?.visible && this.fishFlash.userData.tailPivot) {
      this.fishFlash.userData.tailPivot.rotation.y = Math.sin(this.time * 22) * 0.55;
    }
    for (const [i, bf] of this.bucketFish.entries()) {
      if (bf.visible && bf.userData.tailPivot) {
        bf.userData.tailPivot.rotation.y = Math.sin(this.time * 6.5 + i * 1.9) * 0.35;
      }
    }

    // Ambient sunlit pollen/dust motes
    const ap = this.ambientDust.geometry.attributes.position.array;
    for (let i = 0; i < ap.length; i += 3) {
      ap[i] += dt * (0.08 + (i % 5) * 0.015);
      ap[i + 1] += Math.sin(this.time + i) * dt * 0.015;
      if (ap[i] > 24) ap[i] = -24;
    }
    this.ambientDust.geometry.attributes.position.needsUpdate = true;

    // Particle puffs (crumbs, dust, splashes, cat purr sparkles)
    for (const p of this.puffs) {
      p.life += dt;
      const a = p.p.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) {
        a[i] += Math.sin(i * 3.1) * dt * 0.25;
        a[i + 1] += dt * 0.32;
        a[i + 2] += Math.cos(i * 2.7) * dt * 0.25;
      }
      p.p.geometry.attributes.position.needsUpdate = true;
      p.p.material.opacity = 0.85 * Math.max(0, 1 - p.life / 1.4);
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      if (this.puffs[i].life > 1.4) {
        const p = this.puffs.splice(i, 1)[0];
        this.scene.remove(p.p);
        p.p.geometry.dispose();
        p.p.material.dispose();
      }
    }

    // Animated uphill stepping chevrons (leave-1..4) & roadside entrance pads (enter-1..5)
    for (const [n, l] of this.leaves) {
      const show = game.state.mode === 'interact' && (game.stops?.canLeave(n) || false);
      l.group.visible = show;
      if (show) {
        const hover = this.byId.get('leave-' + n)?.hover || 0;
        l.chevrons.forEach((ch, idx) => {
          const pulse = 0.55 + 0.45 * Math.sin(this.time * 4.2 - idx * 1.1);
          ch.material.opacity = clamp(pulse + hover * 0.35, 0.35, 1);
          ch.material.color.set(hover > 0.2 ? '#ffffff' : '#ffe49e');
        });
      }
    }
    if (this.entrances) {
      for (const [n, e] of this.entrances) {
        const show = game.state.mode === 'approach' && game.state.stop === n;
        e.group.visible = show;
        if (show) {
          const hover = this.byId.get('enter-' + n)?.hover || 0;
          e.chevrons.forEach((ch, idx) => {
            const pulse = 0.55 + 0.45 * Math.sin(this.time * 4.0 - idx * 1.1);
            ch.material.opacity = clamp(pulse + hover * 0.35, 0.38, 1);
            ch.material.color.set(hover > 0.2 ? '#ffffff' : '#ffe89e');
          });
        }
      }
    }

    // Exterior house vs interior reading room cutaway swap
    const interior =
      game.state.mode !== 'freeroam' &&
      game.state.stop >= 6 &&
      game.state.mode !== 'final' &&
      !(game.state.stop === 7 && game.ending.time > 14);
    this.reading.visible = interior;
    this.house.visible = !interior;
    for (const c of this.cats) c.visible = !interior;
    for (const f of this.readingKids) f.visible = interior;
    if (!interior && game.state.stop === 7) {
      this.selfChild.visible = false;
      this.dede.visible = false;
      this.openBook.visible = false;
    }

    this.roomDust.rotation.y = Math.sin(this.time * 0.15) * 0.04;
    this.updateFootballFeedback(game);
    this.updateInteractionMarkers(game);
  }
}
