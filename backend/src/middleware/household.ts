import { createMiddleware } from "hono/factory";
import { getHouseholdIdByEmail } from "../db/households.js";
import { unauthorized } from "../lib/errors.js";
import type { HonoEnv } from "../types.js";
import { resolveUserEmail } from "./accessAuth.js";

export const householdMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const resolvedEmail = await resolveUserEmail(c);

  if (!resolvedEmail) throw unauthorized("認証情報がありません");

  const householdId = await getHouseholdIdByEmail(c.env.DB, resolvedEmail);
  if (!householdId) throw unauthorized("この世帯は登録されていません。管理者に問い合わせてください");

  c.set("householdId", householdId);
  c.set("actorEmail", resolvedEmail);
  await next();
});
