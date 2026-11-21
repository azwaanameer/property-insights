import { BRAND, NAV_CTA, NAV_LINKS } from "./copy";
import { BrandMark } from "./Icon";

// Plain anchors: on the home page these are same-document jumps, elsewhere they load the home page at that section.
export function SiteNav() {
  return (
    <header className="nav">
      <div className="wrap">
        <a className="brand" href="/">
          <BrandMark />
          {BRAND}
        </a>
        <nav className="nl" aria-label="Sections">
          {NAV_LINKS.map((l) => (
            <a key={l.id} href={`/#${l.id}`}>
              {l.label}
            </a>
          ))}
        </nav>
        <a className="btn" href="/#top">
          {NAV_CTA}
        </a>
      </div>
    </header>
  );
}
