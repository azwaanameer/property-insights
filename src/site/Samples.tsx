import { SampleButton } from "./AddressSearch";
import { SAMPLES, SAMPLES_SECTION } from "./copy";
import { Icon } from "./Icon";
import { Photo } from "./Photo";

export function Samples() {
  return (
    <section className="sec" id="samples">
      <div className="wrap">
        <div className="head">
          <div className="kick">{SAMPLES_SECTION.kicker}</div>
          <h2>{SAMPLES_SECTION.title}</h2>
          <p className="lede">{SAMPLES_SECTION.lede}</p>
        </div>
        <div className="samples">
          {SAMPLES_SECTION.cards.map((c) => (
            <article className="sample" key={c.key}>
              <div className="sfig">
                <Photo name={c.img} alt={c.alt} lazy />
                <span className="ex">{SAMPLES_SECTION.photoTag}</span>
              </div>
              <div className="sb">
                <span className="tag">{c.tag}<span className="dt">{c.date}</span></span>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
                <SampleButton text={SAMPLES[c.key].text}>
                  {SAMPLES_SECTION.open} <Icon name="arrow" />
                </SampleButton>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
