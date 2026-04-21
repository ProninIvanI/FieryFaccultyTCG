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
import { DECK_RULES_V1 } from "@game-core/decks/rules";
import { validateDeckLegality } from "@game-core/decks/validateDeckLegality";
import { Card, HomeLinkButton, PageShell } from "@/components";
import rawCardData from "@/data/cardCatalog";
import { authService, deckService } from "@/services";
import { DeckCardItem, UserDeck } from "@/types";
import styles from "./DeckPage.module.css";

type CardType = CatalogCardUiType;
type School = CatalogSchool;

type CardSummary = CatalogCardSummary;

type CharacterSummary = CatalogCharacterSummary;

type DeckPreset = {
  id: string;
  name: string;
  blurb: string;
  characterId: string;
  cards: DeckCardItem[];
};

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

const DECK_PRESETS: DeckPreset[] = [
  {
    id: "aggro-fire",
    name: "Aggro Fire",
    blurb: "Быстрый урон и темп через огненные спеллы и баффы.",
    characterId: "1",
    cards: [
      { cardId: "1", quantity: 2 },
      { cardId: "2", quantity: 2 },
      { cardId: "3", quantity: 2 },
      { cardId: "4", quantity: 2 },
      { cardId: "5", quantity: 2 },
      { cardId: "6", quantity: 2 },
      { cardId: "8", quantity: 2 },
      { cardId: "9", quantity: 2 },
      { cardId: "41", quantity: 2 },
      { cardId: "43", quantity: 2 },
      { cardId: "46", quantity: 2 },
      { cardId: "53", quantity: 2 },
      { cardId: "61", quantity: 2 },
      { cardId: "69", quantity: 2 },
      { cardId: "85", quantity: 2 },
    ],
  },
  {
    id: "control-water",
    name: "Control Water",
    blurb: "Замедление, щиты и затяжной розыгрыш через контроль стола.",
    characterId: "7",
    cards: [
      { cardId: "11", quantity: 2 },
      { cardId: "12", quantity: 2 },
      { cardId: "13", quantity: 2 },
      { cardId: "14", quantity: 2 },
      { cardId: "16", quantity: 2 },
      { cardId: "17", quantity: 2 },
      { cardId: "18", quantity: 2 },
      { cardId: "19", quantity: 2 },
      { cardId: "20", quantity: 2 },
      { cardId: "41", quantity: 2 },
      { cardId: "42", quantity: 2 },
      { cardId: "45", quantity: 2 },
      { cardId: "61", quantity: 2 },
      { cardId: "67", quantity: 2 },
      { cardId: "87", quantity: 2 },
    ],
  },
  {
    id: "earth-shield",
    name: "Earth Shield",
    blurb: "Плотная защита, дебаффы и тяжёлые добивающие ходы.",
    characterId: "13",
    cards: [
      { cardId: "21", quantity: 2 },
      { cardId: "22", quantity: 2 },
      { cardId: "23", quantity: 2 },
      { cardId: "25", quantity: 2 },
      { cardId: "26", quantity: 2 },
      { cardId: "27", quantity: 2 },
      { cardId: "29", quantity: 2 },
      { cardId: "30", quantity: 2 },
      { cardId: "42", quantity: 2 },
      { cardId: "49", quantity: 2 },
      { cardId: "55", quantity: 2 },
      { cardId: "61", quantity: 2 },
      { cardId: "67", quantity: 2 },
      { cardId: "72", quantity: 2 },
      { cardId: "91", quantity: 2 },
    ],
  },
  {
    id: "air-tempo",
    name: "Air Tempo",
    blurb: "Скорость, прерывания и давление через темповый размен.",
    characterId: "20",
    cards: [
      { cardId: "31", quantity: 2 },
      { cardId: "32", quantity: 2 },
      { cardId: "33", quantity: 2 },
      { cardId: "34", quantity: 2 },
      { cardId: "35", quantity: 2 },
      { cardId: "36", quantity: 2 },
      { cardId: "37", quantity: 2 },
      { cardId: "39", quantity: 2 },
      { cardId: "40", quantity: 2 },
      { cardId: "42", quantity: 2 },
      { cardId: "47", quantity: 2 },
      { cardId: "56", quantity: 2 },
      { cardId: "61", quantity: 2 },
      { cardId: "68", quantity: 2 },
      { cardId: "97", quantity: 2 },
    ],
  },
  {
    id: "summon-lab",
    name: "Summon Lab",
    blurb: "Много призывов для теста выбора существ, размена и заполнения стола.",
    characterId: "16",
    cards: [
      { cardId: "41", quantity: 2 },
      { cardId: "42", quantity: 2 },
      { cardId: "49", quantity: 2 },
      { cardId: "61", quantity: 2 },
      { cardId: "63", quantity: 2 },
      { cardId: "69", quantity: 2 },
      { cardId: "74", quantity: 2 },
      { cardId: "81", quantity: 2 },
      { cardId: "82", quantity: 2 },
      { cardId: "84", quantity: 2 },
      { cardId: "85", quantity: 2 },
      { cardId: "86", quantity: 2 },
      { cardId: "88", quantity: 2 },
      { cardId: "91", quantity: 2 },
      { cardId: "95", quantity: 2 },
    ],
  },
  {
    id: "target-lab",
    name: "Target Lab",
    blurb: "Проверка таргетов по себе, врагу и существам в одной тестовой колоде.",
    characterId: "24",
    cards: [
      { cardId: "1", quantity: 2 },
      { cardId: "6", quantity: 2 },
      { cardId: "7", quantity: 2 },
      { cardId: "9", quantity: 2 },
      { cardId: "11", quantity: 2 },
      { cardId: "13", quantity: 2 },
      { cardId: "14", quantity: 2 },
      { cardId: "19", quantity: 2 },
      { cardId: "23", quantity: 2 },
      { cardId: "30", quantity: 2 },
      { cardId: "32", quantity: 2 },
      { cardId: "34", quantity: 2 },
      { cardId: "37", quantity: 2 },
      { cardId: "40", quantity: 2 },
      { cardId: "55", quantity: 2 },
    ],
  },
  {
    id: "modifier-lab",
    name: "Modifier Lab",
    blurb: "Тест модификаторов, артов и цепочек усилений на одном пресете.",
    characterId: "4",
    cards: [
      { cardId: "1", quantity: 2 },
      { cardId: "11", quantity: 2 },
      { cardId: "21", quantity: 2 },
      { cardId: "31", quantity: 2 },
      { cardId: "41", quantity: 2 },
      { cardId: "42", quantity: 2 },
      { cardId: "43", quantity: 2 },
      { cardId: "45", quantity: 2 },
      { cardId: "46", quantity: 2 },
      { cardId: "47", quantity: 2 },
      { cardId: "48", quantity: 2 },
      { cardId: "49", quantity: 2 },
      { cardId: "50", quantity: 2 },
      { cardId: "51", quantity: 2 },
      { cardId: "61", quantity: 2 },
    ],
  },
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
  const [isSavedDeckMenuOpen, setIsSavedDeckMenuOpen] = useState(false);
  const [isDecksLoading, setIsDecksLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deckRequestError, setDeckRequestError] = useState<string | null>(null);
  const [deckRequestInfo, setDeckRequestInfo] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const savedDeckMenuRef = useRef<HTMLDivElement | null>(null);
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

  const selectedSavedDeckLabel = useMemo(() => {
    if (!deckId) {
      return "Черновик";
    }

    return savedDecks.find((savedDeck) => savedDeck.id === deckId)?.name ?? "Черновик";
  }, [deckId, savedDecks]);

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

  const deckValidation = useMemo(
    () =>
      validateDeckLegality(rawCardData, {
        characterId: selectedCharacter?.id ?? "",
        cards: serializedDeckCards,
      }),
    [selectedCharacter?.id, serializedDeckCards],
  );

  const issueCodes = useMemo(
    () => new Set(deckValidation.issues.map((issue) => issue.code)),
    [deckValidation.issues],
  );

  const deckRulePills = useMemo(
    () => [
      {
        id: "deck-size",
        tone: issueCodes.has("deck_size_invalid") ? "warning" : "ok",
        label: "Карты",
        value: `${deckValidation.summary.totalCards}/${DECK_RULES_V1.deckSize}`,
        title:
          deckValidation.summary.totalCards === DECK_RULES_V1.deckSize
            ? "Размер колоды готов к сохранению."
            : `Нужно собрать ровно ${DECK_RULES_V1.deckSize} карт.`,
      },
      {
        id: "copies",
        tone: issueCodes.has("deck_card_copies_exceeded") ? "warning" : "ok",
        label: "Копии",
        value: `до ${DECK_RULES_V1.maxCopiesPerCard}`,
        title: issueCodes.has("deck_card_copies_exceeded")
          ? "У одной из карт слишком много копий. Уменьшите количество до лимита."
          : "Лимит копий соблюдён.",
      },
      {
        id: "art-limit",
        tone: issueCodes.has("deck_art_limit_exceeded") ? "warning" : "ok",
        label: "Art",
        value: `${deckValidation.summary.artCards}/${DECK_RULES_V1.maxArtCards}`,
        title: issueCodes.has("deck_art_limit_exceeded")
          ? `Art-карт слишком много. Оставьте не больше ${DECK_RULES_V1.maxArtCards}.`
          : "Лимит art-карт соблюдён.",
      },
      {
        id: "modifier-limit",
        tone: issueCodes.has("deck_modifier_limit_exceeded") ? "warning" : "ok",
        label: "Modifier",
        value: `${deckValidation.summary.modifierCards}/${DECK_RULES_V1.maxModifierCards}`,
        title: issueCodes.has("deck_modifier_limit_exceeded")
          ? `Modifier-карт слишком много. Оставьте не больше ${DECK_RULES_V1.maxModifierCards}.`
          : "Лимит modifier-карт соблюдён.",
      },
      {
        id: "school-rule",
        tone: "info" as const,
        label: "Школы",
        value: "свободно",
        title:
          "Сейчас маг может собирать колоду из любых школ. Позже можно добавить бонусы за родную школу вместо жёсткого запрета.",
      },
    ],
    [deckValidation.summary.artCards, deckValidation.summary.modifierCards, deckValidation.summary.totalCards, issueCodes],
  );

  const deckRulesTooltip = useMemo(
    () =>
      deckRulePills
        .map((rule) => {
          const mark = rule.tone === "warning" ? "!" : "OK";
          return `${mark} ${rule.label}: ${rule.value}. ${rule.title}`;
        })
        .join("\n"),
    [deckRulePills],
  );

  const getDeckStatusTooltip = useCallback(() => {
    if (deckValidation.ok) {
      return deckId
        ? "Колода легальна. Можно сохранять изменения."
        : "Колода легальна. Можно сохранить её в backend.";
    }

    return deckRulesTooltip;
  }, [deckId, deckRulesTooltip, deckValidation.ok]);

  const getAddCardAvailability = useCallback(
    (cardId: string) => {
      const currentQuantity = deck[cardId] ?? 0;
      if (currentQuantity >= DECK_RULES_V1.maxCopiesPerCard) {
        return {
          allowed: false,
          title: `У карты уже максимум ${DECK_RULES_V1.maxCopiesPerCard} копии.`,
        };
      }

      if (deckValidation.summary.totalCards >= DECK_RULES_V1.deckSize) {
        return {
          allowed: false,
          title: `Колода уже заполнена. Лимит: ${DECK_RULES_V1.deckSize} карт.`,
        };
      }

      const nextCards = serializedDeckCards.some((card) => card.cardId === cardId)
        ? serializedDeckCards.map((card) =>
            card.cardId === cardId
              ? { ...card, quantity: card.quantity + 1 }
              : card,
          )
        : [...serializedDeckCards, { cardId, quantity: 1 }];

      const nextValidation = validateDeckLegality(rawCardData, {
        characterId: selectedCharacter?.id ?? "",
        cards: nextCards,
      });

      const blockingIssue = nextValidation.issues.find(
        (issue) => issue.code !== "deck_size_invalid",
      );
      if (blockingIssue) {
        return {
          allowed: false,
          title: blockingIssue.message,
        };
      }

      return {
        allowed: true,
        title: `Добавить ${CARD_POOL.find((card) => card.id === cardId)?.name ?? "карту"} в колоду`,
      };
    },
    [deck, deckValidation.summary.totalCards, selectedCharacter?.id, serializedDeckCards],
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

  useEffect(() => {
    if (!isSavedDeckMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!savedDeckMenuRef.current?.contains(event.target as Node)) {
        setIsSavedDeckMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSavedDeckMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isSavedDeckMenuOpen]);

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
    setIsSavedDeckMenuOpen(false);

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

  const applyPresetDeck = (preset: DeckPreset) => {
    setDeckId(null);
    setDeckName(preset.name);
    setSelectedCharacterId(preset.characterId);
    setDeck(
      preset.cards.reduce<Record<string, number>>((acc, card) => {
        acc[card.cardId] = card.quantity;
        return acc;
      }, {}),
    );
    setDeckRequestError(null);
    setDeckRequestInfo(`Пресет ${preset.name} загружен в черновик.`);
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

    if (!deckValidation.ok) {
      setDeckRequestError(deckValidation.issues[0]?.message ?? "Колода не прошла проверку.");
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

  const deckStatusTooltip = getDeckStatusTooltip();
  const saveDisabled = isSaving || !session?.token || !deckValidation.ok;
  const saveDisabledTitle = !session?.token
    ? "Войдите в аккаунт, чтобы сохранять колоды."
    : deckStatusTooltip;

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
              {filteredCards.map((card) => {
                const quantity = deck[card.id] ?? 0;
                const addCardState = getAddCardAvailability(card.id);
                return (
                  <div key={card.id} className={styles.poolCard}>
                    <div className={styles.poolCardHeader}>
                      <div className={styles.poolCardIdentity}>
                        <div className={styles.poolCardName}>{card.name}</div>
                        <div className={styles.poolCardMana}>{card.mana} mana</div>
                      </div>
                      <div className={styles.poolCardControls}>
                        <button
                          className={styles.smallButton}
                          type="button"
                          onClick={() => updateDeck(card.id, -1)}
                          disabled={quantity === 0}
                          aria-label={`Убрать ${card.name} из колоды`}
                          title={`Убрать ${card.name} из колоды`}
                        >
                          -
                        </button>
                        <span
                          className={styles.poolCardCount}
                          aria-label={`В колоде: ${quantity}`}
                        >
                          {quantity}
                        </span>
                        <span className={styles.smallButtonWrap} title={addCardState.title}>
                          <button
                            className={`${styles.smallButton} ${!addCardState.allowed ? styles.smallButtonBlocked : ""}`.trim()}
                            type="button"
                            onClick={() => updateDeck(card.id, 1)}
                            disabled={!addCardState.allowed}
                            aria-label={`Добавить ${card.name} в колоду`}
                          >
                            +
                          </button>
                        </span>
                      </div>
                    </div>
                    <div className={styles.poolCardMeta}>
                      <span className={styles.poolCardTag}>
                        {getCatalogCardTypeLabel(card.type)}
                      </span>
                      {card.school ? (
                        <span className={styles.poolCardTag}>
                          {getCatalogSchoolLabel(card.school)}
                        </span>
                      ) : null}
                      {card.speed ? (
                        <span className={styles.poolCardTag}>
                          speed {card.speed}
                        </span>
                      ) : null}
                      {card.type === "summon" && (card.hp || card.attack) ? (
                        <span className={styles.poolCardTag}>
                          {card.hp ? `HP ${card.hp}` : ""}
                          {card.hp && card.attack ? " · " : ""}
                          {card.attack ? `ATK ${card.attack}` : ""}
                        </span>
                      ) : null}
                    </div>
                    {card.effect ? (
                      <div className={styles.poolCardEffect}>{card.effect}</div>
                    ) : null}
                  </div>
                );
              })}
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
                </div>

                <div className={styles.deckManagerGrid}>
                  <div>
                    <label className={styles.filterLabel} htmlFor="saved-deck">
                      Сохранённые колоды
                    </label>
                    <div className={styles.deckSelectWrap} ref={savedDeckMenuRef}>
                      <button
                        id="saved-deck"
                        className={styles.deckSelectButton}
                        type="button"
                        disabled={isDecksLoading || savedDecks.length === 0}
                        aria-haspopup="listbox"
                        aria-expanded={isSavedDeckMenuOpen}
                        aria-label="Сохранённые колоды"
                        onClick={() => setIsSavedDeckMenuOpen((value) => !value)}
                      >
                        <span className={styles.deckSelectValue}>{selectedSavedDeckLabel}</span>
                        <span className={styles.deckSelectChevron} aria-hidden="true">
                          <svg viewBox="0 0 24 24" className={styles.deckActionGlyph}>
                            <path
                              d="m7 10 5 5 5-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </button>
                      {isSavedDeckMenuOpen ? (
                        <div className={styles.deckSelectMenu} role="listbox" aria-labelledby="saved-deck">
                          <button
                            className={`${styles.deckSelectOption} ${!deckId ? styles.deckSelectOptionActive : ""}`.trim()}
                            type="button"
                            role="option"
                            aria-selected={!deckId}
                            onClick={() => handleDeckSelection("")}
                          >
                            Черновик
                          </button>
                          {savedDecks.map((savedDeck) => (
                            <button
                              key={savedDeck.id}
                              className={`${styles.deckSelectOption} ${deckId === savedDeck.id ? styles.deckSelectOptionActive : ""}`.trim()}
                              type="button"
                              role="option"
                              aria-selected={deckId === savedDeck.id}
                              onClick={() => handleDeckSelection(savedDeck.id)}
                            >
                              {savedDeck.name}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
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
                  <span className={styles.deckActionTooltip} title={saveDisabled ? saveDisabledTitle : saveDeckLabel}>
                    <button
                      className={styles.deckActionButton}
                      type="button"
                      onClick={() => void handleSaveDeck()}
                      disabled={saveDisabled}
                      aria-label={saveDeckLabel}
                    >
                      <span aria-hidden="true" className={styles.deckActionIcon}>
                        <svg viewBox="0 0 24 24" className={styles.deckActionGlyph}>
                          <path
                            d="M6.5 4.5h9l2 2v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M8 4.5v5h6v-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M8.5 15.5h5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                    </button>
                  </span>
                  <span className={styles.deckActionTooltip} title={saveDisabled ? saveDisabledTitle : createDeckCopyLabel}>
                    <button
                      className={styles.deckActionButton}
                      type="button"
                      onClick={() => void handleSaveDeck("create-new")}
                      disabled={saveDisabled}
                      aria-label={createDeckCopyLabel}
                    >
                      <span aria-hidden="true" className={styles.deckActionIcon}>
                        <svg viewBox="0 0 24 24" className={styles.deckActionGlyph}>
                          <rect
                            x="9"
                            y="9"
                            width="9"
                            height="9"
                            rx="1.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                          <path
                            d="M6.5 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>
                  </span>
                  <button
                    className={styles.deckActionButton}
                    type="button"
                    onClick={handleCreateDraft}
                    disabled={isSaving}
                    aria-label={createDraftLabel}
                    title={createDraftLabel}
                  >
                    <span aria-hidden="true" className={styles.deckActionIcon}>
                      <svg viewBox="0 0 24 24" className={styles.deckActionGlyph}>
                        <path
                          d="M12 6v12M6 12h12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                  </button>
                  <button
                    className={`${styles.deckActionButton} ${styles.deckActionDanger}`.trim()}
                    type="button"
                    onClick={handleDeleteDeck}
                    disabled={isSaving}
                    aria-label={deleteDeckLabel}
                    title={deleteDeckLabel}
                  >
                    <span aria-hidden="true" className={styles.deckActionIcon}>
                      <svg viewBox="0 0 24 24" className={styles.deckActionGlyph}>
                        <path
                          d="M7 7l10 10M17 7 7 17"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
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
                {!deckValidation.ok ? (
                  <div className={styles.deckValidationInline}>
                    <span
                      className={`${styles.deckBadge} ${styles.deckBadgeWarning} ${styles.deckValidationBadge}`.trim()}
                      title={deckStatusTooltip}
                      aria-label="Показать ошибки колоды"
                    >
                      <span className={styles.deckBadgeMark} aria-hidden="true">
                        !
                      </span>
                      <span>Сохранить нельзя</span>
                    </span>
                  </div>
                ) : null}
              </div>
              <div className={styles.deckWorkspaceBody}>
                <div className={styles.deckSummary}>
                  <div>
                    <div className={styles.summaryValue}>
                      {totalCards}/{DECK_RULES_V1.deckSize}
                    </div>
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
                    deckCards.map((card) => {
                      const addCardState = getAddCardAvailability(card.id);

                      return (
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
                            <span className={styles.smallButtonWrap} title={addCardState.title}>
                              <button
                                className={`${styles.smallButton} ${!addCardState.allowed ? styles.smallButtonBlocked : ""}`.trim()}
                                type="button"
                                onClick={() => updateDeck(card.id, 1)}
                                disabled={!addCardState.allowed}
                              >
                                +
                              </button>
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </Card>

            <Card title="Пресеты для тестов" className={styles.presetWorkspaceCard}>
              <div className={styles.presetGrid}>
                {DECK_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={styles.presetButton}
                    type="button"
                    onClick={() => applyPresetDeck(preset)}
                    title={preset.blurb}
                  >
                    <span className={styles.presetButtonTitle}>{preset.name}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </section>
      </div>
    </PageShell>
  );
};

