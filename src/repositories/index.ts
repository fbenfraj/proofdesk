// src/repositories — DB port (AD-2, AD-10). The ONLY code allowed to touch
// Drizzle/SQLite. Swap-seam: SQLite now -> EU-sovereign Postgres later, behind
// this interface. Connection, migrations, and the write-time honesty guards
// (AD-9, AD-18) live here. Authored in Story 1.3.
export * from "./db";
export * from "./migrate";
export * from "./repository";
