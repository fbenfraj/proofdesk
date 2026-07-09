// Shared column factories so the honesty columns are declared identically
// everywhere (AD-3, AD-9). App-generated string IDs; UTC ISO-8601 timestamps
// stored as TEXT.

import { text } from "drizzle-orm/sqlite-core";
import { DATA_ORIGIN } from "./enums";

/** App-generated primary key (Node `crypto.randomUUID()` at insert time). */
export const pk = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** `data_origin`, inherited immutably from the Campaign at write time (AD-9).
 *  The value is stamped by the single derivation site in the repository layer;
 *  the column itself is non-null on every exportable child row. */
export const dataOriginCol = () => text("data_origin", { enum: DATA_ORIGIN }).notNull();
