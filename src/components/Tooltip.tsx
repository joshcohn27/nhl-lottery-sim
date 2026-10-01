import type { ReactNode } from "react";

/**
 * A custom, instantly-appearing tooltip (CSS hover/focus, no native browser
 * delay) that wraps its trigger content. Use for anything that needs a
 * styled hint - the native `title` attribute has a ~1s delay and can't be
 * styled, which is poor UX for something people are meant to discover.
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="tooltip-trigger" tabIndex={0}>
      {children}
      <span className="tooltip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}
