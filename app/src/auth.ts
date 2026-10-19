// ログイン（T003）。Google ログインは Firebase Authentication に任せる（決定012）。
// 手元の E2E では「テスト用ログイン」に差し替える（VITE_AUTH_MODE=test でビルドしたときだけ。本番のビルドには入らない）。
import { initializeApp } from "@firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "@firebase/auth";
import { firebaseConfig } from "./firebase-config";

export type User = { uid: string; name: string };

export interface AuthClient {
  current(): User | null;
  /** ログイン状態が変わったら呼ぶ（登録時にも1回呼ぶ）。登録を解く関数を返す */
  onChange(cb: (user: User | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** API に添える ID トークン。ログインしていなければ null */
  getToken(): Promise<string | null>;
}

export function firebaseAuthClient(): AuthClient {
  const auth = getAuth(initializeApp(firebaseConfig));
  const toUser = (u: { uid: string; displayName: string | null } | null): User | null =>
    u ? { uid: u.uid, name: u.displayName ?? "ログイン中" } : null;
  return {
    current: () => toUser(auth.currentUser),
    onChange: (cb) => onAuthStateChanged(auth, (u) => cb(toUser(u))),
    signIn: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    signOut: () => signOut(auth),
    getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null),
  };
}

/** 手元の E2E 用。利用者 ID を localStorage（tanto.testUser）に持ち、トークン "test:<ID>" を返す */
export function testAuthClient(): AuthClient {
  const KEY = "tanto.testUser";
  const listeners = new Set<(u: User | null) => void>();
  const current = (): User | null => {
    const id = localStorage.getItem(KEY);
    return id ? { uid: `test-${id}`, name: `テスト利用者 ${id}` } : null;
  };
  const emit = () => listeners.forEach((cb) => cb(current()));
  return {
    current,
    onChange: (cb) => {
      listeners.add(cb);
      cb(current());
      return () => listeners.delete(cb);
    },
    signIn: async () => {
      const id = window.prompt("テスト用の利用者 ID", "alice");
      if (id) localStorage.setItem(KEY, id);
      emit();
    },
    signOut: async () => {
      localStorage.removeItem(KEY);
      emit();
    },
    getToken: async () => {
      const id = localStorage.getItem(KEY);
      return id ? `test:${id}` : null;
    },
  };
}

export function createAuthClient(): AuthClient {
  return import.meta.env.VITE_AUTH_MODE === "test" ? testAuthClient() : firebaseAuthClient();
}
