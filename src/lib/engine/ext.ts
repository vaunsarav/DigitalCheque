/**
 * PRD v8 extensions: entitlement, review & sign, copies, e-deposit, auto-deposit,
 * service requests, security release, AI assistant, liability report, commercial model.
 * Pure functions over EngineState — every consequential action writes an audit event.
 */
import {
  CORPORATE, EngineError, createRequest, STATUS_LABEL, audit, bankById, clone, deposit, digest, entitlementSummary, get, move, nextId,
  notify, releaseReservation, stop, termsHash, tick, type NewChequeInput,
} from "./engine";
import { DAY, dubaiDay, fmtDate } from "./format";
import type {
  ApprovalRule, AgentRecommendation, Cheque, CommercialAssumptions, EngineState, ExtState, PurposeCategory, ServiceRequest,
  ServiceType, SigningSession, Status,
} from "./types";

export const DEMO_WATERMARK = "DEMONSTRATION — NOT VALID FOR PAYMENT";

export const PURPOSE_LABEL: Record<PurposeCategory, string> = {
  rent: "Rent",
  supplier: "Supplier or commercial payment",
  milestone: "Contract milestone",
  loan: "Loan installment",
  refund: "Refund",
  security: "Security or collateral",
  other: "Other",
};

const ACTIVE: Status[] = ["issued", "delivered", "verified"];
const fmtAmt = (n: number) => `AED ${n.toLocaleString("en-AE")}`;
const err = (msg: string, s?: EngineState) => Object.assign(new EngineError(msg), s ? { state: s } : {});

export const DEFAULT_MATRIX: Record<ServiceType, ApprovalRule> = {
  stop: { label: "Stop payment", initiators: ["issuer"], counterpartyConsent: false, bank: "issuing", eligible: ["issued", "delivered", "verified"], evidence: "Reason from drawer", expiryDays: 2 },
  cancel: { label: "Cancellation (mutual)", initiators: ["issuer", "beneficiary"], counterpartyConsent: true, bank: "issuing", eligible: ["requested", "authorized", "issued", "delivered", "verified"], evidence: "Reason and counterparty consent", expiryDays: 5 },
  amend: { label: "Amendment / correction", initiators: ["issuer"], counterpartyConsent: true, bank: "issuing", eligible: ["issued", "delivered", "verified"], evidence: "Proposed terms + fresh signing", expiryDays: 5 },
  replace: { label: "Replacement / reissue", initiators: ["issuer", "beneficiary"], counterpartyConsent: true, bank: "issuing", eligible: ["issued", "delivered", "verified"], evidence: "Reason, replacement terms", expiryDays: 5 },
  security_release: { label: "Security cheque release", initiators: ["issuer", "beneficiary"], counterpartyConsent: true, bank: "issuing", eligible: ["issued", "delivered", "verified"], evidence: "Obligation closure evidence", expiryDays: 10, securityOnly: true },
  acknowledge: { label: "Beneficiary acknowledgement", initiators: ["beneficiary"], counterpartyConsent: false, bank: "none", eligible: ["issued", "delivered", "verified"], evidence: "—", expiryDays: 30 },
  objection: { label: "Beneficiary objection", initiators: ["beneficiary"], counterpartyConsent: false, bank: "issuing", eligible: ["issued", "delivered", "verified"], evidence: "Objection reason", expiryDays: 5 },
};

export const DEFAULT_COMMERCIAL: CommercialAssumptions = {
  banks: 6, monthlyInstruments: 400_000, adoptionPct: 15, onboardingFee: 0, subscriptionPerBankMonth: 0,
  perInstrumentFee: 0, aiPackagePerBankMonth: 0, fixedOpexMonth: 0, variableCostPerInstrument: 0,
};

export function emptyExt(): ExtState {
  return {
    entitlements: {}, reservations: [], obligations: {}, signing: {}, copies: [], mandates: [], autoRuns: [], requests: [],
    matrix: structuredClone(DEFAULT_MATRIX), releases: [], agent: [], commercial: { ...DEFAULT_COMMERCIAL }, notices: [],
  };
}

// ---------------- 2. Entitlement ----------------
export function requestEntitlement(state: EngineState, customerId: string, qty: number): EngineState {
  const s = clone(state);
  const e = s.ext.entitlements[customerId];
  if (!e) throw new EngineError("No entitlement record for this customer");
  tick(s);
  e.additionalRequested += qty;
  audit(s, "customer", `Additional cheque entitlement requested (${qty})`, undefined, e.bank, { institution: bankById(e.bank).name });
  notify(s, `bank:${e.bank}`, `Entitlement request: ${qty} cheques for ${customerId}`);
  return s;
}
export function grantEntitlement(state: EngineState, customerId: string, qty: number): EngineState {
  const s = clone(state);
  const e = s.ext.entitlements[customerId];
  if (!e) throw new EngineError("No entitlement record");
  tick(s);
  e.allocated += qty;
  e.additionalRequested = Math.max(0, e.additionalRequested - qty);
  e.lastConfirmedAt = s.now;
  e.pendingVerification = false;
  audit(s, "issuing_bank", `Cheque entitlement allocated (+${qty})`, undefined, e.bank, { institution: bankById(e.bank).name });
  notify(s, customerId, `${bankById(e.bank).name} allocated ${qty} additional digital cheques`);
  return s;
}
export function setEntitlementFlag(state: EngineState, customerId: string, flag: "suspended" | "pendingVerification", v: boolean): EngineState {
  const s = clone(state);
  const e = s.ext.entitlements[customerId];
  if (!e) throw new EngineError("No entitlement record");
  tick(s);
  e[flag] = v;
  if (!v && flag === "pendingVerification") e.lastConfirmedAt = s.now;
  audit(s, "issuing_bank", `Entitlement ${flag === "suspended" ? "suspension" : "verification hold"} ${v ? "set" : "cleared"}`, undefined, e.bank);
  return s;
}
/** Bulk issuance: validate the full batch before releasing any item */
export function bulkIssue(state: EngineState, items: NewChequeInput[]): { state: EngineState; outcomes: { i: number; ndci?: string; error?: string }[] } {
  if (!items.length) throw new EngineError("Empty batch");
  const ent = entitlementSummary(state, items[0].drawerId);
  if (ent && ent.available < items.length) throw new EngineError(`Batch needs ${items.length} entitlements but only ${ent.available} available — nothing released`);
  let s = state;
  const outcomes: { i: number; ndci?: string; error?: string }[] = [];
  items.forEach((it, i) => {
    try {
      const out = createRequestExt(s, it);
      s = out.state;
      outcomes.push({ i, ndci: out.ndci });
    } catch (e) {
      outcomes.push({ i, error: (e as Error).message });
    }
  });
  return { state: s, outcomes };
}

