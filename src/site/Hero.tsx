import { AddressSearch, SampleButton } from "./AddressSearch";
import { HERO, HERO_CARD, SAMPLES } from "./copy";
import { Icon } from "./Icon";
import { Photo } from "./Photo";

/** The preview card is static sample content for marketing, labelled Example. It is never fetched. */
function HeroCard() {
  return (
    <aside className="rc" aria-label={HERO_CARD.ariaLabel}>
      <div className="rc-bar">
        <span className="chip obs"><i />{HERO_CARD.matched}</span>
        <span>{HERO_CARD.exampleLabel} &middot; {HERO_CARD.kind}</span>
      </div>
      <div className="ph">
        <Photo name="house" alt={HERO_CARD.photoAlt} />
        <span className="tag">{HERO_CARD.photoTag}</span>
      </div>
      <div className="rc-id">
        <h3>{HERO_CARD.title}</h3>
        <p>{HERO_CARD.place}</p>
      </div>
      <dl className="tiles">
        {HERO_CARD.tiles.map((t) => (
          <div key={t.cap}>
            <dt>{t.cap}</dt>
            <dd>{t.value}</dd>
            <span className={`chip ${t.chip}`}><i />{t.chipLabel}</span>
          </div>
        ))}
      </dl>
      <ul className="rows">
        {HERO_CARD.rows.map((r) => (
          <li key={r.text}>
            <Icon name={r.free ? "check" : "lock"} className={r.free ? "ok" : "lk"} />
            <span className="t">{r.text}</span>
            {r.free ? (
              <span className="chip free"><i />Free</span>
            ) : (
              <span className="bl" aria-hidden="true"><i /><i /><i /></span>
            )}
          </li>
        ))}
      </ul>
      <div className="rc-foot">
        <SampleButton text={SAMPLES.house.text} className="btn">{HERO_CARD.open}</SampleButton>
        <small>{HERO_CARD.foot}</small>
      </div>
    </aside>
  );
}

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="wrap">
        <div className="hero-copy">
          <div className="kick">{HERO.kicker}</div>
          <h1>
            {HERO.titleBefore}<em>{HERO.titleEm}</em>{HERO.titleAfter}
          </h1>
          <p className="lede">{HERO.lede}</p>
          <AddressSearch idPrefix="a1" withSamples />
          <p className="note" style={{ marginTop: 6 }}>{HERO.note}</p>
          <div className="steps1">
            {HERO.steps.map((s, i) => (
              <span key={s}><b>{i + 1}</b>{s}</span>
            ))}
          </div>
        </div>
        <div className="hero-card">
          <HeroCard />
        </div>
      </div>
    </section>
  );
}
