// 画面と URL の対応（T025）。依存を増やさないため History API で自前に持つ。
// 公開先（Cloudflare Workers）と vite は、未知のパスでも index.html を返す（SPA）。
import { useEffect, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "subjects" }
  | { name: "subject"; subject: string }
  | { name: "me" }
  | { name: "play" }
  | { name: "mock" }
  | { name: "privacy" }
  | { name: "terms" };

export type Tab = "home" | "subjects" | "me";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function parse(pathname: string): Route {
  const p = (pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname).replace(/\/+$/, "") || "/";
  if (p === "/") return { name: "home" };
  if (p === "/subjects") return { name: "subjects" };
  const m = p.match(/^\/subjects\/([a-z]+)$/);
  if (m) return { name: "subject", subject: m[1] };
  if (p === "/me") return { name: "me" };
  if (p === "/play") return { name: "play" };
  if (p === "/mock") return { name: "mock" };
  if (p === "/privacy") return { name: "privacy" };
  if (p === "/terms") return { name: "terms" };
  return { name: "home" };
}

export function toPath(r: Route): string {
  const p = { home: "/", subjects: "/subjects", me: "/me", play: "/play", mock: "/mock", privacy: "/privacy", terms: "/terms" } as const;
  return BASE + (r.name === "subject" ? `/subjects/${r.subject}` : p[r.name]);
}

/** タブの選択状態：科目の画面は「科目」タブ、解いている画面はタブを隠す */
export function tabOf(r: Route): Tab | null {
  if (r.name === "subject") return "subjects";
  if (r.name === "play") return null;
  if (r.name === "privacy" || r.name === "terms") return "me"; // マイページ・フッターから開く
  if (r.name === "mock") return "home"; // 模試を選ぶ画面はホームから開く
  return r.name;
}

const listeners = new Set<() => void>();

// 履歴の通し番号（アプリ内で何画面進んだか）。0 なら、戻るとアプリの外に出る
function idx(): number {
  return (history.state as { idx?: number } | null)?.idx ?? 0;
}

export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const path = toPath(r);
  if (opts.replace) history.replaceState({ idx: idx() }, "", path);
  else if (location.pathname !== path) history.pushState({ idx: idx() + 1 }, "", path);
  window.scrollTo(0, 0);
  listeners.forEach((cb) => cb());
}

/** 前の画面に戻る。アプリ内に戻る先がない（URL を直接開いた）ときは代わりの画面へ */
export function back(fallback: Route = { name: "home" }): void {
  if (idx() > 0) history.back();
  else navigate(fallback, { replace: true });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(location.pathname));
  useEffect(() => {
    const update = () => setRoute(parse(location.pathname));
    window.addEventListener("popstate", update);
    listeners.add(update);
    return () => {
      window.removeEventListener("popstate", update);
      listeners.delete(update);
    };
  }, []);
  return route;
}
