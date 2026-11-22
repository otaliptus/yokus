import * as THREE from 'three';
import { V, ground, riverCenterZ, clamp, lerp, smooth } from './palette.js';
import { setPose, faceFigure, faceFigureSmooth, setHeadTarget, triggerAction, getHandWorldPos } from './figures.js';

const _handPos = new THREE.Vector3();
const _handPosL = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();

export class StopDirector {
  constructor(game) {
    this.game = game;
    this.resetAll();
  }

  resetAll() {
    const g = this.game;
    if (g.world?.wall?.length > 3) {
      for (const k of g.world.wall.splice(3)) g.world.scene.remove(k);
    }
    g.tea = {
      sips: 0,
      totalSips: 0,
      glasses: 1,
      unlimitedMode: false,
      sugar: 0,
      sugarInGlass: 0,
      activeSugarIdx: -1,
      stirred: 0,
      firstGlass: false,
      stage: 'idle', // 'idle' | 'sugar' | 'stir' | 'sip'
      stageTime: 0,
      displayFill: 1,
      sipStartFill: 1,
      sipTargetFill: 1,
      sugarDropped: false,
      clink1: false,
      clink2: false,
      clink3: false,
      sipSoundPlayed: false,
      setDownPlayed: false,
      rippleTime: 99,
      nextGlassAt: 0,
      refillPhase: 'none', // 'none' | 'toWall' | 'leaning' | 'toTable' | 'pickup' | 'place' | 'return'
      refillTime: 0,
      refillStart: null,
      patrolPhase: 'outside', // 'outside' | 'goingIn' | 'inside' | 'comingOut'
      patrolTime: 0,
      patrolWait: 2.6,
      wantLean: false,
      pickupSwapped: false,
      placeSwapped: false,
      nextIdleUncleAt: 3.0,
      uncleToastUntil: 0,
    };
    g.chat = {
      active: false,
      npcId: null,
      npcs: [],
      time: 0,
      duration: 0,
      stepIdx: -1,
      nextMurmurAt: 0,
      stop: -1,
      cycleCount: 0,
    };
    g.football = {
      shots: 0,
      postShots: 0,
      phase: 'aim', // 'aim' | 'charging' | 'runup' | 'flight' | 'reset' | 'jogback' | 'memory'
      charging: false,
      power: 0,
      chargeTime: 0,
      dragMode: null, // null | 'slingshot' | 'direct'
      dragMoved: false,
      dragCancelled: false,
      dragStartedNearBall: false,
      dragStart: null,
      dragWorldEnd: null,
      aimPoint: V(10.5 + 1.15, ground(10.5, 0.5) + 1.25, -6.3),
      netTime: 99,
      goals: 0,
      streak: 0,
      bestStreak: 0,
      unlimitedMode: false,
      lapRunner: null,
      wallJumped: false,
      wallChecked: false,
      keeperDived: false,
      keeperChecked: false,
      postChecked: false,
      blocked: false,
      flightTime: 0,
      runupTime: 0,
      jogTime: 0,
      kickTriggered: false,
      resetAt: 0,
      memoryTime: 0,
      memoryKicked: false,
      memoryWallJumped: false,
      memoryKeeperDived: false,
      memoryScored: false,
      afterMemory: false,
      memoryAt: 0,
      goal: false,
      velocity: V(),
      curve: 0,
      previousZ: 2.1,
    };
    g.river = {
      seated: false,
      walkingToStone: false,
      walkTime: 0,
      walkStart: null,
      memoryDone: false,
      memoryTime: 0,
      fishing: 'idle',
      castTime: 0,
      castStart: 0,
      biteAt: 0,
      biteDeadline: 0,
      holdingFish: false,
      droppingFish: false,
      dropTime: 0,
      catchArcTime: 99,
      flashTime: 99,
      rippleTime: 99,
      fish: 1, // Village kid's bucket already has 1 morning trout!
      caught: 0,
    };
    g.bread = {
      bites: 0,
      batchBites: 0,
      unlimitedMode: false,
      refilling: false,
      biteAnim: 0,
      handoverTime: 0,
      handedOver: false,
      memoryTime: 0,
      nextChatAt: 0,
      chatPhase: 0,
      hug: null,
    };
    g.house = {
      petting: null,
      petStart: 0,
      nextPurrAt: 0,
      petted: {},
      walkTo: null,
      whiteCatFled: false,
      whiteCatFlee: null,
      opening: false,
      doorPhase: 'none',
      doorTime: 0,
      doorStartPos: null,
    };
    g.reading = {
      book: false,
      bookTime: 0,
      playerStart: null,
      entering: false,
      enterTime: 0,
      enterStart: null,
    };
    g.ending = {
      time: 0,
      dissolved: false,
    };
  }

  enter(n) {
    const g = this.game;
    const w = g.world;
    g.state.memory = false;
    g.state.memoryStrength = 1;
    g.state.white = 0;
    g.ui.memory.classList.remove('on');
    g.ui.ending.classList.remove('visible');
    g.ui.endActions?.classList.remove('visible');
    if (n !== 2 || !g.football.unlimitedMode) {
      if (!(n === 1 && g.tea.unlimitedMode) && !(n === 4 && g.bread.unlimitedMode)) {
        g.ui.fkHud?.classList.remove('visible');
      }
    }
    this.stopChat();
    g.rig.snapToStop(n);
    g.state.mode = n === 7 ? 'ending' : 'interact';
    g.interactions.lastInput = g.time;

    if (n === 1) {
      for (const [i, u] of w.uncles.entries()) {
        u.userData.action = 'idle';
        u.userData.actionUntil = 0;
        setHeadTarget(u, null);
        if (w.uncleGlasses[i]) w.uncleGlasses[i].position.copy(w.uncleGlasses[i].userData.basePos);
      }
      w.teaGlass.visible = true;
      w.teaGlass.position.copy(w.teaGlassBase);
      w.teaGlass.rotation.set(0, 0, 0);
      w.servedGlass.visible = false;
      w.teaRipple.material.opacity = 0;
      w.spoon.position.copy(w.spoonBase);
      w.spoon.rotation.set(Math.PI * 0.5, 0.3, 0);
      w.cayci.visible = true;
      w.cayci.position.copy(w.cayciHome);
      setPose(w.cayci, 'stand', true);
      faceFigure(w.cayci, w.teaGlassBase);
      g.tea.patrolPhase = 'outside';
      g.tea.patrolTime = 0;
      g.tea.patrolWait = 2.6;
      g.tea.wantLean = false;
      if (w.cayciTray?.userData) {
        w.cayciTray.userData.freshGlass.visible = true;
        w.cayciTray.userData.usedGlass.visible = false;
      }
      for (const [i, s] of w.sugar.entries()) {
        s.visible = i >= g.tea.sugarInGlass;
        s.position.copy(s.userData.home);
        s.scale.setScalar(1);
      }
      g.tea.displayFill = clamp(1 - g.tea.sips * 0.31, 0.06, 1);
    }

    if (n === 2) {
      w.footballChild.visible = false;
      w.memoryWall.forEach((k) => (k.visible = false));
      w.memoryKeeper.visible = false;
      w.memoryKids.forEach((k) => (k.visible = false));
      g.player.visible = true;
      w.wall.forEach((k) => (k.visible = true));
      w.keeper.visible = true;
      w.pitchKids.forEach((k) => {
        k.visible = true;
        if (k.userData.homePos) k.position.copy(k.userData.homePos);
        setPose(k, 'stand', true);
      });
      g.football.lapRunner = null;
      this.resetBall(true);
    }

    if (n === 3) {
      // Rod & wooden bucket are ALREADY ready beside the sitting stone while the village kid sits on the left rock!
      w.rodPivot.visible = true;
      w.rodPivot.position.copy(g.river.seated ? w.rodHoldPos : w.rodRestPos);
      w.rodPivot.rotation.set(g.river.seated ? 0 : 0.14, 0, g.river.seated ? 0 : -0.08);
      w.fishingLine.visible = false;
      w.bobber.visible = false;
      w.rippleRing.visible = false;
      w.splash.visible = false;
      w.fishFlash.visible = g.river.holdingFish;
      w.friend.visible = false;
      if (w.riverChild) w.riverChild.visible = false;
      if (w.riverKid) {
        w.riverKid.visible = true;
        w.riverKid.position.copy(g.river.seated ? w.riverKidWatch : w.riverKidSeat);
        setPose(w.riverKid, g.river.seated ? 'stand' : 'sit', true);
        faceFigure(
          w.riverKid,
          g.river.seated
            ? w.riverSeatPos
            : V(w.riverKidSeat.x, w.riverY, riverCenterZ(w.riverKidSeat.x) - 2)
        );
        w.riverKid.userData.action = g.river.seated ? 'idle' : 'fish';
        w.riverKid.userData.actionUntil = g.river.seated ? 0 : Infinity;
        if (w.riverKidRod) w.riverKidRod.visible = !g.river.seated;
      }
      g.player.visible = true;
      w.setFishCount(g.river.fish);
    }

    if (n === 4) {
      w.youngAunt.visible = false;
      w.aunt.visible = true;
      if (w.auntHome) w.aunt.position.copy(w.auntHome);
      setPose(w.aunt, 'stand', true);
      g.bread.hug = null;
      if (w.breadChild) w.breadChild.visible = false;
      if (w.breadBitePiece) w.breadBitePiece.visible = false;
      w.bread.visible = true;
      w.bread.position.copy(w.breadBase);
      // 3 stacked loaves sit on the wooden courtyard table; top loaf (idx=2) is freshly served by Aunt on arrival!
      const remaining = Math.max(0, 3 - g.bread.bites);
      w.breadPieces.forEach((p, idx) => (p.visible = idx < remaining));
      if (g.bread.bites === 0 && !g.bread.handedOver) {
        g.bread.handoverTime = 0.01;
        w.breadPieces[2].visible = false;
        if (w.breadBitePiece) {
          w.breadBitePiece.visible = true;
          w.breadBitePiece.position.set(w.oven.position.x + 0.1, w.oven.position.y + 1.16, w.oven.position.z + 0.2);
        }
        faceFigure(w.aunt, w.oven.position);
        triggerAction(w.aunt, 'pull-bread', 1.8, g.time);
        g.player.userData.action = 'chat-listen';
        g.player.userData.actionUntil = g.time + 2.2;
      } else {
        g.bread.handedOver = true;
        g.bread.nextChatAt = g.time + 0.6;
        faceFigure(w.aunt, g.player.position);
        g.player.userData.action = 'idle';
        g.player.userData.actionUntil = 0;
      }
    }

    if (n === 5) {
      w.doorPivot.rotation.y = 0;
      g.house.walkTo = null;
      g.house.petting = null;
      g.house.opening = false;
      g.house.doorPhase = 'none';
      g.house.doorTime = 0;
      g.house.whiteCatFled = false;
      g.house.whiteCatFlee = null;
      for (const c of w.cats) {
        c.userData.pet = 0;
        c.userData.running = false;
        if (c.userData.homePos) c.position.copy(c.userData.homePos);
        if (c.userData.homeYaw != null) c.rotation.y = c.userData.homeYaw;
      }
    }

    if (n === 6) {
      w.chosenBook.visible = !g.reading.book;
      w.chosenBook.position.set(-1.11, w.houseY + 1.24, -51.25);
      w.openBook.visible = false;
      w.selfChild.visible = false;
      w.dede.visible = false;
      if (g.house.opening) {
        // Seamless indoor continuation right across the threshold into the sunlit reading room!
        g.house.opening = false;
        g.house.doorPhase = 'none';
        g.state.white = 0.52;
        g.reading.entering = true;
        g.reading.enterTime = 0;
        g.reading.enterStart = V(0, w.houseY + 0.16, -44.65);
        g.player.position.copy(g.reading.enterStart);
        setPose(g.player, 'walk', true);
        faceFigure(g.player, V(0, w.houseY + 1.2, -51.0));
      } else {
        g.reading.entering = false;
      }
    }

    if (n === 7) {
      g.ending.time = 0;
      g.ending.dissolved = false;
      w.chosenBook.visible = false;
      w.openBook.visible = true;
      w.selfChild.visible = false;
      g.player.visible = true;
      g.player.position.set(0, w.houseY + 0.34, -46.4);
      setPose(g.player, 'sit');
      faceFigure(g.player, V(0, w.houseY, -51));
      g.player.userData.action = 'read';
      g.player.userData.actionUntil = Infinity;

      w.dede.visible = true;
      w.dede.position.set(-3.1, w.houseY + 0.18, -46.5);
      setPose(w.dede, 'walk');
      faceFigure(w.dede, V(0, w.houseY, -46.4));
      g.rig.fixed = true;
    }

    g.music.setStop(
      ['arrival', 'teahouse', 'football', 'river', 'bread', 'house', 'readingroom', 'ending'][n]
    );
  }

  isEnabled(id) {
    const g = this.game;
    const n = g.state.stop;
    if (g.state.mode === 'approach') {
      return id === 'enter-' + n;
    }
    if (g.state.mode !== 'interact') return false;
    if (id.startsWith('leave-')) return this.canLeave(Number(id.split('-')[1]));

    if (n === 1) {
      const canUseTable = g.tea.refillPhase === 'none' || g.tea.refillPhase === 'toWall' || g.tea.refillPhase === 'leaning';
      if (id === 'tea-sugar') return g.tea.sugarInGlass < 2 && g.tea.sips < 3 && g.tea.stage === 'idle' && canUseTable;
      if (id === 'tea-stir') return g.tea.sips < 3 && g.tea.stage === 'idle' && canUseTable;
      if (id === 'sip') return g.tea.sips < 3 && g.tea.stage === 'idle' && canUseTable;
      if (id.startsWith('npc-uncle-')) return g.tea.stage === 'idle';
      if (id === 'npc-cayci') return g.tea.stage === 'idle' && g.world.cayci.visible;
      return false;
    }
    if (n === 2) {
      if (id === 'football-ball') return g.football.phase === 'aim' || g.football.phase === 'charging';
      if (id.startsWith('npc-pitchkid-')) return g.football.phase === 'aim';
      return false;
    }
    if (n === 3) {
      if (id === 'river-stone') return !g.river.seated && !g.river.walkingToStone;
      if (id === 'fish-bucket') return g.river.holdingFish && !g.river.droppingFish;
      if (id === 'fish-cast') return g.river.memoryDone && g.river.fishing === 'idle' && !g.river.holdingFish && !g.river.droppingFish;
      if (id === 'fish-reel') return g.river.fishing === 'bite';
      if (id === 'npc-riverkid') return (!g.river.seated || g.river.memoryDone) && !g.river.walkingToStone && !g.river.holdingFish && !g.river.droppingFish;
    }
    if (n === 4) {
      if (id === 'bread') return g.bread.handedOver && !g.bread.refilling && g.bread.batchBites < 3 && g.bread.memoryTime <= 0 && g.bread.biteAnim <= 0 && !g.bread.hug;
      if (id === 'npc-aunt') return g.bread.handedOver && !g.bread.refilling && g.bread.memoryTime <= 0 && g.bread.biteAnim <= 0 && !g.bread.hug;
    }
    if (n === 5) {
      if (id === 'cat-0') return false;
      if (id === 'cat-2') return !g.house.opening && !g.house.whiteCatFled;
      if (id.startsWith('cat-')) return !g.house.opening;
      if (id === 'blue-door') return !g.house.opening && Object.keys(g.house.petted).length > 0;
    }
    if (n === 6) {
      if (id === 'book') return !g.reading.book && !g.reading.entering;
      if (id.startsWith('npc-readkid-')) return !g.reading.book && !g.reading.entering;
    }
    return false;
  }

