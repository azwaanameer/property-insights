// Vitest setup: no test may reach the network. The global fetch fails loudly unless a test replaces it with a fake (vi.stubGlobal or a passed-in
// fetch). A report assembled with the live vendor adapters therefore turns its photo and place sections into gaps instead of calling out.
const blocked = async (input: unknown): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : ((input as { url?: string })?.url ?? "");
  throw new Error(`network is disabled in tests (fetch ${url.split("?")[0]})`);
};
globalThis.fetch = blocked as typeof fetch;
