import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp, lerp, smooth, V, ground, IS_MOBILE, IS_COMPACT_VIEW } from './palette.js';
import { setPose, faceFigure, faceFigureSmooth } from './figures.js';

// Post pass on the low-res pixel buffer:
// - Subtle crisp depth separation on silhouettes (never muddy rings!)
// - Bright sunward convex edge highlights (steps, boulders, roofs — signature look of full-20.png!)
// - Foliage interiors completely clean; delicate crown outer edge only
// - Clean time-of-day warm grade
// - Dreamy 16mm sepia memory pass (only when memory > 0) + warm cream cloud-out
const OutlineGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    tFoliage: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 180 },
    orthographic: { value: 1 },
    sunDirInView: { value: new THREE.Vector3(0, 1, 0) },
    outlineColor: { value: new THREE.Color('#2c284d') },
    gradeWarm: { value: new THREE.Vector3(1.04, 1.0, 0.93) },
    time: { value: 0 },
    memory: { value: 0 },
    white: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform sampler2D tFoliage;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float orthographic;
    uniform vec3 sunDirInView;
    uniform vec3 outlineColor;
    uniform vec3 gradeWarm;
    uniform float time;
    uniform float memory;
    uniform float white;
    uniform float aspect;
    varying vec2 vUv;

    float rnd(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    float linearDepth(float d) {
      if (orthographic > 0.5) return d;
      float z = d * 2.0 - 1.0;
      return (2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z * (cameraFar - cameraNear)) - cameraNear) / (cameraFar - cameraNear);
    }

    vec2 safeUv(vec2 uv) {
      return clamp(uv, vec2(0.0), vec2(1.0));
    }

    void main() {
      vec2 texel = 1.0 / resolution;
      float d0 = linearDepth(texture2D(tDepth, vUv).x);
      vec3 n0 = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);

      vec2 offsets[4];
      offsets[0] = vec2(texel.x, 0.0);
      offsets[1] = vec2(-texel.x, 0.0);
      offsets[2] = vec2(0.0, texel.y);
      offsets[3] = vec2(0.0, -texel.y);

      bool depthEdge = false;
      bool convexHighlight = false;
      bool foliageHere = texture2D(tFoliage, vUv).r > 0.01;
      bool adjacentFoliage = false;
      bool foliageSilhouette = false;

      for (int i = 0; i < 4; i++) {
        vec2 nuv = safeUv(vUv + offsets[i]);
        bool fN = texture2D(tFoliage, nuv).r > 0.01;
        if (fN) adjacentFoliage = true;
        float dN = linearDepth(texture2D(tDepth, nuv).x);
        vec3 nN = normalize(texture2D(tNormal, nuv).xyz * 2.0 - 1.0);

        // Foreground object edge against deeper background
        if (dN - d0 > 0.0045) {
          depthEdge = true;
          if (foliageHere && !fN) foliageSilhouette = true;
        }
        // Subtle inner crease / convex bevel highlight on sun-facing edges
        float nDot = dot(n0, nN);
        if (nDot < 0.72 && abs(dN - d0) < 0.006) {
          if (n0.y > nN.y + 0.12 || dot(n0, sunDirInView) > dot(nN, sunDirInView) + 0.14) {
            convexHighlight = true;
          }
        }
      }

      // Vintage gate weave only during flashbacks
      vec2 uv = vUv;
      if (memory > 0.01) {
        float weave = (sin(time * 15.0) * 0.0012 + sin(time * 5.7) * 0.0007) * memory;
        uv.x += weave;
        uv.y += sin(time * 9.5 + uv.x * 6.0) * 0.0005 * memory;
      }

      vec3 c = texture2D(tDiffuse, safeUv(uv)).rgb;
      bool facesSun = dot(n0, sunDirInView) > 0.15;

      // Crisp pixel-art edge treatment matching full-20.png:
      // 1) Sunward convex bevel highlight (lightens step edges, roofs, boulders)
      // 2) Delicate dark separation on outer silhouettes (gentle, never muddy!)
      if (!foliageHere && !adjacentFoliage && convexHighlight && facesSun) {
        c = mix(c, min(c * 1.24 + vec3(0.03), vec3(1.0)), 0.78);
      } else if (foliageSilhouette) {
        c = mix(c * 0.78, outlineColor, 0.20);
      } else if (!foliageHere && !adjacentFoliage && depthEdge) {
        c = mix(c * 0.72, outlineColor, 0.28);
      }

      // Clean warm time-of-day grade (slight saturation pop & warm lift)
      c *= gradeWarm;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(lum), c, 1.07);

      // Dreamy old-film flashback treatment
      if (memory > 0.005) {
        // Warm halation from neighbours
        vec3 blur = (
          texture2D(tDiffuse, safeUv(uv + vec2(texel.x, 0.0))).rgb +
          texture2D(tDiffuse, safeUv(uv - vec2(texel.x, 0.0))).rgb +
          texture2D(tDiffuse, safeUv(uv + vec2(0.0, texel.y))).rgb +
          texture2D(tDiffuse, safeUv(uv - vec2(0.0, texel.y))).rgb
        ) * 0.25;
        c = mix(c, max(c, blur * 1.08), memory * 0.45);
        float ml = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 sepia = vec3(ml * 1.22 + 0.03, ml * 0.96 + 0.01, ml * 0.64);
        c = mix(c, sepia, memory * 0.76);
        vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
        float vig = smoothstep(0.32, 0.88, length(q));
        c *= 1.0 - vig * (memory * 0.42);
        // Warm corner light-leak
        float leak = smoothstep(0.65, 0.0, length(vUv - vec2(0.92, 0.88)));
        c += vec3(0.24, 0.12, 0.04) * leak * memory * (0.7 + 0.3 * sin(time * 1.8));
        float grain = (rnd(floor(vUv * resolution) + fract(time) * 37.0) - 0.5);
        c += grain * (memory * 0.045);
      }

      // Warm sunlit cream cloud-out for memory transitions & ending
      c = mix(c, vec3(1.02, 0.98, 0.88), clamp(white, 0.0, 1.0));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

