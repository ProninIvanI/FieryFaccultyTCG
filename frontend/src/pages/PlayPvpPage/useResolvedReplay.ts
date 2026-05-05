import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoundResolutionResult } from '@game-core/types';
import {
  buildPlaybackFieldValues,
  getPlaybackFrames,
  getPlaybackStepCount,
} from './playback';
import type { BoardItemSummary } from './PlayPvpPage';
import type { ResolvedTimelineEntrySummary } from './resolvedActionPresentation';

const ROUND_RESOLUTION_PLAYBACK_STEP_MS = 800;
const ROUND_RESOLUTION_REPLAY_AUTO_CLOSE_MS = 900;

interface UseResolvedReplayParams {
  lastResolvedRound: RoundResolutionResult | null;
  resolvedTimelineEntries: ResolvedTimelineEntrySummary[];
  currentRoundNumber: number;
  localBoardItems: BoardItemSummary[];
}

export const useResolvedReplay = ({
  lastResolvedRound,
  resolvedTimelineEntries,
  currentRoundNumber,
  localBoardItems,
}: UseResolvedReplayParams) => {
  const [playbackIndex, setPlaybackIndex] = useState(-1);
  const [playbackComplete, setPlaybackComplete] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [playbackBoardItems, setPlaybackBoardItems] = useState<BoardItemSummary[]>([]);
  const previousLocalBoardItemsRef = useRef<BoardItemSummary[]>([]);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const totalSteps = getPlaybackStepCount(lastResolvedRound);

    if (!lastResolvedRound || totalSteps === 0) {
      setPlaybackIndex(-1);
      setPlaybackComplete(true);
      setIsOpen(false);
      setIsPinned(false);
      return;
    }

    setPlaybackIndex(0);
    setPlaybackComplete(false);
    setIsOpen(true);
    setIsPinned(false);
  }, [lastResolvedRound]);

  useEffect(() => {
    const totalSteps = getPlaybackStepCount(lastResolvedRound);

    if (!lastResolvedRound || totalSteps === 0 || playbackComplete || playbackIndex < 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (playbackIndex >= totalSteps - 1) {
        setPlaybackComplete(true);
        return;
      }

      setPlaybackIndex((currentIndex) => Math.min(currentIndex + 1, totalSteps - 1));
    }, ROUND_RESOLUTION_PLAYBACK_STEP_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [lastResolvedRound, playbackComplete, playbackIndex]);

  useEffect(() => {
    if (!lastResolvedRound) {
      setPlaybackBoardItems(localBoardItems);
      return;
    }

    const mergedItems = new Map<string, BoardItemSummary>();
    previousLocalBoardItemsRef.current.forEach((item) => mergedItems.set(item.runtimeId, item));
    localBoardItems.forEach((item) => mergedItems.set(item.runtimeId, item));
    setPlaybackBoardItems([...mergedItems.values()]);
  }, [lastResolvedRound, localBoardItems]);

  useEffect(() => {
    previousLocalBoardItemsRef.current = localBoardItems;
  }, [localBoardItems]);

  const frames = useMemo(() => getPlaybackFrames(lastResolvedRound), [lastResolvedRound]);
  const activeFrame = playbackIndex >= 0 && playbackIndex < frames.length ? frames[playbackIndex] : null;
  const hasActiveStep = !playbackComplete || getPlaybackStepCount(lastResolvedRound) <= 1;
  const activeEntry =
    activeFrame?.actionIntentId
      ? resolvedTimelineEntries.find((entry) => entry.action.intentId === activeFrame.actionIntentId) ?? null
      : hasActiveStep && playbackIndex >= 0 && playbackIndex < resolvedTimelineEntries.length
        ? resolvedTimelineEntries[playbackIndex]
        : null;
  const fieldValues = useMemo(
    () => (isOpen && frames.length > 0 ? buildPlaybackFieldValues(frames, playbackIndex) : new Map()),
    [frames, isOpen, playbackIndex],
  );
  const hasReplayAvailable = Boolean(lastResolvedRound && resolvedTimelineEntries.length > 0);
  const hasCurrentRoundAdvancedPastReplay =
    Boolean(lastResolvedRound) && currentRoundNumber > (lastResolvedRound?.roundNumber ?? 0);

  const restart = useCallback(
    (pinned: boolean) => {
      const totalSteps = getPlaybackStepCount(lastResolvedRound);
      if (!lastResolvedRound || totalSteps === 0) {
        return;
      }

      setPlaybackIndex(0);
      setPlaybackComplete(totalSteps === 1);
      setIsPinned(pinned);
      setIsOpen(true);
    },
    [lastResolvedRound],
  );

  const toggle = useCallback(() => {
    if (!hasReplayAvailable) {
      return;
    }

    if (isOpen) {
      setIsOpen(false);
      setIsPinned(false);
      return;
    }

    restart(true);
  }, [hasReplayAvailable, isOpen, restart]);

  useEffect(() => {
    if (!isOpen || isPinned || !playbackComplete || !hasCurrentRoundAdvancedPastReplay) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsOpen(false);
    }, ROUND_RESOLUTION_REPLAY_AUTO_CLOSE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasCurrentRoundAdvancedPastReplay, isOpen, isPinned, playbackComplete]);

  useEffect(() => {
    if (!isOpen || !activeEntry) {
      return;
    }

    const replayTrack = trackRef.current;
    const replayItem = itemRefs.current[activeEntry.action.intentId];

    if (!replayTrack || !replayItem) {
      return;
    }

    const nextScrollLeft =
      replayItem.offsetLeft - Math.max(0, (replayTrack.clientWidth - replayItem.clientWidth) / 2);
    const boundedScrollLeft = Math.max(0, nextScrollLeft);

    if (typeof replayTrack.scrollTo === 'function') {
      replayTrack.scrollTo({
        left: boundedScrollLeft,
        behavior: 'smooth',
      });
    } else {
      replayTrack.scrollLeft = boundedScrollLeft;
    }

    if (typeof document.scrollingElement?.scrollTo === 'function') {
      document.scrollingElement.scrollTo({
        left: 0,
        top: document.scrollingElement.scrollTop,
      });
    } else if (document.scrollingElement) {
      document.scrollingElement.scrollLeft = 0;
    }
  }, [activeEntry, isOpen]);

  return {
    activeEntry,
    activeFrame,
    fieldValues,
    hasActiveStep,
    hasReplayAvailable,
    isOpen,
    itemRefs,
    playbackBoardItems,
    playbackComplete,
    playbackIndex,
    restart,
    toggle,
    trackRef,
  };
};
