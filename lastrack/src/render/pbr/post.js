// Own post-processing for the PBR slice (plain three r170, no addons): HDR scene target + depth, SSAO, bloom (dual-filter),
// camera motion blur, ACES filmic tone mapping, vignette + grain. Constructed only on a real WebGL renderer.
import * as THREE from 'three';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const SSAO_FS = `
precision highp float; varying vec2 vUv;
uniform sampler2D tDepth; uniform mat4 uProj; uniform mat4 uInvProj; uniform float uRadius; uniform float uStrength; uniform vec2 uRes; uniform float uTime;
vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = uInvProj * vec4(uv*2.0-1.0, d*2.0-1.0, 1.0); return p.xyz/p.w; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  float d0 = texture2D(tDepth, vUv).x; if (d0 >= 0.9999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  float ang = hash(gl_FragCoord.xy + uTime) * 6.2831853;
  float occ = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float a = ang + fi * 2.399963;
    float rr = (fi + 1.0) / 12.0;
    vec3 dir = vec3(cos(a) * sqrt(rr), sin(a) * sqrt(rr), sqrt(1.0 - rr));
    vec3 T = normalize(abs(N.y) < 0.99 ? cross(N, vec3(0.0,1.0,0.0)) : cross(N, vec3(1.0,0.0,0.0)));
    vec3 B = cross(N, T);
    vec3 S = P + (T*dir.x + B*dir.y + N*dir.z) * uRadius * mix(0.3, 1.0, rr);
    vec4 q = uProj * vec4(S, 1.0); q.xy = q.xy / q.w * 0.5 + 0.5;
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) continue;
    vec3 Q = viewPos(q.xy);
    float diff = Q.z - S.z;                       // view space: more negative = farther
    float range = smoothstep(0.0, 1.0, uRadius / max(abs(P.z - Q.z), 0.0001));
    occ += (diff > 0.02 * uRadius ? 1.0 : 0.0) * range;
  }
  float ao = 1.0 - uStrength * occ / 12.0;
  gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);
}`;

const BLUR_FS = `
precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main(){ float s = 0.0; for (int x=-2;x<=1;x++) for (int y=-2;y<=1;y++) s += texture2D(tSrc, vUv + (vec2(float(x),float(y))+0.5)*uTexel).r; gl_FragColor = vec4(vec3(s/16.0),1.0); }`;

const BRIGHT_FS = `
precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform float uThreshold; uniform float uKnee; uniform vec2 uTexel;
vec3 prefilter(vec3 c){ float br = max(max(c.r,c.g),c.b); float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0*uKnee); soft = soft*soft/(4.0*uKnee+1e-4); float k = max(soft, br - uThreshold)/max(br,1e-4); return c*k; }
void main(){
  vec3 a = texture2D(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).rgb, b = texture2D(tSrc, vUv + uTexel*vec2(1.0,-1.0)).rgb, c = texture2D(tSrc, vUv + uTexel*vec2(-1.0,1.0)).rgb, d = texture2D(tSrc, vUv + uTexel*vec2(1.0,1.0)).rgb;
  gl_FragColor = vec4(min(prefilter(a)*0.25 + prefilter(b)*0.25 + prefilter(c)*0.25 + prefilter(d)*0.25, vec3(6.0)), 1.0);
}`;

const DOWN_FS = `
precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main(){
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0,-1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(-1.0,1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0,1.0)).rgb;
  gl_FragColor = vec4(s/8.0, 1.0);
}`;

const UP_FS = `
precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uMix;
void main(){
  vec3 s = texture2D(tSrc, vUv + uTexel*vec2(-1.0,0.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0,0.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(0.0,-1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(0.0,1.0)).rgb;
  s = s*2.0 + texture2D(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0,-1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(-1.0,1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0,1.0)).rgb + texture2D(tSrc, vUv).rgb*4.0;
  gl_FragColor = vec4(s/16.0 * uMix + texture2D(tPrev, vUv).rgb, 1.0);
}`;

