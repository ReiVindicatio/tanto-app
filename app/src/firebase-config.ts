// Firebase の Web 用の設定値（T003）。ブラウザに渡る前提の、公開されても問題ない値（秘密の鍵ではない）。
// ログイン（Firebase Authentication）にだけ使う。DB 機能（Firestore など）は使わない（決定012）。
export const firebaseConfig = {
  apiKey: "AIzaSyARk9kYLGfqcyBxGwcMiRzvtkOyAhUUSzU",
  authDomain: "tantan-adce9.firebaseapp.com",
  projectId: "tantan-adce9",
  storageBucket: "tantan-adce9.firebasestorage.app",
  messagingSenderId: "949252341332",
  appId: "1:949252341332:web:3e8a54ed53043e7ce5b7c1",
};
