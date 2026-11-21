// The home page rendered to HTML: copy and structure from the approved mockup, and no data-sources section.
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATALOGUE, PRICES, priceCopy, REPORT } from "./copy";
import { PHOTO_CREDITS } from "./credits";
import { HomePage } from "./HomePage";
import { SiteFooter } from "./SiteFooter";

const html = renderToStaticMarkup(<HomePage />);

describe("home page", () => {
  it("has the sections in the approved order", () => {
    const ids = ["top", "who", "sections", "samples", "pricing", "faq", "try"].map((id) => html.indexOf(`id="${id}"`));
    expect(ids.every((i) => i > -1)).toBe(true);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });
  it("carries the approved copy and numbers exactly", () => {
    for (const text of [
      "Due diligence on any <em>Victorian address</em>, in minutes.",
      "Free preview in seconds. Full report $24, GST included.",
      "447 m²",
      "A house report has 20 sections and a flat report has 23.",
      "733-flat tower",
      "74 to 80% of the time",
      "40% or more above a lease",
      "$99",
      "Walk into the next inspection knowing the address.",
    ]) {
      expect(html, text).toContain(text);
    }
  });
  it("the hero preview card is labelled Example and is static content", () => {
    expect(html).toContain("Example · House");
    expect(html).toContain("Example street photo");
  });
  it("has no data-sources or transparency section", () => {
    // The one owner-approved catalogue entry "Where did all this come from?" is a list item, never a section or heading.
    const mentions = [...html.matchAll(/where (?:did )?(?:all this|the data) comes? from/gi)];
    expect(mentions).toHaveLength(1);
    expect(html).toContain('<span class="nm">Where did all this come from?</span>');
    expect(html).not.toMatch(/id="(sources|data|data-sources|transparency)"/);
    const headings = [...html.matchAll(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/g)].map((m) => m[1]);
    expect(headings.length).toBeGreaterThan(5);
    for (const h of headings) expect(h, h).not.toMatch(/sources?|where .* come from|transparen|data/i);
  });
  it("shows no internal notes as public copy", () => {
    expect(html).not.toMatch(/to be confirmed|fair-use/i);
    expect(html).toContain("Renews monthly. Cancel any time.");
  });
  it("every price in the copy is built from PRICES", () => {
    const a = priceCopy(PRICES);
    expect(a.heroNote).toBe("Free preview in seconds. Full report $24, GST included.");
    const b = priceCopy({ oneReport: 30, proMonthly: 120 });
    expect(b.heroNote).toContain("$30");
    expect(b.unlockBarTitle).toContain("$30");
    expect(b.goPro).toBe("Go Pro, $120 a month");
    expect(b.one).toBe("$30");
    expect(b.pro).toBe("$120");
    // the strings the page shows are the ones built from PRICES
    expect(html).toContain(a.heroNote);
    expect(html).toContain(`<div class="price">${a.one} `);
    expect(html).toContain(`<div class="price">${a.pro} `);
    expect(REPORT.unlockBarTitle).toBe(a.unlockBarTitle);
    expect(REPORT.goPro).toBe(a.goPro);
  });
  it("the sample cards carry an Example photo tag", () => {
    expect(html.match(/<span class="ex">Example photo<\/span>/g)).toHaveLength(2);
  });
  it("the search is an accessible combobox with a label", () => {
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('class="vh"');
  });
  it("offers both sample addresses", () => {
    expect(html).toContain("14 Lucinda Lane, Cranbourne North");
    expect(html).toContain("310/628 Flinders St, Docklands");
  });
});

describe("what is in the report", () => {
  const items = CATALOGUE.flatMap((g) => g.items);
  it("is one merged list: 18 shared, 2 for houses, 5 for flats", () => {
    expect(items.filter((i) => i.only === "").length).toBe(18);
    expect(items.filter((i) => i.only === "H").length).toBe(2);
    expect(items.filter((i) => i.only === "F").length).toBe(5);
  });
  it("renders the Houses and Flats tags", () => {
    expect(html.match(/<em class="for">Houses<\/em>/g)).toHaveLength(2);
    expect(html.match(/<em class="for">Flats<\/em>/g)).toHaveLength(5);
  });
});

describe("photos and credits", () => {
  it("every photo is a static file in public/img", () => {
    for (const c of PHOTO_CREDITS) expect(existsSync(new URL(`../../public/img/${c.file}`, import.meta.url)), c.file).toBe(true);
    for (const m of html.matchAll(/src="\/img\/([a-z]+\.jpg)"/g)) expect(PHOTO_CREDITS.some((c) => c.file === m[1]), m[1]).toBe(true);
  });
  it("the footer data line lists only the sources the built layers use", () => {
    const footer = renderToStaticMarkup(<SiteFooter />);
    expect(footer).toContain("Contains data from Geoscape G-NAF, Valuer-General Victoria, Homes Victoria and the Australian Bureau of Statistics, used under Creative Commons Attribution licences.");
    for (const gone of ["Crime Statistics", "Public Transport Victoria", "OpenStreetMap", "ODbL", "Vicmap"]) expect(footer).not.toContain(gone);
  });
  it("the footer credits every photo with author and licence", () => {
    const footer = renderToStaticMarkup(<SiteFooter />);
    for (const c of PHOTO_CREDITS) {
      expect(footer).toContain(c.author);
      expect(footer).toContain(c.licence);
      expect(footer).toContain("commons.wikimedia.org");
    }
  });
});
