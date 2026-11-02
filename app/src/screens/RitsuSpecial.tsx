// 特別な衣装の律のページのタブ（docs/ritsu-special-ideas.md）：衣装ごとに育つもの（夜空・桜の木・客席・本棚・氷の城）・物語・案の切り替え・飾り棚・成果カード
import { useMemo, useState } from "react";
import { charDir } from "../character";
import { currentState, localDate, subjectOf } from "../learning";
import { Bubble } from "../Ritsu";
import { playMove, startTryOn, tryOnLeft } from "../ritsu/special";
import { fxOn, IDEAS, setAllFx, setFx, useFx, type IdeaId } from "../ritsu/fx";
import { linesOf, playLine, type Line } from "../ritsu/lines";
import { evoOverride, evoStage, setEvoOverride, solvedCount } from "../ritsu/themes";
import { kitOf } from "../ritsu/kits";
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

type ArtProps = { counts: Record<string, string[]>; full: boolean; pick: (s: string) => void };

/** 1科目で「できた」とみなす、正解した肢の数（見本は全部これ以上） */
const GROW_GOAL = 120;
const countOf = (p: ArtProps, s: string) => (p.full ? 999 : (p.counts[s]?.length ?? 0));
const shownIds = (p: ArtProps, s: string, max: number) => (p.full ? Array.from({ length: max }, (_, k) => `${s}-${k}`) : (p.counts[s] ?? []).slice(0, max));

/** 自分の夜空：正解した肢が星になり、科目ごとの星座の点が灯っていく */
function SkyArt(p: ArtProps) {
  const dots: { x: number; y: number; r: number; o: number; k: string }[] = [];
  for (const subject of SUBJECT_ORDER) {
    const pts = CONSTELLATIONS[subject];
    for (const id of shownIds(p, subject, p.full ? 120 : 150)) {
      const h = hash(id);
      const [cx, cy] = pts[h % pts.length];
      dots.push({ x: cx + ((h >>> 8) % 90) - 45, y: cy + ((h >>> 16) % 90) - 45, r: 0.5 + ((h >>> 4) % 10) / 12, o: 0.35 + ((h >>> 12) % 60) / 100, k: id });
    }
  }
  return (
    <>
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
        const lit = Math.min(pts.length, Math.floor(countOf(p, s) / PER_VERTEX));
        return (
          <g key={s} onClick={() => p.pick(s)} className="sky-group">
            <polyline points={pts.slice(0, lit).map((v) => v.join(",")).join(" ")} fill="none" stroke="#e8c35a" strokeWidth="0.9" opacity="0.75" />
            {pts.map(([x, y], k) => (
              <circle key={k} cx={x} cy={y} r={k < lit ? 3 : 1.6} fill={k < lit ? "#ffe9a0" : "#5a648f"} className={k < lit ? "sky-lit" : ""} />
            ))}
            <circle cx={pts[0][0]} cy={pts[0][1]} r="26" fill="transparent" />
          </g>
        );
      })}
    </>
  );
}

/** 枝の先（科目ごと） */
const BRANCHES: Record<string, [number, number]> = { kenpo: [180, 70], minpo: [70, 120], shoho: [292, 118], minso: [40, 215], keiho: [320, 210], keiso: [95, 285], gyosei: [268, 285] };

/** 桜の木：科目ごとの枝に、正解した肢の数だけ花が咲く */
function TreeArt(p: ArtProps) {
  return (
    <>
      <defs>
        <linearGradient id="tree-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6f4fb" />
          <stop offset="1" stopColor="#fff2f6" />
        </linearGradient>
      </defs>
      <rect width="360" height="460" fill="url(#tree-grad)" />
      <path d="M 0 430 C 90 410 270 412 360 432 L 360 460 L 0 460 Z" fill="#cfe5b9" />
      <path d="M 166 430 C 172 370 170 310 178 250 L 194 250 C 192 310 196 370 208 430 Z" fill="#7d5340" />
      {SUBJECT_ORDER.map((s) => {
        const [x, y] = BRANCHES[s];
        return <path key={s} d={`M 186 ${Math.max(y + 60, 260)} Q ${(186 + x) / 2} ${y + 40} ${x} ${y}`} stroke="#7d5340" strokeWidth="6" strokeLinecap="round" fill="none" />;
      })}
      {SUBJECT_ORDER.map((s) => {
        const [x, y] = BRANCHES[s];
        const ids = shownIds(p, s, 150);
        return (
          <g key={s} onClick={() => p.pick(s)} className="sky-group">
            <circle cx={x} cy={y} r="42" fill="transparent" />
            <circle cx={x} cy={y} r="4" fill={ids.length ? "#f49bb9" : "#a9cf8e"} />
            {ids.map((id) => {
              const h = hash(id);
              const a = ((h % 360) * Math.PI) / 180;
              const d = 4 + ((h >>> 9) % 40);
              return <circle key={id} cx={x + Math.cos(a) * d} cy={y + Math.sin(a) * d * 0.85} r={2.2 + ((h >>> 5) % 3)} fill={(h >>> 3) % 3 ? "#f9c4d6" : "#f49bb9"} opacity="0.9" />;
            })}
          </g>
        );
      })}
    </>
  );
}

