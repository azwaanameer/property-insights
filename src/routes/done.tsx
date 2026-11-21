import { createFileRoute } from "@tanstack/react-router";
import { DonePage } from "../site/DonePage";

export const Route = createFileRoute("/done")({
  // The purchase id in the return link is unguessable and is how this browser proves it made the purchase.
  validateSearch: (search: Record<string, unknown>): { purchase?: string } => ({
    purchase: typeof search.purchase === "string" && /^pur_[0-9a-f]{32}$/.test(search.purchase) ? search.purchase : undefined,
  }),
  // The purchase id is in this page's address, so it must not leak through the Referer header.
  head: () => ({ meta: [{ title: "Payment | VicProp" }, { name: "robots", content: "noindex" }, { name: "referrer", content: "no-referrer" }] }),
  component: DoneRoute,
});

function DoneRoute() {
  const { purchase } = Route.useSearch();
  return <DonePage purchaseId={purchase} />;
}
