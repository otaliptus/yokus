import * as THREE from 'three';
export { RendererPipeline, CameraRig } from './pixel.js';
import { clamp, lerp, STOP_NAMES, riverCenterZ } from './palette.js';

export class InteractionSystem {
  constructor(game, canvas) {
    this.game = game;
    this.world = game.world;
    this.canvas = canvas;
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.cursor = { x: innerWidth * 0.5, y: innerHeight * 0.5, active: false };
    this.hovered = null;
    this.lastInput = game.time;
    this.pressed = null;
    this.draggingOrbit = false;
    this.pointerDown = false;
    this.downPos = null;
    this.touch = null;
    this.mouse = null;
    this.activeTouches = new Map();
    this.pinchDist = 0;
    this.hoverDirty = false;
    this.hoverFrame = 0;
    this.keys = new Set();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._groundHit = new THREE.Vector3();
    this.bind(canvas);
  }

  isFreeLookMode() {
    const m = this.game.state.mode;
    return m === 'walking' || m === 'approach' || m === 'arrival' || m === 'entering' || m === 'freeroam';
  }

  pickGroundPoint(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.game.camera.updateMatrixWorld();
    this.ray.setFromCamera(this.pointer, this.game.camera);
    this._groundPlane.constant = -(this.game.player?.position.y || 0);
    return this.ray.ray.intersectPlane(this._groundPlane, this._groundHit) ? this._groundHit.clone() : null;
  }

  enabled(id) {
    return this.game.started && !this.game.rig.walk && !this.game.rig.fixed && this.game.stops?.isEnabled(id);
  }

  updateHover(x, y) {
    this.hoverDirty = false;
    const id = this.pickId(x, y);
    this.hovered = id && this.enabled(id) ? id : null;
    const canDragLook = this.isFreeLookMode() || (this.game.state.memory && this.game.state.stop === 3);
    const canKickAnywhere =
      this.game.state.stop === 2 &&
      this.game.state.mode === 'interact' &&
      this.enabled('football-ball') &&
      this.game.football.phase === 'aim';
    const canReelAnywhere = this.game.state.stop === 3 && this.enabled('fish-reel');
    this.canvas.style.cursor = this.draggingOrbit
      ? 'grabbing'
      : this.hovered || canKickAnywhere || canReelAnywhere
      ? 'pointer'
      : canDragLook
      ? 'grab'
      : 'default';
  }

  update(dt) {
    // Only raycast hover when a mouse cursor is active (never burn CPU polling hover on touch screens!)
    if (this.cursor.active) {
      this.hoverFrame = (this.hoverFrame + 1) & 7;
      if (this.hoverDirty || this.hoverFrame === 0) {
        this.updateHover();
      }
    } else if (this.hovered) {
      this.hovered = null;
    }
    for (const item of this.world.interactables) {
      const active = this.enabled(item.id);
      const hot = item.id === this.hovered;
      item.hover = lerp(item.hover || 0, hot ? 1 : 0, 1 - Math.exp(-dt * 10));
      if (item.glow) {
        const pulse =
          active && item.id === this.game.stops.hint() && this.game.time - this.lastInput > 5
            ? 0.1 + 0.1 * Math.sin(this.game.time * 3.5)
            : 0;
        for (const m of item.meshes) {
          if (m.material?.emissive) {
            m.material.emissive.set('#e8aa52');
            m.material.emissiveIntensity = item.hover * 0.22 + pulse;
          }
        }
      }
    }
  }

  raycast(x, y) {
    if (x == null) {
      if (!this.cursor.active) return null;
      ({ x, y } = this.cursor);
    }
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.game.camera.updateMatrixWorld();
    const enabledMeshes = [];
    for (const item of this.world.interactables) {
      if (!this.enabled(item.id)) continue;
      item.root.updateWorldMatrix(true, false);
      enabledMeshes.push(...item.meshes);
    }
    if (!enabledMeshes.length) return null;
    this.ray.setFromCamera(this.pointer, this.game.camera);
    this.ray.near = this.game.camera.near;
    this.ray.far = this.game.camera.far;
    return this.ray.intersectObjects(enabledMeshes, false)[0] || null;
  }

