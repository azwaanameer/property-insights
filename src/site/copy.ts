// All site copy. Wording, section order and numbers come from the approved Pine mockup
// (_bmad-output/planning-artifacts/ux-designs/ux-property-insights-2026-11-11/mockups/pine-site.artifact.html).
// Prices are proposals. Step 2c (checkout) reads PRICES and the refund line from here.

import { ONE_REPORT, PRO_MONTHLY } from "../config/pricing";

export const BRAND = "VicProp";

/** Prices are proposals, in whole Australian dollars including GST. Every price in the copy is built from this. */
export const PRICES = { oneReport: ONE_REPORT.amount_cents / 100, proMonthly: PRO_MONTHLY.amount_cents / 100 };

/** The copy that states a price, built from one price list so the page can never disagree with itself. */
export function priceCopy(prices: { oneReport: number; proMonthly: number }) {
  const one = "$" + prices.oneReport;
  const pro = "$" + prices.proMonthly;
  return {
    one,
    pro,
    heroNote: `Free preview in seconds. Full report ${one}, GST included.`,
    unlockBarTitle: `Unlock the full report and the PDF. ${one} for this address, GST included.`,
    goPro: `Go Pro, ${pro} a month`,
  };
}
const PRICE_COPY = priceCopy(PRICES);

export const NAV_LINKS = [
  { id: "who", label: "Who it is for" },
  { id: "sections", label: "Sections" },
  { id: "samples", label: "Samples" },
  { id: "pricing", label: "Pricing" },
] as const;

export const NAV_CTA = "Get the report";

export const SEARCH = {
  label: "Victorian property address",
  placeholder: "Enter a Victorian address",
  submit: "Get the report",
  empty: "Enter a Victorian address to start.",
  busy: "Looking up that address.",
  network: "Could not reach the server. Try again in a moment.",
  notFound: "No address matched. Check the street number and suburb, or pick a suggestion.",
  sampleNotFound: "We could not find that sample address right now. Try typing an address instead.",
  pickOne: "More than one address matches. Pick one below.",
};

export const HERO = {
  kicker: "Victorian property reports",
  titleBefore: "Due diligence on any ",
  titleEm: "Victorian address",
  titleAfter: ", in minutes.",
  lede: "Land size, rent, price, planning, flood and bushfire risk, and for flats the building itself. One report per address, ready as a PDF.",
  trySample: "Try a sample:",
  note: PRICE_COPY.heroNote,
  steps: ["Enter an address", "Read the preview", "Unlock the full report and PDF"],
};

/** Sample addresses. The text is resolved through the resolve endpoint, never hard-coded to a pid. */
export const SAMPLES = {
  house: { text: "14 Lucinda Lane, Cranbourne North", button: "14 Lucinda Lane, Cranbourne North" },
  flat: { text: "310/628 Flinders St, Docklands", button: "310/628 Flinders St, Docklands" },
};

/** The static example card in the hero. Marketing content, labelled Example, never fetched. */
export const HERO_CARD = {
  ariaLabel: "Preview of a report",
  exampleLabel: "Example",
  matched: "Matched to property",
  kind: "House · free preview",
  photoAlt: "A modern two-storey townhouse in Victoria",
  photoTag: "Example street photo",
  title: "14 Lucinda Lane",
  place: "Cranbourne North, Victoria",
  tiles: [
    { cap: "Bed · bath · car", value: "3 · 2 · 2", chip: "rep", chipLabel: "Reported" },
    { cap: "Block", value: "447 m²", chip: "obs", chipLabel: "Observed" },
    { cap: "Floor area", value: "138 m²", chip: "rep", chipLabel: "Reported" },
    { cap: "Built", value: "2016", chip: "rep", chipLabel: "Reported" },
  ],
  rows: [
    { text: "What does it rent for?", free: true },
    { text: "Which schools is it zoned for?", free: true },
    { text: "What has it sold for?", free: false },
    { text: "Where else could you invest?", free: false },
  ],
  open: "Open the sample",
  foot: "Locked sections show what they settle, then unlock.",
};

