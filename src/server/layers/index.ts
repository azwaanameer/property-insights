// Layer registry. Add a layer here and add its layer_config row in a migration.
// Order is the order of the report page. L06, L13 and L14 are synthesis layers: they run after the others and read their results (L14 also reads L06's).
import { L01Property } from "./L01-property";
import { L02Rent } from "./L02-rent";
import { L03Price } from "./L03-price";
import { L04Drivers } from "./L04-drivers";
import { L05Return } from "./L05-return";
import { L08Supply } from "./L08-supply";
import { L10Screener } from "./L10-screener";
import { L11Building } from "./L11-building";
import { L06Shortstay } from "./L06-shortstay";
import { L07History } from "./L07-history";
import { L09SuburbCompare } from "./L09-suburb-compare";
import { L13Questions } from "./L13-questions";
import { L14Attribution } from "./L14-attribution";
import { L15Conditions } from "./L15-conditions";
import { L16Transport } from "./L16-transport";
import { L17Schools } from "./L17-schools";
import { L18Safety } from "./L18-safety";
import { L19Photos } from "./L19-photos";
import { L20Places } from "./L20-places";
import { L21Sales } from "./L21-sales";
import type { LayerDef } from "./types";

export const LAYERS: LayerDef[] = [
  L01Property,
  L19Photos,
  L02Rent,
  L03Price,
  L21Sales,
  L04Drivers,
  L16Transport,
  L20Places,
  L17Schools,
  L18Safety,
  L11Building,
  L08Supply,
  L05Return,
  L06Shortstay,
  L07History,
  L09SuburbCompare,
  L10Screener,
  L15Conditions,
  L13Questions,
  L14Attribution,
];
