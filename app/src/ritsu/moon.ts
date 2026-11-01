// 本物の月の形（docs/ritsu-special-ideas.md の17）：朔望月からの概算。天文の暦ほどは正確でない（±半日ほど）
const SYNODIC = 29.530588853;
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14);

/** 月齢（0〜29.53。0＝新月、約14.8＝満月） */
export function moonAge(d: Date): number {
  const days = (d.getTime() - NEW_MOON_2000) / 86400000;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC;
}

/** 0＝新月・1＝満ちていく・2＝満月・3＝欠けていく（セリフを選ぶ） */
export function moonKind(d: Date): 0 | 1 | 2 | 3 {
  const a = moonAge(d);
  if (a < 1.5 || a > SYNODIC - 1.5) return 0;
  if (a < 13.3) return 1;
  if (a < 16.3) return 2;
  return 3;
}

/** 光っている部分の形の SVG パス（半径 r、中心 0,0） */
export function moonPath(d: Date, r: number): string {
  const phase = moonAge(d) / SYNODIC; // 0〜1
  const waxing = phase < 0.5;
  const k = Math.cos(phase * 2 * Math.PI); // 1＝新月 … -1＝満月
  const sweepOuter = waxing ? 1 : 0;
  const rx = Math.abs(k) * r;
  const sweepInner = (waxing ? k > 0 : k < 0) ? 0 : 1;
  return `M 0 ${-r} A ${r} ${r} 0 0 ${sweepOuter} 0 ${r} A ${rx} ${r} 0 0 ${sweepInner} 0 ${-r} Z`;
}
