// ==========================================
// 大会運営グローバルストア（Zustand）
// ==========================================

import { create } from 'zustand';
import type { Player, Match, PhaseType, TournamentData, Category, Team, TeamMatch, MatchPlayer } from '@/lib/types';
import { DEFAULT_CATEGORIES, VENUES, PHASE_TYPES, RESULT, generateSamplePlayers } from '@/lib/constants';
import { generateId } from '@/lib/uuid';
import { createLeagueGroups, createLeagueMatches, calcStandings } from '@/lib/logic/league';
import { generateBracket } from '@/lib/logic/tournament';
import { createTeamLeagueGroups, createTeamLeagueMatches, generateTeamBracket, determineTeamMatchResult } from '@/lib/logic/team';
import { isFinalMatch } from '@/lib/helpers';

interface TournamentState {
  // --- データ ---
  categories: Category[];
  players: Player[];
  allMatches: Match[];
  leagueGroups: Record<string, Player[][]>; // categoryId -> グループ配列
  catPhases: Record<string, PhaseType>;
  venueAssignments: Record<string, string>; // categoryId -> venueId
  tournamentData: Record<string, TournamentData>;
  catStartFormats: Record<string, PhaseType>;
  catAdvanceCounts: Record<string, number>;
  catThirdPlace: Record<string, boolean>;
  finalsVenueId: string | null;
  initialized: boolean;
  teams: Team[];
  allTeamMatches: TeamMatch[];

  // --- 算出値 ---
  getActiveCats: () => (Category & {
    playerCount: number;
    phase: PhaseType;
    startFormat: PhaseType;
    advanceCount: number;
    thirdPlace: boolean;
  })[];
  getTotalMatches: () => number;
  getCompletedMatches: () => number;
  getProgressPct: () => number;
  isPhaseComplete: (catId: string) => boolean;
  getDeferredFinals: () => Match[];
  allFinalsReady: () => boolean;

  // --- カテゴリ管理アクション ---
  addCategory: (cat: Category) => void;
  updateCategory: (catId: string, updates: Partial<Category>) => void;
  removeCategory: (catId: string) => void;
  mergeCategories: (sourceIds: string[], newCat: Category) => void;
  splitCategory: (catId: string, newCats: Category[]) => void;
  resetCategories: () => void;

  // --- データインポート ---
  importPlayers: (newPlayers: Player[]) => void;

  // --- 試合アクション ---
  initSample: () => void;
  reset: () => void;
  setStartFormat: (catId: string, format: PhaseType) => void;
  setAllStartFormats: (format: PhaseType) => void;
  setVenueForCat: (catId: string, venueId: string) => void;
  setAdvanceCount: (catId: string, count: number) => void;
  toggleThirdPlace: (catId: string) => void;
  startCategory: (catId: string) => void;
  startAll: () => void;
  advancePhase: (catId: string, nextPhase: PhaseType, advanceCount: number, hasThirdPlace: boolean) => void;
  revertPhase: (catId: string) => void;
  submitMatchResult: (updatedMatch: Match) => void;
  activateMatch: (matchId: string) => void;
  startFinals: (venueId: string) => void;
  setFinalsVenue: (venueId: string) => void;

  // --- 団体戦アクション ---
  addTeam: (team: Team) => void;
  removeTeam: (teamId: string) => void;
  startTeamCategory: (catId: string) => void;
  activateTeamMatch: (matchId: string) => void;
  submitTeamBoutResult: (matchId: string, position: string, bout: TeamMatch['bouts'][number]) => void;
  submitRepresentativeBout: (matchId: string, bout: TeamMatch['bouts'][number]) => void;
  setTeamBoutLineup: (matchId: string, lineup: { position: string; playerA: MatchPlayer | null; playerB: MatchPlayer | null }[]) => void;
}