// ---------------- 3. Review & sign ----------------
export function signTerms(
  state: EngineState,
  input: NewChequeInput & { signatory: string },
  opts: { authMethod: SigningSession["authMethod"]; signMethod: SigningSession["signMethod"]; fail?: boolean },
): { state: EngineState; sessionId: string; ok: boolean } {
  const s = clone(state);
  tick(s, 10_000);
  const id = nextId(s, "SIG");
  const hash = termsHash(input);
  const providerRef = opts.signMethod === "uae_pass" ? `UAEPASS-SIM-${id.slice(-6)}` : `PROVIDER-SIM-${id.slice(-6)}`;
  s.ext.signing[id] = {
    id, customerId: input.drawerId, signatory: input.signatory, authorityRef: CORPORATE.has(input.drawerId) ? "Board resolution BR-2026-07 (demo)" : "Account holder",
    authMethod: opts.authMethod, signMethod: opts.signMethod, providerRef, docVersion: 1, hash, consentAt: s.now,
    result: opts.fail ? "failed" : "signed", evidence: opts.fail ? "Provider returned SIGN_TIMEOUT (simulated)" : `Simulated signature over ${hash.slice(0, 16)}…`,
  };
  audit(s, "customer", opts.fail ? "Signing failed (simulated)" : "Terms signed (simulated)", undefined, input.issuingBank, { correlation: id, evidence: providerRef });
  return { state: s, sessionId: id, ok: !opts.fail };
}

/** Create the request with purpose/obligation details, bound to signing evidence */
export function createRequestExt(
  state: EngineState,
  input: NewChequeInput & { obligation?: { ref: string; kind: string; counterparty: string; startDate: number; completionDate?: number; securityAmount?: number; closureParty: string } },
): { state: EngineState; ndci: string } {
  if (!input.purposeCategory) throw new EngineError("Cheque purpose is mandatory");
  if (input.purposeCategory === "other" && !input.remarks?.trim()) throw new EngineError("Explain the purpose when choosing Other");
  let s = state;
  let obligationId = input.obligationId;
  if (input.obligation && !obligationId) {
    s = clone(s);
    obligationId = nextId(s, "OBL");
    s.ext.obligations[obligationId] = { id: obligationId, status: "active", ...input.obligation };
  }
  const { obligation: _o, ...rest } = input;
  const out = createRequest(s, { ...rest, obligationId });
  const c = out.state.cheques[out.ndci];
  c.purposeCategory = input.purposeCategory;
  c.obligationId = obligationId;
  c.signingSessionId = input.signingSessionId;
  return out;
}

// ---------------- 4. Copies ----------------
export function accessCopy(state: EngineState, ndci: string, customerId: string, event: "opened" | "downloaded" | "printed"): EngineState {
  const s = clone(state);
  const c = get(s, ndci);
  if (c.drawerId !== customerId && c.beneficiaryId !== customerId) throw new EngineError("Not a party to this instrument");
  tick(s, 2_000);
  s.ext.copies.push({ id: nextId(s, "CPY"), ndci, party: c.drawerId === customerId ? "issuer" : "beneficiary", customerId, event, docVersion: c.version, hash: c.hash ?? "", at: s.now });
  audit(s, c.drawerId === customerId ? "customer" : "beneficiary", `Copy ${event}`, ndci);
  return s;
}

