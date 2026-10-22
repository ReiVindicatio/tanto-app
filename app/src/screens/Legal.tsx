// プライバシーポリシー・利用規約（T040）。文はユーザーが確認して決める（Claude の案）
import { back } from "../router";

/** 運営者の表示（ハンドルネーム）と問い合わせ先。公開の前にユーザーが決める */
export const OPERATOR = "ReiVindicatio";
export const ISSUES = "https://github.com/ReiVindicatio/tanto-app/issues";
const ENACTED = "2026年10月20日";

function BackButton() {
  return (
    <button className="link" onClick={() => back({ name: "me" })}>
      ← 戻る
    </button>
  );
}

export function Privacy() {
  return (
    <section className="legal">
      <BackButton />
      <h1>プライバシーポリシー</h1>
      <p>
        このアプリ「たんたん」（以下「本アプリ」）の運営者 {OPERATOR}（以下「運営者」）は、利用者の情報を次のとおり扱います。
      </p>

      <h2>1. 集める情報</h2>
      <ul>
        <li>
          <strong>ログインしない場合</strong>：学習の記録は運営者のサーバーに送らず、利用者の端末（ブラウザ）の中だけに保存されます。
        </li>
        <li>
          <strong>閲覧状況</strong>：どのページが見られたか・どこから来たか・端末や国の種類などを、Cloudflare Web Analytics で集計します。Cookie を使わず、個人を特定・追跡しません。学習の記録は含みません。
        </li>
        <li>
          <strong>ログインした場合</strong>：
          <ul>
            <li>利用者を見分ける番号（Firebase Authentication が発行する利用者 ID）</li>
            <li>学習の記録（どの肢に、いつ答え、正解したか）と、★（あとで見直す）を付けた・外した肢と日時</li>
            <li>誤り報告で送られた文と、報告の対象（どの肢・問か）・見ていた解説の版</li>
          </ul>
        </li>
        <li>
          Google アカウントの名前・メールアドレスは、ログインの仕組み（Google の Firebase Authentication）が持ちます。運営者のサーバー（データベース）には保存しません。
        </li>
        <li>本アプリを配信している Cloudflare が、通信の記録（IP アドレス・日時など）を持ちます。</li>
      </ul>

      <h2>2. 使う目的</h2>
      <ul>
        <li>学習の記録を、利用者の複数の端末（スマホと PC など）で共有するため</li>
        <li>問題・解説の誤りを直すため（誤り報告）</li>
        <li>不正な利用・使いすぎからサービスを守るため</li>
        <li>どれだけ使われているかを知り、改善するため（閲覧状況）</li>
      </ul>
      <p>広告への利用、第三者への販売・提供はしません（法令にもとづく場合を除きます）。</p>

      <h2>3. 預け先（外部のサービス）</h2>
      <ul>
        <li>Google LLC（Firebase Authentication）：ログイン</li>
        <li>Cloudflare, Inc.（Workers・D1・Web Analytics）：本アプリの配信、学習の記録・誤り報告の保存、閲覧状況の集計</li>
      </ul>
      <p>これらの事業者のサーバーは日本の外にあることがあります。</p>

      <h2>4. 消し方（退会）</h2>
      <p>
        マイページの「記録を全部消す（退会）」で、サーバーにある学習の記録、ログインのアカウント、端末の記録を消せます。誤り報告は、問題・解説の誤りについての情報なので消さずに残し、送った人が分からない形（利用者 ID を消す）にします。
      </p>

      <h2>5. 変更</h2>
      <p>このポリシーを変えるときは、本アプリの中でお知らせします。</p>

      <h2>6. 問い合わせ</h2>
      <p>
        GitHub の Issues（
        <a href={ISSUES} target="_blank" rel="noreferrer">
          {ISSUES}
        </a>
        ）で受け付けます。Issues は誰でも読めるので、個人情報に関わることは書かないでください。学習の記録とアカウントは、マイページの「記録を全部消す（退会）」でご自身で消せます。問題・解説の誤りは、アプリの「誤りを報告」からも送れます。
      </p>

      <p className="muted small">{ENACTED} 制定・2026年10月21日 改定（閲覧状況の集計を追加）・2026年10月22日 改定（★の記録を追加）</p>
    </section>
  );
}

export function Terms() {
  return (
    <section className="legal">
      <BackButton />
      <h1>利用規約</h1>
      <p>「たんたん」（以下「本アプリ」）を使う前に、次の内容を確認してください。本アプリを使った時点で、この規約に同意したものとします。</p>

      <h2>1. 本アプリについて</h2>
      <ul>
        <li>本アプリは、{OPERATOR} が個人で作った、無料の学習アプリです。</li>
        <li>
          本アプリは<strong>法務省とは関係のない非公式のもの</strong>です。
        </li>
        <li>
          問題文・正解は、法務省ウェブサイト（https://www.moj.go.jp/jinji/shihoushiken/）が公開する PDF から本アプリが抽出・編集・加工したものです。肢ごとの○×は、公式の解答から本アプリが導いたものです。
        </li>
      </ul>

      <h2>2. 解説について</h2>
      <ul>
        <li>
          解説は <strong>AI が生成したもの</strong>です。公式の○×との一致と、条文の引用の照合を通ったものだけを載せていますが、正確さは保証しません。条文・判例は原典で確かめてください。
        </li>
        <li>正解は出題時点のものです。その後の法改正で、今の法律では正誤が変わっていることがあります。</li>
      </ul>

      <h2>3. してはいけないこと</h2>
      <ul>
        <li>サーバーに過大な負荷をかけること（自動で大量に送信するなど）</li>
        <li>不正なアクセス、他人のアカウントを使うこと</li>
        <li>本アプリの運営を妨げること</li>
      </ul>

      <h2>4. 責任</h2>
      <ul>
        <li>本アプリを使って生じた損害（試験の結果を含みます）について、運営者は責任を負いません。</li>
        <li>本アプリは、予告なく内容を変えたり、提供を止めたりすることがあります。学習の記録が失われることもあります。</li>
      </ul>

      <h2>5. 変更</h2>
      <p>この規約を変えるときは、本アプリの中でお知らせします。</p>

      <p className="muted small">{ENACTED} 制定</p>
    </section>
  );
}
