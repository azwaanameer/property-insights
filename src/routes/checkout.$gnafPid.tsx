import { createFileRoute } from "@tanstack/react-router";
import { CheckoutPage } from "../site/CheckoutPage";
import type { PlanChoice } from "../site/checkout-api";

export const Route = createFileRoute("/checkout/$gnafPid")({
  // ?plan=pro opens on the Pro plan (the report's unlock bar links there). Anything else opens on this address.
  validateSearch: (search: Record<string, unknown>): { plan: PlanChoice; unit?: string } => ({
    plan: search.plan === "pro" ? "pro" : "one",
    unit: typeof search.unit === "string" && /^[0-9A-Za-z]{1,8}$/.test(search.unit) ? search.unit : undefined,
  }),
  head: () => ({ meta: [{ title: "Checkout | VicProp" }, { name: "robots", content: "noindex" }] }),
  component: CheckoutRoute,
});

function CheckoutRoute() {
  const { gnafPid } = Route.useParams();
  const { plan, unit } = Route.useSearch();
  return <CheckoutPage pid={gnafPid} unit={unit} initialPlan={plan} />;
}
