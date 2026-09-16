import { defineReport } from "@backend/services/report-registry";

/**
 * Reports that need a hardware feed this system does not have.
 *
 * Registered rather than omitted, so the catalogue shows every group the
 * requirements list and says plainly why these cannot run yet. An empty table
 * would look like a bug; a missing entry would look like the request was
 * forgotten. Neither is what happened: the data does not exist.
 *
 * Every one of these becomes buildable the day a telematics or ELD provider is
 * integrated. The definitions here are the contract for that integration: the
 * columns are what the requirements asked for.
 */

const NEEDS_TELEMATICS =
  "Needs a telematics or ELD feed (GPS, engine and sensor data), which is not connected. " +
  "Available once a provider is chosen and integrated.";

const NEEDS_FUEL_SENSORS =
  "Needs fuel tank sensors or a bulk fuel depot ledger, neither of which is connected. " +
  "Available once a provider or depot stock control is in place.";

interface Placeholder { note: string }
const cols = (headers: string[]) => headers.map((h) => ({ header: h, value: (_r: Placeholder) => null }));
const never = async (): Promise<Placeholder[]> => [];

defineReport<Placeholder>({
  key: "route-deviation",
  title: "Route deviation & geofencing alerts",
  group: "FLEET",
  description: "Planned route against actual GPS track, unauthorised stops and geofence breaches.",
  permission: "tracking:read",
  params: [],
  columns: cols(["Trip", "Vehicle", "Driver", "Planned route", "Deviation (km)", "Unauthorised stops", "Geofence breaches"]),
  run: never,
  unavailable: NEEDS_TELEMATICS,
});

defineReport<Placeholder>({
  key: "deadhead-empty-running",
  title: "Deadhead / empty running",
  group: "FLEET",
  description: "Non-revenue kilometres against loaded kilometres per route.",
  permission: "trip:read",
  params: [],
  columns: cols(["Route", "Loaded km", "Empty km", "Empty %", "Cost of empty running"]),
  run: never,
  unavailable:
    "Needs a GPS track to separate loaded from empty legs. Trips record total distance only. " +
    "Available with telematics, or once trips record the empty leg separately.",
});

defineReport<Placeholder>({
  key: "fuel-consumption",
  title: "Fuel consumption & mileage (km/L)",
  group: "FUEL",
  description: "Fuel dispensed against distance covered, per vehicle, route and driver.",
  permission: "report:read",
  params: [],
  columns: cols(["Vehicle", "Driver", "Litres", "Distance (km)", "km/L", "Target km/L", "Variance"]),
  run: never,
  unavailable:
    "Fuel lines now carry litres (stage 6), but no trips have been recorded with fuel expenses yet. " +
    "This report will populate as fuel claims are entered against trips.",
});

defineReport<Placeholder>({
  key: "fuel-pilferage-variance",
  title: "Fuel pilferage & variance exceptions",
  group: "FUEL",
  description: "Fuel card purchases against sensor logs and tank readings; mismatches flagged.",
  permission: "report:read",
  params: [],
  columns: cols(["Vehicle", "Date", "Card purchase (L)", "Sensor reading (L)", "Variance (L)", "Variance %"]),
  run: never,
  unavailable: NEEDS_FUEL_SENSORS,
});

defineReport<Placeholder>({
  key: "engine-idling",
  title: "Engine idling & waste",
  group: "FUEL",
  description: "Excess idling time and the fuel it burned, per vehicle and driver.",
  permission: "report:read",
  params: [],
  columns: cols(["Vehicle", "Driver", "Idle hours", "Fuel burned (L)", "Cost"]),
  run: never,
  unavailable: NEEDS_TELEMATICS,
});

defineReport<Placeholder>({
  key: "bulk-fuel-reconciliation",
  title: "Bulk fuel inventory & reconciliation",
  group: "FUEL",
  description: "Daily dips, bulk receipts and pump issues against book stock.",
  permission: "inventory:read",
  params: [],
  columns: cols(["Depot", "Date", "Opening (L)", "Received (L)", "Issued (L)", "Book close (L)", "Dip (L)", "Variance (L)"]),
  run: never,
  unavailable: NEEDS_FUEL_SENSORS,
});

