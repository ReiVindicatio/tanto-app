// マイページの「まちがえやすい型」（T059）：ひっかけの型ごとに、×の肢を○と答えた（ひっかかった）割合。型ごとに解ける
import { useEffect, useState } from "react";
import type { SetInfo } from "../types";
import type { CardRef } from "../data";
import { startChosen } from "../play";
import { loadTrapsWhenIdle, MIN_TRAP_ANSWERED, trapDeck, trapsIfLoaded, trapStats, type TrapsDoc } from "../traps";

const pct = (r: number) => `${Math.round(r * 100)}%`;

export default function TrapSection({ sets, pool }: { sets: SetInfo[]; pool: CardRef[] }) {
  const [traps, setTraps] = useState<TrapsDoc | null>(trapsIfLoaded());
  useEffect(() => {
    if (!traps) return loadTrapsWhenIdle(setTraps); // 読めなければ（通信なしなど）欄を出さない
  }, [traps]);
  if (!traps) return null;
  const stats = trapStats(traps);
  return (
    <>
      <h2>まちがえやすい型</h2>
      <div className="card trap-stats">
        <p className="muted small">
          ×の肢が「どう誤りにしてあるか」の型（AI による分類）ごとに、前回○と答えてしまった割合です。その型の×の肢に{MIN_TRAP_ANSWERED}枚以上答えると出ます。
        </p>
        {stats.length === 0 && <p className="small">まだ出せる型がありません。×の肢を解いていくと出てきます。</p>}
        <ul className="trap-list">
          {stats.map((s) => (
            <li key={s.type}>
              <div className="grow">
                <div className="row-title">{s.name}</div>
                <div className="muted small">{s.desc}</div>
                <div className="small">
                  ひっかかった {s.fell} / {s.answered}枚（{pct(s.rate)}）
                </div>
              </div>
              <button className="secondary small" onClick={() => startChosen(sets, trapDeck(traps, s.type, pool), `型：${s.name}`)}>
                この型を解く
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
