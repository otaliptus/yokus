import * as THREE from 'three';
import { C, mesh, box, sphere, cyl, capsule, place, beamBetween, V, lerp, clamp } from './palette.js';

// Smooth angle helper (shortest arc)
function lerpAngle(a, b, t) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

// Expressive, detailed stylized figures for Yokuş:
// Chunky low-poly pixel-art proportions with articulated elbows & knees, layered clothing
// (collars, vests, open jackets, striped jerseys, shorts/socks, belts, satchels, aprons, gloves),
// expressive faces (blinking eyes, brows, rosy cheeks, noses, mustaches, glasses), and smooth pose blending.
export function makeFigure({
  height = 1.7,
  palette = C.blue,
  shirt = C.cream,
  vest = null,
  jacket = null,
  stripe = null,
  trouser = null,
  shorts = false,
  headwear = 'none',
  hair = '#3d3028',
  hairStyle = 'messy', // 'messy' | 'parted' | 'ponytail' | 'balding'
  mustache = null,
  glasses = false,
  satchel = false,
  gloves = false,
  pose = 'stand',
  child = false,
  apron = false,
  cane = false,
  beads = false,
  tray = false,
  seed = 0,
} = {}) {
  const g = new THREE.Group();
  const s = height / 1.7;
  const headScale = child ? 1.16 : 1.0;

  // Root body group handles vertical height/bounce and whole-body pitch/roll (crouch, dive, walk bob)
  const body = new THREE.Group();
  g.add(body);

  const pantsCol = trouser || (palette === C.cream ? C.sage : C.dark);
  const sleeveCol = jacket || palette;
  const torsoCol = jacket ? shirt : palette;

  // Pelvis / hips + belt with brass buckle
  const pelvis = place(cyl(0.185 * s, 0.215 * s, 0.2 * s, pantsCol, 10), 0, 0.68 * s, 0, body);
  pelvis.scale.set(1.06, 1, 0.82);

  // Waist belt
  if (!apron && !shorts) {
    const belt = place(cyl(0.195 * s, 0.198 * s, 0.055 * s, C.woodDark, 10), 0, 0.77 * s, 0, body);
    belt.scale.set(1.06, 1, 0.83);
    place(box(0.065 * s, 0.052 * s, 0.03 * s, C.gold), 0, 0.77 * s, 0.165 * s, body);
  }

  // Upper torso pivot (allows natural upper-body twist & lean while seated without spinning legs!)
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.77 * s, 0);
  body.add(torsoPivot);

  // Sculpted chest/torso
  const torso = place(capsule(0.195 * s, 0.36 * s, torsoCol), 0, 0.25 * s, 0, torsoPivot);
  torso.scale.set(1.08, 1.0, 0.78);

  // Optional jersey chest stripe (childhood & football kits!)
  if (stripe) {
    const band = place(cyl(0.205 * s, 0.208 * s, 0.12 * s, stripe, 12), 0, 0.27 * s, 0, torsoPivot);
    band.scale.set(1.09, 1, 0.8);
    const band2 = place(cyl(0.202 * s, 0.205 * s, 0.045 * s, stripe, 12), 0, 0.14 * s, 0, torsoPivot);
    band2.scale.set(1.07, 1, 0.79);
  }

  // Optional open overshirt / jacket panels (shows inner shirt down center!)
  if (jacket) {
    for (const side of [-1, 1]) {
      const panel = place(box(0.165 * s, 0.45 * s, 0.31 * s, jacket), side * 0.125 * s, 0.23 * s, -0.005 * s, torsoPivot);
      panel.rotation.z = side * 0.03;
      // Collar lapel
      place(box(0.075 * s, 0.12 * s, 0.04 * s, jacket), side * 0.08 * s, 0.43 * s, 0.155 * s, torsoPivot).rotation.z =
        side * -0.22;
    }
    // Back of jacket
    place(box(0.38 * s, 0.45 * s, 0.08 * s, jacket), 0, 0.23 * s, -0.125 * s, torsoPivot);
  }

  // Optional knit waistcoat / vest with buttoned placket
  if (vest) {
    const v = place(box(0.41 * s, 0.43 * s, 0.32 * s, vest), 0, 0.23 * s, 0, torsoPivot);
    v.scale.set(1.0, 1.0, 0.96);
    // Shirt collar peeking out top
    place(cyl(0.115 * s, 0.135 * s, 0.07 * s, shirt, 10), 0, 0.46 * s, 0.01 * s, torsoPivot);
    // Subtle dark buttons down center
    for (let i = 0; i < 3; i++) {
      place(sphere(0.017 * s, C.woodDark, 0), 0, 0.33 * s - i * 0.1 * s, 0.165 * s, torsoPivot);
    }
  } else if (!jacket) {
    // Crisp neckline / collar ring
    place(cyl(0.105 * s, 0.125 * s, 0.055 * s, stripe || shirt, 10), 0, 0.46 * s, 0.01 * s, torsoPivot);
  }

  // Optional crossbody canvas travel satchel (iconic silhouette detail for the returning traveler!)
  if (satchel) {
    const strap = beamBetween(V(-0.17 * s, 0.45 * s, 0.12 * s), V(0.19 * s, 0.04 * s, 0.14 * s), 0.024 * s, C.woodDark);
    torsoPivot.add(strap);
    const strapBack = beamBetween(V(-0.17 * s, 0.45 * s, -0.12 * s), V(0.19 * s, 0.04 * s, -0.14 * s), 0.024 * s, C.woodDark);
    torsoPivot.add(strapBack);
    const bag = place(box(0.09 * s, 0.22 * s, 0.22 * s, C.sand), 0.22 * s, 0.02 * s, -0.02 * s, torsoPivot);
    bag.rotation.z = 0.08;
    place(box(0.098 * s, 0.09 * s, 0.225 * s, C.earth), 0.225 * s, 0.07 * s, -0.02 * s, torsoPivot);
    place(box(0.025 * s, 0.03 * s, 0.04 * s, C.gold), 0.275 * s, 0.03 * s, -0.02 * s, torsoPivot);
  }

  // Optional kitchen/çaycı apron with waist tie & pocket
  if (apron) {
    const apTop = place(box(0.28 * s, 0.24 * s, 0.04 * s, C.chalk), 0, 0.26 * s, 0.17 * s, torsoPivot);
    apTop.rotation.x = -0.04;
    const tie = place(cyl(0.21 * s, 0.21 * s, 0.05 * s, C.chalk, 10), 0, 0.05 * s, 0, torsoPivot);
    tie.scale.set(1.06, 1, 0.86);
    const apSkirt = place(box(0.37 * s, 0.42 * s, 0.045 * s, C.chalk), 0, -0.14 * s, 0.17 * s, torsoPivot);
    apSkirt.rotation.x = -0.06;
    place(box(0.16 * s, 0.11 * s, 0.02 * s, C.cream), 0, -0.11 * s, 0.195 * s, torsoPivot);
  }

  // --- HEAD & EXPRESSIVE FACE ---
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.54 * s, 0);
  torsoPivot.add(headPivot);

  // Neck
  place(cyl(0.068 * s, 0.08 * s, 0.12 * s, C.skin, 8), 0, 0.02 * s, 0, headPivot);

  const hs = s * headScale;
  const head = place(sphere(0.195 * hs, C.skin, 2), 0, 0.2 * hs, 0, headPivot);
  head.scale.set(0.92, 1.02, 0.94);

  // Ears
  for (const side of [-1, 1]) {
    const ear = place(sphere(0.042 * hs, C.skin, 1), side * 0.175 * hs, 0.185 * hs, -0.01 * hs, headPivot);
    ear.scale.set(0.55, 1.0, 0.78);
  }

  // Cute sculpted nose
  const nose = place(sphere(0.032 * hs, '#e2b58b', 1), 0, 0.175 * hs, 0.185 * hs, headPivot);
  nose.scale.set(0.8, 0.9, 1.05);

  // Warm rosy cheek dots (subtle pixel-art charm!)
  for (const side of [-1, 1]) {
    const cheek = place(sphere(0.028 * hs, '#e09a80', 0), side * 0.095 * hs, 0.145 * hs, 0.155 * hs, headPivot);
    cheek.scale.set(1.1, 0.65, 0.4);
  }

  // Expressive blinking eyes & eyebrows
  const eyes = [];
  const brows = [];
  const browCol = mustache === '#e8e2d5' ? '#d8d2c6' : hair;
  for (const side of [-1, 1]) {
    const eye = place(box(0.032 * hs, 0.036 * hs, 0.02 * hs, '#231e2c'), side * 0.066 * hs, 0.215 * hs, 0.174 * hs, headPivot);
    eyes.push(eye);
    const brow = place(box(0.052 * hs, 0.018 * hs, 0.022 * hs, browCol), side * 0.068 * hs, 0.258 * hs, 0.172 * hs, headPivot);
    brows.push(brow);
  }

  // Optional mustache (Dede & village uncles!)
  if (mustache) {
    for (const side of [-1, 1]) {
      const m = place(capsule(0.024 * hs, 0.055 * hs, mustache), side * 0.036 * hs, 0.132 * hs, 0.178 * hs, headPivot);
      m.rotation.z = side * 1.25;
      m.rotation.y = side * -0.25;
    }
  }

  // Optional wire-rim spectacles (scholarly village uncle!)
  if (glasses) {
    for (const side of [-1, 1]) {
      const rim = place(
        mesh(new THREE.TorusGeometry(0.044 * hs, 0.008 * hs, 5, 10), C.woodDark),
        side * 0.068 * hs,
        0.215 * hs,
        0.186 * hs,
        headPivot
      );
      rim.scale.set(1.05, 0.92, 1);
    }
    place(box(0.035 * hs, 0.01 * hs, 0.01 * hs, C.woodDark), 0, 0.22 * hs, 0.186 * hs, headPivot);
  }

  // Hair & Headwear
  if (headwear === 'cap') {
    // Classic Anatolian flat cap (kasket) + hair peeking on sides/back
    const capCol = palette === C.rust || jacket === C.rust ? C.earth : palette === C.dusk ? C.dark : C.earth;
    const hairBack = place(sphere(0.185 * hs, hair, 1), 0, 0.21 * hs, -0.045 * hs, headPivot);
    hairBack.scale.set(0.95, 0.85, 0.9);
    const crown = place(cyl(0.195 * hs, 0.21 * hs, 0.095 * hs, capCol, 12), 0, 0.34 * hs, 0.01 * hs, headPivot);
    crown.rotation.x = 0.08;
    const topCap = place(sphere(0.19 * hs, capCol, 1), 0, 0.365 * hs, 0.0, headPivot);
    topCap.scale.set(1.04, 0.32, 1.08);
    const brim = place(box(0.24 * hs, 0.028 * hs, 0.18 * hs, C.dark), 0, 0.295 * hs, 0.145 * hs, headPivot);
    brim.rotation.x = -0.06;
  } else if (headwear === 'scarf') {
    // Anatolian white yazma headscarf with warm floral edge trim & draped tail
    const scarf = place(sphere(0.222 * hs, C.chalk, 2), 0, 0.21 * hs, -0.025 * hs, headPivot);
    scarf.scale.set(1.04, 1.08, 1.04);
    // Patterned oya border around face opening
    const trim = place(mesh(new THREE.TorusGeometry(0.165 * hs, 0.018 * hs, 6, 14), C.gold), 0, 0.2 * hs, 0.12 * hs, headPivot);
    trim.scale.set(0.92, 1.05, 0.7);
    head.position.z = 0.03 * hs;
    const tail = place(box(0.22 * hs, 0.38 * hs, 0.065 * hs, C.chalk), 0, 0.02 * hs, -0.175 * hs, headPivot);
    tail.rotation.z = 0.08;
    tail.rotation.x = 0.12;
  } else if (hairStyle === 'balding') {
    // Warm side-fringe hair for village elder
    const fringe = place(mesh(new THREE.TorusGeometry(0.168 * hs, 0.042 * hs, 6, 12, Math.PI * 1.25), hair), 0, 0.24 * hs, -0.01 * hs, headPivot);
    fringe.rotation.x = Math.PI / 2;
    fringe.rotation.z = Math.PI * 0.875;
  } else if (hairStyle === 'ponytail') {
    const capHair = place(sphere(0.205 * hs, hair, 1), 0, 0.25 * hs, -0.02 * hs, headPivot);
    capHair.scale.set(0.98, 0.86, 1.0);
    // Bangs
    place(box(0.22 * hs, 0.06 * hs, 0.08 * hs, hair), 0, 0.32 * hs, 0.13 * hs, headPivot).rotation.x = 0.25;
    // Cute bobbing ponytail
    const tie = place(sphere(0.035 * hs, C.kilimRed, 0), 0, 0.22 * hs, -0.21 * hs, headPivot);
    tie.scale.set(1.2, 1.2, 0.8);
    const pony = place(capsule(0.052 * hs, 0.18 * hs, hair), 0, 0.12 * hs, -0.25 * hs, headPivot);
    pony.rotation.x = 0.45;
  } else if (hairStyle === 'parted') {
    const capHair = place(sphere(0.206 * hs, hair, 1), 0, 0.255 * hs, -0.025 * hs, headPivot);
    capHair.scale.set(0.99, 0.84, 1.0);
    const sweep = place(sphere(0.11 * hs, hair, 1), -0.06 * hs, 0.345 * hs, 0.095 * hs, headPivot);
    sweep.scale.set(1.25, 0.55, 0.9);
  } else {
    // Tousled layered messy hair (great for adult traveler & kids!)
    const capHair = place(sphere(0.206 * hs, hair, 1), 0, 0.255 * hs, -0.025 * hs, headPivot);
    capHair.scale.set(1.0, 0.86, 1.02);
    // Chunky hair tufts & bangs
    for (const [tx, ty, tz, rx, rz] of [
      [-0.08, 0.35, 0.1, 0.25, 0.2],
      [0.05, 0.36, 0.11, 0.2, -0.18],
      [0.13, 0.29, 0.04, 0.1, -0.35],
      [-0.13, 0.29, 0.04, 0.1, 0.35],
    ]) {
      const tuft = place(sphere(0.072 * hs, hair, 0), tx * hs, ty * hs, tz * hs, headPivot);
      tuft.scale.set(1.1, 0.72, 0.9);
      tuft.rotation.set(rx, 0, rz);
    }
  }

  // --- ARTICULATED ARMS (Shoulder -> Upper Arm + Sleeve -> Elbow -> Forearm -> Hand) ---
  const arms = [];
  const shortSleeve = shorts || child || apron || !!jacket;
  const forearmCol = shortSleeve ? C.skin : sleeveCol;
  const handCol = gloves ? C.gold : C.skin;
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.255 * s, 0.41 * s, 0);
    torsoPivot.add(shoulder);

    // Shoulder puff / sleeve cap
    place(sphere(0.078 * s, sleeveCol, 1), 0, -0.02 * s, 0, shoulder);
    place(capsule(0.062 * s, 0.16 * s, sleeveCol), 0, -0.11 * s, 0, shoulder);
    // Rolled sleeve cuff accent!
    if (shortSleeve) {
      place(cyl(0.068 * s, 0.068 * s, 0.038 * s, jacket ? shirt : sleeveCol, 8), 0, -0.2 * s, 0, shoulder);
    }

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.21 * s, 0);
    shoulder.add(elbow);

    place(capsule(0.052 * s, 0.14 * s, forearmCol), 0, -0.1 * s, 0, elbow);
    const hand = place(sphere(gloves ? 0.078 * s : 0.06 * s, handCol, 1), 0, -0.22 * s, 0, elbow);
    hand.scale.set(0.95, 1.05, 0.85);

    const handAttach = new THREE.Group();
    handAttach.position.set(0, -0.24 * s, 0.04 * s);
    elbow.add(handAttach);

    arms.push({ pivot: shoulder, elbow, hand, attach: handAttach, side });
  }

  // --- ARTICULATED LEGS (Hip -> Thigh -> Knee -> Shin/Sock -> Sculpted Shoe) ---
  const legs = [];
  const lowerLegCol = shorts ? C.skin : pantsCol;
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.112 * s, 0.62 * s, 0);
    body.add(hip);

    place(capsule((apron ? 0.1 : 0.078) * s, 0.2 * s, pantsCol), 0, -0.15 * s, 0, hip);

    const knee = new THREE.Group();
    knee.position.set(0, -0.3 * s, 0);
    hip.add(knee);

    place(capsule((apron ? 0.088 : 0.064) * s, 0.2 * s, lowerLegCol), 0, -0.14 * s, 0, knee);
    if (shorts) {
      // Crisp white athletic ankle socks for kids!
      place(cyl(0.062 * s, 0.056 * s, 0.11 * s, C.chalk, 8), 0, -0.22 * s, 0, knee);
    } else if (!apron) {
      // Trouser hem cuff
      place(cyl(0.072 * s, 0.074 * s, 0.035 * s, pantsCol, 8), 0, -0.25 * s, 0, knee);
    }

    // Sculpted shoe + pale rubber/leather sole
    const shoeCol = child ? C.blue : C.woodDark;
    const shoe = place(sphere(0.084 * s, shoeCol, 1), 0, -0.295 * s, 0.045 * s, knee);
    shoe.scale.set(0.86, 0.56, 1.42);
    const sole = place(box(0.12 * s, 0.024 * s, 0.21 * s, child ? C.chalk : C.dark), 0, -0.33 * s, 0.045 * s, knee);
    sole.scale.set(1, 1, 1);

    legs.push({ pivot: hip, knee, side });
  }

  // --- HAND-HELD PROPS (Tespih beads, Dede's cane, Çaycı brass tray) ---
  let beadsGroup = null;
  if (beads) {
    beadsGroup = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      place(
        sphere(0.016 * s, C.gold, 0),
        Math.sin(a) * 0.042 * s,
        -0.06 * s - Math.abs(Math.cos(a)) * 0.05 * s,
        Math.cos(a) * 0.03 * s,
        beadsGroup
      );
    }
    arms[1].attach.add(beadsGroup);
  }

  let caneMesh = null;
  let caneRest = null;
  if (cane) {
    const caneGroup = new THREE.Group();
    // Curved handle + shaft anchored right in Dede's right hand while walking!
    const shaft = beamBetween(V(0, 0.02 * s, 0.02 * s), V(0.04 * s, -0.76 * s, 0.06 * s), 0.019 * s, C.woodDark);
    caneGroup.add(shaft);
    const handle = place(mesh(new THREE.TorusGeometry(0.045 * s, 0.016 * s, 5, 10, Math.PI), C.woodWarm), 0, 0.02 * s, -0.02 * s, caneGroup);
    handle.rotation.y = Math.PI / 2;
    arms[1].attach.add(caneGroup);
    caneMesh = caneGroup;

    // Resting cane leaning neatly beside Dede's cushion when seated reading!
    caneRest = new THREE.Group();
    caneRest.add(beamBetween(V(-0.34 * s, 0.72 * s, 0.1 * s), V(-0.42 * s, 0.02 * s, 0.28 * s), 0.019 * s, C.woodDark));
    const h2 = place(mesh(new THREE.TorusGeometry(0.045 * s, 0.016 * s, 5, 10, Math.PI), C.woodWarm), -0.34 * s, 0.72 * s, 0.06 * s, caneRest);
    h2.rotation.y = Math.PI / 2;
    caneRest.visible = false;
    body.add(caneRest);
  }

  let trayGroup = null;
  if (tray) {
    trayGroup = new THREE.Group();
    // Hanging Anatolian brass çaycı tray with 3 slender wire handles + swappable ruby glasses!
    place(cyl(0.28 * s, 0.25 * s, 0.028 * s, C.gold, 14), 0, -0.28 * s, 0.04 * s, trayGroup);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      trayGroup.add(
        beamBetween(
          V(0, 0, 0.04 * s),
          V(Math.cos(a) * 0.24 * s, -0.27 * s, 0.04 * s + Math.sin(a) * 0.24 * s),
          0.008 * s,
          C.woodWarm
        )
      );
    }
    // Fresh steaming tulip glass on tray (hides when çaycı picks it up to serve!)
    const miniTulipPts = [
      new THREE.Vector2(0.026 * s, 0),
      new THREE.Vector2(0.046 * s, 0.048 * s),
      new THREE.Vector2(0.035 * s, 0.098 * s),
      new THREE.Vector2(0.045 * s, 0.15 * s),
    ];
    const freshGlass = new THREE.Group();
    freshGlass.position.set(-0.08 * s, -0.26 * s, 0.04 * s);
    freshGlass.add(mesh(new THREE.LatheGeometry(miniTulipPts, 10), '#9c2810'));
    place(cyl(0.045 * s, 0.04 * s, 0.024 * s, C.chalk, 10), 0, 0.152 * s, 0, freshGlass);
    trayGroup.add(freshGlass);
    // Empty spent glass slot on tray (appears after çaycı clears player's empty glass!)
    const usedGlass = new THREE.Group();
    usedGlass.position.set(0.09 * s, -0.26 * s, 0.04 * s);
    usedGlass.add(mesh(new THREE.LatheGeometry(miniTulipPts, 10), '#dce8e6'));
    place(cyl(0.036 * s, 0.028 * s, 0.032 * s, '#7a2210', 8), 0, 0.018 * s, 0, usedGlass);
    usedGlass.visible = false;
    trayGroup.add(usedGlass);

    trayGroup.userData = { freshGlass, usedGlass };
    arms[1].attach.add(trayGroup);
  }

  g.userData = {
    rig: true,
    scale: s,
    headScale,
    body,
    torsoPivot,
    torso,
    headPivot,
    eyes,
    brows,
    arms,
    legs,
    beadsGroup,
    cane: caneMesh,
    caneRest,
    tray: trayGroup,
    pose,
    seed,
    action: 'idle',
    actionUntil: 0,
    actionStart: 0,
    actionDuration: 1,
    stoop: cane ? 0.1 : 0,
    lookYaw: 0,
    lookPitch: 0,
    torsoTwist: 0,
    // Smooth-blended joint state (initialized lazily on first animate)
    smoothInit: false,
  };

  setPose(g, pose, true);
  g.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = false;
      n.userData.occluder = false;
      n.userData.noReceivedShadow = true;
    }
  });
  return g;
}

