import { useEffect, useMemo, useState } from 'react';
import { Card, HomeLinkButton, PageShell } from '@/components';
import styles from './PlaySimPage.module.css';

type ReplayEvent = {
  turn: number;
  text: string;
};

type ReplayItem = {
  id: string;
  title: string;
  mode: 'PvP' | 'PvE' | 'Simulation';
  date: string;
  duration: string;
  winner: string;
  seed: string;
  turns: number;
  deckA: string;
  deckB: string;
  events: ReplayEvent[];
};

type SimulationForm = {
  mode: 'PvP' | 'PvE';
  seed: string;
  runs: number;
  deckA: string;
  deckB: string;
};

type SimulationResult = {
  id: string;
  createdAt: string;
  mode: 'PvP' | 'PvE';
  seed: string;
  runs: number;
  deckA: string;
  deckB: string;
  winsA: number;
  winsB: number;
  winRateA: number;
  avgTurns: number;
  avgDamage: number;
};

const MOCK_REPLAYS: ReplayItem[] = [
  {
    id: 'r-001',
    title: 'Огонь vs Вода, тест скорости',
    mode: 'PvP',
    date: '2026-03-20 18:40',
    duration: '09:12',
    winner: 'Огонь',
    seed: '45219',
    turns: 7,
    deckA: 'Aggro Fire',
    deckB: 'Control Water',
    events: [
      { turn: 1, text: 'Огонь: Огненный шар → 3 урона' },
      { turn: 1, text: 'Вода: Ледяной шип → 3 урона' },
      { turn: 2, text: 'Огонь: Пылающий луч → 2 урона' },
      { turn: 3, text: 'Вода: Ледяная стена → щит 4' },
      { turn: 4, text: 'Огонь: Лавовый поток → 5 урона' },
      { turn: 6, text: 'Вода: Водное исцеление → +4 HP' },
      { turn: 7, text: 'Огонь: добивание, победа' },
    ],
  },
  {
    id: 'r-002',
    title: 'Земля vs Воздух, контроль темпа',
    mode: 'PvP',
    date: '2026-03-19 21:05',
    duration: '11:48',
    winner: 'Воздух',
    seed: '11902',
    turns: 9,
    deckA: 'Earth Shield',
    deckB: 'Air Tempo',
    events: [
      { turn: 1, text: 'Земля: Каменная броня → щит 5' },
      { turn: 2, text: 'Воздух: Громовой разряд → 5 урона' },
      { turn: 3, text: 'Земля: Корни земли → цель без уклонения' },
      { turn: 5, text: 'Воздух: Буря ветров → -1 скорость врагам' },
      { turn: 9, text: 'Воздух: победа по суммарному урону' },
    ],
  },
];

const DECK_OPTIONS = ['Aggro Fire', 'Control Water', 'Earth Shield', 'Air Tempo'];

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const buildResult = (form: SimulationForm, index: number): SimulationResult => {
  const base = hashString(`${form.seed}-${form.deckA}-${form.deckB}-${form.runs}-${index}`);
  const winsA = clamp(Math.floor((base % 100) * (form.runs / 100)), 0, form.runs);
  const winsB = clamp(form.runs - winsA, 0, form.runs);
  const avgTurns = clamp(5 + (base % 7), 4, 12);
  const avgDamage = clamp(18 + (base % 24), 12, 45);
  const winRateA = form.runs === 0 ? 0 : Math.round((winsA / form.runs) * 100);

  return {
    id: `sim-${Date.now()}-${index}`,
    createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    mode: form.mode,
    seed: form.seed,
    runs: form.runs,
    deckA: form.deckA,
    deckB: form.deckB,
    winsA,
    winsB,
    winRateA,
    avgTurns,
    avgDamage,
  };
};

