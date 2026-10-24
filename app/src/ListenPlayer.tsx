// 聞き流しモード（T057）：肢を読み上げ、考える間を置いて、○×と解説の結論を読む。止めるまで続ける。
// ○×を言う前に画面の○×を押したときだけ、普段の回答と同じに記録する（押さなければ記録しない）
import { useEffect, useRef, useState } from "react";
import type { DataSet, Statement } from "./types";
import type { More, OriginOf } from "./play";
import { merge } from "./data";
import { cardIdOf, recordAnswer } from "./learning";
import {
  canSpeak,
  either,
  getListenPrefs,
  japaneseVoice,
  keepScreenOn,
  PAUSES,
  RATES,
  setListenPrefs,
  speak,
  wait,
  type ListenPrefs,
} from "./listen";

type Phase = "ready" | "reading" | "thinking" | "answer" | "paused" | "done";
/** 残りがこれだけになったら次を読み足す */
const REFILL_AT = 3;

export default function ListenPlayer({
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
  origin: OriginOf;
  more: More;
  onExit: () => void;
}) {
  const [prefs, setPrefsState] = useState<ListenPrefs>(getListenPrefs());
  const [phase, setPhase] = useState<Phase>("ready");
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ heard: 0, answered: 0, correct: 0 });
  const [noVoice, setNoVoice] = useState(false);

  // 読み上げは async の流れで進むので、最新の値は ref から読む
  const order = useRef<Statement[]>(cards);
  const ds = useRef<DataSet>(data);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const answeredRef = useRef<boolean | null>(null);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const cardCtl = useRef<AbortController | null>(null);
  const phaseCtl = useRef<AbortController | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const exhausted = useRef(false);
  const releaseScreen = useRef<() => void>(() => {});
  const [, rerender] = useState(0);

  useEffect(() => {
    if (!canSpeak()) return;
    void japaneseVoice().then((v) => {
      voice.current = v;
      setNoVoice(v === null);
    });
    return () => {
      cardCtl.current?.abort();
      window.speechSynthesis.cancel();
      releaseScreen.current();
    };
  }, []);

  const setPrefs = (p: ListenPrefs) => {
    setPrefsState(p);
    setListenPrefs(p);
  };

  /** この回にすでに出した肢を全部除いて、次の20問を読み足す（聞いただけの肢は記録されないので、除かないとまた出る） */
  function refill(): Promise<void> {
    if (exhausted.current) return Promise.resolve();
    loading.current ??= more(new Set(order.current.map((x) => cardIdOf(x.id))))
      .then(({ data: d, cards: next }) => {
        if (next.length === 0) exhausted.current = true;
        ds.current = merge([ds.current, d]);
        order.current = [...order.current, ...next];
        rerender((n) => n + 1);
      })
      .catch(() => {
        exhausted.current = true; // 読めなければ（通信なしなど）、いまある分で終わる
      })
      .finally(() => (loading.current = null));
    return loading.current;
  }

  function answerText(s: Statement): string {
    const truth = s.truth_at_exam!.value;
    const exp = ds.current.explanations.find((e) => e.statement_id === s.id);
    const mark = answeredRef.current === null ? "" : answeredRef.current ? "正解。" : "不正解。";
    return `${mark}正解は、${truth ? "まる" : "ばつ"}。${exp ? exp.conclusion : "この肢の解説はありません。"}`;
  }

  async function run(from: number) {
    const card = new AbortController();
    cardCtl.current = card;
    let k = from;
    while (!card.signal.aborted) {
      if (order.current.length - k <= REFILL_AT) void refill();
      if (k >= order.current.length) {
        await (loading.current ?? refill());
        if (k >= order.current.length) {
          setPhase("done");
          releaseScreen.current();
          return;
        }
      }
      const s = order.current[k];
      setI(k);
      answeredRef.current = null;
      setAnswered(null);
      const step = new AbortController();
      phaseCtl.current = step;
      const either_ = either(card.signal, step.signal);
      setPhase("reading");
      await speak(s.text, prefsRef.current.rate, voice.current, either_);
      if (card.signal.aborted) return;
      if (!step.signal.aborted) {
        setPhase("thinking");
        await wait(prefsRef.current.pause, either_, setLeft);
        if (card.signal.aborted) return;
      }
      setPhase("answer");
      await speak(answerText(s), prefsRef.current.rate, voice.current, card.signal);
      if (card.signal.aborted) return;
      setStats((x) => ({ ...x, heard: x.heard + 1 }));
      await wait(0.8, card.signal);
      k++;
    }
  }

  /** はじめる・再開する。iPhone は押した操作の中で読み上げを始めないと声が出ないので、ここで最初の一言を読む */
  async function begin(from: number) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    releaseScreen.current();
    releaseScreen.current = await keepScreenOn();
    void run(from);
  }

  function choose(v: boolean) {
    if ((phase !== "reading" && phase !== "thinking") || answeredRef.current !== null) return;
    const s = order.current[i];
    const ok = v === s.truth_at_exam!.value;
    recordAnswer(s.id, ok);
    answeredRef.current = ok;
    setAnswered(ok);
    setStats((x) => ({ ...x, answered: x.answered + 1, correct: x.correct + (ok ? 1 : 0) }));
    phaseCtl.current?.abort(); // 待たずに答えを読む
  }

  function pause() {
    cardCtl.current?.abort();
    setPhase("paused");
    releaseScreen.current();
  }

  function skip() {
    cardCtl.current?.abort();
    void begin(i + 1);
  }

  function stop() {
    cardCtl.current?.abort();
    window.speechSynthesis.cancel();
    releaseScreen.current();
    setPhase("done");
  }

  if (!canSpeak()) {
    return (
      <section>
        <h1>聞き流し</h1>
        <p>このブラウザは読み上げに対応していません。</p>
        <button className="secondary" onClick={onExit}>
          戻る
        </button>
      </section>
    );
  }

  if (phase === "done") {
    return (
      <section className="listen">
        <h1>おわり</h1>
        <p className="listen-summary">
          聞いた {stats.heard} 肢・答えた {stats.answered} 肢・正解 {stats.correct}
        </p>
        <p className="muted small">答えた肢だけを記録しました（復習の期限・累計に入ります）。</p>
        <button onClick={onExit}>戻る</button>
      </section>
    );
  }

  const s = order.current[Math.min(i, order.current.length - 1)];
  const q = ds.current.questions.find((x) => x.id === s?.question_id);
  const o = q ? origin(q) : null;
  const canAnswer = (phase === "reading" || phase === "thinking") && answered === null;

  return (
    <section className="listen">
      <div className="toolbar">
        <button className="link" onClick={() => (phase === "ready" ? onExit() : stop())}>
          {phase === "ready" ? "← 戻る" : "止める"}
        </button>
        <span className="muted small">
          {title}　{phase === "ready" ? "" : `${i + 1}肢目`}
        </span>
        <span />
      </div>

      {noVoice && <p className="error small">この端末に日本語の読み上げの声が見つかりません。声が英語になることがあります。</p>}

      {phase === "ready" ? (
        <div className="listen-intro">
          <p>
            肢を読み上げ、考える間を置いてから、○×と解説の結論を読みます。止めるまで続けます。
            ○×を言う前に画面の○×を押すと、その答えを記録します。押さなければ記録しません。
          </p>
          <p className="muted small">
            画面を消したり別のアプリに切り替えたりすると、読み上げが止まります。画面は点けたまま使ってください。
            声は端末の読み上げ機能のもので、法律用語を読み間違えることがあります。
          </p>
        </div>
      ) : (
        s && (
          <div className="listen-card">
            {o && q && (
              <div className="muted small">
                {o.examName} {o.subjectName} {q.exam.era}（{q.exam.year}） 第{q.number}問 肢{s.label}
              </div>
            )}
            <p className="statement">{s.text}</p>
            <div className={`listen-phase ${phase}`} aria-live="polite">
              {phase === "reading" && "読み上げ中…"}
              {phase === "thinking" && `考える時間　あと ${left} 秒`}
              {phase === "answer" && (
                <>
                  {answered !== null && <strong className={answered ? "ok" : "ng"}>{answered ? "正解" : "不正解"}　</strong>}
                  正解は {s.truth_at_exam!.value ? "○" : "×"}
                </>
              )}
              {phase === "paused" && "一時停止中"}
            </div>
          </div>
        )
      )}

      {phase !== "ready" && (
        <div className="row listen-controls">
          {phase === "paused" ? (
            <button className="secondary" onClick={() => void begin(i)}>
              ▶ 再開
            </button>
          ) : (
            <button className="secondary" onClick={pause}>
              ❚❚ 一時停止
            </button>
          )}
          <button className="secondary" onClick={skip}>
            次の肢へ ▶▶
          </button>
        </div>
      )}

      <div className="listen-settings">
        <div className="muted small">読む速さ</div>
        <div className="segmented" role="group" aria-label="読む速さ">
          {RATES.map((r) => (
            <button key={r} className={prefs.rate === r ? "chosen" : ""} aria-pressed={prefs.rate === r} onClick={() => setPrefs({ ...prefs, rate: r })}>
              {r}倍
            </button>
          ))}
        </div>
        <div className="muted small">考える間（肢を読んでから答えを言うまで）</div>
        <div className="segmented" role="group" aria-label="考える間">
          {PAUSES.map((p) => (
            <button key={p} className={prefs.pause === p ? "chosen" : ""} aria-pressed={prefs.pause === p} onClick={() => setPrefs({ ...prefs, pause: p })}>
              {p}秒
            </button>
          ))}
        </div>
      </div>

      <div className="actionbar listen-actions">
        {phase === "ready" ? (
          <button onClick={() => void begin(0)}>▶ 聞きはじめる</button>
        ) : (
          <>
            <button className="mark" disabled={!canAnswer} onClick={() => choose(false)}>
              ×
            </button>
            <button className="mark" disabled={!canAnswer} onClick={() => choose(true)}>
              ○
            </button>
          </>
        )}
      </div>
    </section>
  );
}
