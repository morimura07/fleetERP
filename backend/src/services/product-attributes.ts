import { AttributeDataType, StockCategory } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";

/**
 * Product Information / attribute catalog (M16). Admins define product
 * attributes (specs) — optionally scoped to a stock category — and set a value
 * per stock item. Gives the parts catalog structured, searchable specs beyond
 * the fixed columns.
 */

const KEY_RE = /^[a-z][a-z0-9_]*$/;

export interface AttributeInput {
  dataAreaId: string;
  key: string;
  label: string;
  dataType?: AttributeDataType;
  unit?: string | null;
  options?: string | null;
  category?: StockCategory | null;
  sortOrder?: number;
}

export async function listAttributes(dataAreaId: string) {
  return prisma.productAttribute.findMany({
    where: { dataAreaId },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

export async function createAttribute(input: AttributeInput) {
  const key = input.key.trim().toLowerCase();
  if (!KEY_RE.test(key)) throw new AuthError("Key must be lower_snake_case (letters, digits, underscore)", 422);
  const clash = await prisma.productAttribute.findFirst({ where: { dataAreaId: input.dataAreaId, key }, select: { id: true } });
  if (clash) throw new AuthError(`An attribute with key "${key}" already exists`, 409);
  if (input.dataType === "LIST" && !input.options?.trim()) {
    throw new AuthError("A LIST attribute needs at least one option", 422);
  }
  return prisma.productAttribute.create({
    data: {
      dataAreaId: input.dataAreaId,
      key,
      label: input.label.trim(),
      dataType: input.dataType ?? "TEXT",
      unit: input.unit?.trim() || null,
      options: input.options?.trim() || null,
      category: input.category ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function deleteAttribute(dataAreaId: string, id: string) {
  const attr = await prisma.productAttribute.findFirst({ where: { id, dataAreaId }, select: { id: true } });
  if (!attr) throw new AuthError("Attribute not found", 404);
  await prisma.productAttribute.delete({ where: { id: attr.id } }); // cascades to values
}

export interface ItemAttributeView {
  attributeId: string;
  key: string;
  label: string;
  dataType: AttributeDataType;
  unit: string | null;
  options: string[] | null;
  value: string | null;
}

/**
 * The attributes applicable to a stock item (its category or global), each with
 * the item's current value (or null if unset).
 */
export async function getItemAttributes(dataAreaId: string, itemId: string): Promise<ItemAttributeView[]> {
  const item = await prisma.stockItem.findFirst({ where: { id: itemId, dataAreaId }, select: { category: true } });
  if (!item) throw new AuthError("Stock item not found in this company", 404);

  const [defs, values] = await Promise.all([
    prisma.productAttribute.findMany({
      where: { dataAreaId, OR: [{ category: item.category }, { category: null }] },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    prisma.stockItemAttribute.findMany({ where: { stockItemId: itemId }, select: { attributeId: true, value: true } }),
  ]);
  const byAttr = new Map(values.map((v) => [v.attributeId, v.value]));

  return defs.map((d) => ({
    attributeId: d.id,
    key: d.key,
    label: d.label,
    dataType: d.dataType,
    unit: d.unit,
    options: d.options ? d.options.split(",").map((o) => o.trim()).filter(Boolean) : null,
    value: byAttr.get(d.id) ?? null,
  }));
}

/**
 * Set a stock item's attribute values in one shot. An empty/absent value clears
 * that attribute; non-empty values are upserted. Only known attributes count.
 */
export async function setItemAttributes(
  dataAreaId: string,
  itemId: string,
  entries: { attributeId: string; value: string | null }[],
) {
  const item = await prisma.stockItem.findFirst({ where: { id: itemId, dataAreaId }, select: { id: true } });
  if (!item) throw new AuthError("Stock item not found in this company", 404);

  const validIds = new Set((await prisma.productAttribute.findMany({ where: { dataAreaId }, select: { id: true } })).map((a) => a.id));

  await prisma.$transaction(async (tx) => {
    for (const e of entries) {
      if (!validIds.has(e.attributeId)) continue;
      const value = e.value?.trim();
      if (!value) {
        await tx.stockItemAttribute.deleteMany({ where: { stockItemId: itemId, attributeId: e.attributeId } });
      } else {
        await tx.stockItemAttribute.upsert({
          where: { stockItemId_attributeId: { stockItemId: itemId, attributeId: e.attributeId } },
          update: { value },
          create: { dataAreaId, stockItemId: itemId, attributeId: e.attributeId, value },
        });
      }
    }
  });
  return getItemAttributes(dataAreaId, itemId);
}
