import { useEffect, useState } from "react";
import StatementDrill from "./StatementDrill";
import QuestionDrill from "./QuestionDrill";
import Footer from "./Footer";
import type { Filter } from "./history";
import { SyncBadge } from "./AuthBar";
import type { AuthClient } from "./auth";
import type { SyncedStore } from "./sync";
import { onLearningChange } from "./learning";
import { groupBySubject, useSets } from "./data";
import { back, navigate, tabOf, useRoute } from "./router";
import { currentPlay } from "./play";
import TabBar from "./TabBar";
import Home from "./screens/Home";
import SubjectList from "./screens/SubjectList";
import SubjectPage from "./screens/SubjectPage";
import MyPage from "./screens/MyPage";

// 画面の切り替え（T025）。画面ごとに URL を持ち、下のタブ（ホーム・科目・マイページ）で行き来する
export default function App({ auth, sync }: { auth?: AuthClient; sync?: SyncedStore }) {
  // 回答・同期で学習の状態が変わったら、集計を描き直す
  const [, setVersion] = useState(0);
  useEffect(() => onLearningChange(() => setVersion((v) => v + 1)), []);
  const route = useRoute();
  const { sets, cardIds, error } = useSets();
  const [filter, setFilter] = useState<Filter>("all");
  const [includePreReform, setIncludePreReform] = useState(false);

  const groups = groupBySubject(sets ?? []);
  const play = route.name === "play" ? currentPlay() : null;
  const group = route.name === "subject" ? groups.find((g) => g.subject === route.subject) : undefined;

  // 再読み込みなどで解く中身がない／存在しない科目のときは、行き先を直す
  useEffect(() => {
    if (route.name === "play" && !currentPlay()) navigate({ name: "home" }, { replace: true });
    if (route.name === "subject" && sets && !group) navigate({ name: "subjects" }, { replace: true });
  }, [route, sets, group]);

  const tab = tabOf(route);
  const attribution = play ? play.data.attribution : sets?.[0]?.attribution;

  return (
    <div className={`page ${tab ? "with-tabs" : "playing"}`}>
      <header className="appbar">
        <button className="link brand" onClick={() => navigate({ name: "home" })}>
          短答一問一答<span className="muted">（仮称・非公式）</span>
        </button>
        {sync && <SyncBadge sync={sync} />}
      </header>
      <main>
        {error && <p className="error">データを読めませんでした：{error}</p>}
        {!sets && !error && route.name !== "me" && <p className="muted">読み込み中…</p>}
        {sets && route.name === "home" && <Home groups={groups} cardIds={cardIds} includePreReform={includePreReform} />}
        {sets && route.name === "subjects" && <SubjectList groups={groups} cardIds={cardIds} />}
        {group && (
          <SubjectPage
            group={group}
            cardIds={cardIds}
            filter={filter}
            setFilter={setFilter}
            includePreReform={includePreReform}
            setIncludePreReform={setIncludePreReform}
          />
        )}
        {route.name === "me" && <MyPage auth={auth} sync={sync} />}
        {play?.kind === "statements" && (
          <StatementDrill
            title={play.title}
            data={play.data}
            cards={play.cards}
            origin={play.origin}
            onExit={() => back()}
          />
        )}
        {play?.kind === "questions" && <QuestionDrill info={play.info} data={play.data} onExit={() => back()} />}
      </main>
      <Footer attribution={attribution} />
      {tab && <TabBar active={tab} />}
    </div>
  );
}
