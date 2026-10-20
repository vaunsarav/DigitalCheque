import { BANKS, MILESTONES, STATUS_LABEL, authorize, canonical, checkerApprove, digest, issue, ndciFor } from "./engine";
import { createRequestExt, emptyExt } from "./ext";
import type { Actor, BankId, Cheque, ChequeEvent, EngineState, PurposeCategory, Status } from "./types";
import { DAY, dubaiDay } from "./format";

/** Demo "today": 13 Oct 2026, 08:00 Dubai */
export const BASE_NOW = Date.UTC(2026, 9, 13, 4, 0, 0);

export interface Persona {
  id: string;
  name: string;
  bank: BankId;
  acct: string;
  kind: "individual" | "corporate";
}

export const PERSONAS: Persona[] = [
  { id: "CUST-AHMED", name: "Ahmed Al Mansoori", bank: "ENBD", acct: "AE07 0260 0010 1234 5678 901", kind: "individual" },
  { id: "CUST-FATIMA", name: "Fatima Al Hashimi", bank: "ADCB", acct: "AE45 0030 0000 9876 5432 100", kind: "individual" },
  { id: "CUST-OMAR", name: "Omar Trading LLC", bank: "RAKBANK", acct: "AE21 0400 0002 2233 4455 667", kind: "corporate" },
  { id: "CUST-LAYLA", name: "Layla Properties FZE", bank: "MASHREQ", acct: "AE56 0330 0000 1010 2020 303", kind: "corporate" },
  { id: "CUST-KHALID", name: "Khalid Al Suwaidi", bank: "DIB", acct: "AE88 0240 0015 7788 9900 112", kind: "individual" },
];
export const personaById = (id: string) => PERSONAS.find((p) => p.id === id);

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Mohammed", "Aisha", "Saeed", "Mariam", "Rashid", "Noura", "Hamdan", "Sara", "Yousef", "Hessa", "Ali", "Latifa", "Priya", "Rahul", "John", "Elena"];
const LAST = ["Al Falasi", "Al Nuaimi", "Al Marri", "Al Ketbi", "Al Shamsi", "Al Zaabi", "Khan", "Menon", "Smith", "Petrova", "Al Mazrouei"];
const CORP = ["Gulf Logistics LLC", "Desert Rose Trading", "Marina Contracting", "Al Noor Medical", "Falcon Auto Parts", "Palm Interiors", "Emirates Foods Co.", "Sky Tower Properties", "Creek Textiles"];
const PURPOSES = ["Rent payment", "Supplier invoice", "Security deposit", "Tuition fees", "Vehicle purchase", "Contract milestone", "Personal transfer", "Service fees"];
const RETURN_REASONS = ["Insufficient funds", "Signature verification failed", "Account closed", "Stop payment by drawer", "Post-dated presentment"];

const PURPOSE_CAT: Record<string, PurposeCategory> = {
  "Rent payment": "rent", "Supplier invoice": "supplier", "Security deposit": "security", "Tuition fees": "other", "Vehicle purchase": "other",
  "Contract milestone": "milestone", "Personal transfer": "other", "Service fees": "supplier",
};

