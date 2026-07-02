import { Hono } from "hono";
import { z } from "zod";
import { DEFAULT_SNOOZE_DAYS } from "@maintenance-reminder/shared";
import * as itemsDb from "../db/queries.js";
import { addDaysToDateString, todayJstDateString } from "../lib/date.js";
import { badRequest, notFound } from "../lib/errors.js";
import type { HonoEnv } from "../types.js";

const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100).nullable().optional(),
  intervalDays: z.number().int().positive(),
  notifyDaysBefore: z.number().int().min(0).optional(),
  memo: z.string().max(2000).nullable().optional(),
  lastDoneAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().max(100).nullable().optional(),
  intervalDays: z.number().int().positive().optional(),
  notifyDaysBefore: z.number().int().min(0).optional(),
  memo: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

const snoozeSchema = z.object({
  days: z.number().int().positive().max(365).optional(),
});

export const itemsRouter = new Hono<HonoEnv>();

itemsRouter.get("/", async (c) => {
  const includeInactive = c.req.query("includeInactive") === "true";
  const items = await itemsDb.listItems(c.env.DB, includeInactive);
  return c.json(items);
});

itemsRouter.post("/", async (c) => {
  const parsed = createItemSchema.safeParse(await c.req.json());
  if (!parsed.success) throw badRequest(parsed.error.message);
  const input = parsed.data;
  const lastDoneAt = input.lastDoneAt ?? todayJstDateString();
  const item = await itemsDb.createItem(c.env.DB, {
    id: crypto.randomUUID(),
    name: input.name,
    category: input.category ?? null,
    intervalDays: input.intervalDays,
    notifyDaysBefore: input.notifyDaysBefore ?? 0,
    memo: input.memo ?? null,
    lastDoneAt,
    nextDueAt: addDaysToDateString(lastDoneAt, input.intervalDays),
  });
  return c.json(item, 201);
});

itemsRouter.get("/:id", async (c) => {
  const item = await itemsDb.getItem(c.env.DB, c.req.param("id"));
  if (!item) throw notFound("Item not found");
  return c.json(item);
});

itemsRouter.patch("/:id", async (c) => {
  const parsed = updateItemSchema.safeParse(await c.req.json());
  if (!parsed.success) throw badRequest(parsed.error.message);
  const item = await itemsDb.updateItem(c.env.DB, c.req.param("id"), parsed.data);
  if (!item) throw notFound("Item not found");
  return c.json(item);
});

itemsRouter.delete("/:id", async (c) => {
  await itemsDb.deleteItem(c.env.DB, c.req.param("id"));
  return c.body(null, 204);
});

itemsRouter.post("/:id/complete", async (c) => {
  const item = await itemsDb.completeItem(c.env.DB, c.req.param("id"), todayJstDateString());
  if (!item) throw notFound("Item not found");
  return c.json(item);
});

itemsRouter.post("/:id/snooze", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = snoozeSchema.safeParse(body);
  if (!parsed.success) throw badRequest(parsed.error.message);
  const days = parsed.data.days ?? DEFAULT_SNOOZE_DAYS;
  const item = await itemsDb.snoozeItem(c.env.DB, c.req.param("id"), days);
  if (!item) throw notFound("Item not found");
  return c.json(item);
});