const CROWD_COLORS: Record<string, string> = { kenpo: "#ffe27a", minpo: "#ff9ec7", shoho: "#9fe8ff", minso: "#c6a7ff", keiho: "#ff8f8f", keiso: "#a8f0b6", gyosei: "#ffbe7a" };

/** 客席：正解した肢の数だけペンライトが灯る。科目ごとの区画が埋まると照明がつく */
function CrowdArt(p: ArtProps) {
  return (
    <>
      <rect width="360" height="460" fill="#120e2c" />
      {SUBJECT_ORDER.map((s, k) => {
        const on = Math.min(1, countOf(p, s) / GROW_GOAL);
        const x = 24 + k * 52;
        return <path key={s} d={`M ${x} 0 L ${x - 30} 130 L ${x + 30} 130 Z`} fill={CROWD_COLORS[s]} opacity={0.05 + on * 0.4} />;
      })}
      <path d="M 40 128 L 320 128 L 340 170 L 20 170 Z" fill="#2a2350" stroke="#e7c6ff" strokeWidth="1.5" />
      {SUBJECT_ORDER.map((s, k) => (
        <g key={s} onClick={() => p.pick(s)} className="sky-group">
          <rect x={k * (360 / 7)} y="180" width={360 / 7} height="280" fill="transparent" />
          {shownIds(p, s, 150).map((id) => {
            const h = hash(id);
            return <circle key={id} cx={k * (360 / 7) + 5 + (h % 42)} cy={190 + ((h >>> 8) % 262)} r="1.8" fill={CROWD_COLORS[s]} className="crowd-light" style={{ animationDelay: `${(h >>> 4) % 20 / 10}s` }} />;
          })}
          <text x={k * (360 / 7) + 26} y="176" fontSize="8" textAnchor="middle" fill="#cfc8e8">{SUBJECT_NAME[s].slice(0, 2)}</text>
        </g>
      ))}
    </>
  );
}

/** 本棚：科目ごとの棚に、正解した肢 6 個で本が1冊ふえる */
function ShelfArt(p: ArtProps) {
  return (
    <>
      <rect width="360" height="460" fill="#191327" />
      {SUBJECT_ORDER.map((s, k) => {
        const y = 12 + k * 64;
        const books = Math.min(30, Math.floor(countOf(p, s) / 6));
        let x = 46;
        return (
          <g key={s} onClick={() => p.pick(s)} className="sky-group">
            <rect x="0" y={y} width="360" height="62" fill="transparent" />
            <text x="24" y={y + 34} fontSize="9" textAnchor="middle" fill="#cfc8e8">{SUBJECT_NAME[s].slice(0, 2)}</text>
            {Array.from({ length: books }, (_, b) => {
              const h = hash(`${s}${b}`);
              const w = 7 + (h % 5);
              const tall = 34 + ((h >>> 6) % 16);
              const bx = x;
              x += w + 1;
              return <rect key={b} x={bx} y={y + 54 - tall} width={w} height={tall} rx="1" fill={["#6b4e8e", "#3e5f8e", "#8e4e5f", "#3f7a6e", "#8a7a4a"][(h >>> 3) % 5]} stroke="#cfc8e8" strokeWidth="0.4" />;
            })}
            <rect x="40" y={y + 54} width="312" height="5" fill="#5a4a3c" />
          </g>
        );
      })}
    </>
  );
}

