'use client';

import { useState, useEffect, useRef } from 'react';
import { useTournamentStore } from '@/store/tournament';
import { loadFromSupabase, subscribeToChanges } from '@/lib/sync';
import {
  VENUES,
  PHASE_TYPES,
  PHASE_LABELS,
  PHASE_COLORS,
  RED,
  WHITE_PLAYER,
} from '@/lib/constants';
import { calcStandings } from '@/lib/logic/league';
import { getFinalRankings, getLeagueFinalRankings } from '@/lib/logic/rankings';
import type { Match, PhaseType, FinalRanking, LeagueStanding, Player } from '@/lib/types';

// ==========================================
// 共通コンポーネント
// ==========================================
function PhaseTag({ phase }: { phase: PhaseType }) {
  const pc = PHASE_COLORS[phase] || PHASE_COLORS.setup;
  return (
    <span
      className="inline-block px-[10px] py-[3px] rounded-xl text-[10px] font-bold"
      style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` }}
    >
      {PHASE_LABELS[phase]}
    </span>
  );
}

function NameWithKana({ name, kana, size = 'md' }: { name: string; kana?: string; size?: 'sm' | 'md' | 'lg' }) {
  if (!kana) return <span>{name}</span>;
  const rubySize = size === 'sm' ? '7px' : size === 'lg' ? '9px' : '8px';
  return (
    <ruby>
      {name}
      <rp>(</rp>
      <rt style={{ fontSize: rubySize, color: '#9CA3AF', fontWeight: 400, letterSpacing: '0.02em' }}>{kana}</rt>
      <rp>)</rp>
    </ruby>
  );
}

function WarningIndicator({ warnings }: { warnings: number }) {
  if (!warnings || warnings === 0) return null;
  return (
    <span className="text-[9px] text-amber-500 font-bold ml-0.5">⚠{warnings}</span>
  );
}

function StandingsTable({
  standings,
  groupIdx,
  advanceCount = 2,
}: {
  standings: LeagueStanding[];
  groupIdx: number;
  advanceCount?: number;
}) {
  return (
    <div className="mb-3">
      <div className="text-[11px] font-bold text-gray-400 mb-1.5">
        グループ {String.fromCharCode(65 + groupIdx)}
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px] w-[30px]">順位</th>
            <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">選手名</th>
            <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">所属</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">勝</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">敗</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">分</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">本数</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">勝点</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr
              key={s.id}
              style={{ background: i < advanceCount ? 'rgba(34,197,94,0.06)' : 'transparent' }}
            >
              <td className="p-2 border-b border-white/[0.04] font-bold" style={{ color: i < advanceCount ? '#22C55E' : '#9CA3AF' }}>{i + 1}</td>
              <td className="p-2 border-b border-white/[0.04] font-semibold text-white"><NameWithKana name={s.name} kana={s.nameKana} size="sm" /></td>
              <td className="p-2 border-b border-white/[0.04] text-[11px] text-gray-300">{s.dojo}</td>
              <td className="p-2 border-b border-white/[0.04] text-center text-green-500">{s.wins}</td>
              <td className="p-2 border-b border-white/[0.04] text-center text-red-500">{s.losses}</td>
              <td className="p-2 border-b border-white/[0.04] text-center text-gray-300">{s.draws}</td>
              <td className="p-2 border-b border-white/[0.04] text-center text-gray-300">{s.ipponFor}-{s.ipponAgainst}</td>
              <td className="p-2 border-b border-white/[0.04] text-center font-bold text-amber-500">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[9px] text-gray-500 mt-1">
        ※ 上位{advanceCount}名（緑表示）が次ステージ進出
      </div>
    </div>
  );
}

function FinalRankingsDisplay({ rankings }: { rankings: FinalRanking[] }) {
  if (!rankings || rankings.length === 0) return null;
  const medalColors: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
  const medalBg: Record<number, string> = { 1: 'rgba(255,215,0,0.08)', 2: 'rgba(192,192,192,0.06)', 3: 'rgba(205,127,50,0.06)' };
  const medalBorder: Record<number, string> = { 1: 'rgba(255,215,0,0.25)', 2: 'rgba(192,192,192,0.2)', 3: 'rgba(205,127,50,0.2)' };
  const rankLabel = (rank: number) => rank === 1 ? '優勝' : rank === 2 ? '準優勝' : '第3位';
  const allSameRank = rankings.every(r => r.rank === rankings[0].rank);

  return (
    <div className="mb-3.5 p-3.5 rounded-[10px]" style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.12)' }}>
      <div className="text-sm font-extrabold text-center mb-1" style={{ color: '#FFD700' }}>
        最終結果
      </div>
      {allSameRank && rankings.length > 1 && (
        <div className="text-[10px] text-amber-500 text-center mb-2">※ 同率のため全員同順位</div>
      )}
      <div className="flex gap-2 justify-center flex-wrap">
        {rankings.map((r, idx) => (
          <div
            key={r.id || idx}
            className="flex-1 min-w-[120px] max-w-[180px] py-3 px-2.5 rounded-[10px] text-center"
            style={{ background: medalBg[r.rank], border: `1.5px solid ${medalBorder[r.rank]}` }}
          >
            <div className="text-[28px] leading-none">{r.medal}</div>
            <div className="text-[10px] font-bold mt-1" style={{ color: medalColors[r.rank] }}>
              {rankLabel(r.rank)}
            </div>
            <div className="text-[15px] font-extrabold text-white mt-1"><NameWithKana name={r.name} kana={r.nameKana} /></div>
            <div className="text-[10px] text-gray-400 mt-0.5">{r.dojo}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketView({ matches, totalRounds }: { matches: Match[]; totalRounds: number }) {
  if (!totalRounds) return null;
  const roundName = (r: number, t: number) => {
    if (r === t) return '決勝';
    if (r === t - 1) return '準決勝';
    if (r === t - 2) return '準々決勝';
    return `${r}回戦`;
  };
  const normalMatches = matches.filter(m => !m.isThirdPlace);
  const thirdPlaceMatch = matches.find(m => m.isThirdPlace);

  return (
    <div>
      <div className="flex gap-4 overflow-x-auto py-2">
        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(round => {
          const rm = normalMatches
            .filter(m => m.round === round)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          return (
            <div key={round} className="min-w-[170px] flex flex-col gap-1.5">
              <div className="text-[11px] font-bold text-gray-400 text-center pb-1.5 border-b border-white/[0.08]">
                {roundName(round, totalRounds)}
              </div>
              <div className="flex flex-col gap-1.5 justify-around flex-1">
                {rm.map(m => (
                  <div
                    key={m.id}
                    className="rounded-md px-2 py-[5px] text-[11px]"
                    style={{
                      background: m.status === 'completed' ? 'rgba(34,197,94,0.05)' : m.status === 'active' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${m.status === 'completed' ? 'rgba(34,197,94,0.15)' : m.status === 'active' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'}`,
                    }}
                  >
                    {m.isBye ? (
                      <div className="text-gray-500 text-[10px] p-[2px]">{m.playerA ? <NameWithKana name={m.playerA.name} kana={m.playerA.nameKana} size="sm" /> : m.playerB ? <NameWithKana name={m.playerB.name} kana={m.playerB.nameKana} size="sm" /> : '—'} (BYE)</div>
                    ) : (
                      <>
                        <div
                          className="px-1 py-[2px] rounded-[3px] flex justify-between items-center"
                          style={{
                            background: m.winnerId === m.playerA?.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                            color: m.winnerId === m.playerA?.id ? '#22C55E' : '#D1D5DB',
                            fontWeight: m.winnerId === m.playerA?.id ? 600 : 400,
                          }}
                        >
                          <span>{m.playerA ? <NameWithKana name={m.playerA.name} kana={m.playerA.nameKana} size="sm" /> : '—'}</span>
                          {m.status === 'completed' && <span className="flex items-center">{m.scoreA}{(m.warningsA || 0) > 0 && <WarningIndicator warnings={m.warningsA} />}</span>}
                        </div>
                        <div className="text-center text-[9px] text-gray-600 py-[1px]">vs</div>
                        <div
                          className="px-1 py-[2px] rounded-[3px] flex justify-between items-center"
                          style={{
                            background: m.winnerId === m.playerB?.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                            color: m.winnerId === m.playerB?.id ? '#22C55E' : '#D1D5DB',
                            fontWeight: m.winnerId === m.playerB?.id ? 600 : 400,
                          }}
                        >
                          <span>{m.playerB ? <NameWithKana name={m.playerB.name} kana={m.playerB.nameKana} size="sm" /> : '—'}</span>
                          {m.status === 'completed' && <span className="flex items-center">{m.scoreB}{(m.warningsB || 0) > 0 && <WarningIndicator warnings={m.warningsB} />}</span>}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {thirdPlaceMatch && (
        <div className="mt-3 pt-2 border-t border-white/[0.08]">
          <div className="text-[11px] font-bold text-gray-400 mb-1.5">3位決定戦</div>
          <div
            className="rounded-md px-2 py-[5px] text-[11px] max-w-[200px]"
            style={{
              background: thirdPlaceMatch.status === 'completed' ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${thirdPlaceMatch.status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)'}`,
            }}
          >
            <div className="px-1 py-[2px] flex justify-between items-center"
              style={{
                color: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerA?.id ? '#22C55E' : '#D1D5DB',
                fontWeight: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerA?.id ? 600 : 400,
              }}>
              <span>{thirdPlaceMatch.playerA ? <NameWithKana name={thirdPlaceMatch.playerA.name} kana={thirdPlaceMatch.playerA.nameKana} size="sm" /> : '—'}</span>
              {thirdPlaceMatch.status === 'completed' && <span>{thirdPlaceMatch.scoreA}</span>}
            </div>
            <div className="text-center text-[9px] text-gray-600">vs</div>
            <div className="px-1 py-[2px] flex justify-between items-center"
              style={{
                color: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerB?.id ? '#22C55E' : '#D1D5DB',
                fontWeight: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerB?.id ? 600 : 400,
              }}>
              <span>{thirdPlaceMatch.playerB ? <NameWithKana name={thirdPlaceMatch.playerB.name} kana={thirdPlaceMatch.playerB.nameKana} size="sm" /> : '—'}</span>
              {thirdPlaceMatch.status === 'completed' && <span>{thirdPlaceMatch.scoreB}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 観覧専用ページ（メイン）
// ==========================================
export default function ViewerPage() {
  const {
    allMatches,
    venueAssignments,
    categories,
    leagueGroups,
    catPhases,
    catAdvanceCounts,
    tournamentData,
    getActiveCats,
  } = useTournamentStore();

  const activeCats = getActiveCats();
  const [specCat, setSpecCat] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const isRemoteUpdate = useRef(false);

  // Supabase同期
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      try {
        const remoteState = await loadFromSupabase();
        if (remoteState && remoteState.initialized) {
          isRemoteUpdate.current = true;
          useTournamentStore.setState(remoteState);
          setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        }
        setSyncStatus('connected');
      } catch {
        setSyncStatus('offline');
      }

      // ポーリングで変更を受信（観覧専用＝読み取りのみ）
      unsubscribe = subscribeToChanges((newState) => {
        isRemoteUpdate.current = true;
        useTournamentStore.setState(newState);
        setTimeout(() => { isRemoteUpdate.current = false; }, 100);
      });
    };

    init();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#0F1117] text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-bold">日本拳法 孝徳会</div>
          <div className="text-sm text-gray-400 mt-2">読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] text-gray-100">
      {/* ヘッダー */}
      <header className="bg-[#161821] border-b border-white/[0.06] px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="text-lg font-bold text-white">日本拳法 孝徳会 大会運営システム</div>
          <div className="text-[10px] text-gray-500">保護者・観客用ビュー</div>
          <div className="flex items-center gap-1.5 mt-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: syncStatus === 'connected' ? '#22C55E' : syncStatus === 'connecting' ? '#EAB308' : '#EF4444',
              }}
            />
            <span className="text-[10px] text-gray-400">
              {syncStatus === 'connected' ? 'リアルタイム同期中' : syncStatus === 'connecting' ? '接続中...' : 'オフライン'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {/* 現在進行中の試合 */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
          <div className="text-sm font-bold text-white mb-3">現在進行中の試合</div>
          {allMatches.filter(m => m.status === 'active').length === 0 ? (
            <div className="text-gray-500 text-center py-4">現在進行中の試合はありません</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {VENUES.map(v => {
                const active = allMatches.find(
                  m => m.status === 'active' &&
                    Object.entries(venueAssignments).some(
                      ([c, vid]) => vid === v.id && c === m.categoryId
                    )
                );
                if (!active) return null;
                return (
                  <div
                    key={v.id}
                    className="p-2.5 rounded-lg"
                    style={{ background: `${v.color}08`, border: `1px solid ${v.color}20` }}
                  >
                    <div className="text-[10px] font-semibold mb-1" style={{ color: v.color }}>
                      {v.name} — {categories.find(c => c.id === active.categoryId)?.label}
                    </div>
                    <div className="text-center text-[13px] font-semibold">
                      <span style={{ color: RED }}><NameWithKana name={active.playerA?.name || ''} kana={active.playerA?.nameKana} size="sm" /></span>
                      <span className="mx-1.5 text-gray-500">VS</span>
                      <span style={{ color: WHITE_PLAYER }}><NameWithKana name={active.playerB?.name || ''} kana={active.playerB?.nameKana} size="sm" /></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* カテゴリ選択 */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
          <div className="text-sm font-bold text-white mb-3">カテゴリ選択</div>
          <div className="flex flex-wrap gap-[5px]">
            {activeCats.map(c => (
              <button
                key={c.id}
                onClick={() => setSpecCat(specCat === c.id ? null : c.id)}
                className="px-2.5 py-[5px] rounded-md text-[11px] font-semibold cursor-pointer"
                style={{
                  border: `1px solid ${specCat === c.id ? '#B91C1C' : 'rgba(255,255,255,0.08)'}`,
                  background: specCat === c.id ? 'rgba(185,28,28,0.12)' : 'rgba(255,255,255,0.03)',
                  color: specCat === c.id ? '#FCA5A5' : '#D1D5DB',
                }}
              >
                {c.label}
                <span className="ml-1">
                  <PhaseTag phase={c.phase} />
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* カテゴリ詳細 */}
        {specCat && (
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
            <div className="text-sm font-bold text-white mb-3">
              {categories.find(c => c.id === specCat)?.label}
            </div>

            {/* 最終順位 */}
            {(() => {
              const tMatches = allMatches.filter(m => m.categoryId === specCat && m.type === 'tournament');
              const tRankings = getFinalRankings(tMatches);
              if (tRankings) return <FinalRankingsDisplay rankings={tRankings} />;
              const lfMatches = allMatches.filter(m => m.categoryId === specCat && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
              const lfPlayers = leagueGroups[`${specCat}_final`]?.[0];
              if (lfPlayers && lfMatches.length > 0) {
                const lfRankings = getLeagueFinalRankings(lfPlayers as Player[], lfMatches);
                if (lfRankings) return <FinalRankingsDisplay rankings={lfRankings} />;
              }
              return null;
            })()}

            {/* 予選リーグ結果 */}
            {(() => {
              const prelimMatches = allMatches.filter(m => m.categoryId === specCat && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE);
              const groups = leagueGroups[specCat] || [];
              if (prelimMatches.length === 0 || groups.length === 0) return null;
              return (groups as Player[][]).map((group, gi) => {
                const gM = prelimMatches.filter(m => m.groupIndex === gi);
                return <StandingsTable key={gi} standings={calcStandings(group, gM)} groupIdx={gi} advanceCount={catAdvanceCounts[specCat] || 1} />;
              });
            })()}

            {/* リーグ決勝順位表 */}
            {(() => {
              const lfMatches = allMatches.filter(m => m.categoryId === specCat && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
              const lfPlayers = leagueGroups[`${specCat}_final`]?.[0];
              if (!lfPlayers || lfMatches.length === 0) return null;
              const standings = calcStandings(lfPlayers as Player[], lfMatches);
              const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
              const medalColorsArr = ['#FFD700', '#C0C0C0', '#CD7F32'];
              return (
                <div className="mb-2">
                  <div className="text-xs font-bold mb-1.5" style={{ color: '#F472B6' }}>リーグ決勝</div>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px] w-[30px]">順位</th>
                        <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">選手名</th>
                        <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">所属</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">勝</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">敗</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">分</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">本数</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">勝点</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let cr = 1;
                        return standings.map((s, i) => {
                          if (i > 0) {
                            const prev = standings[i - 1];
                            if (!(s.points === prev.points && (s.ipponFor - s.ipponAgainst) === (prev.ipponFor - prev.ipponAgainst))) cr = i + 1;
                          }
                          const mc = medalColorsArr[cr - 1];
                          return (
                            <tr key={s.id} style={{ background: cr <= 3 ? `${mc}08` : 'transparent' }}>
                              <td className="p-2 border-b border-white/[0.04] font-bold" style={{ color: mc || '#9CA3AF' }}>{cr <= 3 ? medals[cr - 1] : cr}</td>
                              <td className="p-2 border-b border-white/[0.04] font-bold text-white"><NameWithKana name={s.name} kana={s.nameKana} size="sm" /></td>
                              <td className="p-2 border-b border-white/[0.04] text-[11px] text-gray-300">{s.dojo}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center text-green-500">{s.wins}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center text-red-500">{s.losses}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center text-gray-300">{s.draws}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center text-gray-300">{s.ipponFor}-{s.ipponAgainst}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center font-bold text-amber-500">{s.points}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* トーナメント表 */}
            {tournamentData[specCat] && (
              <BracketView
                matches={allMatches.filter(m => m.categoryId === specCat && m.type === 'tournament')}
                totalRounds={tournamentData[specCat].totalRounds}
              />
            )}
          </div>
        )}

        {/* フッター */}
        <div className="text-center text-[10px] text-gray-600 mt-8 pb-4">
          日本拳法 孝徳会 大会運営システム ・ 3秒ごとに自動更新
        </div>
      </main>
    </div>
  );
}
