// 問ごとの静的ページとサイトマップを作る（T045）。検索エンジンが問題文・解説を読めるように、
// アプリ（JavaScript で描く画面）とは別に、ふつうの HTML を書き出す。
//   node scripts/pages.mjs   （npm run build の最後に流れる。dist/data/*.json を読み、dist/q/・dist/sitemap.xml を書く）
// 見せ方の決まり（CLAUDE.md）：出典の表記と編集・加工の記載を必ず入れる。法務省が作成したかのように見せない。
// AI が生成した解説には、そうと分かる表示を付ける。正解と解説は「解いてから見る」ように折りたたむ
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE = (process.env.SITE_URL ?? "https://tantan.reivindicatio0321.workers.dev").replace(/\/$/, "");
const APP = "たんたん";
const SUBTITLE = "予備・司法 短答の一問一答（非公式）";

// アプリの LawNote.tsx と同じ区切り（古い年度の肢は出題時点の正解で、その後の法改正を反映していない）
const LATEST_YEAR = 2026;
const MINPO_REFORM_YEAR = 2020;
const KEIHO_KOKIN_YEAR = 2025;

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** 改行を保ったまま段落にする */
function para(s, cls = "") {
  return `<p${cls ? ` class="${cls}"` : ""}>${esc(s).replace(/\n/g, "<br>")}</p>`;
}

const ANSWER_SLOTS = /[（(]解答欄は[^）)]*[）)]/g;

