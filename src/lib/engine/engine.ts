import type { Actor, Alert, AlertKind, Bank, BankId, Cheque, EngineState, Status, VerifyResult } from "./types";
import { DAY, dubaiDay, fmtDate } from "./format";

export const BANKS: Bank[] = [
  { id: "ENBD", name: "Emirates NBD", short: "ENBD", swift: "EBILAEAD", hue: 250 },
  { id: "ADCB", name: "Abu Dhabi Commercial Bank", short: "ADCB", swift: "ADCBAEAA", hue: 20 },
  { id: "FAB", name: "First Abu Dhabi Bank", short: "FAB", swift: "NBADAEAA", hue: 200 },
  { id: "MASHREQ", name: "Mashreq", short: "Mashreq", swift: "BOMLAEAD", hue: 35 },
  { id: "RAKBANK", name: "RAKBANK", short: "RAK", swift: "NRAKAEAK", hue: 0 },
  { id: "DIB", name: "Dubai Islamic Bank", short: "DIB", swift: "DUIBAEAD", hue: 150 },
];
export const bankById = (id: BankId) => BANKS.find((b) => b.id === id)!;

export const HIGH_VALUE = 500_000;

export const STATUS_LABEL: Record<Status, string> = {
  requested: "Request Created",
  authorized: "Bank Authorized",
  issued: "Digital Cheque Issued",
  delivered: "Delivered to Beneficiary",
  verified: "Beneficiary Verified",
  deposited: "Deposit Submitted",
  accepted: "Payee Bank Accepted",
  presented: "Presented for Clearing",
  paid: "Issuing Bank Approved",
  settled: "Interbank Settled",
  credited: "Funds Credited",
  returned: "Returned",
  rejected: "Rejected",
  stopped: "Stopped / Revoked",
  cancelled: "Cancelled",
  replaced: "Replaced (superseded)",
  released: "Security Released",
};

/** Happy path milestones, in order */
export const MILESTONES: Status[] = [
  "requested", "authorized", "issued", "delivered", "verified", "deposited",
  "accepted", "presented", "paid", "settled", "credited",
];

/** Which statuses each status may move to */
export const TRANSITIONS: Record<Status, Status[]> = {
  requested: ["authorized", "rejected", "stopped", "cancelled"],
  authorized: ["issued", "stopped", "cancelled"],
  issued: ["delivered", "stopped", "cancelled", "replaced", "released"],
  delivered: ["verified", "deposited", "stopped", "cancelled", "replaced", "released"],
  verified: ["deposited", "stopped", "cancelled", "replaced", "released"],
  deposited: ["accepted", "rejected"],
  accepted: ["presented"],
  presented: ["paid", "returned"],
  paid: ["settled"],
  settled: ["credited"],
  credited: [],
  returned: [],
  rejected: [],
  stopped: [],
  cancelled: [],
  replaced: [],
  released: [],
};

export class EngineError extends Error {}

export function canTransition(from: Status, to: Status) {
  return TRANSITIONS[from].includes(to);
}

// ---------- deterministic hash (simulated SHA-256 style digest) ----------
export function digest(input: string): string {
  let out = "";
  for (let k = 0; k < 4; k++) {
    let h = 0x811c9dc5 ^ (k * 0x9e3779b1);
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    out += (h >>> 0).toString(16).padStart(8, "0");
    out += ((Math.imul(h, 2654435761) >>> 0).toString(16)).padStart(8, "0");
  }
  return out;
}

export function canonical(c: Cheque, amountOverride?: number): string {
  return [c.ndci, c.chequeNo, c.issuingBank, c.payeeBank, c.drawerAcct, c.beneficiaryAcct, c.beneficiary,
    (amountOverride ?? c.amount).toFixed(2), c.currency, c.issueDate, c.payableDate, c.version].join("|");
}

/** Hash of what the instrument currently presents (tampered copies present a different amount) */
export function presentedHash(c: Cheque) {
  return digest(canonical(c, c.tamperedAmount));
}