export function setPose(g, pose, immediate = false) {
  const r = g.userData;
  if (!r?.rig) return;
  r.pose = pose;
  if (immediate) {
    r.smoothInit = false;
    animateFigure(g, 0, 1);
  }
}

export function triggerAction(g, action, duration, now) {
  const r = g.userData;
  if (!r?.rig) return;
  r.action = action;
  r.actionStart = now;
  r.actionDuration = Math.max(0.05, duration);
  r.actionUntil = now + duration;
}

export function setHeadTarget(g, worldTarget = null, strength = 1.0) {
  const r = g.userData;
  if (!r?.rig) return;
  if (!worldTarget) {
    r.lookYaw = 0;
    r.torsoTwist = 0;
    return;
  }
  const desiredWorldYaw = Math.atan2(worldTarget.x - g.position.x, worldTarget.z - g.position.z);
  let rel = Math.atan2(Math.sin(desiredWorldYaw - g.rotation.y), Math.cos(desiredWorldYaw - g.rotation.y));
  rel = clamp(rel, -1.25, 1.25) * strength;
  r.torsoTwist = clamp(rel * 0.42, -0.5, 0.5);
  r.lookYaw = clamp(rel * 0.65, -0.78, 0.78);
}

export function getHandWorldPos(g, sideIndex = 1, out = new THREE.Vector3()) {
  const r = g.userData;
  if (!r?.rig) return out.copy(g.position);
  g.updateMatrixWorld(true);
  return r.arms[sideIndex].attach.getWorldPosition(out);
}

