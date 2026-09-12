/**
 * Document kinds, mirroring the `AttachmentKind` enum in the Prisma schema.
 *
 * Kept here rather than in `enums.ts` because it is a label map as well as a
 * type, and the ordering below is the order the picker offers: the kinds people
 * upload most often in this business come first.
 */
export const ATTACHMENT_KIND_LABEL = {
  RECEIPT: "Receipt",
  INVOICE: "Invoice",
  PHOTO: "Photo",
  PROOF_OF_DELIVERY: "Proof of delivery",
  SURVEY_REPORT: "Surveyor report",
  POLICE_REPORT: "Police report / abstract",
  CERTIFICATE: "Certificate",
  LICENCE: "Licence",
  CONTRACT: "Contract",
  OTHER: "Other",
} as const;

export type AttachmentKind = keyof typeof ATTACHMENT_KIND_LABEL;

/** Records this system accepts documents against. Mirrors the server allowlist. */
export const ATTACHABLE_TYPES = [
  "ExpenseClaim", "FixedAsset", "DamageReport", "DockEvent", "ServiceOrder",
  "Driver", "Employee", "Vehicle", "Order", "Trip", "Vendor", "PurchaseOrder",
] as const;

export type AttachableType = (typeof ATTACHABLE_TYPES)[number];