const COMP_FS = `
precision highp float; varying vec2 vUv;
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAO; uniform sampler2D tDepth;
uniform float uBloom; uniform float uAO; uniform float uExposure; uniform float uTime; uniform vec2 uRes;
uniform float uMB; uniform mat4 uInvVP; uniform mat4 uPrevVP; uniform float uVignette; uniform float uGrain;
vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec3 col;
  if (uMB > 0.0) {
    float d = texture2D(tDepth, vUv).x;
    vec4 clip = vec4(vUv*2.0-1.0, d*2.0-1.0, 1.0);
    vec4 w = uInvVP * clip; w /= w.w;
    vec4 pc = uPrevVP * w; vec2 prevUv = (pc.xy/pc.w)*0.5+0.5;
    vec2 v = (vUv - prevUv) * uMB; float l = length(v); if (l > 0.03) v *= 0.03 / l;
    col = vec3(0.0);
    for (int i = 0; i < 8; i++) { float t = float(i)/7.0 - 0.5; col += texture2D(tScene, vUv + v * t).rgb; }
    col /= 8.0;
  } else col = texture2D(tScene, vUv).rgb;
  float ao = texture2D(tAO, vUv).r; col *= mix(1.0, ao, uAO);
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col = aces(col * uExposure);
  col = toSRGB(col);
  vec2 q = vUv - 0.5; col *= 1.0 - uVignette * dot(q, q) * 1.6;
  float g = fract(sin(dot(vUv*uRes + uTime, vec2(12.9898,78.233)))*43758.5453); col += (g - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Pure: bloom chain sizes for a given target size. */
export function bloomLevels(w, h, levels = 5) {
  const out = []; let lw = Math.max(2, w >> 1), lh = Math.max(2, h >> 1);
  for (let i = 0; i < levels && lw >= 4 && lh >= 4; i++) { out.push([lw, lh]); lw >>= 1; lh >>= 1; }
  return out;
}

export function createPost(renderer, quality) {
  const q = { ...quality };
  const fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(fsGeo, null); quad.frustumCulled = false; scene.add(quad);
  const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  const T = (v) => ({ value: v });
  const mats = {
    ssao: mk(SSAO_FS, { tDepth: T(null), uProj: T(new THREE.Matrix4()), uInvProj: T(new THREE.Matrix4()), uRadius: T(0.9), uStrength: T(1.5), uRes: T(new THREE.Vector2()), uTime: T(0) }),
    blur: mk(BLUR_FS, { tSrc: T(null), uTexel: T(new THREE.Vector2()) }),
    bright: mk(BRIGHT_FS, { tSrc: T(null), uThreshold: T(3.2), uKnee: T(0.8), uTexel: T(new THREE.Vector2()) }),
    down: mk(DOWN_FS, { tSrc: T(null), uTexel: T(new THREE.Vector2()) }),
    up: mk(UP_FS, { tSrc: T(null), tPrev: T(null), uTexel: T(new THREE.Vector2()), uMix: T(0.9) }),
    comp: mk(COMP_FS, { tScene: T(null), tBloom: T(null), tAO: T(null), tDepth: T(null), uBloom: T(0.16), uAO: T(1), uExposure: T(1), uTime: T(0), uRes: T(new THREE.Vector2()), uMB: T(0), uInvVP: T(new THREE.Matrix4()), uPrevVP: T(new THREE.Matrix4()), uVignette: T(0.55), uGrain: T(0.012) }),
  };
  const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: THREE.HalfFloatType, format: THREE.RGBAFormat };
  let w = 2, h = 2, sceneRT = null, aoRT = null, aoRT2 = null, down = [], up = [];
  const prevVP = new THREE.Matrix4(), vp = new THREE.Matrix4(), invVP = new THREE.Matrix4();
  let hasPrev = false, time = 0; const lastPos = new THREE.Vector3(), lastQuat = new THREE.Quaternion(), curPos = new THREE.Vector3(), curQuat = new THREE.Quaternion();
  const post = { quality: q, enabled: true, exposure: 1.0, bloom: 0.16, ok: true, stats: { passes: 0 }, motionBlur: 0 };   // strength 0..1, set by the caller (race: speed-scaled; showroom: stays 0)

  function disposeTargets() { for (const t of [sceneRT, aoRT, aoRT2, ...down, ...up]) if (t) t.dispose(); down = []; up = []; sceneRT = aoRT = aoRT2 = null; }
  function build() {
    disposeTargets();
    const depth = new THREE.DepthTexture(w, h); depth.type = THREE.UnsignedIntType; depth.format = THREE.DepthFormat;
    sceneRT = new THREE.WebGLRenderTarget(w, h, { ...rtOpts, depthBuffer: true, depthTexture: depth, samples: q.msaa });
    if (q.ssao) { const aw = Math.max(2, w >> 1), ah = Math.max(2, h >> 1); aoRT = new THREE.WebGLRenderTarget(aw, ah, { ...rtOpts, type: THREE.UnsignedByteType }); aoRT2 = new THREE.WebGLRenderTarget(aw, ah, { ...rtOpts, type: THREE.UnsignedByteType }); }
    if (q.bloom) for (const [lw, lh] of bloomLevels(w, h)) { down.push(new THREE.WebGLRenderTarget(lw, lh, rtOpts)); up.push(new THREE.WebGLRenderTarget(lw, lh, rtOpts)); }
  }
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(scene, cam); post.stats.passes++; }

  post.setSize = (nw, nh) => { w = Math.max(2, Math.floor(nw)); h = Math.max(2, Math.floor(nh)); build(); hasPrev = false; };
  post.setQuality = (nq) => { Object.assign(q, nq); build(); hasPrev = false; };

  post.render = (sc, camera, dt = 1 / 60) => {
    time += dt; post.stats.passes = 0;
    const prevAuto = renderer.autoClear;
    try {
      renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(sc, camera); post.stats.passes++;
      camera.updateMatrixWorld();
      let aoTex = white;
      if (q.ssao) {
        const u = mats.ssao.uniforms;
        u.tDepth.value = sceneRT.depthTexture; u.uProj.value.copy(camera.projectionMatrix); u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uRes.value.set(w, h); u.uTime.value = time % 10;
        pass(mats.ssao, aoRT);
        mats.blur.uniforms.tSrc.value = aoRT.texture; mats.blur.uniforms.uTexel.value.set(1 / aoRT.width, 1 / aoRT.height); pass(mats.blur, aoRT2);
        aoTex = aoRT2.texture;
      }
      let bloomTex = black;
      if (q.bloom && down.length) {
        const bu = mats.bright.uniforms; bu.tSrc.value = sceneRT.texture; bu.uTexel.value.set(1 / w, 1 / h); pass(mats.bright, down[0]);
        for (let i = 1; i < down.length; i++) { const du = mats.down.uniforms; du.tSrc.value = down[i - 1].texture; du.uTexel.value.set(1 / down[i - 1].width, 1 / down[i - 1].height); pass(mats.down, down[i]); }
        const last = down.length - 1;
        mats.up.uniforms.tPrev.value = black; mats.up.uniforms.tSrc.value = down[last].texture; mats.up.uniforms.uTexel.value.set(1 / down[last].width, 1 / down[last].height); mats.up.uniforms.uMix.value = 1; pass(mats.up, up[last]);
        for (let i = last - 1; i >= 0; i--) { const uu = mats.up.uniforms; uu.tSrc.value = up[i + 1].texture; uu.tPrev.value = down[i].texture; uu.uTexel.value.set(1 / up[i + 1].width, 1 / up[i + 1].height); uu.uMix.value = 0.85; pass(mats.up, up[i]); }
        bloomTex = up[0].texture;
      }
      curPos.setFromMatrixPosition(camera.matrixWorld); curQuat.setFromRotationMatrix(camera.matrixWorld);
      if (hasPrev && (curPos.distanceTo(lastPos) > 4 || lastQuat.angleTo(curQuat) > 0.25 || dt > 0.08)) hasPrev = false;   // camera cut / hitch: never blur across it
      lastPos.copy(curPos); lastQuat.copy(curQuat);
      vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); invVP.copy(vp).invert();
      const cu = mats.comp.uniforms;
      cu.tScene.value = sceneRT.texture; cu.tBloom.value = bloomTex; cu.tAO.value = aoTex; cu.tDepth.value = sceneRT.depthTexture;
      cu.uBloom.value = q.bloom ? post.bloom : 0; cu.uAO.value = q.ssao ? 1 : 0; cu.uExposure.value = post.exposure; cu.uTime.value = time % 100; cu.uRes.value.set(w, h);
      cu.uMB.value = q.motionBlur && hasPrev ? clamp01(post.motionBlur) * 0.9 : 0; cu.uInvVP.value.copy(invVP); cu.uPrevVP.value.copy(prevVP);
      pass(mats.comp, null);
      prevVP.copy(vp); hasPrev = true;
    } catch (e) { post.ok = false; post.error = e; renderer.setRenderTarget(null); throw e; } finally { renderer.autoClear = prevAuto; }
  };
  build();   // usable immediately; setSize() resizes
  post.resetHistory = () => { hasPrev = false; };
  post.dispose = () => { disposeTargets(); for (const m of Object.values(mats)) m.dispose(); fsGeo.dispose(); white.dispose(); black.dispose(); };
  return post;
}