export const PlaySimPage = () => {
  const [form, setForm] = useState<SimulationForm>({
    mode: 'PvP',
    seed: '45219',
    runs: 50,
    deckA: DECK_OPTIONS[0],
    deckB: DECK_OPTIONS[1],
  });
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [replays, setReplays] = useState<ReplayItem[]>(MOCK_REPLAYS);
  const [activeReplayId, setActiveReplayId] = useState(MOCK_REPLAYS[0]?.id ?? '');
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const activeReplay = useMemo(
    () => replays.find((item) => item.id === activeReplayId) ?? replays[0],
    [activeReplayId, replays],
  );

  useEffect(() => {
    if (!activeReplay) {
      return;
    }
    setCurrentStep(0);
    setIsPlaying(false);
  }, [activeReplay]);

  useEffect(() => {
    if (!activeReplay || !isPlaying) {
      return undefined;
    }
    const totalSteps = activeReplay.events.length;
    const interval = window.setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= totalSteps - 1) {
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / speed);

    return () => window.clearInterval(interval);
  }, [activeReplay, isPlaying, speed]);

  const handleFormChange = (field: keyof SimulationForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: field === 'runs' ? Number(value) : value,
    }));
  };

  const submitSimulation = () => {
    const runs = clamp(form.runs, 1, 500);
    const seedValue = form.seed.trim() === '' ? 'auto' : form.seed.trim();
    const payload = { ...form, runs, seed: seedValue };
    const nextResult = buildResult(payload, results.length + 1);
    setResults((prev) => [nextResult, ...prev]);
  };

  const addReplayFromResult = (result: SimulationResult) => {
    const newReplay: ReplayItem = {
      id: `r-${Date.now()}`,
      title: `${result.deckA} vs ${result.deckB}, обзор`,
      mode: 'Simulation',
      date: result.createdAt,
      duration: `${Math.max(6, result.avgTurns)}:00`,
      winner: result.winsA >= result.winsB ? result.deckA : result.deckB,
      seed: result.seed,
      turns: result.avgTurns,
      deckA: result.deckA,
      deckB: result.deckB,
      events: [
        { turn: 1, text: 'Разбор запущен' },
        { turn: 2, text: 'Ход дуэли сопоставляется' },
        { turn: result.avgTurns, text: 'Разбор завершён' },
      ],
    };
    setReplays((prev) => [newReplay, ...prev]);
    setActiveReplayId(newReplay.id);
  };

  return (
    <PageShell
      title="Архив матчей"
      subtitle="Повторы дуэлей, итоги встреч и история сыгранных партий."
      actions={<HomeLinkButton />}
    >
      <div className={styles.pageGrid}>
        <section className={styles.mainColumn}>
          <Card title="Быстрый разбор">
            <div className={styles.formGrid}>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="sim-mode">Режим</label>
                <select
                  id="sim-mode"
                  className={styles.select}
                  value={form.mode}
                  onChange={(event) => handleFormChange('mode', event.target.value)}
                >
                  <option value="PvP">PvP</option>
                  <option value="PvE">PvE</option>
                </select>
              </div>

              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="sim-seed">Seed</label>
                <input
                  id="sim-seed"
                  className={styles.input}
                  value={form.seed}
                  onChange={(event) => handleFormChange('seed', event.target.value)}
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="sim-runs">Прогонов</label>
                <input
                  id="sim-runs"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={500}
                  value={form.runs}
                  onChange={(event) => handleFormChange('runs', event.target.value)}
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="deck-a">Колода игрока A</label>
                <select
                  id="deck-a"
                  className={styles.select}
                  value={form.deckA}
                  onChange={(event) => handleFormChange('deckA', event.target.value)}
                >
                  {DECK_OPTIONS.map((deck) => (
                    <option key={deck} value={deck}>{deck}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="deck-b">Колода игрока B</label>
                <select
                  id="deck-b"
                  className={styles.select}
                  value={form.deckB}
                  onChange={(event) => handleFormChange('deckB', event.target.value)}
                >
                  {DECK_OPTIONS.map((deck) => (
                    <option key={deck} value={deck}>{deck}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formActions}>
              <button className={styles.primaryButton} type="button" onClick={submitSimulation}>
                Начать разбор
              </button>
              <div className={styles.hint}>Итоги появятся ниже после запуска.</div>
            </div>
          </Card>

          <Card title="Итоги разборов">
            {results.length === 0 ? (
              <div className={styles.emptyState}>Пока нет сохранённых разборов.</div>
            ) : (
              <div className={styles.resultsList}>
                {results.map((result) => (
                  <div key={result.id} className={styles.resultRow}>
                    <div>
                      <div className={styles.resultTitle}>
                        {result.deckA} vs {result.deckB}
                      </div>
                      <div className={styles.resultMeta}>
                        {result.mode} · Seed {result.seed} · {result.runs} прогонов
                      </div>
                    </div>
                    <div className={styles.resultStats}>
                      <span>Победы A: {result.winsA}</span>
                      <span>Победы B: {result.winsB}</span>
                      <span>Winrate A: {result.winRateA}%</span>
                      <span>Сред. ходы: {result.avgTurns}</span>
                      <span>Сред. урон: {result.avgDamage}</span>
                    </div>
                    <div className={styles.resultActions}>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => addReplayFromResult(result)}
                      >
                        Создать реплей
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <aside className={styles.sideColumn}>
          <Card title="Реплеи">
            <div className={styles.replayList}>
              {replays.map((replay) => {
                const isActive = replay.id === activeReplayId;
                return (
                  <button
                    key={replay.id}
                    type="button"
                    className={isActive ? styles.replayItemActive : styles.replayItem}
                    onClick={() => setActiveReplayId(replay.id)}
                  >
                    <div className={styles.replayTitle}>{replay.title}</div>
                    <div className={styles.replayMeta}>
                      {replay.mode} · {replay.date} · {replay.duration}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {activeReplay ? (
            <Card title="Просмотр реплея">
              <div className={styles.replayDetail}>
                <div className={styles.replayHeadline}>{activeReplay.title}</div>
                <div className={styles.replayMetaRow}>
                  Победитель: {activeReplay.winner} · Seed {activeReplay.seed} · {activeReplay.turns} ходов
                </div>
                <div className={styles.timelineBlock}>
                  <input
                    className={styles.timeline}
                    type="range"
                    min={0}
                    max={activeReplay.events.length - 1}
                    value={currentStep}
                    onChange={(event) => setCurrentStep(Number(event.target.value))}
                  />
                  <div className={styles.timelineMeta}>
                    Ход {activeReplay.events[currentStep]?.turn ?? 1} ·
                    {activeReplay.events[currentStep]?.text}
                  </div>
                </div>
                <div className={styles.controlRow}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 0))}
                  >
                    Назад
                  </button>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => setIsPlaying((prev) => !prev)}
                  >
                    {isPlaying ? 'Пауза' : 'Воспроизвести'}
                  </button>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => setCurrentStep((prev) => Math.min(prev + 1, activeReplay.events.length - 1))}
                  >
                    Вперёд
                  </button>
                </div>
                <div className={styles.speedRow}>
                  <span>Скорость</span>
                  <select
                    className={styles.select}
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                  </select>
                </div>
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </PageShell>
  );
};
