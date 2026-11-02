// 風を受ける布（星詠み）：1枚の絵を、地図の赤（マント）と緑（髪）の分だけ波打たせる。顔と胴体は動かない。動画より軽く、どの表情にも効く。
// 風は不規則に吹き、マントも髪も同じ風で動く（一定の波だと「うねうね」に見えた：ユーザー）
const VERTEX = `attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}`;
const FRAGMENT = `precision highp float;varying vec2 v;uniform sampler2D img,map;uniform float amp,asp,gust,phi;uniform vec2 wdir;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
vec2 flow(vec2 uv,float w,float lag){vec2 a=uv*vec2(asp,1.);vec2 perp=vec2(-wdir.y,wdir.x);float ph=phi-lag;
 float big=vn(a*2.6-wdir*ph)-.5;float small=vn(a*6.5-wdir*ph*1.7+7.)-.5;
 float n=big+small*(.18+.3*gust);
 vec2 d=perp*n*(.03+.075*gust)+wdir*(gust-.35)*.02;
 return d*w*vec2(1./asp,1.);}
void main(){vec4 m=texture2D(map,v);vec2 o=flow(v,m.r,0.)+flow(v,m.g*.42,.35);gl_FragColor=texture2D(img,v-o*amp);}`;

export type Warp = { draw: (gust: number, phi: number, amp: number) => void; setImage: (img: HTMLImageElement) => void; dispose: () => void };

export function makeWarp(canvas: HTMLCanvasElement, img: HTMLImageElement, map: HTMLImageElement, dir: [number, number]): Warp | null {
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const vs = shader(gl.VERTEX_SHADER, VERTEX);
  const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const texture = (unit: number, name: string, el: HTMLImageElement, premultiply: boolean) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, name), unit);
    return t;
  };
  const picture = texture(0, "img", img, true);
  texture(1, "map", map, false);
  gl.uniform1f(gl.getUniformLocation(program, "asp"), canvas.width / canvas.height);
  gl.uniform2fv(gl.getUniformLocation(program, "wdir"), dir);
  const ug = gl.getUniformLocation(program, "gust");
  const up = gl.getUniformLocation(program, "phi");
  const ua = gl.getUniformLocation(program, "amp");
  gl.viewport(0, 0, canvas.width, canvas.height);
  return {
    draw(gust, phi, amp) {
      gl.uniform1f(ug, gust);
      gl.uniform1f(up, phi);
      gl.uniform1f(ua, amp);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    setImage(el) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, picture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    },
    dispose() {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

/** 風の強さ（0〜1）と、風が流れた距離。不規則に突風が来て、弱まる */
export function makeWind(random: () => number = Math.random) {
  let gust = 0.3;
  let target = 0.3;
  let nextAt = 0;
  let phi = 0;
  let time = 0;
  return {
    step(dt: number, strength = 1) {
      time += dt;
      if (time > nextAt) {
        const strong = random() < 0.4;
        target = strong ? 0.75 + random() * 0.25 : 0.1 + random() * 0.3;
        nextAt = time + (strong ? 0.7 + random() * 1.1 : 1.4 + random() * 2.8);
      }
      gust += (target - gust) * Math.min(1, dt * (target > gust ? 3.2 : 1.1));
      phi += dt * (0.22 + 1.35 * gust) * strength;
      return { gust, phi };
    },
  };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error(src));
    i.src = src;
  });
}
