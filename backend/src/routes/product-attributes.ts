import { Hono } from "hono";
import { productAttributeSchema } from "@backend/lib/validations";
import { listAttributes, createAttribute, deleteAttribute } from "@backend/services/product-attributes";
import { logActivity } from "@backend/lib/activity";
import { areaForWrite } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created } from "@backend/lib/http";

// The attribute catalog is inventory administration — gated by inventory perms.
export const productAttributes = new Hono();

/** All defined product attributes for the entity. */
productAttributes.get("/", requireAuth, requirePermission("inventory:read"), async (c) => {
  return ok(c, await listAttributes(areaForWrite(c.get("user"))));
});

/** Define a new attribute. */
productAttributes.post("/", requireAuth, requirePermission("inventory:write"), async (c) => {
  const user = c.get("user");
  const body = productAttributeSchema.parse(await c.req.json());
  const attr = await createAttribute({
    dataAreaId: areaForWrite(user),
    key: body.key,
    label: body.label,
    dataType: body.dataType,
    unit: body.unit || null,
    options: body.options || null,
    category: body.category ?? null,
    sortOrder: body.sortOrder,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `ProductAttribute:${attr.id}` });
  return created(c, attr);
});

/** Delete an attribute (cascades to its item values). */
productAttributes.delete("/:id", requireAuth, requirePermission("inventory:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await deleteAttribute(areaForWrite(user), id);
  await logActivity({ userId: user.id, action: "DELETE", target: `ProductAttribute:${id}` });
  return ok(c, { id });
});
