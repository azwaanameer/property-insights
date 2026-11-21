// The street photos (L19) and nearby places (L20) sections rendered to HTML from a real assembled report with fake vendor adapters.
// Every image shows its author, licence and source link, and an image without a credit is never drawn.
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS } from "../../server/contracts/address";
import type { ReportModel } from "../../server/contracts/report";
import { assembleReport } from "../../server/services/assemble-report";
import { resolveQuery } from "../../server/services/resolve-address";
import { createSuburbDataTestDb, type TestDb } from "../../server/testing/db";
import { fakeVendors, moved, ok, osmPlace, placeImage, streetImage, UNAVAILABLE_VENDORS } from "../../server/testing/fake-vendors";
import type { VendorAdapters } from "../../server/vendors/types";
import { ReportView } from "./ReportView";
import { PhotosPanel, PlacesPanel } from "./PhotosPanel";

let db: TestDb;
let close: () => Promise<void>;
let lat: number;
let lon: number;
beforeAll(async () => {
  ({ db, close } = await createSuburbDataTestDb());
  const a = await resolveQuery(db, "310/628 Flinders St Docklands");
  lat = a.lat!;
  lon = a.lon!;
});
afterAll(() => close());

const model = async (vendors: VendorAdapters): Promise<ReportModel> => assembleReport({ db, address: await resolveQuery(db, "310/628 Flinders St Docklands"), principal: ANONYMOUS, request_id: "t", vendors });
const html = (m: ReportModel) => renderToStaticMarkup(<ReportView model={m} />);
const section = (out: string, id: string) => {
  const start = out.indexOf(`id="r-${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  return out.slice(start, out.indexOf("</section>", start));
};
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const recent = () => new Date(Date.UTC(new Date().getUTCFullYear(), 0, 15)).toISOString();

const withData = (): VendorAdapters =>
  fakeVendors({
    streetImages: async () =>
      ok([
        streetImage({ id: "s1", compass_angle: 10, captured_at: recent(), creator: "alice", ...moved(lat, lon, 10, 0) }),
        streetImage({ id: "s2", compass_angle: 190, captured_at: recent(), creator: "bob", ...moved(lat, lon, -10, 0) }),
      ]),
    placeImages: async () => ok([placeImage({ title: "Flinders_Street.jpg", author: "Jane & Co", ...moved(lat, lon, 200, 0) })]),
    places: async () =>
      ok({
        places: [
          osmPlace({ osm_id: "node/1", category: "groceries", name: "Corner Grocer", ...moved(lat, lon, 120, 0) }),
          osmPlace({ osm_id: "node/2", category: "food", name: null, ...moved(lat, lon, 60, 0) }),
        ],
        truncated: false,
      }),
  });

describe("the photos section", () => {
  let out: string;
  let s: string;
  beforeAll(async () => {
    out = html(await model(withData()));
    s = section(out, "L19-photos");
  });

  it("is headed 'What does the street look like?' and sits right after the property section", () => {
    expect(s).toContain("What does the street look like?");
    expect(s).toContain('data-status="ok"');
    expect(out.indexOf("What does the street look like?")).toBeGreaterThan(out.indexOf("What is this property?"));
    expect(out.indexOf("What does the street look like?")).toBeLessThan(out.indexOf("What does it rent for?"));
  });

  it("draws every image lazily with the alt text 'Street view near ADDRESS, YEAR' and a visible credit with author, licence and source link under each", () => {
    const year = new Date().getUTCFullYear();
    const figures = s.match(/<figure class="shot"[\s\S]*?<\/figure>/g) ?? [];
    expect(figures).toHaveLength(3);
    for (const f of figures) {
      expect(f).toContain('loading="lazy"');
      expect(f).toMatch(/<figcaption>[\s\S]*Photo by [\s\S]*<a [^>]*href="https:\/\/[^"]+"[^>]*>[^<]+<\/a>/);
      expect(f).toMatch(/Source<\/a>/);
    }
    expect(s).toMatch(new RegExp(`alt="Street view near [^"]+, ${year}"`));
    expect(text(s)).toContain("Photo by alice");
    expect(text(s)).toContain("CC BY-SA 4.0");
    expect(text(s)).toContain("Photo by Jane & Co");
    expect(s).toContain('href="https://www.mapillary.com/app/?pKey=s1"');
    expect(s).toContain('href="https://commons.wikimedia.org/wiki/File:Flinders_Street.jpg"');
    expect(text(s)).toContain("not photos of this property");
  });

  it("the images are not proxied and are not cropped", () => {
    for (const m of s.matchAll(/<img [^>]*src="([^"]+)"/g)) expect(m[1]).toMatch(/^https:\/\/(scontent\.example\.net|upload\.wikimedia\.org)\//);
  });

  it("an image missing its author, licence or source link is not drawn", () => {
    const base = { thumb_url: "https://x.example/a.jpg", source_url: "https://www.mapillary.com/app/?pKey=1", alt: "Street view near X, 2026", year: 2026, licence: "CC BY-SA 4.0" };
    const good = { ...base, id: "good", creator: "alice" };
    const markup = renderToStaticMarkup(
      <PhotosPanel
        payload={{
          street: [good, { ...base, id: "noauthor", creator: "" }, { ...base, id: "nolicence", creator: "x", licence: "" }, { ...base, id: "nolink", creator: "x", source_url: "" }, { ...base, id: "http", creator: "x", thumb_url: "http://x.example/a.jpg" }],
          places: [{ title: "No_author.jpg", thumb_url: "https://x.example/p.jpg", source_url: "https://commons.wikimedia.org/wiki/File:No_author.jpg", licence: "CC BY 4.0", alt: "x" }],
        }}
      />,
    );
    expect((markup.match(/<img /g) ?? []).length).toBe(1);
    expect(markup).toContain("Photo by alice");
  });
});

