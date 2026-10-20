import { useMemo, useState, type ReactNode } from "react";
import { Bot, CheckCircle2, Download, FileText, Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore, useCheques } from "@/lib/store";
import * as E from "@/lib/engine/engine";
import * as X from "@/lib/engine/ext";
import { BANKS, STATUS_LABEL, bankById } from "@/lib/engine/engine";
import { personaById } from "@/lib/engine/seed";
import { aed, amountInWords, fmtDate, fmtDateTime } from "@/lib/engine/format";
import type { Cheque, ServiceRequest, ServiceType } from "@/lib/engine/types";
import { BankChip, ChequeVisual, Mono, Panel, Pill, StatusBadge } from "./ui";
import { cn } from "@/lib/utils";

const nameOf = (id: string) => personaById(id)?.name ?? id;

export function SimTag({ children = "Simulated" }: { children?: ReactNode }) {
  return <Pill tone="warning" className="text-[10px]">{children}</Pill>;
}

export function Watermark() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden">
      <div className="-rotate-12 whitespace-nowrap text-sm font-black uppercase tracking-widest text-destructive/25 md:text-lg">{X.DEMO_WATERMARK}</div>
    </div>
  );
}

// ---------- Entitlement ----------
export function EntitlementCard({ customerId, compact }: { customerId: string; compact?: boolean }) {
  const s = useStore();
  const e = E.entitlementSummary(s, customerId);
  if (!e) return null;
  const state = e.suspended ? "Suspended" : e.expired ? "Expired" : e.pendingVerification ? "Pending bank verification" : e.available === 0 ? "Exhausted" : "Active";
  return (
    <div className="rounded-2xl border bg-card p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Cheque entitlement</span>
        <Pill tone={state === "Active" ? "success" : "danger"}>{state}</Pill>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-center">
        {[["Allocated", e.allocated], ["Available", e.available], ["Reserved", e.reserved], ["Consumed", e.consumed]].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-muted p-1.5"><div className="text-base font-semibold tabular-nums">{v}</div><div className="text-[10px] text-muted-foreground">{l}</div></div>
        ))}
      </div>
      {!compact && <p className="mt-2 text-[10px] text-muted-foreground">Bank-assigned unused cheque numbers — separate from your account balance. Last bank confirmation {fmtDateTime(e.lastConfirmedAt)} (simulated). Ref {e.id}.</p>}
      {e.available === 0 && (
        <Button size="sm" variant="outline" className="mt-2 w-full" disabled={e.additionalRequested > 0} onClick={() => s.act((st) => X.requestEntitlement(st, customerId, 10), "Additional entitlement requested from your bank")}>
          {e.additionalRequested > 0 ? `Requested ${e.additionalRequested} — awaiting bank` : "Request additional cheque entitlement"}
        </Button>
      )}
    </div>
  );
}