  // Exact raycast first, then generous screen-space proximity fallback so clicks ALWAYS feel responsive!
  pickId(x, y) {
    const hit = this.raycast(x, y);
    if (hit) return hit.object.userData.interaction;
    if (x == null) {
      if (!this.cursor.active) return null;
      ({ x, y } = this.cursor);
    }
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const cam = this.game.camera;
    const box = this._box || (this._box = new THREE.Box3());
    const c = this._c || (this._c = new THREE.Vector3());
    const s = this._s || (this._s = new THREE.Vector3());
    let best = null;
    let bestScore = 1;

    for (const item of this.world.interactables) {
      if (!this.enabled(item.id)) continue;
      box.setFromObject(item.root);
      if (box.isEmpty()) continue;
      box.getCenter(c);
      box.getSize(s);
      const rWorld = Math.max(s.x, s.y, s.z) * 0.5;
      c.project(cam);
      if (c.z < -1 || c.z > 1) continue;
      const sx = rect.left + (c.x + 1) * 0.5 * rect.width;
      const sy = rect.top + (1 - c.y) * 0.5 * rect.height;
      const rPx = (rWorld / ((cam.top - cam.bottom) / cam.zoom)) * rect.height;
      const isNpc = item.id.startsWith('npc-');
      const reach = isNpc ? Math.max(24, rPx + 8) : Math.max(34, rPx + 22);
      const score = (Math.hypot(x - sx, y - sy) / reach) * (isNpc ? 1.35 : 1.0);
      if (score < bestScore) {
        bestScore = score;
        best = item.id;
      }
    }
    return best;
  }

