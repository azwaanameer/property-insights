// Layer registry. Add a layer here and add its layer_config row in a migration.
import { L01Property } from "./L01-property";
import { L02Rent } from "./L02-rent";
import { L03Price } from "./L03-price";
import { L07History } from "./L07-history";
import { L09SuburbCompare } from "./L09-suburb-compare";
import type { LayerDef } from "./types";

export const LAYERS: LayerDef[] = [L01Property, L02Rent, L03Price, L07History, L09SuburbCompare];