// ---------------- 5. e-Deposit ----------------
export function depositStage(c: Cheque): string {
  const m: Partial<Record<Status, string>> = {
    deposited: "Bank validation pending", accepted: "Accepted for presentment", presented: "Awaiting payment decision",
    paid: "Awaiting settlement", settled: "Settled — awaiting credit", credited: "Realized",
  };
  if (c.status === "rejected" && c.depositRef) return `Rejected — ${c.returnReason ?? ""}`;
  if (c.status === "returned") return `Returned — ${c.returnReason ?? ""}`;
  return m[c.status] ?? "Not deposited";
}
export function eDeposit(state: EngineState, ndci: string, customerId: string, acct: string, channel: "manual" | "auto" = "manual"): EngineState {
  const c = get(state, ndci);
  if (c.beneficiaryId !== customerId) throw new EngineError("Ownership check failed — only the beneficiary may deposit");
  if (!c.hash) throw new EngineError("Instrument not issued");
  if (["stopped", "cancelled", "replaced", "released"].includes(c.status)) throw new EngineError(`Instrument is ${STATUS_LABEL[c.status]} — deposit refused`);
  if (channel === "auto" && c.classification === "security") throw new EngineError("Security cheques are excluded from auto-deposit");
  if (!acct) throw new EngineError("Select an eligible receiving account");
  if (state.ext.requests.some((r) => r.ndci === ndci && ["awaiting_counterparty", "awaiting_bank", "queried"].includes(r.status) && r.type !== "acknowledge"))
    throw new EngineError("A service request is open on this instrument — deposit held until it is decided");
  const s = deposit(state, ndci);
  audit(s, "beneficiary", `e-Deposit submitted (${channel})`, ndci, c.payeeBank, { correlation: s.cheques[ndci].depositRef });
  return s;
}

// ---------------- 6. Auto-deposit ----------------
export function createMandate(
  state: EngineState,
  m: { customerId: string; scope: "cheque" | "standing"; ndci?: string; acct: string; maxAmount: number; schedule: "maturity" | "date"; executeOn?: number },
): EngineState {
  if (m.ndci) {
    const c = get(state, m.ndci);
    if (c.classification === "security") throw new EngineError("Security cheques cannot be enrolled in auto-deposit");
    if (c.beneficiaryId !== m.customerId) throw new EngineError("Only the beneficiary can enrol this cheque");
  }
  if (!(m.maxAmount > 0)) throw new EngineError("Set a mandate amount limit");
  const s = clone(state);
  tick(s);
  const id = nextId(s, "MND");
  s.ext.mandates.push({ id, ...m, status: "active", consentAt: s.now });
  audit(s, "beneficiary", `Auto-deposit mandate granted (${m.scope})`, m.ndci, undefined, { correlation: id, evidence: `Limit ${fmtAmt(m.maxAmount)} → ${m.acct}` });
  notify(s, m.customerId, `Auto-deposit mandate ${id} active. Pause or revoke any time.`, m.ndci);
  return syncSchedules(s);
}
export function setMandate(state: EngineState, id: string, status: "active" | "paused" | "revoked"): EngineState {
  const s = clone(state);
  const m = s.ext.mandates.find((x) => x.id === id);
  if (!m) throw new EngineError("Mandate not found");
  if (m.status === "revoked") throw new EngineError("Mandate already revoked");
  tick(s);
  m.status = status;
  s.ext.autoRuns.filter((r) => r.mandateId === id && (r.status === "scheduled" || r.status === "paused")).forEach((r) => (r.status = status === "revoked" ? "revoked" : status === "paused" ? "paused" : "scheduled"));
  audit(s, "beneficiary", `Auto-deposit mandate ${status}`, m.ndci, undefined, { correlation: id });
  return s;
}
function mandateTargets(s: EngineState, mId: string): Cheque[] {
  const m = s.ext.mandates.find((x) => x.id === mId)!;
  return Object.values(s.cheques).filter(
    (c) => c.beneficiaryId === m.customerId && c.hash && c.classification !== "security" && ["delivered", "verified"].includes(c.status) && c.amount <= m.maxAmount && (m.scope === "standing" || c.ndci === m.ndci),
  );
}
function syncSchedules(s: EngineState): EngineState {
  for (const m of s.ext.mandates.filter((x) => x.status === "active")) {
    for (const c of mandateTargets(s, m.id)) {
      if (!s.ext.autoRuns.some((r) => r.mandateId === m.id && r.ndci === c.ndci))
        s.ext.autoRuns.push({ id: nextId(s, "ADX"), mandateId: m.id, ndci: c.ndci, status: "scheduled", attempts: 0, at: s.now });
    }
  }
  return s;
}
/** Execute due auto-deposits. Idempotent: never submits a cheque twice. */
export function runAutoDeposits(state: EngineState): { state: EngineState; submitted: number } {
  let s = syncSchedules(clone(state));
  let submitted = 0;
  for (const run of s.ext.autoRuns.filter((r) => r.status === "scheduled" || r.status === "failed")) {
    const m = s.ext.mandates.find((x) => x.id === run.mandateId)!;
    const c = s.cheques[run.ndci];
    const due = m.schedule === "date" && m.executeOn ? Math.max(m.executeOn, c.payableDate) : c.payableDate;
    if (dubaiDay(s.now) < dubaiDay(due)) continue;
    const r = s.ext.autoRuns.find((x) => x.id === run.id)!;
    if (m.status !== "active") { r.status = m.status === "revoked" ? "revoked" : "paused"; continue; }
    if (c.depositRef) { r.status = "submitted"; r.depositRef = c.depositRef; r.reason = "Already deposited — no duplicate submitted"; continue; }
    r.attempts += 1;
    try {
      s = eDeposit(s, c.ndci, m.customerId, m.acct, "auto");
      const rr = s.ext.autoRuns.find((x) => x.id === run.id)!;
      rr.status = "submitted";
      rr.depositRef = s.cheques[c.ndci].depositRef;
      rr.at = s.now;
      notify(s, m.customerId, `Auto-deposit submitted for cheque ${c.chequeNo} (${fmtAmt(c.amount)}). Clearing and credit follow separately.`, c.ndci);
      submitted++;
    } catch (e) {
      r.status = "failed";
      r.reason = (e as Error).message;
      r.at = s.now;
    }
  }
  return { state: s, submitted };
}

