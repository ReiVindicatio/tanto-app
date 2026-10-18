import type { Explanation } from "./types";

function articleName(article: string): string {
  const [main, sub] = article.split("_");
  return sub ? `${main}条の${sub}` : `${main}条`;
}

/** AI 生成の解説。AI が作ったものだと分かる表示を必ず付ける */
export default function ExplanationView({ e }: { e: Explanation }) {
  return (
    <div className="explanation">
      <div className="ai-badge">AI が生成した解説</div>
      <p className="conclusion">{e.conclusion}</p>
      <p>{e.body}</p>
      {e.citations.length > 0 && (
        <details>
          <summary>引用した条文（e-Gov 法令 API から取得）</summary>
          <ul className="citations">
            {e.citations.map((c, i) => (
              <li key={i}>
                <div className="small">
                  {c.law}
                  {articleName(c.article)}
                  {c.paragraphs.join("・")}項
                  <span className="muted">（{c.fetched_at} 取得の現行条文）</span>
                </div>
                <blockquote>{c.quote}</blockquote>
              </li>
            ))}
          </ul>
        </details>
      )}
      {e.cases.length > 0 && (
        <details>
          <summary>挙げた判例（検索で実在と判示を確認）</summary>
          <ul className="citations">
            {e.cases.map((c, i) => (
              <li key={i}>
                <div className="small">
                  {c.court} {c.date}
                </div>
                <p className="small">判示の要旨（このアプリによる要約）：{c.holding}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="muted small">
        {e.model}・{e.prompt_version}・{e.generated_at} 生成。公式の○×との一致と、条文の引用の照合を通ったものだけを表示しています。誤りがありうるので、条文・判例は原典で確かめてください。
      </div>
    </div>
  );
}
