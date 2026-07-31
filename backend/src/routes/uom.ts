import { Hono } from "hono";
import { unitOfMeasureSchema, uomConvertSchema } from "@backend/lib/validations";
import { listUnits, createUnit, deleteUnit, convert } from "@backend/services/uom";
import { logActivity } from "@backend/lib/activity";
import { areaForWrite } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created } from "@backend/lib/http";

// The units-of-measure registry is master-data administration for inventory —
// gated by the same inventory permissions as the product-attribute catalog.
export const units = new Hono();

/** All units defined for the entity, ordered by dimension then code. */
units.get("/", requireAuth, requirePermission("inventory:read"), async (c) => {
  return ok(c, await listUnits(areaForWrite(c.get("user"))));
});

/** Convert a quantity between two units of the same dimension. */
units.post("/convert", requireAuth, requirePermission("inventory:read"), async (c) => {
  const user = c.get("user");
  const body = uomConvertSchema.parse(await c.req.json());
  return ok(c, await convert(areaForWrite(user), body.qty, body.from, body.to));
});

/** Define a new unit. */
units.post("/", requireAuth, requirePermission("inventory:write"), async (c) => {
  const user = c.get("user");
  const body = unitOfMeasureSchema.parse(await c.req.json());
  const unit = await createUnit({
    dataAreaId: areaForWrite(user),
    code: body.code,
    name: body.name,
    dimension: body.dimension,
    symbol: body.symbol || null,
    factorToBase: body.factorToBase,
    isBase: body.isBase,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `UnitOfMeasure:${unit.id}` });
  return created(c, unit);
});

/** Delete a unit. */
units.delete("/:id", requireAuth, requirePermission("inventory:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await deleteUnit(areaForWrite(user), id);
  await logActivity({ userId: user.id, action: "DELETE", target: `UnitOfMeasure:${id}` });
  return ok(c, { id });
});
