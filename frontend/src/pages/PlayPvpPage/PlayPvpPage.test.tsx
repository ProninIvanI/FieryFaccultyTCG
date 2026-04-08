import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { within } from '@testing-library/react';
import {
  getRoundActionReasonLabel,
  getResolutionLayerLabel,
  getRoundDraftRejectCodeLabel,
  getRoundDraftValidationCodeLabel,
  getTargetTypeLabel,
} from '@game-core/rounds/presentation';
import type { ResolvedRoundAction } from '@game-core/types';
import axiosInstance from '@/services/api/axiosInstance';
import { gameWsService } from '@/services';
import { PlayPvpPage } from './PlayPvpPage';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  private listeners: Record<string, Array<(event?: unknown) => void>> = {
    open: [],
    message: [],
    error: [],
    close: [],
  };

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type]?.push(listener);
  }

  removeEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type] = this.listeners[type]?.filter((item) => item !== listener) ?? [];
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  emitMessage(payload: unknown): void {
    this.emit('message', { data: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  }

  private emit(type: string, event?: unknown): void {
    this.listeners[type]?.forEach((listener) => listener(event));
  }
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
};

const createResolvedRoundAction = (
  overrides: Partial<ResolvedRoundAction> &
    Pick<
      ResolvedRoundAction,
      'intentId' | 'playerId' | 'kind' | 'actorId' | 'layer' | 'status' | 'reasonCode' | 'summary'
    >,
): ResolvedRoundAction => ({
  orderIndex: 0,
  queueIndex: 0,
  priority: 0,
  source: { type: 'actor', actorId: overrides.actorId },
  ...overrides,
});

const setAuthSession = (userId: string, username = userId): void => {
  localStorage.setItem(
    'fftcg_session',
    JSON.stringify({ userId, username, token: `token_${userId}`, createdAt: '2026-03-20T12:00:00.000Z' }),
  );
};

const mockDeckList = (characterId: string) => {
  const deferred = createDeferred<Awaited<ReturnType<typeof axiosInstance.get>>>();

  vi.spyOn(axiosInstance, 'get').mockReturnValue(deferred.promise);

  const response = {
    data: {
      success: true,
      data: {
        decks: [
          {
            id: 'deck_1',
            userId: 'user_1',
            name: 'Aggro Fire',
            characterId,
            createdAt: '2026-03-20T12:00:00.000Z',
            updatedAt: '2026-03-20T12:00:00.000Z',
            cards: [{ cardId: '1', quantity: 2 }],
          },
        ],
      },
    },
  } as Awaited<ReturnType<typeof axiosInstance.get>>;

  return async () => {
    deferred.resolve(response);
    await deferred.promise;
    await flushMicrotasks();
  };
};

const renderPage = async (characterId: string, userId: string, username = userId): Promise<void> => {
  setAuthSession(userId, username);
  const resolveDeckList = mockDeckList(characterId);

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PlayPvpPage />
    </MemoryRouter>,
  );

  await act(async () => {
    await resolveDeckList();
  });
};

const submitJoin = async (sessionId: string, buttonName: RegExp | string): Promise<FakeWebSocket> => {
  const sessionInput = await screen.findByDisplayValue(/session_/i);
  fireEvent.change(sessionInput, { target: { value: sessionId } });
  const matchingButtons = screen.getAllByRole('button', { name: buttonName });
  const submitButton = matchingButtons[matchingButtons.length - 1];

  expect(submitButton).toBeDefined();

  await act(async () => {
    fireEvent.click(submitButton!);
    await flushMicrotasks();
  });

  const socket = FakeWebSocket.instances[0];
  expect(socket).toBeDefined();

  await act(async () => {
    socket.emitOpen();
    await flushMicrotasks();
  });

  return socket;
};

const createRoundState = (overrides: Record<string, unknown> = {}) => ({
  round: {
    number: 1,
    status: 'draft',
    initiativePlayerId: 'user_1',
    players: {
      user_1: { playerId: 'user_1', locked: false, draftCount: 0 },
      user_2: { playerId: 'user_2', locked: false, draftCount: 0 },
    },
  },
  turn: { number: 1, activePlayerId: 'user_1' },
  phase: { current: 'RoundPhase' },
  actionLog: [],
  ...overrides,
});

