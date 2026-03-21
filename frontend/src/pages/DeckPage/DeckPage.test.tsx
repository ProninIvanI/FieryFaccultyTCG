import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axiosInstance from '@/services/api/axiosInstance';
import { DeckPage } from './DeckPage';

describe('DeckPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads saved decks for authenticated user and allows saving changes', async () => {
    localStorage.setItem(
      'fftcg_session',
      JSON.stringify({
        userId: 'user_1',
        token: 'token_1',
        createdAt: '2026-03-21T12:00:00.000Z',
      }),
    );

    const getSpy = vi.spyOn(axiosInstance, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          decks: [
            {
              id: 'deck_1',
              userId: 'user_1',
              name: 'Aggro Fire',
              characterId: '101',
              createdAt: '2026-03-21T10:00:00.000Z',
              updatedAt: '2026-03-21T10:00:00.000Z',
              cards: [{ cardId: '1', quantity: 2 }],
            },
          ],
        },
      },
    } as Awaited<ReturnType<typeof axiosInstance.get>>);

    const putSpy = vi.spyOn(axiosInstance, 'put').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          deck: {
            id: 'deck_1',
            userId: 'user_1',
            name: 'Aggro Fire Updated',
            characterId: '101',
            createdAt: '2026-03-21T10:00:00.000Z',
            updatedAt: '2026-03-21T11:00:00.000Z',
            cards: [{ cardId: '1', quantity: 2 }],
          },
        },
      },
    } as Awaited<ReturnType<typeof axiosInstance.put>>);

    render(
      <MemoryRouter>
        <DeckPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalled();
    });

    const deckNameInput = await screen.findByLabelText('Название колоды');
    const savedDeckSelect = await screen.findByLabelText('Сохранённые колоды');

    expect(deckNameInput).toHaveValue('Aggro Fire');
    expect(savedDeckSelect).toHaveValue('deck_1');

    fireEvent.change(deckNameInput, {
      target: { value: 'Aggro Fire Updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalled();
    });

    expect(putSpy).toHaveBeenCalledWith('/api/decks/deck_1', {
      name: 'Aggro Fire Updated',
      characterId: '1',
      cards: [{ cardId: '1', quantity: 2 }],
    }, undefined);

    await waitFor(() => {
      expect(screen.getByText('Колода сохранена.')).toBeInTheDocument();
    });
  });
});
