// The one category a place belongs to, by its OpenStreetMap tags. The data build (pipeline/ingest/osm-places-extract.py, `category_of`)
// applies the same rule when it loads places, and src/server/layers/place-category.test.ts runs both over the same samples, so the layer
// and the loaded table agree. Layers do not import from pipeline, so the rule is written out here again.
import type { PlaceCategory } from "../../repos/place";

export type PlaceCategoryKey = PlaceCategory;

/** Order matters only for an element tagged with more than one (it counts once). */
export function categoryOf(tags: Record<string, unknown>): PlaceCategoryKey | null {
  const shop = tags.shop;
  const amenity = tags.amenity;
  const leisure = tags.leisure;
  if (shop === "supermarket" || shop === "convenience" || shop === "greengrocer" || shop === "bakery") return "groceries";
  if (amenity === "cafe" || amenity === "restaurant") return "food";
  if (leisure === "park" || leisure === "playground") return "parks";
  if (amenity === "pharmacy" || amenity === "doctors" || amenity === "clinic" || amenity === "hospital") return "medical";
  if (amenity === "gym" || leisure === "fitness_centre") return "fitness";
  if (amenity === "library") return "library";
  return null;
}
