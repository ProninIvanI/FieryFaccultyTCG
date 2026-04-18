import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCatalogCardSummaries,
  buildCatalogCharacterSummaries,
  getCatalogCardTypeLabel,
  getCatalogSchoolLabel,
  type CatalogCardSummary,
  type CatalogCardUiType,
  type CatalogCharacterSummary,
  type CatalogSchool,
} from "@game-core/cards/catalog";
import { Card, HomeLinkButton, PageShell } from "@/components";
import rawCardData from "@/data/cardCatalog";
import { authService, deckService } from "@/services";
import { DeckCardItem, UserDeck } from "@/types";
import styles from "./DeckPage.module.css";

type CardType = CatalogCardUiType;
type School = CatalogSchool;

type CardSummary = CatalogCardSummary;

type CharacterSummary = CatalogCharacterSummary;

const CARD_POOL: CardSummary[] = buildCatalogCardSummaries(rawCardData);
const CHARACTERS: CharacterSummary[] = buildCatalogCharacterSummaries(rawCardData);

const DEFAULT_DECK: Record<string, number> = CARD_POOL.slice(0, 4).reduce<
  Record<string, number>
>((acc, card) => {
  acc[card.id] = 1;
  return acc;
}, {});

const SCHOOL_FILTERS: Array<{ id: "all" | School; label: string }> = [
  { id: "all", label: "Все школы" },
  { id: "fire", label: getCatalogSchoolLabel("fire") },
  { id: "water", label: getCatalogSchoolLabel("water") },
  { id: "earth", label: getCatalogSchoolLabel("earth") },
  { id: "air", label: getCatalogSchoolLabel("air") },
];

const TYPE_FILTERS: Array<{ id: "all" | CardType; label: string }> = [
  { id: "all", label: "Все типы" },
  { id: "spell", label: getCatalogCardTypeLabel("spell", "plural") },
  { id: "summon", label: getCatalogCardTypeLabel("summon", "plural") },
  { id: "art", label: getCatalogCardTypeLabel("art", "plural") },
  { id: "modifier", label: getCatalogCardTypeLabel("modifier", "plural") },
];