// ---------- helpers ----------
export function clone(s: EngineState): EngineState {
  return structuredClone(s);
}
export function tick(s: EngineState, ms = 60_000) {
  s.now += ms;
  return s.now;
}
export function nextId(s: EngineState, prefix: string) {
  s.seq += 1;
  return `${prefix}-${String(s.seq).padStart(6, "0")}`;
}
export function audit(
  s: EngineState, actor: Actor, action: string, ndci?: string, bank?: BankId,
  meta: { institution?: string; reason?: string; correlation?: string; evidence?: string } = {},
): string {
  const id = nextId(s, "AUD");
  s.audit.unshift({ id, at: s.now, actor, action, ndci, bank, ...meta, correlation: meta.correlation ?? id });
  if (s.audit.length > 600) s.audit.length = 600;
  return id;
}
export function notify(s: EngineState, to: string, text: string, ndci?: string) {
  s.ext.notices.unshift({ id: nextId(s, "NTF"), to, text, at: s.now, ndci });
  if (s.ext.notices.length > 300) s.ext.notices.length = 300;
}
function releaseReservation(s: EngineState, c: Cheque, why: string) {
  const r = s.ext.reservations.find((x) => x.id === c.reservationId);
  if (r && r.status === "reserved") {
    r.status = "released";
    audit(s, "issuing_bank", `Entitlement reservation released (${why})`, c.ndci, c.issuingBank, { correlation: r.id });
  }
}
export function raise(s: EngineState, kind: AlertKind, severity: Alert["severity"], message: string, ndci?: string, bank?: BankId) {
  s.alerts.unshift({ id: nextId(s, "ALR"), kind, severity, message, ndci, bank, at: s.now });
}
export function get(s: EngineState, ndci: string): Cheque {
  const c = s.cheques[ndci];
  if (!c) throw new EngineError(`Instrument ${ndci} not found`);
  return c;
}
export function move(s: EngineState, c: Cheque, to: Status, actor: Actor, detail?: string) {
  if (!canTransition(c.status, to)) {
    throw new EngineError(`Cannot move ${c.ndci} from "${STATUS_LABEL[c.status]}" to "${STATUS_LABEL[to]}"`);
  }
  c.status = to;
  c.updatedAt = s.now;
  c.events.push({ status: to, label: STATUS_LABEL[to], at: s.now, actor, detail });
  audit(s, actor, STATUS_LABEL[to], c.ndci, actor === "payee_bank" ? c.payeeBank : c.issuingBank);
}

export function ndciFor(year: number, n: number): string {
  const body = String(n).padStart(8, "0");
  const check = "ABCDEFGHJKLMNPQRSTUVWXYZ"[[...body].reduce((a, d, i) => a + Number(d) * (i + 3), 0) % 24];
  return `AE-DC-${year}-${body}-${check}`;
}

// ---------- actions ----------
export interface NewChequeInput {
  issuingBank: BankId;
  payeeBank: BankId;
  drawer: string;
  drawerId: string;
  drawerAcct: string;
  beneficiary: string;
  beneficiaryId: string;
  beneficiaryAcct: string;
  amount: number;
  payableDate: number;
  purpose: string;
  remarks?: string;
  purposeCategory?: import("./types").PurposeCategory;
  classification?: "payment" | "security";
  obligationId?: string;
  /** Idempotency key: repeated submissions reuse the original reservation and request */
  requestKey?: string;
  signingSessionId?: string;
}

/** Available = allocated − consumed − active reservations */
export function entitlementSummary(s: EngineState, customerId: string) {
  const e = s.ext.entitlements[customerId];
  if (!e) return null;
  const reserved = s.ext.reservations.filter((r) => r.entitlementId === e.id && r.status === "reserved").length;
  const available = e.suspended || e.expired ? 0 : Math.max(0, e.allocated - e.consumed - reserved);
  return { ...e, reserved, available };
}

