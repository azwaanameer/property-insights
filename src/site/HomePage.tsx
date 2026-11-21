import { ClosingCta } from "./ClosingCta";
import { Faq } from "./Faq";
import { Hero } from "./Hero";
import { Pricing } from "./Pricing";
import { Samples } from "./Samples";
import { SectionsGrid } from "./SectionsGrid";
import { WhoFor } from "./WhoFor";

/** The marketing home page, in the approved order. There is deliberately no data-sources section (owner decision). */
export function HomePage() {
  return (
    <main id="main">
      <Hero />
      <WhoFor />
      <SectionsGrid />
      <Samples />
      <Pricing />
      <Faq />
      <ClosingCta />
    </main>
  );
}
