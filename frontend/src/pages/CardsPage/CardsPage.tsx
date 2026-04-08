import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
import { ROUTES } from "@/constants";
import rawCardData from "@/data/cardCatalog";
import styles from "./CardsPage.module.css";

type CardType = CatalogCardUiType;
type School = CatalogSchool;

type CardSummary = CatalogCardSummary;
type CharacterSummary = CatalogCharacterSummary;

const CARD_POOL: CardSummary[] = buildCatalogCardSummaries(rawCardData);
const CHARACTERS: CharacterSummary[] = buildCatalogCharacterSummaries(rawCardData);

const SCHOOL_FILTERS: Array<{ id: "all" | School; label: string }> = [
  { id: "all", label: "Все" },
  { id: "fire", label: getCatalogSchoolLabel("fire") },
  { id: "water", label: getCatalogSchoolLabel("water") },
  { id: "earth", label: getCatalogSchoolLabel("earth") },
  { id: "air", label: getCatalogSchoolLabel("air") },
];

const TYPE_FILTERS: Array<{ id: "all" | CardType; label: string }> = [
  { id: "all", label: "Все" },
  { id: "spell", label: getCatalogCardTypeLabel("spell", "plural") },
  { id: "modifier", label: getCatalogCardTypeLabel("modifier", "plural") },
  { id: "art", label: getCatalogCardTypeLabel("art", "plural") },
  { id: "summon", label: getCatalogCardTypeLabel("summon", "plural") },
];

type ManaFilter = "all" | "0-2" | "3-4" | "5+";
type SpeedFilter = "all" | "1-2" | "3-4" | "5+";

const matchesRange = (value: number, range: ManaFilter | SpeedFilter) => {
  if (range === "all") {
    return true;
  }
  if (range === "0-2") {
    return value <= 2;
  }
  if (range === "3-4") {
    return value >= 3 && value <= 4;
  }
  return value >= 5;
};

