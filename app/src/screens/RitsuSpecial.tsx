// 特別な衣装の律のページのタブ（docs/ritsu-special-ideas.md の試作）：夜空・物語・案の切り替え・飾り棚・成果カード
import { useMemo, useState } from "react";
import { charDir } from "../character";
import { currentState, localDate, subjectOf } from "../learning";
import { Bubble } from "../Ritsu";
import { playMove, startTryOn, tryOnLeft } from "../ritsu/special";
import { fxOn, IDEAS, setAllFx, setFx, useFx, type IdeaId } from "../ritsu/fx";
import { linesOf, playLine, type Line } from "../ritsu/lines";
import { evoOverride, evoStage, EVO_NAMES, setEvoOverride, solvedCount } from "../ritsu/themes";
import { SUBJECT_ORDER } from "../subjectsMeta";

const SUBJECT_NAME: Record<string, string> = { minpo: "民法", shoho: "商法", minso: "民事訴訟法", keiho: "刑法", keiso: "刑事訴訟法", kenpo: "憲法", gyosei: "行政法" };

/** 科目ごとの星座の形（架空）。点の位置は全体 360×460 の中 */
const CONSTELLATIONS: Record<string, [number, number][]> = {
  kenpo: [[150, 40], [180, 70], [215, 50], [245, 80], [215, 110], [180, 100], [150, 130], [120, 95]],
  minpo: [[40, 120], [75, 100], [105, 130], [85, 165], [50, 180], [30, 215], [70, 230], [110, 205], [125, 170]],
  shoho: [[250, 130], [290, 115], [325, 140], [310, 180], [270, 190], [245, 170], [280, 225]],
  minso: [[150, 180], [185, 165], [215, 195], [195, 230], [160, 240], [135, 215]],
  keiho: [[40, 275], [80, 260], [115, 285], [95, 325], [55, 335], [30, 305], [120, 345]],
  keiso: [[170, 285], [205, 270], [245, 290], [225, 325], [185, 335], [160, 370], [210, 385]],
  gyosei: [[275, 265], [315, 280], [335, 320], [305, 355], [270, 335], [255, 300], [290, 405], [240, 415]],
};
/** 星座の点を1つ灯すのに要る、正解した肢の数 */
const PER_VERTEX = 15;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function skyCounts(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, rec] of currentState().history.entries()) {
    if (rec.correct > 0) (out[subjectOf(id)] ??= []).push(id);
  }
  return out;
}

/** 自分の夜空：正解した肢が星になり、科目ごとの星座の点が灯っていく。解かなくても減らない */
export function SkyTab({ theme }: { theme: string }) {
  const [full, setFull] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const counts = useMemo(skyCounts, []);
  const dots = useMemo(() => {
    const list: { x: number; y: number; r: number; o: number; k: string }[] = [];
    for (const subject of SUBJECT_ORDER) {
      const pts = CONSTELLATIONS[subject];
      const ids = counts[subject] ?? [];
      const shown = full ? Array.from({ length: 120 }, (_, k) => `${subject}-${k}`) : ids.slice(0, 150);
      for (const id of shown) {
        const h = hash(id);
        const [cx, cy] = pts[h % pts.length];
        list.push({ x: cx + ((h >> 8) % 90) - 45, y: cy + ((h >> 16) % 90) - 45, r: 0.5 + ((h >> 4) % 10) / 12, o: 0.35 + ((h >> 12) % 60) / 100, k: id });
      }
    }
    return list;
  }, [counts, full]);
  const total = Object.values(counts).reduce((n, v) => n + v.length, 0);
  const done = SUBJECT_ORDER.filter((s) => (full ? 999 : (counts[s]?.length ?? 0)) >= CONSTELLATIONS[s].length * PER_VERTEX).length;
  return (
    <div className="sky-tab">
      <svg className="sky-svg" viewBox="0 0 360 460" role="img" aria-label={`自分の夜空。正解した肢 ${total} 個`}>
        <defs>
          <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0b0f2a" />
            <stop offset="1" stopColor="#27305f" />
          </linearGradient>
        </defs>
        <rect width="360" height="460" fill="url(#sky-grad)" />
        {dots.map((d) => (
          <circle key={d.k} cx={d.x} cy={d.y} r={d.r} fill="#fff6d8" opacity={d.o} />
        ))}
        {SUBJECT_ORDER.map((s) => {
          const pts = CONSTELLATIONS[s];
          const n = full ? 999 : (counts[s]?.length ?? 0);
          const lit = Math.min(pts.length, Math.floor(n / PER_VERTEX));
          return (
            <g key={s} onClick={() => setPicked(s)} className="sky-group">
              <polyline points={pts.slice(0, lit).map((p) => p.join(",")).join(" ")} fill="none" stroke="#e8c35a" strokeWidth="0.9" opacity="0.75" />
              {pts.map(([x, y], k) => (
                <circle key={k} cx={x} cy={y} r={k < lit ? 3 : 1.6} fill={k < lit ? "#ffe9a0" : "#5a648f"} className={k < lit ? "sky-lit" : ""} />
              ))}
              <circle cx={pts[0][0]} cy={pts[0][1]} r="26" fill="transparent" />
            </g>
          );
        })}
      </svg>
      <p className="muted small">
        正解した肢 {total} 個が星になっています。できた星座 {done} / 7。休んでも減りません。{picked && `「${SUBJECT_NAME[picked]}の星座」は ${counts[picked]?.length ?? 0} 個（星座の点1つに ${PER_VERTEX} 個）`}
      </p>
      <div className="row">
        <button className="secondary" onClick={() => setFull(!full)}>{full ? "自分の夜空に戻す" : "見本：全部そろった夜空"}</button>
        {fxOn("card") && <button className="secondary" onClick={() => void saveCard(theme, total, done)}>今日の成果カード</button>}
      </div>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, ng) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = ng;
    im.src = src;
  });
}

