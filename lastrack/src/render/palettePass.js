// Palette-quantise post pass: scene -> low-res RT -> nearest of the 16 PALETTE colours (optional ordered dither) -> screen.
// Constructing/using requires WebGL; everything is wrapped so a failure just disables the pass (renderer falls back to direct).
import * as THREE from 'three';
import { PALETTE_RGB } from './paletteRef.js';

export const PALETTE_FRAG = `
uniform sampler2D tDiffuse; uniform vec3 uPal[16]; uniform float uDither; uniform vec2 uRes;
varying vec2 vUv;
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1.0/2.4))-0.055, step(0.0031308,c)); }
float bayer4(vec2 p){ int x=int(mod(p.x,4.0)); int y=int(mod(p.y,4.0)); int i=x+y*4;
  float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  for(int k=0;k<16;k++){ if(k==i) return m[k]/16.0-0.5; } return 0.0; }
void main(){
  vec3 c = toSRGB(clamp(texture2D(tDiffuse, vUv).rgb,0.0,1.0));
  c += bayer4(vUv*uRes) * uDither;
  float best = 1e9; vec3 bc = uPal[0];
  for(int i=0;i<16;i++){ vec3 d = c-uPal[i]; float l = dot(d*d, vec3(0.299,0.587,0.114)*2.0+vec3(0.1)); if(l<best){best=l;bc=uPal[i];} }
  gl_FragColor = vec4(bc,1.0);
}`;

/** createPalettePass(renderer, {scale=2, dither=0.08}) -> { enabled, render(scene,camera), setSize(w,h), setDither(v), dispose() } or null if unsupported. */
export function createPalettePass(renderer, { scale = 2, dither = 0.08 } = {}) {
  try {
    const rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, uPal: { value: PALETTE_RGB.map((c) => new THREE.Vector3(c[0] / 255, c[1] / 255, c[2] / 255)) }, uDither: { value: dither }, uRes: { value: new THREE.Vector2(2, 2) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: PALETTE_FRAG, depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const scn = new THREE.Scene(); scn.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pass = {
      enabled: true, ok: true, scale,
      setSize(w, h) {
        const pr = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
        const rw = Math.max(2, Math.floor((w * pr) / pass.scale)), rh = Math.max(2, Math.floor((h * pr) / pass.scale));
        rt.setSize(rw, rh); mat.uniforms.uRes.value.set(rw, rh);
      },
      setDither(v) { mat.uniforms.uDither.value = v; },
      render(scene, camera) {
        try {
          renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
          renderer.setRenderTarget(null); renderer.render(scn, cam);
        } catch (e) { renderer.setRenderTarget(null); pass.enabled = false; pass.ok = false; renderer.render(scene, camera); }
      },
      dispose() { rt.dispose(); mat.dispose(); quad.geometry.dispose(); },
    };
    return pass;
  } catch (e) { return null; }
}
