import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

// Local development on plain Node, without the Cloudflare plugin. `vite dev` with the Cloudflare plugin runs inside workerd,
// which crashes on some Windows machines (see deferred-work.md). Use `npm run dev:node`. Production still builds with vite.config.ts.
export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
});
