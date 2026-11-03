// 特別な衣装の固有の仕組み（docs/ritsu-special-ideas.md）：絵だけでなく、座る場所・粒・答えたときの反応・育つもの・画面の色を衣装ごとに持つ
export type Seat = "moon" | "branch" | "spot" | "book" | "ice";
export type Reaction = "scale" | "petals" | "light" | "page" | "crystal";
export type Grow = "sky" | "tree" | "crowd" | "shelf" | "castle";

export type Kit = {
  /** 律のまわりの粒・答えたときに飛ぶもの */
  particle: string;
  seat: Seat;
  reaction: Reaction;
  grow: Grow;
  /** 育つもののタブの名前 */
  growName: string;
  /** 1つ解いて増えるものの呼び名 */
  unit: string;
  /** 相棒の名前 */
  pal: string;
  /** 進化の3段階の呼び名 */
  evo: [string, string, string];
  /** 物語の3話の題 */
  chapters: [string, string, string];
  /** 画面のテーマの名前。dark：暗い表示にするか */
  world: { name: string; dark: boolean };
  /** アプリ全体の背景に使う絵 */
  worldBg: string;
  /** 今夜の月（背景に月のない絵とセリフがある）・色違い・腰かけのループ動画 */
  realMoon?: boolean;
  dawn?: boolean;
  sitLoop?: boolean;
  /** 固有モーション（押すと出る。ときどき自動でも出る）。rare はたまにしか出ない。geo はふだんの絵の幅に対する動画の位置 [左, 上, 幅]（ritsu_motion.py が表示する） */
  motions?: { clips: { name: string; rare?: boolean }[]; geo: [number, number, number] };
  /** 律のページの動画が古い服のままなので、流さない */
  noStageVideo?: boolean;
  /** 生きた座り絵と全画面の技がある衣装（1着ずつ作る）。strength・dir は絵の動く強さと向き、flip は左右反転（律は画面の右端にいるので、右へ流れる絵は反転する）。 */
  live?: { kind: "cape" | "books" | "ring" | "branch" | "stage"; signature: "meteor" | "pages" | "ice" | "sakura" | "curtain"; strength: number; dir: [number, number]; flip: boolean };
};

export const KITS: Record<string, Kit> = {
  hoshiyomi: {
    particle: "★",
    seat: "moon",
    reaction: "scale",
    grow: "sky",
    growName: "夜空",
    unit: "星",
    pal: "星の子",
    evo: ["見習い", "星読み", "裁定者"],
    chapters: ["第一話　いちばん小さな星", "第二話　落とした星", "第三話　見習いの夜明け"],
    world: { name: "夜空", dark: true },
    worldBg: "bg-nomoon.webp",
    realMoon: true,
    dawn: true,
    sitLoop: true,
    live: { kind: "cape", signature: "meteor", strength: 1.7, dir: [1, 0], flip: true },
  },
  hakama: {
    particle: "❀",
    seat: "branch",
    reaction: "petals",
    grow: "tree",
    growName: "桜の木",
    unit: "花",
    pal: "花びらの子",
    evo: ["つぼみ", "五分咲き", "満開"],
    chapters: ["第一話　冬の校庭", "第二話　春の雨", "第三話　満開の朝"],
    world: { name: "桜", dark: false },
    worldBg: "bg.webp",
    motions: { clips: [{ name: "twirl" }, { name: "wave" }, { name: "petalize" }, { name: "magic" }, { name: "split" }, { name: "bloom" }, { name: "gust", rare: true }, { name: "crack", rare: true }], geo: [-0.1429, -1.2093, 1.2857] },
    live: { kind: "branch", signature: "sakura", strength: 0.5, dir: [1, 0], flip: false },
  },
  diva: {
    particle: "✦",
    seat: "spot",
    reaction: "light",
    grow: "crowd",
    growName: "客席",
    unit: "光",
    pal: "ペンライトの子",
    evo: ["練習生", "新人", "歌姫"],
    chapters: ["第一話　小さな部屋", "第二話　はじめての舞台", "第三話　光の海"],
    world: { name: "舞台", dark: true },
    worldBg: "bg.webp",
    noStageVideo: true,
    motions: { clips: [{ name: "heart" }, { name: "point" }, { name: "sing" }, { name: "boomerang" }, { name: "change" }, { name: "dancers" }, { name: "resonate" }, { name: "tiara", rare: true }, { name: "popper", rare: true }], geo: [-0.2631, -1.2234, 1.5263] },
    live: { kind: "stage", signature: "curtain", strength: 0.5, dir: [1, 0], flip: false },
  },
  nocturne: {
    motions: { clips: [{ name: "read" }, { name: "chomp", rare: true }], geo: [-0.6351, -1.9713, 2.2667] },
    live: { kind: "books", signature: "pages", strength: 0.35, dir: [0, -1], flip: false },
    particle: "✧",
    seat: "book",
    reaction: "page",
    grow: "shelf",
    growName: "本棚",
    unit: "頁",
    pal: "迷子の本",
    evo: ["見習い", "書架番", "司書"],
    chapters: ["第一話　銀の鍵", "第二話　崩れた本の山", "第三話　夜明けの閉館"],
    world: { name: "真夜中の図書館", dark: true },
    worldBg: "bg.webp",
  },
  yukihana: {
    particle: "❄",
    seat: "ice",
    reaction: "crystal",
    grow: "castle",
    growName: "氷の城",
    unit: "結晶",
    pal: "とけない雪",
    evo: ["雪の子", "雪姫", "雪花の姫君"],
    chapters: ["第一話　最初の氷", "第二話　吹雪の夜", "第三話　小さな城"],
    world: { name: "氷の城", dark: true },
    worldBg: "bg.webp",
    motions: { clips: [{ name: "swing" }, { name: "bloom" }, { name: "rabbit" }, { name: "breath" }, { name: "freeze" }, { name: "mirror" }, { name: "bunnies" }, { name: "sneeze", rare: true }, { name: "snowball", rare: true }], geo: [-0.2493, -1.0278, 1.4986] },
    live: { kind: "ring", signature: "ice", strength: 0.5, dir: [1, 0], flip: false },
  },
};

/** 衣装の仕組み（表にない特別な衣装は星詠みと同じ形。絵は R2 にあるものだけ） */
export function kitOf(theme: string): Kit {
  return KITS[theme] ?? { ...KITS.hoshiyomi, realMoon: false, dawn: false, sitLoop: false, worldBg: "bg.webp" };
}
