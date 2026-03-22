import { Request, Response } from 'express';
import { ApiResponse, CompleteMatchInput, CreateMatchRecordInput, MatchReplayResponse, MatchResponse, SaveMatchReplayInput } from '../types';
import { MatchService } from '../services/matchService';

const matchService = new MatchService();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : value === null || value === undefined ? null : null;

const parseCreateMatchInput = (value: unknown): CreateMatchRecordInput | null => {
  if (!isRecord(value) || !Array.isArray(value.players)) {
    return null;
  }

  const players = value.players.map((player) => {
    if (!isRecord(player)) {
      return null;
    }

    if (
      typeof player.id !== 'string' ||
      typeof player.userId !== 'string' ||
      typeof player.playerSlot !== 'number' ||
      typeof player.playerIdInMatch !== 'string'
    ) {
      return null;
    }

    return {
      id: player.id,
      userId: player.userId,
      playerSlot: player.playerSlot,
      playerIdInMatch: player.playerIdInMatch,
      deckId: asNullableString(player.deckId),
      deckNameSnapshot: asNullableString(player.deckNameSnapshot),
      deckSnapshot: player.deckSnapshot ?? null,
      connectedAt: asNullableString(player.connectedAt),
    };
  });

  if (
    typeof value.id !== 'string' ||
    typeof value.matchId !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.seed !== 'string' ||
    typeof value.gameCoreVersion !== 'string' ||
    typeof value.rulesVersion !== 'string' ||
    players.some((player) => player === null)
  ) {
    return null;
  }

  return {
    id: value.id,
    matchId: value.matchId,
    status: value.status as CreateMatchRecordInput['status'],
    createdByUserId: asNullableString(value.createdByUserId),
    seed: value.seed,
    gameCoreVersion: value.gameCoreVersion,
    rulesVersion: value.rulesVersion,
    startState: value.startState,
    startedAt: asNullableString(value.startedAt),
    lastAppliedActionAt: asNullableString(value.lastAppliedActionAt),
    players: players.filter((player): player is NonNullable<typeof player> => player !== null),
  };
};

const parseCompleteMatchInput = (value: unknown): CompleteMatchInput | null => {
  if (!isRecord(value) || !Array.isArray(value.players)) {
    return null;
  }

  const players = value.players.map((player) => {
    if (
      !isRecord(player) ||
      typeof player.userId !== 'string' ||
      typeof player.isWinner !== 'boolean' ||
      typeof player.finishResult !== 'string'
    ) {
      return null;
    }

    return {
      userId: player.userId,
      isWinner: player.isWinner,
      finishResult: player.finishResult as CompleteMatchInput['players'][number]['finishResult'],
      disconnectedAt: asNullableString(player.disconnectedAt),
    };
  });

  if (
    typeof value.status !== 'string' ||
    typeof value.endReason !== 'string' ||
    typeof value.turnCount !== 'number' ||
    typeof value.actionCount !== 'number' ||
    players.some((player) => player === null)
  ) {
    return null;
  }

  return {
    status: value.status as CompleteMatchInput['status'],
    winnerUserId: asNullableString(value.winnerUserId),
    endReason: value.endReason as CompleteMatchInput['endReason'],
    finalState: value.finalState,
    turnCount: value.turnCount,
    actionCount: value.actionCount,
    finishedAt: asNullableString(value.finishedAt),
    lastAppliedActionAt: asNullableString(value.lastAppliedActionAt),
    players: players.filter((player): player is NonNullable<typeof player> => player !== null),
  };
};

const parseSaveReplayInput = (value: unknown): SaveMatchReplayInput | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.matchId !== 'string' ||
    typeof value.formatVersion !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    matchId: value.matchId,
    formatVersion: value.formatVersion,
    initialContext: value.initialContext,
    commandLog: value.commandLog,
    checkpoints: value.checkpoints ?? null,
    finalHash: asNullableString(value.finalHash),
  };
};

export const createInternalMatch = async (
  req: Request,
  res: Response<ApiResponse<MatchResponse>>,
): Promise<void> => {
  const input = parseCreateMatchInput(req.body);
  if (!input) {
    res.status(400).json({ success: false, error: 'Некорректный payload матча' });
    return;
  }

  const match = await matchService.createMatch(input);
  res.status(201).json({ success: true, data: { match } });
};

export const completeInternalMatch = async (
  req: Request,
  res: Response<ApiResponse<MatchResponse>>,
): Promise<void> => {
  const input = parseCompleteMatchInput(req.body);
  if (!input) {
    res.status(400).json({ success: false, error: 'Некорректный payload завершения матча' });
    return;
  }

  const match = await matchService.completeMatch(req.params.matchId, input);
  if (!match) {
    res.status(404).json({ success: false, error: 'Матч не найден' });
    return;
  }

  res.status(200).json({ success: true, data: { match } });
};

export const saveInternalReplay = async (
  req: Request,
  res: Response<ApiResponse<MatchReplayResponse>>,
): Promise<void> => {
  const input = parseSaveReplayInput(req.body);
  if (!input) {
    res.status(400).json({ success: false, error: 'Некорректный payload replay' });
    return;
  }

  const replay = await matchService.saveReplay(input);
  res.status(200).json({ success: true, data: { replay } });
};
