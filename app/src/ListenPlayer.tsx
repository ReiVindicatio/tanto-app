// 聞き流しモード（T057・T058）：肢を読み上げ、考える間を置いて、○×と解説の結論を読む。止めるまで続ける。
// 声は手元で作っておいた音声（声1：Gemini の音声合成・T061、声2：Google Cloud Text-to-Speech・T058）。
// 声1がない肢は声2で、どちらもない肢は端末の読み上げで読む。
// ○×を言う前に画面の○×を押したときだけ、普段の回答と同じに記録する（押さなければ記録しない）
import { useEffect, useRef, useState } from "react";
import type { DataSet, Statement } from "./types";
import type { More, OriginOf } from "./play";
import { merge } from "./data";
import Stem from "./Stem";
import LawNote from "./LawNote";
import ExplanationView from "./ExplanationView";
import { cardIdOf, recordAnswer } from "./learning";
import {
  audioUrls,
  canSpeak,
  clipUrl,
  either,
  play,
  silenceUrl,
  getListenPrefs,
  japaneseVoice,
  keepScreenOn,
  PAUSES,
  RATES,
  setListenPrefs,
  speak,
  wait,
  VOICE_NOS,
  type ListenPrefs,
} from "./listen";
import { characterImage, characterOn, listenFace, markTipSeen, tipSeen, type Expression } from "./character";
import { ALL_LINES, pickLine } from "./ritsu/lines";
import { bgFor, currentTheme } from "./ritsu/themes";
import { progressNow } from "./progress";
import { Bubble, RitsuDock } from "./Ritsu";

type Phase = "ready" | "reading" | "thinking" | "answer" | "paused" | "done";
/** 残りがこれだけになったら次を読み足す */
const REFILL_AT = 3;

/** 聞いている間に使う表情（腰かける絵） */
const PEEK_FACES: Expression[] = ["normal", "think", "happy", "sad", "sleepy", "smug", "jito"];

/**
 * 律の舞台（ノベルゲーム風）：背景を抜いた立ち絵を大きく出し、頭の横の吹き出しで今の状態を言う。
 * 下に重ねる文字の枠（肢の文）は呼ぶ側で置く
 */
