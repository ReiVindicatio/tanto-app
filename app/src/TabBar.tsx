// 画面下のタブ（T025）
import { navigate, type Tab } from "./router";

const TABS: { tab: Tab; label: string; icon: string }[] = [
  // アイコンは 24×24 の線画（path の d）
  { tab: "home", label: "ホーム", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { tab: "subjects", label: "科目", icon: "M4 5h7v14H4zM13 5h7v14h-7zM6.5 9h2M15.5 9h2" },
  { tab: "me", label: "マイページ", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

export default function TabBar({ active }: { active: Tab }) {
  return (
    <nav className="tabbar" aria-label="画面の切り替え">
      {TABS.map((t) => (
        <button
          key={t.tab}
          className={active === t.tab ? "active" : ""}
          aria-current={active === t.tab ? "page" : undefined}
          onClick={() => navigate({ name: t.tab })}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