export function createRequest(state: EngineState, input: NewChequeInput): { state: EngineState; ndci: string } {
  if (!(input.amount > 0)) throw new EngineError("Amount must be greater than zero");
  if (input.issuingBank === input.payeeBank && input.drawerAcct === input.beneficiaryAcct)
    throw new EngineError("Drawer and beneficiary accounts must differ");
  if (input.requestKey) {
    const prior = state.ext.reservations.find((r) => r.requestKey === input.requestKey && r.ndci);
    if (prior?.ndci) return { state, ndci: prior.ndci }; // idempotent resubmission
  }
  const s = clone(state);
  tick(s);
  // Cheque entitlement (separate from account balance)
  let reservationId: string | undefined;
  const ent = entitlementSummary(s, input.drawerId);
  if (ent) {
    if (ent.pendingVerification) throw new EngineError("Cheque entitlement could not be confirmed by the issuing bank — pending verification, issuance blocked");
    if (ent.suspended) throw new EngineError("Cheque entitlement is suspended by the issuing bank");
    if (ent.expired) throw new EngineError("Cheque entitlement has expired");
    if (ent.available <= 0) throw new EngineError("No cheque entitlement available — request additional cheque entitlement from your bank");
    reservationId = nextId(s, "RSV");
    s.ext.reservations.push({ id: reservationId, entitlementId: ent.id, customerId: input.drawerId, requestKey: input.requestKey ?? reservationId, status: "reserved", at: s.now });
  }
  if (input.signingSessionId) {
    const ss = s.ext.signing[input.signingSessionId];
    if (!ss || ss.result !== "signed") throw new EngineError("No valid signing evidence — review and sign again");
    if (ss.hash !== termsHash(input)) throw new EngineError("Terms changed after review — previous authorization invalidated, review and sign again");
  }
  const year = new Date(s.now).getUTCFullYear();
  s.seq += 1;
  const ndci = ndciFor(year, 10_000_000 + s.seq);
  const c: Cheque = {
    ...input,
    ndci,
    requestId: nextId(s, "REQ"),
    chequeNo: String(100000 + (s.seq % 900000)).padStart(6, "0"),
    currency: "AED",
    issueDate: dubaiDay(s.now),
    payableDate: dubaiDay(Math.max(input.payableDate, s.now)),
    status: "requested",
    version: 1,
    createdAt: s.now,
    updatedAt: s.now,
    presentCount: 0,
    reservationId,
    classification: input.classification ?? "payment",
    events: [{ status: "requested", label: STATUS_LABEL.requested, at: s.now, actor: "customer" }],
  };
  delete (c as Partial<NewChequeInput>).requestKey;
  const persona = s.ext.entitlements[input.drawerId];
  if (persona && input.drawerId.startsWith("CUST-") && CORPORATE.has(input.drawerId)) c.makerChecker = { maker: `${input.drawer} — maker`, pending: true };
  if (reservationId) s.ext.reservations.find((r) => r.id === reservationId)!.ndci = ndci;
  s.cheques[ndci] = c;
  s.order.unshift(ndci);
  audit(s, "customer", "Issuance request created", ndci, input.issuingBank);
  if (input.amount >= HIGH_VALUE) raise(s, "high_value", "medium", `High-value cheque request ${fmtAmt(input.amount)}`, ndci, input.issuingBank);
  return { state: s, ndci };
}

export const CORPORATE = new Set(["CUST-OMAR", "CUST-LAYLA"]);

/** Hash of the material terms the customer reviewed and signed */
export function termsHash(t: Pick<NewChequeInput, "drawerId" | "beneficiaryId" | "beneficiaryAcct" | "amount" | "payableDate" | "purpose"> & { classification?: string; purposeCategory?: string; obligationId?: string }) {
  return digest([t.drawerId, t.beneficiaryId, t.beneficiaryAcct, t.amount.toFixed(2), dubaiDay(t.payableDate), t.purpose, t.purposeCategory ?? "", t.classification ?? "payment", t.obligationId ?? ""].join("|"));
}

