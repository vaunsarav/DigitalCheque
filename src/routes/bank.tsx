import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Ban, Check, Send, Undo2, X, Landmark, Wallet, FileWarning } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useCheques, useStore } from "@/lib/store";
import * as E from "@/lib/engine/engine";
import { BANKS, bankById } from "@/lib/engine/engine";
import { aed, fmtDate, fmtDateTime } from "@/lib/engine/format";
import type { BankId, Cheque } from "@/lib/engine/types";
import { BankChip, DataNote, Kpi, Mono, PageHeader, Panel, Pill, StatusBadge } from "@/components/dc/ui";
import { ChequeDetail } from "@/components/dc/ChequeDetail";
import { ApprovalMatrix, BankEntitlements, BankRequests, SecurityRegister } from "@/components/dc/ext";
import { LiabilityLetters } from '@/components/dc/letters';

export const Route = createFileRoute("/bank")({
  head: () => ({
    meta: [
      { title: "Multi-Bank Operations Portal — Digital Cheque Approvals & Clearing" },
      { name: "description", content: "Issuing and payee bank workspaces for digital cheque approvals, deposits, presentment, clearing, settlement and returns." },
      { property: "og:title", content: "Multi-Bank Operations Portal" },
      { property: "og:description", content: "Bank operations workspace for the digital cheque network (prototype)." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Bank,
});

type Perm = "approve" | "deposit" | "clear" | "settle" | "risk" | "view";
const ROLES: Record<string, Perm[]> = {
  "Digital Cheque Operator": ["view", "deposit"],
  "Issuance Approver": ["view", "approve"],
  "Deposit Operator": ["view", "deposit"],
  "Clearing Officer": ["view", "clear"],
  "Risk and Fraud Analyst": ["view", "risk"],
  "Settlement and Reconciliation Officer": ["view", "settle"],
  "Bank Auditor": ["view"],
};
const ALL_PERMS: Perm[] = ["approve", "deposit", "clear", "settle", "risk", "view"];

function Bank() {
  const { bank, bankRole, setUi, act } = useStore();
  const all = useCheques();
  const [sel, setSel] = useState<string | null>(null);
  const [allRoles, setAllRoles] = useState(true);
  const perms = allRoles ? ALL_PERMS : ROLES[bankRole] ?? ["view"];
  const can = (p: Perm) => perms.includes(p);

  const mine = all.filter((c) => c.issuingBank === bank || c.payeeBank === bank);
  const issuedBy = mine.filter((c) => c.issuingBank === bank);
  const receivedBy = mine.filter((c) => c.payeeBank === bank);

  const approvals = issuedBy.filter((c) => c.status === "requested");
  const deposits = receivedBy.filter((c) => c.status === "deposited" || c.status === "accepted");
  const decisions = issuedBy.filter((c) => c.status === "presented");
  const settlement = mine.filter((c) => (c.status === "paid") || (c.status === "settled" && c.payeeBank === bank) || c.settlementException);
  const returns = mine.filter((c) => c.status === "returned" || c.status === "rejected" || c.status === "stopped");
  const live = issuedBy.filter((c) => ["requested", "authorized", "issued", "delivered", "verified"].includes(c.status));

  const Btn = ({ p, children, ...rest }: { p: Perm; children: ReactNode } & React.ComponentProps<typeof Button>) => (
    <Button size="sm" disabled={!can(p)} title={can(p) ? undefined : `Your role (${bankRole}) cannot perform this action`} {...rest}>{children}</Button>
  );

  const Row = ({ c, children }: { c: Cheque; children?: ReactNode }) => (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
      <button onClick={() => setSel(c.ndci)} className="text-left"><Mono className="font-semibold">{c.ndci}</Mono></button>
      <span className="flex items-center gap-1 text-xs"><BankChip id={c.issuingBank} /> → <BankChip id={c.payeeBank} /></span>
      <span className="min-w-36 flex-1 truncate">{c.drawer} → {c.beneficiary}</span>
      <span className="font-medium tabular-nums">{aed(c.amount)}</span>
      <span className="text-xs text-muted-foreground">Payable {fmtDate(c.payableDate)}</span>
      <StatusBadge status={c.status} />
      {c.settlementException && <Pill tone="danger">Exception</Pill>}
      {c.makerChecker?.pending && <Pill tone="warning">Awaiting corporate checker</Pill>}
      {c.classification === "security" && <Pill tone="warning">Security</Pill>}
      <div className="flex gap-1.5">{children}</div>
    </div>
  );

  const openReq = useStore((st) => st.ext.requests.filter((r) => r.status === "awaiting_bank" && (st.cheques[r.ndci]?.issuingBank === bank)).length);
  const Empty = ({ t }: { t: string }) => <p className="py-8 text-center text-sm text-muted-foreground">{t}</p>;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-6">
      <PageHeader
        eyebrow="Participating bank workspace"
        title={`${bankById(bank).name} (demo)`}
        desc="Each bank sees only instruments it issued, received or is authorised to access."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select value={bank} onChange={(e) => setUi({ bank: e.target.value as BankId })} className="h-9 rounded-md border bg-background px-3 text-sm">
              {BANKS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={allRoles ? "__all" : bankRole} onChange={(e) => { if (e.target.value === "__all") setAllRoles(true); else { setAllRoles(false); setUi({ bankRole: e.target.value }); } }} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="__all">Presenter (all roles)</option>
              {Object.keys(ROLES).map((r) => <option key={r}>{r}</option>)}
            </select>
            <DataNote />
          </div>
        }
      />
      <Tabs defaultValue="dash">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="dash">Dashboard</TabsTrigger>
          <TabsTrigger value="approvals">Issuance Approvals {approvals.length > 0 && <Pill tone="orange" className="ml-1">{approvals.length}</Pill>}</TabsTrigger>
          <TabsTrigger value="deposits">Incoming & Deposits {deposits.length > 0 && <Pill tone="orange" className="ml-1">{deposits.length}</Pill>}</TabsTrigger>
          <TabsTrigger value="decisions">Presentment Decisions {decisions.length > 0 && <Pill tone="orange" className="ml-1">{decisions.length}</Pill>}</TabsTrigger>
          <TabsTrigger value="settle">Settlement & Reconciliation</TabsTrigger>
          <TabsTrigger value="returns">Returns & Exceptions</TabsTrigger>
          <TabsTrigger value="stop">Stop Payment</TabsTrigger>
          <TabsTrigger value="requests">Service Requests {openReq > 0 && <Pill tone="orange" className="ml-1">{openReq}</Pill>}</TabsTrigger>
          <TabsTrigger value="entitlements">Cheque Entitlements</TabsTrigger>
          <TabsTrigger value="security">Security Cheques</TabsTrigger>
          <TabsTrigger value="letters">Liability Letter Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="dash" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Issued by bank" value={issuedBy.length} sub={aed(issuedBy.reduce((a, c) => a + c.amount, 0), true)} icon={<Landmark className="h-4 w-4" />} />
            <Kpi label="Received by bank" value={receivedBy.length} sub={aed(receivedBy.reduce((a, c) => a + c.amount, 0), true)} icon={<Wallet className="h-4 w-4" />} />
            <Kpi label="Pending approvals" value={approvals.length} accent />
            <Kpi label="Pending deposits" value={deposits.length} />
            <Kpi label="Awaiting pay decision" value={decisions.length} />
            <Kpi label="Returns" value={returns.filter((c) => c.status === "returned").length} icon={<FileWarning className="h-4 w-4" />} />
          </div>
          <Panel title="Recent activity">
            <div className="space-y-2">{mine.slice(0, 12).map((c) => <Row key={c.ndci} c={c} />)}</div>
          </Panel>
        </TabsContent>

        <TabsContent value="approvals">
          <Panel title="Customer issuance requests awaiting authorization">
            <div className="space-y-2">
              {approvals.length === 0 && <Empty t="No pending requests." />}
              {approvals.map((c) => (
                <Row key={c.ndci} c={c}>
                  <Btn p="approve" onClick={() => {
                    const r = useStore.getState().run((s) => E.authorize(s, c.ndci)) as { ok: boolean; queued?: boolean };
                    if (r.ok) r.queued ? toast.warning("Bank API unavailable — request queued for retry at EDC") : toast.success("Issuance authorized — sent to EDC");
                  }}><Check className="h-3.5 w-3.5" /> Authorize</Btn>
                  <Btn p="approve" variant="outline" onClick={() => act((s) => E.rejectRequest(s, c.ndci), "Request declined")}><X className="h-3.5 w-3.5" /> Decline</Btn>
                </Row>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="deposits">
          <Panel title="Deposits from our customers (payee bank)">
            <div className="space-y-2">
              {deposits.length === 0 && <Empty t="No deposits awaiting action." />}
              {deposits.map((c) => (
                <Row key={c.ndci} c={c}>
                  {c.status === "deposited" ? (
                    <>
                      <Btn p="deposit" onClick={() => act((s) => E.acceptDeposit(s, c.ndci), "Beneficiary account validated, deposit accepted")}><Check className="h-3.5 w-3.5" /> Validate & accept</Btn>
                      <Btn p="deposit" variant="outline" onClick={() => act((s) => E.acceptDeposit(s, c.ndci, false, "Beneficiary account mismatch"), "Deposit rejected")}><X className="h-3.5 w-3.5" /> Reject</Btn>
                    </>
                  ) : (
                    <Btn p="clear" onClick={() => act((s) => E.present(s, c.ndci), "Presented for clearing")}><Send className="h-3.5 w-3.5" /> Present for clearing</Btn>
                  )}
                </Row>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="decisions">
          <Panel title="Presented cheques drawn on our customers (issuing bank)">
            <div className="space-y-2">
              {decisions.length === 0 && <Empty t="No presented cheques awaiting a decision." />}
              {decisions.map((c) => (
                <Row key={c.ndci} c={c}>
                  <Btn p="clear" onClick={() => act((s) => E.decide(s, c.ndci, true), "Payment approved")}><Check className="h-3.5 w-3.5" /> Pay</Btn>
                  <Btn p="clear" variant="outline" onClick={() => act((s) => E.decide(s, c.ndci, false, "Insufficient funds"), "Returned — insufficient funds")}><Undo2 className="h-3.5 w-3.5" /> Return: insufficient funds</Btn>
                  <Btn p="clear" variant="outline" onClick={() => act((s) => E.decide(s, c.ndci, false, "Refer to drawer"), "Returned — refer to drawer")}>Refer to drawer</Btn>
                </Row>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="settle" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi label="Expected settlement" value={aed(settlement.filter((c) => c.status === "paid").reduce((a, c) => a + c.amount, 0), true)} />
            <Kpi label="Confirmed settlement" value={aed(receivedBy.filter((c) => c.status === "settled" || c.status === "credited").reduce((a, c) => a + c.amount, 0), true)} />
            <Kpi label="Awaiting beneficiary posting" value={receivedBy.filter((c) => c.status === "settled").length} />
            <Kpi label="Unreconciled items" value={mine.filter((c) => c.settlementException).length} accent />
          </div>
          <Panel title="Settlement queue">
            <div className="space-y-2">
              {settlement.length === 0 && <Empty t="Nothing to settle." />}
              {settlement.map((c) => (
                <Row key={c.ndci} c={c}>
                  {c.status === "paid" && !c.settlementException && (
                    <>
                      <Btn p="settle" onClick={() => act((s) => E.settle(s, c.ndci), "Interbank settlement confirmed")}>Confirm settlement</Btn>
                      <Btn p="settle" variant="outline" onClick={() => act((s) => E.settle(s, c.ndci, { fail: true }), "Settlement exception raised")}>Simulate exception</Btn>
                    </>
                  )}
                  {c.settlementException && <Btn p="settle" onClick={() => act((s) => E.reconcile(s, c.ndci), "Reconciled and settled")}>Reconcile</Btn>}
                  {c.status === "settled" && c.payeeBank === bank && <Btn p="settle" onClick={() => act((s) => E.credit(s, c.ndci), "Funds posted to beneficiary")}><Wallet className="h-3.5 w-3.5" /> Post to beneficiary</Btn>}
                </Row>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="returns">
          <Panel title="Returned, rejected and stopped instruments">
            <div className="space-y-2">
              {returns.length === 0 && <Empty t="No returns." />}
              {returns.slice(0, 40).map((c) => (
                <Row key={c.ndci} c={c}><span className="text-xs text-destructive">{c.returnReason}</span><span className="text-xs text-muted-foreground">{fmtDateTime(c.updatedAt)}</span></Row>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="stop">
          <Panel title="Active instruments issued by this bank">
            <div className="space-y-2">
              {live.length === 0 && <Empty t="No active instruments." />}
              {live.map((c) => (
                <Row key={c.ndci} c={c}><Btn p="approve" variant="destructive" onClick={() => act((s) => E.stop(s, c.ndci), "Stop payment recorded — instrument revoked")}><Ban className="h-3.5 w-3.5" /> Stop payment</Btn></Row>
              ))}
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="requests" className="space-y-4">
          <Panel title="Service requests — bank decision changes the authoritative status"><BankRequests bank={bank} /></Panel>
          <Panel title="Approval matrix (configurable)"><ApprovalMatrix /></Panel>
        </TabsContent>
        <TabsContent value="entitlements"><Panel title="Customer cheque entitlement"><BankEntitlements bank={bank} /></Panel></TabsContent>
        <TabsContent value="security"><Panel title="Security cheques register"><SecurityRegister bank={bank} /></Panel></TabsContent>
        <TabsContent value="letters"><LiabilityLetters mode="bank" bank={bank} role={allRoles ? 'Issuance Approver' : bankRole} /></TabsContent>
      </Tabs>
      <ChequeDetail ndci={sel} onClose={() => setSel(null)} />
    </div>
  );
}