// ---------------- 7. Service requests ----------------
export function roleOf(c: Cheque, customerId: string): "issuer" | "beneficiary" | null {
  return c.drawerId === customerId ? "issuer" : c.beneficiaryId === customerId ? "beneficiary" : null;
}
export function createServiceRequest(
  state: EngineState,
  r: { type: ServiceType; ndci: string; by: string; reason: string; evidence?: string; proposed?: { amount?: number; payableDate?: number } },
): { state: EngineState; id: string } {
  const c = get(state, r.ndci);
  const rule = state.ext.matrix[r.type];
  const role = roleOf(c, r.by);
  if (!role) throw new EngineError("Only the issuer or beneficiary can raise a request");
  if (!rule.initiators.includes(role)) throw new EngineError(`${rule.label} cannot be initiated by the ${role}`);
  if (!rule.eligible.includes(c.status)) throw new EngineError(`${rule.label} not allowed while instrument is "${STATUS_LABEL[c.status]}"`);
  if (rule.securityOnly && c.classification !== "security") throw new EngineError("Release applies only to security cheques");
  if (!r.reason.trim()) throw new EngineError("A reason is required");
  if ((r.type === "amend" || r.type === "replace") && r.type === "amend" && !r.proposed) throw new EngineError("Provide the proposed new terms");
  if (state.ext.requests.some((x) => x.ndci === r.ndci && x.type === r.type && ["awaiting_counterparty", "queried", "awaiting_bank"].includes(x.status)))
    throw new EngineError("A request of this type is already open for this instrument");
  const s = clone(state);
  tick(s);
  const id = nextId(s, "SRQ");
  const status: ServiceRequest["status"] = rule.counterpartyConsent ? "awaiting_counterparty" : rule.bank !== "none" ? "awaiting_bank" : "completed";
  s.ext.requests.unshift({
    id, type: r.type, ndci: r.ndci, initiatorId: r.by, initiatorRole: role, reason: r.reason, evidence: r.evidence, proposed: r.proposed,
    status, responses: [], decisions: [], correlation: nextId(s, "COR"), createdAt: s.now, expiresAt: s.now + rule.expiryDays * DAY,
  });
  if (r.type === "security_release") {
    const o = c.obligationId ? s.ext.obligations[c.obligationId] : undefined;
    if (o && o.status === "active") o.status = "completion_claimed";
  }
  audit(s, role === "issuer" ? "customer" : "beneficiary", `Service request: ${rule.label}`, r.ndci, c.issuingBank, { correlation: id, reason: r.reason, evidence: r.evidence });
  const counter = role === "issuer" ? c.beneficiaryId : c.drawerId;
  if (rule.counterpartyConsent) notify(s, counter, `${rule.label} requested on cheque ${c.chequeNo} — your response is needed`, r.ndci);
  else if (rule.bank !== "none") notify(s, `bank:${c.issuingBank}`, `${rule.label} awaiting bank review`, r.ndci);
  return { state: s, id };
}
export function respondServiceRequest(state: EngineState, id: string, by: string, decision: "accept" | "reject" | "query" | "answer", note: string): EngineState {
  const s = clone(state);
  const r = s.ext.requests.find((x) => x.id === id);
  if (!r) throw new EngineError("Request not found");
  const c = get(s, r.ndci);
  const role = roleOf(c, by);
  const isCounter = role && role !== r.initiatorRole;
  if (decision === "answer") {
    if (by !== r.initiatorId || r.status !== "queried") throw new EngineError("Only the initiator can answer an open query");
    r.status = "awaiting_counterparty";
  } else {
    if (!isCounter) throw new EngineError("Only the counterparty can respond");
    if (r.status !== "awaiting_counterparty") throw new EngineError("Request is not awaiting counterparty response");
    const rule = s.ext.matrix[r.type];
    r.status = decision === "accept" ? (rule.bank !== "none" ? "awaiting_bank" : "completed") : decision === "reject" ? "rejected" : "queried";
    if (r.type === "security_release" && decision === "reject" && c.obligationId) s.ext.obligations[c.obligationId].status = "disputed";
  }
  tick(s);
  r.responses.push({ by, decision, note, at: s.now });
  audit(s, role === "issuer" ? "customer" : "beneficiary", `Counterparty ${decision}: ${s.ext.matrix[r.type].label}`, r.ndci, c.issuingBank, { correlation: r.id, reason: note });
  notify(s, decision === "answer" ? (r.initiatorRole === "issuer" ? c.beneficiaryId : c.drawerId) : r.initiatorId, `Request ${r.id}: counterparty ${decision}${note ? ` — ${note}` : ""}`, r.ndci);
  if (r.status === "awaiting_bank") notify(s, `bank:${c.issuingBank}`, `${s.ext.matrix[r.type].label} ready for bank decision`, r.ndci);
  return s;
}
/** Bank decision: the only step that changes the authoritative instrument status */
export function bankDecideRequest(state: EngineState, id: string, approve: boolean, reason: string, officer = "Bank officer"): EngineState {
  let s = clone(state);
  const r = s.ext.requests.find((x) => x.id === id);
  if (!r) throw new EngineError("Request not found");
  if (r.status !== "awaiting_bank") throw new EngineError("Request is not awaiting a bank decision");
  if (!reason.trim()) throw new EngineError("Decision reason is required");
  const c = get(s, r.ndci);
  const rule = s.ext.matrix[r.type];
  tick(s);
  const decision = { by: officer, institution: bankById(c.issuingBank).name, approve, reason, at: s.now, correlation: r.correlation };
  if (approve && !rule.eligible.includes(c.status)) {
    r.status = "rejected";
    r.decisions.push({ ...decision, approve: false, reason: `Instrument moved to "${STATUS_LABEL[c.status]}" — request cannot be applied` });
    audit(s, "issuing_bank", "Service request blocked by guarded state check", c.ndci, c.issuingBank, { correlation: r.id });
    throw err(`Instrument is now "${STATUS_LABEL[c.status]}" — request cannot be applied`, s);
  }
  r.decisions.push(decision);
  if (!approve) {
    r.status = "rejected";
    if (r.type === "security_release" && c.obligationId) s.ext.obligations[c.obligationId].status = "disputed";
  } else {
    r.status = "approved";
    const cc = s.cheques[r.ndci];
    if (r.type === "stop") s = stop(s, r.ndci, `Stop payment: ${r.reason}`);
    else if (r.type === "cancel") { move(s, cc, "cancelled", "issuing_bank", r.reason); releaseReservation(s, cc, "cancelled before issuance"); }
    else if (r.type === "objection" || r.type === "acknowledge") cc.events.push({ status: "note", label: rule.label, at: s.now, actor: "issuing_bank", detail: r.reason });
    else if (r.type === "amend" || r.type === "replace") s = replaceInstrument(s, r.id);
    else if (r.type === "security_release") {
      move(s, cc, "released", "issuing_bank", "Authorized security release");
      if (cc.obligationId) { const o = s.ext.obligations[cc.obligationId]; o.status = "completed"; o.completionDate = o.completionDate ?? s.now; }
      s.ext.releases.push({ id: nextId(s, "REL"), ndci: cc.ndci, obligationId: cc.obligationId, outcome: "Security released — native digital instrument closed", by: officer, at: s.now, ref: r.correlation });
    }
    const rr = s.ext.requests.find((x) => x.id === id)!;
    if (rr.status === "approved") rr.status = "completed";
  }
  const c2 = s.cheques[r.ndci];
  audit(s, "issuing_bank", `Bank ${approve ? "approved" : "rejected"}: ${rule.label}`, c2.ndci, c2.issuingBank, { correlation: r.id, reason, institution: bankById(c2.issuingBank).name });
  for (const to of [c2.drawerId, c2.beneficiaryId]) notify(s, to, `${rule.label} ${approve ? "approved" : "rejected"} by ${bankById(c2.issuingBank).name}: ${reason}`, c2.ndci);
  return s;
}
/** Controlled replacement: dispose of original first, then a new linked NDCI awaiting authorization */
function replaceInstrument(state: EngineState, reqId: string): EngineState {
  let s = state;
  const r = s.ext.requests.find((x) => x.id === reqId)!;
  const o = s.cheques[r.ndci];
  move(s, o, "replaced", "issuing_bank", "Superseded by controlled replacement");
  const input: NewChequeInput = {
    issuingBank: o.issuingBank, payeeBank: o.payeeBank, drawer: o.drawer, drawerId: o.drawerId, drawerAcct: o.drawerAcct, beneficiary: o.beneficiary,
    beneficiaryId: o.beneficiaryId, beneficiaryAcct: o.beneficiaryAcct, amount: r.proposed?.amount ?? o.amount, payableDate: r.proposed?.payableDate ?? o.payableDate,
    purpose: o.purpose, remarks: `Replacement of ${o.ndci}`, purposeCategory: o.purposeCategory, classification: o.classification, obligationId: o.obligationId,
  };
  const out = createRequest(s, input);
  s = out.state;
  const n = s.cheques[out.ndci];
  n.replaces = o.ndci;
  n.purposeCategory = o.purposeCategory;
  n.obligationId = o.obligationId;
  n.version = o.version + 1;
  s.cheques[o.ndci].supersededBy = out.ndci;
  s.ext.requests.find((x) => x.id === reqId)!.replacementNdci = out.ndci;
  audit(s, "edc", `Replacement ${out.ndci} linked to ${o.ndci}`, out.ndci, o.issuingBank, { correlation: r.correlation });
  return s;
}
export function claimObligationComplete(state: EngineState, obligationId: string, by: string, evidence: string): EngineState {
  const s = clone(state);
  const o = s.ext.obligations[obligationId];
  if (!o) throw new EngineError("Obligation not found");
  tick(s);
  o.status = "completion_claimed";
  o.evidence = evidence;
  audit(s, "customer", `Obligation completion claimed (${o.ref}) — does not release the cheque`, undefined, undefined, { evidence, reason: by });
  return s;
}
export function securityStatus(s: EngineState, c: Cheque): string {
  if (c.status === "released") return "Security released";
  if (c.status === "returned") return "Returned unpaid";
  const r = s.ext.requests.find((x) => x.ndci === c.ndci && x.type === "security_release");
  if (r?.status === "rejected") return "Release disputed / rejected";
  if (r && ["awaiting_counterparty", "awaiting_bank", "queried"].includes(r.status)) return "Security release requested";
  return "Held";
}

