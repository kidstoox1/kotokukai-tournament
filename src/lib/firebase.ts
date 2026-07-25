// ==========================================
// Firebase 初期化
// ==========================================
// このconfigはブラウザに公開される前提の識別子であり秘密情報ではない。
// アクセス制御は Firestore セキュリティルール側で行う
// （tournament_state コレクションのみ読み書き許可）。

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBwJrwsf38hHGxQ1pH9ZMxM9rJn9lAre7w',
  authDomain: 'kotokukai-tournament.firebaseapp.com',
  projectId: 'kotokukai-tournament',
  storageBucket: 'kotokukai-tournament.firebasestorage.app',
  messagingSenderId: '820000777044',
  appId: '1:820000777044:web:3a59ce334aa52e59b51ec1',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// セッションID: 全端末で同じデータを共有するための固定キー
export const SESSION_ID = 'main';
