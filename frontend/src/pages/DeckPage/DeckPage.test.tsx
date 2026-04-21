import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axiosInstance from "@/services/api/axiosInstance";
import { DeckPage } from "./DeckPage";

const LEGAL_DECK = [
  { cardId: "1", quantity: 2 },
  { cardId: "2", quantity: 2 },
  { cardId: "3", quantity: 2 },
  { cardId: "4", quantity: 2 },
  { cardId: "5", quantity: 2 },
  { cardId: "6", quantity: 2 },
  { cardId: "7", quantity: 2 },
  { cardId: "8", quantity: 2 },
  { cardId: "9", quantity: 2 },
  { cardId: "10", quantity: 2 },
  { cardId: "41", quantity: 2 },
  { cardId: "42", quantity: 2 },
  { cardId: "61", quantity: 2 },
  { cardId: "62", quantity: 2 },
  { cardId: "81", quantity: 2 },
];

const SORTED_LEGAL_DECK = [...LEGAL_DECK].sort((left, right) =>
  left.cardId.localeCompare(right.cardId, "en"),
);

describe("DeckPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads saved decks for authenticated user and allows saving changes", async () => {
    localStorage.setItem(
      "fftcg_session",
      JSON.stringify({
        userId: "user_1",
        token: "token_1",
        createdAt: "2026-03-21T12:00:00.000Z",
      }),
    );

    const getSpy = vi.spyOn(axiosInstance, "get").mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          decks: [
            {
              id: "deck_1",
              userId: "user_1",
              name: "Aggro Fire",
              characterId: "1",
              createdAt: "2026-03-21T10:00:00.000Z",
              updatedAt: "2026-03-21T10:00:00.000Z",
              cards: LEGAL_DECK,
            },
          ],
        },
      },
    } as Awaited<ReturnType<typeof axiosInstance.get>>);

    const putSpy = vi.spyOn(axiosInstance, "put").mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          deck: {
            id: "deck_1",
            userId: "user_1",
            name: "Aggro Fire Updated",
            characterId: "1",
            createdAt: "2026-03-21T10:00:00.000Z",
            updatedAt: "2026-03-21T11:00:00.000Z",
            cards: LEGAL_DECK,
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

    const deckNameInput = await screen.findByLabelText("Название колоды");
    const savedDeckSelect = await screen.findByLabelText("Сохранённые колоды");

    expect(deckNameInput).toHaveValue("Aggro Fire");
    expect(savedDeckSelect).toHaveValue("deck_1");

    fireEvent.change(deckNameInput, {
      target: { value: "Aggro Fire Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalled();
    });

    expect(putSpy).toHaveBeenCalledWith(
      "/api/decks/deck_1",
      {
        name: "Aggro Fire Updated",
        characterId: "1",
        cards: SORTED_LEGAL_DECK,
      },
      undefined,
    );

    await waitFor(() => {
      expect(screen.getByText("Колода сохранена.")).toBeInTheDocument();
    });
  }, 10000);

  it("keeps add buttons enabled while the draft is still underfilled", () => {
    render(
      <MemoryRouter>
        <DeckPage />
      </MemoryRouter>,
    );

    const addButtons = screen.getAllByRole("button", {
      name: /Добавить .* в колоду/i,
    });

    expect(addButtons.some((button) => !button.hasAttribute("disabled"))).toBe(true);
  });

  it("applies legal preset into local draft", () => {
    render(
      <MemoryRouter>
        <DeckPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Aggro Fire/i }));

    expect(screen.getByLabelText("Название колоды")).toHaveValue("Aggro Fire");
    expect(screen.getByText("Пресет Aggro Fire загружен в черновик.")).toBeInTheDocument();
    expect(screen.getAllByText("30/30").length).toBeGreaterThan(0);
    expect(screen.getByText("Колода готова к сохранению.")).toBeInTheDocument();
  });
});
