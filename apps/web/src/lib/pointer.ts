import type { PointerEvent } from 'react';

/** Puts where the cursor is over the element, as fractions of it (0 to 1), in its --pointer-x/y, which hover effects in
 *  styles.css read (the project cards' glow and tilt, the About photo's tilt). CSSOM, not a style attribute: the CSP
 *  allows it. */
export function trackPointer(event: PointerEvent<HTMLElement>) {
  const element = event.currentTarget;
  const { left, top, width, height } = element.getBoundingClientRect();
  element.style.setProperty('--pointer-x', String((event.clientX - left) / width));
  element.style.setProperty('--pointer-y', String((event.clientY - top) / height));
}