export function animateFigure(g, time, dt = 1 / 60) {
  const r = g.userData;
  if (!r?.rig) return;
  const s = r.scale || 1;
  const phase = time * 1.4 + r.seed * 2.17;
  const active = r.actionUntil > time ? r.action : 'idle';
  const elapsed = Math.max(0, time - (r.actionStart || 0));
  const dur = r.actionDuration || 1;

  // Target joint angles for this frame (then smoothly damped -> zero robotic snapping!)
  let bodyY = 0;
  let bodyRx = r.stoop || 0;
  let bodyRz = 0;
  let torsoRx = 0;
  let torsoRy = r.torsoTwist || 0;
  let headRx = Math.sin(time * 0.48 + r.seed) * 0.03;
  let headRy = (r.lookYaw || 0) + Math.sin(time * 0.36 + r.seed * 4) * 0.08;

  // Arms: [left, right], each [shX, shZ, elX]
  let lShX = 0,
    lShZ = 0.04 + Math.sin(phase) * 0.015,
    lElX = -0.14;
  let rShX = 0,
    rShZ = -0.04 - Math.sin(phase) * 0.015,
    rElX = -0.14;

  // Legs: [left, right], each [hipX, hipZ, kneeX]
  let lHipX = 0,
    lHipZ = 0,
    lKneeX = 0;
  let rHipX = 0,
    rHipZ = 0,
    rKneeX = 0;

  // --- BASE POSE ---
  if (r.pose === 'walk' || r.pose === 'jog') {
    const freq = r.pose === 'jog' ? 7.6 : 3.9;
    const amp = r.pose === 'jog' ? 0.66 : 0.42;
    const stride = Math.sin(time * freq + r.seed);
    lHipX = stride * amp;
    rHipX = -stride * amp;
    lKneeX = Math.max(0, -stride) * (r.pose === 'jog' ? 0.9 : 0.48);
    rKneeX = Math.max(0, stride) * (r.pose === 'jog' ? 0.9 : 0.48);
    lShX = -stride * amp * 0.65;
    rShX = stride * amp * 0.65;
    lElX = r.pose === 'jog' ? -0.95 : -0.28 - Math.max(0, stride) * 0.2;
    rElX = r.pose === 'jog' ? -0.95 : -0.28 - Math.max(0, -stride) * 0.2;
    bodyY = Math.abs(stride) * (r.pose === 'jog' ? 0.062 : 0.028) * s;
    bodyRx = (r.stoop || 0) + (r.pose === 'jog' ? 0.12 : 0.04);
    torsoRy += stride * 0.06;
  } else if (r.pose === 'sit') {
    bodyY = -0.24 * s;
    bodyRx = r.stoop || 0;
    lHipX = -1.48;
    rHipX = -1.48;
    lHipZ = -0.06;
    rHipZ = 0.06;
    lKneeX = 1.46;
    rKneeX = 1.46;
    lShX = -0.28;
    lElX = -0.58;
    rShX = -0.28;
    rElX = -0.58;
    // Living seated micromotors for idle uncles (prayer beads / subtle shift)
    if (r.beadsGroup && active === 'idle') {
      rShX = -0.52;
      rElX = -0.82 + Math.sin(time * 2.8 + r.seed) * 0.12;
      rShZ = -0.08 + Math.sin(time * 1.9 + r.seed) * 0.06;
    }
  } else if (r.pose === 'lean') {
    // Relaxed casual lean against a wall (one foot tucked back, free hand on hip, tray held ready!)
    bodyY = -0.04 * s;
    bodyRx = -0.14;
    torsoRx = 0.08;
    lHipX = 0.26;
    lKneeX = 0.72;
    rHipX = -0.22;
    rKneeX = 0.14;
    lShX = 0.18;
    lShZ = -0.24;
    lElX = -0.86;
    headRx = 0.08;
  } else if (r.pose === 'crouch' || r.pose === 'sit-pet') {
    const isSat = r.pose === 'sit-pet';
    bodyY = (isSat ? -0.44 : -0.3) * s;
    bodyRx = isSat ? 0.2 : 0.26;
    lHipX = isSat ? -1.48 : -1.25;
    rHipX = isSat ? -1.42 : -1.1;
    lHipZ = isSat ? -0.28 : -0.1;
    rHipZ = isSat ? 0.28 : 0.1;
    lKneeX = isSat ? 1.52 : 1.55;
    rKneeX = isSat ? 1.48 : 1.35;
    // Clear forward-extended petting arm (both arms visible from side profile, gently stroking the cat!)
    const stroke = Math.sin(time * 4.4);
    lShX = -0.98 + stroke * 0.24;
    lShZ = 0.14 + Math.cos(time * 4.4) * 0.06;
    lElX = -0.34 + stroke * 0.22;
    rShX = isSat ? -0.48 : -0.92 + stroke * 0.18;
    rShZ = isSat ? -0.24 : -0.12;
    rElX = isSat ? -0.68 : -0.44 + stroke * 0.18;
    headRx = 0.34 + Math.sin(time * 2.2) * 0.04;
  }

  // Keep çaycı's tray arm comfortably bent and level whenever he carries a tray!
  if (r.tray) {
    rShX = -0.52;
    rShZ = -0.14;
    rElX = -0.92;
  }

  // Keep Dede's cane arm naturally forward
  if (r.cane && r.pose !== 'sit') {
    rShX = -0.28 + (r.pose === 'walk' ? Math.sin(time * 5.4 + r.seed) * 0.15 : 0);
    rElX = -0.35;
  }

  // --- EXPRESSIVE ACTION OVERRIDES ---
  let browLift = 0;
  if (active === 'nod') {
    headRx = 0.14 + Math.sin(time * 5.2) * 0.18;
    browLift = 0.012;
  } else if (active === 'raise') {
    rShX = -1.25;
    rShZ = -0.18;
    rElX = -0.68;
    headRx = -0.06;
    browLift = 0.014;
  } else if (active === 'reach-sugar') {
    // Anatomical right arm (arms[0], camera-facing at tea table!) reaches to sugar dish, lifts over glass & drops!
    const p = clamp(elapsed / dur, 0, 1);
    let reach, lift;
    if (p < 0.34) {
      reach = Math.sin((p / 0.34) * Math.PI * 0.5);
      lift = 0;
    } else if (p < 0.72) {
      reach = 1;
      lift = Math.sin(((p - 0.34) / 0.38) * Math.PI * 0.5);
    } else {
      const r2 = (p - 0.72) / 0.28;
      reach = 1 - r2;
      lift = 1 - r2;
    }
    torsoRx = 0.28 * reach;
    lShX = lerp(-0.28, lerp(-1.12, -1.32, lift), reach);
    lShZ = lerp(0.04, lerp(0.02, 0.34, lift), reach);
    lElX = lerp(-0.58, lerp(-0.22, -0.42, lift), reach);
    headRx = 0.26 * reach;
  } else if (active === 'stir') {
    // Anatomical right arm (arms[0]) reaches right above the tulip glass rim & swirls vertical spoon!
    const p = clamp(elapsed / dur, 0, 1);
    let inGlass = 1;
    if (p < 0.18) inGlass = p / 0.18;
    else if (p > 0.82) inGlass = (1 - p) / 0.18;
    const swirl = elapsed * Math.PI * 4.8;
    const activeSwirl = p >= 0.18 && p <= 0.82 ? 1 : 0;
    torsoRx = 0.3 * inGlass;
    lShX = lerp(-0.28, -1.26 + Math.sin(swirl) * 0.08 * activeSwirl, inGlass);
    lShZ = lerp(0.04, 0.36 + Math.cos(swirl) * 0.12 * activeSwirl, inGlass);
    lElX = lerp(-0.58, -0.34 + Math.cos(swirl) * 0.1 * activeSwirl, inGlass);
    headRx = 0.28 * inGlass;
  } else if (active === 'sip') {
    // Slow, unhurried savouring tea sip: reach -> lift smoothly to lips -> slow warm sip -> gentle set-down!
    const p = clamp(elapsed / dur, 0, 1);
    let reach = 0;
    let toMouth = 0;
    if (p < 0.22) {
      reach = Math.sin((p / 0.22) * Math.PI * 0.5);
    } else if (p < 0.42) {
      reach = 1;
      toMouth = Math.sin(((p - 0.22) / 0.2) * Math.PI * 0.5);
    } else if (p < 0.76) {
      reach = 1;
      toMouth = 1;
    } else if (p < 0.92) {
      reach = 1;
      toMouth = Math.cos(((p - 0.76) / 0.16) * Math.PI * 0.5);
    } else {
      reach = Math.cos(((p - 0.92) / 0.08) * Math.PI * 0.5);
    }
    const sipPeak = p >= 0.42 && p <= 0.76 ? Math.sin(((p - 0.42) / 0.34) * Math.PI) : 0;
    torsoRx = 0.24 * reach * (1 - toMouth) - 0.08 * sipPeak;
    lShX = lerp(-0.28, lerp(-1.18, -1.22, toMouth), reach);
    lShZ = lerp(0.04, lerp(0.32, 0.44, toMouth), reach);
    lElX = lerp(-0.58, lerp(-0.25, -1.48, toMouth), reach);
    headRx = lerp(0.18 * reach, -0.22, sipPeak);
    browLift = sipPeak * 0.014;
  } else if (active === 'pay') {
    const p = clamp(elapsed / dur, 0, 1);
    const reach = Math.sin(p * Math.PI);
    torsoRx = 0.18 * reach;
    lShX = lerp(-0.28, -1.06, reach);
    lShZ = lerp(0.04, 0.24, reach);
    lElX = lerp(-0.58, -0.38, reach);
    headRx = 0.16 * reach;
  } else if (active === 'serve' || active === 'serve-pickup' || active === 'serve-place') {
    const p = clamp(elapsed / dur, 0, 1);
    const reach = Math.sin(p * Math.PI);
    const toTray = active === 'serve-pickup' ? p : active === 'serve-place' ? 1 - p : 0;
    torsoRx = 0.24 * reach;
    // Free arm (arms[0]) reaches out to table and smoothly transfers glass to/from brass tray!
    lShX = lerp(-0.78, -1.18, reach);
    lShZ = lerp(-0.04, 0.34 * (1 - toTray) + 0.52 * toTray, reach);
    lElX = lerp(-0.62, -0.42, reach);
    headRx = 0.22 * reach;
  } else if (active === 'hold-fish') {
    lShX = -0.78;
    rShX = -0.78;
    lShZ = 0.26;
    rShZ = -0.26;
    lElX = -0.82 + Math.sin(time * 8) * 0.06;
    rElX = -0.82 - Math.sin(time * 8) * 0.06;
    headRx = 0.22;
    browLift = 0.014;
  } else if (active === 'drop-bucket') {
    const p = clamp(elapsed / dur, 0, 1);
    const lean = Math.sin(p * Math.PI);
    torsoRy = 0.56 * lean;
    torsoRx = 0.22 * lean;
    headRy = 0.38 * lean;
    headRx = 0.28 * lean;
    lShX = lerp(-0.72, -1.08, lean);
    rShX = lerp(-0.72, -1.08, lean);
    lShZ = 0.24;
    rShZ = -0.24;
    lElX = lerp(-0.78, -0.42, lean);
    rElX = lerp(-0.78, -0.42, lean);
  } else if (active === 'wave') {
    lShX = -2.2;
    lShZ = -0.28 + Math.sin(time * 9 + r.seed) * 0.28;
    lElX = -0.52;
    headRx = -0.05;
    browLift = 0.012;
  } else if (active === 'windup') {
    // Athletic coiled free-kick readiness!
    bodyY = -0.05 * s;
    bodyRx = 0.14;
    torsoRy = -0.22;
    lHipX = -0.25;
    lKneeX = 0.42;
    rHipX = 0.22;
    rKneeX = 0.35;
    lShX = -0.35;
    lShZ = 0.24;
    lElX = -0.65;
    rShX = 0.2;
    rShZ = -0.22;
    rElX = -0.55;
    headRx = 0.1;
  } else if (active === 'kick') {
    const p = clamp(elapsed / dur, 0, 1);
    // Crisp windup (0..0.32) -> explosive strike (0.32..0.62) -> athletic follow-through (0.62..1)
    if (p < 0.32) {
      const k = p / 0.32;
      bodyRx = lerp(0.06, -0.08, k);
      torsoRy = -0.26 * k;
      rHipX = lerp(0.1, 0.85, k);
      rKneeX = lerp(0.2, 1.15, k);
      lHipX = -0.22 * k;
      lKneeX = 0.28 * k;
      lShX = -0.45 * k;
      lShZ = 0.42 * k;
      rShX = 0.35 * k;
      rShZ = -0.32 * k;
    } else {
      const k = Math.sin(((p - 0.32) / 0.68) * Math.PI);
      bodyRx = 0.14 * k;
      torsoRy = 0.34 * k;
      rHipX = lerp(0.65, -1.18, Math.min(1, (p - 0.32) / 0.28)) * k;
      rKneeX = 0.22 * (1 - k);
      lHipX = -0.15 * k;
      lKneeX = 0.18 * k;
      lShX = -0.78 * k;
      lShZ = 0.55 * k;
      lElX = -0.45;
      rShX = 0.55 * k;
      rShZ = -0.38 * k;
      rElX = -0.55;
    }
  } else if (active === 'wall-jump') {
    const p = clamp(elapsed / dur, 0, 1);
    const jump = Math.sin(p * Math.PI);
    bodyY = jump * 0.46 * s;
    lShX = -0.5 - jump * 0.8;
    rShX = -0.5 - jump * 0.8;
    lShZ = 0.12;
    rShZ = -0.12;
    lElX = -1.25;
    rElX = -1.25;
    lKneeX = jump * 0.42;
    rKneeX = jump * 0.42;
  } else if (active === 'keeper-ready') {
    const bob = Math.sin(time * 4.5 + r.seed) * 0.03;
    bodyY = (-0.08 + bob) * s;
    bodyRx = 0.16;
    lHipX = -0.28;
    rHipX = -0.28;
    lHipZ = -0.18;
    rHipZ = 0.18;
    lKneeX = 0.48;
    rKneeX = 0.48;
    lShX = -0.62;
    rShX = -0.62;
    lShZ = 0.34;
    rShZ = -0.34;
    lElX = -0.82;
    rElX = -0.82;
  } else if (active === 'dive-l' || active === 'dive-r') {
    const dir = active === 'dive-l' ? 1 : -1;
    const p = clamp(elapsed / dur, 0, 1);
    const airborne = Math.sin(Math.min(1, p * 1.35) * Math.PI);
    const tilt = Math.min(1, p / 0.25);
    bodyY = lerp(0.18 * airborne, -0.38, Math.max(0, (p - 0.55) / 0.45)) * s;
    bodyRz = dir * 1.18 * tilt;
    lShX = -2.45 * tilt;
    rShX = -2.45 * tilt;
    lShZ = 0.16;
    rShZ = -0.16;
    lElX = -0.18;
    rElX = -0.18;
    lHipX = 0.2 * tilt;
    rHipX = -0.15 * tilt;
    lKneeX = 0.35 * tilt;
    rKneeX = 0.2 * tilt;
  } else if (active === 'slump') {
    // Disappointed opposing wall kids putting hands on head / hips!
    bodyRx = 0.14;
    headRx = 0.34;
    lShX = -1.65;
    rShX = -1.65;
    lShZ = 0.32;
    rShZ = -0.32;
    lElX = -1.55;
    rElX = -1.55;
  } else if (active === 'cast') {
    const p = clamp(elapsed / dur, 0, 1);
    const back = p < 0.38 ? p / 0.38 : 1 - (p - 0.38) / 0.62;
    torsoRx = lerp(0.16, -0.18, back);
    rShX = lerp(-0.92, -1.95, back);
    rElX = lerp(-0.45, -0.85, back);
  } else if (active === 'reel') {
    rShX = -1.15;
    rElX = -0.95 + Math.sin(time * 13) * 0.22;
    lShX = -0.82;
    lElX = -1.1 + Math.cos(time * 13) * 0.26;
    torsoRx = -0.1;
  } else if (active === 'fish') {
    rShX = -0.85 + Math.sin(time * 1.1 + r.seed) * 0.05;
    rShZ = -0.08;
    rElX = -0.58;
    lShX = -0.62;
    lElX = -0.78;
  } else if (active === 'bake') {
    // Rich, expressive Anatolian tandır baking choreography: kneading/patting dough, gesturing over embers & welcoming wave!
    const cycle = (time * 0.45 + r.seed) % 3;
    const w = Math.sin(time * 4.4);
    const w2 = Math.cos(time * 3.1);
    if (cycle < 1.2) {
      // Rhythmic dough patting / stretching with alternating lively hands!
      torsoRx = 0.22 + w2 * 0.06;
      lShX = -1.04 + w * 0.34;
      rShX = -1.04 - w * 0.34;
      lShZ = -0.12 - Math.abs(w) * 0.22;
      rShZ = 0.12 + Math.abs(w) * 0.22;
      lElX = -0.78 + w2 * 0.32;
      rElX = -0.78 - w2 * 0.32;
      headRx = 0.22 + Math.sin(time * 3.8) * 0.08;
    } else if (cycle < 2.2) {
      // Warm expressive two-hand gesture checking the tandır embers & explaining the bake!
      torsoRx = 0.16;
      lShX = -1.24 + w * 0.26;
      rShX = -0.88 - w2 * 0.24;
      lShZ = -0.28 + w2 * 0.22;
      rShZ = 0.26 - w * 0.2;
      lElX = -0.54 + w * 0.26;
      rElX = -0.74 - w2 * 0.24;
      headRx = 0.14 + Math.sin(time * 4.5) * 0.1;
      browLift = 0.012;
    } else {
      // Hearty welcoming palm-up gesture & chuckle!
      torsoRx = 0.08;
      lShX = -1.16 + w * 0.28;
      rShX = -1.02 - w * 0.22;
      lShZ = -0.44 - Math.abs(w2) * 0.24;
      rShZ = 0.44 + Math.abs(w2) * 0.24;
      lElX = -0.68 + w * 0.18;
      rElX = -0.68 - w * 0.18;
      headRx = -0.04 + Math.sin(time * 5.2) * 0.1;
      browLift = 0.016;
    }
  } else if (active === 'hug') {
    // Heartwarming close Anatolian family embrace: both arms wrap warmly forward/inward, gentle back pat & cozy sway!
    const sway = Math.sin(time * 2.6 + r.seed);
    const pat = Math.sin(time * 6.4 + r.seed) * 0.12;
    bodyRx = 0.16;
    bodyRz = sway * 0.05;
    torsoRx = 0.14;
    lShX = -1.32 + pat;
    rShX = -1.24 - pat;
    lShZ = 0.46;
    rShZ = -0.46;
    lElX = -1.18 + pat;
    rElX = -1.14 - pat;
    headRx = 0.16;
    headRy = 0.26; // Nestle heads cleanly cheek-by-shoulder instead of colliding!
    browLift = 0.018;
  } else if (active === 'pull-bread') {
    const p = clamp(elapsed / dur, 0, 1);
    const reachIn = p < 0.45 ? Math.sin((p / 0.45) * Math.PI * 0.5) : Math.cos(((p - 0.45) / 0.55) * Math.PI * 0.5);
    const offer = p >= 0.45 ? Math.sin(((p - 0.45) / 0.55) * Math.PI * 0.5) : 0;
    torsoRx = 0.34 * reachIn + 0.12 * offer;
    lShX = lerp(-0.85, -1.15, reachIn + offer * 0.6);
    rShX = lerp(-0.85, -1.15, reachIn + offer * 0.6);
    lShZ = 0.18;
    rShZ = -0.18;
    lElX = lerp(-0.4, -0.62, offer);
    rElX = lerp(-0.4, -0.62, offer);
    headRx = 0.28 * reachIn;
  } else if (active === 'handover') {
    torsoRx = 0.16;
    lShX = -1.06;
    rShX = -1.06;
    lShZ = 0.16;
    rShZ = -0.16;
    lElX = -0.42;
    rElX = -0.42;
    headRx = 0.1;
  } else if (active === 'eat' || active === 'tear-eat') {
    // Left arm (arms[1]) holds remaining loaf steady; Right arm (arms[0]) tears a warm piece & brings to mouth!
    const p = clamp(elapsed / dur, 0, 1);
    let toMouth = 0;
    if (p < 0.24) toMouth = 0;
    else if (p < 0.46) toMouth = Math.sin(((p - 0.24) / 0.22) * Math.PI * 0.5);
    else if (p < 0.72) toMouth = 1;
    else toMouth = Math.cos(((p - 0.72) / 0.28) * Math.PI * 0.5);
    const chew = p >= 0.44 && p <= 0.76 ? Math.sin(((p - 0.44) / 0.32) * Math.PI * 3) : 0;
    // Left hand cradles loaf
    rShX = -0.66;
    rShZ = -0.18;
    rElX = -0.84;
    // Right hand tears & lifts bite cleanly to lips
    lShX = lerp(-0.68, -1.14, toMouth);
    lShZ = lerp(0.24, 0.42, toMouth);
    lElX = lerp(-0.82, -1.44, toMouth);
    headRx = 0.1 * toMouth + chew * 0.06;
    browLift = toMouth * 0.014;
  } else if (active === 'hold-bread') {
    lShX = -0.64;
    rShX = -0.64;
    lShZ = 0.18;
    rShZ = -0.18;
    lElX = -0.82;
    rElX = -0.82;
  } else if (active === 'open-door') {
    const p = clamp(elapsed / dur, 0, 1);
    const reach = Math.sin(p * Math.PI);
    rShX = -1.15 * reach;
    rElX = -0.35 * reach;
    torsoRy = -0.18 * reach;
  } else if (active === 'read') {
    lShX = -0.78;
    rShX = -0.78;
    lShZ = 0.12;
    rShZ = -0.12;
    lElX = -0.85;
    rElX = -0.85;
    // Occasional tiny page-turn motion!
    const pageCycle = (time * 0.22 + r.seed * 0.7) % 1;
    if (pageCycle > 0.88) {
      const k = Math.sin(((pageCycle - 0.88) / 0.12) * Math.PI);
      rShX -= 0.25 * k;
      rShZ += 0.22 * k;
    }
    headRx = 0.32 + Math.sin(time * 0.9 + r.seed) * 0.04;
  } else if (active === 'mob' || active === 'cheer') {
    const hop = Math.abs(Math.sin(time * 6.8 + r.seed));
    bodyY = hop * 0.18 * s;
    lShX = -2.25 + Math.sin(time * 9 + r.seed) * 0.2;
    rShX = -2.25 - Math.sin(time * 9 + r.seed) * 0.2;
    lShZ = 0.34;
    rShZ = -0.34;
    lElX = -0.32;
    rElX = -0.32;
    lKneeX = hop * 0.28;
    rKneeX = hop * 0.28;
    headRx = -0.1;
    browLift = 0.015;
  } else if (active === 'airplane-run') {
    // Pure childhood banger-goal euphoria: sprinting with arms spread wide like airplane wings!
    const bank = Math.sin(time * 5.2 + r.seed) * 0.14;
    bodyRz = bank;
    bodyRx = 0.18;
    lShX = -0.28;
    rShX = -0.28;
    lShZ = -1.35 + bank * 0.4;
    rShZ = 1.35 + bank * 0.4;
    lElX = -0.12;
    rElX = -0.12;
    headRx = -0.16;
    browLift = 0.018;
  } else if (active === 'chat-explain') {
    // Expressive alternating two-hand storytelling gestures + animated nods & raised brows!
    const w1 = Math.sin(time * 4.2 + r.seed);
    const w2 = Math.cos(time * 3.4 + r.seed * 1.7);
    torsoRx = 0.12 + w2 * 0.05;
    lShX = -0.88 + w1 * 0.34;
    lShZ = -0.22 - Math.abs(w1) * 0.26;
    lElX = -0.78 + w2 * 0.28;
    if (!r.tray) {
      rShX = -0.82 - w1 * 0.3;
      rShZ = 0.22 + Math.abs(w2) * 0.24;
      rElX = -0.82 - w1 * 0.25;
    }
    headRx = 0.06 + Math.sin(time * 5.0 + r.seed) * 0.14;
    headRy += Math.sin(time * 2.1 + r.seed) * 0.14;
    browLift = 0.012 + Math.max(0, w1) * 0.008;
  } else if (active === 'chat-shrug') {
    // Classic warm Anatolian palms-out shrug & amusing head tilt!
    const pulse = Math.sin(time * 2.6 + r.seed) * 0.5 + 0.5;
    torsoRx = 0.04 - pulse * 0.06;
    lShX = -0.58 - pulse * 0.25;
    lShZ = -0.45 - pulse * 0.38;
    lElX = -0.95 + pulse * 0.22;
    if (!r.tray) {
      rShX = -0.58 - pulse * 0.25;
      rShZ = 0.45 + pulse * 0.38;
      rElX = -0.95 + pulse * 0.22;
    }
    headRx = -0.04 + Math.sin(time * 3.2 + r.seed) * 0.08;
    headRy += Math.sin(time * 2.4 + r.seed) * 0.22;
    bodyRz = Math.sin(time * 2.2 + r.seed) * 0.06;
    browLift = 0.016 * pulse;
  } else if (active === 'chat-point') {
    // Enthusiastic gesturing / pointing outward while sharing a village tale!
    const sweep = Math.sin(time * 3.6 + r.seed);
    torsoRx = 0.16;
    lShX = -1.32 + sweep * 0.24;
    lShZ = -0.18 + sweep * 0.32;
    lElX = -0.28 - Math.max(0, -sweep) * 0.32;
    if (!r.tray) {
      rShX = -0.52;
      rShZ = 0.16;
      rElX = -0.78;
    }
    headRx = -0.02 + Math.sin(time * 4.4 + r.seed) * 0.12;
    browLift = 0.014;
  } else if (active === 'chat-laugh') {
    // Hearty warm chuckle: head tilts back, shoulders bob, friendly waving hand!
    const chuckle = Math.sin(time * 8.5 + r.seed);
    const wave = Math.sin(time * 4.5 + r.seed);
    torsoRx = -0.12 + chuckle * 0.06;
    bodyY += Math.max(0, chuckle) * 0.025 * s;
    lShX = -1.08 + wave * 0.28;
    lShZ = -0.12 + wave * 0.28;
    lElX = -0.82 + chuckle * 0.18;
    if (!r.tray) {
      rShX = -0.68;
      rShZ = -0.18;
      rElX = -1.12;
    }
    headRx = -0.18 + chuckle * 0.1;
    browLift = 0.018;
  } else if (active === 'chat-listen') {
    // Attentive listening & warm agreeing nods with gentle open-hand acknowledgement!
    const nod = Math.sin(time * 4.6 + r.seed);
    const ack = Math.sin(time * 1.9 + r.seed) * 0.5 + 0.5;
    torsoRx = 0.12;
    lShX = -0.52 - ack * 0.42;
    lShZ = -0.08 - ack * 0.22;
    lElX = -0.88 + ack * 0.24;
    headRx = 0.1 + nod * 0.16;
    browLift = 0.01 * ack;
  } else if (active === 'gesture') {
    lShX = -0.72;
    lShZ = 0.28 + Math.sin(time * 4.5 + r.seed) * 0.16;
    lElX = -0.68;
  } else if (active === 'tavla') {
    const p = clamp(elapsed / dur, 0, 1);
    const reach = Math.sin(p * Math.PI);
    torsoRx = 0.18 * reach;
    rShX = lerp(-0.3, -0.92, reach);
    rElX = lerp(-0.58, -0.52, reach);
    headRx = 0.26 * reach;
  }

  // Smooth exponential damping across all joints (snappy for actions, silky for pose transitions!)
  const k = r.smoothInit ? 1 - Math.exp(-Math.min(dt, 0.1) * 14) : 1;
  r.smoothInit = true;

  r.body.position.y = lerp(r.body.position.y, bodyY, k);
  r.body.rotation.x = lerp(r.body.rotation.x, bodyRx, k);
  r.body.rotation.z = lerp(r.body.rotation.z, bodyRz, k);

  r.torsoPivot.rotation.x = lerp(r.torsoPivot.rotation.x, torsoRx, k);
  r.torsoPivot.rotation.y = lerp(r.torsoPivot.rotation.y, torsoRy, k);
  r.torso.scale.y = 1.0 + Math.sin(phase) * 0.014;

  r.headPivot.rotation.x = lerp(r.headPivot.rotation.x, headRx, k);
  r.headPivot.rotation.y = lerp(r.headPivot.rotation.y, headRy, k);

  r.arms[0].pivot.rotation.x = lerp(r.arms[0].pivot.rotation.x, lShX, k);
  r.arms[0].pivot.rotation.z = lerp(r.arms[0].pivot.rotation.z, lShZ, k);
  r.arms[0].elbow.rotation.x = lerp(r.arms[0].elbow.rotation.x, lElX, k);

  r.arms[1].pivot.rotation.x = lerp(r.arms[1].pivot.rotation.x, rShX, k);
  r.arms[1].pivot.rotation.z = lerp(r.arms[1].pivot.rotation.z, rShZ, k);
  r.arms[1].elbow.rotation.x = lerp(r.arms[1].elbow.rotation.x, rElX, k);

  r.legs[0].pivot.rotation.x = lerp(r.legs[0].pivot.rotation.x, lHipX, k);
  r.legs[0].pivot.rotation.z = lerp(r.legs[0].pivot.rotation.z, lHipZ, k);
  r.legs[0].knee.rotation.x = lerp(r.legs[0].knee.rotation.x, lKneeX, k);

  r.legs[1].pivot.rotation.x = lerp(r.legs[1].pivot.rotation.x, rHipX, k);
  r.legs[1].pivot.rotation.z = lerp(r.legs[1].pivot.rotation.z, rHipZ, k);
  r.legs[1].knee.rotation.x = lerp(r.legs[1].knee.rotation.x, rKneeX, k);

  // Subtle organic eye blink every ~4s
  const blinkCycle = (time + r.seed * 1.37) % 4.4;
  const blinking = blinkCycle > 4.26 && blinkCycle < 4.38;
  for (const e of r.eyes) {
    e.scale.y = blinking ? 0.16 : 1.0;
  }
  for (const b of r.brows) {
    b.position.y = (0.258 + browLift) * s * (r.headScale || 1);
  }

  // Keep hanging tray & beads naturally upright against gravity!
  if (r.tray) {
    const armPitch = r.body.rotation.x + r.torsoPivot.rotation.x + r.arms[1].pivot.rotation.x + r.arms[1].elbow.rotation.x;
    r.tray.rotation.x = -armPitch + Math.sin(time * 3.4 + r.seed) * 0.04;
  }
  if (r.beadsGroup) {
    r.beadsGroup.rotation.z = Math.sin(time * 3.2 + r.seed) * 0.24;
  }
  if (r.cane) {
    const seated = r.pose === 'sit';
    r.cane.visible = !seated;
    if (r.caneRest) r.caneRest.visible = seated;
    r.cane.rotation.x = -(r.arms[1].pivot.rotation.x + r.arms[1].elbow.rotation.x) * 0.65;
  }
}

