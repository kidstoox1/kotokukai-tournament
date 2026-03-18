// ==========================================
// Supabase リアルタイム同期（Broadcast方式）
// ==========================================

import { supabase, SESSION_ID } from './supabase';

// 保存対象のstateキー
const STATE_KEYS = [
  'categories', 'players', 'allMatches', 'leagueGroups',
  'catPhases', 'venueAssignments', 'tournamentData',
  'catStartFormats', 'catAdvanceCounts', 'catThirdPlace',
  'finalsVenueId', 'initialized', 'teams', 'allTeamMatches',
] as const;

// このタブ固有のID（自分のブロードキャストを無視するため）
const TAB_ID = Math.random().toString(36).slice(2);

// Broadcastチャンネル（保存と通知で共有）
let broadcastChannel: ReturnType<typeof supabase.channel> | null = null;

function getChannel() {
  if (!broadcastChannel) {
    broadcastChannel = supabase.channel('tournament-broadcast');
  }
  return broadcastChannel;
}

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

// Supabaseに状態を保存（デバウンス付き）+ Broadcast通知
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
        if (error) {
          console.error('[Sync] 保存エラー:', error.message);
          return;
        }

        // 保存成功 → 他のタブに「更新あり」を通知
        const channel = getChannel();
        channel.send({
          type: 'broadcast',
          event: 'state-updated',
          payload: { tabId: TAB_ID, timestamp: Date.now() },
        });
        console.log('[Sync] 保存+通知完了');
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

// Broadcast サブスクリプション開始
// 他のタブが保存したら通知を受け取り、最新データをAPIから取得
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function subscribeToChanges(onUpdate: (state: Record<string, any>) => void) {
  const channel = getChannel();

  channel
    .on('broadcast', { event: 'state-updated' }, async (message) => {
      const senderTab = message.payload?.tabId;

      // 自分が送った通知は無視
      if (senderTab === TAB_ID) {
        console.log('[Sync] 自分の通知 → スキップ');
        return;
      }

      console.log('[Sync] 他のタブから更新通知を受信');

      // Supabaseから最新データを取得
      const newState = await loadFromSupabase();
      if (newState) {
        console.log('[Sync] 最新データ適用');
        onUpdate(newState);
      }
    })
    .subscribe((status) => {
      console.log('[Sync] Broadcastステータス:', status);
    });

  return () => {
    supabase.removeChannel(channel);
    broadcastChannel = null;
  };
}
