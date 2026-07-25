// ==========================================
// Firestore リアルタイム同期
// ==========================================
// 大会の全状態を1つのドキュメント (tournament_state/main) にJSON文字列で保存し、
// onSnapshot で全端末へプッシュ配信する。
// JSON文字列にする理由: state には Player[][] のようなネスト配列が含まれ、
// Firestore はネスト配列を直接保存できないため。

import { db, SESSION_ID } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

// 保存対象のstateキー
const STATE_KEYS = [
  'categories', 'players', 'allMatches', 'leagueGroups',
  'catPhases', 'venueAssignments', 'tournamentData',
  'catStartFormats', 'catAdvanceCounts', 'catThirdPlace',
  'finalsVenueId', 'initialized', 'teams', 'allTeamMatches',
] as const;

// 自分が最後に保存したタイムスタンプ（自分の更新をスキップするため）
let lastSavedTimestamp: string | null = null;

// stateから保存対象のデータだけ抽出
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSyncData(state: Record<string, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  for (const key of STATE_KEYS) {
    data[key] = state[key];
  }
  return data;
}

const stateDoc = () => doc(db, 'tournament_state', SESSION_ID);

// Firestoreに状態を保存（デバウンス付き）
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function saveToCloud(state: Record<string, any>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const data = extractSyncData(state);
      const now = new Date().toISOString();
      lastSavedTimestamp = now;
      await setDoc(stateDoc(), {
        stateJson: JSON.stringify(data),
        updated_at: now,
      });
      console.log('[Sync] 保存完了:', now);
    } catch (e) {
      console.error('[Sync] 保存失敗:', e);
    }
  }, 500);
}

// Firestoreから状態を読み込み
// データなし → null / 通信・権限エラー → throw（呼び出し側でオフライン表示にする）
export async function loadFromCloud() {
  const snap = await getDoc(stateDoc());
  if (!snap.exists()) return null;
  const raw = snap.data();
  if (!raw?.stateJson) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = JSON.parse(raw.stateJson) as Record<string, any> | null;
  if (!state || Object.keys(state).length === 0) return null;
  return state;
}

// 変更のリアルタイム監視（他端末の更新をプッシュで受信）
export function subscribeToChanges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (state: Record<string, any>) => void,
  onStatus?: (status: 'connected' | 'offline') => void,
) {
  console.log('[Sync] リアルタイム監視開始');

  const unsubscribe = onSnapshot(
    stateDoc(),
    (snap) => {
      // スナップショットが届いている = 接続は生きている
      onStatus?.('connected');

      // 自端末の書き込みのローカルエコーは無視
      if (snap.metadata.hasPendingWrites) return;
      if (!snap.exists()) return;

      const raw = snap.data();
      if (!raw?.stateJson) return;
      // 自分が保存したものは無視
      if (raw.updated_at && raw.updated_at === lastSavedTimestamp) return;

      try {
        const state = JSON.parse(raw.stateJson);
        if (state && Object.keys(state).length > 0) {
          console.log('[Sync] 更新受信:', raw.updated_at);
          onUpdate(state);
        }
      } catch (e) {
        console.error('[Sync] 受信データの解析失敗:', e);
      }
    },
    (error) => {
      console.error('[Sync] 監視エラー:', error);
      onStatus?.('offline');
    },
  );

  return () => {
    console.log('[Sync] リアルタイム監視停止');
    unsubscribe();
  };
}
