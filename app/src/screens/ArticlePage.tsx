// 条文の画面（T060）：条の全文（e-Gov から保存した現行法）と、その条を解説が引いた過去の肢。そのまま解ける
import { useEffect, useState } from "react";
import type { SetInfo } from "../types";
import { EXAM_SHORT } from "../data";
import { back } from "../router";
import { startChosen } from "../play";
import { getHistory } from "../history";
import { refOf } from "../topics";
import { articleCards, articleLabel, loadArticleIndex, loadLawTexts, wrongCount, yearsOf, type ArticleIndex, type ArticleText, type LawTexts } from "../articles";

export default function ArticlePage({ law, article, sets }: { law: string; article: string; sets: SetInfo[] }) {
  const [index, setIndex] = useState<ArticleIndex | null>(null);
  const [texts, setTexts] = useState<LawTexts | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadArticleIndex()
      .then((i) => {
        if (!alive) return;
        setIndex(i);
        const id = i.laws[law]?.id;
        if (id) return loadLawTexts(id).then((t) => alive && setTexts(t));
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [law]);

  const ids = index ? articleCards(index, law, article) : [];
  const text: ArticleText | undefined = texts?.articles[article];
  const setIds = new Set(sets.map((s) => s.id));
  const playable = ids.filter((id) => setIds.has(id.replace(/-q\d+.*$/, "")));
  const wrong = wrongCount(ids, getHistory());
  const label = articleLabel(article);

  return (
    <section className="article-page">
      <div className="toolbar">
        <button className="link" onClick={() => back({ name: "subjects" })}>
          ← 戻る
        </button>
      </div>
      <h1>
        {law} {label}
        {text?.caption && <span className="muted article-caption"> {text.caption}</span>}
      </h1>
      {error && <p className="error small">読めませんでした：{error}</p>}
      {!index && !error && <p className="muted">読み込み中…</p>}

      {index && (
        <>
          <div className="card article-text">
            {text ? (
              text.paragraphs.map((p, k) => (
                <p key={k}>
                  {text.paragraphs.length > 1 && <span className="muted">{p.num}　</span>}
                  {p.text.split("\n").map((line, j) => (
                    <span key={j} className={j > 0 ? "article-item" : ""}>
                      {line}
                    </span>
                  ))}
                </p>
              ))
            ) : (
              <p className="muted small">この条の本文は保存していません。</p>
            )}
            {texts && (
              <p className="muted small">
                e-Gov 法令 API から取得した現行の条文（{texts.fetched_at} 取得）。古い年度の肢は、改正前の条文で出題されていることがあります。
              </p>
            )}
          </div>

          <h2>この条を引いた肢</h2>
          {ids.length === 0 ? (
            <p className="small">この条を引いた解説はありません。</p>
          ) : (
            <div className="card">
              <p>
                <strong className="big">{ids.length}</strong> 枚
                {wrong > 0 && <span className="small">（前回まちがえた {wrong} 枚）</span>}
              </p>
              <p className="small muted">
                {yearsOf(ids)
                  .map((y) => `${EXAM_SHORT[y.exam] ?? y.exam} ${y.year}${y.count > 1 ? `（${y.count}）` : ""}`)
                  .join("・")}
              </p>
              <button className="wide" disabled={playable.length === 0} onClick={() => startChosen(sets, playable.map(refOf), `${law} ${label}`)}>
                この条の肢を解く（{playable.length}枚）
              </button>
              <p className="muted small">解説が引いた条文から数えたものです（AI が生成した解説に基づき、公式の分類ではありません）。</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
