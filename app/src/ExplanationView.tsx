import type { Explanation, QuestionExplanation } from "./types";
import { navigate } from "./router";
import { MINPO_REFORM_YEAR } from "./LawNote";

function articleName(article: string): string {
  const [main, sub] = article.split("_");
  return sub ? `${main}条の${sub}` : `${main}条`;
}

/** 民法の債権法改正より前の出題か（T013：その解説は現行の条文で説明している）。ID は <試験>-<年>-<科目>-q… */
export function explainedUnderCurrentLaw(id: string): boolean {
  const m = /^(?:yobi|shiho)-(\d{4})-minpo-/.exec(id);
  return m !== null && Number(m[1]) < MINPO_REFORM_YEAR;
}

/** AI 生成の解説。AI が作ったものだと分かる表示を必ず付ける */
export default function ExplanationView({ e }: { e: Explanation | QuestionExplanation }) {
  const question = "question_id" in e; // 問の解説（T018）は、公式の正解との一致を検査している
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
                  {/* 押すと条文の画面（T060）：条の全文と、その条を引いた過去の肢 */}
                  <button className="link small article-link" onClick={() => navigate({ name: "article", law: c.law, article: c.article })}>
                    {c.law}
                    {articleName(c.article)}
                  </button>
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
      {/* 生成の情報と注意書きは畳む（答え合わせの画面を短くする：2026-10-25）。AI が作った印（上の ai-badge）はいつも見せる */}
      <details className="explanation-about">
        <summary>この解説について</summary>
        <div className="muted small">
          {e.model}・{e.prompt_version}・{e.generated_at} 生成。{question ? "公式の正解との一致" : "公式の○×との一致"}と、条文の引用の照合を通ったものだけを表示しています。誤りがありうるので、条文・判例は原典で確かめてください。
          {explainedUnderCurrentLaw("question_id" in e ? e.question_id : e.statement_id) &&
            " この問は民法（債権関係）の改正（2020年4月施行）より前の出題で、解説は現行の条文で説明しています（出題時点の条文とは異なることがあります）。"}
        </div>
      </details>
    </div>
  );
}
