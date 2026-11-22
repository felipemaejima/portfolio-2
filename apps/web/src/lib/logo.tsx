// The FM logo, traced from a screenshot of it (there is no source file). One path per letter, so the hero can animate
// them apart. One colour, the text's (currentColor). Decorative: whoever shows it names it (aria-label, the h1).
// Same drawing in src/favicon.svg and src/apple-touch-icon.png (rendered once: light logo on the dark --color-bg).

/** The letters' paths, F then M, in a 279×198 viewBox. */
export const logoLetters = [
  'M0 0v125l38 22V76h35.5V50H38V28.5h85L151 0z',
  'M83.5 50v126h38V97l47.5 64h24l47.5-64v79l38 22V50H236l-55 75-55-75z',
] as const;

export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 279 198" fill="currentColor" aria-hidden="true">
      {logoLetters.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