export const WHO = {
  kicker: "Who it is for",
  title: "Built around the decision you are making.",
  lede: "Four buyers, four different questions.",
  cards: [
    {
      img: "agent",
      alt: "A brick house on a suburban street in Sunshine, Victoria",
      title: "Buyer’s agents and advisers",
      quote: "“Need the same brief for every client?”",
      points: [
        "A consistent report on every address, as an A4 PDF with your logo on Pro",
        "Planning, flood, bushfire and heritage in plain English",
        "A return calculator set to your client’s numbers",
      ],
    },
    {
      img: "investor",
      alt: "Victorian-era terrace houses in inner Melbourne",
      title: "Investors",
      quote: "“Does the rent back up the price?”",
      points: [
        "Suburb rent and price side by side, with gross yield",
        "New apartment supply planned nearby",
        "A conditions rating for Victorian unit suburbs",
      ],
    },
    {
      img: "short",
      alt: "A furnished apartment living room",
      title: "Short-stay operators",
      quote: "“Is this building worth running?”",
      points: [
        "How many flats are in the building",
        "Whether short-stay listings are active there",
        "Income shown only when it is 40% or more above a lease",
      ],
    },
    {
      img: "home",
      alt: "A weatherboard workers cottage with a picket fence",
      title: "Home buyers",
      quote: "“What should I ask before I sign?”",
      points: [
        "Block size, school zones, transport and what is nearby",
        "Flood, bushfire and heritage flags",
        "Questions to put to the agent and the owners corporation",
      ],
    },
  ],
};

/** Who a catalogue section is written for: "" every property, "H" houses only, "F" flats only. */
export type SectionFor = "" | "H" | "F";
export interface CatalogueEntry {
  title: string;
  /** True for a Full report (paid) section. */
  full: boolean;
  only: SectionFor;
}

/** One merged list for houses and flats: 18 sections for both, 2 for houses only, 5 for flats only. */
export const CATALOGUE: { group: string; items: CatalogueEntry[] }[] = [
  {
    group: "The property",
    items: [
      { title: "What is this property?", full: false, only: "" },
      { title: "Where is it?", full: false, only: "" },
      { title: "How big is the block?", full: false, only: "" },
      { title: "What does it rent for?", full: false, only: "" },
      { title: "What is it worth?", full: false, only: "" },
    ],
  },
  {
    group: "Living here",
    items: [
      { title: "What is the suburb known for?", full: false, only: "" },
      { title: "Who lives here?", full: false, only: "" },
      { title: "Which schools is it zoned for?", full: false, only: "" },
      { title: "How do you get around?", full: false, only: "" },
      { title: "What is nearby day to day?", full: false, only: "" },
    ],
  },
  {
    group: "Risks, rules and the building",
    items: [
      { title: "What risks and rules apply to the land?", full: false, only: "" },
      { title: "What does the planning say?", full: false, only: "" },
      { title: "What do we know about the building?", full: true, only: "F" },
      { title: "What should you ask next?", full: false, only: "" },
    ],
  },
  {
    group: "Price and value",
    items: [
      { title: "What has it sold for?", full: true, only: "H" },
      { title: "What makes it worth more or less?", full: true, only: "F" },
      { title: "How have prices moved?", full: false, only: "" },
      { title: "How does the suburb compare with nearby ones?", full: false, only: "" },
    ],
  },
  {
    group: "The investment case",
    items: [
      { title: "What would the return be?", full: false, only: "" },
      { title: "Could it work as an Airbnb?", full: true, only: "F" },
      { title: "How favourable are the suburb's conditions?", full: true, only: "F" },
      { title: "What new apartments are coming?", full: true, only: "F" },
    ],
  },
  {
    group: "Beyond this address",
    items: [
      { title: "What does the suburb profile look like?", full: false, only: "H" },
      { title: "Where else could you invest?", full: true, only: "" },
      { title: "Where did all this come from?", full: false, only: "" },
    ],
  },
];

export const SECTIONS = {
  kicker: "Sections",
  title: "What is in the report.",
  lede: "A house report has 20 sections and a flat report has 23. Free sections open straight away. The rest are marked Full report.",
  note: "18 sections apply to every property. Tags mark the 2 sections written for houses and the 5 written for flats. Some sections appear only when they apply, such as short-stay income.",
  free: "Free",
  fullReport: "Full report",
  houses: "Houses",
  flats: "Flats",
};

export const SAMPLES_SECTION = {
  kicker: "Sample reports",
  title: "See a finished report.",
  lede: "A house, and a flat in a 733-flat tower. Free sections are readable and paid ones are blurred, just as you would see them.",
  open: "Open the sample",
  photoTag: "Example photo",
  cards: [
    {
      key: "house" as const,
      img: "house",
      alt: "A modern two-storey townhouse in Victoria",
      tag: "House · 20 sections",
      date: "as at 15 Nov 2026",
      title: "14 Lucinda Lane, Cranbourne North",
      text: "3 bed, 2 bath, 2 car on a 447 m² block, built 2016. The sale history is the full-report part.",
    },
    {
      key: "flat" as const,
      img: "flat",
      alt: "Apartment buildings at Docklands, Melbourne",
      tag: "Flat · 23 sections",
      date: "as at 15 Nov 2026",
      title: "310/628 Flinders St, Docklands",
      text: "A flat in Docklands East Tower, one of 733. Includes the building and the new apartments planned nearby.",
    },
  ],
};

