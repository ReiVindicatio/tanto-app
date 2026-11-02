import { asUser, setAsUser, useRealAdmin } from "./admin";

/** 管理者の印。押すと一般の人の見え方と切り替える（読み込み直して、全部の画面を揃える） */
export function AdminBadge() {
  const real = useRealAdmin();
  if (!real) return null;
  const off = asUser();
  return (
    <button
      type="button"
      className={`admin-badge${off ? " off" : ""}`}
      aria-pressed={!off}
      title={off ? "押すと管理者の表示に戻します" : "押すと一般の人の表示にします"}
      onClick={() => {
        setAsUser(!off);
        location.reload();
      }}
    >
      {off ? "一般で表示中" : "管理者"}
    </button>
  );
}
