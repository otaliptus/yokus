import * as THREE from 'three';

// Shared live uniforms updated every frame by World (time of day, wind, flickering firelight)
export const artTime = { value: 0 };

// Three-band toon lighting colours (stored in linear space via THREE.Color.set)
export const sunColor = new THREE.Color('#fff4d6');
export const midColor = new THREE.Color('#c9beaf');
export const shadowTint = new THREE.Color('#444b7a');

// Warm flickering point light (tandır oven fire & dusk warmth) — quantized into crisp pixel-art bands
export const warmLightPos = new THREE.Vector3(6.8, 2.2, -28.0);
export const warmLightColor = new THREE.Color('#ff8a2e');
export const warmLightIntensity = { value: 0 }; // >0 near oven, 0 elsewhere
export const warmLightRange = { value: 7.5 };

// Optional moss/lichen tint on up-facing rock normals (matches full-20.png mossy boulders)
export const mossColor = new THREE.Color('#6f8f38');

export function compileToonArt(shader, opts = {}) {
  const wind = typeof opts === 'string' ? opts : opts.wind || '';
  const moss = typeof opts === 'object' && !!opts.moss;

  shader.uniforms.yokusTime = artTime;
  shader.uniforms.yokusSunColor = { value: sunColor };
  shader.uniforms.yokusMidColor = { value: midColor };
  shader.uniforms.yokusShadowTint = { value: shadowTint };
  shader.uniforms.yokusWarmPos = { value: warmLightPos };
  shader.uniforms.yokusWarmColor = { value: warmLightColor };
  shader.uniforms.yokusWarmIntensity = warmLightIntensity;
  shader.uniforms.yokusWarmRange = warmLightRange;
  if (moss) {
    shader.uniforms.yokusMossColor = { value: mossColor };
  }

  // Pass world position & world normal for quantized point-light and mossy-top shading
  shader.vertexShader =
    `varying vec3 vYokusWorldPos;\nvarying vec3 vYokusWorldNormal;\n` + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
    vec4 yokusWp = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      yokusWp = instanceMatrix * yokusWp;
    #endif
    yokusWp = modelMatrix * yokusWp;
    vYokusWorldPos = yokusWp.xyz;
    vec3 yokusWn = objectNormal;
    #ifdef USE_INSTANCING
      yokusWn = mat3( instanceMatrix ) * yokusWn;
    #endif
    vYokusWorldNormal = normalize( mat3( modelMatrix ) * yokusWn );`
  );

  if (wind) {
    shader.vertexShader = 'uniform float yokusTime;\n' + shader.vertexShader;
    const amount = wind === 'grass' ? '0.055' : wind === 'wheat' ? '0.075' : '0.042';
    const speed = wind === 'leaf' ? '1.15' : '1.55';
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float yokusPhase = instanceMatrix[3].x * 0.43 + instanceMatrix[3].z * 0.31;
        float yokusGust = sin(yokusTime * ${speed} + yokusPhase) + 0.35 * sin(yokusTime * 0.65 + yokusPhase * 0.4);
        float yokusWeight = max(uv.y, 0.22);
        transformed.x += yokusGust * ${amount} * yokusWeight;
        transformed.z += cos(yokusTime * 0.95 + yokusPhase) * ${amount} * 0.4 * yokusWeight;
      #endif`
    );
  }

  shader.fragmentShader =
    `uniform vec3 yokusSunColor;
     uniform vec3 yokusMidColor;
     uniform vec3 yokusShadowTint;
     uniform vec3 yokusWarmPos;
     uniform vec3 yokusWarmColor;
     uniform float yokusWarmIntensity;
     uniform float yokusWarmRange;
     ${moss ? 'uniform vec3 yokusMossColor;' : ''}
     varying vec3 vYokusWorldPos;
     varying vec3 vYokusWorldNormal;
     float yokusHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n` +
    shader.fragmentShader;

  const mossSnippet = moss
    ? `
      float mossPatch = smoothstep(0.60, 0.78, vYokusWorldNormal.y + 0.14 * sin(vYokusWorldPos.x * 2.7 + vYokusWorldPos.z * 2.3));
      yokusAlbedo = mix(yokusAlbedo, yokusMossColor, step(0.45, mossPatch) * 0.82);`
    : '';

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_begin>',
    `#include <lights_fragment_begin>
    vec3 yokusAlbedo = diffuseColor.rgb;
    ${mossSnippet}
    float yokusRawLight = max(dot(directionalLights[0].color, vec3(0.3333)), 0.0001);
    float yokusVisible = smoothstep(0.05, 0.28, dot(directLight.color, vec3(0.3333)) / yokusRawLight);
    float yokusNdotL = dot(geometryNormal, directLight.direction);
    // Clean 3-band toon separation (shadow / mid / sunlit)
    float yokusLitBand = yokusNdotL > 0.30 ? 1.0 : (yokusNdotL > -0.06 ? 0.5 : 0.0);
    float lightBand = yokusLitBand * yokusVisible;
    // Colors are already converted to linear space by THREE.Color — use directly
    // so cool violet-blue shadows stay airy and luminous (like full-20.png), never crushed black!
    vec3 yokusBands = lightBand > 0.75 ? yokusSunColor : (lightBand > 0.25 ? yokusMidColor : yokusShadowTint);
    vec3 yokusFinal = yokusAlbedo * yokusBands;

    // Quantized 3-step warm point-light contribution (cozy flickering tandır fire glow)
    if (yokusWarmIntensity > 0.001) {
      vec3 toFire = yokusWarmPos - vYokusWorldPos;
      float dist = length(toFire);
      if (dist < yokusWarmRange) {
        vec3 L = toFire / max(dist, 0.001);
        float atten = clamp(1.0 - dist / yokusWarmRange, 0.0, 1.0);
        atten = atten * atten;
        float ndl = max(dot(normalize(vYokusWorldNormal), L), 0.25);
        float rawWarm = atten * ndl * yokusWarmIntensity;
        float qWarm = rawWarm > 0.55 ? 0.92 : (rawWarm > 0.24 ? 0.50 : (rawWarm > 0.09 ? 0.22 : 0.0));
        yokusFinal += yokusAlbedo * yokusWarmColor * qWarm * 0.85;
      }
    }`
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
    'vec3 outgoingLight = yokusFinal + totalEmissiveRadiance;'
  );
}

export function applyToonShader(material, opts = {}) {
  const wind = typeof opts === 'string' ? opts : opts.wind || '';
  const moss = typeof opts === 'object' && !!opts.moss;
  material.userData.artWind = wind;
  material.userData.artMoss = moss;
  material.onBeforeCompile = (shader) => compileToonArt(shader, { wind, moss });
  material.customProgramCacheKey = () => `yokus-toon-v3-${wind}-${moss ? 'm' : 'n'}`;
  return material;
}