export const PRICING = {
  kicker: "Pricing",
  title: "Priced by the address, or by the pipeline.",
  lede: "Every address has a free preview. Prices are in Australian dollars and include GST.",
  one: {
    cap: "One report",
    price: PRICE_COPY.one,
    per: "per address",
    points: ["All 20 or 23 sections for the address", "A4 PDF to keep and share", "Reopen it for 30 days"],
    cta: "Get the report",
    fine: "One payment. Nothing recurring.",
  },
  pro: {
    cap: "Pro, for agents, advisers and operators",
    price: PRICE_COPY.pro,
    per: "a month",
    points: ["Full reports across your client addresses", "Your logo on the A4 PDF", "Suburb screener across Victoria"],
    cta: "Start Pro",
    fine: "Renews monthly. Cancel any time.",
  },
};

export const FAQ = {
  kicker: "Questions",
  title: "Before you rely on it.",
  items: [
    {
      q: "Which addresses are covered?",
      a: "Victoria only for now: houses, townhouses and flats. Other states are not covered yet.",
    },
    {
      q: "What do I get before I pay?",
      a: "A free preview of every address. It covers the property basics, block size, rent and price, school zones, transport, what is nearby, and the planning, flood, bushfire and heritage flags. No account is needed. Sections marked Full report unlock with payment.",
    },
    {
      q: "Is the conditions rating a price forecast?",
      a: "No. It ranks Victorian apartment suburbs on three Census markers. Across past test windows, top-fifth suburbs out-grew bottom-fifth ones 74 to 80% of the time, so roughly one in four did not. It is not shown for houses or other states.",
    },
    {
      q: "Why is there no short-stay section in my report?",
      a: "It appears only when our estimate is at least 40% above the long-term rent for the same home. Most houses do not clear that, so the report leaves it out and says so. We do not check whether short stays are allowed in the building. Ask the owners corporation.",
    },
    {
      q: "Does it replace an inspection, strata documents or a buyer’s agent?",
      a: "No. It is general information, not financial, legal, planning or valuation advice. Rooms, floor area and past sales of a single home come from public listings, are marked Reported, and are not checked against the title. Use the report to decide what to ask your agent, conveyancer, inspector and owners corporation.",
    },
    {
      q: "What if the report does not load after I pay?",
      a: "We refund you in full. This does not limit your rights under the Australian Consumer Law.",
    },
  ],
};

export const CLOSING = {
  title: "Walk into the next inspection knowing the address.",
  text: "Enter a Victorian address for a free preview.",
};

export const FOOTER = {
  workingName: "is a working name.",
  disclaimer:
    "General information only. Not financial, legal, planning or valuation advice. Some details come from public listings and are not checked against the title.",
  // Only the sources the built layers use. Add a source here when a layer that uses it ships.
  data: "Contains data from Geoscape G-NAF, Valuer-General Victoria, Homes Victoria and the Australian Bureau of Statistics, used under Creative Commons Attribution licences.",
};

// ----- Report page -----

/** The question each built layer answers, as the catalogue words it. Unknown layers fall back to their own title. */
export const SECTION_QUESTIONS: Record<string, string> = {
  "L01-property": "What is this property?",
  "L02-rent": "What does it rent for?",
  "L03-price": "What is it worth?",
  "L07-history": "How have prices moved?",
  "L09-suburb-compare": "How does the suburb compare with nearby ones?",
};

/** Plain names for source ids shown under figures. Unknown ids are shown as they are. */
export const SOURCE_NAMES: Record<string, string> = {
  gnaf: "Geoscape G-NAF",
  gnaf_neighbours: "Geoscape G-NAF",
  abs_asgs_2021: "ABS suburbs 2021",
  abs_census_2021: "ABS Census 2021",
  abs_seifa_2021: "ABS SEIFA 2021",
  vgv_medians: "Valuer-General Victoria",
  homes_victoria_rents: "Homes Victoria",
};

