// Layer registry. Add a layer here and add its layer_config row in a migration.
// Order is the order of the report page. L13 is a synthesis layer: it runs after the others and reads their results.
import { L01Property } from "./L01-property";
import { L02Rent } from "./L02-rent";
import { L03Price } from "./L03-price";
import { L05Return } from "./L05-return";
import { L07History } from "./L07-history";
import { L09SuburbCompare } from "./L09-suburb-compare";
import { L13Questions } from "./L13-questions";
import { L15Conditions } from "./L15-conditions";
import type { LayerDef } from "./types";

export const LAYERS: LayerDef[] = [L01Property, L02Rent, L03Price, L05Return, L07History, L09SuburbCompare, L15Conditions, L13Questions];