/** Independent checker approval for corporate issuance (maker ≠ checker) */
export function checkerApprove(state: EngineState, ndci: string, checker: string): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  if (!c.makerChecker?.pending) throw new EngineError("No checker approval pending");
  if (checker.trim().toLowerCase() === c.makerChecker.maker.toLowerCase()) throw new EngineError("Maker and checker must be different people");
  tick(s);
  c.makerChecker = { ...c.makerChecker, checker, pending: false };
  c.events.push({ status: "note", label: "Checker approved", at: s.now, actor: "customer", detail: checker });
  audit(s, "customer", "Corporate checker approved issuance", ndci, c.issuingBank, { reason: checker });
  return s;
}

const fmtAmt = (n: number) => `AED ${n.toLocaleString("en-AE")}`;

/** Issuing bank authorizes. If the bank link is down, the request is queued for retry. */
export function authorize(state: EngineState, ndci: string): { state: EngineState; queued: boolean } {
  const s = clone(state);
  const c = get(s, ndci);
  tick(s);
  if (c.makerChecker?.pending) throw new EngineError("Awaiting independent corporate checker approval");
  if (s.bankLinks[c.issuingBank] === "down") {
    if (!s.retryQueue.some((j) => j.ndci === ndci)) {
      s.retryQueue.push({ id: nextId(s, "JOB"), ndci, action: "authorize", attempts: 1, lastError: "HTTP 503 — core banking API unavailable", createdAt: s.now });
      raise(s, "integration", "high", `${bankById(c.issuingBank).name} API unavailable — authorization queued for retry`, ndci, c.issuingBank);
    }
    return { state: s, queued: true };
  }
  move(s, c, "authorized", "issuing_bank");
  return { state: s, queued: false };
}

/** EDC generates, signs and registers the instrument, then delivers it */
export function issue(state: EngineState, ndci: string): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  if (c.hash) throw new EngineError("Instrument already issued — duplicate issuance prevented");
  tick(s, 20_000);
  c.docRef = `EDC-VAULT-${c.ndci.slice(-10)}`;
  c.certId = `EDC-CA-${c.issuingBank}-2026-0${(c.chequeNo.charCodeAt(5) % 4) + 1}`;
  c.hash = digest(canonical(c));
  c.qrToken = `edc://verify/${c.ndci}?t=${c.hash.slice(0, 16)}`;
  move(s, c, "issued", "edc", `Signed with ${c.certId}`);
  tick(s, 5_000);
  move(s, c, "delivered", "edc", `Delivered to ${c.beneficiary}`);
  const r = s.ext.reservations.find((x) => x.id === c.reservationId);
  if (r && r.status === "reserved") {
    r.status = "consumed";
    const e = Object.values(s.ext.entitlements).find((x) => x.id === r.entitlementId);
    if (e) e.consumed += 1;
  }
  for (const party of ["issuer", "beneficiary"] as const) {
    const cid = party === "issuer" ? c.drawerId : c.beneficiaryId;
    s.ext.copies.push({ id: nextId(s, "CPY"), ndci: c.ndci, party, customerId: cid, event: "delivered", docVersion: c.version, hash: c.hash, at: s.now });
    notify(s, cid, party === "issuer" ? `Your cheque ${c.chequeNo} to ${c.beneficiary} was issued — copy in your wallet` : `New digital cheque from ${c.drawer} (${fmtAmt(c.amount)})`, c.ndci);
  }
  return s;
}