/** 氷の城：科目ごとの塔に、正解した肢 15 個でブロックが1つ積まれる。積みきると屋根がつく */
function CastleArt(p: ArtProps) {
  return (
    <>
      <defs>
        <linearGradient id="castle-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6edf9" />
          <stop offset="1" stopColor="#f6fcff" />
        </linearGradient>
      </defs>
      <rect width="360" height="460" fill="url(#castle-grad)" />
      <rect y="420" width="360" height="40" fill="#fff" />
      {SUBJECT_ORDER.map((s, k) => {
        const x = 8 + k * 50;
        const levels = [8, 10, 12, 16, 12, 10, 8][k];
        const n = Math.min(levels, Math.floor(countOf(p, s) / PER_VERTEX));
        return (
          <g key={s} onClick={() => p.pick(s)} className="sky-group">
            <rect x={x} y="60" width="44" height="370" fill="transparent" />
            {Array.from({ length: levels }, (_, b) => (
              <rect key={b} x={x + 2} y={420 - (b + 1) * 22} width="40" height="21" rx="2" fill={b < n ? "#a9dcf3" : "none"} stroke={b < n ? "#6fb6d8" : "#cfe6f2"} strokeWidth="1" strokeDasharray={b < n ? undefined : "3 3"} />
            ))}
            {n >= levels && <path d={`M ${x} ${420 - levels * 22} L ${x + 22} ${420 - levels * 22 - 30} L ${x + 44} ${420 - levels * 22} Z`} fill="#8cc9e8" stroke="#6fb6d8" />}
            <text x={x + 22} y="436" fontSize="9" textAnchor="middle" fill="#3f6f92">{SUBJECT_NAME[s].slice(0, 2)}</text>
          </g>
        );
      })}
      {Array.from({ length: 30 }, (_, k) => {
        const h = hash(`snow${k}`);
        return <circle key={k} cx={h % 360} cy={(h >>> 9) % 420} r={1 + (h >>> 4) % 2} fill="#fff" opacity="0.85" />;
      })}
    </>
  );
}

const ARTS = { sky: SkyArt, tree: TreeArt, crowd: CrowdArt, shelf: ShelfArt, castle: CastleArt };

/** 衣装ごとに育つもの：正解した肢から作る。解かなくても減らない。見た目だけで、学習の内容は変わらない */
export function GrowTab({ theme }: { theme: string }) {
  const kit = kitOf(theme);
  const [full, setFull] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const counts = useMemo(skyCounts, []);
  const Art = ARTS[kit.grow];
  const total = Object.values(counts).reduce((n, v) => n + v.length, 0);
  const goalOf = (s: string) => (kit.grow === "sky" ? CONSTELLATIONS[s].length * PER_VERTEX : GROW_GOAL);
  const done = SUBJECT_ORDER.filter((s) => (full ? 999 : (counts[s]?.length ?? 0)) >= goalOf(s)).length;
  return (
    <div className="sky-tab">
      <svg className="sky-svg" viewBox="0 0 360 460" role="img" aria-label={`${kit.growName}。正解した肢 ${total} 個`}>
        <Art counts={counts} full={full} pick={setPicked} />
      </svg>
      <p className="muted small">
        正解した肢 {total} 個が{kit.unit}になっています。できた科目 {done} / 7。休んでも減りません。{picked && `${SUBJECT_NAME[picked]}は ${counts[picked]?.length ?? 0} 個（${goalOf(picked)} 個でできあがり）`}
      </p>
      <div className="row">
        <button className="secondary" onClick={() => setFull(!full)}>{full ? "自分のものに戻す" : `見本：できあがった${kit.growName}`}</button>
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
  const kit = kitOf(theme);
  x.fillText(`今日の${kit.unit} ${today?.correct ?? 0} 個`, 540, 150);
  x.font = "44px sans-serif";
  x.fillText(`これまでの${kit.unit} ${total} 個・できた科目 ${done} / 7`, 540, 230);
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
  { no: 1, at: 50 },
  { no: 2, at: 300 },
  { no: 3, at: 1000 },
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
              {kitOf(theme).chapters[c.no - 1]}
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
        進化の段階（いまは {kitOf(theme).evo[evoStage()]}。正解した肢 {solvedCount()} 個）：
        {[null, 0, 1, 2].map((v) => (
          <button key={String(v)} className={`link evo-pick${evo === v ? " chosen" : ""}`} onClick={() => setEvoOverride(v)}>
            {v === null ? "実際の数" : kitOf(theme).evo[v]}
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
