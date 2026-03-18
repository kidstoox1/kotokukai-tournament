// ==========================================
// Supabase リアルタイム同期（ポーリング方式）
// ==========================================

import { supabase, SESSION_ID } from './supabase';

// 保存対象のstateキー
const STATE_KEYS = [
  'categories', 'players', 'allMatches', 'leagueGroups',
  'catPhases', 'venueAssignments', 'tournamentData',
  'catStartFormats', 'catAdvanceCounts', 'catThirdPlace',
  'finalsVenueId', 'initialized', 'teams', 'allTeamMatches',
] as const;

// 最後に確認したタイムスタンプ
let lastKnownTimestamp: string | null = null;
// 自分が最後に保存したタイムスタンプ（自分の更新を無視するため）
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

// Supabaseに状態を保存（デバウンス付き）
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePromise: Promise<void> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function saveToSupabase(state: Record<string, any>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (savePromise) await savePromise;

    savePromise = (async () => {
      try {
        const data = extractSyncData(state);
        const now = new Date().toISOString();
        const { error } = await supabase
          .from('tournament_state')
          .upsert({
            id: SESSION_ID,
            state: data,
            updated_at: now,
          });
        if (error) {
          console.error('[Sync] 保存エラー:', error.message);
          return;
        }
        // 自分が保存したタイムスタンプを記録
        lastSavedTimestamp = now;
        lastKnownTimestamp = now;
        console.log('[Sync] 保存完了:', now);
      } catch (e) {
        console.error('[Sync] 保存失敗:', e);
      } finally {
        savePromise = null;
      }
    })();
  }, 500);
}

// Supabaseから状態を読み込み
export async function loadFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('tournament_state')
      .select('state, updated_at')
      .eq('id', SESSION_ID)
      .single();

    if (error) {
      console.error('[Sync] 読み込みエラー:', error.message);
      return null;
    }

    if (data?.updated_at) {
      lastKnownTimestamp = data.updated_at;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = data?.state as Record<string, any> | null;
    if (!state || Object.keys(state).length === 0) return null;
    return state;
  } catch (e) {
    console.error('[Sync] 読み込み失敗:', e);
    return null;
  }
}

// ポーリングで変更を検知（3秒間隔）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function subscribeToChanges(onUpdate: (state: Record<string, any>) => void) {
  console.log('[Sync] ポーリング開始（3秒間隔）');

  const pollInterval = setInterval(async () => {
    try {
      // updated_at だけ取得（軽量）
      const { data, error } = await supabase
        .from('tournament_state')
        .select('updated_at')
        .eq('id', SESSION_ID)
        .single();

      if (error || !data) return;

      const remoteTimestamp = data.updated_at;

      // 自分が保存したものは無視
      if (remoteTimestamp === lastSavedTimestamp) return;

      // タイムスタンプが変わっていたら更新あり
      if (remoteTimestamp && remoteTimestamp !== lastKnownTimestamp) {
        console.log('[Sync] 更新検知:', lastKnownTimestamp, '→', remoteTimestamp);
        lastKnownTimestamp = remoteTimestamp;

        // 最新のstateを取得
        const fullData = await loadFromSupabase();
        if (fullData) {
          console.log('[Sync] 最新データ適用');
          onUpdate(fullData);
        }
      }
    } catch {
      // ネットワークエラーは静かに無視
    }
  }, 3000);

  return () => {
    console.log('[Sync] ポーリング停止');
    clearInterval(pollInterval);
  };
}
