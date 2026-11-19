import { processAll } from "../_shared/pipeline.ts";
import { isAdmin, json, recordError } from "../_shared/util.ts";

// Called every minute by pg_cron: picks up anything the webhook's own
// background run did not finish, and retries failures.
Deno.serve(async (req) => {
  if (!isAdmin(req)) return json({ error: "forbidden" }, 403);
  try {
    return json(await processAll());
  } catch (e) {
    await recordError("process", e);
    return json({ error: "failed" }, 500);
  }
});
