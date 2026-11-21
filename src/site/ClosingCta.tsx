import { AddressSearch } from "./AddressSearch";
import { CLOSING } from "./copy";

export function ClosingCta() {
  return (
    <section className="cta" id="try">
      <div className="wrap">
        <h2>{CLOSING.title}</h2>
        <p>{CLOSING.text}</p>
        <AddressSearch idPrefix="a2" />
      </div>
    </section>
  );
}
