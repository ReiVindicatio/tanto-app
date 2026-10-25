import { useEffect, useMemo, useRef, useState } from "react";
import type { DataSet, Explanation, Statement } from "./types";
import QuestionBody, { Context } from "./QuestionBody";
import ExplanationView from "./ExplanationView";
import ReportLink from "./ReportLink";
import LawNote from "./LawNote";
import StarButton from "./Bookmark";
import TwinsView from "./TwinsView";
import { loadTwinsWhenIdle, twinsIfLoaded, twinsOf } from "./twins";
import { loadTrapsWhenIdle, trapOf, trapsIfLoaded } from "./traps";
import { cardIdOf } from "./learning";
import { milestones, progressNow } from "./progress";
import { shuffle } from "./shuffle";
import { recordAnswer } from "./learning";
import { Progress } from "./screens/common";
import { StatementResult, type StatementResultItem } from "./ResultView";
import type { More, OriginOf } from "./play";
import { merge } from "./data";
import { flyAway, swipeThreshold, useSwipe, type SwipeDir } from "./swipe";

const BASIS_NOTE: Record<string, string> = {
  convention: "公式の解答は組合せの番号だけです。この肢の○×は、その組合せに入っているかどうかから導いたものです。",
};

/**
 * 問のリード文（T049）。肢カードでは○×を聞くので、「誤っているものを組み合わせたものは」のような問の指示と食い違う。
 * 前提（「判例の立場に従って」など）が入っているので消さずに、2行までに畳んで小さく出す。押すと全文
 */