/** 始める前・おわりの律：立ち絵を右に、吹き出しを左に分けて置く（幅が狭くても重ならない） */
function Stage({ face, children }: { face: Expression; children: React.ReactNode }) {
  const theme = currentTheme();
  return (
    <div className="vn-stage with-bg" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}chars/bg/${bgFor(theme)}.webp)` }}>
      {children}
      <img className="vn-sprite" src={characterImage("base", face)} alt="" data-face={face} />
    </div>
  );
}

/** 聞いている間の律：画面の下の○×の欄の縁に腰かけ（一時停止中は寝そべる）、横の吹き出しで今の状態を言う（スクロールしても見える） */
function Dock({ face, phase, hop, children }: { face: Expression; phase: Phase; hop: boolean; children: React.ReactNode }) {
  // 表情を切り替えたときに白くならないよう、使う絵は最初にまとめて読み込んでおく
  useEffect(() => {
    for (const f of PEEK_FACES) new Image().src = characterImage("sit", f);
    new Image().src = characterImage("lie", "sleepy");
  }, []);
  return (
    <RitsuDock face={face} className={`listen-dock listen-phase ${phase}`} pose={phase === "paused" ? "lie" : "sit"} hop={hop} swing={phase === "reading" || phase === "thinking" || phase === "paused"}>
      {children}
    </RitsuDock>
  );
}

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
  // 律のひとこと（T065）。はじめの案内は、初めての1回だけ使い方の説明（listen_start-001）、2回目からは選ぶ
  const [introLine] = useState(() =>
    tipSeen("listen") ? pickLine("listen_start", progressNow().level) : ALL_LINES.find((l) => l.id === "listen_start-001"),
  );
  const [doneLine] = useState(() => pickLine("listen_done", progressNow().level));
  // 答えを読んだ肢（答えと解説を画面に出す。一時停止しても出したまま）
  const [revealed, setRevealed] = useState<string | null>(null);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ heard: 0, answered: 0, correct: 0 });
  const [noVoice, setNoVoice] = useState(false);
  // キャラクター（T063）：答えの連続正解・連続不正解で表情を変える
  const [showChar] = useState(characterOn);
  const [streaks, setStreaks] = useState({ correct: 0, wrong: 0 });

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
  // 音声の再生に使う1つの <audio>（iPhone は、押した操作の中で一度再生した要素なら、あとから続けて再生できる）
  const audio = useRef<HTMLAudioElement | null>(null);
  const el = () => (audio.current ??= new Audio());
  const [, rerender] = useState(0);
  const actions = useRef<{ pause: () => void; resume: () => void; skip: () => void } | null>(null);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a: MediaSessionAction, f: (() => void) | null) => {
      try {
        ms.setActionHandler(a, f);
      } catch {
        // 端末が対応していない操作は飛ばす
      }
    };
    set("pause", () => actions.current?.pause());
    set("play", () => actions.current?.resume());
    set("nexttrack", () => actions.current?.skip());
    return () => ["pause", "play", "nexttrack"].forEach((a) => set(a as MediaSessionAction, null));
  }, []);

  useEffect(() => {
    // 端末の読み上げは、作っておいた音声がない肢のときだけ使う
    if (canSpeak())
      void japaneseVoice().then((v) => {
        voice.current = v;
        setNoVoice(v === null);
      });
    return () => {
      cardCtl.current?.abort();
      if (canSpeak()) window.speechSynthesis.cancel();
      audio.current?.pause();
      releaseScreen.current();
      if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
    };
  }, []);

  const setPrefs = (p: ListenPrefs) => {
    setPrefsState(p);
    setListenPrefs(p);
    // 読む速さは、いま流している音声にもすぐ当てる（考える間の無音は変えない。変えると考える時間が縮む）
    const a = audio.current;
    if (a && !a.src.includes("/sounds/silence-")) {
      a.defaultPlaybackRate = p.rate;
      a.playbackRate = p.rate;
    }
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

  /** 作っておいた音声で読む（声1なら 声1 → 声2 の順に試す）。音声がなければ端末の読み上げで text を読む */
  async function say(cardId: string, part: "q" | "a", text: string, signal: AbortSignal) {
    const rate = prefsRef.current.rate;
    for (const url of audioUrls(cardId, part, prefsRef.current.voice)) {
      if (await play(el(), url, rate, signal)) return;
      if (signal.aborted) return;
    }
    if (canSpeak()) await speak(text, rate, voice.current, signal);
  }

  /** 押した答えの「正解。」「不正解。」を、選んだ声で（なければ声2で）流す */
  async function sayClip(ok: boolean, signal: AbortSignal) {
    const name = ok ? "seikai" : "fuseikai";
    if (await play(el(), clipUrl(name, prefsRef.current.voice), prefsRef.current.rate, signal)) return;
    if (!signal.aborted && prefsRef.current.voice !== 2) await play(el(), clipUrl(name, 2), prefsRef.current.rate, signal);
  }

  /** 次の肢の音声を先に取っておく（切り替わりの待ちを減らす。失敗してもかまわない） */
  function prefetch(s: Statement | undefined) {
    if (!s) return;
    for (const part of ["q", "a"] as const) void fetch(audioUrls(cardIdOf(s.id), part, prefsRef.current.voice)[0]).catch(() => {});
  }

  /** ロック画面・通知の表示と操作（Media Session） */
  function mediaInfo(s: Statement) {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    const q = ds.current.questions.find((x) => x.id === s.question_id);
    const o = q ? origin(q) : null;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: o && q ? `${o.examName} ${o.subjectName} ${q.exam.era} 第${q.number}問 肢${s.label}` : "聞き流し",
      artist: "たんたん（聞き流し）",
    });
  }

  /** 端末の読み上げで読むときの答えの文。withMark：押した答えの「正解。」「不正解。」を頭に付ける */
  function answerText(s: Statement, withMark = true): string {
    const truth = s.truth_at_exam!.value;
    const exp = ds.current.explanations.find((e) => e.statement_id === s.id);
    const mark = !withMark || answeredRef.current === null ? "" : answeredRef.current ? "正解。" : "不正解。";
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
      const cid = cardIdOf(s.id);
      setI(k);
      answeredRef.current = null;
      setAnswered(null);
      mediaInfo(s);
      prefetch(order.current[k + 1]);
      const step = new AbortController();
      phaseCtl.current = step;
      const either_ = either(card.signal, step.signal);
      setPhase("reading");
      await say(cid, "q", s.text, either_);
      if (card.signal.aborted) return;
      if (!step.signal.aborted) {
        setPhase("thinking");
        setLeft(prefsRef.current.pause);
        // 考える間は無音を流して作る（タイマーは画面を消すと止められることがある）。流せなければタイマーで待つ
        if (!(await play(el(), silenceUrl(prefsRef.current.pause), 1, either_, setLeft)) && !either_.aborted) {
          await wait(prefsRef.current.pause, either_, setLeft);
        }
        if (card.signal.aborted) return;
      }
      setPhase("answer");
      setRevealed(s.id);
      if (answeredRef.current !== null) await sayClip(answeredRef.current, card.signal);
      if (card.signal.aborted) return;
      await say(cid, "a", answerText(s, false), card.signal);
      if (card.signal.aborted) return;
      setStats((x) => ({ ...x, heard: x.heard + 1 }));
      if (!(await play(el(), silenceUrl(1), 1, card.signal)) && !card.signal.aborted) await wait(0.8, card.signal);
      k++;
    }
  }

  /**
   * はじめる・再開する。iPhone は押した操作の中で再生を始めないと音が出ないので、ここで <audio> に短い無音を流し、
   * 端末の読み上げにも空の一言を読ませておく（音声がない肢のため）
   */
  async function begin(from: number) {
    markTipSeen("listen");
    const a = el();
    a.src = silenceUrl(1);
    void a.play().catch(() => {});
    if (canSpeak()) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
    releaseScreen.current();
    releaseScreen.current = await keepScreenOn();
    void run(from);
  }

  function choose(v: boolean) {
    if ((phase !== "reading" && phase !== "thinking") || answeredRef.current !== null) return;
    const s = order.current[i];
    const ok = v === s.truth_at_exam!.value;
    recordAnswer(s.id, ok);
    setStreaks((x) => (ok ? { correct: x.correct + 1, wrong: 0 } : { correct: 0, wrong: x.wrong + 1 }));
    answeredRef.current = ok;
    setAnswered(ok);
    setStats((x) => ({ ...x, answered: x.answered + 1, correct: x.correct + (ok ? 1 : 0) }));
    phaseCtl.current?.abort(); // 待たずに答えを読む
  }

  function pause() {
    cardCtl.current?.abort();
    audio.current?.pause();
    setPhase("paused");
    releaseScreen.current();
  }

  function skip() {
    cardCtl.current?.abort();
    void begin(i + 1);
  }

  function stop() {
    cardCtl.current?.abort();
    audio.current?.pause();
    if (canSpeak()) window.speechSynthesis.cancel();
    releaseScreen.current();
    setPhase("done");
  }

  // ロック画面の操作（Media Session）から呼ぶ。中身は描画のたびに差し替える
  actions.current = { pause, resume: () => void begin(i), skip };

  if (phase === "done") {
    return (
      <section className="listen">
        {showChar && (
          <Stage face={listenFace("done", null, streaks.correct, streaks.wrong)}>
            <Bubble tail="right" className="vn-bubble">{doneLine?.text}</Bubble>
          </Stage>
        )}
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
  const exp = s ? ds.current.explanations.find((e) => e.statement_id === s.id) : undefined;
  const canAnswer = (phase === "reading" || phase === "thinking") && answered === null;
  const intro = (
    <>
      <p>
        肢を読み上げ、考える間を置いてから、○×と解説の結論を読みます。止めるまで続けます。
        ○×を言う前に画面の○×を押すと、その答えを記録します。押さなければ記録しません。
      </p>
      <p className="muted small">
        答えのあとに読む結論は AI が生成した解説で、誤りがありえます。音声は法律用語を読み間違えることがあります。
        ロック画面から一時停止・次の肢へができます。画面を消しても続けて聞くなら、ブラウザ（Safari・Chrome）で開くのが確実です。
      </p>
      {noVoice && <p className="muted small">音声のない肢は端末の読み上げで読みますが、この端末には日本語の声が見つかりません。</p>}
    </>
  );
  // 今の状態の表示（律を出すときは律の吹き出しに入れる）
  const phaseText = s && (
    <>
      {phase === "reading" && "読み上げ中…"}
      {phase === "thinking" && `考える時間　あと ${left} 秒`}
      {phase === "answer" && (
        <>
          {answered !== null && <strong className={answered ? "ok" : "ng"}>{answered ? "正解！" : "不正解…"}　</strong>}
          正解は {s.truth_at_exam!.value ? "○" : "×"}
        </>
      )}
      {phase === "paused" && "一時停止中"}
    </>
  );

  return (
    <section className={`listen${showChar && phase !== "ready" ? " with-dock" : ""}`}>
      <div className="toolbar">
        <button className="link" onClick={() => (phase === "ready" ? onExit() : stop())}>
          {phase === "ready" ? "← 戻る" : "止める"}
        </button>
        <span className="muted small">
          {title}　{phase === "ready" ? "" : `${i + 1}肢目`}
        </span>
        <span />
      </div>



      {phase === "ready" ? (
        <>
          {showChar && (
            <Stage face={listenFace("ready", null, 0, 0)}>
              <Bubble tail="right" className="vn-bubble">{introLine?.text}</Bubble>
            </Stage>
          )}
          {showChar ? <details className="listen-intro listen-more"><summary className="muted small">くわしく</summary>{intro}</details> : <div className="listen-intro">{intro}</div>}
        </>
      ) : (
        s && (
          <>
            <div className="listen-card">
              {o && q && (
                <div className="muted small">
                  {o.examName} {o.subjectName} {q.exam.era}（{q.exam.year}） 第{q.number}問 肢{s.label}
                </div>
              )}
              {/* 問の文は読み上げないが、肢だけでは関係が分からない問があるので画面には出す（T064） */}
              {q && <Stem text={q.stem} />}
              <p className="statement">{s.text}</p>
              {!showChar && (
                <div className={`listen-phase ${phase}`} aria-live="polite">
                  {phaseText}
                </div>
              )}
            </div>
          </>
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

      {/* 答えを読んだら、答えと解説を出す（T064）。一時停止・次へのボタンが動かないよう、その下に置く */}
      {s && revealed === s.id && (phase === "answer" || phase === "paused") && (
        <div className="listen-answer">
          <div>
            この記述は <strong>{s.truth_at_exam!.value ? "○（正しい）" : "×（誤り）"}</strong>
            <span className="muted small">　出題時点の公式の解答による</span>
          </div>
          {q && <LawNote q={q} />}
          {exp ? <ExplanationView e={exp} /> : <p className="muted small">この肢の解説はまだありません。</p>}
        </div>
      )}

      <div className="listen-settings">
        <div className="muted small">声</div>
        <div className="segmented" role="group" aria-label="声">
          {VOICE_NOS.map((v) => (
            <button key={v} className={prefs.voice === v ? "chosen" : ""} aria-pressed={prefs.voice === v} onClick={() => setPrefs({ ...prefs, voice: v })}>
              声{v}
            </button>
          ))}
        </div>
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
        {showChar && phase !== "ready" && s && (
          <Dock face={listenFace(phase, answered, streaks.correct, streaks.wrong)} phase={phase} hop={phase === "answer" && answered === true}>
            {phaseText}
          </Dock>
        )}
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