export const CardsPage = () => {
  const [schoolFilter, setSchoolFilter] = useState<"all" | School>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | CardType>("all");
  const [search, setSearch] = useState("");
  const [manaFilter, setManaFilter] = useState<ManaFilter>("all");
  const [speedFilter, setSpeedFilter] = useState<SpeedFilter>("all");
  const [selectedCardId, setSelectedCardId] = useState(
    CARD_POOL[0]?.id ?? "",
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState(
    CHARACTERS[0]?.id ?? "",
  );
  const [detailMode, setDetailMode] = useState<"card" | "character">("card");
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

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    return CARD_POOL.filter((card) => {
      const matchesSchool =
        schoolFilter === "all" ? true : card.school === schoolFilter;
      const matchesType = typeFilter === "all" ? true : card.type === typeFilter;
      const matchesSearch = query.length === 0
        ? true
        : card.name.toLowerCase().includes(query);
      const matchesMana = matchesRange(card.mana, manaFilter);
      const speedValue = card.speed ?? 0;
      const matchesSpeed = matchesRange(speedValue, speedFilter);
      return (
        matchesSchool &&
        matchesType &&
        matchesSearch &&
        matchesMana &&
        matchesSpeed
      );
    });
  }, [manaFilter, schoolFilter, search, speedFilter, typeFilter]);

  const selectedCard = useMemo(
    () => filteredCards.find((card) => card.id === selectedCardId) ?? filteredCards[0],
    [filteredCards, selectedCardId],
  );

  const selectedCharacter = useMemo(
    () =>
      CHARACTERS.find((character) => character.id === selectedCharacterId) ??
      CHARACTERS[0],
    [selectedCharacterId],
  );

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
    if (selectedCard && selectedCard.id !== selectedCardId) {
      setSelectedCardId(selectedCard.id);
    }
  }, [selectedCard, selectedCardId]);

  useEffect(() => {
    if (selectedCharacter && selectedCharacter.id !== selectedCharacterId) {
      setSelectedCharacterId(selectedCharacter.id);
    }
  }, [selectedCharacter, selectedCharacterId]);

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

  return (
    <PageShell
      title="Превью карт и персонажей"
      subtitle="Фильтры и быстрый просмотр ключевых характеристик."
      actions={<HomeLinkButton />}
    >
      <div className={styles.pageGrid}>
        <section className={styles.mainColumn}>
          <Card title="Фильтры">
            <div className={styles.filterBlock}>
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Школы</span>
                <div className={styles.chips}>
                  {SCHOOL_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      className={
                        filter.id === schoolFilter
                          ? styles.chipActive
                          : styles.chip
                      }
                      type="button"
                      onClick={() => setSchoolFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Типы карт</span>
                <div className={styles.chips}>
                  {TYPE_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      className={
                        filter.id === typeFilter
                          ? styles.chipActive
                          : styles.chip
                      }
                      type="button"
                      onClick={() => setTypeFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Поиск и параметры</span>
                <div className={styles.filterControls}>
                  <input
                    className={styles.input}
                    placeholder="Поиск по названию"
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <select
                    className={styles.select}
                    value={manaFilter}
                    onChange={(event) =>
                      setManaFilter(event.target.value as ManaFilter)
                    }
                  >
                    <option value="all">Любая мана</option>
                    <option value="0-2">0-2 маны</option>
                    <option value="3-4">3-4 маны</option>
                    <option value="5+">5+ маны</option>
                  </select>
                  <select
                    className={styles.select}
                    value={speedFilter}
                    onChange={(event) =>
                      setSpeedFilter(event.target.value as SpeedFilter)
                    }
                  >
                    <option value="all">Любая скорость</option>
                    <option value="1-2">1-2</option>
                    <option value="3-4">3-4</option>
                    <option value="5+">5+</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Превью персонажей">
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
                        isActive ? styles.characterCardActive : styles.characterCard
                      }
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        setSelectedCharacterId(original.id);
                        setDetailMode("character");
                      }}
                    >
                      <div className={styles.characterVisual}>
                        <div className={styles.characterAvatar}>Иллюстрация</div>
                        <div className={styles.characterTag}>{getCatalogSchoolLabel(original.faculty)}</div>
                      </div>
                      <div className={styles.characterName}>{original.name}</div>
                      <p className={styles.characterSkill}>{original.ability}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card title="Превью карт">
            <div className={styles.cardGrid}>
              {filteredCards.map((card) => {
                const isActive = card.id === selectedCardId;
                return (
                  <button
                    key={card.id}
                    className={
                      isActive ? styles.previewCardActive : styles.previewCard
                    }
                    type="button"
                    onClick={() => {
                      setSelectedCardId(card.id);
                      setDetailMode("card");
                    }}
                  >
                    <div className={styles.previewHeader}>
                      <span className={styles.previewName}>{card.name}</span>
                      <span className={styles.previewTag}>{getCatalogCardTypeLabel(card.type)}</span>
                    </div>
                    {card.effect ? (
                      <p className={styles.previewEffect}>{card.effect}</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Card>
        </section>

        <aside className={styles.sideColumn}>
          <div className={styles.stickyStack}>
            <Card title="Панель деталей">
              {detailMode === "character" && selectedCharacter ? (
                <div className={styles.detailBlock}>
                  <div className={styles.detailArtwork}>Иллюстрация</div>
                  <div className={styles.detailTitle}>{selectedCharacter.name}</div>
                  <div className={styles.detailMeta}>
                    Факультет: {getCatalogSchoolLabel(selectedCharacter.faculty)} · HP {selectedCharacter.hp} ·
                    Мана {selectedCharacter.mana}
                  </div>
                  <div className={styles.detailStats}>
                    <div className={styles.detailStat}>
                      <span>Сила</span>
                      <strong>{selectedCharacter.strength}</strong>
                    </div>
                    <div className={styles.detailStat}>
                      <span>Ловкость</span>
                      <strong>{selectedCharacter.agility}</strong>
                    </div>
                    <div className={styles.detailStat}>
                      <span>Фокус</span>
                      <strong>{selectedCharacter.focus}</strong>
                    </div>
                    <div className={styles.detailStat}>
                      <span>HP</span>
                      <strong>{selectedCharacter.hp}</strong>
                    </div>
                    <div className={styles.detailStat}>
                      <span>Мана</span>
                      <strong>{selectedCharacter.mana}</strong>
                    </div>
                  </div>
                  <p className={styles.detailText}>{selectedCharacter.ability}</p>
                </div>
              ) : null}

              {detailMode === "card" && selectedCard ? (
                <div className={styles.detailBlock}>
                  <div className={styles.detailArtwork}>Иллюстрация</div>
                  <div className={styles.detailTitle}>{selectedCard.name}</div>
                  <div className={styles.detailMeta}>
                    {getCatalogCardTypeLabel(selectedCard.type)}
                    {selectedCard.school ? ` · ${getCatalogSchoolLabel(selectedCard.school)}` : ""}
                    {` · мана ${selectedCard.mana}`}
                    {selectedCard.speed ? ` · скорость ${selectedCard.speed}` : ""}
                  </div>
                  <div className={styles.detailStats}>
                    <div className={styles.detailStat}>
                      <span>Мана</span>
                      <strong>{selectedCard.mana}</strong>
                    </div>
                    {selectedCard.speed ? (
                      <div className={styles.detailStat}>
                        <span>Скорость</span>
                        <strong>{selectedCard.speed}</strong>
                      </div>
                    ) : null}
                    {selectedCard.hp ? (
                      <div className={styles.detailStat}>
                        <span>HP</span>
                        <strong>{selectedCard.hp}</strong>
                      </div>
                    ) : null}
                    {selectedCard.attack ? (
                      <div className={styles.detailStat}>
                        <span>Урон</span>
                        <strong>{selectedCard.attack}</strong>
                      </div>
                    ) : null}
                    {selectedCard.school ? (
                      <div className={styles.detailStat}>
                        <span>Школа</span>
                        <strong>{getCatalogSchoolLabel(selectedCard.school)}</strong>
                      </div>
                    ) : null}
                  </div>
                  {selectedCard.effect ? (
                    <p className={styles.detailText}>{selectedCard.effect}</p>
                  ) : null}
                </div>
              ) : null}
            </Card>

            <Card title="Быстрые действия">
              <div className={styles.actionList}>
                <Link className={styles.actionButton} to={ROUTES.DECKS}>
                  Открыть декбилдер
                </Link>
                <button className={styles.actionButton} type="button">
                  Запустить симуляцию
                </button>
              </div>
            </Card>
          </div>
        </aside>
      </div>
    </PageShell>
  );
};
