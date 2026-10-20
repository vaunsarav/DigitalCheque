import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, ChevronRight, Circle, ExternalLink, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import * as E from "@/lib/engine/engine";
import { personaById } from "@/lib/engine/seed";
import type { EngineState, ServiceType } from "@/lib/engine/types";
import * as X from "@/lib/engine/ext";
import { toast } from "sonner";
import { ChequeVisual, Mono, PageHeader, Panel, Pill, Timeline } from "@/components/dc/ui";
import { LetterPresenter } from '@/components/dc/LetterPresenter';

export const Route = createFileRoute("/presenter")({
  head: () => ({
    meta: [
      { title: "Presenter Mode — Guided Digital Cheque Scenarios" },
      { name: "description", content: "Step-by-step guided demos: cross-bank cheque, post-dated cheque, returns, duplicate presentment, tampering, outages and settlement exceptions." },
      { property: "og:title", content: "Digital Cheque Presenter Mode" },
      { property: "og:description", content: "Guided walkthroughs of the digital cheque ecosystem (prototype)." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Presenter,
});

type To = "/mobile" | "/bank" | "/edc" | "/cbuae";
interface Step { t: string; to: To; fn: (ndci: string | null) => string | null | void }
interface Scenario { id: string; title: string; desc: string; steps: Step[] }

const st = () => useStore.getState();
const act = (fn: (s: EngineState) => EngineState, msg?: string) => st().act(fn, msg);
const req = (drawer: string, ben: string, amount: number, payableDate?: number, purpose = "Rent payment") => {
  const d = personaById(drawer)!, b = personaById(ben)!;
  return st().createRequest({ issuingBank: d.bank, payeeBank: b.bank, drawer: d.name, drawerId: d.id, drawerAcct: d.acct, beneficiary: b.name, beneficiaryId: b.id, beneficiaryAcct: b.acct, amount, payableDate: payableDate ?? st().now, purpose });
};
const authorize = (n: string | null) => {
  if (st().cheques[n!]?.makerChecker?.pending) act((s) => E.checkerApprove(s, n!, "Finance Controller (checker)"), "Corporate checker approved");
  st().run((s) => E.authorize(s, n!), "Issuing bank authorized");
};
let lastReq: string | null = null;
const P = (id: string) => personaById(id)!;
const extInput = (d: string, b: string, amount: number, extra: Partial<E.NewChequeInput> = {}): E.NewChequeInput => ({
  issuingBank: P(d).bank, payeeBank: P(b).bank, drawer: P(d).name, drawerId: d, drawerAcct: P(d).acct, beneficiary: P(b).name, beneficiaryId: b, beneficiaryAcct: P(b).acct,
  amount, payableDate: st().now, purpose: "Supplier invoice", purposeCategory: "supplier", ...extra,
});
const signAndSubmit = (i: E.NewChequeInput, fail = false): string | null => {
  const sig = st().run((s) => X.signTerms(s, { ...i, signatory: i.drawer }, { authMethod: "face_id", signMethod: "uae_pass", fail }), fail ? undefined : "Signed via simulated UAE PASS journey");
  if (!sig.ok) return null;
  const id = (sig as unknown as { sessionId: string }).sessionId;
  if (st().ext.signing[id].result !== "signed") { toast.error("Signing failed (simulated) — nothing submitted"); return null; }
  const r = st().run((s) => X.createRequestExt(s, { ...i, signingSessionId: id }), "Signed request submitted — entitlement reserved");
  return r.ok ? (r as unknown as { ndci: string }).ndci : null;
};
const sreq = (type: ServiceType, by: string, reason: string, proposed?: { amount?: number }) => (n: string | null) => {
  const r = st().run((s) => X.createServiceRequest(s, { type, ndci: n!, by, reason, proposed }), "Service request submitted — status unchanged");
  if (r.ok) lastReq = (r as unknown as { id: string }).id;
};
const respond = (by: string, d: "accept" | "reject" | "query", note: string) => () => { if (lastReq) act((s) => X.respondServiceRequest(s, lastReq!, by, d, note), `Counterparty ${d}`); };
const bankDecide = (approve: boolean, reason: string) => () => { if (lastReq) act((s) => X.bankDecideRequest(s, lastReq!, approve, reason), approve ? "Bank authorized the outcome" : "Bank rejected the request"); };
const findSec = (drawer: string) => Object.values(st().cheques).find((c) => c.drawerId === drawer && c.classification === "security" && ["delivered", "verified"].includes(c.status))?.ndci ?? null;
const issue = (n: string | null) => { act((s) => E.issue(s, n!), "EDC generated, signed and delivered the instrument"); };
const verifyBen = (n: string | null) => { const r = st().verify(n!, "beneficiary"); r.result === "genuine" ? st().act((s) => s, "Beneficiary verified: authentic") : st().act((s) => s) ; };
const deposit = (n: string | null) => { act((s) => E.deposit(s, n!), "Deposit submitted"); };
const accept = (n: string | null) => { act((s) => E.acceptDeposit(s, n!), "Payee bank accepted deposit"); };
const present = (n: string | null) => { act((s) => E.present(s, n!), "Presented for clearing"); };
const pay = (n: string | null) => { act((s) => E.decide(s, n!, true), "Issuing bank approved payment"); };
const settle = (n: string | null) => { act((s) => E.settle(s, n!), "Interbank settlement confirmed"); };
const creditIt = (n: string | null) => { act((s) => E.credit(s, n!), "Funds credited to beneficiary"); };

const core = (drawer: string, ben: string, amount: number): Step[] => [
  { t: "Customer creates the digital cheque request", to: "/mobile", fn: () => { st().setUi({ persona: drawer }); return req(drawer, ben, amount); } },
  { t: "Issuing bank authorizes issuance", to: "/bank", fn: (n) => { st().setUi({ bank: st().cheques[n!].issuingBank }); authorize(n); } },
  { t: "EDC generates, signs and registers the instrument (NDCI)", to: "/edc", fn: issue },
  { t: "Beneficiary receives and verifies authenticity", to: "/mobile", fn: (n) => { st().setUi({ persona: ben }); verifyBen(n); } },
  { t: "Beneficiary deposits the cheque", to: "/mobile", fn: deposit },
  { t: "Payee bank validates account and accepts deposit", to: "/bank", fn: (n) => { st().setUi({ bank: st().cheques[n!].payeeBank }); accept(n); } },
  { t: "Payee bank presents for clearing", to: "/bank", fn: present },
];

const SCENARIOS: Scenario[] = [
  { id: 'p-j', title: 'PRD J · Liability Letter', desc: 'Dated snapshot, bank confirmation, reconciliation, distinct approval, real PDF and privacy-limited verification.', steps: [] },
  {
    id: "a", title: "A · Cross-bank cheque", desc: "Ahmed (Emirates NBD) pays AED 25,000 to Fatima (ADCB), through to settlement and regulator view.",
    steps: [
      ...core("CUST-AHMED", "CUST-FATIMA", 25_000),
      { t: "Issuing bank approves payment", to: "/bank", fn: (n) => { st().setUi({ bank: "ENBD" }); pay(n); } },
      { t: "Interbank settlement confirmed", to: "/bank", fn: settle },
      { t: "Payee bank posts funds to Fatima", to: "/bank", fn: (n) => { st().setUi({ bank: "ADCB" }); creditIt(n); } },
      { t: "CBUAE inspects the complete history", to: "/cbuae", fn: () => {} },
    ],
  },
  {
    id: "b", title: "B · Post-dated cheque", desc: "Omar Trading (RAKBANK) pays Layla Properties (Mashreq) AED 40,000, payable 15 Dec 2026.",
    steps: [
      { t: "Customer issues the post-dated cheque", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-OMAR" }); return req("CUST-OMAR", "CUST-LAYLA", 40_000, Date.UTC(2026, 11, 15, 4), "Quarterly rent"); } },
      { t: "Issuing bank authorizes", to: "/bank", fn: (n) => { st().setUi({ bank: "RAKBANK" }); authorize(n); } },
      { t: "EDC creates and stores the signed instrument", to: "/edc", fn: issue },
      { t: "Beneficiary receives and verifies it", to: "/mobile", fn: (n) => { st().setUi({ persona: "CUST-LAYLA" }); verifyBen(n); } },
      { t: "Early deposit attempt is blocked", to: "/mobile", fn: deposit },
      { t: "Jump demo clock to 15 Dec 2026", to: "/mobile", fn: () => { act((s) => E.advanceClock(s, Date.UTC(2026, 11, 15, 5)), "Demo clock moved to 15 Dec 2026"); } },
      { t: "Deposit on maturity", to: "/mobile", fn: deposit },
      { t: "Mashreq accepts and presents", to: "/bank", fn: (n) => { st().setUi({ bank: "MASHREQ" }); accept(n); present(n); } },
      { t: "RAKBANK pays, settlement and credit", to: "/bank", fn: (n) => { pay(n); settle(n); creditIt(n); } },
    ],
  },
  {
    id: "c", title: "C · Insufficient funds return", desc: "Khalid (DIB, low balance) issues AED 12,500 to Fatima — the issuing bank returns it.",
    steps: [
      ...core("CUST-KHALID", "CUST-FATIMA", 12_500),
      { t: "DIB attempts to pay — insufficient funds", to: "/bank", fn: (n) => { st().setUi({ bank: "DIB" }); pay(n); } },
      { t: "DIB returns the cheque: insufficient funds", to: "/bank", fn: (n) => { act((s) => E.decide(s, n!, false, "Insufficient funds"), "Cheque returned"); } },
      { t: "Regulator sees the return", to: "/cbuae", fn: () => {} },
    ],
  },
  {
    id: "d", title: "D · Duplicate presentment", desc: "A settled cheque is presented a second time and is blocked with a fraud alert.",
    steps: [
      ...core("CUST-AHMED", "CUST-FATIMA", 8_000),
      { t: "Pay and settle", to: "/bank", fn: (n) => { pay(n); settle(n); } },
      { t: "Second presentment attempt — blocked", to: "/bank", fn: present },
      { t: "Fraud alert appears at CBUAE", to: "/cbuae", fn: () => {} },
    ],
  },
  {
    id: "e", title: "E · Tampered instrument", desc: "An altered copy fails hash verification and cannot be deposited.",
    steps: [
      { t: "Create and authorize", to: "/bank", fn: () => { const n = req("CUST-OMAR", "CUST-FATIMA", 3_500); if (n) authorize(n); return n; } },
      { t: "EDC issues the signed instrument", to: "/edc", fn: issue },
      { t: "An altered copy (amount ×10) circulates", to: "/edc", fn: (n) => { act((s) => E.tamper(s, n!), "Altered copy created (simulation)"); } },
      { t: "Verification detects tampering", to: "/edc", fn: (n) => { st().verify(n!, "edc"); st().act((s) => s); } },
      { t: "Deposit is refused", to: "/mobile", fn: (n) => { st().setUi({ persona: "CUST-FATIMA" }); deposit(n); } },
    ],
  },
  {
    id: "f", title: "F · Bank integration outage", desc: "Emirates NBD's API goes down; requests queue and retry without duplicate issuance.",
    steps: [
      { t: "Simulate Emirates NBD API outage", to: "/edc", fn: () => { act((s) => E.setLink(s, "ENBD", false), "Emirates NBD outage simulated"); } },
      { t: "Customer request arrives; authorization queued", to: "/edc", fn: () => { const n = req("CUST-AHMED", "CUST-LAYLA", 15_000); if (n) authorize(n); return n; } },
      { t: "Retry while still down — fails safely", to: "/edc", fn: (n) => { const j = st().retryQueue.find((x) => x.ndci === n); if (j) st().run((s) => E.retry(s, j.id)); } },
      { t: "Restore link and retry — succeeds", to: "/edc", fn: (n) => { act((s) => E.setLink(s, "ENBD", true)); const j = st().retryQueue.find((x) => x.ndci === n); if (j) st().run((s) => E.retry(s, j.id), "Retry succeeded"); } },
      { t: "EDC issues exactly once", to: "/edc", fn: issue },
    ],
  },
  {
    id: "g", title: "G · Settlement exception", desc: "A batch mismatch creates an unreconciled item that the payee bank resolves.",
    steps: [
      ...core("CUST-FATIMA", "CUST-AHMED", 18_200),
      { t: "Issuing bank pays", to: "/bank", fn: pay },
      { t: "Settlement exception raised", to: "/bank", fn: (n) => { act((s) => E.settle(s, n!, { fail: true }), "Settlement exception raised"); } },
      { t: "Reconcile and settle", to: "/bank", fn: (n) => { act((s) => E.reconcile(s, n!), "Reconciled"); } },
      { t: "Credit beneficiary", to: "/bank", fn: creditIt },
    ],
  },
  {
    id: "p-a", title: "PRD A · Entitlement exhausted", desc: "Layla Properties has used every allocated cheque — issuance is blocked and more entitlement is requested.",
    steps: [
      { t: "Layla tries to issue — blocked: no entitlement", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-LAYLA" }); st().run((s) => X.createRequestExt(s, extInput("CUST-LAYLA", "CUST-AHMED", 9_000))); } },
      { t: "Layla requests additional cheque entitlement", to: "/mobile", fn: () => { act((s) => X.requestEntitlement(s, "CUST-LAYLA", 10), "Additional entitlement requested"); } },
      { t: "Mashreq allocates 10 more", to: "/bank", fn: () => { st().setUi({ bank: "MASHREQ" }); act((s) => X.grantEntitlement(s, "CUST-LAYLA", 10), "Entitlement allocated"); } },
      { t: "Issuance now succeeds and reserves one entitlement", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-LAYLA" }); return signAndSubmit(extInput("CUST-LAYLA", "CUST-AHMED", 9_000)); } },
    ],
  },
  {
    id: "p-b", title: "PRD B · Issue and sign", desc: "Ahmed reviews exact terms, signs via the simulated UAE PASS journey, and both parties receive matching copies.",
    steps: [
      { t: "Review and sign the exact terms", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-AHMED" }); return signAndSubmit(extInput("CUST-AHMED", "CUST-FATIMA", 18_500, { purpose: "Consulting milestone 2", purposeCategory: "milestone" })); } },
      { t: "Emirates NBD authorizes", to: "/bank", fn: (n) => { st().setUi({ bank: "ENBD" }); authorize(n); } },
      { t: "EDC issues — entitlement consumed, copies delivered to both wallets", to: "/edc", fn: issue },
      { t: "Fatima opens her copy — same NDCI, version and hash", to: "/mobile", fn: (n) => { st().setUi({ persona: "CUST-FATIMA" }); act((s) => X.accessCopy(s, n!, "CUST-FATIMA", "opened"), "Copy opened — live registry status shown"); } },
    ],
  },
  {
    id: "p-c", title: "PRD C · Auto-deposit", desc: "Ahmed grants a mandate for Fatima’s post-dated rent cheque; it submits exactly once on maturity.",
    steps: [
      { t: "Ahmed grants a per-cheque auto-deposit mandate", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-AHMED" }); const c = Object.values(st().cheques).find((x) => x.beneficiaryId === "CUST-AHMED" && x.purpose === "November rent" && !x.depositRef); if (!c) return null; act((s) => X.createMandate(s, { customerId: "CUST-AHMED", scope: "cheque", ndci: c.ndci, acct: P("CUST-AHMED").acct, maxAmount: 15_000, schedule: "maturity" }), "Mandate active"); return c.ndci; } },
      { t: "Run before maturity — nothing submitted", to: "/mobile", fn: () => { st().run((s) => X.runAutoDeposits(s), "Auto-deposit run: not yet due"); } },
      { t: "Jump clock to the payable date", to: "/mobile", fn: (n) => { act((s) => E.advanceClock(s, st().cheques[n!].payableDate + 6 * 3600_000), "Clock moved to maturity"); } },
      { t: "Run — submits once", to: "/mobile", fn: () => { st().run((s) => X.runAutoDeposits(s), "Auto-deposit submitted"); } },
      { t: "Run again — no duplicate deposit", to: "/mobile", fn: () => { st().run((s) => X.runAutoDeposits(s), "Idempotent: nothing new submitted"); } },
    ],
  },
  {
    id: "p-d", title: "PRD D · Mutual cancellation", desc: "Issuer requests, beneficiary consents, the bank authorizes the final outcome.",
    steps: [
      { t: "Create and issue a cheque", to: "/edc", fn: () => { const n = req("CUST-AHMED", "CUST-FATIMA", 4_200); if (n) { authorize(n); issue(n); } return n; } },
      { t: "Ahmed requests cancellation", to: "/mobile", fn: (n) => { st().setUi({ persona: "CUST-AHMED" }); sreq("cancel", "CUST-AHMED", "Invoice withdrawn")(n); } },
      { t: "Fatima consents — status still unchanged", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-FATIMA" }); respond("CUST-FATIMA", "accept", "Agreed")(); } },
      { t: "Emirates NBD authorizes — instrument cancelled", to: "/bank", fn: () => { st().setUi({ bank: "ENBD" }); bankDecide(true, "Both parties consented")(); } },
    ],
  },
  {
    id: "p-e", title: "PRD E · Amendment", desc: "A corrected amount gets approvals and a linked replacement — never two payable instruments.",
    steps: [
      { t: "Create and issue AED 6,000", to: "/edc", fn: () => { const n = req("CUST-AHMED", "CUST-FATIMA", 6_000); if (n) { authorize(n); issue(n); } return n; } },
      { t: "Ahmed proposes AED 6,500", to: "/mobile", fn: (n) => { st().setUi({ persona: "CUST-AHMED" }); sreq("amend", "CUST-AHMED", "Amount correction", { amount: 6_500 })(n); } },
      { t: "Fatima accepts", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-FATIMA" }); respond("CUST-FATIMA", "accept", "Correct")(); } },
      { t: "Bank approves — original superseded, new linked NDCI created", to: "/bank", fn: (n) => { st().setUi({ bank: "ENBD" }); bankDecide(true, "Fresh consent recorded")(); return st().cheques[n!].supersededBy ?? n; } },
      { t: "Replacement is authorized and issued", to: "/edc", fn: (n) => { authorize(n); issue(n); } },
    ],
  },
  {
    id: "p-f", title: "PRD F · Security release", desc: "Ahmed’s lease ended — release request, Layla confirms, bank closes the security cheque.",
    steps: [
      { t: "Ahmed views the security cheque held by Layla", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-AHMED" }); return findSec("CUST-AHMED"); } },
      { t: "Ahmed submits a release request", to: "/mobile", fn: sreq("security_release", "CUST-AHMED", "Lease LEASE-DXB-2025-0412 ended; keys returned") },
      { t: "Layla confirms completion", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-LAYLA" }); respond("CUST-LAYLA", "accept", "Inspection passed")(); } },
      { t: "Emirates NBD authorizes release — evidence recorded", to: "/bank", fn: () => { st().setUi({ bank: "ENBD" }); bankDecide(true, "Closure evidence verified")(); } },
    ],
  },
  {
    id: "p-g", title: "PRD G · AI intervention", desc: "The assistant spots a completed obligation with no release request and prepares one for approval.",
    steps: [
      { t: "Assistant scans Ahmed’s records", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-AHMED" }); act((s) => X.agentScan(s, "customer", "CUST-AHMED"), "Assistant found items needing attention"); } },
      { t: "Ahmed approves the drafted release request", to: "/mobile", fn: () => { const a = st().ext.agent.find((x) => x.customerId === "CUST-AHMED" && x.status === "open" && x.action?.kind === "draft_release"); if (a) act((s) => X.decideAgent(s, a.id, true, "CUST-AHMED"), "Approved — request submitted"); else toast.info("No open release recommendation (already handled?)"); } },
      { t: "EDC operations assistant scan", to: "/edc", fn: () => { act((s) => X.agentScan(s, "edc"), "Operations scan complete"); } },
    ],
  },
  {
    id: "p-h", title: "PRD H · Liability reporting", desc: "EDC shows payment commitments, security face values and pending releases separately.",
    steps: [{ t: "Open EDC › Liability and Commitments", to: "/edc", fn: () => {} }, { t: "CBUAE oversight view (read-only)", to: "/cbuae", fn: () => {} }],
  },
  {
    id: "p-i", title: "PRD I · Exceptions", desc: "Revoked mandate, rejected cancellation, disputed release, signing failure, duplicate deposit and delayed settlement.",
    steps: [
      { t: "Signing failure — nothing submitted", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-AHMED" }); signAndSubmit(extInput("CUST-AHMED", "CUST-FATIMA", 2_000), true); } },
      { t: "Revoke a standing mandate", to: "/mobile", fn: () => { st().setUi({ persona: "CUST-FATIMA" }); act((s) => X.createMandate(s, { customerId: "CUST-FATIMA", scope: "standing", acct: P("CUST-FATIMA").acct, maxAmount: 10_000, schedule: "maturity" })); const m = st().ext.mandates[st().ext.mandates.length - 1]; act((s) => X.setMandate(s, m.id, "revoked"), "Mandate revoked — scheduled jobs revoked"); } },
      { t: "Cancellation rejected by beneficiary", to: "/mobile", fn: () => { const n = req("CUST-AHMED", "CUST-FATIMA", 1_100); if (!n) return null; authorize(n); issue(n); sreq("cancel", "CUST-AHMED", "Changed mind")(n); respond("CUST-FATIMA", "reject", "Goods already delivered")(); return n; } },
      { t: "Duplicate deposit blocked", to: "/mobile", fn: (n) => { st().setUi({ persona: "CUST-FATIMA" }); act((s) => X.eDeposit(s, n!, "CUST-FATIMA", P("CUST-FATIMA").acct), "Deposit submitted"); act((s) => X.eDeposit(s, n!, "CUST-FATIMA", P("CUST-FATIMA").acct)); } },
      { t: "Disputed security release (Khalid ↔ Omar)", to: "/mobile", fn: () => { const n = findSec("CUST-KHALID"); if (!n) return null; st().setUi({ persona: "CUST-KHALID" }); sreq("security_release", "CUST-KHALID", "Supply contract completed")(n); respond("CUST-OMAR", "reject", "Final delivery outstanding")(); return n; } },
      { t: "Delayed settlement flagged by the ops assistant", to: "/edc", fn: () => { act((s) => X.agentScan(s, "edc"), "Operations scan complete"); } },
    ],
  },
];

function Presenter() {
  const [sid, setSid] = useState("a");
  const [progress, setProgress] = useState<Record<string, { i: number; ndci: string | null }>>({});
  const sc = SCENARIOS.find((s) => s.id === sid)!;
  const pr = progress[sid] ?? { i: 0, ndci: null };
  const c = useStore((s) => (pr.ndci ? s.cheques[pr.ndci] : undefined));

  const next = () => {
    const step = sc.steps[pr.i];
    if (!step) return;
    const out = step.fn(pr.ndci);
    const ndci = typeof out === "string" ? out : pr.ndci;
    if (pr.i === 0 && typeof out !== "string" && out === null) return;
    setProgress({ ...progress, [sid]: { i: pr.i + 1, ndci } });
  };
  const restart = () => setProgress({ ...progress, [sid]: { i: 0, ndci: null } });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-6">
      <PageHeader eyebrow="Presenter mode" title="Guided scenarios" desc="Run each step here, then open the linked portal to show the effect. Every action updates all portals live." />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr_420px]">
        <div className="space-y-2">
          {SCENARIOS.map((s) => (
            <button key={s.id} onClick={() => setSid(s.id)} className={`w-full rounded-xl border p-3 text-left transition ${sid === s.id ? "border-orange bg-accent" : "bg-card hover:border-orange/50"}`}>
              <div className="text-sm font-semibold">{s.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{s.desc}</div>
            </button>
          ))}
        </div>
        <Panel title={sc.title} action={sid === 'p-j' ? undefined : <Button variant="ghost" size="sm" onClick={restart}><RotateCcw className="h-3.5 w-3.5" /> Restart</Button>}>
          {sid === 'p-j' ? <LetterPresenter /> : <>
          <ol className="space-y-2">
            {sc.steps.map((s, i) => (
              <li key={i} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${i === pr.i ? "border-orange" : ""}`}>
                {i < pr.i ? <CheckCircle2 className="h-5 w-5 text-success" /> : i === pr.i ? <Play className="h-5 w-5 text-orange" /> : <Circle className="h-5 w-5 text-border" />}
                <span className={`flex-1 ${i > pr.i ? "text-muted-foreground" : ""}`}>{s.t}</span>
                <Link to={s.to} className="flex items-center gap-1 text-xs text-primary hover:underline">{s.to.slice(1).toUpperCase()} <ExternalLink className="h-3 w-3" /></Link>
              </li>
            ))}
          </ol>
          <Button className="mt-4 w-full" size="lg" disabled={pr.i >= sc.steps.length} onClick={next}>
            {pr.i >= sc.steps.length ? "Scenario complete" : <>Run step {pr.i + 1} <ChevronRight className="h-4 w-4" /></>}
          </Button>
          </>}
        </Panel>
        <div className="space-y-4">
          {c ? (
            <>
              <ChequeVisual c={c} />
              <Panel title={<span className="flex items-center gap-2">Lifecycle <Mono>{c.ndci}</Mono></span>}><Timeline c={c} /></Panel>
            </>
          ) : (
            <Panel><p className="text-sm text-muted-foreground">Run the first step to create the instrument.</p></Panel>
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-5">
        {[
          ["CBUAE", "National oversight, standardised instruments, interbank traceability, system-wide fraud intelligence."],
          ["Issuing banks", "Issuance without cheque books, automated approvals, stronger control."],
          ["Payee banks", "Electronic authentication, deposits and clearing visibility; less manual handling."],
          ["Customers", "Instant delivery, secured instruments, easy deposits, transparent tracking, post-dated management."],
          ["EDC", "Secure custody, unique registration, cryptographic verification, standardised integrations."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border bg-card p-4"><Pill tone="orange">{t}</Pill><p className="mt-2 text-sm">{d}</p></div>
        ))}
      </div>

      <Panel title="Production-oriented architecture (proposed)" className="mt-4">
        <div className="grid items-center gap-3 text-center text-xs md:grid-cols-5">
          {[
            ["Customer channels", "Bank mobile & web apps · UAE PASS identity"],
            ["Bank core systems", "Accounts, limits, funds checks, posting"],
            ["EDC Trust Network", "Registry · HSM/PKI signing · Vault · Verification API"],
            ["National clearing", "ICCS integration · settlement via CBUAE systems"],
            ["CBUAE oversight", "Supervisory data feeds · analytics · audit"],
          ].map(([t, d], i) => (
            <div key={t} className="flex items-center gap-2">
              <div className={`flex-1 rounded-xl border p-3 ${i === 2 ? "border-orange bg-accent" : ""}`}><div className="font-semibold">{t}</div><div className="mt-1 text-muted-foreground">{d}</div></div>
              {i < 4 && <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Prototype uses simulated cryptography and synthetic data only; no real payment, clearing or bank connections.</p>
      </Panel>
    </div>
  );
}