export function verify(state: EngineState, query: string, actor: Actor = "beneficiary"): { state: EngineState; result: VerifyResult; cheque?: Cheque } {
  const s = clone(state);
  s.verifications += 1;
  const m = query.match(/AE-DC-\d{4}-\d{8}-[A-Z]/);
  const c = m ? s.cheques[m[0]] : undefined;
  if (!c || !c.hash) return { state: s, result: "not_found" };
  tick(s, 5_000);
  let result: VerifyResult;
  if (presentedHash(c) !== c.hash) {
    result = "tampered";
    raise(s, "tampered", "critical", `Tampered instrument detected — hash mismatch`, c.ndci, c.issuingBank);
  } else if (c.status === "stopped") result = "revoked";
  else if (c.status === "returned") result = "returned";
  else if (c.status === "settled" || c.status === "credited") result = "settled";
  else if (c.status === "presented" || c.status === "paid") result = "presented";
  else result = "genuine";
  audit(s, actor, `Verification: ${result}`, c.ndci);
  if (result === "genuine" && c.status === "delivered" && actor === "beneficiary") move(s, c, "verified", "beneficiary");
  return { state: s, result, cheque: s.cheques[c.ndci] };
}

export function deposit(state: EngineState, ndci: string): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  tick(s);
  if (dubaiDay(s.now) < c.payableDate)
    throw new EngineError(`Post-dated cheque — cannot be deposited before ${fmtDate(c.payableDate)}`);
  if (presentedHash(c) !== c.hash) throw new EngineError("Instrument failed authentication — deposit refused");
  if (c.depositRef) throw new EngineError("Duplicate deposit blocked — this instrument already has a deposit instruction");
  c.depositRef = nextId(s, "DEP");
  move(s, c, "deposited", "beneficiary", `Deposit ref ${c.depositRef}`);
  notify(s, c.drawerId, `Cheque ${c.chequeNo} was deposited by ${c.beneficiary}`, c.ndci);
  return s;
}

export function acceptDeposit(state: EngineState, ndci: string, accept = true, reason?: string): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  tick(s);
  if (accept) move(s, c, "accepted", "payee_bank");
  else {
    c.returnReason = reason ?? "Rejected by payee bank";
    move(s, c, "rejected", "payee_bank", c.returnReason);
  }
  return s;
}

export function present(state: EngineState, ndci: string): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  tick(s);
  if (c.presentCount > 0) {
    raise(s, "duplicate_presentment", "critical", `Duplicate presentment attempt blocked`, ndci, c.payeeBank);
    audit(s, "edc", "Duplicate presentment blocked", ndci, c.payeeBank);
    // persist the alert even though the action fails
    throw Object.assign(new EngineError("Duplicate presentment blocked — instrument already presented"), { state: s });
  }
  c.presentCount += 1;
  c.clearingRef = nextId(s, "CLR");
  move(s, c, "presented", "payee_bank", `Clearing ref ${c.clearingRef}`);
  return s;
}

export function decide(state: EngineState, ndci: string, pay: boolean, reason?: string): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  tick(s);
  if (pay) {
    const bal = s.balances[c.drawerId];
    if (bal !== undefined && bal < c.amount) throw new EngineError("Insufficient funds in drawer account — return the cheque instead");
    if (bal !== undefined) s.balances[c.drawerId] = bal - c.amount;
    move(s, c, "paid", "issuing_bank");
  } else {
    c.returnReason = reason ?? "Refer to drawer";
    move(s, c, "returned", "issuing_bank", c.returnReason);
    const recentReturns = Object.values(s.cheques).filter((x) => x.drawerId === c.drawerId && x.status === "returned").length;
    if (recentReturns >= 2) raise(s, "abnormal_returns", "high", `Abnormal return pattern for drawer ${c.drawer}`, ndci, c.issuingBank);
  }
  return s;
}

export function settle(state: EngineState, ndci: string, opts: { fail?: boolean } = {}): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  tick(s);
  if (c.status !== "paid") throw new EngineError(c.status === "settled" || c.status === "credited" ? "Already settled — duplicate settlement prevented" : "Only approved cheques can be settled");
  if (opts.fail) {
    if (!c.settlementException) {
      c.settlementException = true;
      c.events.push({ status: "note", label: "Settlement exception", at: s.now, actor: "clearing", detail: "Amount mismatch in settlement batch" });
      raise(s, "settlement", "high", "Settlement exception — batch amount mismatch, reconciliation required", ndci, c.payeeBank);
    }
    return s;
  }
  c.settlementException = false;
  c.settlementRef = nextId(s, "STL");
  move(s, c, "settled", "clearing", `Settlement ref ${c.settlementRef}`);
  return s;
}

