// Layer registry. Add a layer here and add its layer_config row in a migration.
import { L01Property } from "./L01-property";
import type { LayerDef } from "./types";

export const LAYERS: LayerDef[] = [L01Property];