// ---------------- 1. AI assistant (rule-based, tools over permitted records only) ----------------
export function issuanceCheck(state: EngineState, d: Partial<NewChequeInput>) {
  const findings: { tone: "ok" | "warn" | "block"; text: string }[] = [];
  if (!d.beneficiaryId) findings.push({ tone: "block", text: "Beneficiary missing" });
  if (!(d.amount && d.amount > 0)) findings.push({ tone: "block", text: "Amount missing or zero" });
  if (!d.purposeCategory) findings.push({ tone: "block", text: "Purpose category missing (mandatory)" });
  if (!d.payableDate) findings.push({ tone: "block", text: "Payable date missing" });
  const ent = d.drawerId ? entitlementSummary(state, d.drawerId) : null;
  if (ent) findings.push(ent.available > 0 ? { tone: "ok", text: `Entitlement: ${ent.available} cheque(s) available (separate from balance)` } : { tone: "block", text: "No cheque entitlement available — request more from your bank" });
  const dup = Object.values(state.cheques).find((c) => c.drawerId === d.drawerId && c.beneficiaryId === d.beneficiaryId && c.amount === d.amount && !["cancelled", "replaced", "rejected", "stopped", "credited"].includes(c.status));
  if (dup) findings.push({ tone: "warn", text: `Possible duplicate: ${dup.ndci} for the same beneficiary and amount (${STATUS_LABEL[dup.status]})` });
  if (d.drawerId) {
    const bal = state.balances[d.drawerId] ?? 0;
    const upcoming = Object.values(state.cheques).filter((c) => c.drawerId === d.drawerId && ["requested", "authorized", ...ACTIVE, "deposited", "accepted", "presented"].includes(c.status)).reduce((a, c) => a + c.amount, 0);
    const total = upcoming + (d.amount ?? 0);
    findings.push(total > bal ? { tone: "warn", text: `Funding gap: commitments ${fmtAmt(total)} exceed simulated balance ${fmtAmt(bal)}` } : { tone: "ok", text: `Commitments ${fmtAmt(total)} within simulated balance ${fmtAmt(bal)}` });
  }
  return findings;
}