// ---------- AI ----------
export function AiPanel({ scope, customerId }: { scope: "customer" | "edc"; customerId?: string }) {
  const { ext, act } = useStore();
  const recs = ext.agent.filter((a) => a.scope === scope && (scope === "edc" || a.customerId === customerId));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-primary" />{scope === "edc" ? "AI Operations Assistant" : "AI Cheque Assistant"} <SimTag>Rule-based demo</SimTag></div>
        <Button size="sm" onClick={() => act((s) => X.agentScan(s, scope, customerId), "Assistant scan complete")}>Run scan</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Reads permitted records only. Remarks and uploaded text are treated as data, never as instructions. It never signs, authorizes issuance, changes beneficiaries, approves cancellation, releases security or moves money.</p>
      {recs.length === 0 && <p className="text-xs text-muted-foreground">No findings yet — run a scan.</p>}
      {recs.map((a) => (
        <div key={a.id} className="space-y-2 rounded-xl border p-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={a.cls === "A" ? "info" : a.cls === "B" ? "warning" : "danger"}>Class {a.cls} · {a.cls === "A" ? "Read & explain" : a.cls === "B" ? "Draft request" : "Execute after authorization"}</Pill>
            {a.approvalRequired && a.status === "open" && <Pill tone="danger">Approval required</Pill>}
            <Pill tone={a.status === "approved" ? "success" : "neutral"}>{a.status}</Pill>
            <span className="ml-auto text-muted-foreground">{fmtDateTime(a.at)}</span>
          </div>
          <div><span className="text-muted-foreground">Trigger: </span><b>{a.trigger}</b></div>
          <div><span className="text-muted-foreground">Records: </span>{a.records.map((r) => <Mono key={r} className="mr-1">{r}</Mono>)}</div>
          <ul className="list-disc space-y-0.5 pl-4">{a.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
          <div><span className="text-muted-foreground">References: </span>{a.references.join(", ")}</div>
          <div className="rounded-lg bg-accent p-2 font-medium text-accent-foreground">Recommended: {a.recommendation}</div>
          {a.result && <div className="text-success">Result: {a.result} {a.auditRef && <Mono>· {a.auditRef}</Mono>}</div>}
          {a.status === "open" && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => act((s) => X.decideAgent(s, a.id, true, customerId ?? "EDC operator"), a.approvalRequired ? "Approved — action executed" : "Acknowledged")}>{a.approvalRequired ? "Approve & execute" : "Acknowledge"}</Button>
              <Button size="sm" variant="outline" onClick={() => act((s) => X.decideAgent(s, a.id, false, customerId ?? "EDC operator"))}>Dismiss</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function IssuanceCheck({ draft }: { draft: Partial<E.NewChequeInput> }) {
  const s = useStore();
  const f = X.issuanceCheck(s, draft);
  return (
    <div className="space-y-1 rounded-xl border p-3 text-[11px]">
      <div className="flex items-center gap-1.5 font-semibold"><Bot className="h-3.5 w-3.5 text-primary" /> Assistant pre-check</div>
      {f.map((x, i) => <div key={i} className={cn(x.tone === "block" ? "text-destructive" : x.tone === "warn" ? "text-accent-foreground" : "text-success")}>• {x.text}</div>)}
    </div>
  );
}

// ---------- Copies ----------
export function CopyActions({ c, customerId }: { c: Cheque; customerId: string }) {
  const { act, ext } = useStore();
  const [open, setOpen] = useState(false);
  const mine = ext.copies.filter((x) => x.ndci === c.ndci);
  if (!c.hash) return null;
  return (
    <div className="space-y-2 rounded-2xl border p-3 text-xs">
      <div className="flex items-center justify-between"><span className="font-semibold">Authorized copy</span><Pill tone="info">v{c.version} · {c.hash.slice(0, 10)}…</Pill></div>
      <p className="text-[11px] text-muted-foreground">Issuer and beneficiary copies are views of one registered instrument. Live registry status: <b>{STATUS_LABEL[c.status]}</b>.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={() => { act((s) => X.accessCopy(s, c.ndci, customerId, "printed")); setOpen(true); }}><Printer className="h-3.5 w-3.5" /> Print preview</Button>
        <Button size="sm" variant="outline" onClick={() => { act((s) => X.accessCopy(s, c.ndci, customerId, "downloaded"), "Watermarked copy downloaded"); downloadCopy(c); }}><Download className="h-3.5 w-3.5" /> Download</Button>
      </div>
      <div className="text-[10px] text-muted-foreground">{mine.length} delivery/access events recorded</div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Print preview · {c.ndci}</DialogTitle></DialogHeader>
          <div className="relative"><ChequeVisual c={c} /><Watermark /></div>
          <div className="text-xs text-muted-foreground">Current registry status: {STATUS_LABEL[c.status]}. A downloaded copy never overrides cancellation, stop, replacement or settlement in the registry.</div>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function downloadCopy(c: Cheque) {
  const txt = `${X.DEMO_WATERMARK}\n\nNDCI: ${c.ndci}\nVersion: ${c.version}\nHash: ${c.hash}\nDrawer: ${c.drawer}\nBeneficiary: ${c.beneficiary}\nAmount: ${aed(c.amount)} (${amountInWords(c.amount)})\nPayable: ${fmtDate(c.payableDate)}\nStatus at download: ${STATUS_LABEL[c.status]}\nVerify: verify.edc-dctn.ae/${c.ndci} (demonstrative)\n`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
  a.download = `${c.ndci}-DEMO.txt`;
  a.click();
}

// ---------- e-Deposit stages ----------
const STAGES = ["Deposit submitted", "Bank validation pending", "Accepted for presentment", "Awaiting payment decision", "Awaiting settlement", "Settled — awaiting credit", "Realized"];
export function DepositStages({ c }: { c: Cheque }) {
  const cur = X.depositStage(c);
  const idx = STAGES.indexOf(cur);
  const failed = cur.startsWith("Rejected") || cur.startsWith("Returned");
  return (
    <div className="space-y-1 rounded-2xl border p-3 text-xs">
      <div className="mb-1 flex justify-between font-semibold">e-Deposit status {c.depositRef && <Mono>{c.depositRef}</Mono>}</div>
      {STAGES.map((st, i) => (
        <div key={st} className={cn("flex items-center gap-2", i <= idx || (i === 0 && c.depositRef) ? "font-medium" : "text-muted-foreground")}>
          <CheckCircle2 className={cn("h-3.5 w-3.5", i <= idx || (i === 0 && c.depositRef) ? "text-success" : "text-border")} />{st}
        </div>
      ))}
      {failed && <div className="font-medium text-destructive">{cur}</div>}
      <p className="pt-1 text-[10px] text-muted-foreground">Submitting or accepting a deposit does not mean realized — settlement and credit are confirmed separately.</p>
    </div>
  );
}

// ---------- Auto-deposit ----------
export function MandatesPanel({ customerId, ndci }: { customerId: string; ndci?: string }) {
  const { ext, act, run, cheques } = useStore();
  const p = personaById(customerId);
  const c = ndci ? cheques[ndci] : undefined;
  const [limit, setLimit] = useState(c?.amount ?? 50_000);
  const [consent, setConsent] = useState(false);
  const mandates = ext.mandates.filter((m) => m.customerId === customerId && (!ndci || m.ndci === ndci || m.scope === "standing"));
  const runs = ext.autoRuns.filter((r) => mandates.some((m) => m.id === r.mandateId));
  const blocked = c?.classification === "security";
  return (
    <div className="space-y-2 rounded-2xl border p-3 text-xs">
      <div className="font-semibold">Auto-deposit when eligible</div>
      {blocked ? <p className="text-destructive">Security cheques are excluded from auto-deposit.</p> : (
        <>
          <div className="flex items-center gap-2"><span className="text-muted-foreground">Limit AED</span><Input type="number" className="h-8" value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></div>
          <div className="rounded-lg bg-muted p-2 text-[11px]">
            <b>Consent:</b> {ndci ? `This cheque only` : "All eligible incoming payment cheques"} · to {p?.acct} · up to {aed(limit)} · on the payable date · you are notified on every submission · pause or revoke any time here. Auto-deposit submits a deposit instruction only — it does not guarantee clearing, settlement or payment.
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I consent to this mandate</label>
          <Button size="sm" className="w-full" disabled={!consent} onClick={() => { act((s) => X.createMandate(s, { customerId, scope: ndci ? "cheque" : "standing", ndci, acct: p?.acct ?? "", maxAmount: limit, schedule: "maturity" }), "Mandate active"); setConsent(false); }}>Activate mandate</Button>
        </>
      )}
      {mandates.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
          <span><Mono>{m.id}</Mono> {m.scope} · ≤ {aed(m.maxAmount)}</span>
          <span className="flex items-center gap-1">
            <Pill tone={m.status === "active" ? "success" : m.status === "paused" ? "warning" : "danger"}>{m.status}</Pill>
            {m.status !== "revoked" && <button className="underline" onClick={() => act((s) => X.setMandate(s, m.id, m.status === "active" ? "paused" : "active"))}>{m.status === "active" ? "Pause" : "Resume"}</button>}
            {m.status !== "revoked" && <button className="text-destructive underline" onClick={() => act((s) => X.setMandate(s, m.id, "revoked"), "Mandate revoked")}>Revoke</button>}
          </span>
        </div>
      ))}
      {runs.length > 0 && (
        <div className="space-y-1">
          {runs.map((r) => (
            <div key={r.id} className="flex justify-between gap-2"><span><Mono>{r.ndci.slice(-12)}</Mono></span><span><Pill tone={r.status === "submitted" ? "success" : r.status === "failed" || r.status === "revoked" ? "danger" : "neutral"}>{r.status}</Pill> {r.reason && <span className="text-muted-foreground">{r.reason}</span>}</span></div>
          ))}
          <Button size="sm" variant="outline" className="w-full" onClick={() => run((s) => X.runAutoDeposits(s), "Auto-deposit run complete")}>Run due auto-deposits now</Button>
        </div>
      )}
    </div>
  );
}

// ---------- Service requests ----------
const OPEN = ["awaiting_counterparty", "queried", "awaiting_bank"];
export function RaiseRequest({ c, customerId }: { c: Cheque; customerId: string }) {
  const { ext, run } = useStore();
  const role = X.roleOf(c, customerId);
  const [type, setType] = useState<ServiceType | "">("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(c.amount);
  if (!role) return null;
  const types = (Object.keys(ext.matrix) as ServiceType[]).filter((t) => {
    const r = ext.matrix[t];
    return r.initiators.includes(role) && r.eligible.includes(c.status) && (!r.securityOnly || c.classification === "security");
  });
  if (!types.length) return null;
  return (
    <div className="space-y-2 rounded-2xl border p-3 text-xs">
      <div className="font-semibold">Cheque service request</div>
      <select value={type} onChange={(e) => setType(e.target.value as ServiceType)} className="h-8 w-full rounded-md border bg-background px-2">
        <option value="">Choose request…</option>
        {types.map((t) => <option key={t} value={t}>{ext.matrix[t].label}</option>)}
      </select>
      {type && (
        <>
          <div className="text-[10px] text-muted-foreground">
            Route: {ext.matrix[type].counterpartyConsent ? "counterparty consent → " : ""}{ext.matrix[type].bank !== "none" ? `${ext.matrix[type].bank} bank decision` : "recorded only"} · evidence: {ext.matrix[type].evidence}
          </div>
          {type === "amend" && <div className="flex items-center gap-2"><span className="text-muted-foreground">New amount</span><Input className="h-8" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>}
          <Input className="h-8" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" className="w-full" disabled={!reason.trim()} onClick={() => {
            const r = run((s) => X.createServiceRequest(s, { type: type as ServiceType, ndci: c.ndci, by: customerId, reason, proposed: type === "amend" ? { amount } : undefined }), "Request submitted — status unchanged until authorized");
            if (r.ok) { setType(""); setReason(""); }
          }}>Submit request</Button>
        </>
      )}
    </div>
  );
}

export function RequestCard({ r, as }: { r: ServiceRequest; as: { kind: "customer"; id: string } | { kind: "bank" } }) {
  const { act, cheques, ext } = useStore();
  const c = cheques[r.ndci];
  const [note, setNote] = useState("");
  const rule = ext.matrix[r.type];
  const role = as.kind === "customer" && c ? X.roleOf(c, as.id) : null;
  const isCounter = role && role !== r.initiatorRole;
  return (
    <div className="space-y-2 rounded-xl border p-3 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <b>{rule.label}</b><Mono>{r.id}</Mono>
        <Pill tone={r.status === "completed" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status.replace("_", " ")}</Pill>
        <span className="ml-auto text-muted-foreground">{fmtDateTime(r.createdAt)}</span>
      </div>
      {c && <div className="text-muted-foreground"><Mono>{c.ndci}</Mono> · {aed(c.amount)} · {c.drawer} → {c.beneficiary} · <StatusBadge status={c.status} /></div>}
      <div>Initiated by {nameOf(r.initiatorId)} ({r.initiatorRole}): “{r.reason}” {r.proposed?.amount && <>· proposed {aed(r.proposed.amount)}</>}</div>
      {r.responses.map((x, i) => <div key={i} className="text-muted-foreground">↳ {nameOf(x.by)} {x.decision}{x.note && `: ${x.note}`}</div>)}
      {r.decisions.map((d, i) => <div key={i} className={d.approve ? "text-success" : "text-destructive"}>⚖ {d.institution} {d.approve ? "approved" : "rejected"}: {d.reason}</div>)}
      {r.replacementNdci && <div>Replacement: <Mono>{r.replacementNdci}</Mono> (original preserved, superseded)</div>}
      {OPEN.includes(r.status) && (isCounter || (as.kind === "customer" && r.status === "queried" && r.initiatorId === as.id) || (as.kind === "bank" && r.status === "awaiting_bank")) && (
        <div className="space-y-1.5">
          <Input className="h-8" placeholder={as.kind === "bank" ? "Decision reason (required)" : "Note"} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {as.kind === "bank" ? (
              <>
                <Button size="sm" disabled={!note} onClick={() => act((s) => X.bankDecideRequest(s, r.id, true, note), "Authorized — instrument updated")}>Approve</Button>
                <Button size="sm" variant="outline" disabled={!note} onClick={() => act((s) => X.bankDecideRequest(s, r.id, false, note), "Request rejected")}>Reject</Button>
              </>
            ) : r.status === "queried" && r.initiatorId === (as as { id: string }).id ? (
              <Button size="sm" onClick={() => act((s) => X.respondServiceRequest(s, r.id, (as as { id: string }).id, "answer", note))}>Answer query</Button>
            ) : r.status === "awaiting_counterparty" ? (
              <>
                <Button size="sm" onClick={() => act((s) => X.respondServiceRequest(s, r.id, (as as { id: string }).id, "accept", note), "Accepted — sent for bank decision")}>Accept</Button>
                <Button size="sm" variant="outline" onClick={() => act((s) => X.respondServiceRequest(s, r.id, (as as { id: string }).id, "reject", note), r.type === "security_release" ? "Completion disputed" : "Rejected")}>{r.type === "security_release" ? "Dispute" : "Reject"}</Button>
                <Button size="sm" variant="outline" onClick={() => act((s) => X.respondServiceRequest(s, r.id, (as as { id: string }).id, "query", note))}>Query</Button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function CustomerRequests({ customerId }: { customerId: string }) {
  const { ext, cheques } = useStore();
  const list = ext.requests.filter((r) => { const c = cheques[r.ndci]; return c && X.roleOf(c, customerId); });
  return <div className="space-y-2">{list.length === 0 ? <p className="text-xs text-muted-foreground">No service requests. Open a cheque to raise one.</p> : list.map((r) => <RequestCard key={r.id} r={r} as={{ kind: "customer", id: customerId }} />)}</div>;
}

export function BankRequests({ bank }: { bank: string }) {
  const { ext, cheques } = useStore();
  const list = ext.requests.filter((r) => cheques[r.ndci]?.issuingBank === bank || cheques[r.ndci]?.payeeBank === bank);
  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-sm text-muted-foreground">No service requests for this bank.</p>}
      {list.map((r) => <RequestCard key={r.id} r={r} as={{ kind: "bank" }} />)}
    </div>
  );
}

export function ApprovalMatrix() {
  const { ext } = useStore();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground"><tr>{["Request", "Who may initiate", "Counterparty consent", "Bank decides", "Eligible states", "Evidence", "Expiry"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{(Object.keys(ext.matrix) as ServiceType[]).map((t) => { const r = ext.matrix[t]; return (
          <tr key={t} className="border-t"><td className="p-2 font-medium">{r.label}</td><td className="p-2">{r.initiators.join(", ")}</td><td className="p-2">{r.counterpartyConsent ? "Yes" : "No"}</td><td className="p-2">{r.bank}</td><td className="p-2">{r.eligible.map((e) => STATUS_LABEL[e]).join(", ")}</td><td className="p-2">{r.evidence}</td><td className="p-2">{r.expiryDays}d</td></tr>
        ); })}</tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">Configurable, bank-controlled matrix. Mutual consent is not hardcoded as a legal requirement for every stop case. Requests and agreements never change the authoritative status on their own.</p>
    </div>
  );
}

// ---------- Security register ----------
export function SecurityRegister({ customerId, bank }: { customerId?: string; bank?: string }) {
  const s = useStore();
  const all = useCheques();
  const list = all.filter((c) => c.classification === "security" && c.hash && (!customerId || c.drawerId === customerId || c.beneficiaryId === customerId) && (!bank || c.issuingBank === bank || c.payeeBank === bank));
  const [ev, setEv] = useState("Final inspection report / handover certificate");
  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-xs text-muted-foreground">No security cheques.</p>}
      {list.slice(0, customerId ? 20 : 60).map((c) => {
        const o = c.obligationId ? s.ext.obligations[c.obligationId] : undefined;
        const st = X.securityStatus(s, c);
        const evidence = s.ext.releases.find((r) => r.ndci === c.ndci);
        return (
          <div key={c.ndci} className="space-y-1 rounded-xl border p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1"><Mono>{c.ndci}</Mono><Pill tone={st === "Security released" ? "success" : st === "Held" ? "info" : st === "Returned unpaid" ? "danger" : "warning"}>{st}</Pill></div>
            <div>{c.drawer} → held by {c.beneficiary} · {aed(c.amount)} · <StatusBadge status={c.status} /></div>
            <div className="text-muted-foreground">Purpose: {c.purpose}{o && <> · Linked {o.kind} <b>{o.ref}</b> — obligation: {o.status.replace("_", " ")}</>}</div>
            {evidence && <div className="text-success">Closure evidence {evidence.id}: {evidence.outcome} ({evidence.by}, {fmtDateTime(evidence.at)})</div>}
            {customerId && o && o.status === "active" && c.status !== "released" && (
              <div className="flex gap-1.5"><Input className="h-7 text-xs" value={ev} onChange={(e) => setEv(e.target.value)} /><Button size="sm" variant="outline" onClick={() => s.act((st2) => X.claimObligationComplete(st2, o.id, customerId, ev), "Completion recorded — cheque is NOT released automatically")}>Record completion</Button></div>
            )}
          </div>
        );
      })}
      <p className="text-[10px] text-muted-foreground">Labels: “Returned unpaid” = payment outcome · “Security release requested” = service request · “Security released” = authorized closure. Deleting a wallet copy never cancels an instrument. Physical originals (future paper-linked register) are tracked separately with receipt evidence.</p>
    </div>
  );
}

// ---------- Liability & commitments ----------
export function LiabilityReport({ readOnly }: { readOnly?: boolean }) {
  const s = useStore();
  const [f, setF] = useState<X.LiabFilter>({ bank: "", purpose: "", cls: "", q: "" });
  const [view, setView] = useState<string>("A");
  const r = useMemo(() => X.liabilityReport(s, f), [s.cheques, s.ext, s.now, f]);
  const rows = (r.views as Record<string, { rows: Cheque[] }>)[view].rows;
  const exportCsv = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([X.liabilityCsv(s, r.rows.filter((c) => X.liabilityView(s, c)))], { type: "text/csv" }));
    a.download = "edc-liability-commitments-DEMO.csv";
    a.click();
    s.act((st) => { const t = structuredClone(st); E.audit(t, "edc", "Liability report CSV exported (authorized EDC role)"); return t; });
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-accent p-3 text-xs text-accent-foreground">
        Summarizes registered cheque commitments and security instruments. It does not establish EDC’s financial liability, nor an accounting or legal determination of customer liability. Aggregate face value is not guaranteed funds or net credit exposure.
      </div>
      <div className="flex flex-wrap gap-2">
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })}><option value="">All banks</option>{BANKS.map((b) => <option key={b.id} value={b.id}>{b.short}</option>)}</select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}><option value="">All purposes</option>{Object.entries(X.PURPOSE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value as X.LiabFilter["cls"] })}><option value="">Payment + security</option><option value="payment">Payment</option><option value="security">Security</option></select>
        <Input className="h-9 w-56" placeholder="Issuer, beneficiary, NDCI, contract ref" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <span className="ml-auto flex gap-2">
          {!readOnly && <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> CSV</Button>}
          {!readOnly && <Button size="sm" variant="outline" onClick={() => window.print()}><FileText className="h-3.5 w-3.5" /> Demo PDF</Button>}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Panel><div className="text-xs text-muted-foreground">Active payment commitments (A+B)</div><div className="text-xl font-semibold">{aed(r.activePayment, true)}</div></Panel>
        <Panel><div className="text-xs text-muted-foreground">Security face value held (C+D)</div><div className="text-xl font-semibold">{aed(r.securityFace, true)}</div></Panel>
        <Panel><div className="text-xs text-muted-foreground">Returned unpaid (separate)</div><div className="text-xl font-semibold text-destructive">{aed(r.returned, true)}</div></Panel>
        <Panel><div className="text-xs text-muted-foreground">Pending service requests</div><div className="text-xl font-semibold">{r.pendingRequests}</div></Panel>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        {X.LIAB_VIEWS.map((v) => { const d = (r.views as Record<string, { count: number; value: number }>)[v.k]; return (
          <button key={v.k} onClick={() => setView(v.k)} className={cn("rounded-xl border p-3 text-left text-xs", view === v.k && "border-primary bg-accent")}>
            <div className="text-muted-foreground">{v.k} · {v.label}</div><div className="mt-1 text-base font-semibold">{d.count} · {aed(d.value, true)}</div>
          </button>
        ); })}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Upcoming maturity calendar (payment)">
          {r.months.map((m) => <div key={m.m} className="flex justify-between border-b py-1 text-xs last:border-0"><span>{m.m}</span><span>{m.count} · {aed(m.value, true)}</span></div>)}
        </Panel>
        <Panel title="Ageing — outstanding past payable date">
          {r.ageing.map((a) => <div key={a.band} className="flex justify-between border-b py-1 text-xs last:border-0"><span>{a.band}</span><span>{a.count} · {aed(a.value, true)}</span></div>)}
        </Panel>
        <Panel title="Potential overlap (same obligation)">
          {r.overlaps.length === 0 ? <p className="text-xs text-muted-foreground">No instruments share an obligation.</p> : r.overlaps.map((o) => <div key={o.obligation} className="text-xs">{o.obligation}: {o.items.length} instruments</div>)}
          <p className="mt-2 text-[10px] text-muted-foreground">Superseded originals are excluded from active totals; security values are kept separate from payment commitments.</p>
        </Panel>
      </div>
      <Panel title={`View ${view} · ${rows.length} instruments`}>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card text-left text-muted-foreground"><tr>{["NDCI", "Class", "Purpose", "Issuer → beneficiary", "Banks", "Amount", "Payable", "Status"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 150).map((c) => (
              <tr key={c.ndci} className="border-t"><td className="p-2"><Mono>{c.ndci}</Mono></td><td className="p-2">{c.classification ?? "payment"}</td><td className="p-2">{c.purposeCategory ? X.PURPOSE_LABEL[c.purposeCategory] : c.purpose}</td><td className="p-2">{c.drawer} → {c.beneficiary}</td><td className="p-2"><BankChip id={c.issuingBank} /> → <BankChip id={c.payeeBank} /></td><td className="p-2 tabular-nums">{aed(c.amount)}</td><td className="p-2">{fmtDate(c.payableDate)}</td><td className="p-2"><StatusBadge status={c.status} /></td></tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
      <p className="text-[11px] text-muted-foreground">Access: EDC role-limited · banks see their own records · customers see their own · regulator view uses separately configured oversight permissions.</p>
    </div>
  );
}

