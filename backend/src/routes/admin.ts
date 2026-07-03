import { Hono } from "hono";
import { z } from "zod";
import * as householdsDb from "../db/households.js";
import * as invitesDb from "../db/invites.js";
import { badRequest, notFound, unauthorized } from "../lib/errors.js";
import { daysFromNowIso } from "../lib/date.js";
import type { HonoEnv } from "../types.js";

const INVITE_EXPIRES_IN_DAYS = 7;

const createHouseholdSchema = z.object({
  name: z.string().min(1).max(100),
});

const addMemberSchema = z.object({
  email: z.string().email(),
  displayName: z.string().max(50).nullable().optional(),
});

export const adminRouter = new Hono<HonoEnv>();

adminRouter.use("*", async (c, next) => {
  const email = c.req.header("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (!email || email !== c.env.ADMIN_EMAIL.trim().toLowerCase()) {
    throw unauthorized("管理者のみアクセスできます");
  }
  await next();
});

adminRouter.get("/households", async (c) => {
  const households = await householdsDb.listHouseholds(c.env.DB);
  return c.json(households);
});

adminRouter.post("/households", async (c) => {
  const parsed = createHouseholdSchema.safeParse(await c.req.json());
  if (!parsed.success) throw badRequest(parsed.error.message);

  const id = crypto.randomUUID();
  await householdsDb.createHousehold(c.env.DB, id, parsed.data.name);
  const household = await householdsDb.getHousehold(c.env.DB, id);
  return c.json(household, 201);
});

adminRouter.post("/households/:id/members", async (c) => {
  const householdId = c.req.param("id");
  const household = await householdsDb.getHousehold(c.env.DB, householdId);
  if (!household) throw notFound("household not found");

  const parsed = addMemberSchema.safeParse(await c.req.json());
  if (!parsed.success) throw badRequest(parsed.error.message);

  const member = await householdsDb.addHouseholdMember(
    c.env.DB,
    householdId,
    parsed.data.email.trim().toLowerCase(),
    parsed.data.displayName ?? null,
  );
  return c.json(member, 201);
});

adminRouter.post("/households/:id/invites", async (c) => {
  const householdId = c.req.param("id");
  const household = await householdsDb.getHousehold(c.env.DB, householdId);
  if (!household) throw notFound("household not found");

  const code = await invitesDb.createInvite(c.env.DB, householdId, daysFromNowIso(INVITE_EXPIRES_IN_DAYS));
  return c.json({ code }, 201);
});