  canLeave(n) {
    const g = this.game;
    if (n === 1) return !g.tea.unlimitedMode && g.tea.firstGlass && g.tea.stage === 'idle';
    if (n === 2) return !g.football.unlimitedMode && g.football.afterMemory && (g.football.phase === 'aim' || g.football.phase === 'reset');
    if (n === 3) return g.river.memoryDone && !g.river.holdingFish && !g.river.droppingFish;
    if (n === 4) return !g.bread.unlimitedMode && g.bread.bites >= 3 && g.bread.memoryTime <= 0 && !g.bread.hug;
    return false;
  }

  hint() {
    const g = this.game;
    if (g.state.mode === 'approach') return 'enter-' + g.state.stop;
    switch (g.state.stop) {
      case 1:
        if (!g.tea.unlimitedMode && g.tea.firstGlass) return 'leave-1';
        return 'sip';
      case 2:
        if (!g.football.unlimitedMode && g.football.afterMemory) return 'leave-2';
        return g.football.phase === 'aim' ? 'football-ball' : null;
      case 3:
        if (!g.river.seated) return 'river-stone';
        if (!g.river.memoryDone) return null;
        if (g.river.holdingFish) return 'fish-bucket';
        if (g.river.fishing === 'bite') return 'fish-reel';
        if (g.river.caught === 0 && g.river.fishing === 'idle') return 'fish-cast';
        return 'leave-3';
      case 4:
        return g.bread.unlimitedMode || g.bread.bites < 3 ? 'bread' : 'leave-4';
      case 5:
        return Object.keys(g.house.petted).length ? 'blue-door' : 'cat-1';
      case 6:
        return g.reading.book ? null : 'book';
      default:
        return null;
    }
  }

  interact(id, opts = {}) {
    const g = this.game;
    const w = g.world;

    if (id.startsWith('enter-')) {
      const n = Number(id.split('-')[1]);
      if (g.state.mode === 'approach' && g.state.stop === n) {
        w.popInteractable(id);
        g.startEnterStop(n);
      }
      return;
    }

    if (id.startsWith('leave-')) {
      const n = Number(id.split('-')[1]);
      if (this.canLeave(n) && g.state.stop === n) {
        w.popInteractable(id);
        if (n === 3) {
          // Gently prop the borrowed rod back onto its wooden rest for the village kid!
          w.rodPivot.position.copy(w.rodRestPos);
          w.rodPivot.rotation.set(0.14, 0, -0.08);
          w.rodPivot.visible = true;
        }
        g.startWalkTo(n + 1);
      }
      return;
    }

    // CLICKING AUNT AT STOP 4 TRIGGERS A WARM FAMILY HUG & RETURN!
    if (id === 'npc-aunt' && g.state.stop === 4) {
      if (g.bread.handedOver && g.bread.memoryTime <= 0 && g.bread.biteAnim <= 0 && !g.bread.hug) {
        w.popInteractable(id);
        this.startAuntHug();
      }
      return;
    }

    // CLICKING ANY OTHER NPC TRIGGERS EXPRESSIVE HAND-GESTURE & MIMIC CONVERSATION!
    if (id.startsWith('npc-')) {
      w.popInteractable(id);
      this.startChat(id);
      return;
    }

    // STOP 1: TEA HOUSE — optional sugar cubes, optional spoon stirring, slow cozy 3-sip drinking & çaycı wall-lean refill!
    if (g.state.stop === 1) {
      const t = g.tea;
      const canUseTable = t.refillPhase === 'none' || t.refillPhase === 'toWall' || t.refillPhase === 'leaning';
      if (id === 'tea-sugar' && t.sugarInGlass < 2 && t.sips < 3 && t.stage === 'idle' && canUseTable) {
        this.stopChat();
        w.popInteractable('tea-sugar');
        t.activeSugarIdx = t.sugarInGlass;
        t.sugarInGlass++;
        t.sugar++;
        t.stage = 'sugar';
        t.stageTime = 0;
        t.sugarDropped = false;
        triggerAction(g.player, 'reach-sugar', 1.05, g.time);
        return;
      }

      if (id === 'tea-stir' && t.sips < 3 && t.stage === 'idle' && canUseTable) {
        this.stopChat();
        w.popInteractable('tea-stir');
        t.stirred++;
        t.stage = 'stir';
        t.stageTime = 0;
        t.clink1 = false;
        t.clink2 = false;
        t.clink3 = false;
        triggerAction(g.player, 'stir', 1.45, g.time);
        return;
      }

      if (id === 'sip' && t.sips < 3 && t.stage === 'idle' && canUseTable) {
        this.stopChat();
        w.popInteractable('sip');
        t.sips++;
        t.totalSips = (t.totalSips || 0) + 1;
        t.sipStartFill = t.displayFill;
        t.sipTargetFill = clamp(1 - t.sips * 0.31, 0.06, 1);
        t.sipSoundPlayed = false;
        t.setDownPlayed = false;
        t.stage = 'sip';
        t.stageTime = 0;
        // Slow, unhurried savouring tea drink animation (2.85s)!
        triggerAction(g.player, 'sip', 2.85, g.time);
        g.updateModeHud?.();
        return;
      }
    }

    // STOP 2: CLEAN DRAG-FROM-BALL FREE KICKS (pull back like a slingshot OR drag straight onto the goal; slide back to cancel!)
    if (g.state.stop === 2) {
      if (id === 'charge-start' && g.football.phase === 'aim') {
        const f = g.football;
        f.phase = 'charging';
        f.charging = true;
        f.power = 0.66;
        f.chargeTime = 0;
        f.dragMode = null;
        f.dragMoved = false;
        f.dragCancelled = false;
        f.dragStartedNearBall = false;
        f.dragStart = opts.cursor ? { ...opts.cursor } : null;
        f.dragWorldEnd = null;
        if (opts.cursor) this.updateBallDrag(opts.cursor, true, !!opts.isTouch);
        triggerAction(g.player, 'windup', 12, g.time);
        return;
      }
      if (id === 'charge-move' && g.football.phase === 'charging') {
        if (opts.cursor) this.updateBallDrag(opts.cursor, false, !!opts.isTouch);
        return;
      }
      if (id === 'charge-cancel') {
        if (g.football.phase === 'charging') g.football.phase = 'aim';
        g.football.charging = false;
        g.football.dragMode = null;
        g.football.dragMoved = false;
        g.football.dragCancelled = false;
        g.football.dragWorldEnd = null;
        g.player.userData.action = 'idle';
        g.player.userData.actionUntil = 0;
        return;
      }
      if (id === 'shoot' || id === 'football-ball') {
        const f = g.football;
        if (f.phase === 'charging') {
          if (opts.cursor && !opts.aim) {
            this.updateBallDrag(opts.cursor, false, !!opts.isTouch);
          }
          if (f.dragCancelled && !opts.aim) {
            f.phase = 'aim';
            f.charging = false;
            f.dragMode = null;
            f.dragMoved = false;
            f.dragCancelled = false;
            f.dragWorldEnd = null;
            g.player.userData.action = 'idle';
            g.player.userData.actionUntil = 0;
            return;
          }
          const wasDragged = !!f.dragMoved || !!f.dragMode;
          f.dragMode = null;
          f.dragMoved = false;
          f.dragCancelled = false;
          f.dragWorldEnd = null;
          this.beginRunup(wasDragged ? { ...opts, dragged: true } : opts);
        } else if (f.phase === 'aim') {
          this.beginRunup(opts);
        }
        return;
      }
    }

    // STOP 3: RIVER FISHING — take over ready rod from village kid, catch trout & drop into bucket!
    if (g.state.stop === 3) {
      if (id === 'river-stone' && !g.river.seated && !g.river.walkingToStone) {
        w.popInteractable('river-stone');
        // Slow smooth walk right up onto the mossy sitting boulder (ZERO teleport!)
        g.river.walkingToStone = true;
        g.river.walkTime = 0;
        g.river.walkStart = g.player.position.clone();
        setPose(g.player, 'walk');
        // Village kid on left rock looks over and waves warmly, welcoming you to take over!
        if (w.riverKid) {
          setHeadTarget(w.riverKid, g.player.position, 0.9);
          triggerAction(w.riverKid, 'wave', 1.4, g.time);
        }
        return;
      }
      if (id === 'river-skip' && g.river.seated && !g.river.memoryDone && g.river.memoryTime >= 8) {
        this.endRiverMemory();
        return;
      }
      if (id === 'fish-cast' && g.river.memoryDone && g.river.fishing === 'idle' && !g.river.holdingFish && !g.river.droppingFish) {
        this.castAt(opts.cursor);
        g.river.fishing = 'casting';
        g.river.castTime = 0;
        g.river.castStart = g.time;
        w.fishingLine.visible = true;
        w.bobber.visible = true;
        w.splash.visible = false;
        triggerAction(g.player, 'cast', 0.95, g.time);
        g.audio.sfx('reel');
        return;
      }
      if (id === 'fish-reel' && g.river.fishing === 'bite') {
        g.audio.sfx('reel');
        g.audio.sfx('splash');
        g.audio.sfx('fish');
        triggerAction(g.player, 'reel', 0.72, g.time);
        g.river.fishing = 'idle';
        g.river.holdingFish = true;
        g.river.catchArcTime = 0;
        w.fishFlash.visible = true;
        w.splash.visible = false;
        w.rippleRing.visible = false;
        w.fishingLine.visible = false;
        w.bobber.visible = false;
        w.spawnPuff(w.castTarget, 14, '#eef8fc');
        return;
      }
      if (id === 'fish-bucket' && g.river.holdingFish && !g.river.droppingFish) {
        w.popInteractable('fish-bucket');
        g.river.droppingFish = true;
        g.river.dropTime = 0;
        triggerAction(g.player, 'drop-bucket', 0.95, g.time);
        return;
      }
    }

    // STOP 4: TANDIR BREAD COURTYARD — seated at the table, eat unlimited blistered flatbreads while chatting with Aunt!
    if (g.state.stop === 4 && id === 'bread' && g.bread.handedOver && !g.bread.refilling && g.bread.batchBites < 3 && g.bread.memoryTime <= 0 && g.bread.biteAnim <= 0) {
      this.stopChat();
      w.popInteractable('bread');
      g.bread.bites++;
      g.bread.batchBites++;
      g.bread.biteAnim = 0.01;
      const showMemory = !g.bread.unlimitedMode && g.bread.bites <= 3;
      g.bread.memoryTime = showMemory ? 1.65 : 0;
      // Eat from the top of the 3-loaf stack on the table (idx 2 -> 1 -> 0)!
      const eatenIdx = 3 - g.bread.batchBites;
      if (w.breadPieces[eatenIdx]) w.breadPieces[eatenIdx].visible = false;
      if (w.breadBitePiece) {
        w.breadBitePiece.visible = true;
        w.breadBitePiece.position.copy(w.breadBase).add(V(0, eatenIdx * 0.052 + 0.04, 0));
      }
      triggerAction(g.player, 'tear-eat', 1.55, g.time);
      w.spawnPuff(w.breadBase.clone().add(V(0, 0.14, 0)), 14, '#f0d088');
      g.audio.sfx('bite');
      g.audio.sfx('thump');
      if (showMemory) {
        g.setMemory(true, 0.56);
        w.aunt.visible = false;
        w.youngAunt.visible = true;
        g.player.visible = false;
        if (w.breadChild) {
          w.breadChild.visible = true;
          triggerAction(w.breadChild, 'tear-eat', 1.55, g.time);
        }
      }
      if (g.bread.batchBites >= 3) {
        triggerAction(w.aunt, 'chat-laugh', 2.4, g.time + (showMemory ? 1.65 : 0.2));
      }
      g.updateModeHud?.();
      return;
    }

    // STOP 5: GREAT-GRANDFATHER'S HOUSE — single click to sit & pet cats from the side; foreground white cat runs behind the house!
    if (g.state.stop === 5) {
      if (id === 'pet-start' || id.startsWith('cat-')) {
        const catId = id === 'pet-start' ? opts.id : id;
        const idx = Number(catId?.split('-')[1]) || 0;
        const cat = w.cats[idx];
        if (!cat || cat.userData.angry) return;
        if (idx === 2 && g.house.whiteCatFled) return;
        w.popInteractable(catId);

        // Stop petting any previous cat cleanly before walking over!
        for (const [ci, c] of w.cats.entries()) {
          if (ci !== idx) c.userData.pet = 0;
        }

        // Aloof white cat (idx === 2) in the foreground: walk over toward it -> bolts behind the house as a joke!
        if (idx === 2) {
          g.house.petting = null;
          const approachSpot = cat.position.clone().add(V(-0.85, 0, 0.18));
          approachSpot.y = w.houseY + 0.08;
          const dist = g.player.position.distanceTo(approachSpot);
          if (dist < 0.95) {
            this.triggerWhiteCatFlee();
          } else {
            g.house.walkTo = {
              kind: 'whitecat',
              catId,
              start: g.player.position.clone(),
              target: approachSpot,
              lookAt: cat.position.clone(),
              time: 0,
              duration: clamp(dist / 1.45, 0.65, 2.0),
            };
            setPose(g.player, 'walk');
          }
          return;
        }

        // Single click & sit petting (NO press-and-hold required!)
        g.house.petting = catId;
        g.house.petStart = g.time;
        g.house.nextPurrAt = g.time + 2.6;
        g.house.petted[catId] = true;
        cat.userData.pet = 1;
        // Walk cleanly to the SIDE of each cat so the camera sees the player sitting & stroking in clear side profile!
        const petOffset = idx === 0 ? V(0.76, 0, 0.14) : V(-0.76, 0, 0.14);
        const petSpot = cat.position.clone().add(petOffset);
        petSpot.y = w.houseY + 0.08;
        const dist = g.player.position.distanceTo(petSpot);
        if (dist > 0.25) {
          g.house.walkTo = {
            kind: 'cat',
            catId,
            start: g.player.position.clone(),
            target: petSpot,
            lookAt: cat.position.clone(),
            time: 0,
            duration: clamp(dist / 1.35, 0.85, 2.3),
          };
          setPose(g.player, 'walk');
        } else {
          g.house.walkTo = null;
          setPose(g.player, 'sit-pet');
        }
        w.spawnPuff(cat.position.clone().add(V(0, 0.45, 0)), 10, '#ffe49e');
        g.audio.sfx('purr');
        return;
      }
      if (id === 'blue-door' && !g.house.opening && Object.keys(g.house.petted).length > 0) {
        w.popInteractable('blue-door');
        // Stand up cleanly from any cat petting before walking inside!
        if (g.house.petting) {
          const prevCat = w.cats[Number(g.house.petting.split('-')[1])];
          if (prevCat) prevCat.userData.pet = 0;
          g.house.petting = null;
        }
        g.house.opening = true;
        g.house.doorPhase = 'walk-to-steps';
        g.house.doorTime = 0;
        const stepsFoot = V(0, w.houseY + 0.08, -42.88);
        const dist = g.player.position.distanceTo(stepsFoot);
        g.house.walkTo = {
          kind: 'door',
          start: g.player.position.clone(),
          target: stepsFoot,
          lookAt: V(0, w.houseY + 1.4, -48),
          time: 0,
          duration: clamp(dist / 1.32, 0.55, 2.1),
        };
        setPose(g.player, 'walk');
        return;
      }
    }

    // STOP 6: READING ROOM
    if (g.state.stop === 6 && id === 'book' && !g.reading.book) {
      w.popInteractable('book');
      g.reading.book = true;
      g.reading.bookTime = 0;
      g.reading.playerStart = g.player.position.clone();
      g.audio.sfx('page');
      w.spawnPuff(w.chosenBook.position, 12, '#ffe89e');
      return;
    }
  }