function lowTarget(w, h, depth = false, type = THREE.UnsignedByteType) {
  const target = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type,
    depthBuffer: depth,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;
  if (depth) {
    target.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    target.depthTexture.format = THREE.DepthFormat;
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;
    target.depthTexture.generateMipmaps = false;
  }
  return target;
}

export class RendererPipeline {
  constructor(canvas, scene, camera) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.scene = scene;
    this.camera = camera;
    this.sun = null;
    this.w = 1;
    this.h = 1;
    this.px = 3;
    this.frameCount = 0;
    this.shadowDirty = true;
    this._zeroVec = new THREE.Vector2();
    this._foliageOriginals = [];
    this._normalHidden = [];
    this._foliageHidden = [];

    // Use UnsignedByteType on mobile (half bandwidth on iOS Safari TBDR GPUs, visually identical with NoToneMapping!)
    const colorType = IS_MOBILE ? THREE.UnsignedByteType : THREE.HalfFloatType;
    this.rtColor = lowTarget(1, 1, true, colorType);
    this.rtNormal = lowTarget(1, 1, true);
    this.rtFoliage = lowTarget(1, 1, false);
    this.rtPost = lowTarget(1, 1, false, colorType);

    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.maskCamera = this.camera.clone();
    this.maskCamera.layers.set(1);
    this.foliageMaskMaterials = new Map();