function Stem({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 50;
  return (
    <div className="card-stem">
      <p className={`stem small muted${long && !open ? " clamped" : ""}`}>{text}</p>
      {long && (
        <button className="link small" onClick={() => setOpen(!open)}>
          {open ? "問の文を畳む" : "問の文の全文"}
        </button>
      )}
    </div>
  );
}

/** 肢カード。cards は出題する肢（○×のあるもの）、data はその肢の問・解説を含む束 */
export default function StatementDrill({
  title,
  data,
  cards,
  origin,
  more,
  onExit,
}: {
  title: string;
  data: DataSet;
  cards: Statement[];
  /** 問ごとの試験名・科目名（今日の○問では科目がまざる） */
  origin: OriginOf;
  /** エンドレス：残りが少なくなったら次のひとまとまりを読む */
  more?: More;
  onExit: () => void;
}) {
  const [order, setOrder] = useState<Statement[]>(cards);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [results, setResults] = useState<StatementResultItem[]>([]);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [showQuestion, setShowQuestion] = useState(false);
  /** 答えたときに、レベルが上がった・今日の目標に届いた（T029） */
  const [celebrate, setCelebrate] = useState<{ levelUp: number | null; goalReached: boolean } | null>(null);
  /** 「終わる」を押した（答えた分だけで結果を出す） */
  const [ended, setEnded] = useState(false);
  // エンドレス：読み足した肢の束。解き直し（まちがえた肢だけなど）に入ったら、もう読み足さない
  const [ds, setDs] = useState(data);
  const [endless, setEndless] = useState(more !== undefined);
  const [exhausted, setExhausted] = useState(false);
  const loadingMore = useRef(false);
  useEffect(() => {
    if (!endless || !more || exhausted || loadingMore.current || ended || order.length - i > 3) return;
    loadingMore.current = true;
    more(new Set(order.slice(i).map((x) => cardIdOf(x.id))))
      .then(({ data: d, cards: next }) => {
        if (next.length === 0) return setExhausted(true);
        setDs((prev) => merge([prev, d]));
        setOrder((o) => [...o, ...next]);
      })
      .catch(() => setExhausted(true)) // 読めなければ（通信なしなど）、いまある分で終わる
      .finally(() => (loadingMore.current = false));
  }, [endless, more, exhausted, ended, i, order]);

  const qById = useMemo(() => new Map(ds.questions.map((q) => [q.id, q])), [ds]);
  const sById = useMemo(() => new Map(ds.statements.map((s) => [s.id, s])), [ds]);
  const expById = useMemo(() => new Map(ds.explanations.map((e) => [e.statement_id, e])), [ds]);
  // よく似た肢（T050）は肢カードを開いたときに読んでおく。読めなくても解くのには困らないので黙って出さない
  const [twinsReady, setTwinsReady] = useState(twinsIfLoaded() !== null);
  // ひっかけの型（T059）も同じく、手が空いてから読む
  const [trapsReady, setTrapsReady] = useState(trapsIfLoaded() !== null);
  useEffect(() => {
    if (!trapsReady) return loadTrapsWhenIdle(() => setTrapsReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!twinsReady) return loadTwinsWhenIdle(() => setTwinsReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // はじく・キーボードの操作から呼ぶ。中身は描画のたびに下で差し替える（フックを早期の return より前に置くため）
  const actions = useRef<{ choose: (v: boolean, dx?: number) => void; advance: (dir: SwipeDir, dx?: number) => void } | null>(null);
  const playing = i < order.length && !ended;
  const swipe = useSwipe<HTMLDivElement>((dir, dx) => {
    if (answer === null) actions.current?.choose(dir === "right", dx);
    else actions.current?.advance(dir, dx);
  }, playing);

  // PC はキーボードだけで解き続けられる：→／O で○、←／X で×、答え合わせの後は → ← Enter で次へ
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!playing || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
      const a = actions.current;
      if (!a) return;
      if (answer === null) {
        if (e.key === "ArrowRight" || e.key === "o" || e.key === "O") a.choose(true);
        else if (e.key === "ArrowLeft" || e.key === "x" || e.key === "X") a.choose(false);
        else return;
      } else {
        if (e.key === "ArrowRight") a.advance("right");
        else if (e.key === "ArrowLeft") a.advance("left");
        // ボタンやリンクの上の Enter は、そのボタンの操作に任せる
        else if (e.key === "Enter" && !t?.closest?.("button, a, summary")) a.advance("left");
        else return;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, answer]);

  function restart(next: Statement[], shuffled: boolean) {
    setOrder(shuffled ? shuffle(next) : next);
    setI(0);
    setAnswer(null);
    setEnded(false);
    setEndless(false);
    setResults([]);
    setStartedAt(Date.now());
    setFinishedAt(null);
    setShowQuestion(false);
    window.scrollTo(0, 0);
  }

  if (order.length === 0) {
    return (
      <section>
        <h1>出題できる肢がありません</h1>
        <p className="muted">絞り込みの条件に当てはまる肢がありませんでした。</p>
        <button className="secondary" onClick={onExit}>
          戻る
        </button>
      </section>
    );
  }

  if (i >= order.length || ended) {
    return (
      <StatementResult
        items={results}
        elapsedMs={(finishedAt ?? Date.now()) - startedAt}
        origin={origin}
        explanations={expById}
        onRetryWrong={() =>
          restart(
            results.filter((x) => !x.correct).map((x) => x.statement),
            true,
          )
        }
        onRetryAll={() => restart(ended || endless ? results.map((x) => x.statement) : order, true)}
        onExit={onExit}
      />
    );
  }

  const s = order[i];
  const q = qById.get(s.question_id)!;
  const truth = s.truth_at_exam!.value;
  const o = origin(q);

  /** 答える：カードを答えの向き（○は右・×は左）に飛ばし、後ろから答え合わせのカードを出す */
  function choose(v: boolean, dx = 0) {
    if (answer !== null) return;
    if (swipe.el) flyAway(swipe.el, v ? "right" : "left", dx, v ? { text: "○", className: "maru" } : { text: "×", className: "batsu" });
    setAnswer(v);
    const before = progressNow();
    recordAnswer(s.id, v === truth);
    const m = milestones(before, progressNow());
    setCelebrate(m.levelUp || m.goalReached ? m : null);
    setResults((r) => [...r, { statement: s, question: q, correct: v === truth }]);
  }

  function next() {
    if (i + 1 >= order.length) setFinishedAt(Date.now());
    setI(i + 1);
    setAnswer(null);
    setCelebrate(null);
    setShowQuestion(false);
    window.scrollTo(0, 0);
  }

  /** 答え合わせの後にはじいたら、カードを飛ばして次の肢へ */
  function advance(dir: SwipeDir, dx = 0) {
    if (swipe.el) flyAway(swipe.el, dir, dx);
    next();
  }

  actions.current = { choose, advance };

  // 続けて正解した数（まちがえたら0に戻る）。3から出す
  let streak = 0;
  for (let k = results.length - 1; k >= 0 && results[k].correct; k--) streak++;

  const threshold = swipeThreshold(typeof window === "undefined" ? 360 : window.innerWidth);
  const lean = Math.max(-1, Math.min(1, swipe.dx / threshold));
  const cardStyle =
    swipe.dx !== 0
      ? { transform: `translateX(${swipe.dx}px) rotate(${answer === null ? swipe.dx / 30 : 0}deg)`, transition: swipe.dragging ? "none" : undefined }
      : undefined;

  return (
    <section>
      <div className="toolbar">
        <button className="link" onClick={onExit}>
          ← 戻る
        </button>
        <span className="muted small">
          {endless ? `${title}　${i + 1}問目` : `${title}　${i + 1} / ${order.length}`}
        </span>
        {results.length > 0 ? (
          // 途中で終わって、答えた分の結果を見る
          <button
            className="link"
            onClick={() => {
              setFinishedAt(Date.now());
              setEnded(true);
            }}
          >
            終わる
          </button>
        ) : (
          i === 0 &&
          answer === null &&
          !endless && (
            <button className="link" onClick={() => restart(cards, true)}>
              シャッフル
            </button>
          )
        )}
      </div>
      {!endless && (
        <div className="play-progress">
          <Progress value={(i + (answer === null ? 0 : 1)) / order.length} />
        </div>
      )}

      <div
        // 答えたらカードを作り直し、後ろから浮かび上がるように出す
        key={`${s.id}:${answer === null ? "q" : "a"}`}
        ref={swipe.ref}
        className={`swipe-card${swipe.dragging ? " dragging" : ""}`}
        style={cardStyle}
      >
        {swipe.dragging && (
          <div
            className={`swipe-stamp ${answer !== null ? "next" : lean > 0 ? "maru" : "batsu"}`}
            style={{ opacity: Math.abs(lean) }}
            aria-hidden="true"
          >
            {answer !== null ? "次へ" : lean > 0 ? "○" : "×"}
          </div>
        )}
        <div className="muted small">
          {o.examName} {o.subjectName} {q.exam.era}（{q.exam.year}） 第{q.number}問
        </div>
        <Stem text={q.stem} />
        {s.requires_context && <Context q={q} />}
        {s.sub !== undefined && (
          <p className="stem small">
            {q.sub_questions[s.sub].marker} {q.sub_questions[s.sub].stem}
          </p>
        )}
        {answer === null && <p className="ask">この記述は正しい（○）か、誤り（×）か</p>}
        <p className="statement">{s.text}</p>

        {answer === null && i === 0 && (
          <p className="swipe-hint muted small">
            <span className="hint-touch">右にはじくと○・左にはじくと×</span>
            <span className="hint-keys">キーボード：→ か O で○、← か X で×（答えの後は Enter で次へ）</span>
          </p>
        )}

        {answer !== null && (
          <div className={`result ${answer === truth ? "ok" : "ng"}`}>
            <div className="big">
              {answer === truth ? "正解" : "不正解"}
              {answer === truth && streak >= 3 && <span className="combo">{streak}連続正解</span>}
            </div>
            {celebrate && (
              <div className="celebrate">
                {celebrate.levelUp && <span>🎉 レベルアップ！ Lv.{celebrate.levelUp}</span>}
                {celebrate.goalReached && <span>✅ 今日の目標達成！</span>}
              </div>
            )}
            <div>
              この記述は <strong>{truth ? "○（正しい）" : "×（誤り）"}</strong>
              <span className="muted small">　出題時点の公式の解答による</span>
            </div>
            <LawNote q={q} />
            {trapsReady && !truth && <TrapNote statementId={s.id} />}
            {BASIS_NOTE[s.truth_at_exam!.basis] && <p className="small muted">{BASIS_NOTE[s.truth_at_exam!.basis]}</p>}
            {expById.has(s.id) ? (
              <ExplanationView e={expById.get(s.id)!} />
            ) : (
              <p className="muted small">この肢の解説はまだありません。</p>
            )}
            {twinsReady && (
              <TwinsView twins={twinsOf(twinsIfLoaded()!, s.id, new Set(order.slice(i + 1).map((x) => cardIdOf(x.id))))} />
            )}
            <div className="muted small">
              出典の位置：{o.examName} {q.exam.era} {o.subjectName} 第{q.number}問
              {s.sub !== undefined && ` 小問${q.sub_questions[s.sub].marker}`} 肢{s.label}
            </div>
            <ReportLink target={s.id} context={reportContext(expById.get(s.id))} />
            {s.same_as && s.same_as.length > 0 && (
              <div className="muted small same-as">
                同じ肢：{s.same_as.map((x) => `${x.exam} ${x.era} 第${x.number}問 肢${x.label}`).join("・")}
                （1枚のカードとして記録します）
              </div>
            )}
            <div className="row">
              <StarButton id={s.id} />
              <button className="secondary small" onClick={() => setShowQuestion(!showQuestion)}>
                {showQuestion ? "元の問題を閉じる" : "元の問題を見る"}
              </button>
            </div>
            {showQuestion && (
              <QuestionBody
                q={q}
                statements={q.statements.map((id) => sById.get(id)!)}
                showTruth={true}
                highlight={s.id}
                explanations={expById}
              />
            )}
          </div>
        )}
      </div>

      {answer === null ? (
        <div className="actionbar">
          <button className="mark" onClick={() => choose(false)}>
            ×
          </button>
          <button className="mark" onClick={() => choose(true)}>
            ○
          </button>
        </div>
      ) : (
        <div className="actionbar">
          {/* はじいたときと同じく、カードを左へめくって次の肢へ（単語帳のように） */}
          <button onClick={() => advance("left")}>
            次へ
          </button>
        </div>
      )}
    </section>
  );
}

/** 誤り報告に自動で付ける情報（T040）：どの版の解説を見て報告したか */
function reportContext(e: Explanation | undefined): Record<string, unknown> {
  return { screen: "statement", explanation: e ? { model: e.model, prompt_version: e.prompt_version, generated_at: e.generated_at } : null };
}

/** ×の肢のひっかけの型（T059。AI による分類） */
function TrapNote({ statementId }: { statementId: string }) {
  const t = trapsIfLoaded();
  const trap = t ? trapOf(t, statementId) : null;
  if (!trap) return null;
  return (
    <div className="trap-note small">
      <span className="trap-label">ひっかけの型</span> <strong>{trap.name}</strong>
      <span className="muted">　{trap.why}（AI による分類）</span>
    </div>
  );
}