export function faceFigure(g, target) {
  g.rotation.y = Math.atan2(target.x - g.position.x, target.z - g.position.z);
}

export function faceFigureSmooth(g, target, dt = 1 / 60, rate = 9) {
  const desired = Math.atan2(target.x - g.position.x, target.z - g.position.z);
  g.rotation.y = lerpAngle(g.rotation.y, desired, 1 - Math.exp(-dt * rate));
}

// Expressive lounging village cat with sculpted muzzle, articulated biscuit-making front paws, optional tabby stripes, pink inner ears & happy closed eyes
export function makeCat(color = C.dusk, accent = C.chalk, { stripes = false, angry = false } = {}) {
  const g = new THREE.Group();
  const body = place(capsule(0.145, 0.34, color), 0, 0.18, 0, g);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.06, 1, 0.92);

  if (stripes) {
    // Warm ginger-brown tabby saddle stripes along the back
    for (const sz of [-0.11, -0.01, 0.09]) {
      const st = place(cyl(0.148, 0.148, 0.036, '#a95420', 10), 0, 0.185, sz, g);
      st.rotation.x = Math.PI / 2;
      st.scale.set(1.04, 1.0, 0.92);
    }
  }

  // Soft chest patch & articulated front paws (for adorable kneading / "making biscuits"!) + tucked hind paws
  place(sphere(0.115, accent, 1), 0, 0.165, 0.18, g);
  const frontPaws = [];
  for (const sx of [-0.078, 0.078]) {
    const pawPivot = new THREE.Group();
    pawPivot.position.set(sx, 0.125, 0.19);
    g.add(pawPivot);
    const leg = place(capsule(0.034, 0.06, color), 0, -0.038, 0.025, pawPivot);
    leg.rotation.x = 0.35;
    const paw = place(sphere(0.048, accent, 1), 0, -0.068, 0.068, pawPivot);
    paw.scale.set(0.96, 0.65, 1.38);
    frontPaws.push(pawPivot);

    const backPaw = place(sphere(0.056, color, 1), sx * 1.45, 0.075, -0.1, g);
    backPaw.scale.set(0.9, 0.72, 1.25);
  }

  const head = new THREE.Group();
  head.position.set(0, 0.275, 0.255);
  g.add(head);
  const skull = place(sphere(0.148, color, 2), 0, 0, 0, head);
  skull.scale.set(1.04, 0.94, 0.96);
  // Soft muzzle cheeks + pink nose
  for (const sx of [-0.032, 0.032]) {
    place(sphere(0.042, accent, 1), sx, -0.025, 0.125, head);
  }
  place(box(0.026, 0.018, 0.018, '#d97e74'), 0, -0.008, 0.155, head);

  // Pointed ears with warm pink inner triangles
  const earGeo = new THREE.ConeGeometry(0.06, 0.115, 4);
  const innerEarGeo = new THREE.ConeGeometry(0.032, 0.07, 4);
  for (const side of [-1, 1]) {
    const ear = place(mesh(earGeo.clone(), color), side * 0.085, 0.135, -0.01, head);
    ear.rotation.z = -side * (angry ? 0.44 : 0.2);
    if (angry) ear.rotation.x = -0.22;
    const inner = place(mesh(innerEarGeo.clone(), '#e2a49c'), side * 0.085, 0.13, 0.02, head);
    inner.rotation.z = -side * (angry ? 0.44 : 0.2);
    if (angry) inner.rotation.x = -0.22;
  }

  const eyes = [];
  for (const x of [-0.056, 0.056]) {
    const e = place(box(0.038, 0.026, 0.018, C.gold), x, 0.028, 0.132, head);
    place(box(0.014, 0.024, 0.008, '#231e2c'), 0, 0, 0.008, e);
    eyes.push(e);
  }

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.16, -0.22);
  g.add(tailPivot);
  let tailMid = null;
  if (angry) {
    // Articulated 2-segment cat tail extending back so it lashes & whips naturally left and right!
    const seg1 = place(capsule(0.026, 0.15, color), 0, 0.025, -0.095, tailPivot);
    seg1.rotation.x = Math.PI / 2 - 0.24;
    tailMid = new THREE.Group();
    tailMid.position.set(0, 0.05, -0.185);
    tailPivot.add(tailMid);
    const seg2 = place(capsule(0.022, 0.15, color), 0, 0.022, -0.088, tailMid);
    seg2.rotation.x = Math.PI / 2 - 0.22;
    place(sphere(0.026, accent, 0), 0, 0.044, -0.178, tailMid);
  } else {
    const tail = place(
      mesh(new THREE.TorusGeometry(0.19, 0.028, 6, 12, Math.PI * 1.35), color),
      0,
      0,
      -0.06,
      tailPivot
    );
    tail.rotation.x = Math.PI / 2;
    tail.rotation.z = 0.55;
    // Little tail tip accent
    place(sphere(0.032, accent, 0), -0.15, 0, -0.19, tailPivot);
  }

  g.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = false;
      n.userData.noReceivedShadow = true;
    }
  });

  g.userData = { cat: true, body, head, tailPivot, tailMid, eyes, frontPaws, pet: 0, happy: 0, biscuits: false, angry };
  return g;
}