export function agentScan(state: EngineState, scope: "customer" | "edc", customerId?: string): EngineState {
  const s = clone(state);
  tick(s, 5_000);
  s.ext.agent = s.ext.agent.filter((a) => !(a.status === "open" && a.scope === scope && a.customerId === customerId));
  const add = (a: Omit<AgentRecommendation, "id" | "scope" | "customerId" | "status" | "at">) => {
    if (s.ext.agent.some((x) => x.trigger === a.trigger && x.records.join() === a.records.join() && x.status !== "dismissed" && x.customerId === customerId)) return;
    s.ext.agent.unshift({ ...a, id: nextId(s, "AGT"), scope, customerId, status: "open", at: s.now });
  };
  const list = Object.values(s.cheques);
  const mine = scope === "customer" ? list.filter((c) => c.drawerId === customerId || c.beneficiaryId === customerId) : list;
  // security cheques whose obligation is completed / claimed with no release request
  for (const c of mine.filter((x) => x.classification === "security" && ACTIVE.includes(x.status))) {
    const o = c.obligationId ? s.ext.obligations[c.obligationId] : undefined;
    const open = s.ext.requests.some((r) => r.ndci === c.ndci && r.type === "security_release" && r.status !== "rejected");
    if (o && (o.status === "completed" || o.status === "completion_claimed") && !open)
      add({
        trigger: "Linked obligation marked completed", records: [c.ndci, o.id], cls: "C", approvalRequired: true,
        findings: [`Security cheque ${c.chequeNo} (${fmtAmt(c.amount)}) held by ${c.beneficiary}`, `Obligation ${o.ref} status: ${o.status.replace("_", " ")}`, "No release request exists"],
        references: [o.ref, c.ndci], recommendation: "Prepare a security release request for your review and submission", action: { kind: "draft_release", ndci: c.ndci },
      });
  }
  // approaching payable dates (payment cheques)
  for (const c of mine.filter((x) => ACTIVE.includes(x.status) && x.classification !== "security")) {
    const days = Math.round((c.payableDate - dubaiDay(s.now)) / DAY);
    if (days >= 0 && days <= 7) {
      const isBen = scope === "customer" && c.beneficiaryId === customerId;
      const hasMandate = s.ext.mandates.some((m) => m.status === "active" && m.customerId === c.beneficiaryId && (m.scope === "standing" || m.ndci === c.ndci));
      add({
        trigger: days === 0 ? "Cheque payable today" : `Payable in ${days} day(s)`, records: [c.ndci], cls: isBen && !hasMandate ? "B" : "A", approvalRequired: isBen && !hasMandate,
        findings: [`${fmtAmt(c.amount)} ${c.drawer} → ${c.beneficiary}`, `Payable ${fmtDate(c.payableDate)}`, hasMandate ? "Auto-deposit mandate covers it" : "No auto-deposit mandate"],
        references: [c.ndci], recommendation: isBen && !hasMandate ? "Prepare an e-deposit schedule (per-cheque auto-deposit) for your consent" : "Ensure funds are available on the payable date",
        action: isBen && !hasMandate ? { kind: "draft_auto_deposit", ndci: c.ndci } : undefined,
      });
    }
  }
  for (const c of mine.filter((x) => x.status === "returned").slice(0, 3))
    add({ trigger: "Returned item", records: [c.ndci], cls: "A", approvalRequired: false, findings: [`Returned unpaid: ${c.returnReason ?? "—"}`, `Remarks (treated as data): "${c.remarks ?? ""}"`], references: [c.ndci], recommendation: "Contact the counterparty; a new instrument requires fresh issuance" });
  if (scope === "customer" && customerId) {
    const e = entitlementSummary(s, customerId);
    if (e && e.available <= 1)
      add({ trigger: "Low cheque entitlement", records: [e.id], cls: "B", approvalRequired: true, findings: [`Available: ${e.available} of ${e.allocated}`, `Reserved: ${e.reserved}`], references: [e.id], recommendation: "Prepare a request for 10 additional cheques", action: { kind: "draft_entitlement" } });
    const pend = s.ext.requests.filter((r) => ["awaiting_counterparty", "queried"].includes(r.status) && roleOf(s.cheques[r.ndci], customerId) && r.initiatorId !== customerId);
    for (const r of pend) add({ trigger: "Your response is pending", records: [r.ndci, r.id], cls: "A", approvalRequired: false, findings: [`${s.ext.matrix[r.type].label}: ${r.reason}`], references: [r.id], recommendation: "Review and accept, reject or query in Service Requests" });
  } else {
    const pa = list.filter((c) => c.status === "requested" && s.now - c.createdAt > 3600_000);
    if (pa.length) add({ trigger: "Pending approvals over 1h", records: pa.slice(0, 5).map((c) => c.ndci), cls: "A", approvalRequired: false, findings: [`${pa.length} issuance requests awaiting bank authorization`], references: pa.slice(0, 5).map((c) => c.requestId), recommendation: "Prepare reminders to the issuing banks", action: { kind: "draft_reminder" } });
    const stale = list.filter((c) => c.status === "paid" && s.now - c.updatedAt > DAY);
    if (stale.length) add({ trigger: "Delayed settlement", records: stale.slice(0, 5).map((c) => c.ndci), cls: "A", approvalRequired: false, findings: [`${stale.length} paid items not settled within 24h`], references: stale.slice(0, 5).map((c) => c.clearingRef ?? c.ndci), recommendation: "Escalate to the clearing operator" });
    const openReq = s.ext.requests.filter((r) => ["awaiting_bank", "awaiting_counterparty", "queried"].includes(r.status));
    if (openReq.length) add({ trigger: "Open service requests", records: openReq.slice(0, 5).map((r) => r.ndci), cls: "A", approvalRequired: false, findings: openReq.slice(0, 5).map((r) => `${r.id} ${s.ext.matrix[r.type].label} — ${r.status.replace("_", " ")}`), references: openReq.map((r) => r.id), recommendation: "Monitor expiry; escalate items close to expiry" });
    if (s.retryQueue.length) add({ trigger: "Failed bank delivery / retry queue", records: s.retryQueue.map((j) => j.ndci), cls: "A", approvalRequired: false, findings: [`${s.retryQueue.length} jobs queued`], references: s.retryQueue.map((j) => j.id), recommendation: "Check bank link status and retry" });
  }
  audit(s, "system", `AI ${scope === "edc" ? "Operations" : "Cheque"} Assistant scan (read-only)`);
  return s;
}
/** Approval executes only the drafted, non-financial step (never signs, moves money or releases) */
export function decideAgent(state: EngineState, id: string, approve: boolean, by: string): EngineState {
  let s = clone(state);
  const a = s.ext.agent.find((x) => x.id === id);
  if (!a) throw new EngineError("Recommendation not found");
  if (a.status !== "open") throw new EngineError("Already decided");
  tick(s);
  if (!approve) { a.status = "dismissed"; a.auditRef = audit(s, "customer", "AI recommendation dismissed", a.records[0]); return s; }
  let result = "Acknowledged";
  const k = a.action?.kind;
  if (k === "draft_release" && a.action?.ndci) {
    const c = s.cheques[a.action.ndci];
    const out = createServiceRequest(s, { type: "security_release", ndci: c.ndci, by: by, reason: `Linked obligation ${c.obligationId ? s.ext.obligations[c.obligationId].ref : ""} completed`, evidence: "AI-prepared draft approved by customer" });
    s = out.state; result = `Release request ${out.id} submitted after your approval — holder must confirm and bank must decide`;
  } else if (k === "draft_entitlement" && a.customerId) { s = requestEntitlement(s, a.customerId, 10); result = "Entitlement request for 10 cheques sent to your bank"; }
  else if (k === "draft_auto_deposit" && a.action?.ndci) {
    const c = s.cheques[a.action.ndci];
    s = createMandate(s, { customerId: c.beneficiaryId, scope: "cheque", ndci: c.ndci, acct: c.beneficiaryAcct, maxAmount: c.amount, schedule: "maturity" });
    result = "Per-cheque auto-deposit mandate created with your consent";
  } else if (k === "draft_reminder") result = "Reminders prepared for the issuing banks (demo)";
  const aa = s.ext.agent.find((x) => x.id === id)!;
  aa.status = "approved";
  aa.result = result;
  aa.auditRef = audit(s, a.scope === "edc" ? "edc" : "customer", `AI recommendation approved: ${a.recommendation}`, a.records[0], undefined, { reason: by, correlation: id });
  return s;
}

