import type { DriverEventKind, DriverEventOutcome, DriverDocType } from "@prisma/client";

/**
 * The driver qualification file (client requirements, Sept 2026, HR §2).
 *
 * Reads a driver's documents and events and answers the two questions a
 * dispatcher and a compliance officer actually ask: is this person clear to
 * drive today, and what is about to lapse. Pure, so the rules can be tested
 * without a database and reused by the compliance reports.
 */

const DAY = 86_400_000;

export interface DocumentLike {
  type: DriverDocType;
  expiresAt: Date;
}

export interface EventLike {
  kind: DriverEventKind;
  occurredAt: Date;
  renewalDue: Date | null;
  outcome: DriverEventOutcome;
  sapReferral?: boolean;
}

export interface DriverLike {
  status: string;
  licenseExpiry: Date | null;
  medicalCertExpiry: Date | null;
}

/** Days until a date, negative once past. */
export function daysUntil(date: Date | null, asOf: Date): number | null {
  if (!date) return null;
  return Math.floor((date.getTime() - asOf.getTime()) / DAY);
}

export interface Hold {
  /** Short reason a dispatcher can read off a list. */
  reason: string;
  /** True when this alone stops the driver being dispatched. */
  blocking: boolean;
}

/**
 * Everything standing between this driver and a dispatch.
 *
 * A hold is blocking when the law or the insurer would refuse the trip: an
 * expired licence, an expired medical, a positive drug or alcohol test with no
 * clearance since. Anything else is a warning: worth knowing, not a stop.
 *
 * A positive test is cleared by a later negative one. An SAP referral is a
 * warning on its own, because the referral is the process, not the result.
 */
export function dispatchHolds(driver: DriverLike, docs: DocumentLike[], events: EventLike[], asOf: Date): Hold[] {
  const holds: Hold[] = [];

  if (driver.status === "INACTIVE") holds.push({ reason: "Driver is inactive", blocking: true });

  const licence = daysUntil(driver.licenseExpiry, asOf);
  if (licence === null) holds.push({ reason: "No licence expiry recorded", blocking: true });
  else if (licence < 0) holds.push({ reason: `Licence expired ${-licence} days ago`, blocking: true });
  else if (licence <= 30) holds.push({ reason: `Licence expires in ${licence} days`, blocking: false });

  const medical = daysUntil(driver.medicalCertExpiry, asOf);
  if (medical !== null && medical < 0) holds.push({ reason: `Medical expired ${-medical} days ago`, blocking: true });
  else if (medical !== null && medical <= 30) holds.push({ reason: `Medical expires in ${medical} days`, blocking: false });

  // Latest drug or alcohol result decides; an older positive is superseded by
  // a later negative, which is what a return-to-duty test is for.
  const tests = events
    .filter((e) => e.kind === "DRUG_ALCOHOL_TEST" && e.occurredAt <= asOf)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const latest = tests[0];
  if (latest?.outcome === "POSITIVE") holds.push({ reason: "Positive drug or alcohol test, no clearance since", blocking: true });
  if (latest?.outcome === "REFUSED") holds.push({ reason: "Refused drug or alcohol test", blocking: true });
  if (latest?.outcome === "PENDING") holds.push({ reason: "Drug or alcohol result pending", blocking: false });
  if (latest?.sapReferral && latest.outcome !== "NEGATIVE") holds.push({ reason: "Under SAP referral", blocking: false });

  // Expired certifications matter only for the work they permit: a lapsed
  // hazmat endorsement does not stop a dry-goods run, so these are warnings.
  for (const d of docs) {
    const days = daysUntil(d.expiresAt, asOf);
    if (days !== null && days < 0 && d.type !== "LICENSE" && d.type !== "PASSPORT") {
      holds.push({ reason: `${label(d.type)} expired ${-days} days ago`, blocking: false });
    }
  }

  return holds;
}

export function isClearToDrive(holds: Hold[]): boolean {
  return !holds.some((h) => h.blocking);
}

export interface Renewal {
  what: string;
  due: Date;
  daysLeft: number;
  overdue: boolean;
}

/**
 * Everything on the file that lapses within the window, soonest first.
 *
 * Licence and medical come from the driver record; certifications from the
 * document table; recurring checks and training from the event log's renewal
 * dates. A renewal is listed once even if the file holds several entries of
 * that kind, because only the latest one's due date matters.
 */
export function upcomingRenewals(
  driver: DriverLike,
  docs: DocumentLike[],
  events: EventLike[],
  asOf: Date,
  windowDays = 90,
): Renewal[] {
  const out: Renewal[] = [];
  const consider = (what: string, due: Date | null) => {
    const days = daysUntil(due, asOf);
    if (due && days !== null && days <= windowDays) out.push({ what, due, daysLeft: days, overdue: days < 0 });
  };

  consider("Driving licence", driver.licenseExpiry);
  consider("Medical certificate", driver.medicalCertExpiry);
  for (const d of docs) consider(label(d.type), d.expiresAt);

  // Latest entry per kind decides the next due date.
  const latestByKind = new Map<DriverEventKind, EventLike>();
  for (const e of events) {
    const cur = latestByKind.get(e.kind);
    if (!cur || e.occurredAt > cur.occurredAt) latestByKind.set(e.kind, e);
  }
  for (const [kind, e] of latestByKind) {
    if (kind === "VIOLATION") continue; // one-offs have no renewal
    consider(kindLabel(kind), e.renewalDue);
  }

  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function label(type: DriverDocType): string {
  switch (type) {
    case "LICENSE": return "Driving licence";
    case "PASSPORT": return "Passport";
    case "COMESA_PERMIT": return "COMESA permit";
    case "YELLOW_FEVER": return "Yellow fever certificate";
    case "WORK_PERMIT": return "Work permit";
    case "MEDICAL_CERTIFICATE": return "Medical certificate";
    case "HAZMAT": return "Hazmat endorsement";
    case "TWIC": return "TWIC card";
    case "FORKLIFT": return "Forklift certificate";
    case "DEFENSIVE_DRIVING": return "Defensive driving certificate";
    default: return "Document";
  }
}

export function kindLabel(kind: DriverEventKind): string {
  switch (kind) {
    case "ROAD_TEST": return "Road test";
    case "MVR_CHECK": return "Motor vehicle record check";
    case "VIOLATION": return "Violation";
    case "DRUG_ALCOHOL_TEST": return "Drug and alcohol test";
    case "TRAINING": return "Training";
  }
}