describe("the photos section when the vendors fail", () => {
  it("is a gap with the plain message and every other section still renders", async () => {
    const out = html(await model(UNAVAILABLE_VENDORS));
    const s = section(out, "L19-photos");
    expect(s).toContain('data-status="gap"');
    expect(text(s)).toContain("Photos are not available right now.");
    expect(s).not.toContain("<img");
    expect(section(out, "L20-places")).toContain('data-status="gap"');
    for (const id of ["L01-property", "L16-transport", "L17-schools", "L14-attribution"]) expect(section(out, id)).toContain('data-status="ok"');
  });

  it("no images at all reads 'No public photos found near this address.'", async () => {
    const out = html(await model(fakeVendors()));
    expect(text(section(out, "L19-photos"))).toContain("No public photos found near this address.");
  });
});

describe("the nearby places section", () => {
  let out: string;
  let s: string;
  beforeAll(async () => {
    out = html(await model(withData()));
    s = section(out, "L20-places");
  });

  it("is headed 'What is nearby?' right after transport, with straight-line distances labelled as such", () => {
    expect(s).toContain("What is nearby?");
    expect(s).toContain('data-status="ok"');
    expect(out.indexOf("What is nearby?")).toBeGreaterThan(out.indexOf("How do you get around?"));
    expect(out.indexOf("What is nearby?")).toBeLessThan(out.indexOf("Which schools is it zoned for?"));
    expect(text(s)).toContain("Distances are straight lines from the address point, not walking routes.");
    expect(text(s)).toContain("Corner Grocer");
    expect(text(s)).toMatch(/Supermarkets and groceries/);
  });

  it("carries the '© OpenStreetMap contributors' credit linked to the copyright page, and the sources list credits it too", () => {
    expect(s).toMatch(/<a href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>© OpenStreetMap contributors<\/a>/);
    const sources = section(out, "L14-attribution");
    expect(sources).toContain("© OpenStreetMap contributors");
    expect(sources).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(sources).toContain("Photos: Mapillary contributors, CC BY-SA 4.0");
    expect(sources).toContain("Images from Wikimedia Commons; each image carries its own author and licence");
  });

  it("lists an unnamed place only as unnamed, and has no rating, review or score wording", () => {
    expect(text(s)).toContain("A place with no name in OpenStreetMap");
    expect(text(s)).not.toMatch(/\b(rating|rated|reviews?|stars?|score|walkability|walk score)\b/i);
  });

  it("renders nothing for a payload without categories", () => {
    expect(renderToStaticMarkup(<PlacesPanel payload={{}} />)).toBe("");
  });
});
