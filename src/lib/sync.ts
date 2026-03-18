// ==========================================
// Supabase リアルタイム同期
// ==========================================

import { supabase, SESSION_ID } from './supabase';

// 保存対象のstateキー
const STATE_KEYS = [
  'categories', 'players', 'allMatches', 'leagueGroups',
  'catPhases', 'venueAssignments', 'tournamentData',
  'catStartFormats', 'catAdvanceCounts', 'catThirdPlace',
  'finalsVenueId', 'initialized', 'teams', 'allTeamMatches',
] as const;

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
    // 前の保存がまだ実行中なら待つ
    if (savePromise) await savePromise;

    savePromise = (async () => {
      try {
        const data = extractSyncData(state);
        const { error } = await supabase
          .from('tournament_state')
          .upsert({
            id: SESSION_ID,
            state: data,
            updated_at: new Date().toISOString(),
          });
        if (error) console.error('[Sync] 保存エラー:', error.message);
      } catch (e) {
        console.error('[Sync] 保存失敗:', e);
      } finally {
        savePromise = null;
      }
    })();
  }, 500); // 500ms デバウンス
}

// Supabaseから状態を読み込み
export async function loadFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('tournament_state')
      .select('state')
      .eq('id', SESSION_ID)
      .single();

    if (error) {
      console.error('[Sync] 読み込みエラー:', error.message);
      return null;
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

// Realtimeサブスクリプション開始
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function subscribeToChanges(onUpdate: (state: Record<string, any>) => void) {
  const channel = supabase
    .channel('tournament-sync')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'tournament_state',
        filter: `id=eq.${SESSION_ID}`,
      },
      (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newState = payload.new as { state: Record<string, any> };
        if (newState?.state) {
          onUpdate(newState.state);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
