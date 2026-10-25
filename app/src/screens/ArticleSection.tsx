// 科目の画面の「条文から解く」（T060）：条の番号で探す欄と、よく出る条文（解説が引いた肢の多い順）。押すと条文の画面
import { useEffect, useState } from "react";
import type { SetInfo } from "../types";
import { navigate } from "../router";
import { articleLabel, lawsOfSubject, loadArticleIndex, parseArticleInput, topArticles, type ArticleIndex } from "../articles";

const TOP = 20;
// 開いた状態は解いて戻ってきても保つ
const opened = new Set<string>();

export default function ArticleSection({ subject, pool }: { subject: string; pool: SetInfo[] }) {
  const [open, setOpenState] = useState(opened.has(subject));
  const [index, setIndex] = useState<ArticleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [law, setLaw] = useState<string>("");
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const setOpen = (v: boolean) => {
    if (v) opened.add(subject);
    else opened.delete(subject);
    setOpenState(v);
  };
  useEffect(() => {
    if (!open || index) return;
    loadArticleIndex().then(setIndex, (e) => setError(String(e)));
  }, [open, index]);

  const setIds = new Set(pool.map((s) => s.id));
  const laws = index ? lawsOfSubject(index, subject, setIds) : [];
  const chosenLaw = law || laws[0] || "";
  const top = index ? topArticles(index, subject, setIds) : [];

  function search() {
    const a = parseArticleInput(input);
    if (!a) return setMsg("条の番号を「94」「94の2」のように入れてください。");
    if (!index?.laws[chosenLaw]?.articles[a]) return setMsg(`${chosenLaw}${articleLabel(a)}を引いた解説はありません。`);
    setMsg(null);
    navigate({ name: "article", law: chosenLaw, article: a });
  }

  return (
    <details className="set articles" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="set-title">条文から解く（よく出る条文・条の番号で探す）</summary>
      {error && <p className="error small">読めませんでした：{error}</p>}
      {open && !index && !error && <p className="muted small">読み込み中…</p>}
      {index && (
        <>
          <form
            className="row article-search"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <select aria-label="法令" value={chosenLaw} onChange={(e) => setLaw(e.target.value)}>
              {laws.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <input aria-label="条の番号" inputMode="numeric" placeholder="例：94・94の2" value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="secondary small" type="submit">
              探す
            </button>
          </form>
          {msg && <p className="small error">{msg}</p>}
          <div className="muted small">よく出る条文（解説が引いた肢の多い順。AI が生成した解説に基づき、公式の分類ではありません）</div>
          <ol className="article-top">
            {(all ? top : top.slice(0, TOP)).map((a) => (
              <li key={`${a.law}-${a.article}`}>
                <button className="link" onClick={() => navigate({ name: "article", law: a.law, article: a.article })}>
                  {a.law === laws[0] ? "" : a.law}
                  {articleLabel(a.article)}
                </button>
                <span className="muted small">　{a.count}枚</span>
                {index.laws[a.law]?.captions?.[a.article] && <div className="muted small article-cap">{index.laws[a.law].captions![a.article]}</div>}
              </li>
            ))}
          </ol>
          {!all && top.length > TOP && (
            <button className="link small" onClick={() => setAll(true)}>
              もっと見る（全部で{top.length}条）
            </button>
          )}
        </>
      )}
    </details>
  );
}
