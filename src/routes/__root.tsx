import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

// Midnight tokens from DESIGN.md. Minimal on purpose: the full renderer arrives with the free-report step.
const CSS = `
:root{--canvas:#0A101C;--surface:#111A2B;--surface-2:#16213A;--ink:#E8EDF6;--ink-muted:#9BA9C2;--line:#243350;--accent:#E2B65C;
--observed:#6DD3A0;--observed-wash:#12302A;--estimated:#F0BE5A;--estimated-wash:#33290E;--unknown:#B9A9F0;--unknown-wash:#272047;--conflict:#FF8F85;--conflict-wash:#3B1C1A}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:16px/1.5 Inter,system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.1rem;margin:0}
.muted{color:var(--ink-muted)}.row{display:flex;gap:8px}input{flex:1;min-width:0;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit}
button{padding:12px 16px;border-radius:10px;border:0;background:var(--accent);color:#1A1405;font:inherit;font-weight:600;cursor:pointer}
ul.list{list-style:none;margin:8px 0 0;padding:0}ul.list li button{width:100%;text-align:left;background:var(--surface);color:var(--ink);border:1px solid var(--line);font-weight:400;margin-top:6px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;margin-top:16px}
.note{margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--estimated-wash);color:var(--estimated)}
.err{margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--conflict-wash);color:var(--conflict)}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:12px 0 0}dt{color:var(--ink-muted)}dd{margin:0;overflow-wrap:anywhere}
.chip{display:inline-block;margin-left:8px;padding:0 8px;border-radius:999px;font-size:.75rem}
.Observed{background:var(--observed-wash);color:var(--observed)}.Estimated{background:var(--estimated-wash);color:var(--estimated)}
.Unknown{background:var(--unknown-wash);color:var(--unknown)}.Conflict{background:var(--conflict-wash);color:var(--conflict)}
.locked{filter:blur(6px);user-select:none}
`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VicProp property insights" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
