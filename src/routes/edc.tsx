import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Cpu, KeyRound, Lock, Radio, RefreshCw, ScanLine, ShieldCheck, Wifi, WifiOff, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCheques, useStore } from "@/lib/store";
import * as E from "@/lib/engine/engine";
import { BANKS, bankById } from "@/lib/engine/engine";
import { aed, fmtDateTime } from "@/lib/engine/format";
import type { Cheque, VerifyResult } from "@/lib/engine/types";
import { BankChip, ChequeVisual, DataNote, Kpi, Mono, PageHeader, Panel, Pill, StatusBadge, VerifyResultCard } from "@/components/dc/ui";
import { ChequeDetail } from "@/components/dc/ChequeDetail";
import { AiPanel, ApprovalMatrix, LiabilityReport, Monetization, RequestCard, SecurityRegister } from "@/components/dc/ext";
import { LiabilityLetters } from '@/components/dc/letters';

function EdcRequests() {
  const reqs = useStore((s) => s.ext.requests);
  return <div className="space-y-2">{reqs.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet.</p> : reqs.map((r) => <RequestCard key={r.id} r={r} as={{ kind: "customer", id: "EDC" }} />)}</div>;
}

export const Route = createFileRoute("/edc")({
  head: () => ({
    meta: [
      { title: "EDC Digital Cheque Custodian — Issuance, Vault & Verification" },
      { name: "description", content: "EDC custodian operations: generate and sign digital cheques, national registry, vault, verification and bank connectivity." },
      { property: "og:title", content: "EDC Digital Cheque Custodian" },
      { property: "og:description", content: "Technology operator portal for the digital cheque trust network (prototype)." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Edc,
});

function Edc() {
  const cheques = useCheques();
  const { bankLinks, retryQueue, verifications, audit, act, run, verify } = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [vr, setVr] = useState<{ result: VerifyResult; cheque?: Cheque } | null>(null);
  const queue = cheques.filter((c) => c.status === "authorized" || c.status === "requested");
  const issued = cheques.filter((c) => c.hash);
  const latest = issued[0];
  const certs = BANKS.flatMap((b) => [1, 2, 3, 4].map((n) => `EDC-CA-${b.id}-2026-0${n}`));

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-6">
      <PageHeader eyebrow="EDC · Electronic Documents Centre" title="Digital Cheque Custodian" desc="Generates, signs, registers and safeguards every instrument. EDC does not create payment obligations or hold funds." right={<DataNote />} />
      <Tabs defaultValue="ops">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="ops">Operations</TabsTrigger>
          <TabsTrigger value="queue">Issuance Engine {queue.filter((c) => c.status === "authorized").length > 0 && <Pill tone="orange" className="ml-1">{queue.filter((c) => c.status === "authorized").length}</Pill>}</TabsTrigger>
          <TabsTrigger value="vault">Vault & Registry</TabsTrigger>
          <TabsTrigger value="verify">Verification</TabsTrigger>
          <TabsTrigger value="banks">Bank Integration {retryQueue.length > 0 && <Pill tone="danger" className="ml-1">{retryQueue.length}</Pill>}</TabsTrigger>
          <TabsTrigger value="security">Security & Audit</TabsTrigger>
          <TabsTrigger value="liability">Liability and Commitments</TabsTrigger>
          <TabsTrigger value="ai">AI Operations Assistant</TabsTrigger>
          <TabsTrigger value="requests">Service Requests</TabsTrigger>
          <TabsTrigger value="value">Product Value & Commercial</TabsTrigger>
        </TabsList>

        <TabsContent value="ops" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Instruments in custody" value={issued.length} icon={<Lock className="h-4 w-4" />} />
            <Kpi label="Awaiting generation" value={queue.filter((c) => c.status === "authorized").length} icon={<Cpu className="h-4 w-4" />} accent />
            <Kpi label="Verifications processed" value={verifications.toLocaleString()} icon={<ScanLine className="h-4 w-4" />} />
            <Kpi label="Bank links online" value={`${Object.values(bankLinks).filter((v) => v === "up").length}/${BANKS.length}`} icon={<Wifi className="h-4 w-4" />} />
            <Kpi label="Retry queue" value={retryQueue.length} icon={<RefreshCw className="h-4 w-4" />} />
            <Kpi label="Avg signing latency" value="182 ms" sub="Simulated HSM" icon={<Zap className="h-4 w-4" />} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Most recently generated instrument">{latest ? <ChequeVisual c={latest} /> : "—"}</Panel>
            <Panel title="Native digital cheque vs. alternatives">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr className="border-b"><th className="p-2 text-left">Capability</th><th className="p-2">Native digital cheque</th><th className="p-2">Scanned paper cheque</th><th className="p-2">Bank transfer</th></tr></thead>
                <tbody>
                  {[
                    ["Born electronic, signed instrument", "✓", "—", "—"],
                    ["Unique national identifier", "✓", "—", "Partial"],
                    ["Post-dated / deferred payment", "✓", "✓", "—"],
                    ["Cryptographic tamper detection", "✓", "—", "n/a"],
                    ["Negotiable cheque legal form", "✓ (proposed)", "✓", "—"],
                    ["Paper handling & courier", "None", "Required", "None"],
                    ["Regulator end-to-end trace", "✓", "Partial", "Partial"],
                  ].map((r) => <tr key={r[0]} className="border-b last:border-0">{r.map((x, i) => <td key={i} className={i ? "p-2 text-center" : "p-2"}>{x}</td>)}</tr>)}
                </tbody>
              </table>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="queue">
          <Panel title="Live issuance queue">
            <div className="space-y-2">
              {queue.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Queue empty. Issue a cheque from the customer app to see it arrive here.</p>}
              {queue.map((c) => (
                <div key={c.ndci} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
                  <Mono>{c.requestId}</Mono>
                  <BankChip id={c.issuingBank} />
                  <span className="min-w-40 flex-1">{c.drawer} → {c.beneficiary}</span>
                  <span className="tabular-nums font-medium">{aed(c.amount)}</span>
                  <StatusBadge status={c.status} />
                  <span className="text-xs text-muted-foreground">{fmtDateTime(c.createdAt)}</span>
                  {c.status === "authorized" ? (
                    <Button size="sm" onClick={() => act((s) => E.issue(s, c.ndci), "Instrument generated, signed and delivered")}>
                      <KeyRound className="h-3.5 w-3.5" /> Generate & sign
                    </Button>
                  ) : (
                    <Pill tone="warning">Waiting for bank authorization</Pill>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="vault">
          <Panel title={`Digital vault — ${issued.length} instruments in custody`}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {issued.slice(0, 24).map((c) => (
                <button key={c.ndci} onClick={() => setSel(c.ndci)} className="space-y-2 rounded-xl border p-3 text-left text-xs transition hover:border-orange">
                  <div className="flex items-center justify-between"><Mono className="font-semibold">{c.ndci}</Mono><StatusBadge status={c.status} /></div>
                  <div className="flex justify-between"><span>{c.beneficiary}</span><span className="font-medium tabular-nums">{aed(c.amount)}</span></div>
                  <div className="text-muted-foreground">{c.docRef} · {c.certId}</div>
                  <Mono className="block truncate text-muted-foreground">{c.hash}</Mono>
                </button>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="verify">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Verification service">
              <p className="mb-3 text-sm text-muted-foreground">Enter an NDCI or paste a scanned QR token.</p>
              <div className="flex gap-2">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="AE-DC-2026-…" className="font-mono" />
                <Button onClick={() => setVr(verify(q, "edc"))}><ScanLine className="h-4 w-4" /> Verify</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {issued.slice(0, 4).map((c) => <button key={c.ndci} onClick={() => setQ(c.ndci)} className="rounded-md border px-2 py-1 text-[11px]"><Mono>{c.ndci}</Mono></button>)}
              </div>
            </Panel>
            <Panel title="Result">{vr ? <VerifyResultCard {...vr} /> : <p className="text-sm text-muted-foreground">No verification yet.</p>}</Panel>
          </div>
        </TabsContent>

        <TabsContent value="banks" className="space-y-4">
          <Panel title="Bank connectivity">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {BANKS.map((b) => {
                const up = bankLinks[b.id] === "up";
                return (
                  <div key={b.id} className={`rounded-xl border p-4 ${up ? "" : "border-destructive/50 bg-destructive/5"}`}>
                    <div className="flex items-center justify-between"><BankChip id={b.id} full />{up ? <Pill tone="success"><Wifi className="h-3 w-3" /> Online</Pill> : <Pill tone="danger"><WifiOff className="h-3 w-3" /> Outage</Pill>}</div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-muted-foreground">API health</div>{up ? "99.98%" : "0%"}</div>
                      <div><div className="text-muted-foreground">Latency</div>{up ? `${80 + b.hue % 60} ms` : "—"}</div>
                      <div><div className="text-muted-foreground">mTLS cert</div>Valid</div>
                    </div>
                    <Button size="sm" variant={up ? "outline" : "default"} className="mt-3 w-full" onClick={() => act((s) => E.setLink(s, b.id, !up), up ? `${b.name} outage simulated` : `${b.name} link restored`)}>
                      <Radio className="h-3.5 w-3.5" /> {up ? "Simulate outage" : "Restore link"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title="Retry queue (idempotent — no duplicate issuance)">
            {retryQueue.length === 0 ? <p className="text-sm text-muted-foreground">No failed jobs.</p> : retryQueue.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-3 border-b py-2 text-sm last:border-0">
                <Mono>{j.id}</Mono><Mono>{j.ndci}</Mono><span className="flex-1 text-destructive">{j.lastError}</span><span className="text-xs">Attempts: {j.attempts}</span>
                <Button size="sm" onClick={() => {
                  const c = useStore.getState().cheques[j.ndci];
                  const up = useStore.getState().bankLinks[c.issuingBank] === "up";
                  run((s) => E.retry(s, j.id), up ? "Retry succeeded — processing resumed, no duplicate created" : undefined);
                  if (!up) toast.error(`${bankById(c.issuingBank).name} still unavailable — attempt logged`);
                }}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
              </div>
            ))}
          </Panel>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Panel title="Signing certificates (simulated PKI / HSM)">
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
              {certs.map((id) => (
                <div key={id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                  <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-success" /><Mono>{id}</Mono></span>
                  {id === "EDC-CA-DIB-2026-02" ? <Pill tone="warning">Expires 21d</Pill> : <Pill tone="success">Active</Pill>}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Immutable audit log">
            <div className="max-h-[480px] space-y-1 overflow-y-auto text-xs">
              {audit.map((a) => (
                <div key={a.id} className="grid grid-cols-[130px_110px_1fr_auto] gap-3 border-b py-1.5 last:border-0">
                  <span className="text-muted-foreground">{fmtDateTime(a.at)}</span>
                  <Pill>{a.actor.replace("_", " ")}</Pill>
                  <span>{a.action} {a.bank && <span className="text-muted-foreground">· {bankById(a.bank).short}</span>}</span>
                  {a.ndci ? <button onClick={() => setSel(a.ndci!)}><Mono>{a.ndci}</Mono></button> : <span />}
                </div>
              ))}
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="liability"><Tabs defaultValue="letters"><TabsList className="mb-4"><TabsTrigger value="letters">Liability Letters</TabsTrigger><TabsTrigger value="live">Live commitments report</TabsTrigger></TabsList><TabsContent value="letters"><LiabilityLetters mode="edc" /></TabsContent><TabsContent value="live"><LiabilityReport /></TabsContent></Tabs></TabsContent>
        <TabsContent value="ai"><Panel><AiPanel scope="edc" /></Panel></TabsContent>
        <TabsContent value="requests" className="space-y-4">
          <Panel title="Approval matrix"><ApprovalMatrix /></Panel>
          <Panel title="All service requests (read-only lifecycle registry)"><EdcRequests /></Panel>
          <Panel title="Security cheques register"><SecurityRegister /></Panel>
        </TabsContent>
        <TabsContent value="value"><Monetization /></TabsContent>
      </Tabs>
      <ChequeDetail ndci={sel} onClose={() => setSel(null)} />
    </div>
  );
}