defineReport<Placeholder>({
  key: "pm-due-schedule",
  title: "Preventive maintenance due",
  group: "MAINTENANCE",
  description: "Upcoming servicing by odometer, engine hours or calendar.",
  permission: "service:read",
  params: [],
  columns: cols(["Vehicle", "Service", "Due at (km)", "Current (km)", "Due date", "Days left"]),
  run: never,
  unavailable:
    "Needs a maintenance schedule per vehicle (interval in km or days) and a current odometer. " +
    "Neither is recorded yet; the schedule is part of the maintenance work still to build.",
});

defineReport<Placeholder>({
  key: "breakdown-mtbf-mttr",
  title: "Vehicle breakdown MTBF / MTTR",
  group: "MAINTENANCE",
  description: "Mean time between failures and mean time to repair, with recurring components.",
  permission: "service:read",
  params: [],
  columns: cols(["Vehicle", "Breakdowns", "MTBF (days)", "MTTR (days)", "Most frequent component"]),
  run: never,
  unavailable:
    "Mean time to repair is already on the work order costing report. Mean time between failures " +
    "needs breakdowns distinguished from scheduled service, which work orders do not yet record.",
});

defineReport<Placeholder>({
  key: "tyre-lifecycle",
  title: "Tyre lifecycle & retread performance",
  group: "MAINTENANCE",
  description: "Mileage per tyre serial, tread wear, rotations, retreads and scrap.",
  permission: "service:read",
  params: [],
  columns: cols(["Tyre serial", "Vehicle", "Position", "Fitted (km)", "Current (km)", "Tread (mm)", "Retreads"]),
  run: never,
  unavailable: "Needs a tyre register: serial numbers, fitting positions and tread readings. Not recorded anywhere yet.",
});

defineReport<Placeholder>({
  key: "driver-behaviour-scorecard",
  title: "Driver behaviour & eco-driving scorecard",
  group: "DRIVER",
  description: "Harsh braking, speeding, cornering and acceleration events, scored per driver.",
  permission: "driver:read",
  params: [],
  columns: cols(["Driver", "Trips", "Harsh braking", "Speeding events", "Harsh cornering", "Rapid acceleration", "Score"]),
  run: never,
  unavailable: NEEDS_TELEMATICS,
});

defineReport<Placeholder>({
  key: "driver-hos-log",
  title: "Driver duty & hours of service",
  group: "DRIVER",
  description: "Shift hours, driving time, rest breaks and compliance against the HOS rule.",
  permission: "attendance:read",
  params: [],
  columns: cols(["Driver", "Date", "On duty (h)", "Driving (h)", "Rest (h)", "Rule", "Compliant"]),
  run: never,
  unavailable:
    "Time entries record clock-in and clock-out only; driving time and rest breaks are not captured. " +
    "Available once time management records duty status (stage 10), or via an ELD feed.",
});

defineReport<Placeholder>({
  key: "emissions-carbon",
  title: "Emissions & carbon footprint",
  group: "COMPLIANCE",
  description: "Fleet CO₂ estimated from fuel consumed per tonne hauled.",
  permission: "report:read",
  params: [],
  columns: cols(["Period", "Litres", "Tonnes hauled", "Tonne-km", "CO₂ (t)", "g CO₂ per tonne-km"]),
  run: never,
  unavailable:
    "Buildable from fuel litres and cargo weight once fuel claims are being recorded against trips. " +
    "The emission factor (kg CO₂ per litre of diesel) needs agreeing first.",
});

defineReport<Placeholder>({
  key: "customer-sla-performance",
  title: "Customer service level performance",
  group: "EXECUTIVE",
  description: "Delivery performance against each contract's agreed service levels.",
  permission: "report:read",
  params: [],
  columns: cols(["Client", "Contract", "SLA target", "Actual", "Met", "Breaches"]),
  run: never,
  unavailable:
    "Needs a service level per client contract (on-time %, transit days). Clients carry an SLA " +
    "expiry date only; the targets themselves are part of the Companies rate profile still to build.",
});
