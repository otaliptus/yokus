import * as THREE from 'three';
import { GameClock, mulberry32, STOP_NAMES, clamp, lerp, V, C, ground, isInRiver, IS_MOBILE } from './palette.js';
import { setPose, faceFigure, faceFigureSmooth } from './figures.js';
import { RendererPipeline, CameraRig, InteractionSystem, AudioManager, MusicManager } from './engine.js';
import { World } from './world.js';
import { StopDirector } from './stops.js';

class YokusGame {
  constructor() {
    this.params = new URLSearchParams(location.search);
    this.manual = this.params.get('manual') === '1';
    this.rng = mulberry32(Number(this.params.get('seed')) || 1936);
    this.clock = new GameClock(this.params.get('speed'));
    this.time = 0;
    this.started = false;
    this.arrivalTime = 0;

    this.state = {
      stop: 0,
      mode: 'opening',
      memory: false,
      memoryStrength: 1,
      memoryLevel: 0,
      white: 0,
      ended: false,
    };

    this.ui = {
      opening: document.querySelector('#opening'),
      openingPrompt: document.querySelector('#opening-prompt'),
      openingResume: document.querySelector('#opening-resume'),
      continueBtn: document.querySelector('#continue-btn'),
      startOverBtn: document.querySelector('#start-over-btn'),
      memory: document.querySelector('#memory-frame'),
      ending: document.querySelector('#ending-card'),
      endActions: document.querySelector('#end-actions'),
      replay: document.querySelector('#replay-btn'),
      freeroam: document.querySelector('#freeroam-btn'),
      freekick: document.querySelector('#freekick-btn'),
      teaBtn: document.querySelector('#tea-btn'),
      breadBtn: document.querySelector('#bread-btn'),
      fkHud: document.querySelector('#fk-hud'),
      fkScore: document.querySelector('#fk-score'),
      roamActBtn: document.querySelector('#roam-act-btn'),
      fkExit: document.querySelector('#fk-exit-btn'),
      rotateHint: document.querySelector('#rotate-hint'),
      rotateDismiss: document.querySelector('#rotate-dismiss'),
    };
    if (IS_MOBILE && this.ui.openingPrompt) {
      this.ui.openingPrompt.textContent = 'tap to begin';
    }
    this.ui.rotateDismiss?.addEventListener('click', () => {
      this.ui.rotateHint?.classList.add('dismissed');
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-12, 12, 7.5, -7.5, 0.1, 180);
    this.pipeline = new RendererPipeline(document.querySelector('#world'), this.scene, this.camera);
    this.world = new World(this.scene, this.rng);
    this.rig = new CameraRig(this.camera, this.world);

    this.player = this.world.figure(
      {
        height: 1.72,
        palette: C.cream,
        shirt: C.cream,
        jacket: C.rust,
        trouser: C.dark,
        headwear: 'cap',
        hair: '#3b2d24',
        satchel: true,
        pose: 'stand',
        seed: 73,
      },
      0.2,
      34.5
    );
    this.rig.player = this.player;

    this.audio = new AudioManager();
    this.music = new MusicManager(this);
    this.stops = new StopDirector(this);
    this.interactions = new InteractionSystem(this, document.querySelector('#world'));

    const saved = this.readSave();
    const requested = this.params.has('stop') ? clamp(Number(this.params.get('stop')) || 0, 0, 7) : saved;
    this.requestedStop = requested;
    this.state.stop = requested;
    this.rig.snapToStop(requested === 7 ? 6 : requested, true);

    // Simple continue vs restart choice on the opening screen for returning visitors!
    if (saved >= 1 && !this.params.has('stop')) {
      this.ui.openingPrompt?.classList.add('hidden');
      this.ui.openingResume?.classList.add('visible');
    }

    this.freeroam = {
      active: false,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: true,
      inWater: false,
      seated: null,
      pettingCat: null,
      petPurrAt: 0,
      nearSeat: null,
      nearActivity: null,
      walkTarget: null,
      stepPuffAt: 0,
    };
    this.roamReturnPos = null;

    this.lastFrame = performance.now();
    this.fps = 60;

    this.ui.continueBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.begin();
    });
    this.ui.startOverBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.requestedStop = 0;
      this.save(0);
      this.begin();
    });
    this.ui.opening.addEventListener('click', () => this.begin());
    this.ui.opening.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.begin();
    });
    this.ui.replay?.addEventListener('click', () => this.restart());
    this.ui.freeroam?.addEventListener('click', () => this.startFreeRoam());
    this.ui.freekick?.addEventListener('click', () => this.startUnlimitedFreeKicks(false));
    this.ui.teaBtn?.addEventListener('click', () => this.startUnlimitedTea(false));
    this.ui.breadBtn?.addEventListener('click', () => this.startUnlimitedBread(false));
    this.ui.roamActBtn?.addEventListener('click', () => this.triggerFreeRoamAction());
    this.ui.fkExit?.addEventListener('click', () => {
      if (this.roamReturnPos && this.state.mode !== 'freeroam') {
        const ret = this.roamReturnPos.clone();
        this.roamReturnPos = null;
        this.startFreeRoam(ret);
      } else {
        this.returnToDuskPanorama();
      }
    });
    addEventListener('resize', () => {
      if (this.rig.fixed) {
        this.rig.setFixed(this.world.finalView.position, this.world.finalView.target, 44.0);
      } else {
        this.rig.applyCamera();
      }
      this.pipeline.forceShadowUpdate?.();
    });

    this.installDebug();
    this.update(0);
    this.render();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  readSave() {
    try {
      const n = Number(localStorage.getItem('yokus.stop'));
      return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 0;
    } catch {
      return 0;
    }
  }

  save(n) {
    try {
      localStorage.setItem('yokus.stop', String(n));
    } catch {}
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.audio.start();
    this.ui.opening.classList.add('hidden');
    const n = this.requestedStop;
    if (n === 0) {
      this.state.stop = 0;
      this.state.mode = 'arrival';
      this.arrivalTime = 0;
      this.world.animateArrival(0);
      this.rig.snapToStop(0, true);
      this.music.setStop('arrival');
      this.save(0);
    } else {
      this.enterStop(n);
    }
    this.interactions.lastInput = this.time;
  }

  restart() {
    this.stops.resetAll();
    this.freeroam.active = false;
    this.freeroam.vx = 0;
    this.freeroam.vy = 0;
    this.freeroam.vz = 0;
    this.freeroam.grounded = true;
    this.freeroam.inWater = false;
    this.freeroam.seated = null;
    this.freeroam.nearSeat = null;
    this.freeroam.walkTarget = null;
    this.interactions.keys?.clear();
    this.player.scale.setScalar(1);
    this.state.ended = false;
    this.state.white = 0;
    this.state.memory = false;
    this.requestedStop = 0;
    this.player.visible = true;
    this.rig.fixed = false;
    this.rig.setUserZoom(1.0);
    this.ui.memory?.classList.remove('on');
    this.ui.ending?.classList.remove('visible');
    this.ui.endActions?.classList.remove('visible');
    this.ui.fkHud?.classList.remove('visible');
    this.state.stop = 0;
    this.state.mode = 'arrival';
    this.arrivalTime = 0;
    this.world.animateArrival(0);
    this.rig.snapToStop(0, true);
    this.music.setStop('arrival');
    this.save(0);
  }

  startUnlimitedFreeKicks(fromRoam = false) {
    if (!this.started) this.begin();
    document.activeElement?.blur?.();
    this.roamReturnPos = fromRoam ? this.player.position.clone() : null;
    this.stops.resetAll();
    this.freeroam.active = false;
    this.freeroam.seated = null;
    this.freeroam.pettingCat = null;
    this.interactions.keys?.clear();
    this.state.ended = false;
    this.state.white = 0;
    this.player.visible = true;
    this.ui.ending?.classList.remove('visible');
    this.ui.endActions?.classList.remove('visible');
    this.football.unlimitedMode = true;
    this.football.afterMemory = true;
    this.state.stop = 2;
    this.stops.enter(2);
    this.rig.snapToStop(2, true);
    this.updateModeHud();
    this.ui.fkHud?.classList.add('visible');
  }

  startUnlimitedTea(fromRoam = false) {
    if (!this.started) this.begin();
    document.activeElement?.blur?.();
    this.roamReturnPos = fromRoam ? this.player.position.clone() : null;
    this.stops.resetAll();
    this.freeroam.active = false;
    this.freeroam.seated = null;
    this.freeroam.pettingCat = null;
    this.interactions.keys?.clear();
    this.state.ended = false;
    this.state.white = 0;
    this.player.visible = true;
    this.ui.ending?.classList.remove('visible');
    this.ui.endActions?.classList.remove('visible');
    this.tea.unlimitedMode = true;
    this.state.stop = 1;
    this.stops.enter(1);
    this.rig.snapToStop(1, true);
    this.updateModeHud();
    this.ui.fkHud?.classList.add('visible');
  }

  startUnlimitedFishing(fromRoam = false) {
    if (!this.started) this.begin();
    document.activeElement?.blur?.();
    this.roamReturnPos = fromRoam ? this.player.position.clone() : null;
    this.stops.resetAll();
    this.freeroam.active = false;
    this.freeroam.seated = null;
    this.freeroam.pettingCat = null;
    this.interactions.keys?.clear();
    this.state.ended = false;
    this.state.white = 0;
    this.player.visible = true;
    this.ui.ending?.classList.remove('visible');
    this.ui.endActions?.classList.remove('visible');
    this.river.unlimitedMode = true;
    this.river.seated = true;
    this.river.memoryDone = true;
    this.river.caught = 0;
    this.river.fish = 1;
    this.state.stop = 3;
    this.stops.enter(3);
    this.rig.snapToStop(3, true);
    this.player.position.copy(this.world.riverSeatPos);
    setPose(this.player, 'sit', true);
    faceFigure(this.player, V(this.world.riverSeatPos.x, this.world.riverY, this.world.riverSeatPos.z - 4));
    this.player.userData.action = 'fish';
    this.player.userData.actionUntil = Infinity;
    this.updateModeHud();
    this.ui.fkHud?.classList.add('visible');
  }

  startUnlimitedBread(fromRoam = false) {
    if (!this.started) this.begin();
    document.activeElement?.blur?.();
    this.roamReturnPos = fromRoam ? this.player.position.clone() : null;
    this.stops.resetAll();
    this.freeroam.active = false;
    this.freeroam.seated = null;
    this.freeroam.pettingCat = null;
    this.interactions.keys?.clear();
    this.state.ended = false;
    this.state.white = 0;
    this.player.visible = true;
    this.ui.ending?.classList.remove('visible');
    this.ui.endActions?.classList.remove('visible');
    this.bread.unlimitedMode = true;
    this.state.stop = 4;
    this.stops.enter(4);
    this.rig.snapToStop(4, true);
    this.updateModeHud();
    this.ui.fkHud?.classList.add('visible');
  }

  startFreeRoam(returnPos = null) {
    if (!this.started) this.begin();
    document.activeElement?.blur?.();
    this.roamReturnPos = null;
    this.stops.resetAll();
    this.state.ended = false;
    this.state.white = 0;
    this.setMemory(false);
    this.ui.ending?.classList.remove('visible');
    this.ui.endActions?.classList.remove('visible');

    // Restore lively outdoor village state across every stop!
    const w = this.world;
    w.minibus.visible = false;
    if (w.minibusObstacle) w.minibusObstacle.active = false;
    w.memoryKids.forEach((k) => (k.visible = false));
    w.memoryWall?.forEach((k) => (k.visible = false));
    if (w.memoryKeeper) w.memoryKeeper.visible = false;
    if (w.footballChild) w.footballChild.visible = false;
    if (w.riverChild) w.riverChild.visible = false;
    if (w.breadChild) w.breadChild.visible = false;
    if (w.breadBitePiece) w.breadBitePiece.visible = false;
    if (w.servedGlass) w.servedGlass.visible = false;
    w.friend.visible = false;
    w.selfChild.visible = false;
    w.dede.visible = false;
    w.openBook.visible = false;
    w.youngAunt.visible = false;
    w.aunt.visible = true;
    if (w.auntHome) w.aunt.position.copy(w.auntHome);
    setPose(w.aunt, 'stand', true);
    w.bread.visible = true;
    w.breadPieces.forEach((p) => (p.visible = true));
    w.teaGlass.visible = true;
    w.teaGlass.position.copy(w.teaGlassBase);
    w.cayci.visible = true;
    w.cayci.position.copy(w.cayciHome);
    setPose(w.cayci, 'stand', true);
    w.wall.forEach((k) => (k.visible = true));
    w.keeper.visible = true;
    w.pitchKids.forEach((k) => {
      k.visible = true;
      if (k.userData.homePos) k.position.copy(k.userData.homePos);
      setPose(k, 'stand', true);
    });
    if (w.riverKid) {
      w.riverKid.visible = true;
      w.riverKid.position.copy(w.riverKidSeat);
      setPose(w.riverKid, 'sit', true);
      w.riverKid.userData.action = 'fish';
      w.riverKid.userData.actionUntil = Infinity;
      if (w.riverKidRod) w.riverKidRod.visible = true;
    }
    w.rodPivot.visible = true;
    w.rodPivot.position.copy(w.rodRestPos);
    w.rodPivot.rotation.set(0.14, 0, -0.08);
    w.fishingLine.visible = false;
    w.bobber.visible = false;
    w.fishFlash.visible = false;
    w.doorPivot.rotation.y = 0;
    for (const c of w.cats) {
      c.visible = true;
      c.userData.pet = 0;
      c.userData.running = false;
      if (c.userData.homePos) c.position.copy(c.userData.homePos);
      if (c.userData.homeYaw != null) c.rotation.y = c.userData.homeYaw;
    }

    // Spawn at returnPos (coming back from tea/bread/freekicks/fishing) or right outside great-grandfather's courtyard gate!
    const startX = returnPos ? returnPos.x : 0.0;
    const startZ = returnPos ? returnPos.z : -38.6;
    this.player.visible = true;
    this.player.scale.setScalar(1);
    this.player.position.set(startX, w.walkHeight(startX, startZ, returnPos ? returnPos.y : null), startZ);
    w.resolveFreeRoamCollisions(this.player.position, 0.3, this.player.position.y);
    this.player.position.y = w.walkHeight(this.player.position.x, this.player.position.z, this.player.position.y);
    this.player.userData.action = 'idle';
    this.player.userData.actionUntil = 0;
    this.player.userData.turnTarget = null;
    setPose(this.player, 'stand', true);
    faceFigure(this.player, V(this.player.position.x, this.player.position.y, this.player.position.z + 6));

    this.freeroam.active = true;
    this.freeroam.vx = 0;
    this.freeroam.vy = 0;
    this.freeroam.vz = 0;
    this.freeroam.grounded = true;
    this.freeroam.inWater = false;
    this.freeroam.seated = null;
    this.freeroam.pettingCat = null;
    this.freeroam.nearSeat = null;
    this.freeroam.nearActivity = null;
    this.freeroam.walkTarget = null;
    this.freeroam.stepPuffAt = 0;
    this.interactions.keys?.clear();

    this.state.stop = 5;
    this.state.mode = 'freeroam';
    this.rig.startFreeRoam(this.player.position, 0.36);
    // Play the cozy fishing song during free roam!
    this.music.setStop('river');
    this.freeroam.nearActivity = this.findNearestRoamActivity();
    this.freeroam.nearSeat = this.freeroam.nearActivity?.kind === 'seat' ? this.freeroam.nearActivity.seat : null;
    this.updateModeHud();
    this.ui.fkHud?.classList.add('visible');
  }

  setFreeRoamTarget(x, z) {
    if (this.state.mode !== 'freeroam') return;
    if (this.freeroam.seated) this.standFromFreeRoamSeat();
    if (this.freeroam.pettingCat) this.stopFreeRoamPet();
    // On mobile tap near a balcony/lookout chair, sit right down if close enough!
    if (this.freeroam.nearSeat && Math.hypot(x - this.freeroam.nearSeat.pos.x, z - this.freeroam.nearSeat.pos.z) < 1.2) {
      this.triggerFreeRoamAction();
      return;
    }
    this.freeroam.walkTarget = V(clamp(x, -34, 22.5), 0, clamp(z, -56.5, 43.5));
  }

  stopFreeRoamPet() {
    const fr = this.freeroam;
    if (!fr.pettingCat) return;
    fr.pettingCat.userData.pet = 0;
    fr.pettingCat = null;
    setPose(this.player, 'stand');
    this.updateModeHud();
  }

  triggerFreeRoamJump() {
    if (this.state.mode !== 'freeroam') return;
    const fr = this.freeroam;
    if (fr.seated) {
      this.standFromFreeRoamSeat();
      return;
    }
    if (fr.pettingCat) {
      this.stopFreeRoamPet();
      return;
    }
    if (!fr.grounded) return;
    fr.vy = 6.9;
    fr.grounded = false;
    setPose(this.player, 'jump');
    if (fr.inWater) {
      this.audio.sfx('splash');
      this.world.spawnPuff(V(this.player.position.x, this.player.position.y + 0.15, this.player.position.z), 12, '#eef6fa');
    } else {
      this.audio.sfx('thump');
      this.world.spawnPuff(V(this.player.position.x, this.player.position.y + 0.05, this.player.position.z), 6, '#e4c386');
    }
  }

  standFromFreeRoamSeat() {
    const fr = this.freeroam;
    if (!fr.seated) return;
    const seat = fr.seated;
    fr.seated = null;
    this.player.position.copy(seat.standPos);
    fr.vy = 0;
    fr.grounded = true;
    setPose(this.player, 'stand');
    this.updateModeHud();
  }

  triggerFreeRoamAction() {
    if (this.state.mode !== 'freeroam') return;
    const fr = this.freeroam;
    if (fr.seated) {
      this.standFromFreeRoamSeat();
      return;
    }
    if (fr.pettingCat) {
      this.stopFreeRoamPet();
      return;
    }
    const act = this.findNearestRoamActivity();
    if (!act) return;
    if (act.kind === 'seat') {
      const seat = act.seat;
      fr.seated = seat;
      fr.vx = 0;
      fr.vy = 0;
      fr.vz = 0;
      fr.grounded = true;
      fr.walkTarget = null;
      this.player.position.copy(seat.pos);
      setPose(this.player, 'sit');
      faceFigure(this.player, seat.lookAt);
      this.rig.faceFreeRoamSeat(seat);
      this.audio.sfx('thump');
      this.updateModeHud();
    } else if (act.kind === 'tea') {
      this.startUnlimitedTea(true);
    } else if (act.kind === 'football') {
      this.startUnlimitedFreeKicks(true);
    } else if (act.kind === 'river') {
      this.startUnlimitedFishing(true);
    } else if (act.kind === 'bread') {
      this.startUnlimitedBread(true);
    } else if (act.kind === 'cat') {
      if (act.idx === 2 && !this.house.whiteCatFled) {
        this.stops.triggerWhiteCatFlee();
      } else {
        fr.pettingCat = act.cat;
        fr.petPurrAt = this.time + 0.2;
        fr.vx = 0;
        fr.vz = 0;
        fr.walkTarget = null;
        act.cat.userData.pet = 1;
        setPose(this.player, 'sit-pet');
        faceFigure(this.player, act.cat.position);
        this.updateModeHud();
      }
    }
  }

  toggleFreeRoamSit() {
    this.triggerFreeRoamAction();
  }

  findNearestRoamSeat() {
    const seats = this.world.roamSeats || [];
    const p = this.player.position;
    let best = null;
    let bestD = 1.45;
    for (const s of seats) {
      const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
      if (d < bestD && Math.abs(p.y - s.pos.y) < 1.1) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  findNearestRoamActivity() {
    const seat = this.findNearestRoamSeat();
    if (seat) return { kind: 'seat', seat, label: 'sit & watch' };
    const p = this.player.position;
    const spots = [
      { kind: 'tea', x: -6.6, z: 17.5, r: 3.3, label: 'drink tea' },
      { kind: 'football', x: 10.5, z: 2.2, r: 4.2, label: 'free kicks' },
      { kind: 'river', x: -5.4, z: -11.4, r: 3.1, label: 'go fishing' },
      { kind: 'bread', x: 6.8, z: -27.2, r: 3.3, label: 'eat warm bread' },
    ];
    for (const s of spots) {
      const gy = this.world.walkHeight(s.x, s.z);
      if (Math.hypot(p.x - s.x, p.z - s.z) < s.r && Math.abs(p.y - gy) < 1.35) {
        return s;
      }
    }
    const cats = this.world.cats || [];
    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      if (!c.visible) continue;
      if (i === 2 && this.house.whiteCatFled) continue;
      if (Math.hypot(p.x - c.position.x, p.z - c.position.z) < 1.7 && Math.abs(p.y - c.position.y) < 1.0) {
        return { kind: 'cat', idx: i, cat: c, label: 'pet cat' };
      }
    }
    return null;
  }

  updateFreeRoam(dt) {
    const fr = this.freeroam;
    const keys = this.interactions.keys;
    this.stops.updateWhiteCatFlee(dt);
    let inFwd = 0;
    let inRight = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp') || keys.has('w')) inFwd += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown') || keys.has('s')) inFwd -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight') || keys.has('d')) inRight += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft') || keys.has('a')) inRight -= 1;
    const jogging = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('shift');

    // If seated on a balcony/ridge/minaret viewpoint, stay cozy watching the village until WASD / Space / E stands up!
    if (fr.seated) {
      if (inFwd !== 0 || inRight !== 0) {
        this.standFromFreeRoamSeat();
      } else {
        this.player.position.copy(fr.seated.pos);
        if (this.player.userData.pose !== 'sit') setPose(this.player, 'sit');
        faceFigureSmooth(this.player, fr.seated.lookAt, dt, 8);
        this.rig.updateFreeRoam(dt, this.player.position, 0, 0, fr.seated);
        return;
      }
    }

    // If petting a courtyard cat in Free Roam, stay crouching & stroking until WASD / Space / E stands up!
    if (fr.pettingCat) {
      if (inFwd !== 0 || inRight !== 0) {
        this.stopFreeRoamPet();
      } else {
        const cat = fr.pettingCat;
        cat.userData.pet = 1;
        if (this.player.userData.pose !== 'sit-pet') setPose(this.player, 'sit-pet');
        faceFigureSmooth(this.player, cat.position, dt, 10);
        if (!cat.userData.angry) {
          if (this.time >= fr.petPurrAt) {
            fr.petPurrAt = this.time + 2.8;
            this.audio.sfx('purr');
          }
          if (Math.floor(this.time * 1.5) !== Math.floor((this.time - dt) * 1.5)) {
            this.world.spawnPuff(cat.position.clone().add(V(0, 0.45, 0)), 4, '#ffe8a2');
          }
        }
        this.rig.updateFreeRoam(dt, this.player.position, 0, 0, false);
        return;
      }
    }

    let dirX = 0;
    let dirZ = 0;
    let wantSpeed = 0;
    if (inFwd !== 0 || inRight !== 0) {
      fr.walkTarget = null;
      const yaw = this.rig.yaw;
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rgtX = Math.cos(yaw);
      const rgtZ = -Math.sin(yaw);
      dirX = fwdX * inFwd + rgtX * inRight;
      dirZ = fwdZ * inFwd + rgtZ * inRight;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;
      wantSpeed = jogging ? 6.2 : 3.5;
    } else if (fr.walkTarget) {
      const dx = fr.walkTarget.x - this.player.position.x;
      const dz = fr.walkTarget.z - this.player.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.32) {
        fr.walkTarget = null;
      } else {
        dirX = dx / dist;
        dirZ = dz / dist;
        wantSpeed = dist > 5.0 ? 4.8 : 3.4;
      }
    }

    const accel = 1 - Math.exp(-dt * 12);
    fr.vx = lerp(fr.vx, dirX * wantSpeed, accel);
    fr.vz = lerp(fr.vz, dirZ * wantSpeed, accel);

    const pos = this.player.position;
    const spd = Math.hypot(fr.vx, fr.vz);
    if (spd > 0.08) {
      pos.x += fr.vx * dt;
      pos.z += fr.vz * dt;
      this.world.resolveFreeRoamCollisions(pos, 0.3, pos.y);
      faceFigureSmooth(this.player, V(pos.x + fr.vx, pos.y, pos.z + fr.vz), dt, 12);
    } else {
      fr.vx = 0;
      fr.vz = 0;
    }

    // Vertical physics: smooth jumping, gravity, stepping onto climbable rocks, external stairs & balconies!
    const surfY = this.world.walkHeight(pos.x, pos.z, pos.y);
    const wasGrounded = fr.grounded;
    if (!fr.grounded || pos.y > surfY + 0.06) {
      fr.vy -= 19.5 * dt;
      pos.y += fr.vy * dt;
      const landSurf = this.world.walkHeight(pos.x, pos.z, pos.y);
      if (pos.y <= landSurf) {
        pos.y = landSurf;
        const impact = Math.abs(fr.vy);
        fr.vy = 0;
        fr.grounded = true;
        if (!wasGrounded && impact > 2.2) {
          const wadingLand = isInRiver(pos.x, pos.z, -0.2) && pos.y < ground(pos.x, pos.z) + 0.3 && Math.abs(pos.x + 1.15) > 2.25;
          if (wadingLand) {
            this.audio.sfx('splash');
            this.world.spawnPuff(V(pos.x, pos.y + 0.16, pos.z), 16, '#eef6fa');
          } else {
            this.audio.sfx('thump');
            this.world.spawnPuff(V(pos.x, pos.y + 0.05, pos.z), 8, '#e4c386');
          }
        }
      } else {
        fr.grounded = false;
      }
    } else {
      pos.y = surfY;
      fr.vy = 0;
      fr.grounded = true;
    }

    // Water entry splash + wading step splash SFX (only when in river water, NOT on the stone bridge or stepping rocks!)
    const onDryHigh = pos.y > ground(pos.x, pos.z) + 0.22;
    const wading = fr.grounded && !onDryHigh && isInRiver(pos.x, pos.z, -0.2) && Math.abs(pos.x + 1.15) > 2.25;
    if (wading && !fr.inWater) {
      this.audio.sfx('splash');
      this.world.spawnPuff(V(pos.x, pos.y + 0.15, pos.z), 16, '#eef6fa');
      fr.stepPuffAt = this.time + 0.32;
    }
    fr.inWater = wading;

    // Character animation pose
    if (!fr.grounded) {
      if (this.player.userData.pose !== 'jump') setPose(this.player, 'jump');
    } else if (spd > 0.08) {
      const pose = spd > 4.6 ? 'jog' : 'walk';
      if (this.player.userData.pose !== pose) setPose(this.player, pose);
      if (this.time > fr.stepPuffAt) {
        if (wading) {
          fr.stepPuffAt = this.time + 0.36;
          this.audio.sfx('wade');
          this.world.spawnPuff(V(pos.x, pos.y + 0.14, pos.z), 8, '#eef6fa');
        } else if (pose === 'jog') {
          fr.stepPuffAt = this.time + 0.34;
          this.world.spawnPuff(V(pos.x, pos.y + 0.06, pos.z), 5, '#e4c386');
        }
      }
    } else if (this.player.userData.pose !== 'stand') {
      setPose(this.player, 'stand');
    }

    // Refresh HUD prompt cleanly whenever entering/leaving reach of any village activity, cat, or balcony chair!
    const nearAct = this.findNearestRoamActivity();
    const prevKey = fr.nearActivity ? `${fr.nearActivity.kind}-${fr.nearActivity.idx ?? fr.nearActivity.label}` : '';
    const nextKey = nearAct ? `${nearAct.kind}-${nearAct.idx ?? nearAct.label}` : '';
    fr.nearSeat = nearAct?.kind === 'seat' ? nearAct.seat : null;
    if (prevKey !== nextKey) {
      fr.nearActivity = nearAct;
      this.updateModeHud();
    } else {
      fr.nearActivity = nearAct;
    }

    this.rig.updateFreeRoam(dt, this.player.position, fr.vx, fr.vz, false);
  }

  returnToDuskPanorama() {
    this.football.unlimitedMode = false;
    this.tea.unlimitedMode = false;
    this.river.unlimitedMode = false;
    this.bread.unlimitedMode = false;
    this.roamReturnPos = null;
    this.freeroam.active = false;
    this.freeroam.vx = 0;
    this.freeroam.vy = 0;
    this.freeroam.vz = 0;
    this.freeroam.grounded = true;
    this.freeroam.inWater = false;
    this.freeroam.seated = null;
    this.freeroam.pettingCat = null;
    this.freeroam.nearSeat = null;
    this.freeroam.nearActivity = null;
    this.freeroam.walkTarget = null;
    this.interactions.keys?.clear();
    this.rig.setUserZoom(1.0);
    if (this.ui.roamActBtn) this.ui.roamActBtn.hidden = true;
    this.ui.fkHud?.classList.remove('visible');
    this.state.stop = 7;
    this.state.mode = 'final';
    this.state.white = 0;
    this.ending.time = 28;
    this.ui.ending?.classList.remove('visible');
    this.ui.endActions?.classList.add('visible');
    this.rig.setFixed(this.world.finalView.position, this.world.finalView.target, 44.0);
    this.music.setStop('ending');
  }

  updateModeHud() {
    if (!this.ui.fkScore) return;
    const actBtn = this.ui.roamActBtn;
    const exitBtn = this.ui.fkExit;
    if (this.state.mode === 'freeroam') {
      if (exitBtn) exitBtn.textContent = 'back to dusk';
      if (this.freeroam.seated) {
        this.ui.fkScore.textContent = 'sitting & watching · wasd to stand';
        if (actBtn) {
          actBtn.hidden = false;
          actBtn.textContent = IS_MOBILE ? 'stand up' : 'e · stand up';
        }
      } else if (this.freeroam.pettingCat) {
        this.ui.fkScore.textContent = 'petting cat · wasd to stand';
        if (actBtn) {
          actBtn.hidden = false;
          actBtn.textContent = IS_MOBILE ? 'stand up' : 'e · stand up';
        }
      } else if (this.freeroam.nearActivity) {
        this.ui.fkScore.textContent = IS_MOBILE ? 'tap to walk · drag look' : 'wasd roam · space jump · drag look';
        if (actBtn) {
          actBtn.hidden = false;
          actBtn.textContent = (IS_MOBILE ? '' : 'e · ') + this.freeroam.nearActivity.label;
        }
      } else {
        this.ui.fkScore.textContent = IS_MOBILE
          ? 'tap to walk · drag to look'
          : 'wasd roam · space jump · shift jog · drag look';
        if (actBtn) actBtn.hidden = true;
      }
    } else {
      if (actBtn) actBtn.hidden = true;
      if (exitBtn) exitBtn.textContent = this.roamReturnPos ? 'back to roam' : 'back to dusk';
      if (this.football.unlimitedMode) {
        const f = this.football;
        this.ui.fkScore.textContent = `goals ${f.goals} · streak ${f.streak}${f.bestStreak > 1 ? ` · best ${f.bestStreak}` : ''}`;
      } else if (this.tea.unlimitedMode) {
        const t = this.tea;
        const finished = Math.max(0, t.glasses - 1 + (t.sips >= 3 ? 1 : 0));
        this.ui.fkScore.textContent = `tea glasses ${finished} · total sips ${t.totalSips || 0}`;
      } else if (this.river.unlimitedMode) {
        this.ui.fkScore.textContent = `fish caught ${this.river.caught} · bucket ${this.river.fish}`;
      } else if (this.bread.unlimitedMode) {
        this.ui.fkScore.textContent = `loaves eaten ${this.bread.bites}`;
      }
    }
  }

  updateFreekickHud() {
    this.updateModeHud();
  }

  enterStop(n) {
    this.state.stop = n;
    this.state.white = 0;
    this.stops.enter(n);
    this.save(n);
  }

  enterApproach(n) {
    this.state.stop = n;
    this.state.mode = 'approach';
    this.state.white = 0;
    this.rig.snapToApproach(n, { immediate: false, preserveOrbit: true });
    this.interactions.lastInput = this.time;
    this.music.setStop(
      ['arrival', 'teahouse', 'football', 'river', 'bread', 'house', 'readingroom', 'ending'][n]
    );
  }

  startWalkTo(n) {
    if (this.state.mode === 'walking' || this.state.mode === 'entering') return;
    this.state.mode = 'walking';
    this.state.toStop = n;
    this.rig.beginWalk(n, { toApproach: !!this.world.approachSpots?.[n] });
  }

  startEnterStop(n) {
    if (this.state.mode !== 'approach' || this.state.stop !== n) return;
    this.state.mode = 'entering';
    this.state.toStop = n;
    this.rig.beginEnterWalk(n);
  }

  setMemory(on, strength = 1) {
    this.state.memory = on;
    this.state.memoryStrength = strength;
    this.ui.memory.classList.toggle('on', on);
  }

  finish() {
    this.state.ended = true;
    try {
      localStorage.removeItem('yokus.stop');
    } catch {}
  }

  action(id, opts = {}) {
    if (!this.started) this.begin();
    this.interactions.lastInput = this.time;
    this.stops.interact(id, opts);
  }

  update(dt) {
    this.time += dt;
    if (this.started) {
      this.music.update(dt);
      this.audio.update(this);
      if (this.state.mode === 'arrival') {
        this.arrivalTime += dt;
        this.world.animateArrival(this.arrivalTime);
        this.rig.baseTarget.copy(this.world.minibus.position).lerp(this.player.position, 0.55).add(V(0, 0.9, 0));
        this.rig.updateLook(dt, 'arrival');
        if (this.arrivalTime > 5.8) this.startWalkTo(1);
      } else {
        // Keep dolmuş driving smoothly downhill out of the village after arrival walk starts!
        if (this.arrivalTime > 0 && this.arrivalTime < 13.0) {
          this.arrivalTime += dt;
          this.world.animateArrival(this.arrivalTime);
        }
        if (this.state.mode === 'walking') {
          this.stops.updatePitchBackground(dt);
          const to = this.state.toStop;
          if (this.rig.updateWalk(dt)) {
            if (this.world.approachSpots?.[to]) this.enterApproach(to);
            else this.enterStop(to);
          }
        } else if (this.state.mode === 'approach') {
          this.stops.updatePitchBackground(dt);
          this.rig.updateLook(dt, 'approach');
        } else if (this.state.mode === 'entering') {
          this.stops.updatePitchBackground(dt);
          const to = this.state.toStop;
          if (this.rig.updateWalk(dt)) this.enterStop(to);
        } else if (this.state.mode === 'interact') {
          this.rig.updateLook(dt, 'interact');
          this.stops.update(dt);
        } else if (this.state.mode === 'freeroam') {
          this.updateFreeRoam(dt);
        } else if (this.state.mode === 'ending') {
          this.stops.update(dt);
        } else if (this.state.mode === 'final') {
          this.rig.updateZoomOnly?.(dt);
        }
      }
    }

    this.state.memoryLevel = lerp(
      this.state.memoryLevel,
      this.state.memory ? this.state.memoryStrength : 0,
      1 - Math.exp(-dt * 2.6)
    );
    this.interactions.update(dt);
    this.world.update(dt, this);
  }

  render() {
    this.pipeline.render(this.time, this.state.memoryLevel, this.state.white);
  }

  // True unlocked requestAnimationFrame (60/120 Hz silky-smooth!)
  loop(now) {
    const raw = Math.max(0.001, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.fps = lerp(this.fps, 1 / raw, 0.05);
    const dt = this.manual ? ((this.clock.last = now), 0) : this.clock.tick(now);
    this.update(dt);
    this.render();
    requestAnimationFrame(this.loop);
  }

  readState() {
    const f = this.football;
    return {
      started: this.started,
      stop: this.state.stop,
      stopName: STOP_NAMES[this.state.stop],
      mode: this.state.mode,
      time: Number(this.time.toFixed(2)),
      speed: this.clock.speed,
      memory: this.state.memory,
      memoryLevel: Number(this.state.memoryLevel.toFixed(3)),
      white: Number(this.state.white.toFixed(3)),
      ended: this.state.ended,
      muted: this.audio.muted,
      music: [...this.music.current],
      tea: { ...this.tea },
      football: {
        shots: f.shots,
        postShots: f.postShots,
        goals: f.goals,
        streak: f.streak,
        bestStreak: f.bestStreak,
        unlimitedMode: !!f.unlimitedMode,
        lapRunning: !!f.lapRunner,
        phase: f.phase,
        afterMemory: f.afterMemory,
        goal: f.goal,
        power: Number(f.power.toFixed(3)),
        ball: this.world.ball.position.toArray().map((n) => Number(n.toFixed(2))),
      },
      chat: { active: this.chat.active, npcId: this.chat.npcId, time: Number(this.chat.time.toFixed(2)), duration: this.chat.duration },
      river: { ...this.river },
      bread: { ...this.bread },
      house: {
        petted: Object.keys(this.house.petted),
        whiteCatFled: !!this.house.whiteCatFled,
        opening: this.house.opening,
        door: Number(this.world.doorPivot.rotation.y.toFixed(2)),
      },
      reading: { book: this.reading.book, bookTime: Number(this.reading.bookTime.toFixed(2)) },
      ending: { ...this.ending },
      hint: this.stops.hint(),
      canLeave: Array.from({ length: 4 }, (_, i) => this.stops.canLeave(i + 1)),
      freeroam: {
        active: this.freeroam.active,
        grounded: this.freeroam.grounded,
        inWater: this.freeroam.inWater,
        seated: !!this.freeroam.seated,
        pettingCat: !!this.freeroam.pettingCat,
        nearSeat: this.freeroam.nearSeat?.label || null,
        nearActivity: this.freeroam.nearActivity?.label || null,
        seatsCount: this.world.roamSeats?.length || 0,
      },
      playerPos: this.player.position.toArray().map((n) => Number(n.toFixed(2))),
      dragYaw: Number(this.rig.dragYaw.toFixed(3)),
      dragPitch: Number(this.rig.dragPitch.toFixed(3)),
      camera: this.camera.position.toArray().map((n) => Number(n.toFixed(2))),
      fps: Math.round(this.fps),
    };
  }

  debugJump(n) {
    n = clamp(Math.floor(Number(n) || 0), 0, 7);
    if (!this.started) this.begin();
    this.stops.resetAll();
    this.freeroam.active = false;
    this.freeroam.vx = 0;
    this.freeroam.vy = 0;
    this.freeroam.vz = 0;
    this.freeroam.grounded = true;
    this.freeroam.inWater = false;
    this.freeroam.seated = null;
    this.freeroam.nearSeat = null;
    this.freeroam.walkTarget = null;
    this.player.scale.setScalar(1);
    this.requestedStop = n;
    this.state.ended = false;
    this.state.white = 0;
    this.player.visible = true;
    this.player.userData.turnTarget = null;
    this.world.memoryKids.forEach((k) => (k.visible = false));
    this.world.memoryWall?.forEach((k) => (k.visible = false));
    if (this.world.memoryKeeper) this.world.memoryKeeper.visible = false;
    if (this.world.footballChild) this.world.footballChild.visible = false;
    if (this.world.riverChild) this.world.riverChild.visible = false;
    if (this.world.breadChild) this.world.breadChild.visible = false;
    if (this.world.breadBitePiece) this.world.breadBitePiece.visible = false;
    if (this.world.servedGlass) this.world.servedGlass.visible = false;
    if (this.world.riverKid) this.world.riverKid.visible = true;
    this.world.wall.forEach((k) => {
      k.visible = true;
      k.scale.setScalar(1);
    });
    this.world.keeper.visible = true;
    this.world.friend.visible = false;
    this.world.selfChild.visible = false;
    this.world.dede.visible = false;
    this.world.openBook.visible = false;
    if (n === 0) {
      this.state.stop = 0;
      this.state.mode = 'arrival';
      this.arrivalTime = 0;
      this.rig.snapToStop(0, true);
    } else {
      this.enterStop(n);
      this.rig.snapToStop(n, true);
    }
    this.update(0);
    this.render();
    return this.readState();
  }

  shot(n, memory = false) {
    this.debugJump(n);
    this.stops.prepareShot(n, memory);
    this.update(0);
    this.render();
    return this.readState();
  }

  targets() {
    const rect = this.pipeline.renderer.domElement.getBoundingClientRect();
    const box = new THREE.Box3();
    const point = new THREE.Vector3();
    const out = [];
    this.camera.updateMatrixWorld();
    for (const item of this.world.interactables) {
      if (!this.stops.isEnabled(item.id)) continue;
      item.root.updateWorldMatrix(true, true);
      box.setFromObject(item.root);
      if (box.isEmpty()) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            point.set(x, y, z).project(this.camera);
            const sx = rect.left + (point.x + 1) * 0.5 * rect.width;
            const sy = rect.top + (1 - point.y) * 0.5 * rect.height;
            minX = Math.min(minX, sx);
            maxX = Math.max(maxX, sx);
            minY = Math.min(minY, sy);
            maxY = Math.max(maxY, sy);
          }
        }
      }
      out.push({
        id: item.id,
        x: (minX + maxX) * 0.5,
        y: (minY + maxY) * 0.5,
        w: maxX - minX,
        h: maxY - minY,
      });
    }
    return out;
  }

  installDebug() {
    const api = {
      jump: (n) => this.debugJump(n),
      freekicks: () => {
        this.startUnlimitedFreeKicks();
        this.update(0);
        this.render();
        return this.readState();
      },
      freeroam: () => {
        this.startFreeRoam();
        this.update(0);
        this.render();
        return this.readState();
      },
      roamSeats: () =>
        (this.world.roamSeats || []).map((s) => ({
          label: s.label,
          pos: s.pos.toArray().map((n) => Number(n.toFixed(2))),
          standPos: s.standPos.toArray().map((n) => Number(n.toFixed(2))),
        })),
      teleportRoam: (x, z, y = null) => {
        if (this.state.mode !== 'freeroam') this.startFreeRoam();
        const py = y != null ? y : this.world.walkHeight(x, z, this.player.position.y + 3);
        this.player.position.set(x, py, z);
        this.freeroam.vy = 0;
        this.freeroam.grounded = true;
        this.rig.target.set(x, py + 0.95, z);
        this.rig.desiredTarget.copy(this.rig.target);
        this.update(0);
        this.render();
        return this.readState();
      },
      unlimitedTea: () => {
        this.startUnlimitedTea();
        this.update(0);
        this.render();
        return this.readState();
      },
      unlimitedBread: () => {
        this.startUnlimitedBread();
        this.update(0);
        this.render();
        return this.readState();
      },
      zoom: (z) => {
        this.rig.setUserZoom(z, true);
        this.render();
        return this.rig.userZoom;
      },
      approach: (n) => {
        n = clamp(Math.floor(Number(n) || 1), 1, 5);
        if (!this.started) this.begin();
        this.stops.resetAll();
        this.state.stop = n;
        this.state.mode = 'approach';
        this.state.white = 0;
        this.player.visible = true;
        this.rig.snapToApproach(n, { immediate: true, preserveOrbit: false });
        this.update(0);
        this.render();
        return this.readState();
      },
      interact: (id, opts) => {
        this.action(id, opts);
        this.update(0);
        this.render();
        return this.readState();
      },
      advance: (seconds) => {
        this.clock.advance(seconds, (dt) => this.update(dt));
        this.render();
        return this.readState();
      },
      state: () => this.readState(),
      readState: () => this.readState(),
      shot: (n, memory = false) => this.shot(n, memory),
      start: () => this.begin(),
      leave: () => this.action('leave-' + this.state.stop),
      targets: () => this.targets(),
      mute: () => {
        this.audio.toggleMute();
        return this.audio.muted;
      },
      get time() {
        return this.time;
      },
    };
    Object.defineProperty(window, '__yokus', { value: api, writable: false });
  }
}

try {
  new YokusGame();
} catch (error) {
  document.body.dataset.error = 'true';
  const opening = document.querySelector('.opening-title');
  if (opening) opening.innerHTML = '<span>Yokuş</span><small>This browser could not open the village.</small>';
  throw error;
}