/** 今日の成果カード：夜空と律の一枚絵。法務省の素材は使わない。非公式の表示を入れる */
async function saveCard(theme: string, total: number, done: number): Promise<void> {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const x = c.getContext("2d");
  if (!x) return;
  try {
    const bg = await loadImage(`${charDir(theme)}bg.webp`);
    x.drawImage(bg, 0, 0, 1350, 1350);
    const fig = await loadImage(`${charDir(theme)}chibi-happy.webp`);
    const h = 760;
    x.drawImage(fig, (1080 - (fig.width * h) / fig.height) / 2, 470, (fig.width * h) / fig.height, h);
  } catch {
    x.fillStyle = "#1d2447";
    x.fillRect(0, 0, 1080, 1350);
  }
  const today = currentState().daily.get(localDate(new Date()));
  x.fillStyle = "#fff6d8";
  x.textAlign = "center";
  x.font = "bold 78px sans-serif";
  x.fillText(`今日の星 ${today?.correct ?? 0} 個`, 540, 150);
  x.font = "44px sans-serif";
  x.fillText(`これまでの星 ${total} 個・星座 ${done} / 7`, 540, 230);
  x.font = "32px sans-serif";
  x.fillText("たんたん（短答の一問一答・非公式）", 540, 1305);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
  if (!blob) return;
  const file = new File([blob], "tantan-stars.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => undefined);
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const CHAPTERS = [
  { no: 1, title: "第一話　いちばん小さな星", at: 50 },
  { no: 2, title: "第二話　落とした星", at: 300 },
  { no: 3, title: "第三話　見習いの夜明け", at: 1000 },
];

/** 物語：解いた数で開く短い話（管理者は確かめるために全部開く） */
export function StoryTab({ theme, admin }: { theme: string; admin: boolean }) {
  const solved = solvedCount();
  const [open, setOpen] = useState<number | null>(null);
  const [k, setK] = useState(0);
  const lines: Line[] = open ? linesOf(`ch${open}_${theme}`, Infinity) : [];
  function start(no: number) {
    setOpen(no);
    setK(0);
    const l = linesOf(`ch${no}_${theme}`, Infinity)[0];
    if (l) playLine(l);
  }
  function next() {
    if (k + 1 < lines.length) {
      setK(k + 1);
      playLine(lines[k + 1]);
    } else {
      if (open === 3) playMove(theme, "finish");
      setOpen(null);
    }
  }
  if (open) {
    return (
      <div className="story-view">
        <button className="reveal-stage" aria-label="次へ" onClick={next}>
          <img src={`${charDir(theme)}ch${open}.webp`} alt="" />
        </button>
        {lines[k] && <Bubble tail="down" className="reveal-bubble">{lines[k].text}</Bubble>}
        <span className="muted small">絵を押すと次へ（{k + 1} / {lines.length}）</span>
      </div>
    );
  }
  return (
    <ul className="story-list">
      {CHAPTERS.map((c) => {
        const ok = admin || solved >= c.at;
        return (
          <li key={c.no}>
            <button className="secondary" disabled={!ok} onClick={() => start(c.no)}>
              {c.title}
              {!(solved >= c.at) && <span className="muted small">（正解した肢 {c.at} 個で開く。いま {solved}）</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 案の切り替え（管理者が比べる） */
export function IdeasTab({ theme }: { theme: string }) {
  useFx();
  const evo = evoOverride();
  return (
    <div className="ideas-tab">
      <p className="muted small">案の番号は docs/ritsu-special-ideas.md と同じです。いらない案を切って比べてください。切り替えは端末に残ります。</p>
      <div className="row">
        <button className="secondary" onClick={() => setAllFx(true)}>全部オン</button>
        <button className="secondary" onClick={() => setAllFx(false)}>全部オフ</button>
      </div>
      <ul className="ideas-list">
        {IDEAS.map((i) => (
          <li key={i.id}>
            <label>
              <input type="checkbox" checked={fxOn(i.id as IdeaId)} onChange={(e) => setFx(i.id, e.target.checked)} /> #{i.no} {i.name}
            </label>
          </li>
        ))}
      </ul>
      <p className="small">
        進化の段階（いまは {EVO_NAMES[evoStage()]}。正解した肢 {solvedCount()} 個）：
        {[null, 0, 1, 2].map((v) => (
          <button key={String(v)} className={`link evo-pick${evo === v ? " chosen" : ""}`} onClick={() => setEvoOverride(v)}>
            {v === null ? "実際の数" : EVO_NAMES[v]}
          </button>
        ))}
      </p>
      {fxOn("tryon") && (
        <p className="small">
          <button className="secondary" onClick={() => startTryOn(theme)}>試着を確かめる（{tryOnLeft() ? "試着中" : "10分"}）</button>
        </p>
      )}
    </div>
  );
}

/** 飾り棚：買う前の見え方（いまは管理者にだけ見せる。絵を一般に渡すには、見本だけ公開するかを決める） */
export function Showcase({ theme, name, desc }: { theme: string; name: string; desc?: string }) {
  return (
    <div className="showcase">
      <img src={`${charDir(theme)}tall.webp`} alt="" loading="lazy" />
      <div>
        <div className="showcase-kicker">特別な衣装（管理者だけの見本）</div>
        <strong>{name}</strong>
        {desc && <p className="small muted">{desc}</p>}
        <div className="row">
          <button className="secondary" onClick={() => playMove(theme, "entrance")}>登場を見る</button>
          {fxOn("tryon") && <button onClick={() => startTryOn(theme)}>10分だけ試着</button>}
        </div>
      </div>
    </div>
  );
}
