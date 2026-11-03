// 特別な衣装の固有モーション：左に色・右に透明度を並べた mp4 を、WebGL で透明つきにして流す（ritsu_motion.py）。読めなければ何も出さない
import { useEffect, useRef } from "react";

const blobs = new Map<string, Promise<string>>();

/** 先に読んでおく（押してから待たないように） */
export function preloadClip(url: string): Promise<string> {
  let p = blobs.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => URL.createObjectURL(b));
    p.catch(() => blobs.delete(url));
    blobs.set(url, p);
  }
  return p;
}

const VS = "attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}";
const FS = "precision mediump float;uniform sampler2D t;varying vec2 v;void main(){vec3 c=texture2D(t,vec2(v.x*.5,v.y)).rgb;float a=texture2D(t,vec2(v.x*.5+.5,v.y)).r;gl_FragColor=vec4(min(c,vec3(a)),a);}";

/** ふだんの絵との入れ替えを重ねて見せる時間（ミリ秒）。ここで切り替えが分からなくなる */
const BLEND = 200;

export function MotionClip({ url, geo, flip, delay = 0, onStart, onEnding, onEnd }: { url: string; geo: [number, number, number]; flip: boolean; delay?: number; onStart: () => void; onEnding: () => void; onEnd: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let stop = false;
    let raf = 0;
    let started = false;
    let ending = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const cv = canvas.current;
    const gl = cv?.getContext("webgl", { premultipliedAlpha: true, alpha: true });
    const finish = () => {
      if (!stop) onEnd();
    };
    if (!cv || !gl) {
      finish();
      return;
    }
    // ふだんの絵に重なる位置に置く
    const fig = cv.parentElement?.querySelector(".cape-figure")?.getBoundingClientRect();
    const box = cv.parentElement?.getBoundingClientRect();
    if (!fig || !box) {
      finish();
      return;
    }
    const w = fig.width * geo[2];
    cv.style.width = `${w}px`;
    const fromLeft = fig.width * geo[0];
    cv.style.left = `${fig.left - box.left + (flip ? fig.width - fromLeft - w : fromLeft)}px`;
    cv.style.top = `${fig.top - box.top + fig.width * geo[1]}px`;
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as [number, string][]) {
      const s = gl.createShader(type);
      if (!s || !prog) return;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(prog, s);
    }
    if (!prog) return;
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.vertexAttribPointer(gl.getAttribLocation(prog, "p"), 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const draw = () => {
      if (stop) return;
      if (video.readyState >= 2) {
        if (cv.width !== video.videoWidth / 2) {
          cv.width = video.videoWidth / 2;
          cv.height = video.videoHeight;
          gl.viewport(0, 0, cv.width, cv.height);
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!started) {
          started = true;
          // 上にふわっと重ねてから、下のふだんの絵を隠す
          cv.animate([{ opacity: 0 }, { opacity: 1 }], { duration: BLEND, fill: "forwards" }).onfinish = () => {
            if (!stop && !ending) onStart();
          };
        }
        if (!ending && video.duration && video.currentTime >= video.duration - BLEND / 1000) {
          ending = true;
          onEnding();
          const fade = cv.animate([{ opacity: 1 }, { opacity: 0 }], { duration: BLEND, fill: "forwards" });
          fade.onfinish = finish;
        }
      }
      raf = requestAnimationFrame(draw);
    };
    video.onerror = finish;
    void Promise.all([preloadClip(url), new Promise((ok) => window.setTimeout(ok, delay))])
      .then(([src]) => {
        if (stop) return;
        video.src = src;
        return video.play();
      })
      .then(() => {
        raf = requestAnimationFrame(draw);
      })
      .catch(finish);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      video.pause();
      video.removeAttribute("src");
      video.load();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return <canvas ref={canvas} className={`motion-clip${flip ? " flip" : ""}`} style={{ opacity: 0 }} aria-hidden="true" />;
}
