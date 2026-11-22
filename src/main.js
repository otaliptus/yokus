import * as THREE from 'three';
import { GameClock, mulberry32, STOP_NAMES, clamp, lerp, V, C, ground, IS_MOBILE } from './palette.js';
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
      freekick: document.querySelector('#freekick-btn'),
      teaBtn: document.querySelector('#tea-btn'),
      breadBtn: document.querySelector('#bread-btn'),
      fkHud: document.querySelector('#fk-hud'),
      fkScore: document.querySelector('#fk-score'),
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
    this.ui.freekick?.addEventListener('click', () => this.startUnlimitedFreeKicks());
    this.ui.teaBtn?.addEventListener('click', () => this.startUnlimitedTea());
    this.ui.breadBtn?.addEventListener('click', () => this.startUnlimitedBread());
    this.ui.fkExit?.addEventListener('click', () => this.returnToDuskPanorama());
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

  startUnlimitedFreeKicks() {
    if (!this.started) this.begin();
    this.stops.resetAll();
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

  startUnlimitedTea() {
    if (!this.started) this.begin();
    this.stops.resetAll();
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

  startUnlimitedBread() {
    if (!this.started) this.begin();
    this.stops.resetAll();
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

  returnToDuskPanorama() {
    this.football.unlimitedMode = false;
    this.tea.unlimitedMode = false;
    this.bread.unlimitedMode = false;
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
    if (this.football.unlimitedMode) {
      const f = this.football;
      this.ui.fkScore.textContent = `goals ${f.goals} · streak ${f.streak}${f.bestStreak > 1 ? ` · best ${f.bestStreak}` : ''}`;
    } else if (this.tea.unlimitedMode) {
      const t = this.tea;
      const finished = Math.max(0, t.glasses - 1 + (t.sips >= 3 ? 1 : 0));
      this.ui.fkScore.textContent = `tea glasses ${finished} · total sips ${t.totalSips || 0}`;
    } else if (this.bread.unlimitedMode) {
      this.ui.fkScore.textContent = `loaves eaten ${this.bread.bites}`;
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
          const to = this.state.toStop;
          if (this.rig.updateWalk(dt)) {
            if (this.world.approachSpots?.[to]) this.enterApproach(to);
            else this.enterStop(to);
          }
        } else if (this.state.mode === 'approach') {
          this.rig.updateLook(dt, 'approach');
        } else if (this.state.mode === 'entering') {
          const to = this.state.toStop;
          if (this.rig.updateWalk(dt)) this.enterStop(to);
        } else if (this.state.mode === 'interact') {
          this.rig.updateLook(dt, 'interact');
          this.stops.update(dt);
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
