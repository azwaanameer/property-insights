import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import pineCss from "../render/pine.css?url";
import { ReportMessage } from "../render/report/ReportView";
import { PAGE_NOT_FOUND } from "../site/copy";
import { SvgSprite } from "../site/Icon";
import { RouterOpenReport } from "../site/open-report";
import { SiteFooter } from "../site/SiteFooter";
import { SiteNav } from "../site/SiteNav";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VicProp property insights" },
      {
        name: "description",
        content: "Due diligence on any Victorian address, in minutes: land size, rent, price, planning, flood and bushfire risk, and for flats the building itself.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONTS },
      { rel: "stylesheet", href: pineCss },
    ],
  }),
  component: RootComponent,
  // A path that matches no page gets a generic "Page not found" with a link home and a search box, not a blank page.
  notFoundComponent: () => (
    <main id="main">
      <ReportMessage kind="not_found" title={PAGE_NOT_FOUND.title} message={PAGE_NOT_FOUND.text} />
    </main>
  ),
});

function RootComponent() {
  return (
    <RootDocument>
      <RouterOpenReport>
        <div className="site" id="site">
          <a className="skip" href="#main">Skip to the content</a>
          <SiteNav />
          <Outlet />
          <SiteFooter />
        </div>
      </RouterOpenReport>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <SvgSprite />
        {children}
        <Scripts />
      </body>
    </html>
  );
}
