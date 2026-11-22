import type { ReactNode } from 'react';

/** A line icon in Lucide's style, on its 24×24 grid (most paths are Lucide's, ISC license). Decorative: its button or label names it. */
export function LineIcon({ size, strokeWidth = 2, children }: { size: number; strokeWidth?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
