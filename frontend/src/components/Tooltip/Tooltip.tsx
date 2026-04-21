import type { ReactNode } from "react";
import styles from "./Tooltip.module.css";

type TooltipSide = "top" | "bottom";
type TooltipAlign = "start" | "center" | "end";

type TooltipProps = {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  triggerClassName?: string;
  bubbleClassName?: string;
  side?: TooltipSide;
  align?: TooltipAlign;
  fullWidth?: boolean;
  disabled?: boolean;
};

const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

export const Tooltip = ({
  children,
  content,
  className,
  triggerClassName,
  bubbleClassName,
  side = "top",
  align = "center",
  fullWidth = false,
  disabled = false,
}: TooltipProps) => {
  if (disabled) {
    return <>{children}</>;
  }

  return (
    <span
      className={cx(
        styles.root,
        fullWidth && styles.fullWidth,
        side === "bottom" ? styles.sideBottom : styles.sideTop,
        align === "start"
          ? styles.alignStart
          : align === "end"
            ? styles.alignEnd
            : styles.alignCenter,
        className,
      )}
    >
      <span className={cx(styles.trigger, triggerClassName)}>{children}</span>
      <span className={cx(styles.bubble, bubbleClassName)} role="tooltip">
        {content}
      </span>
    </span>
  );
};
