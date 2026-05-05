import type { PlayerBoardModel, RoundResolutionResult } from '@game-core/types';
import type {
  GameStateSnapshot,
  PvpConnectionStatus,
  PvpServiceEvent,
  RoundActionIntentDraft,
  RoundAuditEvent,
} from '@/types';
import type {
  JoinRejectedSummary,
  RoundDraftRejectedSummary,
  RoundSyncSummary,
  TransportRejectedSummary,
} from './PlayPvpPage';

const mergeDraftIntentTargets = (
  currentDraft: RoundActionIntentDraft[],
  incomingDraft: RoundActionIntentDraft[],
): RoundActionIntentDraft[] => {
  const currentById = new Map(currentDraft.map((intent) => [intent.intentId, intent] as const));

  return incomingDraft.map((incomingIntent) => {
    if (!('target' in incomingIntent)) {
      return incomingIntent;
    }

    const currentIntent = currentById.get(incomingIntent.intentId);
    if (!currentIntent || !('target' in currentIntent)) {
      return incomingIntent;
    }

    const incomingTargetType = incomingIntent.target?.targetType;
    const incomingTargetId = incomingIntent.target?.targetId;
    const currentTargetType = currentIntent.target?.targetType;
    const currentTargetId = currentIntent.target?.targetId;

    if (
      incomingTargetId ||
      (!currentTargetId && !currentTargetType) ||
      (incomingTargetType && currentTargetType && incomingTargetType !== currentTargetType)
    ) {
      return incomingIntent;
    }

    return {
      ...incomingIntent,
      target: {
        targetType: incomingTargetType ?? currentTargetType,
        targetId: currentTargetId,
      },
    };
  });
};

const mergeResolvedRoundHistory = (
  currentHistory: RoundResolutionResult[],
  incomingHistory: RoundResolutionResult[],
): RoundResolutionResult[] => {
  const byRound = new Map<number, RoundResolutionResult>();

  currentHistory.forEach((entry) => byRound.set(entry.roundNumber, entry));
  incomingHistory.forEach((entry) => byRound.set(entry.roundNumber, entry));

  return [...byRound.values()].sort((left, right) => left.roundNumber - right.roundNumber);
};

export const handleServiceEvent = (
  event: PvpServiceEvent,
  setStatus: (status: PvpConnectionStatus) => void,
  setMatchState: (state: GameStateSnapshot | null) => void,
  setError: (value: string) => void,
  setTransportRejected: (value: TransportRejectedSummary | null) => void,
  setJoinRejected: (value: JoinRejectedSummary | null) => void,
  setRoundDraft: (value: RoundActionIntentDraft[] | ((current: RoundActionIntentDraft[]) => RoundActionIntentDraft[])) => void,
  setRoundSync: (value: RoundSyncSummary | null | ((current: RoundSyncSummary | null) => RoundSyncSummary | null)) => void,
  setLastResolvedRound: (value: RoundResolutionResult | null) => void,
  setResolvedRoundHistory: (
    value: RoundResolutionResult[] | ((current: RoundResolutionResult[]) => RoundResolutionResult[]),
  ) => void,
  setRoundDraftRejected: (value: RoundDraftRejectedSummary | null) => void,
  setSelfBoardModel: (value: PlayerBoardModel | null) => void,
  setRoundAuditEvents: (value: RoundAuditEvent[] | ((current: RoundAuditEvent[]) => RoundAuditEvent[])) => void,
): void => {
  if (event.type === 'status') {
    setStatus(event.status);
    if (event.status === 'connected') {
      setError('');
    }
    return;
  }

  if (event.type === 'state') {
    setMatchState(event.state);
    if (event.resolvedRoundHistory) {
      const sortedHistory = [...event.resolvedRoundHistory].sort((left, right) => left.roundNumber - right.roundNumber);
      setResolvedRoundHistory((currentHistory) => mergeResolvedRoundHistory(currentHistory, sortedHistory));
      setLastResolvedRound(sortedHistory[sortedHistory.length - 1] ?? null);
    }
    setTransportRejected(null);
    setJoinRejected(null);
    setError('');
    return;
  }

  if (event.type === 'transportRejected') {
    setJoinRejected(null);
    setTransportRejected({
      code: event.code,
      error: event.error,
      requestType: event.requestType,
    });
    setError(event.error);
    return;
  }

  if (event.type === 'joinRejected') {
    setTransportRejected(null);
    setJoinRejected({
      sessionId: event.sessionId,
      code: event.code,
      error: event.error,
    });
    setError(event.error);
    return;
  }

  if (event.type === 'roundDraftAccepted') {
    setRoundDraftRejected(null);
    setError('');
    return;
  }

  if (event.type === 'roundDraftRejected') {
    setRoundDraftRejected({
      operation: event.operation,
      roundNumber: event.roundNumber,
      code: event.code,
      error: event.error,
      errors: [...event.errors],
    });
    setError('');
    return;
  }

  if (event.type === 'roundDraftSnapshot') {
    const sortedDraft = [...event.intents].sort((left, right) => left.queueIndex - right.queueIndex);
    setRoundDraft((currentDraft) => mergeDraftIntentTargets(currentDraft, sortedDraft));
    setSelfBoardModel(event.boardModel ?? null);
    setRoundSync((current) => ({
      roundNumber: event.roundNumber,
      selfLocked: event.locked,
      opponentLocked: current?.roundNumber === event.roundNumber ? current.opponentLocked : false,
      selfDraftCount: sortedDraft.length,
      opponentDraftCount: current?.roundNumber === event.roundNumber ? current.opponentDraftCount : 0,
    }));
    setRoundDraftRejected(null);
    setError('');
    return;
  }

  if (event.type === 'roundStatus') {
    setRoundSync({
      roundNumber: event.roundNumber,
      selfLocked: event.selfLocked,
      opponentLocked: event.opponentLocked,
      selfDraftCount: event.selfDraftCount,
      opponentDraftCount: event.opponentDraftCount,
    });
    setError('');
    return;
  }

  if (event.type === 'roundResolved') {
    setLastResolvedRound(event.result);
    setResolvedRoundHistory((currentHistory) => {
      const withoutCurrentRound = currentHistory.filter((entry) => entry.roundNumber !== event.result.roundNumber);
      return [...withoutCurrentRound, event.result].sort((left, right) => left.roundNumber - right.roundNumber);
    });
    setRoundDraftRejected(null);
    setSelfBoardModel(null);
    setError('');
    return;
  }

  if (event.type === 'roundAudit') {
    setRoundAuditEvents((current) => [...current, event.event].slice(-120));
    return;
  }

  if (event.type === 'error') {
    setError(event.error);
  }
};
