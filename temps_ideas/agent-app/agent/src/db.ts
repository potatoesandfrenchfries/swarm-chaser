import { sqlite } from "@flue/runtime/node";

// Conversations survive a restart because they live here. Swap in another
// adapter (Postgres, libSQL, ...) when one host's SQLite file is not enough:
// https://flueframework.com/docs/guide/database/
export default sqlite("./data/flue.db");
