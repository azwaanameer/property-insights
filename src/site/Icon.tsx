// Inline SVG sprite and the Icon that points into it. The sprite is rendered once, in the root document.
export type IconName = "search" | "check" | "lock" | "arrow" | "gap";

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg className={`i ${className}`.trim()} aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg aria-hidden="true" focusable="false">
      <use href="#m-brand" />
    </svg>
  );
}

export function SvgSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></symbol>
      <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></symbol>
      <symbol id="i-gap" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></symbol>
      <symbol id="m-brand" viewBox="0 0 26 26">
        <polygon points="3,21 6,5 22,3 24,18" fill="none" stroke="var(--accent)" strokeWidth="2.2" />
        <rect x="9" y="9" width="8" height="6" fill="var(--accent)" />
      </symbol>
    </svg>
  );
}