  // --- SHARED TRUE-PHYSICS FREE-KICK KINEMATICS (100% WYSIWYG — ball hits exact aim ring!) ---
  computeKick(aimPoint, power) {
    const w = this.game.world;
    const ballPos = w.ballSpot;
    const gx = w.goal.position.x;
    const gy = w.goal.position.y;
    const gz = w.goal.position.z;
    const p = clamp(power, 0.2, 1.0);

    // Power cleanly drives shot speed & whip — ZERO hidden overLift surprise!
    const flightEst = lerp(0.92, 0.56, p);
    const targetX = aimPoint.x;
    const targetY = clamp(aimPoint.y, gy + 0.25, gy + 3.2);

    // Natural Magnus banana curve bending cleanly around the wall into the aimed corner!
    const offsetFromCenter = targetX - gx;
    const curve = clamp(-offsetFromCenter * 2.1, -4.4, 4.4);

    // Solve exact initial velocity (with gentle air-drag compensation)
    const dragBoost = 1.075;
    const vx = ((targetX - ballPos.x - 0.5 * curve * flightEst * flightEst) / flightEst) * dragBoost;
    const vz = ((gz - ballPos.z) / flightEst) * dragBoost;
    const vy = ((targetY - ballPos.y + 0.5 * 9.81 * flightEst * flightEst) / flightEst) * 1.035;

    return { velocity: V(vx, vy, vz), curve, flightEst, targetX, targetY };
  }

  // Clean, zero-flip drag-from-ball aiming (smooth on both mobile & desktop!):
  // - Pull BACK/DOWN from the ball -> locks 'slingshot' (pull back-left to bend top-right; slide back to ball to cancel!)
  // - Drag UPWARD from the ball -> locks 'direct' (guide the green ring directly onto any goal corner!)
  // - Quick tap on the goal -> shoots crisp curling freekick right at the tapped corner!
  updateBallDrag(cursor, isStart = false, isTouch = false) {
    const g = this.game;
    const w = g.world;
    const f = g.football;
    if (!cursor) return;

    const rect = g.pipeline.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const gx = w.goal.position.x;
    const gy = w.goal.position.y;
    const gz = w.goal.position.z;

    // Project ball spot to screen pixels
    const bProj = w.ballSpot.clone().project(g.camera);
    const bx = rect.left + (bProj.x + 1) * 0.5 * rect.width;
    const by = rect.top + (1 - bProj.y) * 0.5 * rect.height;

    if (isStart) {
      f.dragStart = { x: cursor.x, y: cursor.y };
      const distToBall = Math.hypot(cursor.x - bx, cursor.y - by);
      f.dragStartedNearBall = distToBall <= 115 || cursor.y >= by - 48;
      if (f.dragStartedNearBall) {
        // Wait for an intentional drag >14px so accidental taps on the ball don't dribble into the wall!
        f.dragCancelled = true;
        f.dragWorldEnd = null;
      } else {
        // Direct tap/drag up near the goal area aims straight at the tapped spot!
        f.dragMode = 'direct';
        f.dragCancelled = false;
        this.aimAt(isTouch ? { x: cursor.x, y: cursor.y - 26 } : cursor);
        const hf = clamp((f.aimPoint.y - gy) / 2.0, 0, 1);
        f.power = clamp(0.58 + hf * 0.24, 0.58, 0.82);
        f.dragWorldEnd = null;
      }
      return;
    }

    const start = f.dragStart || { x: bx, y: by };
    const dx = cursor.x - start.x;
    const dy = cursor.y - start.y;
    const dist = Math.hypot(dx, dy);

    if (f.dragStartedNearBall) {
      // Sliding back onto the ball cleanly cancels the shot!
      if (dist < 14) {
        f.dragCancelled = true;
        f.dragWorldEnd = null;
        return;
      }
      // Lock direction ONCE on first intentional drag -> NEVER flips left/right mid-drag!
      if (!f.dragMode) {
        f.dragMode = dy < -16 ? 'direct' : 'slingshot';
      }
      f.dragMoved = true;
      f.dragCancelled = false;
    } else {
      f.dragMode = 'direct';
      f.dragMoved = true;
      f.dragCancelled = false;
    }

    if (f.dragMode === 'slingshot') {
      const minDim = Math.max(260, Math.min(rect.width, rect.height));
      const maxPull = clamp(minDim * 0.28, 82, 165);
      const pullY = Math.max(0, dy);
      const pullDist = Math.hypot(dx, pullY);
      const pullNorm = clamp((pullDist - 12) / Math.max(40, maxPull - 12), 0, 1.15);

      const aimX = gx + clamp((-dx / maxPull) * 3.05, -2.9, 2.9);
      const aimY = gy + clamp(0.38 + Math.pow(pullNorm, 0.92) * 1.68, 0.35, 2.38);
      f.power = clamp(0.45 + clamp(pullNorm, 0, 1) * 0.42, 0.45, 0.87);
      f.aimPoint = V(aimX, aimY, gz);

      // Crisp world-space slingshot pullback handle behind the ball!
      const wx = clamp((dx / maxPull) * 2.1, -2.2, 2.2);
      const wz = clamp((pullY / maxPull) * 2.2, 0.08, 2.3);
      f.dragWorldEnd = V(w.ballSpot.x + wx, w.pitchCenter.y + 0.14, w.ballSpot.z + wz);
    } else {
      // Direct drag toward the goal: aim ring smoothly follows pointer (offset slightly above thumb on touch!)
      this.aimAt(isTouch ? { x: cursor.x, y: cursor.y - 28 } : cursor);
      const hf = clamp((f.aimPoint.y - gy) / 2.0, 0, 1);
      f.power = clamp(0.56 + hf * 0.26, 0.56, 0.82);
      f.dragWorldEnd = null;
    }
  }