describe('PlayPvpPage', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    localStorage.clear();
    gameWsService.disconnect();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(async () => {
    await act(async () => {
      gameWsService.disconnect();
      await flushMicrotasks();
    });
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('creates match, locks round and renders roundResolved outcome', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_alpha', /Создать/i);

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({ type: 'join', sessionId: 'session_alpha', token: 'token_user_1', deckId: 'deck_1', seed: 1 }),
      );
    });

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 1, maxMana: 1, actionPoints: 1, characterId: 'char_1' },
            user_2: { mana: 1, maxMana: 1, actionPoints: 1, characterId: 'char_2' },
          },
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1', 'deck_card_2'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_3', 'deck_card_4'] },
          },
          hands: {
            user_1: ['hand_card_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            hand_card_1: { id: 'hand_card_1', definitionId: '1', ownerId: 'user_1', zone: 'hand' },
          },
        }),
      });
      socket.emitMessage({
        type: 'roundStatus',
        roundNumber: 1,
        selfLocked: false,
        opponentLocked: false,
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByText(/Матч активен/i)).toBeInTheDocument();
      expect(screen.getByText(/session_alpha/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Завершить ход/i })).toBeEnabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Завершить ход/i }));
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(socket.sent).toContain(JSON.stringify({ type: 'roundDraft.lock', roundNumber: 1 }));
    });

    await act(async () => {
      socket.emitMessage({
        type: 'roundResolved',
        result: {
          roundNumber: 1,
          orderedActions: [
            createResolvedRoundAction({
              intentId: 'draft_1',
              playerId: 'user_1',
              kind: 'CastSpell',
              actorId: 'char_1',
              layer: 'offensive_control_spells',
              target: { targetType: 'enemyCharacter', targetId: 'char_2' },
              cardInstanceId: 'spell_card_1',
              definitionId: '1',
              source: { type: 'card', cardInstanceId: 'spell_card_1', definitionId: '1' },
              status: 'resolved',
              reasonCode: 'resolved',
              summary: 'Огненный шар нанёс урон',
            }),
          ],
        },
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Огненный шар нанёс урон/i).length).toBeGreaterThan(0);
    });
  });

  it('hides diagnostics by default and reveals raw snapshot only after explicit toggle', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_diagnostics', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 1, maxMana: 1, actionPoints: 1, characterId: 'char_1' },
            user_2: { mana: 1, maxMana: 1, actionPoints: 1, characterId: 'char_2' },
          },
        }),
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByText(/Боевой режим/i)).toBeInTheDocument();
      expect(screen.queryByText(/Debug state/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Открыть raw snapshot/i)).not.toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Показать диагностику/i }));
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByText(/Диагностика включена/i)).toBeInTheDocument();
      expect(screen.getByText(/Debug state/i)).toBeInTheDocument();
      expect(screen.getByText(/Открыть raw snapshot/i)).toBeInTheDocument();
      expect(screen.getByText(/Зоны игроков/i)).toBeInTheDocument();
    });
  });

  it('joins existing match as second player without sending seed', async () => {
    await renderPage('char_2', 'user_2');

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Войти/i })[0]);
      await flushMicrotasks();
    });

    const socket = await submitJoin('session_alpha', /Войти/i);

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({ type: 'join', sessionId: 'session_alpha', token: 'token_user_2', deckId: 'deck_1' }),
      );
    });

    expect(socket.sent.some((item) => item.includes('"seed"'))).toBe(false);
  });

  it('collapses connection form into compact hud after match connection', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_hud_compact', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 1, maxMana: 1, actionPoints: 1, characterId: 'char_1' },
            user_2: { mana: 1, maxMana: 1, actionPoints: 1, characterId: 'char_2' },
          },
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: [],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {},
        }),
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByText(/Матч активен/i)).toBeInTheDocument();
      expect(screen.getByText(/В игре/i)).toBeInTheDocument();
      expect(screen.getByText(/session_hud_compact/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Параметры подключения/i })).toBeInTheDocument();
      expect(screen.queryByDisplayValue('session_hud_compact')).not.toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Параметры подключения/i }));
      await flushMicrotasks();
    });

    expect(screen.getByDisplayValue('session_hud_compact')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Свернуть в HUD/i })).toBeInTheDocument();
  });

  it('sends roundDraft.replace with Summon intent for summon card from hand', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_summon', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 4, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 4, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: ['summon_card_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            summon_card_1: { id: 'summon_card_1', definitionId: '81', ownerId: 'user_1', zone: 'hand' },
          },
        }),
      });
      await flushMicrotasks();
    });

    const summonCardTitle = await screen.findByText('Огненный элементаль');
    const summonButton = summonCardTitle.closest('button');
    expect(summonButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(summonButton!);
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(
        socket.sent.some((payload) => {
          const message = JSON.parse(payload) as {
            type?: string;
            roundNumber?: number;
            intents?: Array<Record<string, unknown>>;
          };

          return (
            message.type === 'roundDraft.replace' &&
            message.roundNumber === 1 &&
            Array.isArray(message.intents) &&
            message.intents[0]?.kind === 'Summon' &&
            message.intents[0]?.cardInstanceId === 'summon_card_1'
          );
        }),
      ).toBe(true);
    });

    await waitFor(() => {
      const handSection = screen.getByText('Карты для текущего раунда').closest('section');
      expect(handSection).toBeTruthy();
      expect(within(handSection!).queryByText('Огненный элементаль')).not.toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Убрать из ленты/i }));
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(
        socket.sent.some((payload) => {
          const message = JSON.parse(payload) as {
            type?: string;
            roundNumber?: number;
            intents?: Array<Record<string, unknown>>;
          };

          return (
            message.type === 'roundDraft.replace' &&
            message.roundNumber === 1 &&
            Array.isArray(message.intents) &&
            message.intents.length === 0
          );
        }),
      ).toBe(true);
      const handSection = screen.getByText('Карты для текущего раунда').closest('section');
      expect(handSection).toBeTruthy();
      expect(within(handSection!).getByText('Огненный элементаль')).toBeInTheDocument();
    });
  });

  it('builds and sends CastSpell roundDraft through target draft UI', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_spell', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: ['spell_card_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            spell_card_1: { id: 'spell_card_1', definitionId: '1', ownerId: 'user_1', zone: 'hand' },
          },
        }),
      });
      await flushMicrotasks();
    });

    const spellCardTitle = await screen.findByText('Огненный шар');
    const spellCardButton = spellCardTitle.closest('button');
    expect(spellCardButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(spellCardButton!);
      await flushMicrotasks();
    });

    const targetButton = await screen.findByRole('button', { name: /Выбрать цель: Маг user_2/i });
    await act(async () => {
      fireEvent.click(targetButton);
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(
        socket.sent.some((payload) => {
          const message = JSON.parse(payload) as {
            type?: string;
            intents?: Array<Record<string, unknown>>;
          };
          const firstIntent = Array.isArray(message.intents) ? message.intents[0] : null;

          return (
            message.type === 'roundDraft.replace' &&
            firstIntent?.kind === 'CastSpell' &&
            firstIntent?.cardInstanceId === 'spell_card_1' &&
            JSON.stringify(firstIntent?.target) === JSON.stringify({ targetType: 'enemyCharacter', targetId: 'char_2' })
          );
        }),
      ).toBe(true);
    });

  });

  it('builds and sends PlayCard roundDraft through self-target draft UI', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_play_card', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: ['art_card_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            art_card_1: { id: 'art_card_1', definitionId: '64', ownerId: 'user_1', zone: 'hand' },
          },
        }),
      });
      await flushMicrotasks();
    });

    const artCardTitle = await screen.findByText('Медитация');
    const artCardButton = artCardTitle.closest('button');
    expect(artCardButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(artCardButton!);
      await flushMicrotasks();
    });

    const selfTargetButton = await screen.findByRole('button', { name: /Выбрать цель: Твой маг/i });
    await act(async () => {
      fireEvent.click(selfTargetButton);
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(
        socket.sent.some((payload) => {
          const message = JSON.parse(payload) as {
            type?: string;
            intents?: Array<Record<string, unknown>>;
          };
          const firstIntent = Array.isArray(message.intents) ? message.intents[0] : null;

          return (
            message.type === 'roundDraft.replace' &&
            firstIntent?.kind === 'PlayCard' &&
            firstIntent?.cardInstanceId === 'art_card_1' &&
            JSON.stringify(firstIntent?.target) === JSON.stringify({ targetType: 'self', targetId: 'char_1' })
          );
        }),
      ).toBe(true);
      expect(screen.getAllByText(new RegExp(`${getTargetTypeLabel('self')} -> Твой маг`, 'i')).length).toBeGreaterThan(0);
    });
  });

  it('keeps the remaining hand cards visible after queuing concentration before water spells', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_modifier_hand_visibility', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 10, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 10, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: ['modifier_card_1', 'water_shield_1', 'water_heal_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            modifier_card_1: { id: 'modifier_card_1', definitionId: '46', ownerId: 'user_1', zone: 'hand' },
            water_shield_1: { id: 'water_shield_1', definitionId: '17', ownerId: 'user_1', zone: 'hand' },
            water_heal_1: { id: 'water_heal_1', definitionId: '19', ownerId: 'user_1', zone: 'hand' },
          },
        }),
      });
      await flushMicrotasks();
    });

    const handSection = () => screen.getByText('Карты для текущего раунда').closest('section');

    await waitFor(() => {
      expect(within(handSection()!).getByText('Концентрация силы')).toBeInTheDocument();
      expect(within(handSection()!).getByText('Сфера воды')).toBeInTheDocument();
      expect(within(handSection()!).getByText('Водное исцеление')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Концентрация силы').closest('button')!);
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(within(handSection()!).queryByText('Концентрация силы')).not.toBeInTheDocument();
      expect(within(handSection()!).getByText('Сфера воды')).toBeInTheDocument();
      expect(within(handSection()!).getByText('Водное исцеление')).toBeInTheDocument();
      expect(screen.queryByText(/Все карты из руки уже перенесены в боевую ленту/i)).not.toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Сфера воды').closest('button')!);
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(within(handSection()!).queryByText('Концентрация силы')).not.toBeInTheDocument();
      expect(within(handSection()!).queryByText('Сфера воды')).not.toBeInTheDocument();
      expect(within(handSection()!).getByText('Водное исцеление')).toBeInTheDocument();
      expect(screen.queryByText(/Все карты из руки уже перенесены в боевую ленту/i)).not.toBeInTheDocument();
    });
  });

  it('does not lose queued hand cards when modifier and spell are clicked back to back', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_modifier_rapid_queue', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 10, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 10, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: ['modifier_card_1', 'water_shield_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            modifier_card_1: { id: 'modifier_card_1', definitionId: '46', ownerId: 'user_1', zone: 'hand' },
            water_shield_1: { id: 'water_shield_1', definitionId: '17', ownerId: 'user_1', zone: 'hand' },
          },
        }),
      });
      await flushMicrotasks();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Концентрация силы').closest('button')!);
      fireEvent.click(screen.getByText('Сфера воды').closest('button')!);
      await flushMicrotasks();
    });

    await waitFor(() => {
      const replacePayloads = socket.sent
        .map((payload) => JSON.parse(payload) as { type?: string; intents?: Array<{ cardInstanceId?: string }> })
        .filter((message) => message.type === 'roundDraft.replace');
      const lastReplace = replacePayloads[replacePayloads.length - 1];

      expect(lastReplace?.intents).toHaveLength(2);
      expect(lastReplace?.intents?.map((intent) => intent.cardInstanceId)).toEqual(['modifier_card_1', 'water_shield_1']);
    });
  });

  it('sends roundDraft.replace with Evade intent for selected allied creature', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_evade', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          characters: {
            char_1: {
              characterId: 'char_1',
              ownerId: 'user_1',
              hp: 20,
              maxHp: 20,
              dexterity: 3,
              concentration: 3,
            },
            char_2: {
              characterId: 'char_2',
              ownerId: 'user_2',
              hp: 20,
              maxHp: 20,
              dexterity: 3,
              concentration: 3,
            },
          },
          creatures: {
            ally_creature_1: {
              creatureId: 'ally_creature_1',
              ownerId: 'user_1',
              hp: 4,
              maxHp: 4,
              attack: 2,
              speed: 3,
              summonedAtRound: 0,
            },
            enemy_creature_1: {
              creatureId: 'enemy_creature_1',
              ownerId: 'user_2',
              hp: 3,
              maxHp: 3,
              attack: 1,
              speed: 2,
              summonedAtRound: 0,
            },
          },
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: [],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {},
        }),
      });
      await flushMicrotasks();
    });

    const creatureButton = await screen.findByRole('button', { name: /ally_creature_1/i });

    await act(async () => {
      fireEvent.click(creatureButton);
      await flushMicrotasks();
    });

    const evadeButton = await screen.findByRole('button', { name: /Добавить уклонение в ленту/i });
    expect(evadeButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(evadeButton);
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(
        socket.sent.some((payload) => {
          const message = JSON.parse(payload) as {
            type?: string;
            intents?: Array<Record<string, unknown>>;
          };
          const firstIntent = Array.isArray(message.intents) ? message.intents[0] : null;

          return (
            message.type === 'roundDraft.replace' &&
            firstIntent?.kind === 'Evade' &&
            firstIntent?.actorId === 'ally_creature_1' &&
            firstIntent?.playerId === 'user_1'
          );
        }),
      ).toBe(true);
      expect(screen.getAllByText(/Уклонение/i).length).toBeGreaterThan(0);
    });
  });

  it('builds creature attack from core-derived default target without manual target pick', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_attack_default', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          characters: {
            char_1: {
              characterId: 'char_1',
              ownerId: 'user_1',
              hp: 20,
              maxHp: 20,
              dexterity: 3,
              concentration: 3,
            },
            char_2: {
              characterId: 'char_2',
              ownerId: 'user_2',
              hp: 20,
              maxHp: 20,
              dexterity: 3,
              concentration: 3,
            },
          },
          creatures: {
            ally_creature_1: {
              creatureId: 'ally_creature_1',
              ownerId: 'user_1',
              hp: 4,
              maxHp: 4,
              attack: 2,
              speed: 3,
              summonedAtRound: 0,
            },
          },
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: [],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {},
        }),
      });
      await flushMicrotasks();
    });

    const creatureButton = await screen.findByRole('button', { name: /ally_creature_1/i });

    await act(async () => {
      fireEvent.click(creatureButton);
      await flushMicrotasks();
    });

    const attackButton = await screen.findByRole('button', { name: /Добавить атаку в ленту/i });
    expect(attackButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(attackButton);
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(
        socket.sent.some((payload) => {
          const message = JSON.parse(payload) as {
            type?: string;
            intents?: Array<Record<string, unknown>>;
          };
          const firstIntent = Array.isArray(message.intents) ? message.intents[0] : null;

          return (
            message.type === 'roundDraft.replace' &&
            firstIntent?.kind === 'Attack' &&
            firstIntent?.sourceCreatureId === 'ally_creature_1' &&
            JSON.stringify(firstIntent?.target) === JSON.stringify({ targetType: 'enemyCharacter', targetId: 'char_2' })
          );
        }),
      ).toBe(true);
    });
  });

  it('restores local round queue from roundDraft snapshot after sync', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_restore', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: ['spell_card_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            spell_card_1: { id: 'spell_card_1', definitionId: '1', ownerId: 'user_1', zone: 'hand' },
          },
        }),
      });
      socket.emitMessage({
        type: 'roundDraft.snapshot',
        roundNumber: 1,
        locked: false,
        intents: [
          {
            intentId: 'draft_restore',
            roundNumber: 1,
            playerId: 'user_1',
            actorId: 'char_1',
            queueIndex: 0,
            kind: 'CastSpell',
            cardInstanceId: 'spell_card_1',
            target: {
              targetType: 'enemyCharacter',
              targetId: 'char_2',
            },
          },
        ],
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Огненный шар/i).length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(new RegExp(`${getTargetTypeLabel('enemyCharacter')} -> Маг user_2`, 'i')).length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /Убрать из ленты/i })).toBeInTheDocument();
      expect(screen.queryByText(/Твой черновик раунда/i)).not.toBeInTheDocument();
    });
  });

  it('renders battle ribbon from boardView and personal boardModel snapshot', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_board_view', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: [],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {},
          boardView: {
            players: {
              user_1: {
                playerId: 'user_1',
                boardItems: [
                  {
                    id: 'creature:ally_creature_1',
                    runtimeId: 'ally_creature_1',
                    ownerId: 'user_1',
                    controllerId: 'user_1',
                    subtype: 'creature',
                    lifetimeType: 'persistent',
                    definitionId: '81',
                    placement: { layer: 'summon', orderIndex: 0, queueIndex: 0 },
                    state: { hp: 4, maxHp: 4, attack: 2, speed: 3 },
                  },
                ],
                ribbonEntries: [
                  {
                    id: 'boardItem:creature:ally_creature_1',
                    kind: 'boardItem',
                    orderIndex: 0,
                    layer: 'summon',
                    boardItemId: 'creature:ally_creature_1',
                  },
                ],
              },
              user_2: {
                playerId: 'user_2',
                boardItems: [
                  {
                    id: 'effect:enemy_effect_1',
                    runtimeId: 'enemy_effect_1',
                    ownerId: 'user_2',
                    controllerId: 'user_2',
                    subtype: 'effect',
                    lifetimeType: 'persistent',
                    definitionId: '64',
                    placement: { layer: 'defensive_modifiers', orderIndex: 0, queueIndex: 0 },
                    state: { duration: 2 },
                  },
                ],
                ribbonEntries: [
                  {
                    id: 'boardItem:effect:enemy_effect_1',
                    kind: 'boardItem',
                    orderIndex: 0,
                    layer: 'defensive_modifiers',
                    boardItemId: 'effect:enemy_effect_1',
                  },
                ],
              },
            },
          },
        }),
      });
      socket.emitMessage({
        type: 'roundDraft.snapshot',
        roundNumber: 1,
        locked: false,
        intents: [
          {
            intentId: 'draft_board_1',
            roundNumber: 1,
            playerId: 'user_1',
            actorId: 'char_1',
            queueIndex: 0,
            kind: 'Summon',
            cardInstanceId: 'summon_card_1',
          },
        ],
        boardModel: {
          playerId: 'user_1',
          boardItems: [
            {
              id: 'creature:ally_creature_1',
              runtimeId: 'ally_creature_1',
              ownerId: 'user_1',
              controllerId: 'user_1',
              subtype: 'creature',
              lifetimeType: 'persistent',
              definitionId: '81',
              placement: { layer: 'summon', orderIndex: 0, queueIndex: 0 },
              state: { hp: 4, maxHp: 4, attack: 2, speed: 3 },
            },
          ],
          ribbonEntries: [
            {
              id: 'boardItem:creature:ally_creature_1',
              kind: 'boardItem',
              orderIndex: 0,
              layer: 'summon',
              boardItemId: 'creature:ally_creature_1',
              attachedRoundActionIds: [],
            },
            {
              id: 'roundAction:draft_board_1',
              kind: 'roundAction',
              orderIndex: 1,
              layer: 'summon',
              roundActionId: 'draft_board_1',
            },
          ],
          roundActions: [
            {
              id: 'draft_board_1',
              roundNumber: 1,
              playerId: 'user_1',
              actorId: 'char_1',
              kind: 'Summon',
              source: { type: 'card', cardInstanceId: 'summon_card_1', definitionId: '81' },
              placement: { layer: 'summon', orderIndex: 0, queueIndex: 0 },
              status: 'draft',
            },
          ],
        },
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByText(/Твоя боевая лента/i)).toBeInTheDocument();
      expect(screen.getByText(/Боевая лента соперника/i)).toBeInTheDocument();
      expect(screen.getAllByText(/ally_creature_1/i).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /Убрать из ленты/i }).length).toBeGreaterThan(0);
      expect(screen.getByText(/Ходы: 2/i)).toBeInTheDocument();
      expect(screen.queryByText(/Модификаторы/i)).not.toBeInTheDocument();
    });
  });

  it('embeds board-item round action inside the local battle ribbon card', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_board_item_action', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: [],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {},
          boardView: {
            players: {
              user_1: {
                playerId: 'user_1',
                boardItems: [
                  {
                    id: 'creature:ally_creature_1',
                    runtimeId: 'ally_creature_1',
                    ownerId: 'user_1',
                    controllerId: 'user_1',
                    subtype: 'creature',
                    lifetimeType: 'persistent',
                    definitionId: '81',
                    placement: { layer: 'summon', orderIndex: 0, queueIndex: 0 },
                    state: { hp: 4, maxHp: 4, attack: 2, speed: 3 },
                  },
                ],
                ribbonEntries: [
                  {
                    id: 'boardItem:creature:ally_creature_1',
                    kind: 'boardItem',
                    orderIndex: 0,
                    layer: 'summon',
                    boardItemId: 'creature:ally_creature_1',
                  },
                ],
              },
              user_2: {
                playerId: 'user_2',
                boardItems: [],
                ribbonEntries: [],
              },
            },
          },
        }),
      });
      socket.emitMessage({
        type: 'roundDraft.snapshot',
        roundNumber: 1,
        locked: false,
        intents: [
          {
            intentId: 'draft_attack_1',
            roundNumber: 1,
            playerId: 'user_1',
            actorId: 'ally_creature_1',
            queueIndex: 0,
            kind: 'Attack',
            sourceCreatureId: 'ally_creature_1',
            target: {
              targetType: 'enemyCharacter',
              targetId: 'char_2',
            },
          },
        ],
        boardModel: {
          playerId: 'user_1',
          boardItems: [
            {
              id: 'creature:ally_creature_1',
              runtimeId: 'ally_creature_1',
              ownerId: 'user_1',
              controllerId: 'user_1',
              subtype: 'creature',
              lifetimeType: 'persistent',
              definitionId: '81',
              placement: { layer: 'summon', orderIndex: 0, queueIndex: 0 },
              state: { hp: 4, maxHp: 4, attack: 2, speed: 3 },
            },
          ],
          ribbonEntries: [
            {
              id: 'boardItem:creature:ally_creature_1',
              kind: 'boardItem',
              orderIndex: 0,
              layer: 'summon',
              boardItemId: 'creature:ally_creature_1',
              attachedRoundActionIds: ['draft_attack_1'],
            },
          ],
          roundActions: [
            {
              id: 'draft_attack_1',
              roundNumber: 1,
              playerId: 'user_1',
              actorId: 'ally_creature_1',
              kind: 'Attack',
              source: { type: 'boardItem', boardItemId: 'creature:ally_creature_1' },
              target: { targetType: 'enemyCharacter', targetId: 'char_2' },
              placement: { layer: 'attacks', orderIndex: 0, queueIndex: 0 },
              status: 'draft',
            },
          ],
        },
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByText(/Твоя боевая лента/i)).toBeInTheDocument();
      expect(screen.getByText(/Активность в раунде/i)).toBeInTheDocument();
      expect(screen.getByText(/Активно: 1/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Атака: ally_creature_1/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(new RegExp(getResolutionLayerLabel('attacks'), 'i')).length).toBeGreaterThan(0);
    });
  });

  it('binds roundResolved outcome to the local queued intent by intentId', async () => {
    await renderPage('char_1', 'user_1', 'Локальный маг');

    const socket = await submitJoin('session_result_binding', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: ['spell_card_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            spell_card_1: { id: 'spell_card_1', definitionId: '1', ownerId: 'user_1', zone: 'hand' },
          },
        }),
      });
      await flushMicrotasks();
    });

    const spellCardTitle = await screen.findByText('Огненный шар');
    const spellCardButton = spellCardTitle.closest('button');
    expect(spellCardButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(spellCardButton!);
      await flushMicrotasks();
    });

    const targetButton = await screen.findByRole('button', { name: /Выбрать цель: Маг (Соперник Ник|user_2)/i });
    await act(async () => {
      fireEvent.click(targetButton);
      await flushMicrotasks();
    });

    const draftReplacePayload = socket.sent
      .map((payload) => JSON.parse(payload) as { type?: string; intents?: Array<Record<string, unknown>> })
      .find((message) => message.type === 'roundDraft.replace' && Array.isArray(message.intents));

    const firstIntent = draftReplacePayload?.intents?.[0];
    const firstIntentId = typeof firstIntent?.intentId === 'string' ? firstIntent.intentId : 'draft_local_1';
    expect(firstIntent?.intentId).toBeTruthy();

    await act(async () => {
      socket.emitMessage({
        type: 'roundResolved',
        result: {
          roundNumber: 1,
          orderedActions: [
            createResolvedRoundAction({
              intentId: 'enemy_hidden_1',
              playerId: 'user_2',
              kind: 'Attack',
              actorId: 'enemy_creature_1',
              layer: 'attacks',
              target: { targetType: 'enemyCharacter', targetId: 'char_1' },
              source: { type: 'boardItem', boardItemId: 'creature:enemy_creature_1' },
              status: 'resolved',
              reasonCode: 'resolved',
              summary: 'Существо соперника нанесло удар',
            }),
            createResolvedRoundAction({
              orderIndex: 1,
              intentId: firstIntentId,
              playerId: 'user_1',
              kind: 'CastSpell',
              actorId: 'char_1',
              layer: 'offensive_control_spells',
              target: { targetType: 'enemyCharacter', targetId: 'char_2' },
              cardInstanceId: 'spell_card_1',
              definitionId: '1',
              source: { type: 'card', cardInstanceId: 'spell_card_1', definitionId: '1' },
              status: 'fizzled',
              reasonCode: 'target_invalidated',
              summary: 'Цель исчезла до резолва',
            }),
          ],
        },
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByText(/Атака: Существо enemy_creature_1/i)).toBeInTheDocument();
      expect(screen.getAllByText(new RegExp(`${getTargetTypeLabel('enemyCharacter')} -> Твой маг`, 'i')).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Огненный шар/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(new RegExp(`${getTargetTypeLabel('enemyCharacter')} -> Маг user_2`, 'i')).length).toBeGreaterThan(0);
      expect(screen.getAllByText(new RegExp(getRoundActionReasonLabel('target_invalidated'), 'i')).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Цель исчезла до резолва/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(new RegExp(getResolutionLayerLabel('offensive_control_spells'), 'i')).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/fizzled/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Шаги показаны в фактическом порядке общего server-side резолва/i)).toBeInTheDocument();
    });
  });

  it('plays back orderedActions step by step in the resolution spotlight', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_playback', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        playerLabels: {
          user_1: 'Локальный маг',
          user_2: 'Соперник Ник',
        },
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: [],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {},
        }),
      });
      socket.emitMessage({
        type: 'roundResolved',
        result: {
          roundNumber: 1,
          orderedActions: [
            createResolvedRoundAction({
              intentId: 'enemy_hidden_1',
              playerId: 'user_2',
              kind: 'Attack',
              actorId: 'enemy_creature_1',
              layer: 'attacks',
              source: { type: 'boardItem', boardItemId: 'creature:enemy_creature_1' },
              status: 'resolved',
              reasonCode: 'resolved',
              summary: 'Первый шаг резолва',
            }),
            createResolvedRoundAction({
              orderIndex: 1,
              intentId: 'enemy_hidden_2',
              playerId: 'user_2',
              kind: 'CastSpell',
              actorId: 'char_2',
              layer: 'offensive_control_spells',
              target: { targetType: 'enemyCharacter', targetId: 'char_1' },
              status: 'resolved',
              reasonCode: 'resolved',
              summary: 'Второй шаг резолва',
            }),
          ],
        },
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByText(/Текущий шаг резолва/i)).toBeInTheDocument();
      expect(screen.getByText((_, element) => element?.textContent === 'Раунд#1')).toBeInTheDocument();
      expect(screen.getByText((_, element) => element?.textContent === 'Всего шагов2')).toBeInTheDocument();
      expect(screen.getByText(/Соперник: 2/i)).toBeInTheDocument();
      expect(screen.getByTestId('resolution-playback-step')).toHaveTextContent('Шаг 1 из 2');
      expect(screen.getByTestId('resolution-playback-summary')).toHaveTextContent('Первый шаг резолва');
      expect(screen.getByTestId('resolution-playback-status')).toHaveTextContent('Идёт');
      expect(screen.getByTestId('enemy-resolution-playback-card')).toHaveTextContent('Резолв сейчас');
      expect(screen.getByTestId('enemy-resolution-playback-card')).toHaveTextContent('Первый шаг резолва');
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('resolution-playback-step')).toHaveTextContent('Шаг 2 из 2');
        expect(screen.getByTestId('resolution-playback-summary')).toHaveTextContent('Второй шаг резолва');
        expect(screen.getByTestId('resolution-playback-status')).toHaveTextContent('Завершён');
        expect(screen.getByTestId('enemy-resolution-playback-card')).toHaveTextContent('Второй шаг резолва');
      },
      { timeout: 2500 },
    );
  });

  it('renders the active local resolve step inside the local battle lane', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_local_playback', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: ['spell_card_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            spell_card_1: { id: 'spell_card_1', definitionId: '1', ownerId: 'user_1', zone: 'hand' },
          },
        }),
      });
      socket.emitMessage({
        type: 'roundDraft.snapshot',
        roundNumber: 1,
        locked: false,
        intents: [
          {
            intentId: 'draft_local_1',
            roundNumber: 1,
            playerId: 'user_1',
            actorId: 'char_1',
            queueIndex: 0,
            kind: 'CastSpell',
            cardInstanceId: 'spell_card_1',
            target: {
              targetType: 'enemyCharacter',
              targetId: 'char_2',
            },
          },
        ],
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Огненный шар/i).length).toBeGreaterThan(0);
    });

    await act(async () => {
      socket.emitMessage({
        type: 'roundResolved',
        result: {
          roundNumber: 1,
          orderedActions: [
            createResolvedRoundAction({
              intentId: 'draft_local_1',
              playerId: 'user_1',
              kind: 'CastSpell',
              actorId: 'char_1',
              layer: 'offensive_control_spells',
              target: { targetType: 'enemyCharacter', targetId: 'char_2' },
              cardInstanceId: 'spell_card_1',
              definitionId: '1',
              source: { type: 'card', cardInstanceId: 'spell_card_1', definitionId: '1' },
              status: 'resolved',
              reasonCode: 'resolved',
              summary: 'Локальный шаг резолва',
            }),
          ],
        },
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByTestId('local-resolution-playback-card')).toHaveTextContent('Резолв сейчас');
      expect(screen.getByTestId('local-resolution-playback-card')).toHaveTextContent('Локальный шаг резолва');
      expect(screen.getByTestId('local-resolution-playback-card')).toHaveTextContent('Локальный шаг резолва');
      expect(screen.queryByTestId('enemy-resolution-playback-card')).not.toBeInTheDocument();
    });
  });

  it('highlights the active local attached action inside the battle ribbon during playback', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_local_attached_playback', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: [],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {},
          boardView: {
            players: {
              user_1: {
                playerId: 'user_1',
                boardItems: [
                  {
                    id: 'creature:ally_creature_1',
                    runtimeId: 'ally_creature_1',
                    ownerId: 'user_1',
                    controllerId: 'user_1',
                    subtype: 'creature',
                    lifetimeType: 'persistent',
                    definitionId: '81',
                    placement: { layer: 'summon', orderIndex: 0, queueIndex: 0 },
                    state: { hp: 4, maxHp: 4, attack: 2, speed: 3 },
                  },
                ],
                ribbonEntries: [
                  {
                    id: 'boardItem:creature:ally_creature_1',
                    kind: 'boardItem',
                    orderIndex: 0,
                    layer: 'summon',
                    boardItemId: 'creature:ally_creature_1',
                    attachedRoundActionIds: ['draft_attack_1'],
                  },
                ],
              },
              user_2: {
                playerId: 'user_2',
                boardItems: [],
                ribbonEntries: [],
              },
            },
          },
        }),
      });
      socket.emitMessage({
        type: 'roundDraft.snapshot',
        roundNumber: 1,
        locked: false,
        intents: [
          {
            intentId: 'draft_attack_1',
            roundNumber: 1,
            playerId: 'user_1',
            actorId: 'ally_creature_1',
            queueIndex: 0,
            kind: 'Attack',
            sourceCreatureId: 'ally_creature_1',
            target: {
              targetType: 'enemyCharacter',
              targetId: 'char_2',
            },
          },
        ],
        boardModel: {
          playerId: 'user_1',
          boardItems: [
            {
              id: 'creature:ally_creature_1',
              runtimeId: 'ally_creature_1',
              ownerId: 'user_1',
              controllerId: 'user_1',
              subtype: 'creature',
              lifetimeType: 'persistent',
              definitionId: '81',
              placement: { layer: 'summon', orderIndex: 0, queueIndex: 0 },
              state: { hp: 4, maxHp: 4, attack: 2, speed: 3 },
            },
          ],
          ribbonEntries: [
            {
              id: 'boardItem:creature:ally_creature_1',
              kind: 'boardItem',
              orderIndex: 0,
              layer: 'summon',
              boardItemId: 'creature:ally_creature_1',
              attachedRoundActionIds: ['draft_attack_1'],
            },
          ],
          roundActions: [
            {
              id: 'draft_attack_1',
              roundNumber: 1,
              playerId: 'user_1',
              actorId: 'ally_creature_1',
              kind: 'Attack',
              source: { type: 'boardItem', boardItemId: 'creature:ally_creature_1' },
              target: { targetType: 'enemyCharacter', targetId: 'char_2' },
              placement: { layer: 'attacks', orderIndex: 0, queueIndex: 0 },
              status: 'draft',
            },
          ],
        },
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Атака: ally_creature_1/i).length).toBeGreaterThan(0);
    });

    await act(async () => {
      socket.emitMessage({
        type: 'roundResolved',
        result: {
          roundNumber: 1,
          orderedActions: [
            createResolvedRoundAction({
              intentId: 'draft_attack_1',
              playerId: 'user_1',
              kind: 'Attack',
              actorId: 'ally_creature_1',
              layer: 'attacks',
              target: { targetType: 'enemyCharacter', targetId: 'char_2' },
              source: { type: 'boardItem', boardItemId: 'creature:ally_creature_1' },
              status: 'resolved',
              reasonCode: 'resolved',
              summary: 'Атака из ленты сейчас резолвится',
            }),
          ],
        },
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByTestId('local-playback-inline-action')).toHaveTextContent('Атака: ally_creature_1');
      expect(screen.getByTestId('local-playback-inline-action')).toHaveTextContent('Attacks');
      expect(screen.getByTestId('local-resolution-playback-card')).toHaveTextContent('Атака из ленты сейчас резолвится');
    });
  });

  it('highlights an enemy public board item when the active playback step matches a single public lane item', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_enemy_public_playback', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: [],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {},
          boardView: {
            players: {
              user_1: {
                playerId: 'user_1',
                boardItems: [],
                ribbonEntries: [],
              },
              user_2: {
                playerId: 'user_2',
                boardItems: [
                  {
                    id: 'creature:enemy_creature_1',
                    runtimeId: 'enemy_creature_1',
                    ownerId: 'user_2',
                    controllerId: 'user_2',
                    subtype: 'creature',
                    lifetimeType: 'persistent',
                    definitionId: '81',
                    placement: { layer: 'summon', orderIndex: 0, queueIndex: 0 },
                    state: { hp: 4, maxHp: 4, attack: 2, speed: 3 },
                  },
                ],
                ribbonEntries: [
                  {
                    id: 'boardItem:creature:enemy_creature_1',
                    kind: 'boardItem',
                    orderIndex: 0,
                    layer: 'summon',
                    boardItemId: 'creature:enemy_creature_1',
                  },
                ],
              },
            },
          },
        }),
      });
      socket.emitMessage({
        type: 'roundResolved',
        result: {
          roundNumber: 1,
          orderedActions: [
            createResolvedRoundAction({
              intentId: 'enemy_hidden_1',
              playerId: 'user_2',
              kind: 'Summon',
              actorId: 'char_2',
              layer: 'summon',
              cardInstanceId: 'enemy_summon_card_1',
              definitionId: '81',
              source: { type: 'card', cardInstanceId: 'enemy_summon_card_1', definitionId: '81' },
              status: 'resolved',
              reasonCode: 'resolved',
              summary: 'Соперник выставил существо на поле',
            }),
          ],
        },
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByTestId('enemy-resolution-playback-card')).toHaveTextContent('Соперник выставил существо на поле');
      expect(screen.getByTestId('enemy-playback-highlight-item')).toHaveTextContent('Существо соперника');
      expect(screen.getByTestId('enemy-playback-highlight-item')).toHaveTextContent('Огненный элементаль');
    });
  });

  it('shows structured roundDraft.rejected errors near the affected intent', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_reject_binding', /Создать/i);

    await waitFor(() => {
      expect(
        socket.sent.some((payload) => {
          const message = JSON.parse(payload) as { type?: string; sessionId?: string };
          return message.type === 'join' && message.sessionId === 'session_reject_binding';
        }),
      ).toBe(true);
    });

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: ['spell_card_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            spell_card_1: { id: 'spell_card_1', definitionId: '1', ownerId: 'user_1', zone: 'hand' },
          },
        }),
      });
      socket.emitMessage({
        type: 'roundDraft.snapshot',
        roundNumber: 1,
        locked: false,
        intents: [
          {
            intentId: 'draft_restore',
            roundNumber: 1,
            playerId: 'user_1',
            actorId: 'char_1',
            queueIndex: 0,
            kind: 'CastSpell',
            cardInstanceId: 'spell_card_1',
            target: {
              targetType: 'enemyCharacter',
              targetId: 'char_2',
            },
          },
        ],
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(new RegExp(`${getTargetTypeLabel('enemyCharacter')} -> Маг user_2`, 'i')).length,
      ).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Показать диагностику/i }));
      await flushMicrotasks();
    });

    await act(async () => {
      socket.emitMessage({
        type: 'roundDraft.rejected',
        operation: 'lock',
        roundNumber: 1,
        code: 'validation_failed',
        error: 'Target type validation failed',
        errors: [
          {
            code: 'target_type',
            message: 'Target type validation failed',
            intentId: 'draft_restore',
          },
        ],
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Target type validation failed/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/validation_failed/i)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(getRoundDraftRejectCodeLabel('validation_failed'), 'i'))).toBeInTheDocument();
      expect(screen.getAllByText(/target_type/i).length).toBeGreaterThan(0);
      expect(screen.getByText(new RegExp(getRoundDraftValidationCodeLabel('target_type'), 'i'))).toBeInTheDocument();
      expect(
        screen.getAllByText(new RegExp(`${getTargetTypeLabel('enemyCharacter')} -> Маг user_2`, 'i')).length,
      ).toBeGreaterThan(0);
    });
  });

  it('shows non-validation roundDraft.rejected code in the shared reject box', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_reject_code', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
        }),
      });
      await flushMicrotasks();
    });

    await act(async () => {
      socket.emitMessage({
        type: 'roundDraft.rejected',
        operation: 'lock',
        roundNumber: 1,
        code: 'join_required',
        error: 'Join session first',
        errors: [],
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/join_required/i).length).toBeGreaterThan(0);
      expect(screen.getByText(new RegExp(getRoundDraftRejectCodeLabel('join_required'), 'i'))).toBeInTheDocument();
      expect(screen.getAllByText(/Join session first/i).length).toBeGreaterThan(0);
    });
  });

  it('shows malformed roundDraft payload reject without rendering round 0', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_reject_invalid_payload', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: createRoundState({
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
        }),
      });
      await flushMicrotasks();
    });

    await act(async () => {
      socket.emitMessage({
        type: 'roundDraft.rejected',
        operation: 'replace',
        roundNumber: 0,
        code: 'invalid_payload',
        error: 'Invalid roundDraft.replace payload',
        errors: [],
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/invalid_payload/i).length).toBeGreaterThan(0);
      expect(screen.getByText(new RegExp(getRoundDraftRejectCodeLabel('invalid_payload'), 'i'))).toBeInTheDocument();
      expect(screen.getAllByText(/Invalid roundDraft\.replace payload/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Сервер отклонил: обновление текущей ленты/i)).toBeInTheDocument();
      expect(screen.queryByText(/раунда 0/i)).not.toBeInTheDocument();
    });
  });

  it('shows structured join.rejected and clears pending session before first state', async () => {
    await renderPage('char_3', 'user_3');

    const socket = await submitJoin('session_full', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'join.rejected',
        sessionId: 'session_full',
        code: 'session_full',
        error: 'Session is full',
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getAllByText('Session is full').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/session_full/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/В матче уже заняты оба PvP-слота/i)).toBeInTheDocument();
      expect(screen.getByText(/Сервер отклонил вход в сессию session_full/i)).toBeInTheDocument();
      expect(screen.getByText(/Активная сессия:/i)).toHaveTextContent('ещё не подключено');
      expect(screen.getByText('Ожидание матча')).toBeInTheDocument();
    });
  });

  it('shows duplicate character join rejection before first state', async () => {
    await renderPage('char_3', 'user_3');

    const socket = await submitJoin('session_duplicate_character', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'join.rejected',
        sessionId: 'session_duplicate_character',
        code: 'duplicate_character',
        error: 'Character is already taken in this session',
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Character is already taken in this session/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Этот персонаж уже занят в матче. Выберите колоду с другим магом/i)).toBeInTheDocument();
      expect(screen.getByText(/Сервер отклонил вход в сессию session_duplicate_character/i)).toBeInTheDocument();
      expect(screen.getByText(/Активная сессия:/i)).toHaveTextContent('ещё не подключено');
    });
  });

  it('shows structured transport.rejected before first state and clears pending session', async () => {
    await renderPage('char_3', 'user_3');

    const socket = await submitJoin('session_transport_reject', /Создать/i);

    await act(async () => {
      socket.emitMessage({
        type: 'transport.rejected',
        code: 'unknown_message_type',
        error: 'Unknown message type',
        requestType: 'action',
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Unknown message type/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/unknown_message_type/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Тип WS-сообщения не поддерживается сервером/i)).toBeInTheDocument();
      expect(screen.getByText(/Сервер отклонил сообщение для action/i)).toBeInTheDocument();
      expect(screen.getByText(/Активная сессия:/i)).toHaveTextContent('ещё не подключено');
      expect(screen.getByText('Ожидание матча')).toBeInTheDocument();
    });
  });
});