export const useTournamentStore = create<TournamentState>((set, get) => ({
  categories: [...DEFAULT_CATEGORIES],
  players: [],
  allMatches: [],
  leagueGroups: {},
  catPhases: {},
  venueAssignments: {},
  tournamentData: {},
  catStartFormats: {},
  catAdvanceCounts: {},
  catThirdPlace: {},
  finalsVenueId: null,
  initialized: false,
  teams: [],
  allTeamMatches: [],

  // --- 算出値 ---
  getActiveCats: () => {
    const { categories, players, teams, catPhases, catStartFormats, catAdvanceCounts, catThirdPlace } = get();
    return categories.map(c => {
      // 団体戦カテゴリはチーム数、個人戦は選手数
      const count = c.isTeam
        ? teams.filter(t => t.categoryId === c.id).length
        : players.filter(p => p.categoryId === c.id).length;
      return {
        ...c,
        playerCount: count,
        phase: catPhases[c.id] || PHASE_TYPES.SETUP,
        startFormat: catStartFormats[c.id] || (c.isTeam ? PHASE_TYPES.FINAL_TOURNAMENT : PHASE_TYPES.LEAGUE),
        advanceCount: catAdvanceCounts[c.id] || 1,
        thirdPlace: catThirdPlace[c.id] !== false,
      };
    }).filter(c => c.playerCount > 0);
  },

  getTotalMatches: () => {
    const { allMatches, allTeamMatches } = get();
    return allMatches.filter(m => !m.isBye).length + allTeamMatches.filter(m => !m.isBye).length;
  },
  getCompletedMatches: () => {
    const { allMatches, allTeamMatches } = get();
    return allMatches.filter(m => m.status === 'completed' && !m.isBye).length
      + allTeamMatches.filter(m => m.status === 'completed' && !m.isBye).length;
  },
  getProgressPct: () => {
    const total = get().getTotalMatches();
    const completed = get().getCompletedMatches();
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  },

  isPhaseComplete: (catId: string) => {
    const { allMatches, catPhases, tournamentData } = get();
    const phase = catPhases[catId];
    if (phase === PHASE_TYPES.AWAITING_FINALS) {
      // 決勝待ちフェーズは決勝戦が完了したら完了
      const finalMatch = allMatches.find(m =>
        m.categoryId === catId && m.type === 'tournament' && !m.isThirdPlace && !m.isBye &&
        isFinalMatch(m, tournamentData)
      );
      return !!finalMatch && finalMatch.status === 'completed';
    }
    const phaseMatches = allMatches.filter(m => m.categoryId === catId && m.phaseKey === phase && !m.isBye);
    return phaseMatches.length > 0 && phaseMatches.every(m => m.status === 'completed');
  },

  // 決勝待ちの決勝戦一覧
  getDeferredFinals: () => {
    const { allMatches, catPhases, tournamentData } = get();
    return allMatches.filter(m =>
      catPhases[m.categoryId] === PHASE_TYPES.AWAITING_FINALS &&
      isFinalMatch(m, tournamentData)
    );
  },

  // 全カテゴリの決勝が揃ったか（awaiting_finals以外のトーナメント進行中カテゴリがないか）
  allFinalsReady: () => {
    const { catPhases, tournamentData } = get();
    const hasTournCats = Object.entries(catPhases).some(([catId, phase]) =>
      (phase === PHASE_TYPES.FINAL_TOURNAMENT || phase === PHASE_TYPES.PRE_TOURNAMENT) &&
      tournamentData[catId]
    );
    const hasAwaitingCats = Object.values(catPhases).some(p => p === PHASE_TYPES.AWAITING_FINALS);
    return !hasTournCats && hasAwaitingCats;
  },

  // --- アクション ---
  // --- カテゴリ管理アクション ---
  addCategory: (cat) => {
    set(s => {
      const usedCount = Object.keys(s.venueAssignments).length;
      return {
        categories: [...s.categories, cat],
        venueAssignments: { ...s.venueAssignments, [cat.id]: VENUES[usedCount % VENUES.length].id },
      };
    });
  },

  updateCategory: (catId, updates) => {
    set(s => ({
      categories: s.categories.map(c => c.id === catId ? { ...c, ...updates } : c),
    }));
  },

  removeCategory: (catId) => {
    set(s => ({
      categories: s.categories.filter(c => c.id !== catId),
      players: s.players.filter(p => p.categoryId !== catId),
    }));
  },

  mergeCategories: (sourceIds, newCat) => {
    set(s => ({
      categories: [
        ...s.categories.filter(c => !sourceIds.includes(c.id)),
        { ...newCat, mergedFrom: sourceIds },
      ],
      players: s.players.map(p =>
        sourceIds.includes(p.categoryId) ? { ...p, categoryId: newCat.id } : p
      ),
    }));
  },

  splitCategory: (catId, newCats) => {
    set(s => ({
      categories: [
        ...s.categories.filter(c => c.id !== catId),
        ...newCats,
      ],
    }));
  },

  resetCategories: () => {
    set({ categories: [...DEFAULT_CATEGORIES] });
  },

  // --- データインポート ---
  importPlayers: (newPlayers) => {
    const cats = get().categories.filter(c => newPlayers.some(pl => pl.categoryId === c.id));
    const defaultAssigns: Record<string, string> = {};
    cats.forEach((c, i) => { defaultAssigns[c.id] = VENUES[i % 4].id; });

    set({
      players: newPlayers,
      initialized: true,
      catPhases: {},
      leagueGroups: {},
      allMatches: [],
      tournamentData: {},
      catStartFormats: {},
      catAdvanceCounts: {},
      catThirdPlace: {},
      venueAssignments: defaultAssigns,
      teams: [],
      allTeamMatches: [],
    });
  },

  // --- 試合アクション ---
  initSample: () => {
    const p = generateSamplePlayers();
    const cats = get().categories.filter(c => p.some(pl => pl.categoryId === c.id));
    const defaultAssigns: Record<string, string> = {};
    cats.forEach((c, i) => { defaultAssigns[c.id] = VENUES[i % 4].id; });

    set({
      players: p,
      initialized: true,
      catPhases: {},
      leagueGroups: {},
      allMatches: [],
      tournamentData: {},
      catStartFormats: {},
      catAdvanceCounts: {},
      catThirdPlace: {},
      venueAssignments: defaultAssigns,
      teams: [],
      allTeamMatches: [],
    });
  },

  reset: () => {
    set({
      categories: [...DEFAULT_CATEGORIES],
      players: [],
      initialized: false,
      catPhases: {},
      leagueGroups: {},
      allMatches: [],
      tournamentData: {},
      catStartFormats: {},
      catAdvanceCounts: {},
      catThirdPlace: {},
      venueAssignments: {},
      finalsVenueId: null,
      teams: [],
      allTeamMatches: [],
    });
  },

  setStartFormat: (catId, format) => {
    set(s => ({ catStartFormats: { ...s.catStartFormats, [catId]: format } }));
  },

  setAllStartFormats: (format) => {
    const activeCats = get().getActiveCats();
    const newFormats: Record<string, PhaseType> = {};
    activeCats.forEach(c => {
      if (c.phase === PHASE_TYPES.SETUP) newFormats[c.id] = format;
    });
    set(s => ({ catStartFormats: { ...s.catStartFormats, ...newFormats } }));
  },

  setVenueForCat: (catId, venueId) => {
    set(s => ({ venueAssignments: { ...s.venueAssignments, [catId]: venueId } }));
  },

  setAdvanceCount: (catId, count) => {
    set(s => ({ catAdvanceCounts: { ...s.catAdvanceCounts, [catId]: count } }));
  },

  toggleThirdPlace: (catId) => {
    set(s => ({ catThirdPlace: { ...s.catThirdPlace, [catId]: !(s.catThirdPlace[catId] !== false) } }));
  },

  startCategory: (catId) => {
    const { players, catStartFormats, catThirdPlace } = get();
    const format = catStartFormats[catId] || PHASE_TYPES.LEAGUE;

    if (format === PHASE_TYPES.LEAGUE) {
      // リーグ戦開始
      const catPlayers = players.filter(p => p.categoryId === catId);
      const groupSize = catPlayers.length <= 6 ? 3 : 4;
      const groups = createLeagueGroups(catPlayers, groupSize);
      const matches: Match[] = [];
      groups.forEach((g, gi) => { matches.push(...createLeagueMatches(g, gi, catId, PHASE_TYPES.LEAGUE)); });

      set(s => ({
        leagueGroups: { ...s.leagueGroups, [catId]: groups },
        allMatches: [...s.allMatches, ...matches],
        catPhases: { ...s.catPhases, [catId]: PHASE_TYPES.LEAGUE },
      }));
    } else {
      // トーナメント開始
      const catPlayers = players.filter(p => p.categoryId === catId);
      const hasTP = catThirdPlace[catId] !== false;
      const phaseKey = format as PhaseType;
      // generateBracket内部で同道場分離シード配置を行う
      const { matches, totalRounds, bracketSize } = generateBracket(catPlayers, catId, phaseKey, hasTP);

      set(s => ({
        allMatches: [...s.allMatches, ...matches],
        tournamentData: { ...s.tournamentData, [catId]: { totalRounds, bracketSize, phaseKey, hasThirdPlace: hasTP } },
        catPhases: { ...s.catPhases, [catId]: phaseKey },
      }));
    }
  },

  startAll: () => {
    const { getActiveCats, categories, startCategory, startTeamCategory } = get();
    const activeCats = getActiveCats();
    activeCats.forEach(c => {
      if (c.phase !== PHASE_TYPES.SETUP) return;
      const cat = categories.find(ct => ct.id === c.id);
      if (cat?.isTeam) {
        startTeamCategory(c.id);
      } else {
        startCategory(c.id);
      }
    });
  },

  advancePhase: (catId, nextPhase, advanceCount, hasThirdPlace) => {
    const { catPhases, leagueGroups, allMatches, players } = get();
    const currentPhase = catPhases[catId];
    const groups = leagueGroups[catId] || [];
    const hasTP = hasThirdPlace;
    // nameKanaを引き継ぐためのヘルパー
    const findKana = (id: string) => players.find(p => p.id === id)?.nameKana;

    const leagueMatches = allMatches.filter(m => m.categoryId === catId && m.type === 'league');
    const tournamentMatches = allMatches.filter(m => m.categoryId === catId && m.type === 'tournament');

    // 進出者＋2位選手を収集
    const advanced: Player[] = [];
    let runnersUp: Player[] = [];

    if (currentPhase === PHASE_TYPES.LEAGUE) {
      groups.forEach((g, gi) => {
        const gMatches = leagueMatches.filter(m => m.groupIndex === gi && m.phaseKey === PHASE_TYPES.LEAGUE);
        const standings = calcStandings(g, gMatches);
        advanced.push(...standings.slice(0, advanceCount).map(s => ({
          id: s.id, name: s.name, nameKana: findKana(s.id), dojo: s.dojo, categoryId: catId,
        })));
        if (hasTP && standings.length > advanceCount) {
          const s = standings[advanceCount];
          runnersUp.push({ id: s.id, name: s.name, nameKana: findKana(s.id), dojo: s.dojo, categoryId: catId });
        }
      });
    } else if (currentPhase === PHASE_TYPES.PRE_TOURNAMENT) {
      tournamentMatches.filter(m => m.status === 'completed' && m.winnerId).forEach(m => {
        const matchPlayer = m.playerA?.id === m.winnerId ? m.playerA : m.playerB;
        const winner = {
          id: m.winnerId!,
          name: m.winnerName!,
          nameKana: matchPlayer?.nameKana || findKana(m.winnerId!),
          dojo: matchPlayer?.dojo || '',
          categoryId: catId,
        };
        if (!advanced.find(a => a.id === winner.id)) advanced.push(winner);
      });
    }

    if (advanced.length < 2) return;

    if (nextPhase === PHASE_TYPES.LEAGUE_FINAL) {
      // リーグ決勝
      const finalPlayers = [...advanced];
      const newMatches = createLeagueMatches(finalPlayers, 0, catId, PHASE_TYPES.LEAGUE_FINAL);
      set(s => ({
        leagueGroups: { ...s.leagueGroups, [`${catId}_final`]: [finalPlayers] },
        allMatches: [...s.allMatches, ...newMatches],
        catPhases: { ...s.catPhases, [catId]: PHASE_TYPES.LEAGUE_FINAL },
      }));
    } else if (nextPhase === PHASE_TYPES.FINAL_TOURNAMENT || nextPhase === PHASE_TYPES.PRE_TOURNAMENT) {
      const bracketThirdPlace = hasTP && advanced.length >= 4;
      const result = generateBracket(advanced, catId, nextPhase, bracketThirdPlace);
      const newMatches = [...result.matches];

      // 3位決定戦: ブラケットが小さい（準決勝なし）場合はリーグ2位同士
      if (hasTP && !bracketThirdPlace && runnersUp.length >= 2) {
        newMatches.push({
          id: generateId(),
          categoryId: catId,
          round: result.totalRounds,
          matchNumber: newMatches.length + 1,
          position: 99,
          type: 'tournament',
          phaseKey: nextPhase,
          playerA: { id: runnersUp[0].id, name: runnersUp[0].name, dojo: runnersUp[0].dojo },
          playerB: { id: runnersUp[1].id, name: runnersUp[1].name, dojo: runnersUp[1].dojo },
          scoreA: 0, scoreB: 0, warningsA: 0, warningsB: 0,
          winnerId: null, winnerName: null, resultType: null,
          isBye: false, status: 'pending', venueId: null,
          sourceMatchA: null, sourceMatchB: null,
          isThirdPlace: true,
        });
      }

      set(s => ({
        allMatches: [...s.allMatches, ...newMatches],
        tournamentData: { ...s.tournamentData, [catId]: { totalRounds: result.totalRounds, bracketSize: result.bracketSize, phaseKey: nextPhase, hasThirdPlace: hasTP } },
        catPhases: { ...s.catPhases, [catId]: nextPhase },
      }));
    }
  },

  revertPhase: (catId) => {
    const { catPhases, tournamentData } = get();
    const currentPhase = catPhases[catId];

    if (currentPhase === PHASE_TYPES.AWAITING_FINALS) {
      // 決勝待ちから元のトーナメントフェーズに戻す
      const td = tournamentData[catId];
      const prevPhase = td?.phaseKey || PHASE_TYPES.FINAL_TOURNAMENT;
      set(s => ({ catPhases: { ...s.catPhases, [catId]: prevPhase } }));
      return;
    }

    if (currentPhase === PHASE_TYPES.LEAGUE_FINAL) {
      set(s => {
        const newGroups = { ...s.leagueGroups };
        delete newGroups[`${catId}_final`];
        return {
          allMatches: s.allMatches.filter(m => !(m.categoryId === catId && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL)),
          leagueGroups: newGroups,
          catPhases: { ...s.catPhases, [catId]: PHASE_TYPES.LEAGUE },
        };
      });
    } else if (currentPhase === PHASE_TYPES.FINAL_TOURNAMENT || currentPhase === PHASE_TYPES.PRE_TOURNAMENT) {
      set(s => {
        const newTD = { ...s.tournamentData };
        delete newTD[catId];
        return {
          allMatches: s.allMatches.filter(m => !(m.categoryId === catId && m.type === 'tournament')),
          tournamentData: newTD,
          catPhases: { ...s.catPhases, [catId]: PHASE_TYPES.LEAGUE },
        };
      });
    }
  },

  submitMatchResult: (updatedMatch) => {
    set(s => {
      let updated = s.allMatches.map(m => m.id === updatedMatch.id ? updatedMatch : m);

      if (updatedMatch.type === 'tournament' && updatedMatch.winnerId) {
        // 勝者を次ラウンドに伝播
        const nextMatch = updated.find(m =>
          m.categoryId === updatedMatch.categoryId &&
          m.type === 'tournament' &&
          m.phaseKey === updatedMatch.phaseKey &&
          !m.isThirdPlace &&
          (m.sourceMatchA === updatedMatch.id || m.sourceMatchB === updatedMatch.id)
        );
        if (nextMatch) {
          const isA = nextMatch.sourceMatchA === updatedMatch.id;
          const winnerPlayer = updatedMatch.playerA?.id === updatedMatch.winnerId
            ? updatedMatch.playerA : updatedMatch.playerB;
          updated = updated.map(m => m.id === nextMatch.id
            ? { ...m, [isA ? 'playerA' : 'playerB']: { id: updatedMatch.winnerId!, name: updatedMatch.winnerName!, nameKana: winnerPlayer?.nameKana, dojo: winnerPlayer?.dojo } }
            : m
          );
        }

        // 敗者を3位決定戦に伝播
        const thirdPlaceMatch = updated.find(m =>
          m.categoryId === updatedMatch.categoryId &&
          m.type === 'tournament' &&
          m.phaseKey === updatedMatch.phaseKey &&
          m.isThirdPlace &&
          (m.sourceMatchA === updatedMatch.id || m.sourceMatchB === updatedMatch.id)
        );
        if (thirdPlaceMatch) {
          const isA = thirdPlaceMatch.sourceMatchA === updatedMatch.id;
          const loserPlayer = updatedMatch.playerA?.id === updatedMatch.winnerId ? updatedMatch.playerB : updatedMatch.playerA;
          updated = updated.map(m => m.id === thirdPlaceMatch.id
            ? { ...m, [isA ? 'playerA' : 'playerB']: { id: loserPlayer?.id!, name: loserPlayer?.name!, nameKana: loserPlayer?.nameKana, dojo: loserPlayer?.dojo } }
            : m
          );
        }
      }

      // 決勝待ち自動遷移チェック
      const catId = updatedMatch.categoryId;
      const td = s.tournamentData[catId];
      const currentPhase = s.catPhases[catId];
      let newPhases = s.catPhases;

      if (td && updatedMatch.type === 'tournament' && updatedMatch.status === 'completed') {
        const isFinal = isFinalMatch(updatedMatch, s.tournamentData);

        if (isFinal && currentPhase === PHASE_TYPES.AWAITING_FINALS) {
          // 決勝戦が完了 → done
          newPhases = { ...newPhases, [catId]: PHASE_TYPES.DONE };
        } else if (!isFinal && (currentPhase === PHASE_TYPES.FINAL_TOURNAMENT || currentPhase === PHASE_TYPES.PRE_TOURNAMENT)) {
          // 決勝以外の全試合が完了したか確認
          const catMatches = updated.filter(m => m.categoryId === catId && m.type === 'tournament' && !m.isBye);
          const nonFinalMatches = catMatches.filter(m => !isFinalMatch(m, s.tournamentData));
          const finalMatch = catMatches.find(m => isFinalMatch(m, s.tournamentData));
          if (nonFinalMatches.length > 0 && nonFinalMatches.every(m => m.status === 'completed') && finalMatch && finalMatch.status !== 'completed') {
            newPhases = { ...newPhases, [catId]: PHASE_TYPES.AWAITING_FINALS };
          }
        }
      }

      return { allMatches: updated, catPhases: newPhases };
    });
  },

  activateMatch: (matchId) => {
    set(s => ({
      allMatches: s.allMatches.map(m => m.id === matchId ? { ...m, status: 'active' as const } : m),
    }));
  },

  setFinalsVenue: (venueId) => {
    set({ finalsVenueId: venueId });
  },

  startFinals: (venueId) => {
    const { allMatches, tournamentData, catPhases } = get();
    const updated = allMatches.map(m => {
      if (catPhases[m.categoryId] === PHASE_TYPES.AWAITING_FINALS && isFinalMatch(m, tournamentData)) {
        return { ...m, venueId };
      }
      return m;
    });
    set({ allMatches: updated, finalsVenueId: venueId });
  },

  // --- 団体戦アクション ---
  addTeam: (team) => {
    set(s => {
      const newState: Partial<TournamentState> = { teams: [...s.teams, team] };
      // コート未割当なら自動割当
      if (!s.venueAssignments[team.categoryId]) {
        const usedVenues = Object.values(s.venueAssignments);
        const idx = usedVenues.length % VENUES.length;
        (newState as Record<string, unknown>).venueAssignments = { ...s.venueAssignments, [team.categoryId]: VENUES[idx].id };
      }
      return newState;
    });
  },

  removeTeam: (teamId) => {
    set(s => ({ teams: s.teams.filter(t => t.id !== teamId) }));
  },

  startTeamCategory: (catId) => {
    const { teams, catStartFormats, catThirdPlace } = get();
    const catTeams = teams.filter(t => t.categoryId === catId);
    if (catTeams.length < 2) return;

    const format = catStartFormats[catId] || PHASE_TYPES.FINAL_TOURNAMENT;

    if (format === PHASE_TYPES.LEAGUE) {
      const groupSize = catTeams.length <= 6 ? 3 : 4;
      const groups = createTeamLeagueGroups(catTeams, groupSize);
      const matches: TeamMatch[] = [];
      groups.forEach((g, gi) => { matches.push(...createTeamLeagueMatches(g, gi, catId, PHASE_TYPES.LEAGUE)); });

      set(s => ({
        allTeamMatches: [...s.allTeamMatches, ...matches],
        catPhases: { ...s.catPhases, [catId]: PHASE_TYPES.LEAGUE },
      }));
    } else {
      const shuffled = [...catTeams].sort(() => Math.random() - 0.5);
      const hasTP = catThirdPlace[catId] !== false;
      const { matches, totalRounds, bracketSize } = generateTeamBracket(shuffled, catId, format, hasTP);

      set(s => ({
        allTeamMatches: [...s.allTeamMatches, ...matches],
        tournamentData: { ...s.tournamentData, [catId]: { totalRounds, bracketSize, phaseKey: format, hasThirdPlace: hasTP } },
        catPhases: { ...s.catPhases, [catId]: format },
      }));
    }
  },

  activateTeamMatch: (matchId) => {
    set(s => ({
      allTeamMatches: s.allTeamMatches.map(m =>
        m.id === matchId ? { ...m, status: 'active' as const } : m
      ),
    }));
  },

  submitTeamBoutResult: (matchId, position, bout) => {
    set(s => {
      let updated = s.allTeamMatches.map(m => {
        if (m.id !== matchId) return m;
        const newBouts = m.bouts.map(b => b.position === position ? { ...bout, status: 'completed' as const } : b);
        return { ...m, bouts: newBouts };
      });

      // 全取組完了チェック
      const match = updated.find(m => m.id === matchId);
      if (match && match.bouts.every(b => b.status === 'completed')) {
        const result = determineTeamMatchResult(match);
        if (!result.needsRepresentative) {
          updated = updated.map(m => m.id === matchId
            ? { ...m, winsA: result.winsA, winsB: result.winsB, winnerId: result.winnerId, winnerName: result.winnerName, status: 'completed' as const }
            : m
          );

          // トーナメント: 勝者を次ラウンドに伝播
          if (match.type === 'tournament' && result.winnerId) {
            const nextMatch = updated.find(nm =>
              nm.categoryId === match.categoryId &&
              nm.type === 'tournament' &&
              !nm.isThirdPlace &&
              (nm.sourceMatchA === match.id || nm.sourceMatchB === match.id)
            );
            if (nextMatch) {
              const isA = nextMatch.sourceMatchA === match.id;
              updated = updated.map(nm => nm.id === nextMatch.id
                ? { ...nm, [isA ? 'teamA' : 'teamB']: { id: result.winnerId!, name: result.winnerName! } }
                : nm
              );
            }

            // 敗者を3位決定戦に伝播
            const thirdPlaceMatch = updated.find(nm =>
              nm.categoryId === match.categoryId &&
              nm.type === 'tournament' &&
              nm.isThirdPlace &&
              (nm.sourceMatchA === match.id || nm.sourceMatchB === match.id)
            );
            if (thirdPlaceMatch) {
              const isA = thirdPlaceMatch.sourceMatchA === match.id;
              const loserId = match.teamA?.id === result.winnerId ? match.teamB?.id : match.teamA?.id;
              const loserName = match.teamA?.id === result.winnerId ? match.teamB?.name : match.teamA?.name;
              updated = updated.map(nm => nm.id === thirdPlaceMatch.id
                ? { ...nm, [isA ? 'teamA' : 'teamB']: { id: loserId!, name: loserName! } }
                : nm
              );
            }
          }
        }
        // needsRepresentative の場合はUIが代表戦入力を促す
      }

      return { allTeamMatches: updated };
    });
  },

  submitRepresentativeBout: (matchId, bout) => {
    set(s => {
      let updated = s.allTeamMatches.map(m => {
        if (m.id !== matchId) return m;
        return { ...m, representativeBout: { ...bout, status: 'completed' as const } };
      });

      const match = updated.find(m => m.id === matchId);
      if (match) {
        const result = determineTeamMatchResult(match);
        if (!result.needsRepresentative && result.winnerId) {
          updated = updated.map(m => m.id === matchId
            ? { ...m, winnerId: result.winnerId, winnerName: result.winnerName, status: 'completed' as const }
            : m
          );

          // トーナメント勝者伝播
          if (match.type === 'tournament') {
            const nextMatch = updated.find(nm =>
              nm.categoryId === match.categoryId && nm.type === 'tournament' && !nm.isThirdPlace &&
              (nm.sourceMatchA === match.id || nm.sourceMatchB === match.id)
            );
            if (nextMatch) {
              const isA = nextMatch.sourceMatchA === match.id;
              updated = updated.map(nm => nm.id === nextMatch.id
                ? { ...nm, [isA ? 'teamA' : 'teamB']: { id: result.winnerId!, name: result.winnerName! } }
                : nm
              );
            }
          }
        }
      }

      return { allTeamMatches: updated };
    });
  },

  setTeamBoutLineup: (matchId, lineup) => {
    set(s => ({
      allTeamMatches: s.allTeamMatches.map(m => {
        if (m.id !== matchId) return m;
        const newBouts = m.bouts.map(b => {
          const entry = lineup.find(l => l.position === b.position);
          if (!entry) return b;
          return { ...b, playerA: entry.playerA, playerB: entry.playerB };
        });
        return { ...m, bouts: newBouts };
      }),
    }));
  },
}));