export function reconcile(state: EngineState, ndci: string): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  if (!c.settlementException) throw new EngineError("No open exception for this instrument");
  tick(s);
  c.events.push({ status: "note", label: "Exception reconciled", at: s.now, actor: "payee_bank" });
  s.alerts.filter((a) => a.ndci === ndci && a.kind === "settlement").forEach((a) => (a.resolved = true));
  audit(s, "payee_bank", "Settlement exception reconciled", ndci, c.payeeBank);
  return settle(s, ndci);
}

export function credit(state: EngineState, ndci: string): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  tick(s);
  move(s, c, "credited", "payee_bank", `Credited to ${c.beneficiaryAcct}`);
  if (s.balances[c.beneficiaryId] !== undefined) s.balances[c.beneficiaryId] += c.amount;
  return s;
}

export function stop(state: EngineState, ndci: string, reason = "Stop payment by drawer"): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  tick(s);
  c.returnReason = reason;
  move(s, c, "stopped", "issuing_bank", reason);
  releaseReservation(s, c, "stopped before issuance");
  return s;
}

export function rejectRequest(state: EngineState, ndci: string, reason = "Declined by issuing bank"): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  tick(s);
  c.returnReason = reason;
  move(s, c, "rejected", "issuing_bank", reason);
  releaseReservation(s, c, "rejected");
  raise(s, "failed_auth", "low", `Issuance authorization declined: ${reason}`, ndci, c.issuingBank);
  return s;
}

/** Demo: alter the presented amount without re-signing */
export function tamper(state: EngineState, ndci: string): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  c.tamperedAmount = c.amount * 10;
  c.events.push({ status: "note", label: "Altered copy circulated", at: s.now, actor: "system", detail: "Amount modified outside EDC" });
  return s;
}

export function setLink(state: EngineState, bank: BankId, up: boolean): EngineState {
  const s = clone(state);
  tick(s, 10_000);
  s.bankLinks[bank] = up ? "up" : "down";
  audit(s, "edc", `${bankById(bank).name} link ${up ? "restored" : "down"}`, undefined, bank);
  return s;
}

/** Retry a queued job. Idempotent: never authorizes or issues twice. */
export function retry(state: EngineState, jobId: string): { state: EngineState; ok: boolean } {
  let s = clone(state);
  const job = s.retryQueue.find((j) => j.id === jobId);
  if (!job) throw new EngineError("Retry job not found");
  const c = get(s, job.ndci);
  if (s.bankLinks[c.issuingBank] === "down") {
    job.attempts += 1;
    tick(s, 30_000);
    return { state: s, ok: false };
  }
  s.retryQueue = s.retryQueue.filter((j) => j.id !== jobId);
  if (c.status === "requested") s = authorize(s, job.ndci).state;
  s.alerts.filter((a) => a.ndci === job.ndci && a.kind === "integration").forEach((a) => (a.resolved = true));
  return { state: s, ok: true };
}

export function advanceClock(state: EngineState, to: number): EngineState {
  const s = clone(state);
  if (to > s.now) s.now = to;
  audit(s, "system", `Demo clock advanced to ${fmtDate(s.now)}`);
  return s;
}

export function resolveAlert(state: EngineState, id: string): EngineState {
  const s = clone(state);
  const a = s.alerts.find((x) => x.id === id);
  if (a) a.resolved = true;
  return s;
}

export function toggleSaved(state: EngineState, ndci: string): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  c.saved = !c.saved;
  return s;
}

export { DAY, releaseReservation };