export function makeSeed({ freshCustomers = false }: { freshCustomers?: boolean } = {}): EngineState {
  const r = mulberry32(20261013);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const name = () => (r() < 0.3 ? pick(CORP) : `${pick(FIRST)} ${pick(LAST)}`);
  const acct = () => `AE${Math.floor(10 + r() * 89)} 0${Math.floor(100 + r() * 899)} ${Math.floor(1000 + r() * 8999)} ${Math.floor(1000 + r() * 8999)} ${Math.floor(1000 + r() * 8999)}`;
  const weights: Record<BankId, number> = { ENBD: 0.26, FAB: 0.22, ADCB: 0.18, MASHREQ: 0.13, DIB: 0.12, RAKBANK: 0.09 };
  const bank = (): BankId => {
    let x = r();
    for (const b of BANKS) {
      x -= weights[b.id];
      if (x <= 0) return b.id;
    }
    return "ENBD";
  };
  const amount = () => {
    const x = r();
    const v = x < 0.45 ? 500 + r() * 9500 : x < 0.8 ? 10_000 + r() * 40_000 : x < 0.96 ? 50_000 + r() * 200_000 : 250_000 + r() * 1_500_000;
    return Math.round(v / 50) * 50;
  };

  const cheques: Record<string, Cheque> = {};
  const order: string[] = [];
  const N = 300;
  for (let i = 0; i < N; i++) {
    const daysAgo = Math.pow(r(), 0.8) * 90;
    const created = BASE_NOW - daysAgo * DAY - r() * 6 * 3600_000;
    const ib = bank();
    let pb = bank();
    if (r() < 0.2) pb = ib;
    const postDated = r() < 0.22;
    const payable = dubaiDay(created + (postDated ? (10 + r() * 140) * DAY : 0));
    // decide final status
    let final: Status;
    const age = (BASE_NOW - created) / DAY;
    const x = r();
    if (payable > BASE_NOW) final = pick(["delivered", "verified", "delivered"] as Status[]);
    else if (age < 1.5) final = pick(["requested", "authorized", "delivered", "deposited", "accepted", "presented", "paid"] as Status[]);
    else if (x < 0.045) final = "returned";
    else if (x < 0.06) final = "stopped";
    else if (x < 0.07) final = "rejected";
    else if (age < 4 && x < 0.2) final = pick(["presented", "paid", "settled"] as Status[]);
    else final = "credited";

    const n = 1000 + i;
    const ndci = ndciFor(2026, n);
    const c: Cheque = {
      ndci,
      requestId: `REQ-S${String(i).padStart(5, "0")}`,
      chequeNo: String(200000 + Math.floor(r() * 700000)),
      issuingBank: ib,
      payeeBank: pb,
      drawer: name(),
      drawerId: `DEMO-D${i}`,
      drawerAcct: acct(),
      beneficiary: name(),
      beneficiaryId: `DEMO-B${i}`,
      beneficiaryAcct: acct(),
      amount: amount(),
      currency: "AED",
      issueDate: dubaiDay(created),
      payableDate: payable,
      purpose: pick(PURPOSES),
      status: "requested",
      version: 1,
      createdAt: created,
      updatedAt: created,
      presentCount: 0,
      events: [],
    };
    // build events along path
    let t = created;
    const push = (st: Status, actor: Actor, detail?: string) => {
      c.events.push({ status: st, label: STATUS_LABEL[st], at: t, actor, detail } as ChequeEvent);
      c.status = st;
      c.updatedAt = t;
    };
    const actorOf: Partial<Record<Status, Actor>> = {
      requested: "customer", authorized: "issuing_bank", issued: "edc", delivered: "edc", verified: "beneficiary",
      deposited: "beneficiary", accepted: "payee_bank", presented: "payee_bank", paid: "issuing_bank", settled: "clearing", credited: "payee_bank",
    };
    const path = final === "returned" ? MILESTONES.slice(0, 8) : final === "stopped" ? MILESTONES.slice(0, 4) : final === "rejected" ? MILESTONES.slice(0, 1) : MILESTONES.slice(0, MILESTONES.indexOf(final) + 1);
    for (const st of path) {
      if (st === "deposited") t = Math.max(t, payable + 9 * 3600_000) + r() * 2 * DAY * (age > 10 ? 1 : 0.1);
      else t += (st === "requested" ? 0 : 60_000 + r() * (st === "authorized" ? 30 : st === "settled" ? 240 : 20) * 60_000);
      if (t > BASE_NOW) t = BASE_NOW - r() * 3600_000;
      push(st, actorOf[st]!);
      if (st === "issued") {
        c.docRef = `EDC-VAULT-${ndci.slice(-10)}`;
        c.certId = `EDC-CA-${ib}-2026-0${(i % 4) + 1}`;
        c.hash = digest(canonical(c));
        c.qrToken = `edc://verify/${ndci}?t=${c.hash.slice(0, 16)}`;
      }
      if (st === "presented") {
        c.presentCount = 1;
        c.clearingRef = `CLR-S${String(i).padStart(5, "0")}`;
      }
      if (st === "settled") c.settlementRef = `STL-S${String(i).padStart(5, "0")}`;
    }
    if (final === "returned" || final === "stopped" || final === "rejected") {
      t += 3600_000 * (1 + r() * 5);
      if (t > BASE_NOW) t = BASE_NOW - 60_000;
      c.returnReason = final === "stopped" ? "Stop payment by drawer" : final === "rejected" ? "Declined by issuing bank" : pick(RETURN_REASONS);
      push(final, final === "returned" || final === "stopped" ? "issuing_bank" : "issuing_bank", c.returnReason);
    }
    c.purposeCategory = PURPOSE_CAT[c.purpose] ?? "other";
    c.classification = c.purposeCategory === "security" ? "security" : "payment";
    cheques[ndci] = c;
    order.push(ndci);
  }
  order.sort((a, b) => cheques[b].updatedAt - cheques[a].updatedAt);

  const state: EngineState = {
    now: BASE_NOW,
    seq: 100,
    cheques,
    order,
    alerts: [],
    audit: [],
    bankLinks: { ENBD: "up", ADCB: "up", FAB: "up", MASHREQ: "up", RAKBANK: "up", DIB: "up" },
    retryQueue: [],
    balances: { "CUST-AHMED": 185_400, "CUST-FATIMA": 42_300, "CUST-OMAR": 96_000, "CUST-LAYLA": 12_750, "CUST-KHALID": 3_200 },
    verifications: 1842,
    ext: emptyExt(),
  };
  seedExt(state, freshCustomers);
  // seed a few historic alerts
  const list = order.map((k) => cheques[k]);
  const hv = list.filter((c) => c.amount >= 500_000).slice(0, 3);
  hv.forEach((c, k) => state.alerts.push({ id: `ALR-S${k}`, kind: "high_value", severity: "medium", ndci: c.ndci, bank: c.issuingBank, message: `High-value cheque AED ${c.amount.toLocaleString("en-AE")}`, at: c.createdAt, resolved: k > 0 }));
  const ret = list.filter((c) => c.status === "returned").slice(0, 2);
  ret.forEach((c, k) => state.alerts.push({ id: `ALR-R${k}`, kind: "abnormal_returns", severity: "low", ndci: c.ndci, bank: c.issuingBank, message: `Return: ${c.returnReason}`, at: c.updatedAt, resolved: true }));
  state.alerts.push({ id: "ALR-C1", kind: "certificate", severity: "medium", bank: "DIB", ndci: list.find((c) => c.issuingBank === "DIB" && c.hash)?.ndci, message: "Signing certificate EDC-CA-DIB-2026-02 expires in 21 days", at: BASE_NOW - 2 * DAY });
  state.alerts.sort((a, b) => b.at - a.at);
  list.slice(0, 40).forEach((c, k) => state.audit.push({ id: `AUD-S${k}`, at: c.updatedAt, actor: c.events[c.events.length - 1].actor, action: STATUS_LABEL[c.status], ndci: c.ndci, bank: c.issuingBank }));
  return state;
}

