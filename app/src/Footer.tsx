import type { Attribution } from "./types";
import { navigate } from "./router";

// 出典の表記（公共データ利用規約 第1.0版の条件）。法務省が作成したかのような見せ方をしない
export default function Footer({ attribution }: { attribution?: Attribution }) {
  return (
    <footer className="footer">
      <p>{attribution?.text ?? "出典：法務省ウェブサイト（https://www.moj.go.jp/jinji/shihoushiken/）"}</p>
      <p>
        問題文・正解は法務省が公開する PDF から、このアプリが抽出・編集・加工したものです。肢ごとの○×は公式の解答から導いたものです。
      </p>
      <p>このアプリは法務省とは関係のない個人が作成した非公式のものです。</p>
      {/* ポリシーの改定のお知らせ（ポリシーの5.「本アプリの中でお知らせします」。T046）。1か月出す */}
      {Date.now() < Date.parse("2026-11-21T00:00:00+09:00") && (
        <p className="small">
          お知らせ：2026年10月21日に
          <button className="link small" onClick={() => navigate({ name: "privacy" })}>
            プライバシーポリシー
          </button>
          を改定しました（閲覧状況の集計を追加）。
        </p>
      )}
      <p className="footer-links">
        <a className="small" href="/q/">
          過去問の一覧（問題文と解説）
        </a>
        <button className="link small" onClick={() => navigate({ name: "terms" })}>
          利用規約
        </button>
        <button className="link small" onClick={() => navigate({ name: "privacy" })}>
          プライバシーポリシー
        </button>
      </p>
      {attribution && attribution.source_pdfs.length > 0 && (
        <details>
          <summary>元の PDF</summary>
          <ul>
            {attribution.source_pdfs.map((u) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noreferrer">
                  {u}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </footer>
  );
}
