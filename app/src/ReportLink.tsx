// 誤り報告（T040）。答え合わせのあとに「誤りを報告」を出し、その場で書いて送る。
// 送れなかった報告は端末に取っておき、次の同期のときに送り直す（SyncedStore.report）
import { createContext, useContext, useEffect, useState } from "react";
import type { Report } from "./api";
import type { SyncedStore } from "./sync";

/** App から同期（SyncedStore）を渡す。ないとき（ログインが使えない構成）は報告の欄を出さない */
export const SyncContext = createContext<SyncedStore | undefined>(undefined);

const KINDS: { value: Report["kind"]; label: string }[] = [
  { value: "explanation", label: "解説" },
  { value: "truth", label: "○×（正解）" },
  { value: "question", label: "問題文" },
  { value: "other", label: "その他" },
];
export const REPORT_BODY_MAX = 500;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** target：肢 ID か問 ID。context：解説の版など、送る人が書かなくてよい情報 */
export default function ReportLink({ target, context }: { target: string; context: Record<string, unknown> }) {
  const sync = useContext(SyncContext);
  const [user, setUser] = useState(sync?.getStatus().user ?? null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Report["kind"]>("explanation");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => sync?.subscribe((s) => setUser(s.user)), [sync]);
  // 次の肢・問に進んだら閉じる
  useEffect(() => {
    setOpen(false);
    setSent(false);
    setBody("");
  }, [target]);

  if (!sync) return null;
  if (sent) return <p className="small muted report-done">報告を受け付けました。ありがとうございます。</p>;
  if (!open) {
    return (
      <div className="report-link">
        <button className="link small" onClick={() => setOpen(true)}>
          誤りを報告
        </button>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="report-form card">
        <p className="small muted">ログインすると、誤りを報告できます（マイページの「アカウント」から）。</p>
        <button className="secondary small" onClick={() => setOpen(false)}>
          閉じる
        </button>
      </div>
    );
  }
  const len = [...body].length;
  const send = () => {
    void sync.report({ id: newId(), target, kind, body: body.trim(), context: JSON.stringify(context) });
    setSent(true);
  };
  return (
    <div className="report-form card">
      <div className="small">どこが誤っていますか</div>
      <div className="segmented" role="group" aria-label="報告の種類">
        {KINDS.map((k) => (
          <button key={k.value} className={kind === k.value ? "chosen" : ""} aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>
            {k.label}
          </button>
        ))}
      </div>
      <textarea
        aria-label="報告の内容"
        rows={4}
        maxLength={REPORT_BODY_MAX}
        placeholder="気づいたことを書いてください（条文の番号・判例の日付の誤りなど）"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="row report-actions">
        <span className="muted small">
          {len} / {REPORT_BODY_MAX}字。どの肢かは自動で付きます。返信はしません
        </span>
        <button className="secondary small" onClick={() => setOpen(false)}>
          やめる
        </button>
        <button className="small" disabled={len === 0 || len > REPORT_BODY_MAX || body.trim() === ""} onClick={send}>
          送る
        </button>
      </div>
    </div>
  );
}