    this.outline = new ShaderPass(OutlineGradeShader);
    this.outline.uniforms.tDiffuse.value = this.rtColor.texture;
    this.outline.uniforms.tDepth.value = this.rtColor.depthTexture;
    this.outline.uniforms.tNormal.value = this.rtNormal.texture;
    this.outline.uniforms.tFoliage.value = this.rtFoliage.texture;

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.Camera();
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.outline.material);
    this.postQuad.frustumCulled = false;
    this.postScene.add(this.postQuad);

    this.upshift = new THREE.Vector2();
    // Sub-pixel camera snap compensation: shifts sampling by fractional art-pixel remainder
    // so camera glides silky-smooth while every pixel stays rock-solid with zero shimmer!
    this.upMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tPost: { value: this.rtPost.texture },
        resolution: { value: new THREE.Vector2(1, 1) },
        snapOffset: { value: this.upshift },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tPost;
        uniform vec2 resolution;
        uniform vec2 snapOffset;
        varying vec2 vUv;
        void main() {
          vec2 pix = floor(vUv * resolution - snapOffset) + 0.5;
          vec2 sampleUv = clamp(pix / resolution, vec2(0.5) / resolution, vec2(1.0) - vec2(0.5) / resolution);
          gl_FragColor = texture2D(tPost, sampleUv);
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.screenScene = new THREE.Scene();
    this.screenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.upMaterial);
    this.screenQuad.frustumCulled = false;
    this.screenScene.add(this.screenQuad);

    this.resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const devW = Math.round(innerWidth * dpr);
      const devH = Math.round(innerHeight * dpr);
      // Target ~256 art rows on desktop, ~208 rows on mobile (crisper cozy pixel-art & ~34% less mobile GPU fill!)
      const targetRows = IS_MOBILE ? 208 : 256;
      const scale = Math.max(2, Math.round(devH / targetRows));
      this.px = scale / dpr;
      this.w = Math.max(1, Math.ceil(devW / scale));
      this.h = Math.max(1, Math.ceil(devH / scale));
      // On mobile Retina screens, cap WebGL backbuffer to 2x art resolution and let CSS pixelated scaling handle the rest!
      // Cuts iPhone Safari swapchain pixels by ~16-25x while keeping smooth sub-pixel camera glide!
      const canvasScale = IS_MOBILE ? Math.min(scale, 2) : scale;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this.w * canvasScale, this.h * canvasScale, false);
      const cv = this.renderer.domElement;
      cv.style.width = `${(this.w * scale) / dpr}px`;
      cv.style.height = `${(this.h * scale) / dpr}px`;

      this.rtColor.setSize(this.w, this.h);
      this.rtNormal.setSize(this.w, this.h);
      this.rtFoliage.setSize(this.w, this.h);
      this.rtPost.setSize(this.w, this.h);
      this.outline.uniforms.resolution.value.set(this.w, this.h);
      this.outline.uniforms.aspect.value = innerWidth / Math.max(1, innerHeight);
      this.upMaterial.uniforms.resolution.value.set(this.w, this.h);
      this.camera.userData.pixelWidth = this.w;
      this.camera.userData.pixelHeight = this.h;
      this.shadowDirty = true;

      if (this.dprMedia && this.dprListener) {
        this.dprMedia.removeEventListener('change', this.dprListener);
      }
      if (window.matchMedia) {
        this.dprMedia = matchMedia(`(resolution: ${dpr}dppx)`);
        this.dprListener = () => this.resize();
        this.dprMedia.addEventListener('change', this.dprListener, { once: true });
      }
    };

    addEventListener('resize', this.resize);
    this.resize();
  }

  forceShadowUpdate() {
    this.shadowDirty = true;
  }

  setGradeWarm(r, g, b) {
    this.outline.uniforms.gradeWarm.value.set(r, g, b);
  }

  render(time, memory, white) {
    this.frameCount++;
    const mt = memory > 0.05 ? Math.floor(time * 12) / 12 : time;
    this.outline.uniforms.time.value = mt;
    this.outline.uniforms.memory.value = memory;
    this.outline.uniforms.white.value = white;
    this.outline.uniforms.cameraNear.value = this.camera.near;
    this.outline.uniforms.cameraFar.value = this.camera.far;
    this.outline.uniforms.orthographic.value = this.camera.isOrthographicCamera ? 1 : 0;
    this.upshift.copy(this.camera.userData.pixelSnapRemainder || this._zeroVec);

    // On mobile, update shadow map every 2nd frame (30Hz shadows) to cut mobile Safari GPU time significantly!
    const updateShadow = !IS_MOBILE || this.shadowDirty || (this.frameCount & 1) === 0;
    this.renderer.shadowMap.needsUpdate = updateShadow;
    this.shadowDirty = false;
    this.renderer.setRenderTarget(this.rtColor);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    if (!this.foliage) {
      this.foliage = [];
      this.scene.traverse((o) => {
        if (o.isMesh && o.userData.foliage) this.foliage.push(o);
      });
    }

    const foliageOriginals = this._foliageOriginals;
    foliageOriginals.length = 0;
    for (const o of this.foliage) {
      const source = o.material;
      foliageOriginals.push(o, source);
      if (!o.userData._foliageMaskMat) {
        const key = `${source.map?.uuid || 'solid'}-${source.alphaTest || 0}-${source.side}`;
        if (!this.foliageMaskMaterials.has(key)) {
          this.foliageMaskMaterials.set(
            key,
            new THREE.MeshBasicMaterial({
              color: '#ffffff',
              map: source.map || null,
              alphaTest: source.alphaTest || 0,
              side: source.side,
              fog: false,
            })
          );
        }
        o.userData._foliageMaskMat = this.foliageMaskMaterials.get(key);
      }
      o.material = o.userData._foliageMaskMat;
    }

    this.maskCamera.copy(this.camera);
    this.maskCamera.layers.set(1);
    this.renderer.setRenderTarget(this.rtFoliage);
    this.renderer.clear();
    this.renderer.render(this.scene, this.maskCamera);
    for (let i = 0; i < foliageOriginals.length; i += 2) {
      foliageOriginals[i].material = foliageOriginals[i + 1];
    }

    if (!this.sun) {
      this.scene.traverse((o) => {
        if (o.isDirectionalLight && !this.sun) this.sun = o;
      });
    }
    if (this.sun) {
      this.outline.uniforms.sunDirInView.value
        .copy(this.sun.position)
        .sub(this.sun.target.position)
        .normalize()
        .transformDirection(this.camera.matrixWorldInverse);
    }

    if (!this.occluders) {
      this.occluders = [];
      this.scene.traverse((o) => {
        if (o.userData.occluder === true) this.occluders.push(o);
      });
    }
    const normalHidden = this._normalHidden;
    normalHidden.length = 0;
    for (const o of this.occluders) {
      if (o.visible && o.userData.cutFade > 0.01) {
        o.visible = false;
        normalHidden.push(o);
      }
    }
    if (!this.noNormalMeshes) {
      this.noNormalMeshes = [];
      this.scene.traverse((o) => {
        if (o.isMesh && o.userData.noNormal === true) this.noNormalMeshes.push(o);
      });
    }
    for (const o of this.noNormalMeshes) {
      if (o.visible) {
        o.visible = false;
        normalHidden.push(o);
      }
    }
    const foliageHidden = this._foliageHidden;
    foliageHidden.length = 0;
    for (const o of this.foliage) {
      if (o.visible) {
        o.visible = false;
        foliageHidden.push(o);
      }
    }

    const previous = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.normalMaterial;
    this.renderer.setRenderTarget(this.rtNormal);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = previous;

    for (const o of foliageHidden) o.visible = true;
    for (const o of normalHidden) o.visible = true;

    this.renderer.setRenderTarget(this.rtPost);
    this.renderer.clear();
    this.renderer.render(this.postScene, this.postCamera);

    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.screenScene, this.postCamera);
  }
}

