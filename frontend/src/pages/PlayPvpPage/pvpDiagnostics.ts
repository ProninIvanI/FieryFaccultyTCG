import type { RoundResolutionResult } from '@game-core/types';
import type {
  GameStateSnapshot,
  PvpConnectionStatus,
  RoundActionIntentDraft,
  RoundAuditEvent,
} from '@/types';

export interface PvpDiagnosticRoundSyncSummary {
  roundNumber: number;
  selfLocked: boolean;
  opponentLocked: boolean;
  selfDraftCount: number;
  opponentDraftCount: number;
}

export interface PvpDiagnosticDumpParams {
  generatedAt: string;
  sessionId: string;
  playerId: string;
  status: PvpConnectionStatus;
  roundSync: PvpDiagnosticRoundSyncSummary | null;
  roundDraft: RoundActionIntentDraft[];
  roundDraftRejected: unknown;
  lastResolvedRound: RoundResolutionResult | null;
  resolvedRoundHistory: RoundResolutionResult[];
  roundAuditEvents: RoundAuditEvent[];
  matchState: GameStateSnapshot | null;
}

export const buildPvpDiagnosticDump = (params: PvpDiagnosticDumpParams): string => JSON.stringify(
  {
    generatedAt: params.generatedAt,
    sessionId: params.sessionId,
    playerId: params.playerId,
    connectionStatus: params.status,
    roundSync: params.roundSync,
    localRoundDraft: params.roundDraft,
    roundDraftRejected: params.roundDraftRejected,
    lastResolvedRound: params.lastResolvedRound,
    resolvedRoundHistory: params.resolvedRoundHistory,
    roundAuditEvents: params.roundAuditEvents,
    matchStateSummary: params.matchState
      ? {
          round: params.matchState.round,
          players: params.matchState.players,
          hands: params.matchState.hands,
          decks: params.matchState.decks
            ? Object.fromEntries(
                Object.entries(params.matchState.decks).map(([id, deck]) => [
                  id,
                  { ownerId: deck.ownerId, cards: deck.cards.length },
                ]),
              )
            : undefined,
          discardPiles: params.matchState.discardPiles,
          actionLogCount: params.matchState.actionLog?.length ?? 0,
          lastActionLogEntries: params.matchState.actionLog?.slice(-12),
          logCount: params.matchState.log?.length ?? 0,
          lastLogEntries: params.matchState.log?.slice(-24),
        }
      : null,
  },
  null,
  2,
);