export const DeckPage = () => {
  const session = authService.getSession();
  const [schoolFilter, setSchoolFilter] = useState<"all" | School>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | CardType>("all");
  const [selectedCharacterId, setSelectedCharacterId] = useState(
    CHARACTERS[0]?.id ?? "",
  );
  const [deckId, setDeckId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState("Новая колода");
  const [deck, setDeck] = useState<Record<string, number>>(DEFAULT_DECK);
  const [savedDecks, setSavedDecks] = useState<UserDeck[]>([]);
  const [isDecksLoading, setIsDecksLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deckRequestError, setDeckRequestError] = useState<string | null>(null);
  const [deckRequestInfo, setDeckRequestInfo] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const carouselSetWidthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStateRef = useRef({
    startX: 0,
    startScrollLeft: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
  });
  const inertiaRef = useRef<number | null>(null);
  const loopRafRef = useRef<number | null>(null);

  const selectedCharacter = useMemo(
    () =>
      CHARACTERS.find((character) => character.id === selectedCharacterId) ??
      CHARACTERS[0],
    [selectedCharacterId],
  );

  const carouselCharacters = useMemo(() => {
    if (CHARACTERS.length === 0) {
      return [];
    }
    return [
      ...CHARACTERS,
      ...CHARACTERS,
      ...CHARACTERS,
      ...CHARACTERS,
      ...CHARACTERS,
    ];
  }, []);

  const normalizeLoop = useCallback(() => {
    const scroller = scrollerRef.current;
    const setWidth = carouselSetWidthRef.current;
    if (!scroller || !setWidth) {
      return;
    }
    if (isDraggingRef.current) {
      return;
    }
    if (scroller.scrollLeft < setWidth) {
      scroller.scrollLeft += setWidth;
      return;
    }
    if (scroller.scrollLeft > setWidth * 3) {
      scroller.scrollLeft -= setWidth;
    }
  }, []);

  const scheduleNormalize = useCallback(() => {
    if (loopRafRef.current !== null) {
      return;
    }
    loopRafRef.current = requestAnimationFrame(() => {
      loopRafRef.current = null;
      normalizeLoop();
    });
  }, [normalizeLoop]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || CHARACTERS.length === 0) {
      return;
    }

    const syncMetrics = () => {
      if (scroller.scrollWidth === 0) {
        return;
      }
      const setWidth = scroller.scrollWidth / 5;
      carouselSetWidthRef.current = setWidth;
      scroller.scrollLeft = setWidth * 2;
    };

    const resizeHandler = () => {
      requestAnimationFrame(syncMetrics);
    };

    requestAnimationFrame(syncMetrics);
    scroller.addEventListener("scroll", scheduleNormalize, { passive: true });
    window.addEventListener("resize", resizeHandler);
    return () => {
      scroller.removeEventListener("scroll", scheduleNormalize);
      window.removeEventListener("resize", resizeHandler);
    };
  }, [scheduleNormalize]);

  const cancelInertia = () => {
    if (inertiaRef.current !== null) {
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = null;
    }
    if (loopRafRef.current !== null) {
      cancelAnimationFrame(loopRafRef.current);
      loopRafRef.current = null;
    }
  };

  const startInertia = () => {
    cancelInertia();
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const step = () => {
      const state = dragStateRef.current;
      state.velocity *= 0.92;
      if (Math.abs(state.velocity) < 0.02) {
        inertiaRef.current = null;
        scheduleNormalize();
        return;
      }
      scroller.scrollLeft -= state.velocity * 16;
      scheduleNormalize();
      inertiaRef.current = requestAnimationFrame(step);
    };
    inertiaRef.current = requestAnimationFrame(step);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    event.preventDefault();
    cancelInertia();
    setIsDragging(true);
    isDraggingRef.current = true;
    const now = performance.now();
    dragStateRef.current = {
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      lastX: event.clientX,
      lastTime: now,
      velocity: 0,
    };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) {
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const state = dragStateRef.current;
    const delta = event.clientX - state.startX;
    scroller.scrollLeft = state.startScrollLeft - delta;
    const now = performance.now();
    const dt = now - state.lastTime;
    if (dt > 0) {
      state.velocity = (event.clientX - state.lastX) / dt;
      state.lastX = event.clientX;
      state.lastTime = now;
    }
  };

  const stopDragging = () => {
    if (isDragging) {
      setIsDragging(false);
      isDraggingRef.current = false;
      startInertia();
    }
  };

  const filteredCards = useMemo(() => {
    return CARD_POOL.filter((card) => {
      const matchesSchool =
        schoolFilter === "all" ? true : card.school === schoolFilter;
      const matchesType =
        typeFilter === "all" ? true : card.type === typeFilter;
      return matchesSchool && matchesType;
    });
  }, [schoolFilter, typeFilter]);

  const deckCards = useMemo(() => {
    return CARD_POOL.filter((card) => deck[card.id]);
  }, [deck]);

  const totalCards = deckCards.reduce(
    (total, card) => total + (deck[card.id] ?? 0),
    0,
  );
  const averageMana = totalCards
    ? deckCards.reduce(
        (sum, card) => sum + card.mana * (deck[card.id] ?? 0),
        0,
      ) / totalCards
    : 0;
  const saveDeckLabel = isSaving
    ? "Сохраняем..."
    : deckId
      ? "Сохранить изменения"
      : "Сохранить колоду";
  const createDeckCopyLabel = "Сохранить как новую";
  const createDraftLabel = "Новый черновик";
  const deleteDeckLabel = deckId ? "Удалить колоду" : "Сбросить";

  const countsByType = deckCards.reduce<Record<CardType, number>>(
    (acc, card) => {
      acc[card.type] += deck[card.id] ?? 0;
      return acc;
    },
    { spell: 0, summon: 0, art: 0, modifier: 0 },
  );

  const serializedDeckCards = useMemo<DeckCardItem[]>(
    () =>
      Object.entries(deck)
        .filter(([, quantity]) => quantity > 0)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([cardId, quantity]) => ({ cardId, quantity })),
    [deck],
  );

  const applySavedDeck = useCallback((savedDeck: UserDeck) => {
    setDeckId(savedDeck.id);
    setDeckName(savedDeck.name);
    setSelectedCharacterId(savedDeck.characterId ?? CHARACTERS[0]?.id ?? "");
    setDeck(
      savedDeck.cards.reduce<Record<string, number>>((acc, card) => {
        acc[card.cardId] = card.quantity;
        return acc;
      }, {}),
    );
  }, []);

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    let cancelled = false;
    setIsDecksLoading(true);
    setDeckRequestError(null);

    void deckService.list().then((result) => {
      if (cancelled) {
        return;
      }

      setIsDecksLoading(false);
      if (!result.ok) {
        setDeckRequestError(result.error);
        return;
      }

      setSavedDecks(result.decks);
      if (result.decks[0]) {
        applySavedDeck(result.decks[0]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [applySavedDeck, session?.token]);

  const updateDeck = (cardId: string, delta: number) => {
    setDeck((prev) => {
      const nextCount = Math.max((prev[cardId] ?? 0) + delta, 0);
      const next = { ...prev };
      if (nextCount === 0) {
        delete next[cardId];
      } else {
        next[cardId] = nextCount;
      }
      return next;
    });
  };

  const handleCreateDraft = () => {
    setDeckId(null);
    setDeckName("Новая колода");
    setSelectedCharacterId(CHARACTERS[0]?.id ?? "");
    setDeck(DEFAULT_DECK);
    setDeckRequestError(null);
    setDeckRequestInfo("Создан локальный черновик. Сохраните его в backend.");
  };

  const handleDeckSelection = (nextDeckId: string) => {
    if (!nextDeckId) {
      handleCreateDraft();
      return;
    }

    const savedDeck = savedDecks.find((item) => item.id === nextDeckId);
    if (!savedDeck) {
      return;
    }

    setDeckRequestError(null);
    setDeckRequestInfo(null);
    applySavedDeck(savedDeck);
  };

  const handleSaveDeck = async (mode: "default" | "create-new" = "default") => {
    if (!session?.token) {
      setDeckRequestError("Для сохранения колод нужно войти в аккаунт.");
      return;
    }

    if (!selectedCharacter?.id) {
      setDeckRequestError("Для сохранения колоды нужно выбрать персонажа.");
      return;
    }

    setIsSaving(true);
    setDeckRequestError(null);
    setDeckRequestInfo(null);

    const payload = {
      name: deckName.trim() || "Новая колода",
      characterId: selectedCharacter.id,
      cards: serializedDeckCards,
    };

    const shouldCreateNew = mode === "create-new";
    const result = !shouldCreateNew && deckId
      ? await deckService.update(deckId, payload)
      : await deckService.create(payload);

    setIsSaving(false);
    if (!result.ok) {
      setDeckRequestError(result.error);
      return;
    }

    setDeckId(result.deck.id);
    setDeckName(result.deck.name);
    setSavedDecks((prev) => {
      const rest = prev.filter((item) => item.id !== result.deck.id);
      return [result.deck, ...rest];
    });
    setDeckRequestInfo(
      shouldCreateNew || !deckId
        ? "Колода создана и сохранена."
        : "Колода сохранена.",
    );
  };

  const handleDeleteDeck = async () => {
    if (!deckId) {
      handleCreateDraft();
      return;
    }

    setIsSaving(true);
    setDeckRequestError(null);
    setDeckRequestInfo(null);

    const result = await deckService.remove(deckId);
    setIsSaving(false);
    if (!result.ok) {
      setDeckRequestError(result.error);
      return;
    }

    const nextDecks = savedDecks.filter((item) => item.id !== deckId);
    setSavedDecks(nextDecks);
    if (nextDecks[0]) {
      applySavedDeck(nextDecks[0]);
      setDeckRequestInfo("Колода удалена. Открыта следующая сохранённая колода.");
      return;
    }

    handleCreateDraft();
    setDeckRequestInfo("Колода удалена.");
  };

  return (
    <PageShell
      title="Мастерская колод"
      subtitle="Соберите колоду и выберите героя для следующей дуэли."
      actions={<HomeLinkButton />}
    >
      <div className={styles.layout}>
        <section className={styles.leftColumn}>
          <Card title="Выбор персонажа">
            <div className={styles.characterScrollerWrap}>
              <div
                className={
                  isDragging
                    ? styles.characterScrollerDragging
                    : styles.characterScroller
                }
                aria-label="Список персонажей"
                ref={scrollerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={stopDragging}
                onMouseLeave={stopDragging}
              >
                {carouselCharacters.map((character, index) => {
                  const original = CHARACTERS[index % CHARACTERS.length];
                  const isActive = original.id === selectedCharacterId;
                  return (
                    <button
                      key={`${character.id}-${index}`}
                      className={
                        isActive
                          ? styles.characterCardActive
                          : styles.characterCard
                      }
                      type="button"
                      aria-pressed={isActive}
                      data-carousel-item="true"
                      onClick={() => setSelectedCharacterId(original.id)}
                    >
                      <div className={styles.characterVisual}>
                        <div className={styles.characterAvatar}>
                          Иллюстрация
                        </div>
                        <div className={styles.characterTag}>
                          {getCatalogSchoolLabel(original.faculty)}
                        </div>
                      </div>
                      <div className={styles.characterName}>
                        {original.name}
                      </div>
                      <div className={styles.characterMeta}>
                        HP {original.hp} · Mana {original.mana}
                      </div>
                      <div className={styles.characterStats}>
                        Сила {original.strength} · Ловкость {original.agility} ·
                        Фокус {original.focus}
                      </div>
                      <div className={styles.characterAbility}>
                        {original.ability}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedCharacter && (
              <div className={styles.characterDetail}>
                <div className={styles.detailTitle}>Пассивка</div>
                <p className={styles.detailText}>{selectedCharacter.ability}</p>
                <div className={styles.detailRow}>
                  <span>Сила</span>
                  <span>{selectedCharacter.strength}</span>
                </div>
                <div className={styles.detailRow}>
                  <span>Ловкость</span>
                  <span>{selectedCharacter.agility}</span>
                </div>
              </div>
            )}
          </Card>

          <Card title="Пул карт">
            <div className={styles.filterBlock}>
              <div className={styles.filterLabel}>Фильтр по школе</div>
              <div className={styles.filterRow}>
                {SCHOOL_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    className={
                      filter.id === schoolFilter
                        ? styles.filterActive
                        : styles.filterButton
                    }
                    type="button"
                    onClick={() => setSchoolFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.filterBlock}>
              <div className={styles.filterLabel}>Фильтр по типу</div>
              <div className={styles.filterRow}>
                {TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    className={
                      filter.id === typeFilter
                        ? styles.filterActive
                        : styles.filterButton
                    }
                    type="button"
                    onClick={() => setTypeFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.cardList}>
              {filteredCards.map((card) => (
                <div key={card.id} className={styles.cardRow}>
                  <div className={styles.cardRowBody}>
                    <div className={styles.cardHeaderRow}>
                      <div className={styles.cardName}>{card.name}</div>
                      <div className={styles.cardActionCluster}>
                        <span className={styles.cardMana}>{card.mana} mana</span>
                        <button
                          className={styles.smallButton}
                          type="button"
                          onClick={() => updateDeck(card.id, 1)}
                          aria-label={`Добавить ${card.name} в колоду`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardMeta}>
                      {getCatalogCardTypeLabel(card.type)}
                      {card.school ? ` · ${getCatalogSchoolLabel(card.school)}` : ""}
                      {card.speed ? ` · speed ${card.speed}` : ""}
                    </div>
                    {card.type === "summon" && (card.hp || card.attack) ? (
                      <div className={styles.cardStats}>
                        {card.hp ? `HP ${card.hp}` : ""}
                        {card.hp && card.attack ? " · " : ""}
                        {card.attack ? `ATK ${card.attack}` : ""}
                      </div>
                    ) : null}
                    {card.effect ? (
                      <div className={styles.cardEffect}>{card.effect}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className={styles.rightColumn}>
          <div className={styles.stickyStack}>
            <Card
              title="Конструктор колоды"
              className={styles.deckWorkspaceCard}
              contentClassName={styles.deckWorkspaceCardContent}
            >
              <div className={styles.deckManager}>
                <div className={styles.deckManagerHeader}>
                  <div>
                    <div className={styles.deckManagerTitle}>
                      {deckId ? "Редактирование сохранённой колоды" : "Новый черновик"}
                    </div>
                    <p className={styles.deckManagerSubtitle}>
                      Выберите сохранённую колоду или соберите новую и сохраните её здесь же.
                    </p>
                  </div>
                  <div className={styles.deckBadge}>
                    {deckId ? "Сохранена" : "Черновик"}
                  </div>
                </div>

                <div className={styles.deckManagerGrid}>
                  <div>
                    <label className={styles.filterLabel} htmlFor="saved-deck">
                      Сохранённые колоды
                    </label>
                    <select
                      id="saved-deck"
                      className={styles.deckSelect}
                      value={deckId ?? ""}
                      disabled={isDecksLoading || savedDecks.length === 0}
                      onChange={(event) => handleDeckSelection(event.target.value)}
                    >
                      <option value="">Черновик</option>
                      {savedDecks.map((savedDeck) => (
                        <option key={savedDeck.id} value={savedDeck.id}>
                          {savedDeck.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={styles.filterLabel} htmlFor="deck-name">
                      Название колоды
                    </label>
                    <input
                      id="deck-name"
                      className={styles.deckNameInput}
                      type="text"
                      value={deckName}
                      maxLength={128}
                      onChange={(event) => setDeckName(event.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.deckManagerActions}>
                  <button
                    className={`${styles.deckActionButton} ${styles.deckActionPrimary}`.trim()}
                    type="button"
                    onClick={() => void handleSaveDeck()}
                    disabled={isSaving || !session?.token}
                    aria-label={saveDeckLabel}
                    title={saveDeckLabel}
                  >
                    <span aria-hidden="true" className={styles.deckActionIcon}>⟳</span>
                  </button>
                  <button
                    className={styles.deckActionButton}
                    type="button"
                    onClick={() => void handleSaveDeck("create-new")}
                    disabled={isSaving || !session?.token}
                    aria-label={createDeckCopyLabel}
                    title={createDeckCopyLabel}
                  >
                    <span aria-hidden="true" className={styles.deckActionIcon}>⧉</span>
                  </button>
                  <button
                    className={styles.deckActionButton}
                    type="button"
                    onClick={handleCreateDraft}
                    disabled={isSaving}
                    aria-label={createDraftLabel}
                    title={createDraftLabel}
                  >
                    <span aria-hidden="true" className={styles.deckActionIcon}>+</span>
                  </button>
                  <button
                    className={`${styles.deckActionButton} ${styles.deckActionDanger}`.trim()}
                    type="button"
                    onClick={handleDeleteDeck}
                    disabled={isSaving}
                    aria-label={deleteDeckLabel}
                    title={deleteDeckLabel}
                  >
                    <span aria-hidden="true" className={styles.deckActionIcon}>×</span>
                  </button>
                </div>

                {!session?.token ? (
                  <p className={styles.presetHint}>
                    Войдите в аккаунт, чтобы загружать и сохранять колоды в backend.
                  </p>
                ) : null}
                {isDecksLoading ? (
                  <p className={styles.presetHint}>Загружаем ваши колоды...</p>
                ) : null}
                {deckRequestError ? (
                  <p className={styles.deckStatusError}>{deckRequestError}</p>
                ) : null}
                {deckRequestInfo ? (
                  <p className={styles.deckStatusInfo}>{deckRequestInfo}</p>
                ) : null}
              </div>
              <div className={styles.deckWorkspaceBody}>
                <div className={styles.deckSummary}>
                  <div>
                    <div className={styles.summaryValue}>{totalCards}</div>
                    <div className={styles.summaryLabel}>карт всего</div>
                  </div>
                  <div>
                    <div className={styles.summaryValue}>
                      {averageMana.toFixed(1)}
                    </div>
                    <div className={styles.summaryLabel}>ср. мана</div>
                  </div>
                  <div>
                    <div className={styles.summaryValue}>
                      {countsByType.spell}
                    </div>
                    <div className={styles.summaryLabel}>заклинания</div>
                  </div>
                </div>
                <div className={styles.deckList}>
                  {deckCards.length === 0 ? (
                    <div className={styles.emptyState}>
                      Добавьте карты из пула слева
                    </div>
                  ) : (
                    deckCards.map((card) => (
                      <div key={card.id} className={styles.deckRow}>
                        <div className={styles.deckRowInfo}>
                          <div className={styles.deckRowHeader}>
                            <div className={styles.deckRowName}>{card.name}</div>
                            <span className={styles.deckRowMana}>{card.mana} mana</span>
                          </div>
                          <div className={styles.deckRowMeta}>
                            {getCatalogCardTypeLabel(card.type)}
                            {card.school ? ` · ${getCatalogSchoolLabel(card.school)}` : ""}
                          </div>
                        </div>
                        <div className={styles.deckControls}>
                          <button
                            className={styles.smallButton}
                            type="button"
                            onClick={() => updateDeck(card.id, -1)}
                          >
                            -
                          </button>
                          <span className={`${styles.deckCount} ${styles.deckCountBadge}`.trim()}>
                            {deck[card.id]}
                          </span>
                          <button
                            className={styles.smallButton}
                            type="button"
                            onClick={() => updateDeck(card.id, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>

            <Card title="Пресеты для тестов" className={styles.presetWorkspaceCard}>
              <div className={styles.presetGrid}>
                <button className={styles.presetButton} type="button">
                  Aggro Fire
                </button>
                <button className={styles.presetButton} type="button">
                  Control Water
                </button>
                <button className={styles.presetButton} type="button">
                  Earth Shield
                </button>
                <button className={styles.presetButton} type="button">
                  Air Tempo
                </button>
              </div>
              <p className={styles.presetHint}>
                Пресеты пока статичны. Здесь будут кнопки загрузки тестовых
                наборов.
              </p>
            </Card>
          </div>
        </section>
      </div>
    </PageShell>
  );
};