  aimAt(cursor) {
    const g = this.game;
    const f = g.football;
    const gz = g.world.goal.position.z;
    const gy = g.world.goal.position.y;
    const gx = g.world.goal.position.x;
    if (!cursor) {
      f.aimPoint = V(gx + 0.9, gy + 1.35, gz);
      return f.aimPoint;
    }
    const rect = g.pipeline.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((cursor.x - rect.left) / rect.width) * 2 - 1,
      -((cursor.y - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, g.camera);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -gz), hit)) {
      hit.x = clamp(hit.x, gx - 3.4, gx + 3.4);
      hit.y = clamp(hit.y, gy + 0.25, gy + 2.65);
      f.aimPoint = hit;
    }
    return f.aimPoint;
  }

  castAt(cursor) {
    const g = this.game;
    const w = g.world;
    const sx = w.riverSeatPos.x;
    const rcz = riverCenterZ(sx);
    if (cursor) {
      const rect = g.pipeline.renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((cursor.x - rect.left) / rect.width) * 2 - 1,
        -((cursor.y - rect.top) / rect.height) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(pointer, g.camera);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -w.riverY), hit)) {
        w.castTarget.x = clamp(hit.x, sx - 2.6, sx + 1.9);
        w.castTarget.z = clamp(hit.z, rcz - 1.5, rcz + 1.4);
      }
    }
    w.castTarget.y = w.riverY + 0.04;
    w.bobber.position.copy(w.castTarget);
    return w.castTarget;
  }

  beginRunup(opts = {}) {
    const g = this.game;
    const f = g.football;
    if (f.phase !== 'charging' && f.phase !== 'aim') return;
    if (opts.cursor && !opts.dragged && !f.dragMoved) this.aimAt(opts.cursor);
    f.pendingOpts = opts;
    f.phase = 'runup';
    f.charging = false;
    f.runupTime = 0;
    f.kickTriggered = false;
    f.runupStart = g.player.position.clone();
    setPose(g.player, 'jog');
    g.player.userData.action = 'idle';
    g.player.userData.actionUntil = 0;
  }

  launchBall(opts = {}) {
    const g = this.game;
    const w = g.world;
    const f = g.football;

    g.audio.sfx('kick');
    w.spawnPuff(w.ball.position, 14, '#e6c486');

    f.shots++;
    if (f.afterMemory) f.postShots++;
    f.phase = 'flight';
    f.flightTime = 0;
    f.goal = false;
    f.blocked = false;
    f.wallJumped = false;
    f.wallChecked = false;
    f.keeperDived = false;
    f.keeperChecked = false;
    f.postChecked = false;
    f.netTime = 99;

    const aim = f.aimPoint ? f.aimPoint.clone() : V(w.goal.position.x + 0.9, w.goal.position.y + 1.35, w.goal.position.z);
    if (Array.isArray(opts.aim)) {
      aim.set(w.goal.position.x + opts.aim[0] * 3.0, w.goal.position.y + 1.2 + opts.aim[1] * 1.4, w.goal.position.z);
    }
    const power = clamp(opts.power ?? (f.power || 0.62), 0.15, 1.0);
    const kin = this.computeKick(aim, power);
    f.velocity.copy(kin.velocity);
    f.curve = kin.curve + (opts.curve || 0);
    f.targetX = kin.targetX;
    f.previousZ = w.ball.position.z;
  }

  resetBall(immediate = false) {
    const g = this.game;
    const w = g.world;
    const f = g.football;
    w.ball.visible = true;
    w.ball.position.copy(w.ballSpot);
    w.ball.scale.setScalar(1);
    f.phase = 'aim';
    f.charging = false;
    f.power = 0;
    f.dragMode = null;
    f.dragMoved = false;
    f.dragCancelled = false;
    f.dragWorldEnd = null;
    f.flightTime = 0;
    f.goal = false;
    f.blocked = false;
    f.velocity.set(0, 0, 0);

    w.wall.forEach((k) => {
      k.position.y = w.pitchCenter.y;
      k.scale.setScalar(1);
      k.userData.action = 'idle';
      k.userData.actionUntil = 0;
      setHeadTarget(k, null);
      faceFigure(k, w.ballSpot);
    });
    w.pitchKids.forEach((k) => {
      if (f.lapRunner?.kid === k) return;
      k.userData.action = 'idle';
      k.userData.actionUntil = 0;
      faceFigure(k, w.ballSpot);
    });
    w.keeper.position.set(w.pitchCenter.x, w.pitchCenter.y, -5.8);
    w.keeper.rotation.set(0, 0, 0);
    faceFigure(w.keeper, w.ballSpot);
    setPose(w.keeper, 'stand', immediate);
    w.keeper.userData.action = 'keeper-ready';
    w.keeper.userData.actionUntil = Infinity;

    if (immediate) {
      g.player.position.copy(w.playerSpots[2].pos);
      setPose(g.player, 'stand', true);
      faceFigure(g.player, w.goal.position);
    }
    g.player.userData.action = 'idle';
    g.player.userData.actionUntil = 0;
  }

  startFootballMemory() {
    const g = this.game;
    const w = g.world;
    const f = g.football;
    f.phase = 'memory';
    f.memoryTime = 0;
    f.memoryKicked = false;
    f.memoryWallJumped = false;
    f.memoryKeeperDived = false;
    f.memoryScored = false;
    g.state.white = 0.85; // Warm overexposure bloom into childhood memory!
    g.setMemory(true, 1.0);

    // Hide adult player & present-day kids -> swap to CHILDHOOD PLAYER & childhood match!
    g.player.visible = false;
    w.wall.forEach((k) => (k.visible = false));
    w.keeper.visible = false;
    w.pitchKids.forEach((k) => (k.visible = false));

    const fy = w.pitchCenter.y;
    const cx = w.pitchCenter.x;
    w.ball.position.copy(w.ballSpot);

    w.footballChild.visible = true;
    w.footballChild.position.set(cx - 0.75, fy, 3.55);
    setPose(w.footballChild, 'jog', true);
    faceFigure(w.footballChild, w.ballSpot);
    w.footballChild.userData.action = 'idle';
    w.footballChild.userData.actionUntil = 0;

    w.memoryWall.forEach((k, i) => {
      k.visible = true;
      k.position.set(cx - 0.72 + i * 0.72, fy, -1.6);
      setPose(k, 'stand', true);
      faceFigure(k, w.ballSpot);
      setHeadTarget(k, null);
      k.userData.action = 'idle';
      k.userData.actionUntil = 0;
    });

    w.memoryKeeper.visible = true;
    w.memoryKeeper.position.set(cx, fy, -5.8);
    setPose(w.memoryKeeper, 'stand', true);
    faceFigure(w.memoryKeeper, w.ballSpot);
    w.memoryKeeper.userData.action = 'keeper-ready';
    w.memoryKeeper.userData.actionUntil = Infinity;

    w.memoryKids.forEach((k) => {
      k.visible = true;
      k.position.copy(k.userData.memoryHome);
      setPose(k, 'stand', true);
      faceFigure(k, w.ballSpot);
      k.userData.action = 'idle';
      k.userData.actionUntil = 0;
    });
  }

  startRiverMemory() {
    const g = this.game;
    const w = g.world;
    const r = g.river;
    r.seated = true;
    r.walkingToStone = false;
    r.memoryTime = 0;
    g.state.white = 0.8; // Warm overexposure bloom!
    g.setMemory(true, 1.0);

    // Swap to childhood player sitting side-by-side with childhood friend during river memory!
    g.player.position.copy(w.riverSeatPos);
    setPose(g.player, 'sit');
    faceFigure(g.player, V(w.riverSeatPos.x, w.riverY, riverCenterZ(w.riverSeatPos.x) - 2.5));
    g.player.userData.action = 'fish';
    g.player.userData.actionUntil = Infinity;
    g.player.visible = false;
    if (w.riverChild) {
      w.riverChild.visible = true;
      setPose(w.riverChild, 'sit', true);
    }
    if (w.riverKid) w.riverKid.visible = false;

    w.rodPivot.visible = true;
    w.rodPivot.position.copy(w.rodHoldPos);
    w.rodPivot.rotation.set(0, 0, 0);
    w.friend.visible = true;
    w.friend.userData.action = 'fish';
    w.friend.userData.actionUntil = Infinity;
    w.setFishCount(3);

    g.rig.baseTarget.copy(w.bucket.position).add(V(0.5, 0.25, -0.6));
  }

  endRiverMemory() {
    const g = this.game;
    const w = g.world;
    const r = g.river;
    if (r.memoryDone) return;
    r.memoryDone = true;
    g.state.white = 0.7;
    g.setMemory(false);
    w.friend.visible = false;
    if (w.riverChild) w.riverChild.visible = false;
    g.player.visible = true;
    // Present-day village kid stands warmly nearby watching you fish with their spare rod!
    if (w.riverKid) {
      w.riverKid.visible = true;
      w.riverKid.position.copy(w.riverKidWatch);
      setPose(w.riverKid, 'stand', true);
      faceFigure(w.riverKid, w.riverSeatPos);
      w.riverKid.userData.action = 'idle';
      w.riverKid.userData.actionUntil = 0;
      if (w.riverKidRod) w.riverKidRod.visible = false;
    }
    w.setFishCount(r.fish);
    g.rig.baseTarget.copy(w.stopViews[3].target);
  }

  update(dt) {
    const g = this.game;
    const w = g.world;

    // Ease white transition flash back to 0 during normal play
    if (g.state.mode !== 'ending' && g.state.white > 0) {
      g.state.white = Math.max(0, g.state.white - dt * 1.3);
    }

    if (g.state.mode === 'ending') {
      this.updateEnding(dt);
      return;
    }
    if (g.state.mode !== 'interact') return;

    if (g.state.stop === 1) this.updateTea(dt);
    if (g.state.stop === 2) this.updateFootball(dt);
    if (g.state.stop === 3) this.updateRiver(dt);
    this.updateChat(dt);

    // STOP 4: SEATED AT COURTYARD BREAD TABLE — AUNT SERVES FROM TANDIR -> EAT 3 FLATBREADS WHILE CHATTING WITH AUNT!
    if (g.state.stop === 4) {
      const b = g.bread;
      if (!b.handedOver && b.handoverTime > 0) {
        b.handoverTime += dt;
        const p = clamp(b.handoverTime / 1.85, 0, 1);
        const ovenPull = V(w.oven.position.x + 0.1, w.oven.position.y + 1.18, w.oven.position.z + 0.2);
        const midAir = V(w.oven.position.x - 0.35, w.oven.position.y + 1.54, w.oven.position.z + 0.95);
        const tableTopSpot = w.breadBase.clone().add(V(0, 0.11, 0));
        // Sensible tandır lid tilts slightly open while Aunt pulls the hot bread, then rests half-ajar!
        if (w.tandirLid) {
          const lidOpen = Math.sin(clamp(p / 0.55, 0, 1) * Math.PI);
          w.tandirLid.rotation.z = 0.16 + lidOpen * 0.32;
        }
        if (w.breadBitePiece) {
          w.breadBitePiece.visible = true;
          if (p < 0.42) {
            const sp = smooth(p / 0.42);
            w.breadBitePiece.position.copy(ovenPull).lerp(midAir, sp);
            faceFigureSmooth(w.aunt, w.oven.position, dt, 8);
          } else {
            const sp = smooth((p - 0.42) / 0.58);
            w.breadBitePiece.position.copy(midAir).lerp(tableTopSpot, sp);
            faceFigureSmooth(w.aunt, g.player.position, dt, 8);
          }
        }
        if (p >= 1) {
          b.handedOver = true;
          b.refilling = false;
          b.handoverTime = 0;
          if (w.breadBitePiece) w.breadBitePiece.visible = false;
          w.breadPieces.forEach((bp) => (bp.visible = true));
          b.nextChatAt = g.time + 0.25;
          w.spawnPuff(tableTopSpot, 12, '#fff2c8');
          g.audio.sfx('murmur');
        }
      } else if (b.hug) {
        // Heartwarming Aunt hug choreography: stand up & meet in sunlit courtyard -> warm embrace -> walk cleanly back!
        const hug = b.hug;
        hug.time += dt;
        const cx = w.ovenCenter.x;
        const cz = w.ovenCenter.z;
        const y = w.ovenCenter.y;
        const auntMid = V(cx + 0.65, y, cz + 2.25);
        const auntMeet = V(cx - 0.68, y, cz + 2.48);
        const playerMeet = V(cx - 1.18, y, cz + 2.48);

        if (hug.phase === 'approach') {
          const p = clamp(hug.time / 1.55, 0, 1);
          const e = smooth(p);
          // Aunt walks smoothly around front of tandır & eating table
          const aq = hug.auntStart
            .clone()
            .multiplyScalar((1 - e) * (1 - e))
            .add(auntMid.clone().multiplyScalar(2 * (1 - e) * e))
            .add(auntMeet.clone().multiplyScalar(e * e));
          const auntPrev = w.aunt.position.clone();
          w.aunt.position.copy(aq);
          setPose(w.aunt, p < 0.92 ? 'walk' : 'stand');
          faceFigureSmooth(w.aunt, p < 0.8 ? aq.clone().sub(auntPrev).lengthSq() > 1e-5 ? aq.clone().add(aq.clone().sub(auntPrev)) : playerMeet : playerMeet, dt, 10);

          // Player stands up from stool and walks warmly forward to meet Aunt!
          const pMid = V(w.breadSeatPos.x - 0.25, y, cz + 2.15);
          const pq = hug.playerStart
            .clone()
            .multiplyScalar((1 - e) * (1 - e))
            .add(pMid.clone().multiplyScalar(2 * (1 - e) * e))
            .add(playerMeet.clone().multiplyScalar(e * e));
          w.playerRef = g.player;
          g.player.position.copy(pq);
          setPose(g.player, p < 0.92 ? 'walk' : 'stand');
          faceFigureSmooth(g.player, p < 0.82 ? playerMeet : auntMeet, dt, 10);

          if (p >= 1) {
            hug.phase = 'embrace';
            hug.time = 0;
            w.aunt.position.copy(auntMeet);
            g.player.position.copy(playerMeet);
            setPose(w.aunt, 'stand');
            setPose(g.player, 'stand');
            faceFigure(w.aunt, playerMeet);
            faceFigure(g.player, auntMeet);
            triggerAction(w.aunt, 'hug', 2.25, g.time);
            triggerAction(g.player, 'hug', 2.25, g.time);
            g.audio.sfx('murmur');
            w.spawnPuff(auntMeet.clone().lerp(playerMeet, 0.5).add(V(0, 1.35, 0)), 14, '#ffe49e');
          }
        } else if (hug.phase === 'embrace') {
          faceFigureSmooth(w.aunt, g.player.position, dt, 10);
          faceFigureSmooth(g.player, w.aunt.position, dt, 10);
          if (Math.floor(hug.time * 2) !== Math.floor((hug.time - dt) * 2)) {
            w.spawnPuff(auntMeet.clone().lerp(playerMeet, 0.5).add(V(0, 1.45, 0)), 5, '#ffe8a2');
          }
          if (hug.time >= 2.15) {
            hug.phase = 'return';
            hug.time = 0;
            w.aunt.userData.action = 'idle';
            w.aunt.userData.actionUntil = 0;
            g.player.userData.action = 'idle';
            g.player.userData.actionUntil = 0;
            setPose(w.aunt, 'walk');
            setPose(g.player, 'walk');
          }
        } else if (hug.phase === 'return') {
          const p = clamp(hug.time / 1.75, 0, 1);
          const e = smooth(p);
          const aq = auntMeet
            .clone()
            .multiplyScalar((1 - e) * (1 - e))
            .add(auntMid.clone().multiplyScalar(2 * (1 - e) * e))
            .add(w.auntHome.clone().multiplyScalar(e * e));
          w.aunt.position.copy(aq);
          setPose(w.aunt, p < 0.92 ? 'walk' : 'stand');
          faceFigureSmooth(w.aunt, p < 0.85 ? w.auntHome : g.player.position, dt, 10);

          const pMid = V(w.breadSeatPos.x - 0.25, y, cz + 2.15);
          const pq = playerMeet
            .clone()
            .multiplyScalar((1 - e) * (1 - e))
            .add(pMid.clone().multiplyScalar(2 * (1 - e) * e))
            .add(w.breadSeatPos.clone().multiplyScalar(e * e));
          g.player.position.copy(pq);
          setPose(g.player, p < 0.9 ? 'walk' : 'sit');
          faceFigureSmooth(g.player, p < 0.82 ? w.breadSeatPos : w.auntHome, dt, 10);

          if (p >= 1) {
            w.aunt.position.copy(w.auntHome);
            setPose(w.aunt, 'stand');
            faceFigure(w.aunt, g.player.position);
            g.player.position.copy(w.breadSeatPos);
            setPose(g.player, 'sit');
            faceFigure(g.player, V(cx + 1.1, y + 1.0, cz - 0.1));
            b.hug = null;
            b.nextChatAt = g.time + 0.35;
          }
        }
      } else {
        // Warm living conversation & lively cooking hand gestures with Aunt while seated eating 3 flatbreads!
        if (b.memoryTime <= 0) {
          faceFigureSmooth(w.aunt, g.player.position, dt, 6);
          setHeadTarget(w.aunt, g.player.position, 0.85);
          if (!g.chat.active && b.biteAnim <= 0 && g.time >= b.nextChatAt) {
            b.nextChatAt = g.time + 2.25 + g.rng() * 0.95;
            const auntGestures = ['chat-explain', 'bake', 'chat-laugh', 'chat-point', 'chat-shrug'];
            const playerGestures = ['chat-listen', 'chat-explain', 'chat-laugh', 'chat-shrug'];
            const idx = b.chatPhase++ % auntGestures.length;
            triggerAction(w.aunt, auntGestures[idx], 2.2, g.time);
            triggerAction(g.player, playerGestures[(idx + 1) % playerGestures.length], 2.0, g.time);
            g.audio.sfx('murmur');
          }
        }

        if (b.biteAnim > 0) {
          b.biteAnim += dt;
          const holder = b.memoryTime > 0 && w.breadChild?.visible ? w.breadChild : g.player;
          getHandWorldPos(holder, 0, _handPos);
          const bp = clamp(b.biteAnim / 1.55, 0, 1);
          if (w.breadBitePiece) {
            w.breadBitePiece.visible = bp < 0.72;
            const lift = smooth(clamp(bp / 0.28, 0, 1));
            w.breadBitePiece.position.copy(w.breadBase).lerp(_handPos.clone().add(V(0, 0.02, 0)), lift);
            w.breadBitePiece.rotation.y = bp * 2.2;
          }
          if (b.biteAnim >= 1.55) {
            b.biteAnim = 0;
            if (w.breadBitePiece) w.breadBitePiece.visible = false;
            g.player.userData.action = 'chat-listen';
            g.player.userData.actionUntil = g.time + 2.0;
            b.nextChatAt = g.time + 0.4;
            if (b.batchBites >= 3) {
              // Aunt happily serves a fresh steaming stack of 3 blistered loaves from the tandır so you can eat unlimited bread!
              b.refilling = true;
              b.handedOver = false;
              b.handoverTime = 0.01;
              b.batchBites = 0;
              w.bread.visible = true;
              w.breadPieces.forEach((p, idx) => (p.visible = idx < 2));
              if (w.breadBitePiece) {
                w.breadBitePiece.visible = true;
                w.breadBitePiece.position.set(w.oven.position.x + 0.1, w.oven.position.y + 1.16, w.oven.position.z + 0.2);
              }
              triggerAction(w.aunt, 'pull-bread', 1.8, g.time);
            }
          }
        }
      }

      if (b.memoryTime > 0) {
        b.memoryTime -= dt;
        if (b.memoryTime <= 0) {
          b.memoryTime = 0;
          g.setMemory(false);
          w.aunt.visible = true;
          w.youngAunt.visible = false;
          if (w.breadChild) w.breadChild.visible = false;
          g.player.visible = true;
        }
      }
    }

    // STOP 5: SMOOTH WALK TO CATS (SINGLE-CLICK SIT & PET + WHITE CAT RUN-BEHIND-HOUSE JOKE) & REAL WALKING INSIDE HOME!
    if (g.state.stop === 5) {
      const h = g.house;
      if (h.walkTo) {
        const wt = h.walkTo;
        wt.time += dt;
        const p = clamp(wt.time / wt.duration, 0, 1);
        g.player.position.copy(wt.start).lerp(wt.target, smooth(p));
        if (p < 0.95) {
          faceFigureSmooth(g.player, wt.target, dt, 10);
        } else {
          faceFigureSmooth(g.player, wt.lookAt, dt, 12);
        }
        // As soon as player walks right up close to the foreground white cat, it startles & bolts around the house!
        if (wt.kind === 'whitecat' && !h.whiteCatFled && g.player.position.distanceTo(w.cats[2].position) < 1.12) {
          this.triggerWhiteCatFlee();
        } else if (p >= 1) {
          if (wt.kind === 'whitecat') {
            this.triggerWhiteCatFlee();
          } else if (wt.kind === 'cat') {
            h.walkTo = null;
            setPose(g.player, h.petting ? 'sit-pet' : 'stand');
          } else if (wt.kind === 'door') {
            h.walkTo = null;
            h.doorPhase = 'step-up-open';
            h.doorTime = 0;
            h.doorStartPos = g.player.position.clone();
            setPose(g.player, 'walk');
          }
        }
      } else if (h.petting) {
        const cat = w.cats[Number(h.petting.split('-')[1])];
        if (cat) {
          if (g.player.userData.pose !== 'sit-pet') setPose(g.player, 'sit-pet');
          faceFigureSmooth(g.player, cat.position, dt, 10);
          if (g.time >= h.nextPurrAt) {
            h.nextPurrAt = g.time + 2.8;
            g.audio.sfx('purr');
          }
          if (Math.floor(g.time * 1.5) !== Math.floor((g.time - dt) * 1.5)) {
            w.spawnPuff(cat.position.clone().add(V(0, 0.45, 0)), 4, '#ffe8a2');
          }
        }
      }

      // White cat playful sprint cleanly around the right side of the house (hugging real terrain!) to sit smugly peeking out behind the back-right corner!
      if (h.whiteCatFlee) {
        const wf = h.whiteCatFlee;
        const cat = w.cats[2];
        wf.time += dt;
        const p = clamp(wf.time / wf.duration, 0, 1);
        const pos = wf.curve.getPointAt(smooth(p));
        const ahead = wf.curve.getPointAt(Math.min(1, smooth(p) + 0.04));
        const onYard = Math.abs(pos.x) <= 4.75 && pos.z >= -45.85 && pos.z <= -39.75;
        pos.y = Math.max(ground(pos.x, pos.z), onYard ? w.houseY + 0.06 : -999) + 0.02;
        cat.position.copy(pos);
        if (p < 0.96) {
          cat.userData.running = true;
          cat.rotation.y = Math.atan2(ahead.x - pos.x, ahead.z - pos.z);
          if (Math.floor(wf.time * 6) !== Math.floor((wf.time - dt) * 6)) {
            w.spawnPuff(pos.clone().add(V(0, 0.08, 0)), 4, '#efe4cc');
          }
          faceFigureSmooth(g.player, pos, dt, 6);
        } else {
          cat.userData.running = false;
          // Turns around smugly sitting behind the back-right corner of the house (clearly visible when zoomed out!)
          cat.rotation.y = -Math.PI * 0.25;
          h.whiteCatFlee = null;
        }
      }

      // Multi-stage walking inside Great-Grandfather's house: climb stone steps -> swing door INWARD -> step inside doorway -> warm dissolve!
      if (h.opening && !h.walkTo) {
        h.doorTime += dt;
        const hy = w.houseY;
        const topStepSpot = V(0, hy + 0.35, -43.72);
        const insideDoorSpot = V(0, hy + 0.35, -45.02);

        if (h.doorPhase === 'step-up-open') {
          // 0..0.72s: climb cleanly up both limestone steps; 0.72..1.55s: reach handle & swing blue door INWARD (+1.44 rad)!
          if (h.doorTime < 0.72) {
            const sp = smooth(h.doorTime / 0.72);
            g.player.position.copy(h.doorStartPos).lerp(topStepSpot, sp);
            g.player.position.y = hy + lerp(0.08, 0.35, sp) + Math.sin(sp * Math.PI * 2) * 0.04;
            setPose(g.player, 'walk');
            faceFigureSmooth(g.player, V(0, hy + 1.4, -48), dt, 10);
          } else {
            if (!h.doorSfxPlayed) {
              h.doorSfxPlayed = true;
              g.player.position.copy(topStepSpot);
              setPose(g.player, 'stand');
              triggerAction(g.player, 'open-door', 0.85, g.time);
              g.audio.sfx('door');
            }
            const op = smooth(clamp((h.doorTime - 0.72) / 0.85, 0, 1));
            w.doorPivot.rotation.y = op * 1.44; // Swings cleanly INWARD away from the player!
            if (h.doorTime >= 1.55) {
              h.doorPhase = 'walk-through';
              h.doorTime = 0;
              h.doorSfxPlayed = false;
              setPose(g.player, 'walk');
            }
          }
        } else if (h.doorPhase === 'walk-through') {
          // 0..1.35s: unhurried steps straight across the threshold into the golden-lit doorway while camera drifts warmly closer!
          const wp = clamp(h.doorTime / 1.35, 0, 1);
          g.player.position.copy(topStepSpot).lerp(insideDoorSpot, smooth(wp));
          faceFigureSmooth(g.player, V(0, hy + 1.4, -50), dt, 10);
          w.doorPivot.rotation.y = 1.44;
          g.rig.baseTarget.lerp(V(0, hy + 1.35, -45.4), 1 - Math.exp(-dt * 2.4));
          g.rig.baseViewHeight = lerp(g.rig.baseViewHeight, 7.6, 1 - Math.exp(-dt * 2.2));
          if (wp > 0.52) {
            g.state.white = smooth((wp - 0.52) / 0.48) * 0.62;
          }
          if (wp >= 1) {
            g.enterStop(6);
          }
        }
      }
    }

    // STOP 6: FINISH WALKING INSIDE THE SUNLIT READING ROOM -> PICK BOOK & WALK TO CUSHION!
    if (g.state.stop === 6 && g.reading.entering) {
      const r = g.reading;
      r.enterTime += dt;
      const p = clamp(r.enterTime / 1.15, 0, 1);
      g.player.position.copy(r.enterStart).lerp(w.playerSpots[6].pos, smooth(p));
      faceFigureSmooth(g.player, V(0, w.houseY + 1.2, -51.0), dt, 8);
      // Warm curious glance left toward Dede's chair & right toward reading kids as you step inside!
      setHeadTarget(g.player, p < 0.5 ? w.dedeChairPos : V(1.6, w.houseY + 1.0, -48.3), 0.7);
      if (p >= 1) {
        r.entering = false;
        g.player.position.copy(w.playerSpots[6].pos);
        setPose(g.player, 'stand');
        setHeadTarget(g.player, null);
      }
    }

    if (g.state.stop === 6 && g.reading.book) {
      const r = g.reading;
      r.bookTime += dt;
      const slide = smooth(clamp(r.bookTime / 0.55, 0, 1));
      w.chosenBook.position.z = -51.25 + slide * 0.4;
      w.chosenBook.visible = r.bookTime < 0.7;
      w.openBook.visible = r.bookTime >= 0.65;

      const p = smooth(clamp(r.bookTime / 3.0, 0, 1));
      g.player.position.copy(r.playerStart).lerp(V(0, w.houseY + 0.34, -46.4), p);
      faceFigureSmooth(g.player, V(0, w.houseY + 0.8, -51), dt, 8);
      if (r.bookTime < 2.8) {
        if (g.player.userData.pose !== 'walk') setPose(g.player, 'walk');
      } else {
        if (g.player.userData.pose !== 'sit') setPose(g.player, 'sit');
        g.player.userData.action = 'read';
        g.player.userData.actionUntil = Infinity;
      }
      if (r.bookTime > 3.6) g.enterStop(7);
    }
  }

  // STOP 1: CHOREOGRAPHED TEA HOUSE MICROMOTORS
  // Optional Sugar (hand picks & drops cube!) -> Optional Stir (vertical spoon pinched in hand swirling inside glass!)
  // -> Sip (tulip glass rides in foreground right hand to mouth!) -> Full Çaycı glass-swap refill!
  updateTea(dt) {
    const g = this.game;
    const w = g.world;
    const t = g.tea;

    // Gentle expanding amber ripple inside big tulip glass whenever sugar drops or spoon stirs!
    if (t.rippleTime < 0.9) {
      t.rippleTime += dt;
      const rp = clamp(t.rippleTime / 0.9, 0, 1);
      w.teaRipple.position.y = 0.02 + 0.188 * t.displayFill;
      w.teaRipple.scale.setScalar(0.6 + rp * 0.9);
      w.teaRipple.material.opacity = 0.72 * (1 - rp);
    } else if (t.stage !== 'stir') {
      w.teaRipple.material.opacity = 0;
    }

    // 1) Optional Sugar drop stage (foreground right hand arms[0] picks cube from dish, lifts over glass & drops!)
    if (t.stage === 'sugar') {
      t.stageTime += dt;
      const p = clamp(t.stageTime / 1.05, 0, 1);
      const cube = w.sugar[t.activeSugarIdx];
      if (cube) {
        getHandWorldPos(g.player, 0, _handPos);
        if (p < 0.32) {
          cube.position.copy(cube.userData.home);
          cube.scale.setScalar(1);
        } else if (p < 0.72) {
          // Cube rides cleanly pinched in foreground right hand over the rim!
          const liftP = smooth((p - 0.32) / 0.4);
          const rimPos = w.teaGlassBase.clone().add(V(0, 0.34, 0));
          _tmpVec.copy(_handPos).lerp(rimPos, liftP * 0.55);
          cube.position.copy(cube.userData.home).lerp(_tmpVec, smooth(clamp((p - 0.32) / 0.14, 0, 1)));
          cube.scale.setScalar(1);
        } else {
          const dropP = clamp((p - 0.72) / 0.24, 0, 1);
          const dropStart = w.teaGlassBase.clone().add(V(0, 0.3, 0));
          const dropEnd = w.teaGlassBase.clone().add(V(0, 0.1, 0));
          cube.position.copy(dropStart).lerp(dropEnd, dropP * dropP);
          cube.scale.setScalar(Math.max(0.05, 1 - dropP * 0.9));
          if (dropP >= 0.98) cube.visible = false;
        }
      }
      if (p >= 0.8 && !t.sugarDropped) {
        t.sugarDropped = true;
        t.rippleTime = 0;
        g.audio.sfx('plop');
        w.spawnPuff(w.teaGlassBase.clone().add(V(0, 0.22, 0)), 9, '#fff7e0');
      }
      if (p >= 1) {
        if (cube) cube.visible = false;
        t.stage = 'idle';
        t.stageTime = 0;
      }
    }

    // 2) Optional Spoon stir stage (vertical silver spoon pinched by foreground right hand swirling inside ruby tea!)
    if (t.stage === 'stir') {
      t.stageTime += dt;
      const p = clamp(t.stageTime / 1.45, 0, 1);
      const ang = t.stageTime * Math.PI * 5.0;
      let inGlass = 1;
      if (p < 0.2) inGlass = smooth(p / 0.2);
      else if (p > 0.8) inGlass = 1 - smooth((p - 0.8) / 0.2);

      // Spoon bowl dips cleanly into ruby tea while handle top sits right where fingers swirl!
      const swirlTarget = V(
        w.teaGlassBase.x + Math.cos(ang) * 0.026,
        w.teaGlassBase.y + 0.23 + (1 - inGlass) * 0.12,
        w.teaGlassBase.z + Math.sin(ang) * 0.026
      );
      w.spoon.position.copy(w.spoonBase).lerp(swirlTarget, inGlass);
      w.spoon.rotation.set(
        lerp(Math.PI * 0.5, Math.sin(ang) * 0.18, inGlass),
        lerp(0.3, ang, inGlass),
        lerp(0, Math.cos(ang) * 0.18, inGlass)
      );

      // Swirling golden ripple ring on top of the tea while stirring!
      if (inGlass > 0.65) {
        w.teaRipple.position.y = 0.02 + 0.188 * t.displayFill;
        w.teaRipple.scale.setScalar(0.82 + Math.sin(ang * 2) * 0.15);
        w.teaRipple.material.opacity = 0.65;
      }

      if (t.stageTime > 0.35 && !t.clink1) {
        t.clink1 = true;
        g.audio.sfx('clink');
      }
      if (t.stageTime > 0.72 && !t.clink2) {
        t.clink2 = true;
        g.audio.sfx('clink');
      }
      if (t.stageTime > 1.08 && !t.clink3) {
        t.clink3 = true;
        g.audio.sfx('clink');
      }
      if (p >= 1) {
        w.spoon.position.copy(w.spoonBase);
        w.spoon.rotation.set(Math.PI * 0.5, 0.3, 0);
        w.teaRipple.material.opacity = 0;
        t.stage = 'idle';
        t.stageTime = 0;
      }
    }

    // 3) Slow, unhurried savouring sip stage (2.85s: tulip glass lifts smoothly -> slow warm sip -> gentle set-down!)
    if (t.stage === 'sip') {
      t.stageTime += dt;
      const p = clamp(t.stageTime / 2.85, 0, 1);
      let hold = 0;
      if (p >= 0.2 && p < 0.4) hold = smooth((p - 0.2) / 0.2);
      else if (p >= 0.4 && p <= 0.76) hold = 1;
      else if (p > 0.76 && p <= 0.92) hold = 1 - smooth((p - 0.76) / 0.16);

      const sipPeak = p >= 0.4 && p <= 0.76 ? Math.sin(((p - 0.4) / 0.36) * Math.PI) : 0;
      getHandWorldPos(g.player, 0, _handPos);
      // Position glass cleanly held at waist by foreground right hand, tilting gently toward player's mouth (-X)!
      _tmpVec.copy(_handPos).add(V(0.03, -0.04, -0.03));
      w.teaGlass.position.copy(w.teaGlassBase).lerp(_tmpVec, hold);
      w.teaGlass.rotation.z = sipPeak * 0.48;

      if (p >= 0.42 && p <= 0.76) {
        const sp = smooth((p - 0.42) / 0.34);
        t.displayFill = lerp(t.sipStartFill, t.sipTargetFill, sp);
      }

      if (p > 0.48 && !t.sipSoundPlayed) {
        t.sipSoundPlayed = true;
        g.audio.sfx('sip');
        w.spawnPuff(w.teaGlass.position.clone().add(V(0, 0.18, 0)), 8, '#fff7e2');
      }
      if (p > 0.9 && !t.setDownPlayed) {
        t.setDownPlayed = true;
        g.audio.sfx('clink');
      }

      if (p >= 1) {
        w.teaGlass.position.copy(w.teaGlassBase);
        w.teaGlass.rotation.set(0, 0, 0);
        t.displayFill = t.sipTargetFill;
        t.stage = 'idle';
        t.stageTime = 0;

        // ONE SIP AWAY (sips === 2 of 3): ALWAYS bring çaycı back outside if inside, then stroll over & lean against the wall!
        if (t.sips === 2 && t.refillPhase === 'none') {
          if (t.patrolPhase === 'outside') {
            t.refillPhase = 'toWall';
            t.refillTime = 0;
            t.refillStart = w.cayci.position.clone();
            t.wantLean = false;
            setPose(w.cayci, 'walk');
          } else {
            // Smoothly step out of doorway first, then automatically transition to wall lean with ZERO conflict!
            t.wantLean = true;
            if (t.patrolPhase === 'inside' || t.patrolPhase === 'goingIn') {
              t.patrolPhase = 'comingOut';
              t.patrolTime = 0;
            }
          }
        }

        if (t.sips === 3) {
          if (t.glasses === 1 && !t.firstGlass) {
            t.firstGlass = true;
            t.uncleToastUntil = g.time + 6.5;
            setHeadTarget(w.uncles[0], w.dedePhotoWorld, 1.0);
            triggerAction(w.uncles[0], 'nod', 7.0, g.time);
            setHeadTarget(w.uncles[1], g.player.position, 1.0);
            triggerAction(w.uncles[1], 'raise', 6.5, g.time);
            setHeadTarget(w.uncles[2], g.player.position, 0.9);
            triggerAction(w.uncles[2], 'nod', 5.5, g.time);
            w.spawnPuff(w.dedePhotoWorld, 14, '#ffe8a0');
          }
          g.updateModeHud?.();
          w.cayci.visible = true;
          if (t.patrolPhase !== 'outside') {
            w.cayci.position.copy(w.cayciHome);
            t.patrolPhase = 'outside';
          }
          t.wantLean = false;
          t.refillPhase = 'toTable';
          t.refillTime = 0;
          t.refillStart = w.cayci.position.clone();
          t.pickupSwapped = false;
          t.placeSwapped = false;
          setPose(w.cayci, 'walk');
        }
      }
    }

    // 4) Living Çaycı in-and-out doorway patrol (when cup is full or after 1 sip; ALWAYS outside & leaning after 2 sips!)
    if (t.refillPhase === 'none') {
      const canGoInside = t.sips <= 1 && !(g.chat.active && g.chat.npcId === 'npc-cayci');
      // Safety net: if sips >= 2 and çaycı is inside/goingIn, immediately bring him back outside!
      if (t.sips >= 2 && (t.patrolPhase === 'inside' || t.patrolPhase === 'goingIn')) {
        t.patrolPhase = 'comingOut';
        t.patrolTime = 0;
      }

      if (t.patrolPhase === 'outside') {
        w.cayci.visible = true;
        t.patrolTime += dt;
        if (t.wantLean && t.sips === 2) {
          t.wantLean = false;
          t.refillPhase = 'toWall';
          t.refillTime = 0;
          t.refillStart = w.cayci.position.clone();
          setPose(w.cayci, 'walk');
        } else if (canGoInside && t.patrolTime >= t.patrolWait) {
          t.patrolPhase = 'goingIn';
          t.patrolTime = 0;
          setPose(w.cayci, 'walk');
        }
      } else if (t.patrolPhase === 'goingIn') {
        t.patrolTime += dt;
        const p = clamp(t.patrolTime / 1.25, 0, 1);
        w.cayci.position.copy(w.cayciHome).lerp(w.cayciInside, smooth(p));
        faceFigureSmooth(w.cayci, w.cayciInside, dt, 10);
        setPose(w.cayci, 'walk');
        w.cayci.visible = w.cayci.position.x > -8.68;
        if (p >= 1) {
          t.patrolPhase = 'inside';
          t.patrolTime = 0;
          w.cayci.visible = false;
          setPose(w.cayci, 'stand');
        }
      } else if (t.patrolPhase === 'inside') {
        t.patrolTime += dt;
        w.cayci.visible = false;
        if (t.patrolTime >= 2.2 || !canGoInside) {
          t.patrolPhase = 'comingOut';
          t.patrolTime = 0;
          setPose(w.cayci, 'walk');
        }
      } else if (t.patrolPhase === 'comingOut') {
        t.patrolTime += dt;
        const p = clamp(t.patrolTime / 1.25, 0, 1);
        w.cayci.position.copy(w.cayciInside).lerp(w.cayciHome, smooth(p));
        faceFigureSmooth(w.cayci, p < 0.82 ? w.cayciHome : w.teaGlassBase, dt, 10);
        setPose(w.cayci, p < 0.92 ? 'walk' : 'stand');
        w.cayci.visible = w.cayci.position.x > -8.68;
        if (p >= 1) {
          w.cayci.position.copy(w.cayciHome);
          w.cayci.visible = true;
          setPose(w.cayci, 'stand');
          faceFigure(w.cayci, w.teaGlassBase);
          t.patrolPhase = 'outside';
          t.patrolTime = 0;
          t.patrolWait = 2.8 + g.rng() * 1.4;
          if (t.wantLean && t.sips === 2) {
            t.wantLean = false;
            t.refillPhase = 'toWall';
            t.refillTime = 0;
            t.refillStart = w.cayci.position.clone();
            setPose(w.cayci, 'walk');
          }
        }
      }
    }

    // 5) Uncle 1's own ruby tea glass lifts right in his hand during toast!
    const u1Glass = w.uncleGlasses[1];
    if (u1Glass) {
      if (g.time < t.uncleToastUntil) {
        getHandWorldPos(w.uncles[1], 1, _handPos);
        u1Glass.position.lerp(_handPos.add(V(0, -0.05, 0)), 1 - Math.exp(-dt * 12));
      } else {
        u1Glass.position.lerp(u1Glass.userData.basePos, 1 - Math.exp(-dt * 8));
        if (t.uncleToastUntil > 0 && g.time >= t.uncleToastUntil + 1.0) {
          t.uncleToastUntil = 0;
          w.uncles.forEach((u) => setHeadTarget(u, null));
        }
      }
    }

    // 6) Living ambient uncle micromotors (playing tavla, glancing & chatting — pauses when player is actively chatting!)
    if (!g.chat.active && g.time > t.nextIdleUncleAt && g.time > t.uncleToastUntil) {
      t.nextIdleUncleAt = g.time + 3.8 + g.rng() * 3.4;
      const pick = Math.floor(g.rng() * 3);
      if (pick === 0) {
        triggerAction(w.uncles[0], 'tavla', 1.4, g.time);
        setHeadTarget(w.uncles[1], w.uncles[0].position, 0.5);
      } else if (pick === 1) {
        triggerAction(w.uncles[1], 'tavla', 1.4, g.time);
        setHeadTarget(w.uncles[0], w.uncles[1].position, 0.5);
      } else {
        triggerAction(w.uncles[2], 'sip', 1.8, g.time);
      }
    }

    // 7) Çaycı WALL-LEAN ANTICIPATION (at 1 sip left!) + CHOREOGRAPHED GLASS-SWAP REFILL!
    if (t.refillPhase !== 'none') {
      t.refillTime += dt;
      const midWp = V(-6.85, w.terraceY, 17.05);
      const servePos = V(-5.58, w.terraceY, 17.42);
      const trayPos = new THREE.Vector3();
      if (w.cayciTray) w.cayciTray.getWorldPosition(trayPos);
      trayPos.y -= 0.24;

      if (t.refillPhase === 'toWall') {
        const startPos = t.refillStart || w.cayciHome;
        const p = clamp(t.refillTime / 1.35, 0, 1);
        const e = smooth(p);
        w.cayci.position.copy(startPos).lerp(w.cayciLeanSpot, e);
        faceFigureSmooth(w.cayci, p < 0.75 ? w.cayciLeanSpot : w.teaGlassBase, dt, 8);
        setPose(w.cayci, p < 0.88 ? 'walk' : 'lean');
        if (p >= 1) {
          t.refillPhase = 'leaning';
          t.refillTime = 0;
          w.cayci.position.copy(w.cayciLeanSpot);
          setPose(w.cayci, 'lean');
          faceFigure(w.cayci, w.teaGlassBase);
        }
      } else if (t.refillPhase === 'leaning') {
        // Casually leaning back against the tea house wall with fresh glass on tray, keeping an eye on your last sip!
        w.cayci.position.copy(w.cayciLeanSpot);
        if (w.cayci.userData.pose !== 'lean') setPose(w.cayci, 'lean');
        faceFigureSmooth(w.cayci, w.teaGlassBase, dt, 6);
        setHeadTarget(w.cayci, w.teaGlassBase, 0.75);
      } else if (t.refillPhase === 'toTable') {
        const startPos = t.refillStart || w.cayciLeanSpot;
        const p = clamp(t.refillTime / 2.1, 0, 1);
        const e = smooth(p);
        const q = startPos
          .clone()
          .multiplyScalar((1 - e) * (1 - e))
          .add(midWp.clone().multiplyScalar(2 * (1 - e) * e))
          .add(servePos.clone().multiplyScalar(e * e));
        const ahead = w.cayci.position.clone().sub(q).lengthSq() > 0.0001 ? q : w.teaGlassBase;
        faceFigureSmooth(w.cayci, p < 0.85 ? ahead : w.teaGlassBase, dt, 8);
        w.cayci.position.copy(q);
        setPose(w.cayci, p < 0.92 ? 'walk' : 'stand');
        if (p >= 1) {
          t.refillPhase = 'pickup';
          t.refillTime = 0;
          setPose(w.cayci, 'stand');
          setHeadTarget(w.cayci, null);
          triggerAction(w.cayci, 'serve-pickup', 1.05, g.time);
        }
      } else if (t.refillPhase === 'pickup') {
        // Çaycı picks up the player's empty glass with his free arm and sets it onto his brass tray!
        faceFigureSmooth(w.cayci, w.teaGlassBase, dt, 10);
        const p = clamp(t.refillTime / 1.05, 0, 1);
        if (p > 0.25 && p < 0.9) {
          const lp = smooth((p - 0.25) / 0.65);
          w.teaGlass.position.copy(w.teaGlassBase).lerp(trayPos, lp);
          w.teaGlass.position.y += Math.sin(lp * Math.PI) * 0.22;
        }
        if (p >= 0.88 && !t.pickupSwapped) {
          t.pickupSwapped = true;
          w.teaGlass.visible = false;
          if (w.cayciTray?.userData) w.cayciTray.userData.usedGlass.visible = true;
          g.audio.sfx('clink');
        }
        if (p >= 1) {
          t.refillPhase = 'place';
          t.refillTime = 0;
          triggerAction(w.cayci, 'serve-place', 1.1, g.time);
          if (w.cayciTray?.userData) w.cayciTray.userData.freshGlass.visible = false;
          w.servedGlass.visible = true;
          w.servedGlass.position.copy(trayPos);
        }
      } else if (t.refillPhase === 'place') {
        // Çaycı lifts the fresh steaming full glass from his brass tray and places it cleanly on the saucer!
        faceFigureSmooth(w.cayci, w.teaGlassBase, dt, 10);
        const p = clamp(t.refillTime / 1.1, 0, 1);
        if (p < 0.85) {
          const lp = smooth(p / 0.85);
          w.servedGlass.position.copy(trayPos).lerp(w.teaGlassBase, lp);
          w.servedGlass.position.y += Math.sin(lp * Math.PI) * 0.24;
        }
        if (p >= 0.85 && !t.placeSwapped) {
          t.placeSwapped = true;
          w.servedGlass.visible = false;
          t.glasses++;
          t.sips = 0;
          t.sugarInGlass = 0;
          t.displayFill = 1;
          g.updateModeHud?.();
          w.teaGlass.position.copy(w.teaGlassBase);
          w.teaGlass.rotation.set(0, 0, 0);
          w.teaGlass.visible = true;
          for (const s of w.sugar) {
            s.visible = true;
            s.position.copy(s.userData.home);
            s.scale.setScalar(1);
          }
          g.audio.sfx('clink');
          w.spawnPuff(w.teaGlassBase.clone().add(V(0, 0.3, 0)), 12, '#fff5d8');
        }
        if (p >= 1) {
          t.refillPhase = 'return';
          t.refillTime = 0;
          setPose(w.cayci, 'walk');
        }
      } else if (t.refillPhase === 'return') {
        const p = clamp(t.refillTime / 2.8, 0, 1);
        const e = smooth(p);
        const q = servePos
          .clone()
          .multiplyScalar((1 - e) * (1 - e))
          .add(midWp.clone().multiplyScalar(2 * (1 - e) * e))
          .add(w.cayciHome.clone().multiplyScalar(e * e));
        faceFigureSmooth(w.cayci, p < 0.88 ? w.cayciHome : w.teaGlassBase, dt, 8);
        w.cayci.position.copy(q);
        setPose(w.cayci, p < 0.94 ? 'walk' : 'stand');
        if (p >= 1) {
          t.refillPhase = 'none';
          t.patrolPhase = 'outside';
          t.patrolTime = 0;
          t.patrolWait = 1.4;
          setPose(w.cayci, 'stand');
          if (w.cayciTray?.userData) {
            w.cayciTray.userData.freshGlass.visible = true;
            w.cayciTray.userData.usedGlass.visible = false;
          }
        }
      }
    }
  }

  // STOP 2: REALISTIC, JUICY FREE KICKS + BANGER-GOAL 2-LAP AIRPLANE RUNNER + CHILDHOOD FLASHBACK!
  updateFootball(dt) {
    const g = this.game;
    const w = g.world;
    const f = g.football;
    const gx = w.goal.position.x;
    const gy = w.goal.position.y;
    const gz = w.goal.position.z;

    // Keep celebrating pitch kid running 2 full joyful airplane-arms laps around the pitch!
    if (f.lapRunner && f.phase !== 'memory') {
      const lr = f.lapRunner;
      lr.time += dt;
      const p = clamp(lr.time / lr.duration, 0, 1);
      const kid = lr.kid;
      if (p < 1) {
        const u = (p * lr.laps) % 1;
        const pos = lr.loop.getPointAt(u);
        const ahead = lr.loop.getPointAt((u + 0.02) % 1);
        kid.position.copy(pos);
        setPose(kid, 'jog');
        faceFigureSmooth(kid, ahead, dt, 12);
        kid.userData.action = 'airplane-run';
        kid.userData.actionUntil = Infinity;
        if (Math.floor(lr.time * 5) !== Math.floor((lr.time - dt) * 5)) {
          w.spawnPuff(pos.clone().add(V(0, 0.06, 0)), 4, '#e6c486');
        }
      } else {
        // Jog gently back to touchline home spot
        const home = kid.userData.homePos;
        if (home && kid.position.distanceTo(home) > 0.25) {
          kid.position.lerp(home, 1 - Math.exp(-dt * 4.5));
          setPose(kid, 'jog');
          faceFigureSmooth(kid, home, dt, 10);
          kid.userData.action = 'idle';
          kid.userData.actionUntil = 0;
        } else {
          if (home) kid.position.copy(home);
          setPose(kid, 'stand');
          faceFigure(kid, w.ballSpot);
          kid.userData.action = 'idle';
          kid.userData.actionUntil = 0;
          f.lapRunner = null;
        }
      }
    }

    if (f.phase === 'aim') {
      faceFigureSmooth(g.player, w.goal.position, dt, 6);
      w.keeper.position.x = lerp(w.keeper.position.x, gx, 1 - Math.exp(-dt * 3));
    }

    if (f.phase === 'charging') {
      f.chargeTime += dt;
      faceFigureSmooth(g.player, (!f.dragCancelled && f.aimPoint) || w.goal.position, dt, 8);
      const anticipX = !f.dragCancelled ? clamp(lerp(gx, f.aimPoint?.x ?? gx, 0.14), gx - 0.55, gx + 0.55) : gx;
      w.keeper.position.x = lerp(w.keeper.position.x, anticipX, 1 - Math.exp(-dt * 3));
      w.ball.scale.setScalar(f.dragCancelled ? 1 : 1 + Math.sin(g.time * 12) * 0.04 * f.power);
      return;
    }

    w.ball.scale.setScalar(1);
    f.netTime += dt;

    // Athletic 2-step run-up right to the ball before striking!
    if (f.phase === 'runup') {
      f.runupTime += dt;
      const p = clamp(f.runupTime / 0.45, 0, 1);
      const plantSpot = V(w.ballSpot.x - 0.34, w.pitchCenter.y, w.ballSpot.z + 0.24);
      g.player.position.copy(f.runupStart).lerp(plantSpot, smooth(p));
      faceFigureSmooth(g.player, f.aimPoint || w.goal.position, dt, 12);
      if (p >= 0.48 && !f.kickTriggered) {
        f.kickTriggered = true;
        setPose(g.player, 'stand');
        triggerAction(g.player, 'kick', 0.58, g.time);
      }
      if (p >= 1) {
        this.launchBall(f.pendingOpts || {});
      }
      return;
    }

    if (f.phase === 'flight') {
      f.flightTime += dt;
      const speed = f.velocity.length();
      const wind = f.afterMemory && f.postShots >= 5 ? Math.sin(g.time * 1.4) * 1.6 : 0;
      f.velocity.x += (f.curve + wind) * dt;
      f.velocity.y -= 9.81 * dt;
      f.velocity.addScaledVector(f.velocity, -0.022 * speed * dt);
      w.ball.position.addScaledVector(f.velocity, dt);
      w.ball.rotation.x += (f.velocity.z * dt) / 0.22;
      w.ball.rotation.z -= (f.velocity.x * dt) / 0.22;

      const floor = w.pitchCenter.y + 0.24;
      if (w.ball.position.y < floor) {
        w.ball.position.y = floor;
        if (Math.abs(f.velocity.y) > 0.7) {
          f.velocity.y = Math.abs(f.velocity.y) * 0.48;
          f.velocity.x *= 0.82;
          f.velocity.z *= 0.82;
          w.spawnPuff(w.ball.position, 8);
        } else {
          f.velocity.y = 0;
        }
      }

      // Wall does ONE realistic synchronized jump (NOT pogo bouncing!) then watches the shot!
      if (!f.wallJumped && f.flightTime >= 0.05) {
        f.wallJumped = true;
        w.wall.forEach((k) => triggerAction(k, 'wall-jump', 0.62, g.time));
      }
      if (f.flightTime > 0.45) {
        w.wall.forEach((k) => setHeadTarget(k, w.ball.position, 0.9));
      }

      // Goalkeeper launches into a real horizontal dive after short reaction delay!
      if (!f.keeperDived && f.flightTime >= 0.13 && w.keeper.visible) {
        f.keeperDived = true;
        const diveDir = (f.targetX ?? w.ball.position.x) >= w.keeper.position.x ? 1 : -1;
        f.keeperDiveTarget = clamp(f.targetX ?? gx, gx - 1.9, gx + 1.9);
        triggerAction(w.keeper, diveDir > 0 ? 'dive-r' : 'dive-l', 1.15, g.time);
      }
      if (f.keeperDived && w.keeper.visible) {
        const diveRate = 1.75 + Math.min(2.1, f.goals * 0.48);
        w.keeper.position.x = lerp(w.keeper.position.x, f.keeperDiveTarget ?? gx, 1 - Math.exp(-dt * diveRate));
      }

      // 1) REAL Wall Block check at z = -1.6
      if (!f.wallChecked && f.previousZ > -1.6 && w.ball.position.z <= -1.6) {
        f.wallChecked = true;
        const jumpHeight = f.flightTime < 0.65 ? Math.sin(clamp((f.flightTime - 0.05) / 0.62, 0, 1) * Math.PI) * 0.42 : 0;
        const hitKid = w.wall.find(
          (k) => Math.abs(k.position.x - w.ball.position.x) < 0.34 && w.ball.position.y < w.pitchCenter.y + 1.05 + jumpHeight * 0.55
        );
        if (hitKid) {
          f.blocked = true;
          w.ball.position.z = -1.38;
          f.velocity.z = Math.abs(f.velocity.z) * 0.32;
          f.velocity.x += (w.ball.position.x - hitKid.position.x) * 3.5;
          f.velocity.y = Math.max(1.2, f.velocity.y * 0.4);
          g.audio.sfx('thump');
          w.spawnPuff(w.ball.position, 12, '#e6c486');
          w.wall.forEach((k) => triggerAction(k, 'cheer', 1.5, g.time));
        }
      }

      // 2) REAL Keeper Save check at z = -5.75 (escalates naturally as you score more post-memory goals!)
      if (!f.keeperChecked && !f.blocked && f.previousZ > -5.75 && w.ball.position.z <= -5.75 && w.keeper.visible) {
        f.keeperChecked = true;
        const reachX = 0.42 + Math.min(0.26, f.goals * 0.06);
        const reachY = 1.15 + Math.min(0.35, f.goals * 0.08);
        if (
          Math.abs(w.ball.position.x - w.keeper.position.x) < reachX &&
          w.ball.position.y < w.pitchCenter.y + reachY
        ) {
          f.blocked = true;
          w.ball.position.z = -5.5;
          f.velocity.z = Math.abs(f.velocity.z) * 0.38;
          f.velocity.x += (w.ball.position.x >= gx ? 1 : -1) * 3.8;
          f.velocity.y = 2.4;
          g.audio.sfx('thump');
          w.spawnPuff(w.ball.position, 14, '#e6c486');
          w.wall.forEach((k) => triggerAction(k, 'cheer', 1.5, g.time));
        }
      }

      // 3) REAL Goalpost / Crossbar & Pure Geometric Goal Check at z = gz (-6.3)!
      const crossed = f.previousZ > gz && w.ball.position.z <= gz;
      f.previousZ = w.ball.position.z;

      if (crossed && !f.blocked && !f.postChecked) {
        f.postChecked = true;
        const dx = Math.abs(w.ball.position.x - gx);
        const by = w.ball.position.y - gy;
        const hitPost = (Math.abs(dx - 2.2) < 0.2 && by <= 2.18) || (dx <= 2.28 && Math.abs(by - 2.05) < 0.18);
        if (hitPost) {
          f.blocked = true;
          w.ball.position.z = gz + 0.16;
          f.velocity.z = Math.abs(f.velocity.z) * 0.45;
          f.velocity.y = Math.max(1.8, Math.abs(f.velocity.y) * 0.5);
          g.audio.sfx('clang');
          w.spawnPuff(w.ball.position, 14, '#fff2c2');
        } else if (dx < 2.08 && by < 1.98) {
          f.goal = true;
          f.netTime = 0;
          // Dampen ball smoothly inside the back net!
          f.velocity.multiplyScalar(0.28);
          w.spawnPuff(w.ball.position, 22, '#ffe89e');
        }
      }

      // Keep scored ball nestled inside the 3D net
      if (f.goal && w.ball.position.z < gz - 1.15) {
        w.ball.position.z = gz - 1.15;
        f.velocity.z = 0;
      }

      if ((f.goal && f.flightTime > 0.85) || f.flightTime > 1.55 || w.ball.position.z < gz - 2.6 || f.velocity.length() < 0.45) {
        g.audio.sfx(f.goal ? 'cheer' : 'groan');
        f.phase = 'reset';
        f.resetAt = g.time + 1.05;
        if (f.goal) {
          // Opposing wall slumps in disbelief; sideline spectators jump & cheer; kid #1 sprints 2 FULL LAPS around the pitch!
          w.wall.forEach((k) => triggerAction(k, 'slump', 2.0, g.time));
          w.pitchKids.forEach((k, idx) => {
            if (idx !== 1) triggerAction(k, 'cheer', 2.2, g.time);
          });
          this.startPitchVictoryLap();
          f.goals++;
          f.streak++;
          f.bestStreak = Math.max(f.bestStreak, f.streak);
          if (f.afterMemory && w.wall.length < 5) {
            w.addWallKid();
          }
          if (f.unlimitedMode) g.updateFreekickHud();
        } else {
          f.streak = 0;
          if (f.unlimitedMode) g.updateFreekickHud();
        }
        if (!f.unlimitedMode && !f.afterMemory && (f.goal || f.shots >= 3)) {
          f.memoryAt = g.time + 1.35;
        }
      }
    }

    if (f.phase === 'reset') {
      if (f.memoryAt && g.time >= f.memoryAt) {
        f.memoryAt = 0;
        this.startFootballMemory();
      } else if (!f.memoryAt && g.time >= f.resetAt) {
        // Smooth jog back to free-kick stance (ZERO snap!)
        f.phase = 'jogback';
        f.jogTime = 0;
        f.jogStart = g.player.position.clone();
        setPose(g.player, 'jog');
        w.keeper.userData.action = 'keeper-ready';
        w.keeper.userData.actionUntil = Infinity;
      }
    }

    if (f.phase === 'jogback') {
      f.jogTime += dt;
      const p = clamp(f.jogTime / 1.05, 0, 1);
      g.player.position.copy(f.jogStart).lerp(w.playerSpots[2].pos, smooth(p));
      w.keeper.position.x = lerp(w.keeper.position.x, gx, 1 - Math.exp(-dt * 6));
      w.ball.position.lerp(w.ballSpot, 1 - Math.exp(-dt * 10));
      faceFigureSmooth(g.player, p < 0.7 ? w.playerSpots[2].pos : w.goal.position, dt, 8);
      if (p >= 1) {
        setPose(g.player, 'stand');
        this.resetBall(false);
      }
    }

    // CHILDHOOD SEPIA FREE-KICK FLASHBACK — YOU ARE A KID CURLING A TOP-CORNER WINNER!
    if (f.phase === 'memory') {
      f.memoryTime += dt;
      const fy = w.pitchCenter.y;
      const child = w.footballChild;

      // 0.0..0.55s: Kid player runs up smoothly and strikes the ball!
      if (f.memoryTime < 0.55) {
        const p = clamp(f.memoryTime / 0.52, 0, 1);
        child.position.set(lerp(gx - 0.75, gx - 0.34, smooth(p)), fy, lerp(3.55, 2.34, smooth(p)));
        faceFigureSmooth(child, w.goal.position, dt, 12);
        if (p > 0.55 && !f.memoryKicked) {
          f.memoryKicked = true;
          setPose(child, 'stand');
          triggerAction(child, 'kick', 0.58, g.time);
          g.audio.sfx('kick');
          w.spawnPuff(w.ballSpot, 16, '#ffe49e');
        }
      }

      // 0.52..3.6s: Glorious slow-motion curling banana shot over leaping kid wall & diving keeper!
      if (f.memoryTime >= 0.52 && f.memoryTime <= 3.65) {
        const t = clamp((f.memoryTime - 0.52) / 3.05, 0, 1);
        const a = w.ballSpot.clone();
        const b = V(gx + 3.4, fy + 3.55, -2.6);
        const c = V(gx + 1.55, fy + 1.65, gz - 0.55);
        w.ball.position.copy(
          a
            .multiplyScalar((1 - t) * (1 - t))
            .add(b.multiplyScalar(2 * (1 - t) * t))
            .add(c.multiplyScalar(t * t))
        );
        w.ball.rotation.x += dt * 13;
        w.ball.rotation.z += dt * 9;

        if (!f.memoryWallJumped && t > 0.14) {
          f.memoryWallJumped = true;
          w.memoryWall.forEach((k) => triggerAction(k, 'wall-jump', 1.1, g.time));
        }
        if (t > 0.45) {
          w.memoryWall.forEach((k) => setHeadTarget(k, w.ball.position, 0.9));
        }
        if (!f.memoryKeeperDived && t > 0.38) {
          f.memoryKeeperDived = true;
          triggerAction(w.memoryKeeper, 'dive-r', 1.6, g.time);
        }
        if (f.memoryKeeperDived) {
          w.memoryKeeper.position.x = lerp(w.memoryKeeper.position.x, gx + 1.25, 1 - Math.exp(-dt * 2.2));
        }
        // Teammates watch the curling ball soar toward the top corner!
        w.memoryKids.forEach((k) => faceFigureSmooth(k, w.ball.position, dt, 6));
      }

      // 3.55s: TOP CORNER GOAL!
      if (f.memoryTime >= 3.55 && !f.memoryScored) {
        f.memoryScored = true;
        f.netTime = 0;
        g.audio.sfx('cheer');
        w.spawnPuff(V(gx + 1.55, fy + 1.65, gz - 0.3), 26, '#ffe89e');
        w.memoryWall.forEach((k) => triggerAction(k, 'slump', 4.5, g.time));
        setPose(child, 'jog');
      }

      // 3.55..8.4s: Ball settles inside the net, wall turns toward goal in disbelief,
      // kid player jogs joyfully celebrating while teammates sprint in & mob cleanly in a semicircle!
      if (f.memoryTime >= 3.55) {
        const celebT = f.memoryTime - 3.55;
        // Let the scored ball drop naturally down inside the back net!
        const dropP = clamp(celebT / 0.65, 0, 1);
        w.ball.position.y = lerp(fy + 1.65, fy + 0.24, dropP * dropP);
        w.ball.position.z = lerp(gz - 0.55, gz - 0.95, dropP);
        w.memoryWall.forEach((k) => faceFigureSmooth(k, w.goal.position, dt, 6));

        const heroSpot = V(gx, fy, 0.85);
        if (celebT < 1.3) {
          child.position.lerp(heroSpot, 1 - Math.exp(-dt * 2.4));
          faceFigureSmooth(child, heroSpot, dt, 8);
          child.userData.action = 'cheer';
          child.userData.actionUntil = Infinity;
        } else {
          setPose(child, 'stand');
          child.userData.action = 'cheer';
          child.userData.actionUntil = Infinity;
          faceFigureSmooth(child, V(gx, fy, 4.5), dt, 6);
        }

        // 3 teammates mob cleanly in a semicircle while teammate #1 runs an airplane celebration lap!
        const celebRing = [
          V(gx - 1.35, fy, 0.4),
          V(gx + 1.35, fy, 0.4),
          V(gx - 0.85, fy, 1.85),
          V(gx + 0.85, fy, 1.85),
        ];
        w.memoryKids.forEach((k, i) => {
          if (i === 1) {
            const loop = this.getPitchLoop();
            const u = ((celebT / 4.2) % 1 + 1) % 1;
            const pos = loop.getPointAt(u);
            const ahead = loop.getPointAt((u + 0.03) % 1);
            k.position.copy(pos);
            setPose(k, 'jog');
            faceFigureSmooth(k, ahead, dt, 12);
            k.userData.action = 'airplane-run';
            k.userData.actionUntil = Infinity;
            return;
          }
          const dest = celebRing[i];
          const dist = k.position.distanceTo(dest);
          if (dist > 0.25) {
            setPose(k, 'jog');
            k.position.lerp(dest, 1 - Math.exp(-dt * 2.1));
            faceFigureSmooth(k, dest, dt, 8);
            k.userData.action = 'cheer';
            k.userData.actionUntil = Infinity;
          } else {
            setPose(k, 'stand');
            faceFigureSmooth(k, child.position, dt, 8);
            k.userData.action = 'mob';
            k.userData.actionUntil = Infinity;
          }
        });
      }

      // 8.6s: Warm bloom back to present day!
      if (f.memoryTime >= 8.6) {
        f.afterMemory = true;
        f.memoryTime = 0;
        g.state.white = 0.78;
        g.setMemory(false);

        w.footballChild.visible = false;
        w.memoryWall.forEach((k) => (k.visible = false));
        w.memoryKeeper.visible = false;
        w.memoryKids.forEach((k) => {
          k.visible = false;
          k.userData.action = 'idle';
        });

        g.player.visible = true;
        w.wall.forEach((k) => {
          k.visible = true;
          k.scale.setScalar(1);
        });
        w.keeper.visible = true;
        w.pitchKids.forEach((k) => (k.visible = true));
        this.resetBall(true);
      }
    }
  }

  updateRiver(dt) {
    const g = this.game;
    const w = g.world;
    const r = g.river;

    // Slow smooth walk from grassy bank onto the mossy sitting boulder (ZERO teleport!)
    if (r.walkingToStone) {
      r.walkTime += dt;
      const p = clamp(r.walkTime / 1.35, 0, 1);
      g.player.position.copy(r.walkStart).lerp(w.riverSeatPos, smooth(p));
      if (p < 0.82) {
        faceFigureSmooth(g.player, w.riverSeatPos, dt, 8);
      } else {
        faceFigureSmooth(g.player, V(w.riverSeatPos.x, w.riverY, riverCenterZ(w.riverSeatPos.x) - 2.5), dt, 10);
      }
      if (p >= 1) {
        this.startRiverMemory();
      }
      return;
    }

    // Flicking silver trout swimming gently inside the wooden blue bucket
    w.bucketFish.forEach((f, i) => {
      if (!f.visible) return;
      const a = g.time * 0.8 + i * 2.1;
      const rad = 0.06 + (i % 2) * 0.055;
      f.position.x = Math.cos(a) * rad;
      f.position.z = Math.sin(a) * rad;
      f.rotation.y = -a;
    });

    // Childhood river memory (lively water, friend casting, bucket fish, left-drag look-around)
    if (r.seated && !r.memoryDone) {
      r.memoryTime += dt;
      if (r.memoryTime < 7) {
        g.rig.baseTarget.copy(w.bucket.position).add(V(0.5, 0.25 + Math.sin(r.memoryTime * 0.6) * 0.05, -0.5));
      } else {
        g.rig.baseTarget.copy(w.stopViews[3].target);
      }
      w.rodPivot.rotation.x = Math.sin(g.time * 1.4) * 0.06;
      if (r.memoryTime >= 22) {
        this.endRiverMemory();
      }
      return;
    }

    // Caught trout arc into hands -> held wriggling until player clicks bucket -> drops right into bucket with splash!
    if (r.holdingFish && !r.droppingFish) {
      getHandWorldPos(g.player, 0, _handPos);
      getHandWorldPos(g.player, 1, _handPosL);
      const handsMid = _handPos.clone().lerp(_handPosL, 0.5).add(V(0, 0.08, 0));
      if (r.catchArcTime < 0.72) {
        r.catchArcTime += dt;
        const p = clamp(r.catchArcTime / 0.72, 0, 1);
        w.fishFlash.position.copy(w.castTarget).lerp(handsMid, smooth(p));
        w.fishFlash.position.y += Math.sin(p * Math.PI) * 1.05;
        w.fishFlash.rotation.set(0.3, p * Math.PI * 2, Math.sin(p * Math.PI * 5) * 0.3);
        if (p >= 1) {
          g.player.userData.action = 'hold-fish';
          g.player.userData.actionUntil = Infinity;
        }
      } else {
        w.fishFlash.position.lerp(handsMid, 1 - Math.exp(-dt * 14));
        w.fishFlash.rotation.set(0.15, Math.PI * 0.5 + Math.sin(g.time * 9) * 0.22, Math.sin(g.time * 14) * 0.28);
      }
      w.fishFlash.visible = true;
      w.rodPivot.position.lerp(w.rodRestPos, 1 - Math.exp(-dt * 8));
      return;
    }

    if (r.droppingFish) {
      r.dropTime += dt;
      const p = clamp(r.dropTime / 0.95, 0, 1);
      getHandWorldPos(g.player, 0, _handPos);
      getHandWorldPos(g.player, 1, _handPosL);
      const handsMid = _handPos.clone().lerp(_handPosL, 0.5);
      const bucketTop = w.bucket.position.clone().add(V(0, 0.48, 0));
      const bucketWater = w.bucket.position.clone().add(V(0, 0.34, 0));

      if (p < 0.55) {
        w.fishFlash.position.copy(handsMid).lerp(bucketTop, smooth(p / 0.55));
        w.fishFlash.rotation.set(0.4, Math.PI * 0.5, Math.sin(g.time * 16) * 0.35);
        w.fishFlash.visible = true;
      } else {
        const dp = clamp((p - 0.55) / 0.35, 0, 1);
        w.fishFlash.position.copy(bucketTop).lerp(bucketWater, dp * dp);
        w.fishFlash.rotation.x = 1.2 * dp;
        w.fishFlash.visible = dp < 0.92;
      }

      if (p >= 0.72 && r.holdingFish) {
        r.holdingFish = false;
        r.caught++;
        r.fish++;
        w.setFishCount(r.fish);
        g.audio.sfx('splash');
        g.audio.sfx('plop');
        w.spawnPuff(bucketTop, 16, '#eef8fc');
        if (w.riverKid) triggerAction(w.riverKid, 'cheer', 2.2, g.time);
      }

      if (p >= 1) {
        r.droppingFish = false;
        w.fishFlash.visible = false;
        g.player.userData.action = 'fish';
        g.player.userData.actionUntil = Infinity;
      }
      return;
    }

    // Keep fishing rod neatly lifted in hand when seated & not holding fish
    if (r.seated && r.memoryDone) {
      w.rodPivot.position.lerp(w.rodHoldPos, 1 - Math.exp(-dt * 8));
    }

    // Fishing cast arc
    if (r.fishing === 'casting') {
      r.castTime += dt;
      const p = clamp(r.castTime / 1.0, 0, 1);
      const start = w.rodPivot.position.clone().add(V(-0.18, 0.78, -2.05));
      const end = w.castTarget;
      const mid = start.clone().lerp(end, 0.5);
      mid.y += 1.25;
      for (let i = 0; i < 24; i++) {
        const t = i / 23;
        const q = start
          .clone()
          .multiplyScalar((1 - t) * (1 - t))
          .add(mid.clone().multiplyScalar(2 * (1 - t) * t))
          .add(end.clone().multiplyScalar(t * t));
        w.fishingLine.geometry.attributes.position.setXYZ(i, q.x, q.y, q.z);
      }
      w.fishingLine.geometry.attributes.position.needsUpdate = true;
      w.bobber.position.copy(start).lerp(end, smooth(p));
      w.bobber.position.y += Math.sin(p * Math.PI) * 0.95;
      w.rodPivot.rotation.x = -0.35 + smooth(p) * 0.45;
      if (p >= 1) {
        r.fishing = 'waiting';
        r.biteAt = g.time + 2.0 + g.rng() * 3.0;
        r.rippleTime = 0;
        w.rippleRing.position.set(end.x, w.riverY + 0.03, end.z);
        w.rippleRing.visible = true;
        g.audio.sfx('splash');
      }
    } else if (r.fishing === 'waiting') {
      w.bobber.position.y = w.castTarget.y + Math.sin(g.time * 2.5) * 0.025;
      w.rodPivot.rotation.x = 0.08 + Math.sin(g.time * 1.2) * 0.03;
      if (g.time >= r.biteAt) {
        r.fishing = 'bite';
        r.biteDeadline = g.time + 2.2;
        r.rippleTime = 0;
        w.rippleRing.position.set(w.castTarget.x, w.riverY + 0.03, w.castTarget.z);
        w.rippleRing.visible = true;
        const a = w.splash.geometry.attributes.position;
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2;
          a.setXYZ(
            i,
            w.castTarget.x + Math.cos(ang) * (0.12 + (i % 3) * 0.06),
            w.castTarget.y + 0.05 + (i % 4) * 0.05,
            w.castTarget.z + Math.sin(ang) * (0.12 + (i % 3) * 0.06)
          );
        }
        a.needsUpdate = true;
        w.splash.visible = true;
        g.audio.sfx('plop');
        g.audio.sfx('splash');
      }
    } else if (r.fishing === 'bite') {
      w.bobber.position.y = w.castTarget.y - 0.12 + Math.sin(g.time * 11) * 0.05;
      w.rodPivot.rotation.x = 0.28 + Math.sin(g.time * 14) * 0.06;
      if (g.time > r.biteDeadline) {
        r.fishing = 'idle';
        w.splash.visible = false;
        w.fishingLine.visible = false;
        w.bobber.visible = false;
        g.audio.sfx('plop');
      }
    }

    // Expanding ripple ring animation
    if (r.rippleTime < 1.3) {
      r.rippleTime += dt;
      const p = clamp(r.rippleTime / 1.3, 0, 1);
      w.rippleRing.scale.setScalar(1 + p * 3.8);
      w.rippleRing.material.opacity = 0.8 * (1 - p);
      if (p >= 1) w.rippleRing.visible = false;
    }
  }

  // STOP 7: THE ENDING — dissolve to child, Dede walks in & sits, dusk village rise, cloud-out!
  updateEnding(dt) {
    const g = this.game;
    const w = g.world;
    const t = (g.ending.time += dt);
    const y = w.houseY;

    // 1.8s: Golden sparkle dissolve from adult into childhood self!
    if (t >= 1.8 && !g.ending.dissolved) {
      g.ending.dissolved = true;
      w.selfChild.visible = true;
      g.player.visible = false;
      w.spawnPuff(w.selfChild.position.clone().add(V(0, 0.55, 0)), 28, '#ffea9e');
    }

    const closePos = V(4.2, y + 12.5, -34.5);
    const closeLook = V(-0.35, y + 0.85, -47.0);

    if (t < 4.5) {
      const p = smooth(t / 4.5);
      const startPos = V(2.0, y + 14.0, -35.5);
      g.camera.position.copy(startPos).lerp(closePos, p);
      g.camera.lookAt(w.openBook.position.clone().lerp(closeLook, p));
      g.rig.viewHeight = lerp(7.0, 5.6, p);
    } else if (t < 12.5) {
      g.camera.position.copy(closePos);
      g.camera.lookAt(closeLook);
      g.rig.viewHeight = 5.6;
    }

    // Dede walks quietly in from the left (2.6s..8.5s) and sits comfortably inside his carved heirloom armchair!
    const chairPos = w.dedeChairPos || V(-1.38, y + 0.18, -46.22);
    const chairFront = V(chairPos.x + 0.26, y + 0.18, chairPos.z + 0.52);
    if (t < 7.2) {
      const p = smooth(clamp((t - 2.6) / 4.6, 0, 1));
      w.dede.position.set(lerp(-3.2, chairFront.x, p), y + 0.18, lerp(-45.75, chairFront.z, p));
      setPose(w.dede, p > 0.01 && p < 0.98 ? 'walk' : 'stand');
      faceFigureSmooth(w.dede, p < 0.85 ? chairFront : chairPos, dt, 8);
    } else if (t < 8.5) {
      const p = smooth((t - 7.2) / 1.3);
      w.dede.position.copy(chairFront).lerp(chairPos, p);
      setPose(w.dede, p < 0.55 ? 'walk' : 'sit');
      faceFigureSmooth(w.dede, w.openBook.position, dt, 8);
    } else {
      setPose(w.dede, 'sit');
      w.dede.position.copy(chairPos);
      faceFigureSmooth(w.dede, w.openBook.position, dt, 6);
      w.dede.userData.action = 'read';
      w.dede.userData.actionUntil = Infinity;
    }

    // 12.5s..21.5s: Graceful slow rise out over the entire rose-lavender dusk village!
    if (t >= 12.5) {
      const rise = smooth(clamp((t - 12.5) / 9.0, 0, 1));
      g.camera.position.copy(closePos).lerp(w.finalView.position, rise);
      g.camera.lookAt(closeLook.clone().lerp(w.finalView.target, rise));
      g.rig.viewHeight = lerp(5.6, 44.0, rise);
    }

    // Keep orthographic frustum in sync during smooth camera zoom
    const half = g.rig.viewHeight * 0.5;
    const aspect =
      (g.camera.userData.pixelWidth || innerWidth) / Math.max(1, g.camera.userData.pixelHeight || innerHeight);
    g.camera.left = -half * aspect;
    g.camera.right = half * aspect;
    g.camera.top = half;
    g.camera.bottom = -half;
    g.camera.updateProjectionMatrix();

    // Warm cream cloud-out & title card
    if (t < 22) {
      g.state.white = smooth((t - 16.5) / 4.0);
    } else {
      g.state.white = 1 - smooth((t - 22.0) / 5.0);
    }

    if (t >= 19.5 && t < 26.5) g.ui.ending.classList.add('visible');
    else g.ui.ending.classList.remove('visible');

    if (t >= 27.5) {
      g.state.mode = 'final';
      g.state.white = 0;
      g.ui.ending.classList.remove('visible');
      g.ui.endActions?.classList.add('visible');
      g.rig.setFixed(w.finalView.position, w.finalView.target, 44.0);
      g.finish();
    }
  }

  // --- EXPRESSIVE NPC HAND-GESTURE & MIMIC CONVERSATION SYSTEM ---
  stopChat() {
    const g = this.game;
    const c = g.chat;
    if (!c?.active) return;
    setHeadTarget(g.player, null);
    for (const npc of c.npcs) setHeadTarget(npc, null);
    c.active = false;
    c.npcId = null;
    c.npcs = [];
    c.stepIdx = -1;
  }

  startChat(npcId) {
    const g = this.game;
    const w = g.world;
    this.stopChat();

    let npcs = [];
    let duration = 5.0;
    if (npcId.startsWith('npc-uncle-')) {
      const idx = Number(npcId.split('-')[2]) || 0;
      // Clicking the uncles on the left triggers an unmistakable, rich 10-second hand-gesture & mimic conversation!
      duration = 10.0;
      if (idx <= 1) npcs = [w.uncles[idx], w.uncles[1 - idx]];
      else npcs = [w.uncles[2], w.uncles[1]];
    } else if (npcId === 'npc-cayci') {
      duration = 5.0;
      npcs = [w.cayci];
    } else if (npcId.startsWith('npc-pitchkid-')) {
      const idx = Number(npcId.split('-')[2]) || 0;
      duration = 4.6;
      if (w.pitchKids[idx]) npcs = [w.pitchKids[idx]];
    } else if (npcId === 'npc-riverkid') {
      duration = 5.6;
      npcs = [w.riverKid];
    } else if (npcId === 'npc-aunt') {
      duration = 6.4;
      npcs = [w.aunt];
    } else if (npcId.startsWith('npc-readkid-')) {
      const idx = Number(npcId.split('-')[2]) || 0;
      duration = 4.0;
      if (w.readingKids[idx]) npcs = [w.readingKids[idx]];
    }
    npcs = npcs.filter(Boolean);
    if (!npcs.length) return;

    const c = g.chat;
    c.active = true;
    c.npcId = npcId;
    c.npcs = npcs;
    c.time = 0;
    c.duration = duration;
    c.stepIdx = -1;
    c.nextMurmurAt = 0;
    c.stop = g.state.stop;
    c.cycleCount++;
    g.audio.sfx('murmur');
    w.spawnPuff(npcs[0].position.clone().add(V(0, 1.55, 0)), 8, '#ffe8a2');
  }

  updateChat(dt) {
    const g = this.game;
    const c = g.chat;
    if (!c?.active) return;
    if (g.state.stop !== c.stop || g.state.memory) {
      this.stopChat();
      return;
    }
    c.time += dt;
    if (c.time >= c.duration) {
      this.stopChat();
      return;
    }

    const primary = c.npcs[0];
    // Keep player & NPCs looking warmly at each other throughout the conversation!
    setHeadTarget(g.player, primary.position, 1.0);
    for (const npc of c.npcs) {
      setHeadTarget(npc, g.player.position, 1.0);
    }

    // Cycle distinct expressive hand gestures & mimics every 2.0s so every beat feels alive and never repetitive!
    const step = Math.floor(c.time / 2.0);
    if (step !== c.stepIdx) {
      c.stepIdx = step;
      const palette = ['chat-explain', 'chat-point', 'chat-shrug', 'chat-laugh', 'chat-listen'];
      const offset = c.cycleCount + step;
      const playerTalks = step % 2 === 0;
      const playerAct = playerTalks
        ? palette[offset % 4]
        : step % 4 === 3
        ? 'chat-laugh'
        : 'chat-listen';
      const npcAct = playerTalks
        ? step % 4 === 2
          ? 'chat-laugh'
          : 'chat-listen'
        : palette[(offset + 2) % 4];
      const npc2Act = palette[(offset + 3) % palette.length];

      triggerAction(g.player, playerAct, 1.95, g.time);
      triggerAction(primary, npcAct, 1.95, g.time);
      if (c.npcs[1]) triggerAction(c.npcs[1], npc2Act, 1.95, g.time);

      g.audio.sfx('murmur');
      const speaker = playerTalks ? g.player : primary;
      g.world.spawnPuff(speaker.position.clone().add(V(0, 1.5, 0)), 5, '#ffe8a2');
    }
  }

  // --- FOOTBALL PITCH PERIMETER VICTORY LAP (2 FULL AIRPLANE-ARMS LAPS ON BANGER GOAL!) ---
  getPitchLoop() {
    if (this._pitchLoop) return this._pitchLoop;
    const w = this.game.world;
    const cx = w.pitchCenter.x;
    const fy = w.pitchCenter.y;
    const pts = [
      V(cx + 4.9, fy, -2.5),
      V(cx + 5.0, fy, 3.2),
      V(cx + 4.4, fy, 7.2),
      V(cx, fy, 7.6),
      V(cx - 4.4, fy, 7.1),
      V(cx - 5.0, fy, 2.2),
      V(cx - 4.9, fy, -3.4),
      V(cx - 3.6, fy, -5.2),
      V(cx + 3.6, fy, -5.2),
    ];
    this._pitchLoop = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.3);
    return this._pitchLoop;
  }

  startPitchVictoryLap() {
    const g = this.game;
    const kid = g.world.pitchKids?.[1];
    if (!kid) return;
    g.football.lapRunner = {
      kid,
      loop: this.getPitchLoop(),
      time: 0,
      duration: 12.6, // Brisk joyous 2-lap sprint around the entire pitch!
      laps: 2,
    };
  }

  // --- HEARTWARMING AUNT HUG AT STOP 4 ---
  startAuntHug() {
    const g = this.game;
    const w = g.world;
    this.stopChat();
    g.bread.hug = {
      phase: 'approach',
      time: 0,
      auntStart: w.aunt.position.clone(),
      playerStart: g.player.position.clone(),
    };
    setHeadTarget(w.aunt, null);
    setHeadTarget(g.player, null);
    w.aunt.userData.action = 'idle';
    w.aunt.userData.actionUntil = 0;
    g.player.userData.action = 'idle';
    g.player.userData.actionUntil = 0;
    setPose(w.aunt, 'walk');
    setPose(g.player, 'walk');
    g.audio.sfx('murmur');
  }

  // --- WHITE CAT COMEDY FLEE BEHIND GREAT-GRANDFATHER'S HOUSE ---
  triggerWhiteCatFlee() {
    const g = this.game;
    const w = g.world;
    const h = g.house;
    if (h.whiteCatFled) return;
    h.whiteCatFled = true;
    h.petting = null;
    h.walkTo = null;
    h.petted['cat-2'] = true;

    const cat = w.cats[2];
    const y = w.houseY + 0.08;
    // Obstacle-free flee route: stays inside the dry-stone wall & clear of geranium tins, runs around right side of house, and sits visibly behind the back-right corner!
    const fleePts = [
      cat.position.clone(),
      V(2.85, y, -41.45),
      V(4.65, y, -42.55),
      V(5.35, ground(5.35, -46.2) + 0.02, -46.2),
      V(5.55, ground(5.55, -50.2) + 0.02, -50.2),
      V(5.15, ground(5.15, -51.85) + 0.02, -51.85),
    ];
    h.whiteCatFlee = {
      time: 0,
      duration: 2.7,
      curve: new THREE.CatmullRomCurve3(fleePts, false, 'centripetal'),
    };
    cat.userData.running = true;
    g.audio.sfx('meow');
    w.spawnPuff(cat.position.clone().add(V(0, 0.25, 0)), 14, '#fff8e2');

    // Player stops and does a hilarious amused shrug watching the white cat bolt behind the house!
    setPose(g.player, 'stand');
    triggerAction(g.player, 'chat-shrug', 2.2, g.time);
  }

  prepareShot(n, memory = false) {
    const g = this.game;
    const w = g.world;
    g.rig.snapToStop(n, true);
    if (n === 2 && memory) {
      this.startFootballMemory();
      g.state.white = 0;
      g.state.memoryLevel = 1;
      // Advance cleanly into mid-flight curler with kid player clearly visible!
      g.football.memoryTime = 1.35;
      g.football.memoryKicked = true;
      w.footballChild.position.set(w.pitchCenter.x - 0.34, w.pitchCenter.y, 2.34);
      setPose(w.footballChild, 'stand', true);
      faceFigure(w.footballChild, w.goal.position);
      triggerAction(w.footballChild, 'kick', 0.58, g.time - 0.25);
      this.updateFootball(0.016);
    }
    if (n === 3 && memory) this.startRiverMemory();
    if (n === 3 && !memory) {
      g.river.seated = true;
      g.river.memoryDone = true;
      g.player.position.copy(w.riverSeatPos);
      setPose(g.player, 'sit', true);
      faceFigure(g.player, V(w.riverSeatPos.x, w.riverY, riverCenterZ(w.riverSeatPos.x) - 2.5));
      g.player.userData.action = 'fish';
      g.player.userData.actionUntil = Infinity;
      w.rodPivot.visible = true;
      w.rodPivot.position.copy(w.rodHoldPos);
      if (w.riverKid) {
        w.riverKid.visible = true;
        w.riverKid.position.copy(w.riverKidWatch);
        setPose(w.riverKid, 'stand', true);
        if (w.riverKidRod) w.riverKidRod.visible = false;
      }
    }
    if (n === 4 && memory) {
      g.bread.handedOver = true;
      g.bread.handoverTime = 0;
      this.interact('bread');
    }
    if (n === 7) {
      g.ending.time = 9.5;
      g.ending.dissolved = true;
      w.selfChild.visible = true;
      g.player.visible = false;
      w.dede.position.set(-0.92, w.houseY + 0.34, -46.5);
      setPose(w.dede, 'sit', true);
      faceFigure(w.dede, w.openBook.position);
      w.dede.userData.action = 'read';
      w.dede.userData.actionUntil = Infinity;
    }
    g.state.stop = n;
  }
}