const WALK_PITCH = THREE.MathUtils.degToRad(42);
const CLOSE_PITCH = THREE.MathUtils.degToRad(34);
const DISTANCE = 46;

const roadYaw = (road, t) => {
  const d = road.getTangent(clamp(t, 0, 1));
  return Math.atan2(-d.x, -d.z) + 0.34; // Diagonal three-quarter composition like full-20.png
};
const ease = (dt, tau = 0.45) => 1 - Math.exp(-dt / tau);
const easeAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.fixed = false;
    this.walk = null;
    this.stop = 0;
    this.time = 0;
    this.target = V();
    this.viewHeight = 13.5;
    this.yaw = 0.36;
    this.dragYaw = 0;
    this.dragPitch = 0;
    this.userZoom = 1.0;
    this.desiredUserZoom = 1.0;
    this.freeOrbit = false;
    this.pitch = WALK_PITCH;
    this.desiredTarget = V();
    this.desiredYaw = 0.36;
    this.desiredHeight = 13.5;
    this.desiredPitch = WALK_PITCH;
    this.baseTarget = V();
    this.initialized = false;
    this.player = null;
    this.offset = V();
    this.right = V();
    this.up = V();
    this.ahead = V();
    this.camera.userData.pixelSnapRemainder = new THREE.Vector2();
  }

  roadPoint(n) {
    return this.world.road.getPoint(this.world.roadT[n]);
  }

  snapToStop(n, immediate = false) {
    this.fixed = false;
    this.walk = null;
    this.stop = n;
    this.freeOrbit = n === 0;
    this.dragEase = { fromYaw: this.dragYaw, fromPitch: this.dragPitch, time: 0 };
    // Respect the player's chosen zoom when entering a stop; only reset on immediate snap (jump/restart)!
    if (immediate) {
      this.desiredUserZoom = 1.0;
      this.userZoom = 1.0;
    }
    const view = this.world.stopViews[n];
    this.baseTarget.copy(view.target);
    this.desiredTarget.copy(view.target);
    this.desiredYaw = view.yaw ?? 0.36;
    this.desiredHeight = view.viewHeight ?? 8.5;
    this.desiredPitch = view.pitch ?? (this.desiredHeight < 10 ? CLOSE_PITCH : WALK_PITCH);
    if (!this.initialized || immediate) {
      this.target.copy(this.desiredTarget);
      this.yaw = this.desiredYaw;
      this.viewHeight = this.desiredHeight;
      this.pitch = this.desiredPitch;
      this.dragYaw = 0;
      this.dragPitch = 0;
      this.dragEase = null;
      this.initialized = true;
    }
    this.updatePlayerAtStop(n, immediate);
    this.applyCamera();
  }

  snapToApproach(n, { immediate = false, preserveOrbit = true } = {}) {
    this.fixed = false;
    this.walk = null;
    this.stop = n;
    this.freeOrbit = true;
    this.dragEase = null;
    const spot = this.world.approachSpots?.[n];
    const view = this.world.approachViews?.[n] || {
      target: spot ? spot.pos.clone().add(V(0, 0.9, 0)) : this.world.stopViews[n].target,
      viewHeight: 12.2,
      yaw: roadYaw(this.world.road, this.world.roadT[n]),
      pitch: WALK_PITCH,
    };
    this.baseTarget.copy(view.target);
    this.desiredTarget.copy(view.target);
    this.desiredYaw = view.yaw;
    this.desiredHeight = view.viewHeight;
    this.desiredPitch = view.pitch ?? WALK_PITCH;
    if (!preserveOrbit || immediate || !this.initialized) {
      this.dragYaw = 0;
      this.dragPitch = 0;
    }
    if (immediate || !this.initialized) {
      this.target.copy(this.desiredTarget);
      this.yaw = this.desiredYaw;
      this.viewHeight = this.desiredHeight;
      this.pitch = this.desiredPitch;
      this.initialized = true;
    }
    if (this.player && spot) {
      this.player.position.copy(spot.pos);
      setPose(this.player, 'stand', immediate);
      if (immediate) faceFigure(this.player, spot.lookAt);
      else this.player.userData.turnTarget = spot.lookAt.clone();
    }
    this.applyCamera();
  }

  beginWalk(to, { toApproach = true } = {}) {
    const fromStop = this.stop;
    const fromT = this.world.roadT[fromStop];
    const destT = this.world.roadT[to];
    const useApproach = !!(toApproach && this.world.approachSpots?.[to]);

    // Build ONE continuous obstacle-free path from the player's current position -> exit waypoints ->
    // road spline samples -> either roadside approach spot (pause & look around!) or stop spot!
    const pts = [];
    const pushPt = (p) => {
      if (!p) return;
      const v = p.clone();
      if (!pts.length || pts[pts.length - 1].distanceToSquared(v) > 0.04) {
        pts.push(v);
      }
    };

    if (this.player) pushPt(this.player.position);
    const exitWps = this.world.stopPaths?.[fromStop]?.exit || [];
    for (const wp of exitWps) pushPt(wp);

    // Start road sampling cleanly AHEAD of the player / last exit waypoint so he NEVER takes a backward step first!
    const lastPt = pts[pts.length - 1];
    let startT = fromT;
    if (lastPt && destT > fromT) {
      const aheadT = this.world.findRoadTForZ(lastPt.z - 0.75);
      startT = clamp(Math.max(fromT, aheadT), fromT, destT);
    }
    const steps = Math.max(4, Math.round(Math.abs(destT - startT) * 32));
    for (let i = 0; i <= steps; i++) {
      const t = lerp(startT, destT, i / steps);
      pushPt(this.world.road.getPoint(t));
    }

    if (useApproach) {
      pushPt(this.world.approachSpots[to].pos);
    } else {
      const enterWps = this.world.stopPaths?.[to]?.enter || [];
      for (const wp of enterWps) pushPt(wp);
      const destSpot = this.world.playerSpots[to];
      if (destSpot) pushPt(destSpot.pos);
    }

    // Centripetal Catmull-Rom prevents spline overshoot/looping backwards on uneven waypoint gaps!
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const totalLen = curve.getLength();
    const standLead = this.player && (this.player.userData.pose === 'sit' || this.player.userData.pose === 'crouch') ? 0.45 : 0;

    this.fixed = false;
    this.freeOrbit = true;
    this.dragEase = null;
    this.walk = {
      kind: useApproach ? 'road' : 'full',
      fromStop,
      from: fromT,
      to,
      dest: destT,
      curve,
      time: 0,
      standLead,
      // Slow, cozy meditative walking speed (~1.42 m/s)!
      duration: clamp(totalLen / 1.42, 3.8, 19.5),
    };
    this.stop = to;

    if (this.player) {
      this.player.userData.action = 'idle';
      this.player.userData.actionUntil = 0;
      this.player.userData.turnTarget = null;
      setPose(this.player, standLead > 0 ? 'stand' : 'walk');
    }
  }

  beginEnterWalk(to) {
    const pts = [];
    const pushPt = (p) => {
      if (!p) return;
      const v = p.clone();
      if (!pts.length || pts[pts.length - 1].distanceToSquared(v) > 0.04) {
        pts.push(v);
      }
    };
    if (this.player) pushPt(this.player.position);
    const enterWps = this.world.stopPaths?.[to]?.enter || [];
    for (const wp of enterWps) pushPt(wp);
    const destSpot = this.world.playerSpots[to];
    if (destSpot) pushPt(destSpot.pos);

    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const totalLen = curve.getLength();

    this.fixed = false;
    this.freeOrbit = false;
    // Smoothly ease any user look-around angle back into the stop's curated diorama view!
    this.dragEase = { fromYaw: this.dragYaw, fromPitch: this.dragPitch, time: 0 };
    this.walk = {
      kind: 'enter',
      fromStop: to,
      from: this.world.roadT[to],
      to,
      dest: this.world.roadT[to],
      curve,
      time: 0,
      standLead: 0,
      duration: clamp(totalLen / 1.32, 1.8, 7.2),
    };
    this.stop = to;
    if (this.player) {
      this.player.userData.action = 'idle';
      this.player.userData.actionUntil = 0;
      this.player.userData.turnTarget = null;
      setPose(this.player, 'walk');
    }
  }

  updatePlayerAtStop(n, immediate = false) {
    if (!this.player) return;
    const spot = this.world.playerSpots[n];
    if (spot) {
      if (immediate) {
        this.player.position.copy(spot.pos);
        setPose(this.player, spot.pose, true);
        faceFigure(this.player, spot.lookAt);
      } else {
        this.player.position.copy(spot.pos);
        setPose(this.player, spot.pose, false);
        this.player.userData.turnTarget = spot.lookAt.clone();
      }
    } else {
      this.player.position.copy(this.roadPoint(Math.min(n, 6)));
      setPose(this.player, 'stand', immediate);
      faceFigure(this.player, this.world.stopViews[n].target);
    }
  }

  startFreeRoam(pos, yaw = 0.36) {
    this.fixed = false;
    this.walk = null;
    this.freeOrbit = true;
    this.dragEase = null;
    this.dragYaw = 0;
    this.dragPitch = 0;
    this.userZoom = 1.0;
    this.desiredUserZoom = 1.0;
    this.desiredTarget.set(pos.x, pos.y + 0.95, pos.z);
    this.target.copy(this.desiredTarget);
    this.desiredYaw = yaw;
    this.yaw = yaw;
    this.desiredHeight = 13.8;
    this.viewHeight = 13.8;
    this.desiredPitch = WALK_PITCH;
    this.pitch = WALK_PITCH;
    this.initialized = true;
    this.applyCamera();
  }

  faceFreeRoamSeat(seat) {
    if (!seat?.lookAt || !seat?.pos) return;
    const dx = seat.lookAt.x - seat.pos.x;
    const dz = seat.lookAt.z - seat.pos.z;
    if (dx * dx + dz * dz < 1e-4) return;
    // Smoothly frame camera behind the seated player looking OUT across the scenic viewpoint (while keeping 360° drag free!)
    this.desiredYaw = Math.atan2(-dx, -dz) + 0.16;
    this.dragYaw = 0;
    this.dragPitch = 0;
  }

  updateFreeRoam(dt, pos, vx = 0, vz = 0, seat = null) {
    this.time += dt;
    if (this.fixed || this.walk) return;
    const seated = !!seat;
    // Gentle camera lead in the direction of travel + scenic framing when seated at a balcony / ridge / minaret viewpoint!
    this.desiredHeight = seated ? seat.viewHeight || 17.5 : 13.8;
    const lookBiasX = seated && seat.lookAt ? clamp((seat.lookAt.x - pos.x) * 0.18, -3.5, 3.5) : vx * 0.22;
    const lookBiasZ = seated && seat.lookAt ? clamp((seat.lookAt.z - pos.z) * 0.18, -3.5, 3.5) : vz * 0.22;
    this.desiredTarget.set(pos.x + lookBiasX, pos.y + (seated ? 1.05 : 0.95), pos.z + lookBiasZ);
    const kt = ease(dt, seated ? 0.45 : 0.2);
    const ky = ease(dt, seated ? 0.42 : 0.16);
    const kz = ease(dt, 0.14);
    this.target.lerp(this.desiredTarget, kt);
    this.viewHeight = lerp(this.viewHeight, this.desiredHeight, ky);
    this.pitch = lerp(this.pitch, this.desiredPitch, ky);
    this.userZoom = lerp(this.userZoom, this.desiredUserZoom, kz);
    this.yaw = easeAngle(this.yaw, this.desiredYaw + this.dragYaw, ky);
    this.applyCamera();
  }

  updateLook(dt, mode = 'interact') {
    this.time += dt;
    if (this.fixed || this.walk) return;
    if (this.player?.userData?.turnTarget) {
      faceFigureSmooth(this.player, this.player.userData.turnTarget, dt, 7);
      const desired = Math.atan2(
        this.player.userData.turnTarget.x - this.player.position.x,
        this.player.userData.turnTarget.z - this.player.position.z
      );
      if (Math.abs(Math.atan2(Math.sin(desired - this.player.rotation.y), Math.cos(desired - this.player.rotation.y))) < 0.03) {
        this.player.userData.turnTarget = null;
      }
    }
    const view =
      mode === 'approach'
        ? this.world.approachViews?.[this.stop] || this.world.stopViews[this.stop]
        : this.world.stopViews[this.stop];
    this.desiredTarget.copy(this.baseTarget);
    this.desiredYaw = view.yaw ?? 0.36;
    this.desiredHeight = view.viewHeight ?? 8.5;
    this.desiredPitch = view.pitch ?? (this.desiredHeight < 10 ? CLOSE_PITCH : WALK_PITCH);
    this.smooth(dt, false);
    this.applyCamera();
  }

  updateWalk(dt) {
    const w = this.walk;
    if (!w) return false;
    this.time += dt;
    w.time += dt;

    // Brief graceful stand-up before walking off from a chair or boulder
    if (w.time < w.standLead) {
      if (this.player) {
        setPose(this.player, 'stand');
        const nextPt = w.curve.getPointAt(0.05);
        faceFigureSmooth(this.player, nextPt, dt, 7);
      }
      this.smooth(dt, true);
      this.applyCamera();
      return false;
    }

    const walkElapsed = w.time - w.standLead;
    const p = clamp(walkElapsed / w.duration, 0, 1);
    const e = smooth(p);
    const pos = w.curve.getPointAt(e);
    // Keep feet cleanly on terrain & stone bridge deck, and respect all solid walls/objects along the path!
    if (e > 0.05 && e < 0.94) {
      this.world.resolveCollisions?.(pos, 0.34);
    }
    const surfY = this.world.walkHeight ? this.world.walkHeight(pos.x, pos.z) : ground(pos.x, pos.z);
    if (e > 0.08 && e < 0.92) {
      pos.y = surfY;
    } else {
      pos.y = Math.max(pos.y, surfY);
    }

    if (w.kind === 'road') {
      // Road walk: wide scenic following view, user's 360° dragYaw & dragPitch stay completely free!
      const roadT = lerp(w.from, w.dest, e);
      const walkYaw = roadYaw(this.world.road, roadT);
      const appView = this.world.approachViews?.[w.to];
      const settle = smooth(clamp((p - 0.78) / 0.22, 0, 1));
      const baseFollow = V(pos.x, pos.y + 0.9, pos.z);
      this.desiredTarget.copy(baseFollow).lerp(appView ? appView.target : baseFollow, settle);
      this.desiredYaw = appView ? easeAngle(walkYaw, appView.yaw, settle) : walkYaw;
      this.desiredHeight = lerp(12.8, appView?.viewHeight ?? 12.2, settle);
      this.desiredPitch = lerp(WALK_PITCH, appView?.pitch ?? WALK_PITCH, settle);
    } else {
      // Entering a stop (or full walk): smoothly frame into the stop's intimate diorama view!
      const destView = this.world.stopViews[w.to];
      const settle = w.kind === 'enter' ? smooth(p) : smooth(clamp((p - 0.72) / 0.28, 0, 1));
      const roadT = lerp(w.from, w.dest, e);
      const walkYaw = roadYaw(this.world.road, roadT);
      this.desiredTarget.set(pos.x, pos.y + 0.85, pos.z).lerp(destView.target, settle);
      this.desiredYaw = easeAngle(walkYaw, destView.yaw ?? 0.36, settle);
      this.desiredHeight = lerp(12.2, destView.viewHeight ?? 8.5, settle);
      this.desiredPitch = lerp(WALK_PITCH, destView.pitch ?? CLOSE_PITCH, settle);
    }

    if (this.player) {
      this.player.position.copy(pos);
      if (p < 0.95) {
        if (this.player.userData.pose !== 'walk') setPose(this.player, 'walk');
        this.ahead.copy(w.curve.getPointAt(Math.min(1, e + 0.025)));
        faceFigureSmooth(this.player, this.ahead, dt, 8);
      } else {
        const spot = w.kind === 'road' ? this.world.approachSpots?.[w.to] : this.world.playerSpots[w.to];
        if (spot) {
          setPose(this.player, spot.pose || 'stand');
          faceFigureSmooth(this.player, spot.lookAt, dt, 8);
        }
      }
    }
    this.smooth(dt, true);
    this.applyCamera();
    if (p >= 1) {
      if (w.kind === 'road') {
        this.snapToApproach(w.to, { immediate: false, preserveOrbit: true });
      } else {
        this.snapToStop(w.to, false);
      }
      return true;
    }
    return false;
  }

  smooth(dt, walking) {
    const k = ease(dt, walking ? 0.48 : 0.38);
    const zk = ease(dt, 0.14);
    this.target.lerp(this.desiredTarget, k);
    this.viewHeight = lerp(this.viewHeight, this.desiredHeight, k);
    this.pitch = lerp(this.pitch, this.desiredPitch, k);
    this.userZoom = lerp(this.userZoom, this.desiredUserZoom, zk);
    if (this.dragEase) {
      this.dragEase.time += dt;
      const p = clamp(this.dragEase.time / 0.85, 0, 1);
      const inv = 1 - smooth(p);
      this.dragYaw = this.dragEase.fromYaw * inv;
      this.dragPitch = this.dragEase.fromPitch * inv;
      if (p >= 1) this.dragEase = null;
    }
    // Gentle scenic sway only while walking when the player hasn't manually looked around
    const orbit = walking && !this.fixed && Math.abs(this.dragYaw) < 0.02 ? Math.sin(this.time * 0.14) * 0.09 : 0;
    const desired = this.desiredYaw + orbit + this.dragYaw;
    this.yaw = easeAngle(this.yaw, desired, k);
  }

  adjustZoom(factor) {
    // factor > 1 zooms out (larger viewHeight), factor < 1 zooms in closer!
    this.desiredUserZoom = clamp(this.desiredUserZoom * factor, 0.62, 1.85);
  }

  setUserZoom(z = 1.0, immediate = false) {
    this.desiredUserZoom = clamp(z, 0.62, 1.85);
    if (immediate) {
      this.userZoom = this.desiredUserZoom;
      if (this.fixed && this._fixedPos && this._fixedTarget) {
        this.setFixed(this._fixedPos, this._fixedTarget, this.viewHeight);
      } else {
        this.applyCamera();
      }
    }
  }

  updateZoomOnly(dt) {
    const zk = ease(dt, 0.14);
    if (Math.abs(this.userZoom - this.desiredUserZoom) > 0.0005) {
      this.userZoom = lerp(this.userZoom, this.desiredUserZoom, zk);
      if (this.fixed && this._fixedPos && this._fixedTarget) {
        this.setFixed(this._fixedPos, this._fixedTarget, this.viewHeight);
      }
    }
  }

  mobileZoomFactor(aspect) {
    // Give compact / mobile screens extra breathing room (especially portrait, and a gentle ~24% zoom-out in mobile landscape!)
    if (aspect < 1.0) {
      return clamp(1.32 / Math.max(aspect, 0.52), 1.28, 2.05);
    }
    return IS_COMPACT_VIEW() ? 1.24 : 1.0;
  }

  applyCamera() {
    if (this.fixed) return;
    const aspect =
      (this.camera.userData.pixelWidth || innerWidth) /
      Math.max(1, this.camera.userData.pixelHeight || innerHeight);
    const effHeight = this.viewHeight * this.mobileZoomFactor(aspect) * this.userZoom;
    const half = effHeight * 0.5;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();

    const effPitch = clamp(this.pitch + this.dragPitch, 0.32, 1.06);
    const cp = Math.cos(effPitch);
    const sp = Math.sin(effPitch);
    this.offset.set(
      Math.sin(this.yaw) * cp * DISTANCE,
      sp * DISTANCE,
      Math.cos(this.yaw) * cp * DISTANCE
    );
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();

    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    this.up.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
    const h = this.camera.userData.pixelHeight || Math.max(1, Math.floor(innerHeight / 3));
    const texel = effHeight / h;
    const bx = this.camera.position.dot(this.right);
    const by = this.camera.position.dot(this.up);
    const sx = Math.round(bx / texel) * texel;
    const sy = Math.round(by / texel) * texel;
    const dx = sx - bx;
    const dy = sy - by;
    this.camera.position.addScaledVector(this.right, dx).addScaledVector(this.up, dy);
    this.camera.updateMatrixWorld();
    // Fractional sub-pixel offset in art pixels for silky-smooth upscaling
    this.camera.userData.pixelSnapRemainder.set(dx / texel, dy / texel);
  }

  drag(dx, dy = 0, free360 = false) {
    this.dragEase = null;
    if (free360 || this.freeOrbit) {
      this.dragYaw -= dx * 0.0065;
      this.dragPitch = clamp(this.dragPitch + dy * 0.0042, -0.26, 0.28);
    } else {
      this.dragYaw = clamp(this.dragYaw - dx * 0.0055, -0.95, 0.95);
      this.dragPitch = clamp(this.dragPitch + dy * 0.0036, -0.18, 0.2);
    }
  }

  releaseDrag(snapBack = false) {
    if (snapBack && (Math.abs(this.dragYaw) > 0.001 || Math.abs(this.dragPitch) > 0.001)) {
      this.dragEase = { fromYaw: this.dragYaw, fromPitch: this.dragPitch, time: 0 };
    }
  }

  setFixed(pos, target, viewHeight = null) {
    this.fixed = true;
    this.walk = null;
    this._fixedPos = pos.clone();
    this._fixedTarget = target.clone();
    if (viewHeight) {
      const aspect =
        (this.camera.userData.pixelWidth || innerWidth) /
        Math.max(1, this.camera.userData.pixelHeight || innerHeight);
      const effHeight = viewHeight * this.mobileZoomFactor(aspect) * this.userZoom;
      const half = effHeight * 0.5;
      this.viewHeight = viewHeight;
      this.camera.left = -half * aspect;
      this.camera.right = half * aspect;
      this.camera.top = half;
      this.camera.bottom = -half;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    this.camera.userData.pixelSnapRemainder.set(0, 0);
  }
}