  bind(canvas) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Smooth mouse-wheel zoom in & out!
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.game.started) return;
        e.preventDefault();
        const step = Math.exp(clamp(e.deltaY, -120, 120) * 0.0016);
        this.game.rig.adjustZoom(step);
        this.lastInput = this.game.time;
      },
      { passive: false }
    );

    canvas.addEventListener('pointermove', (e) => {
      const isTouch = e.pointerType === 'touch';
      this.cursor = { x: e.clientX, y: e.clientY, active: !isTouch };
      const freeLook = this.isFreeLookMode();

      // Two-finger pinch-to-zoom on mobile touchscreens!
      if (isTouch && this.activeTouches.has(e.pointerId)) {
        this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.activeTouches.size >= 2) {
          const pts = [...this.activeTouches.values()];
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (this.pinchDist > 8 && dist > 8) {
            this.game.rig.adjustZoom(this.pinchDist / dist);
          }
          this.pinchDist = dist;
          this.draggingOrbit = false;
          if (this.pressed === 'football-ball') this.game.action('charge-cancel');
          this.pressed = null;
          this.lastInput = this.game.time;
          return;
        }
      }

      // Live drag-from-ball free-kick aiming (both touch AND mouse!)
      if (this.pressed === 'football-ball') {
        this.game.action('charge-move', { cursor: { x: e.clientX, y: e.clientY }, isTouch });
        this.lastInput = this.game.time;
        return;
      }

      if (isTouch) {
        if (this.touch) {
          const dx = e.clientX - this.touch.x;
          const dy = e.clientY - this.touch.y;
          this.touch.distance += Math.abs(dx) + Math.abs(dy);
          if (this.touch.distance > 8 && (freeLook || !this.pressed || this.pressed.startsWith('enter-'))) {
            this.draggingOrbit = true;
            this.pressed = null;
          }
          if (this.draggingOrbit) this.game.rig.drag(dx, dy, freeLook);
          this.touch.x = e.clientX;
          this.touch.y = e.clientY;
          this.lastInput = this.game.time;
        }
      } else {
        if (this.pointerDown && !this.draggingOrbit && this.downPos) {
          const moved = Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y);
          // Smoothly transition into drag-to-look-around whenever dragging during walks, pauses, or empty space!
          if (moved > 7 && (freeLook || !this.pressed || this.pressed.startsWith('enter-'))) {
            this.draggingOrbit = true;
            this.pressed = null;
          }
        }
        if (this.draggingOrbit && this.mouse) {
          this.game.rig.drag(e.clientX - this.mouse.x, e.clientY - this.mouse.y, freeLook);
        }
        this.mouse = { x: e.clientX, y: e.clientY };
        this.lastInput = this.game.time;
        this.hoverDirty = true;
      }
    });

    canvas.addEventListener('pointerdown', (e) => {
      const isTouch = e.pointerType === 'touch';
      this.cursor = { x: e.clientX, y: e.clientY, active: !isTouch };
      this.mouse = { x: e.clientX, y: e.clientY };
      this.downPos = { x: e.clientX, y: e.clientY };
      this.pointerDown = true;
      this.lastInput = this.game.time;
      if (isTouch) {
        this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.activeTouches.size >= 2) {
          const pts = [...this.activeTouches.values()];
          this.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          this.draggingOrbit = false;
          if (this.pressed === 'football-ball') this.game.action('charge-cancel');
          this.pressed = null;
          return;
        }
        this.touch = { x: e.clientX, y: e.clientY, distance: 0 };
      }
      // Right-drag gently orbits the camera anytime
      if (e.button === 2) {
        this.pressed = null;
        this.draggingOrbit = true;
        canvas.setPointerCapture?.(e.pointerId);
        return;
      }
      // During walks/arrival (or desktop free roam), left-drag immediately looks around freely in 360°!
      if (
        this.game.state.mode === 'walking' ||
        this.game.state.mode === 'arrival' ||
        this.game.state.mode === 'entering' ||
        (this.game.state.mode === 'freeroam' && !isTouch)
      ) {
        this.pressed = null;
        this.draggingOrbit = true;
        canvas.setPointerCapture?.(e.pointerId);
        return;
      }
      // On touch during free roam, short tap walks there while dragging orbits 360°!
      if (this.game.state.mode === 'freeroam' && isTouch) {
        this.pressed = 'freeroam-tap';
        canvas.setPointerCapture?.(e.pointerId);
        return;
      }
      // During the river memory, left-drag orbits smoothly (and quick click after 8s moves on!)
      if (this.game.state.stop === 3 && this.game.river.seated && !this.game.river.memoryDone) {
        this.draggingOrbit = true;
        this.memoryDown = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture?.(e.pointerId);
        return;
      }

      const picked = this.pickId(e.clientX, e.clientY);
      this.pressed = picked;

      // Forgiving full-canvas actions for football kick & river bite reel (unless explicitly clicking leave or an NPC!)
      if (
        this.game.state.stop === 2 &&
        this.game.state.mode === 'interact' &&
        !picked?.startsWith('leave-') &&
        !picked?.startsWith('npc-') &&
        this.enabled('football-ball') &&
        this.game.football.phase === 'aim'
      ) {
        this.pressed = 'football-ball';
      }
      if (this.game.state.stop === 3 && !picked?.startsWith('leave-') && !picked?.startsWith('npc-') && this.enabled('fish-reel')) {
        this.pressed = 'fish-reel';
      }

      if (this.pressed === 'football-ball') {
        this.game.action('charge-start', { cursor: { x: e.clientX, y: e.clientY }, isTouch });
      }
      canvas.setPointerCapture?.(e.pointerId);
    });

    canvas.addEventListener('pointerup', (e) => {
      const isTouch = e.pointerType === 'touch';
      if (isTouch) {
        this.activeTouches.delete(e.pointerId);
        if (this.activeTouches.size < 2) this.pinchDist = 0;
      }
      this.cursor = { x: e.clientX, y: e.clientY, active: !isTouch };
      this.pointerDown = false;
      this.downPos = null;
      this.lastInput = this.game.time;

      if (this.draggingOrbit) {
        this.draggingOrbit = false;
        this.game.rig.releaseDrag(false);
        if (this.memoryDown && Math.hypot(e.clientX - this.memoryDown.x, e.clientY - this.memoryDown.y) < 10) {
          this.game.action('river-skip');
        }
        this.memoryDown = null;
        this.pressed = null;
        this.touch = null;
        if (!isTouch) this.hoverDirty = true;
        return;
      }

      const wasTouch = this.touch;
      if (this.pressed === 'freeroam-tap' && (!wasTouch || wasTouch.distance < 16)) {
        const pt = this.pickGroundPoint(e.clientX, e.clientY);
        if (pt) this.game.setFreeRoamTarget?.(pt.x, pt.z);
      } else if (this.pressed === 'football-ball') {
        this.game.action('shoot', { cursor: { x: e.clientX, y: e.clientY }, isTouch });
      } else if (this.pressed && (!wasTouch || wasTouch.distance < 16)) {
        this.game.action(this.pressed, { cursor: { x: e.clientX, y: e.clientY } });
      }
      this.pressed = null;
      this.touch = null;
      this.mouse = null;
      if (!isTouch) this.hoverDirty = true;
    });

    canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'touch') {
        this.activeTouches.delete(e.pointerId);
        if (this.activeTouches.size < 2) this.pinchDist = 0;
      }
      if (this.pressed === 'football-ball') this.game.action('charge-cancel');
      if (this.draggingOrbit) this.game.rig.releaseDrag(false);
      this.pressed = null;
      this.pointerDown = false;
      this.downPos = null;
      this.draggingOrbit = false;
      this.touch = null;
      this.mouse = null;
    });

    canvas.addEventListener('pointerleave', () => {
      if (!this.pressed && !this.draggingOrbit) {
        this.cursor.active = false;
        this.mouse = null;
        this.pointerDown = false;
        this.downPos = null;
        this.updateHover();
      }
    });

    addEventListener('keydown', (e) => {
      const low = e.key.toLowerCase();
      this.keys.add(e.code);
      this.keys.add(low);
      if (
        this.game.state.mode === 'freeroam' &&
        (e.code.startsWith('Arrow') ||
          e.code === 'Space' ||
          e.code === 'KeyW' ||
          e.code === 'KeyA' ||
          e.code === 'KeyS' ||
          e.code === 'KeyD')
      ) {
        e.preventDefault();
        this.lastInput = this.game.time;
      }
      const n = this.game.state.stop;
      if (this.game.started && this.game.state.mode !== 'freeroam' && (e.code === 'Space' || e.key === 'Enter')) {
        if (this.game.state.mode === 'approach' && this.enabled('enter-' + n)) {
          e.preventDefault();
          this.game.action('enter-' + n);
          return;
        }
        if (n === 3 && this.game.river.seated && !this.game.river.memoryDone && this.game.river.memoryTime >= 8) {
          e.preventDefault();
          this.game.action('river-skip');
          return;
        }
        if (this.game.stops.canLeave(n)) {
          e.preventDefault();
          this.game.action('leave-' + n);
        }
      }
      if (low === 'm') {
        this.game.audio.toggleMute();
        document.querySelector('#mute-mark')?.classList.toggle('on', this.game.audio.muted);
      }
      if (this.game.started && (e.key === '+' || e.key === '=')) {
        this.game.rig.adjustZoom(0.88);
      } else if (this.game.started && (e.key === '-' || e.key === '_')) {
        this.game.rig.adjustZoom(1.14);
      } else if (this.game.started && e.key === '0') {
        this.game.rig.setUserZoom(1.0);
      }
    });

    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.keys.delete(e.key.toLowerCase());
    });

    addEventListener('blur', () => {
      this.keys.clear();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.keys.clear();
    });
  }
}