// ---------- Monetization ----------
const ADVANTAGES = ["Less paper handling and physical custody", "Validation before issuance", "Convenient electronic receipt and deposit", "Visibility of pending and future-dated commitments", "Purpose-based cheque registers", "Traceable security cheque release", "Controlled changes and approvals", "AI-supported monitoring and exception preparation", "Consolidated authorized lifecycle evidence"];
const OPTIONS = [
  { o: "Bank onboarding & integration fee", payer: "Participating bank", basis: "One-off per bank", cost: "Integration engineering, certification testing", val: "Bank appetite, integration effort per core system" },
  { o: "Institution platform subscription", payer: "Participating bank", basis: "Monthly per institution", cost: "Hosting, support, security operations", val: "Willingness to pay vs. current ICCS costs" },
  { o: "Per-instrument lifecycle service fee", payer: "Bank (may pass to customer per its own pricing)", basis: "Per registered instrument", cost: "Signing, custody, verification compute", val: "Regulatory view on fees, volume elasticity" },
  { o: "Corporate approval & scheduled-deposit package", payer: "Bank for corporate segment", basis: "Per corporate account / month", cost: "Workflow engine, maker-checker support", val: "Corporate demand pilots" },
  { o: "Managed verification, custody & reporting", payer: "Banks / authorized institutions", basis: "Tiered service level", cost: "Vault storage, reporting operations", val: "Required SLAs, data-sharing permissions" },
  { o: "Optional AI assistance package", payer: "Bank", basis: "Per institution / month", cost: "Model inference, governance, monitoring", val: "Data and access controls agreed; no sale of customer data" },
];
export function Monetization() {
  const { ext, act } = useStore();
  const a = ext.commercial;
  const m = X.commercialModel(a);
  const field = (k: keyof typeof a, label: string) => (
    <label className="space-y-1 text-xs"><span className="text-muted-foreground">{label}</span><Input type="number" className="h-8" value={a[k]} onChange={(e) => act((s) => X.setCommercial(s, { [k]: Number(e.target.value) }))} /></label>
  );
  return (
    <div className="space-y-4">
      <Panel title="Potential advantages">
        <ul className="grid gap-1 text-sm md:grid-cols-3">{ADVANTAGES.map((x) => <li key={x} className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{x}</li>)}</ul>
      </Panel>
      <Panel title="Monetization hypotheses (to be validated)">
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr>{["Option", "Prospective payer", "Charging basis", "Main operating costs", "Validation needed"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>{OPTIONS.map((o) => <tr key={o.o} className="border-t"><td className="p-2 font-medium">{o.o}</td><td className="p-2">{o.payer}</td><td className="p-2">{o.basis}</td><td className="p-2">{o.cost}</td><td className="p-2">{o.val}</td></tr>)}</tbody></table></div>
        <p className="mt-2 text-[11px] text-muted-foreground">Hypotheses only — no tariffs, confirmed revenue, guaranteed savings or approved bank participation are implied. Selling customer financial data is not proposed.</p>
      </Panel>
      <Panel title="Illustrative calculator — enter your own assumptions">
        <div className="grid gap-3 md:grid-cols-3">
          {field("banks", "Participating banks")}{field("monthlyInstruments", "Market cheques / month")}{field("adoptionPct", "Digital adoption %")}
          {field("onboardingFee", "Onboarding fee / bank (AED)")}{field("subscriptionPerBankMonth", "Subscription / bank / month")}{field("perInstrumentFee", "Fee / instrument")}
          {field("aiPackagePerBankMonth", "AI package / bank / month")}{field("fixedOpexMonth", "Fixed operating cost / month")}{field("variableCostPerInstrument", "Variable cost / instrument")}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Panel><div className="text-xs text-muted-foreground">Digital instruments / month</div><div className="text-lg font-semibold">{Math.round(m.instrumentsMonth).toLocaleString()}</div></Panel>
          <Panel><div className="text-xs text-muted-foreground">Projected revenue (yr 1)</div><div className="text-lg font-semibold">{aed(m.revenueYear, true)}</div></Panel>
          <Panel><div className="text-xs text-muted-foreground">Modeled operating cost</div><div className="text-lg font-semibold">{aed(m.costYear, true)}</div></Panel>
          <Panel><div className="text-xs text-muted-foreground">Contribution after modeled costs</div><div className={cn("text-lg font-semibold", m.contributionYear < 0 && "text-destructive")}>{aed(m.contributionYear, true)}</div></Panel>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Illustrative only. Fee inputs default to zero so no tariff is implied. Revenue projection ≠ contribution.</p>
      </Panel>
    </div>
  );
}

export { bankById };

export function BankEntitlements({ bank }: { bank: string }) {
  const s = useStore();
  const [batch, setBatch] = useState<{ i: number; ndci?: string; error?: string }[] | null>(null);
  const list = Object.values(s.ext.entitlements).filter((e) => e.bank === bank);
  const bulk = (customerId: string, n: number) => {
    const p = personaById(customerId)!;
    const targets = ["CUST-AHMED", "CUST-FATIMA", "CUST-KHALID"].filter((x) => x !== customerId).map((x) => personaById(x)!);
    const items: E.NewChequeInput[] = Array.from({ length: n }, (_, i) => {
      const b = targets[i % targets.length];
      return { issuingBank: p.bank, payeeBank: b.bank, drawer: p.name, drawerId: p.id, drawerAcct: p.acct, beneficiary: b.name, beneficiaryId: b.id, beneficiaryAcct: b.acct, amount: 1500 + i * 250, payableDate: s.now, purpose: `Payroll batch item ${i + 1}`, purposeCategory: "supplier", requestKey: `BULK-${customerId}-${s.now}-${i}` };
    });
    const r = s.run((st) => X.bulkIssue(st, items), "Batch validated and released");
    if (r.ok) setBatch((r as unknown as { outcomes: { i: number; ndci?: string; error?: string }[] }).outcomes);
    else setBatch(null);
  };
  return (
    <div className="space-y-3">
      {list.length === 0 && <p className="text-sm text-muted-foreground">No demo customers hold entitlement at this bank.</p>}
      {list.map((e) => { const x = E.entitlementSummary(s, e.customerId)!; return (
        <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
          <b>{nameOf(e.customerId)}</b><Mono>{e.id}</Mono>
          <span className="text-xs">Allocated {x.allocated} · Available {x.available} · Reserved {x.reserved} · Consumed {x.consumed}</span>
          {e.additionalRequested > 0 && <Pill tone="warning">Requested +{e.additionalRequested}</Pill>}
          {e.suspended && <Pill tone="danger">Suspended</Pill>}{e.pendingVerification && <Pill tone="warning">Pending verification</Pill>}
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => s.act((st) => X.grantEntitlement(st, e.customerId, Math.max(10, e.additionalRequested)), "Entitlement allocated")}>Allocate +{Math.max(10, e.additionalRequested)}</Button>
            <Button size="sm" variant="outline" onClick={() => s.act((st) => X.setEntitlementFlag(st, e.customerId, "suspended", !e.suspended))}>{e.suspended ? "Unsuspend" : "Suspend"}</Button>
            <Button size="sm" variant="outline" onClick={() => s.act((st) => X.setEntitlementFlag(st, e.customerId, "pendingVerification", !e.pendingVerification))}>{e.pendingVerification ? "Confirm" : "Hold verification"}</Button>
            <Button size="sm" variant="outline" onClick={() => bulk(e.customerId, 3)}>Bulk issue ×3</Button>
          </span>
        </div>
      ); })}
      {batch && <Panel title="Bulk batch — item-level outcomes">{batch.map((o) => <div key={o.i} className="text-xs">Item {o.i + 1}: {o.ndci ? <>reserved · <Mono>{o.ndci}</Mono></> : <span className="text-destructive">{o.error}</span>}</div>)}</Panel>}
      <p className="text-[11px] text-muted-foreground">Entitlement (unused cheque numbers / quota) is separate from account balance. Reserved on submission, consumed only on successful issuance, released on rejection or withdrawal; issued cheque numbers are never recycled. Bank service is simulated.</p>
    </div>
  );
}
