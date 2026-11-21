import { PRICING } from "./copy";
import { Icon } from "./Icon";

function Plan({ plan, pick }: { plan: typeof PRICING.one | typeof PRICING.pro; pick?: boolean }) {
  return (
    <div className={pick ? "plan pick" : "plan"}>
      <div className="cap">{plan.cap}</div>
      <div className="price">{plan.price} <small>{plan.per}</small></div>
      <ul className="ticks">
        {plan.points.map((p) => (
          <li key={p}><Icon name="check" />{p}</li>
        ))}
      </ul>
      {/* Checkout is step 2c and needs an address first, so both buttons lead to the search. */}
      <a className={pick ? "btn" : "btn alt"} href="#top">{plan.cta}</a>
      <p className="fine">{plan.fine}</p>
    </div>
  );
}

export function Pricing() {
  return (
    <section className="sec alt" id="pricing">
      <div className="wrap">
        <div className="head">
          <div className="kick">{PRICING.kicker}</div>
          <h2>{PRICING.title}</h2>
          <p className="lede">{PRICING.lede}</p>
        </div>
        <div className="plans">
          <Plan plan={PRICING.one} pick />
          <Plan plan={PRICING.pro} />
        </div>
      </div>
    </section>
  );
}