// ---------------- 10. Liability & commitments ----------------
export interface LiabFilter { bank?: string; purpose?: string; cls?: "payment" | "security" | ""; q?: string }
export const LIAB_VIEWS = [
  { k: "A", label: "Outstanding payment cheques" },
  { k: "B", label: "Future-dated payment commitments" },
  { k: "C", label: "Security cheques held" },
  { k: "D", label: "Security release requests pending" },
  { k: "E", label: "Presented / awaiting decision" },
  { k: "F", label: "Awaiting settlement or credit" },
  { k: "G", label: "Returned unpaid" },
  { k: "H", label: "Stopped, cancelled, replaced, released" },
] as const;
export function liabilityView(s: EngineState, c: Cheque): (typeof LIAB_VIEWS)[number]["k"] | null {
  const sec = c.classification === "security";
  const pendingRel = s.ext.requests.some((r) => r.ndci === c.ndci && r.type === "security_release" && ["awaiting_counterparty", "awaiting_bank", "queried"].includes(r.status));
  if (["stopped", "cancelled", "replaced", "released"].includes(c.status)) return "H";
  if (c.status === "returned") return "G";
  if (["paid", "settled"].includes(c.status)) return "F";
  if (["deposited", "accepted", "presented"].includes(c.status)) return "E";
  if (ACTIVE.includes(c.status)) return sec ? (pendingRel ? "D" : "C") : c.payableDate > dubaiDay(s.now) ? "B" : "A";
  return null;
}
export function liabilityReport(s: EngineState, f: LiabFilter = {}) {
  const rows = Object.values(s.cheques).filter((c) =>
    (!f.bank || c.issuingBank === f.bank || c.payeeBank === f.bank) && (!f.purpose || c.purposeCategory === f.purpose) && (!f.cls || (c.classification ?? "payment") === f.cls) &&
    (!f.q || `${c.ndci} ${c.drawer} ${c.beneficiary} ${c.obligationId ? s.ext.obligations[c.obligationId]?.ref : ""}`.toLowerCase().includes(f.q.toLowerCase())),
  );
  const views = Object.fromEntries(LIAB_VIEWS.map((v) => [v.k, { count: 0, value: 0, rows: [] as Cheque[] }])) as Record<"A" | "B" | "C" | "D" | "E" | "F" | "G" | "H", { count: number; value: number; rows: Cheque[] }>;
  for (const c of rows) { const k = liabilityView(s, c); if (k) { views[k].count++; views[k].value += c.amount; views[k].rows.push(c); } }
  const activePayment = views.A.value + views.B.value; // superseded originals sit in H, never here
  const securityFace = views.C.value + views.D.value;
  const byObl = new Map<string, Cheque[]>();
  [...views.A.rows, ...views.B.rows, ...views.C.rows, ...views.D.rows].forEach((c) => c.obligationId && byObl.set(c.obligationId, [...(byObl.get(c.obligationId) ?? []), c]));
  const overlaps = [...byObl.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => ({ obligation: s.ext.obligations[k]?.ref ?? k, items: v.map((c) => c.ndci) }));
  const months: { m: string; value: number; count: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(s.now); d.setUTCMonth(d.getUTCMonth() + i, 1);
    const key = d.toISOString().slice(0, 7);
    const inM = views.B.rows.concat(views.A.rows).filter((c) => new Date(c.payableDate).toISOString().slice(0, 7) === key);
    months.push({ m: d.toLocaleString("en-GB", { month: "short", year: "2-digit" }), value: inM.reduce((a, c) => a + c.amount, 0), count: inM.length });
  }
  const ageing = [7, 30, 90, Infinity].map((lim, i, arr) => {
    const lo = i ? arr[i - 1] : 0;
    const r = views.A.rows.filter((c) => { const d = (s.now - c.payableDate) / DAY; return d >= lo && d < lim; });
    return { band: lim === Infinity ? `>${lo}d` : `${lo}–${lim}d`, count: r.length, value: r.reduce((a, c) => a + c.amount, 0) };
  });
  return { views, activePayment, securityFace, returned: views.G.value, overlaps, months, ageing, pendingRequests: s.ext.requests.filter((r) => ["awaiting_counterparty", "awaiting_bank", "queried"].includes(r.status)).length, rows };
}
export function liabilityCsv(s: EngineState, rows: Cheque[]): string {
  const head = ["NDCI", "View", "Classification", "Purpose", "Issuer", "Beneficiary", "Issuing bank", "Collecting bank", "Amount", "Currency", "Payable", "Status", "Obligation ref"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [head.join(","), ...rows.map((c) => [c.ndci, liabilityView(s, c) ?? "", c.classification ?? "payment", c.purposeCategory ? PURPOSE_LABEL[c.purposeCategory] : c.purpose, c.drawer, c.beneficiary, c.issuingBank, c.payeeBank, c.amount.toFixed(2), c.currency, fmtDate(c.payableDate), STATUS_LABEL[c.status], c.obligationId ? s.ext.obligations[c.obligationId]?.ref ?? "" : ""].map((v) => esc(String(v))).join(","))].join("\n");
}

// ---------------- 11. Commercial ----------------
export function setCommercial(state: EngineState, p: Partial<CommercialAssumptions>): EngineState {
  const s = clone(state);
  s.ext.commercial = { ...s.ext.commercial, ...p };
  return s;
}
export function commercialModel(a: CommercialAssumptions) {
  const instruments = a.monthlyInstruments * (a.adoptionPct / 100);
  const revenueYear = a.banks * a.onboardingFee + 12 * (a.banks * (a.subscriptionPerBankMonth + a.aiPackagePerBankMonth) + instruments * a.perInstrumentFee);
  const costYear = 12 * (a.fixedOpexMonth + instruments * a.variableCostPerInstrument);
  return { instrumentsMonth: instruments, revenueYear, costYear, contributionYear: revenueYear - costYear };
}

export { digest };