export const REPORT = {
  back: "Back to the site",
  generatingKicker: "Building the report",
  generatingTitle: "Putting your report together",
  generatingSteps: [
    "Matching the address to the national address file",
    "Reading rent, price and suburb figures",
    "Reading the price history",
    "Comparing with nearby suburbs",
    "Writing the plain-English answers",
  ],
  matchedUnit: "Matched to unit",
  matchedBuilding: "Matched to building only",
  generatedOn: "Report generated",
  free: "Free",
  fullReport: "Full report",
  unlocked: "Unlocked",
  notAvailable: "Not available",
  lockTitle: "Included in the full report",
  unlock: "Unlock this address",
  unlockBarTitle: PRICE_COPY.unlockBarTitle,
  unlockBarText: "Or go Pro for every client address. Sections marked Full report are locked.",
  goPro: PRICE_COPY.goPro,
  retry: "Try again",
  gap: "Not available yet",
  notCovered: "Not covered",
  error: "Could not load",
  thinNote: "* rests on fewer than 10 sales or lettings, or the ABS flags a small population.",
  sideBySide: "Shown side by side only; the positions above are not added up.",
  historyCaption: "Annual median price",
  compareCaption: "Side by side",
  thisSuburb: "(this suburb)",
};

export const NOT_FOUND = {
  title: "We could not find that address.",
  text: "Check the street number and suburb, or search again.",
  searchLabel: "Search another address",
};

/** A path that matches no page at all (the report route has its own wording, NOT_FOUND). */
export const PAGE_NOT_FOUND = {
  title: "Page not found",
  text: "That page does not exist. Go back to the site, or search for an address.",
};

export const NOT_COVERED = {
  title: "Only Victoria is covered for now.",
  text: "This address is outside Victoria, so there is no report for it yet.",
};

export const LOAD_FAILED = {
  title: "The report did not load.",
  text: "Something went wrong on our side. Search again in a moment.",
};

// ----- Checkout and confirmation (step 2c) -----

export const CHECKOUT = {
  kicker: "Checkout",
  title: "Unlock the full report",
  back: "Back to the report",
  loading: "Loading your order.",
  planLegend: "Choose a plan",
  one: { name: "This address", detail: (days: number) => `The full report and the PDF for this address. Reopen it for ${days} days.` },
  pro: { name: "Pro, monthly", detail: "Full reports for every address while your plan is active. Renews monthly." },
  emailLabel: "Your email",
  emailHelp: "Recorded with your purchase. No email is sent yet and there is no account to create.",
  emailInvalid: "Enter a valid email address.",
  submit: "Continue to payment",
  submitDev: "Unlock now (no payment)",
  busy: "Starting your checkout.",
  summaryTitle: "Order summary",
  total: "Total",
  gstIncluded: (gst: string) => `Includes GST of ${gst}`,
  oneLine: (address: string) => `Full report: ${address}`,
  proLine: "VicProp Pro, monthly",
  refund: "If the report does not load after you pay, we refund you in full. This does not limit your rights under the Australian Consumer Law.",
  devBanner: "Dev unlock, no payment taken",
  devBannerText: "This is a development build. Continuing unlocks the report for free and takes no payment.",
  notConfigured: "Payments are not set up yet, so nothing can be bought right now.",
  nothingToUnlock: "There is nothing to unlock for this address yet. Every section you can see is already free.",
  failed: "We could not start the checkout. Nothing was charged. Try again in a moment.",
  network: "Could not reach the server. Try again in a moment.",
  notCovered: "This address is outside Victoria, so there is no report to unlock.",
};

export const DONE = {
  checking: { title: "Confirming your payment", text: "This usually takes a few seconds. Keep this page open." },
  paidOne: {
    title: "Payment confirmed",
    text: (days: number) => `Your full report is unlocked in this browser for ${days} days.`,
    action: "Open the report",
  },
  paidPro: {
    title: "Pro is active",
    text: (until: string) => `Every address is unlocked in this browser until ${until}, and renews while your plan continues.`,
    action: "Search an address",
  },
  keep: "Your access is saved in this browser and no email is sent, so keep this page's address. If you clear your cookies or switch browser you cannot reopen the report until sign-in is added.",
  slow: {
    title: "Still waiting for the payment to confirm",
    text: "Your payment may still be processing. Check again in a minute. If you were charged and the report stays locked, we refund you in full.",
    action: "Check again",
  },
  refunded: { title: "This purchase was refunded", text: "Access for this purchase has ended." },
  expired: { title: "This purchase has expired", text: "The access period has ended. You can buy the report again." },
  failed: { title: "This checkout did not complete", text: "Nothing was charged. You can start again." },
  unknown: { title: "We could not find that purchase", text: "Check the address of this page, or start again from the report." },
  missing: { title: "No purchase to confirm", text: "Open this page from the link at the end of checkout." },
  error: { title: "We could not check your payment", text: "Something went wrong on our side. Try again in a moment.", action: "Try again" },
  home: "Back to the site",
};