/** 一覧や meta description に使う短い問の説明（解答欄の番号は除く） */
export function summary(q, n = 110) {
  const t = q.stem.replace(ANSWER_SLOTS, "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function lawNote(q) {
  if (q.exam.year >= LATEST_YEAR) return "";
  const t =
    q.subject === "minpo" && q.exam.year < MINPO_REFORM_YEAR
      ? "2017年の民法（債権関係）改正（2020年4月施行）より前の出題です。現行法では正誤が変わる肢があります（現行法での正誤は未確認）。"
      : q.subject === "keiho" && q.exam.year <= KEIHO_KOKIN_YEAR
        ? "拘禁刑の導入（懲役・禁錮の廃止。2025年6月施行）より前の条文による出題です。2023年には性犯罪の規定も改正されています。現行法では文言や正誤が変わる肢があります（現行法での正誤は未確認）。"
        : `${q.exam.year}年の出題時点の正解です。その後の法改正で正誤が変わっている可能性があります（未確認）。`;
  return `<p class="note">⚠️ ${esc(t)}</p>`;
}

function articleName(article) {
  const [main, sub] = String(article).split("_");
  return sub ? `${main}条の${sub}` : `${main}条`;
}

export function questionPath(q) {
  return `/q/${q.id}/`;
}

export function setPath(info) {
  return `/q/${info.id}/`;
}

export function setTitle(info) {
  return `${info.exam_name} ${info.exam.era}（${info.exam.year}年） ${info.subject_name}`;
}

function page({ title, description, path, body, noteLinks = "" }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${APP}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/icons/icon-512.png">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${CSS}</style>
</head>
<body>
<header><a class="brand" href="/">${APP}<span>（${SUBTITLE}）</span></a></header>
<main>
${body}
</main>
<footer>
<p>出典：法務省ウェブサイト（<a href="https://www.moj.go.jp/jinji/shihoushiken/">https://www.moj.go.jp/jinji/shihoushiken/</a>）</p>
<p>問題文・正解は法務省が公開する PDF から、このサイトが抽出・編集・加工したものです。肢ごとの○×は公式の解答から導いたものです。解説は AI が生成したもので、法務省とは関係がありません。</p>
<p>このサイトは法務省とは関係のない個人が作成した非公式のものです。</p>
${noteLinks}
<p><a href="/q/">過去問の一覧</a> ・ <a href="/">アプリで解く</a> ・ <a href="/terms">利用規約</a> ・ <a href="/privacy">プライバシーポリシー</a></p>
</footer>
</body>
</html>
`;
}

const CSS = `
:root{color-scheme:light dark;--fg:#222;--bg:#fff;--muted:#666;--line:#ddd;--accent:#f66e61;--card:#f7f7f7}
@media (prefers-color-scheme:dark){:root{--fg:#e6e6e6;--bg:#1e1e1e;--muted:#a0a0a0;--line:#3a3a3a;--card:#2a2a2a}}
body{margin:0;font:16px/1.7 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:var(--fg);background:var(--bg)}
header,main,footer{max-width:760px;margin:0 auto;padding:12px 16px}
header{border-bottom:1px solid var(--line)}
a{color:inherit}.brand{font-weight:700;text-decoration:none}.brand span{font-weight:400;color:var(--muted);font-size:.85em}
h1{font-size:1.3rem;margin:.6em 0}h2{font-size:1.05rem;margin:1.4em 0 .4em}
.crumbs,.muted,footer{color:var(--muted);font-size:.85rem}
.note{background:var(--card);border-left:4px solid var(--accent);padding:8px 12px;font-size:.9rem}
.ctx{background:var(--card);padding:8px 12px;border-radius:6px}
ol.st{padding-left:0;list-style:none}ol.st li{margin:.5em 0}.lbl{font-weight:700;margin-right:.4em}
details.answer{border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin:1.2em 0}
details.answer>summary{cursor:pointer;font-weight:700}
.exp{border-top:1px solid var(--line);margin-top:10px;padding-top:6px}
.tf{font-weight:700}.ai{display:inline-block;font-size:.75rem;border:1px solid var(--accent);color:var(--accent);border-radius:4px;padding:0 6px;margin:4px 0}
blockquote{margin:.3em 0 .6em;padding-left:10px;border-left:3px solid var(--line);font-size:.9rem}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:8px 16px;border-radius:8px;margin:8px 0}
.pager{display:flex;justify-content:space-between;gap:8px;margin:1.5em 0}
ul.list{padding-left:1.2em}ul.list li{margin:.3em 0}
`;

function renderExplanation(e) {
  const cites = e.citations.length
    ? `<details><summary class="muted">引用した条文（e-Gov 法令 API から取得した現行条文）</summary>${e.citations
        .map(
          (c) =>
            `<div class="muted">${esc(c.law)}${esc(articleName(c.article))}${esc((c.paragraphs ?? []).join("・"))}${c.paragraphs?.length ? "項" : ""}（${esc(c.fetched_at)} 取得）</div><blockquote>${esc(c.quote)}</blockquote>`,
        )
        .join("")}</details>`
    : "";
  const cases = e.cases.length
    ? `<details><summary class="muted">挙げた判例（裁判所のウェブサイトで確認）</summary><ul class="list">${e.cases
        .map((c) => {
          const url = (c.verified_urls ?? [])[0];
          const head = `${esc(c.court)} ${esc(c.date)}${c.case_number ? ` ${esc(c.case_number)}` : ""}`;
          return `<li>${url ? `<a href="${esc(url)}" rel="nofollow noopener">${head}</a>` : head}<div class="muted">判示の要旨（このサイトによる要約）：${esc(c.holding)}</div></li>`;
        })
        .join("")}</ul></details>`
    : "";
  return `<div class="exp"><span class="ai">AI が生成した解説</span>${para(e.conclusion)}${para(e.body)}${cites}${cases}<p class="muted">${esc(e.model)}・${esc(e.prompt_version)}・${esc(e.generated_at)} 生成。公式の○×との一致と条文の引用の照合を通ったものです。誤りがありうるので、条文・判例は原典で確かめてください。</p></div>`;
}

function officialAnswer(q) {
  const slots = q.answer_slots ?? [];
  if (!slots.length || slots.some((s) => s.official_answer == null)) return "<p>公式の正解：なし（採点の対象外など）</p>";
  const parts = slots.map((s) => (s.statement_label ? `${s.statement_label}：${s.official_answer}` : `［No.${s.no}］：${s.official_answer}`));
  return `<p><strong>公式の正解</strong>　${esc(parts.join("　"))}</p>`;
}

/** 問ごとのページ */
export function renderQuestion(info, data, q, { prev, next } = {}) {
  const sts = (q.statements ?? []).map((id) => data.statements.find((s) => s.id === id)).filter(Boolean);
  const exps = new Map(data.explanations.map((e) => [e.statement_id, e]));
  const title = `${setTitle(info)} 第${q.number}問｜${APP}`;
  const subs = (q.sub_questions ?? []).map((s) => para(`${s.marker} ${s.stem}`)).join("");
  const ctx = (q.context ?? []).map((c) => `<div class="ctx">${c.kind ? `<div class="muted">【${esc(c.kind)}】</div>` : ""}${para(c.text)}</div>`).join("");
  const list = sts.length ? `<ol class="st">${sts.map((s) => `<li><span class="lbl">${esc(s.label)}</span>${esc(s.text)}</li>`).join("")}</ol>` : "";
  const choices = (q.choices ?? []).length
    ? `<h2>選択肢</h2><ol class="st">${q.choices.map((c) => `<li><span class="lbl">${esc(c.number)}</span>${esc(c.text)}</li>`).join("")}</ol>`
    : "";
  const answers = sts
    .map((s) => {
      const tf = s.review_flag ? "要確認（○×を出していません）" : s.truth_at_exam ? (s.truth_at_exam.value ? "○（正しい）" : "×（誤り）") : "肢ごとの○×は導けない問";
      const same = (s.same_as ?? []).map((o) => `<a href="/q/${esc((o.id.match(/^(.*-q\d+)/) ?? [o.id])[0])}/">${esc(o.exam)} ${esc(o.era)} 第${esc(o.number)}問 ${esc(o.label)}</a>`).join("・");
      const e = exps.get(s.id);
      return `<div class="exp"><div><span class="lbl">${esc(s.label)}</span><span class="tf">${esc(tf)}</span>${s.truth_at_exam && !s.review_flag ? `<span class="muted">（出題時点）</span>` : ""}</div>${same ? `<div class="muted">同じ肢：${same}</div>` : ""}${e ? renderExplanation(e) : `<p class="muted">解説はまだありません。</p>`}</div>`;
    })
    .join("");
  const body = `<div class="crumbs"><a href="/q/">過去問の一覧</a> › <a href="${setPath(info)}">${esc(setTitle(info))}</a> › 第${q.number}問</div>
<h1>${esc(setTitle(info))} 第${q.number}問</h1>
${lawNote(q)}
${para(q.stem)}
${subs}
${ctx}
${list}
${choices}
<details class="answer"><summary>正解と解説を見る</summary>
${officialAnswer(q)}
${answers}
</details>
<a class="cta" href="/subjects/${esc(info.subject)}">アプリで${esc(info.subject_name)}を解く</a>
<div class="pager"><span>${prev ? `<a href="${questionPath(prev)}">← 第${prev.number}問</a>` : ""}</span><span>${next ? `<a href="${questionPath(next)}">第${next.number}問 →</a>` : ""}</span></div>`;
  const pdfs = (info.attribution?.source_pdfs ?? []).map((u) => `<a href="${esc(u)}">${esc(u)}</a>`).join("<br>");
  return page({
    title,
    description: `${setTitle(info)} 第${q.number}問。${summary(q)}`,
    path: questionPath(q),
    body,
    noteLinks: pdfs ? `<p>元の PDF：<br>${pdfs}</p>` : "",
  });
}

/** 年度・科目ごとの問の一覧 */
export function renderSet(info, data) {
  const items = data.questions.map((q) => `<li><a href="${questionPath(q)}">第${q.number}問</a>　<span class="muted">${esc(summary(q, 60))}</span></li>`).join("");
  const body = `<div class="crumbs"><a href="/q/">過去問の一覧</a> › ${esc(setTitle(info))}</div>
<h1>${esc(setTitle(info))}（短答式）</h1>
<p>${data.questions.length}問。問ごとに問題文と、公式の正解・AI が生成した解説を見られます。</p>
<a class="cta" href="/subjects/${esc(info.subject)}">アプリで解く</a>
<ul class="list">${items}</ul>`;
  return page({ title: `${setTitle(info)}の短答式過去問｜${APP}`, description: `${setTitle(info)}の短答式試験の全${data.questions.length}問。問題文・公式の正解・解説。`, path: setPath(info), body });
}

/** 一覧の入口（科目 → 試験 → 年度） */
export function renderIndex(sets) {
  const bySubject = new Map();
  for (const s of sets) bySubject.set(s.subject, [...(bySubject.get(s.subject) ?? []), s]);
  const blocks = [...bySubject.values()]
    .map((v) => {
      const exams = ["yobi", "shiho"]
        .map((t) => {
          const xs = v.filter((s) => s.exam.type === t).sort((a, b) => b.exam.year - a.exam.year);
          if (!xs.length) return "";
          return `<p><strong>${esc(xs[0].exam_name)}</strong>　${xs.map((s) => `<a href="${setPath(s)}">${esc(s.exam.era)}</a>`).join("　")}</p>`;
        })
        .join("");
      return `<h2>${esc(v[0].subject_name)}</h2>${exams}`;
    })
    .join("");
  const body = `<h1>予備試験・司法試験 短答式の過去問</h1>
<p>法務省が公開する短答式試験の問題を、年度・科目ごとに載せています。問ごとに公式の正解と、AI が生成した解説（条文は e-Gov、判例は裁判所のウェブサイトで確認）を見られます。</p>
<a class="cta" href="/">アプリで一問一答を解く</a>
${blocks}`;
  return page({ title: `予備試験・司法試験 短答式の過去問一覧｜${APP}`, description: "予備試験・司法試験の短答式過去問を年度・科目ごとに。問題文・公式の正解・AI 生成の解説。", path: "/q/", body });
}

export function sitemap(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `<url><loc>${esc(SITE + p)}</loc></url>`).join("\n")}
</urlset>
`;
}

function write(dist, path, html) {
  const file = join(dist, path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

export function build(dist) {
  const index = JSON.parse(readFileSync(join(dist, "data", "index.json"), "utf-8"));
  const paths = ["/", "/subjects", "/q/"];
  write(dist, "/q/", renderIndex(index.sets));
  let n = 0;
  for (const info of index.sets) {
    const data = JSON.parse(readFileSync(join(dist, "data", info.file), "utf-8"));
    write(dist, setPath(info), renderSet(info, data));
    paths.push(setPath(info));
    data.questions.forEach((q, i) => {
      write(dist, questionPath(q), renderQuestion(info, data, q, { prev: data.questions[i - 1], next: data.questions[i + 1] }));
      paths.push(questionPath(q));
      n++;
    });
  }
  writeFileSync(join(dist, "sitemap.xml"), sitemap(paths));
  return { sets: index.sets.length, questions: n, urls: paths.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  const r = build(dist);
  console.log(`問ごとのページ：${r.questions}問・一覧 ${r.sets}件・サイトマップ ${r.urls} URL`);
}
