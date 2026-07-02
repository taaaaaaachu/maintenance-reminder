import { Hono } from "hono";
import * as itemsDb from "../db/queries.js";
import { getOrCreateIcsFeedToken } from "../ics/token.js";
import { generateIcsFeed } from "../ics/generate.js";
import type { HonoEnv } from "../types.js";

export const feedRouter = new Hono<HonoEnv>();

feedRouter.get("/:tokenFile", async (c) => {
  const requestedToken = c.req.param("tokenFile").replace(/\.ics$/, "");
  const validToken = await getOrCreateIcsFeedToken(c.env.DB);

  if (requestedToken !== validToken) {
    return c.notFound();
  }

  const items = await itemsDb.listItems(c.env.DB, false);
  const domain = new URL(c.req.url).hostname;
  const ics = generateIcsFeed(items, domain);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="maintenance-reminder.ics"',
    },
  });
});
