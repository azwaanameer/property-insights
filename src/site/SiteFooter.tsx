import { BRAND, FOOTER } from "./copy";
import { CREDITS_INTRO, PHOTO_CREDITS } from "./credits";

export function SiteFooter() {
  return (
    <footer>
      <div className="wrap">
        <div>
          <b>{BRAND}</b> {FOOTER.workingName}
        </div>
        <div>{FOOTER.disclaimer}</div>
        <div>{FOOTER.data}</div>
        <div className="credits">
          {CREDITS_INTRO}{" "}
          {PHOTO_CREDITS.map((c, i) => (
            <span key={c.file}>
              {c.label}:{" "}
              <a href={c.href} target="_blank" rel="noopener">
                {c.author}, {c.licence}
              </a>
              {i < PHOTO_CREDITS.length - 1 ? "; " : "."}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