// Cozy procedural Web Audio soundscape & tactile sound effects
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.amb = {};
    this.nextMurmur = 0;
    this.nextLark = 0;
    this.nextCrackle = 0;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.72;
    this.master.connect(this.ctx.destination);
    this.amb.wind = this.loopNoise(360, 0.03);
    this.amb.river = this.loopNoise(1350, 0);
    this.amb.fire = this.loopNoise(1600, 0);
  }

  loopNoise(freq, volume) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return g;
  }

  noiseBuffer(seconds = 0.5) {
    const b = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * seconds), this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.08) / 1.04;
      d[i] = last * 0.8 + (Math.random() * 2 - 1) * 0.2;
    }
    return b;
  }

  tone(freq = 440, dur = 0.12, gain = 0.08, type = 'sine', slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.04);
  }

  noise(dur = 0.15, freq = 1200, gain = 0.08, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    s.buffer = this.noiseBuffer(dur);
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.9;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
  }

  sfx(n) {
    switch (n) {
      case 'plop':
        this.tone(420, 0.12, 0.055, 'sine', -230);
        this.tone(240, 0.09, 0.035, 'sine', 160, 0.04);
        break;
      case 'clink':
        this.tone(2350, 0.16, 0.04, 'sine');
        this.tone(3420, 0.12, 0.02, 'sine', 0, 0.02);
        break;
      case 'sip':
        this.noise(0.32, 950, 0.032);
        break;
      case 'coins':
        this.tone(1920, 0.18, 0.045, 'sine');
        this.tone(2640, 0.22, 0.03, 'sine', 0, 0.06);
        this.tone(3120, 0.18, 0.02, 'sine', 0, 0.12);
        break;
      case 'kick':
        this.noise(0.14, 190, 0.18);
        this.tone(105, 0.18, 0.11, 'sine', -55);
        break;
      case 'clang':
        this.tone(540, 0.34, 0.085, 'triangle', -20);
        this.tone(1120, 0.28, 0.045, 'sine', -40, 0.01);
        this.noise(0.08, 1600, 0.05);
        break;
      case 'cheer':
        this.noise(0.75, 720, 0.048);
        this.tone(520, 0.28, 0.024, 'triangle', 180);
        this.tone(660, 0.32, 0.022, 'triangle', 220, 0.1);
        break;
      case 'groan':
        this.noise(0.5, 280, 0.035);
        this.tone(220, 0.35, 0.02, 'triangle', -65);
        break;
      case 'splash':
        this.noise(0.38, 1700, 0.07);
        this.tone(280, 0.14, 0.025, 'sine', -120);
        break;
      case 'reel':
        for (let i = 0; i < 4; i++) this.tone(1400 + i * 180, 0.04, 0.018, 'square', 0, i * 0.045);
        break;
      case 'fish':
        this.tone(580, 0.15, 0.035, 'sine', 240);
        this.tone(860, 0.18, 0.03, 'sine', 180, 0.08);
        break;
      case 'bite':
        this.noise(0.14, 1400, 0.07);
        this.noise(0.12, 900, 0.055, 0.09);
        break;
      case 'thump':
        this.tone(115, 0.15, 0.065, 'sine', -50);
        break;
      case 'purr':
        for (let i = 0; i < 3; i++) this.tone(64, 0.26, 0.032, 'triangle', 6, i * 0.22);
        break;
      case 'meow':
        this.tone(620, 0.16, 0.04, 'triangle', 220);
        this.tone(820, 0.2, 0.032, 'triangle', -260, 0.13);
        break;
      case 'murmur':
        this.noise(0.28, 320 + Math.random() * 140, 0.024);
        this.tone(130 + Math.random() * 65, 0.22, 0.015, 'triangle', (Math.random() - 0.5) * 40);
        break;
      case 'door':
        this.tone(190, 0.65, 0.028, 'sawtooth', -95);
        break;
      case 'page':
        this.noise(0.35, 2600, 0.04);
        break;
    }
  }

  update(game) {
    if (!this.ctx) return;
    if (game.state.mode === 'freeroam' && game.player) {
      const p = game.player.position;
      const rDist = Math.abs(p.z - riverCenterZ(p.x));
      const oDist = Math.hypot(p.x - 7.2, p.z + 28.0);
      this.amb.wind.gain.value = this.muted ? 0 : 0.024;
      this.amb.river.gain.value = this.muted ? 0 : clamp(1 - (rDist - 3.0) / 11.0, 0, 1) * 0.095;
      this.amb.fire.gain.value = this.muted ? 0 : clamp(1 - (oDist - 2.5) / 8.5, 0, 1) * 0.05;
      if (game.time > this.nextCrackle && oDist < 9.5) {
        this.nextCrackle = game.time + 0.6 + game.rng() * 1.4;
        this.noise(0.05, 2800 + game.rng() * 1400, 0.022);
      }
      if (game.time > this.nextLark) {
        this.nextLark = game.time + 8 + game.rng() * 12;
        this.tone(1950, 0.1, 0.012, 'sine', 420);
        this.tone(2420, 0.11, 0.01, 'sine', -260, 0.12);
      }
      return;
    }
    const stop = STOP_NAMES[game.state.stop];
    this.amb.wind.gain.value = this.muted ? 0 : stop === 'readingroom' || stop === 'ending' ? 0.01 : 0.026;
    this.amb.river.gain.value = this.muted ? 0 : stop === 'river' ? 0.1 : 0;
    this.amb.fire.gain.value = this.muted ? 0 : stop === 'bread' ? 0.055 : 0;

    if (game.time > this.nextMurmur && stop === 'teahouse' && !game.state.memory) {
      this.nextMurmur = game.time + 3.5 + game.rng() * 4.5;
      this.noise(0.55 + game.rng() * 0.5, 260 + game.rng() * 160, 0.022);
      this.tone(105 + game.rng() * 45, 0.4, 0.009, 'triangle');
    }
    if (game.time > this.nextCrackle && stop === 'bread') {
      this.nextCrackle = game.time + 0.5 + game.rng() * 1.4;
      this.noise(0.05, 2800 + game.rng() * 1400, 0.025);
    }
    if (game.time > this.nextLark && (stop === 'arrival' || stop === 'football' || stop === 'river' || stop === 'house')) {
      this.nextLark = game.time + 7 + game.rng() * 11;
      this.tone(1950, 0.1, 0.012, 'sine', 420);
      this.tone(2420, 0.11, 0.01, 'sine', -260, 0.12);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.72;
  }
}

