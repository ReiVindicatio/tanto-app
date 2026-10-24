// 科目の画面の「よく似た肢を続けて解く」（T050）：文がよく似ているのに○×が逆の肢を、組の2枚続けて解く
import { useEffect, useState } from "react";
import type { SetInfo } from "../types";
import { startInOrder } from "../play";
import { loadTwinsWhenIdle, pairCount, pairDeck, twinsIfLoaded, type Twins } from "../twins";

export default function TwinSection({ subject, name, pool }: { subject: string; name: string; pool: SetInfo[] }) {
  const [twins, setTwins] = useState<Twins | null>(twinsIfLoaded());
  useEffect(() => {
    if (!twins) return loadTwinsWhenIdle(setTwins); // 読めなければ（通信なしなど）欄を出さない
  }, [twins]);

  if (!twins) return null;
  const setIds = new Set(pool.map((s) => s.id));
  const n = pairCount(twins, subject, setIds);
  if (n === 0) return null;
  return (
    <div className="set twins-set">
      <div className="set-title">よく似た肢（○×が逆）</div>
      <div className="muted small">
        文がよく似ているのに○×が逆の肢を、2枚続けて解きます。2枚目に答えると、違うところに色を付けて並べます。
      </div>
      <div className="row">
        <button className="secondary" onClick={() => startInOrder(pool, pairDeck(twins, subject, setIds), `${name} よく似た肢`)}>
          続けて解く（{n}組）
        </button>
      </div>
    </div>
  );
}
