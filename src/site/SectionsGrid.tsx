import { CATALOGUE, SECTIONS } from "./copy";

/** "What is in the report": one merged list for houses and flats, with Houses and Flats tags (18 shared, 2 houses, 5 flats). */
export function SectionsGrid() {
  return (
    <section className="sec alt" id="sections">
      <div className="wrap">
        <div className="head">
          <div className="kick">{SECTIONS.kicker}</div>
          <h2>{SECTIONS.title}</h2>
          <p className="lede">{SECTIONS.lede}</p>
        </div>
        <div className="cat" id="cat">
          {CATALOGUE.map((g) => (
            <div className="grp" key={g.group}>
              <h4>{g.group}<span>{g.items.length}</span></h4>
              <ul>
                {g.items.map((s) => (
                  <li key={s.title}>
                    <span className="nm">
                      {s.title}
                      {s.only === "H" && <em className="for">{SECTIONS.houses}</em>}
                      {s.only === "F" && <em className="for">{SECTIONS.flats}</em>}
                    </span>
                    {s.full ? (
                      <span className="chip full"><i />{SECTIONS.fullReport}</span>
                    ) : (
                      <span className="chip free"><i />{SECTIONS.free}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="catnote">{SECTIONS.note}</p>
      </div>
    </section>
  );
}
