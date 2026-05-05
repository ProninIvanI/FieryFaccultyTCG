import { useEffect, useRef, useState } from 'react';

export const useMatchFeedDrawer = () => {
  const [expandedRoundNumber, setExpandedRoundNumber] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (panelRef.current?.contains(target) || toggleRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  return {
    expandedRoundNumber,
    setExpandedRoundNumber,
    isOpen,
    setIsOpen,
    panelRef,
    toggleRef,
  };
};
