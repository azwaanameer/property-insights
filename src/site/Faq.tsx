import { FAQ } from "./copy";

export function Faq() {
  return (
    <section className="sec" id="faq">
      <div className="wrap">
        <div className="head">
          <div className="kick">{FAQ.kicker}</div>
          <h2>{FAQ.title}</h2>
        </div>
        <div className="faq">
          {FAQ.items.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
