import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, HomeLinkButton, PageShell } from "@/components";
import rawCardData from "@/data/cards.json";
import { authService, deckService } from "@/services";
import { DeckCardItem, UserDeck } from "@/types";
import styles from "./DeckPage.module.css";

type CardType = "spell" | "summon" | "art" | "modifier";
type School = "fire" | "water" | "earth" | "air";

type CardSummary = {
  id: string;
  name: string;
  type: CardType;
  school?: School;
  mana: number;
  speed?: number;
  effect?: string;
  hp?: number;
  attack?: number;
};

type CharacterSummary = {
  id: string;
  name: string;
  faculty: School;
  hp: number;
  mana: number;
  focus: number;
  strength: number;
  agility: number;
  ability: string;
};

type RawCard = {
  id: number;
  name: string;
  type: string;
  school?: string;
  mana?: number;
  speed?: number;
  effect?: string;
  hp?: number;
  attack?: number;
};

type RawCharacter = {
  id: number;
  name: string;
  faculty: string;
  hp: number;
  mana: number;
  focus: number;
  strength: number;
  agility: number;
  ability: string;
};

type RawCardData = {
  cards: RawCard[];
  characters: RawCharacter[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isRawCard = (value: unknown): value is RawCard => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNumber(value.id) &&
    isString(value.name) &&
    isString(value.type) &&
    (value.school === undefined || isString(value.school)) &&
    (value.mana === undefined || isNumber(value.mana)) &&
    (value.speed === undefined || isNumber(value.speed)) &&
    (value.effect === undefined || isString(value.effect)) &&
    (value.hp === undefined || isNumber(value.hp)) &&
    (value.attack === undefined || isNumber(value.attack))
  );
};

const isRawCharacter = (value: unknown): value is RawCharacter => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNumber(value.id) &&
    isString(value.name) &&
    isString(value.faculty) &&
    isNumber(value.hp) &&
    isNumber(value.mana) &&
    isNumber(value.focus) &&
    isNumber(value.strength) &&
    isNumber(value.agility) &&
    isString(value.ability)
  );
};

const isRawCardData = (value: unknown): value is RawCardData => {
  if (!isRecord(value)) {
    return false;
  }
  const { cards, characters } = value;
  return (
    Array.isArray(cards) &&
    cards.every(isRawCard) &&
    Array.isArray(characters) &&
    characters.every(isRawCharacter)
  );
};

const toSchool = (value?: string): School | undefined => {
  switch (value) {
    case "fire":
    case "water":
    case "earth":
    case "air":
      return value;
    default:
      return undefined;
  }
};

const toCardType = (value: string): CardType | null => {
  switch (value) {
    case "spell":
    case "summon":
    case "art":
    case "modifier":
      return value;
    default:
      return null;
  }
};

const normalizeText = (value: string): string => value.replace(/\u2212/g, "-");

const parsedCardData = isRawCardData(rawCardData) ? rawCardData : null;

const buildCardPool = (): CardSummary[] => {
  const result: CardSummary[] = [];
  for (const card of parsedCardData?.cards ?? []) {
    const type = toCardType(card.type);
    if (!type) {
      continue;
    }
    const school = toSchool(card.school);
    result.push({
      id: String(card.id),
      name: normalizeText(card.name),
      type,
      mana: card.mana ?? 0,
      speed: card.speed,
      effect: card.effect ? normalizeText(card.effect) : undefined,
      hp: card.hp,
      attack: card.attack,
      ...(school ? { school } : {}),
    });
  }
  return result;
};

const buildCharacters = (): CharacterSummary[] => {
  const result: CharacterSummary[] = [];
  for (const character of parsedCardData?.characters ?? []) {
    const faculty = toSchool(character.faculty);
    if (!faculty) {
      continue;
    }
    result.push({
      id: String(character.id),
      name: normalizeText(character.name),
      faculty,
      hp: character.hp,
      mana: character.mana,
      focus: character.focus,
      strength: character.strength,
      agility: character.agility,
      ability: normalizeText(character.ability),
    });
  }
  return result;
};

const CARD_POOL = buildCardPool();
const CHARACTERS = buildCharacters();

const DEFAULT_DECK: Record<string, number> = CARD_POOL.slice(0, 4).reduce<
  Record<string, number>
>((acc, card) => {
  acc[card.id] = 1;
  return acc;
}, {});

const SCHOOL_FILTERS: Array<{ id: "all" | School; label: string }> = [
  { id: "all", label: "Все школы" },
  { id: "fire", label: "Огонь" },
  { id: "water", label: "Вода" },
  { id: "earth", label: "Земля" },
  { id: "air", label: "Воздух" },
];

const TYPE_FILTERS: Array<{ id: "all" | CardType; label: string }> = [
  { id: "all", label: "Все типы" },
  { id: "spell", label: "Заклинания" },
  { id: "summon", label: "Призывы" },
  { id: "art", label: "Техники" },
  { id: "modifier", label: "Модификаторы" },
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
    const savedDeck = savedDecks.find((item) => item.id === nextDeckId);
    if (!savedDeck) {
      return;
    }

    setDeckRequestError(null);
    setDeckRequestInfo(null);
    applySavedDeck(savedDeck);
  };

  const handleSaveDeck = async () => {
    if (!session?.token) {
      setDeckRequestError("Для сохранения колод нужно войти в аккаунт.");
      return;
    }

    setIsSaving(true);
    setDeckRequestError(null);
    setDeckRequestInfo(null);

    const payload = {
      name: deckName.trim() || "Новая колода",
      characterId: selectedCharacter?.id ?? null,
      cards: serializedDeckCards,
    };

    const result = deckId
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
    setDeckRequestInfo(deckId ? "Колода сохранена." : "Колода создана и сохранена.");
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
      title="Колоды и персонажи"
      subtitle="Сбор колоды, выбор персонажа и быстрые пресеты для тестов."
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
                          {original.faculty}
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
                  <div>
                    <div className={styles.cardName}>{card.name}</div>
                    <div className={styles.cardMeta}>
                      {card.type}
                      {card.school ? ` · ${card.school}` : ""}
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
                  <div className={styles.cardControls}>
                    <span className={styles.cardMana}>{card.mana} mana</span>
                    <button
                      className={styles.smallButton}
                      type="button"
                      onClick={() => updateDeck(card.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className={styles.rightColumn}>
          <div className={styles.stickyStack}>
            <Card title="Конструктор колоды">
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
                    className={styles.presetButton}
                    type="button"
                    onClick={handleSaveDeck}
                    disabled={isSaving || !session?.token}
                  >
                    {isSaving ? "Сохраняем..." : deckId ? "Сохранить изменения" : "Сохранить колоду"}
                  </button>
                  <button
                    className={styles.presetButton}
                    type="button"
                    onClick={handleCreateDraft}
                    disabled={isSaving}
                  >
                    Новый черновик
                  </button>
                  <button
                    className={styles.presetButton}
                    type="button"
                    onClick={handleDeleteDeck}
                    disabled={isSaving}
                  >
                    {deckId ? "Удалить колоду" : "Сбросить"}
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
                      <div>
                        <div className={styles.cardName}>{card.name}</div>
                        <div className={styles.cardMeta}>
                          {card.type} · {card.mana} mana
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
                        <span className={styles.deckCount}>
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
            </Card>

            <Card title="Пресеты для тестов">
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