export class MusicManager {
  constructor(game) {
    this.game = game;
    this.tracks = [];
    this.loaded = new Map();
    this.current = new Set();
    this.credits = [];
    this.ready = false;
    fetch('./audio/music/tracks.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((t) => {
        this.tracks = Array.isArray(t) ? t : [];
        this.credits = this.tracks.map((x) => x.credit).filter(Boolean);
        const el = document.querySelector('#music-credits');
        if (el) el.textContent = this.credits.length ? 'Music · ' + this.credits.join(' · ') : '';
        this.ready = true;
        this.setStop(this.pendingStop || (this.game.state.mode === 'freeroam' ? 'river' : STOP_NAMES[this.game.state.stop]));
      })
      .catch(() => {
        this.tracks = [];
        this.ready = true;
      });
  }

  setStop(name) {
    this.pendingStop = name;
    if (!this.ready) return;
    const matches = this.tracks.filter(
      (t) => t.use?.includes(name) || (name === 'arrival' && t.use?.includes('minibus'))
    );
    this.current = new Set(matches.map((t) => t.file));
    for (const t of matches) this.ensure(t);
    for (const [file, entry] of this.loaded) {
      if (!this.current.has(file)) entry.target = 0;
    }
  }

  ensure(t) {
    if (this.loaded.has(t.file)) {
      this.loaded.get(t.file).target = 1;
      return;
    }
    const a = new Audio('./audio/music/' + encodeURIComponent(t.file).replaceAll('%2F', '/'));
    a.loop = true;
    a.preload = 'auto';
    a.crossOrigin = 'anonymous';
    const e = { audio: a, t, target: 1, volume: 0, gain: null };
    this.loaded.set(t.file, e);
    if (t.diegetic && this.game.audio.ctx) {
      try {
        const src = this.game.audio.ctx.createMediaElementSource(a);
        const filter = this.game.audio.ctx.createBiquadFilter();
        const gain = this.game.audio.ctx.createGain();
        filter.type = 'bandpass';
        filter.frequency.value = t.use.includes('minibus') ? 1900 : 1250;
        filter.Q.value = 0.52;
        gain.gain.value = 0;
        src.connect(filter).connect(gain).connect(this.game.audio.master);
        e.gain = gain;
      } catch {
        a.volume = 0;
      }
    } else {
      a.volume = 0;
    }
    a.play().catch(() => {});
  }

  update(dt) {
    const duck = this.game.state.memory ? 0.28 : 1;
    for (const [file, e] of this.loaded) {
      const active = this.current.has(file);
      e.volume = lerp(e.volume, active ? e.target : 0, 1 - Math.exp(-dt * 0.8));
      let positional = e.t.volume ?? 0.44;
      if (e.t.diegetic) {
        const pos = e.t.use.includes('minibus')
          ? this.game.world.minibus.position
          : this.game.world.teahouse.position;
        positional = clamp(1 - this.game.camera.position.distanceTo(pos) / 42, 0.06, 0.45);
      }
      const v = e.volume * duck * positional;
      if (e.gain) e.gain.gain.value = this.game.audio.muted ? 0 : v;
      else e.audio.volume = clamp(this.game.audio.muted ? 0 : v, 0, 1);
      if (e.volume < 0.002 && !active) e.audio.pause();
      else if (active && e.audio.paused) e.audio.play().catch(() => {});
    }
  }
}