/** Persona-level demo data for the PRD v8 extensions */
function seedExt(state: EngineState, freshCustomers: boolean) {
  const ents: [string, BankId, number, number][] = [["CUST-AHMED", "ENBD", 25, 6], ["CUST-FATIMA", "ADCB", 10, 2], ["CUST-OMAR", "RAKBANK", 50, 12], ["CUST-LAYLA", "MASHREQ", 12, 0], ["CUST-KHALID", "DIB", 8, 3]];
  ents.forEach(([id, bank, allocated, consumed], i) => {
    state.ext.entitlements[id] = { id: `ENT-${bank}-${String(i + 1).padStart(3, "0")}`, customerId: id, bank, allocated, consumed: freshCustomers ? 0 : consumed, suspended: false, expired: false, pendingVerification: false, lastConfirmedAt: BASE_NOW - 3 * 3600_000, additionalRequested: 0 };
  });
  if (freshCustomers) return;
  state.now = BASE_NOW - 8 * 3600_000;
  let s = state;
  const P = (id: string) => PERSONAS.find((p) => p.id === id)!;
  const make = (d: string, b: string, amount: number, payable: number, purpose: string, cat: PurposeCategory, obl?: { ref: string; kind: string; status: "active" | "completed" }) => {
    const dp = P(d), bp = P(b);
    const out = createRequestExt(s, {
      issuingBank: dp.bank, payeeBank: bp.bank, drawer: dp.name, drawerId: dp.id, drawerAcct: dp.acct, beneficiary: bp.name, beneficiaryId: bp.id, beneficiaryAcct: bp.acct,
      amount, payableDate: payable, purpose, purposeCategory: cat, classification: cat === "security" ? "security" : "payment",
      obligation: obl ? { ref: obl.ref, kind: obl.kind, counterparty: bp.name, startDate: BASE_NOW - 300 * DAY, completionDate: obl.status === "completed" ? BASE_NOW - 5 * DAY : undefined, securityAmount: amount, closureParty: bp.name } : undefined,
    });
    s = out.state;
    if (obl?.status === "completed") s.ext.obligations[s.cheques[out.ndci].obligationId!].status = "completed";
    if (s.cheques[out.ndci].makerChecker?.pending) s = checkerApprove(s, out.ndci, "Finance Controller (checker)");
    s = authorize(s, out.ndci).state;
    s = issue(s, out.ndci);
    return out.ndci;
  };
  make("CUST-AHMED", "CUST-LAYLA", 30_000, BASE_NOW, "Lease security deposit — Marina apartment", "security", { ref: "LEASE-DXB-2025-0412", kind: "Tenancy contract", status: "completed" });
  make("CUST-KHALID", "CUST-OMAR", 50_000, BASE_NOW, "Supply contract performance security", "security", { ref: "SUP-2026-118", kind: "Supply agreement", status: "active" });
  make("CUST-FATIMA", "CUST-AHMED", 12_000, BASE_NOW + 2 * DAY, "November rent", "rent");
  make("CUST-OMAR", "CUST-FATIMA", 7_800, BASE_NOW, "Invoice INV-7781", "supplier");
  s.ext.entitlements["CUST-LAYLA"].consumed = 12; // exhausted for demo
  s.now = BASE_NOW;
  Object.assign(state, s);
}
