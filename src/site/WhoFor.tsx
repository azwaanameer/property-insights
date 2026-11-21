import { WHO } from "./copy";
import { Photo } from "./Photo";

export function WhoFor() {
  return (
    <section className="sec" id="who">
      <div className="wrap">
        <div className="head">
          <div className="kick">{WHO.kicker}</div>
          <h2>{WHO.title}</h2>
          <p className="lede">{WHO.lede}</p>
        </div>
        <div className="cards4">
          {WHO.cards.map((c) => (
            <div className="card" key={c.title}>
              <div className="cph"><Photo name={c.img} alt={c.alt} lazy /></div>
              <h3>{c.title}</h3>
              <p className="q">{c.quote}</p>
              <ul>
                {c.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
