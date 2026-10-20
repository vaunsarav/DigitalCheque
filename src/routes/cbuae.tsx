import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Banknote, Clock, FileCheck2, RotateCcw, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCheques, useStore } from "@/lib/store";
import { BANKS, STATUS_LABEL, bankById, resolveAlert } from "@/lib/engine/engine";
import { DAY, aed, dubaiDay, fmtDate, fmtDateTime } from "@/lib/engine/format";
import type { BankId, Cheque, Status } from "@/lib/engine/types";
import { BankChip, DataNote, Kpi, Mono, PageHeader, Panel, Pill, StatusBadge } from "@/components/dc/ui";
import { ChequeDetail } from "@/components/dc/ChequeDetail";
import { ChequeTable } from "@/components/dc/ChequeTable";
import { LiabilityReport } from "@/components/dc/ext";
import { LetterOversight } from '@/components/dc/letters';

export const Route = createFileRoute("/cbuae")({
  head: () => ({
    meta: [
      { title: "CBUAE Regulatory Command Centre — Digital Cheque Oversight" },
      { name: "description", content: "National overview of digital cheque issuance, clearing, settlement, risk alerts and the national cheque registry." },
      { property: "og:title", content: "CBUAE Regulatory Command Centre" },
      { property: "og:description", content: "National digital cheque supervision dashboard (prototype)." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cbuae,
});

const C = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];
const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 } };

function procHours(c: Cheque) {
  const a = c.events.find((e) => e.status === "presented");
  const b = c.events.find((e) => e.status === "settled");
  return a && b ? (b.at - a.at) / 3600_000 : null;
}

function Cbuae() {
  const cheques = useCheques();
  const now = useStore((s) => s.now);
  const alerts = useStore((s) => s.alerts);
  const act = useStore((s) => s.act);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fs, setFs] = useState<Status | "all">("all");
  const [fb, setFb] = useState<BankId | "all">("all");

  const m = useMemo(() => {
    const total = cheques.reduce((a, c) => a + c.amount, 0);
    const today = cheques.filter((c) => c.createdAt >= dubaiDay(now));
    const inClearing = cheques.filter((c) => c.status === "presented" || c.status === "paid");
    const returned = cheques.filter((c) => c.status === "returned");
    const decided = cheques.filter((c) => ["returned", "paid", "settled", "credited"].includes(c.status));
    const proc = cheques.map(procHours).filter((x): x is number => x !== null);
    const pdc = cheques.filter((c) => c.payableDate > now && !["stopped", "rejected"].includes(c.status));
    const trend = Array.from({ length: 30 }, (_, i) => {
      const d0 = dubaiDay(now) - (29 - i) * DAY;
      const day = cheques.filter((c) => c.createdAt >= d0 && c.createdAt < d0 + DAY);
      return { d: fmtDate(d0).slice(0, 6), count: day.length, value: Math.round(day.reduce((a, c) => a + c.amount, 0) / 1000) };
    });
    const byBank = BANKS.map((b) => {
      const iss = cheques.filter((c) => c.issuingBank === b.id);
      const rec = cheques.filter((c) => c.payeeBank === b.id);
      return {
        id: b.id, name: b.short, issued: iss.length, received: rec.length,
        value: iss.reduce((a, c) => a + c.amount, 0),
        returns: iss.filter((c) => c.status === "returned").length,
        rate: iss.length ? (iss.filter((c) => c.status === "returned").length / iss.length) * 100 : 0,
      };
    });
    const matrix = BANKS.map((a) => BANKS.map((b) => cheques.filter((c) => c.issuingBank === a.id && c.payeeBank === b.id).length));
    const bands = [
      ["< 10K", 0, 10_000], ["10–50K", 10_000, 50_000], ["50–250K", 50_000, 250_000], ["250K–1M", 250_000, 1e6], ["> 1M", 1e6, Infinity],
    ].map(([n, lo, hi]) => ({ n: n as string, v: cheques.filter((c) => c.amount >= (lo as number) && c.amount < (hi as number)).length }));
    const statusMix = Object.entries(cheques.reduce<Record<string, number>>((a, c) => ((a[STATUS_LABEL[c.status]] = (a[STATUS_LABEL[c.status]] ?? 0) + 1), a), {})).map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v);
    const maturity = [0, 30, 60, 90, 180].map((d, i, arr) => ({
      n: i === arr.length - 1 ? `${d}+ d` : `${d}–${arr[i + 1]} d`,
      v: pdc.filter((c) => { const x = (c.payableDate - now) / DAY; return x >= d && (i === arr.length - 1 || x < arr[i + 1]); }).length,
    }));
    return { total, today, inClearing, returned, decided, proc, pdc, trend, byBank, matrix, bands, statusMix, maturity };
  }, [cheques, now]);

  const rows = cheques.filter((c) =>
    (fs === "all" || c.status === fs) && (fb === "all" || c.issuingBank === fb || c.payeeBank === fb) &&
    (!q || `${c.ndci} ${c.drawer} ${c.beneficiary} ${c.chequeNo}`.toLowerCase().includes(q.toLowerCase())));

  const avgProc = m.proc.length ? m.proc.reduce((a, b) => a + b, 0) / m.proc.length : 0;
  const open = alerts.filter((a) => !a.resolved);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-6">
      <PageHeader eyebrow="Central Bank of the UAE · Regulatory view" title="Regulatory Command Centre" desc="Read-only national supervision of every digital cheque, across all participating banks." right={<DataNote />} />
      <Tabs defaultValue="overview">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="overview">National Overview</TabsTrigger>
          <TabsTrigger value="banks">Bank Directory</TabsTrigger>
          <TabsTrigger value="registry">National Registry</TabsTrigger>
          <TabsTrigger value="risk">Risk Supervision {open.length > 0 && <Pill tone="danger" className="ml-1">{open.length}</Pill>}</TabsTrigger>
          <TabsTrigger value="clearing">Clearing & Settlement</TabsTrigger>
          <TabsTrigger value="commitments">Commitments Oversight</TabsTrigger>
          <TabsTrigger value="letters">Liability Letters Oversight</TabsTrigger>
          <TabsTrigger value="context">Context</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Instruments registered" value={cheques.length.toLocaleString()} icon={<FileCheck2 className="h-4 w-4" />} sub={`${m.today.length} today`} />
            <Kpi label="Registered value" value={aed(m.total, true)} icon={<Banknote className="h-4 w-4" />} />
            <Kpi label="In clearing" value={m.inClearing.length} sub={aed(m.inClearing.reduce((a, c) => a + c.amount, 0), true)} />
            <Kpi label="Return rate" value={`${m.decided.length ? ((m.returned.length / m.decided.length) * 100).toFixed(1) : 0}%`} icon={<RotateCcw className="h-4 w-4" />} />
            <Kpi label="Avg clearing → settlement" value={`${avgProc.toFixed(1)} h`} icon={<Clock className="h-4 w-4" />} />
            <Kpi label="Open risk alerts" value={open.length} icon={<AlertTriangle className="h-4 w-4 text-orange" />} accent />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="Issuance volume & value — last 30 days" className="xl:col-span-2">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={m.trend}>
                  <defs>
                    <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--chart-2)" stopOpacity={0.5} /><stop offset="1" stopColor="var(--chart-2)" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="d" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis yAxisId="a" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis yAxisId="b" orientation="right" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <Tooltip {...tip} />
                  <Area yAxisId="b" dataKey="value" name="Value (AED K)" stroke="var(--chart-2)" fill="url(#g1)" />
                  <Area yAxisId="a" dataKey="count" name="Cheques" stroke="var(--chart-1)" fill="transparent" strokeWidth={2} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </AreaChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Daily number of digital cheques issued (Cheques — left axis) and their combined face value in AED thousands (Value — right axis), over the last 30 days.</p>
            </Panel>
            <Panel title="Processing status distribution">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={m.statusMix} dataKey="v" nameKey="n" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {m.statusMix.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                  </Pie>
                  <Tooltip {...tip} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Share of registered instruments by current lifecycle status — from requested and issued, through presented and settled, to returned, stopped or cancelled items.</p>
            </Panel>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="Issuing bank × payee bank matrix" className="xl:col-span-2">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr><th className="p-2 text-left text-muted-foreground">Issuer ↓ / Payee →</th>{BANKS.map((b) => <th key={b.id} className="p-2">{b.short}</th>)}</tr></thead>
                  <tbody>
                    {BANKS.map((a, i) => {
                      const max = Math.max(...m.matrix.flat());
                      return (
                        <tr key={a.id}>
                          <td className="p-2 font-medium">{a.short}</td>
                          {m.matrix[i].map((v, j) => (
                            <td key={j} className="p-1">
                              <div className="rounded-md py-2 text-center font-medium tabular-nums" style={{ background: `color-mix(in oklch, var(--chart-1) ${Math.round((v / max) * 85)}%, transparent)` }}>{v}</div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted-foreground">Number of cheques flowing from the issuing bank (row) to the payee bank (column). Deeper shading means a higher volume between the two banks.</p>
              </div>
            </Panel>
            <Panel title="Cheques by amount band">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={m.bands}><XAxis dataKey="n" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip {...tip} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="v" name="Cheques" fill="var(--chart-1)" radius={[6, 6, 0, 0]} /></BarChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Count of registered instruments grouped by face-value band — shows whether activity is concentrated in small retail cheques or large commercial ones.</p>
            </Panel>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Bank-wise distribution & return rate">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={m.byBank}><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip {...tip} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="issued" name="Issued" fill="var(--chart-1)" radius={[4, 4, 0, 0]} /><Bar dataKey="received" name="Received" fill="var(--chart-3)" radius={[4, 4, 0, 0]} /><Bar dataKey="returns" name="Returns" fill="var(--chart-2)" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Per-bank counts of cheques issued, received and returned — each bank's role in the network and its relative return burden. A return is a cheque that failed payment and went back to the presenter.</p>
            </Panel>
            <Panel title={`Post-dated cheque maturity (${m.pdc.length} outstanding)`}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={m.maturity}><XAxis dataKey="n" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip {...tip} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="v" name="Cheques" fill="var(--chart-2)" radius={[6, 6, 0, 0]} /></BarChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Outstanding post-dated cheques grouped by days remaining until each becomes payable — the forward maturity profile of future payment obligations.</p>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="banks">
          <Panel title="Participating bank directory">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr className="border-b">{["Bank", "SWIFT", "Connection", "Issued", "Received", "Value issued", "Return rate", "Status"].map((h) => <th key={h} className="p-2 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {m.byBank.map((b) => <BankRow key={b.id} b={b} />)}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="registry">
          <Panel>
            <div className="mb-4 flex flex-wrap gap-2">
              <div className="relative min-w-60 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NDCI, drawer, beneficiary, cheque no." className="pl-9" /></div>
              <select value={fs} onChange={(e) => setFs(e.target.value as Status)} className="rounded-md border bg-background px-3 text-sm">
                <option value="all">All statuses</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={fb} onChange={(e) => setFb(e.target.value as BankId)} className="rounded-md border bg-background px-3 text-sm">
                <option value="all">All banks</option>
                {BANKS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <ChequeTable rows={rows.slice(0, 150)} onOpen={setSel} />
            <div className="mt-3 text-xs text-muted-foreground">Showing {Math.min(150, rows.length)} of {rows.length} instruments</div>
          </Panel>
        </TabsContent>

        <TabsContent value="risk">
          <Panel title="Risk & fraud supervision">
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
                  <Pill tone={a.severity === "critical" || a.severity === "high" ? "danger" : a.severity === "medium" ? "warning" : "neutral"}>{a.severity}</Pill>
                  <span className="font-medium">{a.kind.replace(/_/g, " ")}</span>
                  <span className="flex-1 text-muted-foreground">{a.message}</span>
                  {a.bank && <BankChip id={a.bank} />}
                  {a.ndci && <button onClick={() => setSel(a.ndci!)} className="text-primary underline-offset-2 hover:underline"><Mono>{a.ndci}</Mono></button>}
                  <span className="text-xs text-muted-foreground">{fmtDateTime(a.at)}</span>
                  {a.resolved ? <Pill tone="success">Resolved</Pill> : <Button size="sm" variant="outline" onClick={() => act((s) => resolveAlert(s, a.id), "Alert marked reviewed")}>Mark reviewed</Button>}
                </div>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="clearing" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {(["presented", "paid", "settled", "returned"] as Status[]).map((s) => {
              const l = cheques.filter((c) => c.status === s);
              return <Kpi key={s} label={STATUS_LABEL[s]} value={l.length} sub={aed(l.reduce((a, c) => a + c.amount, 0), true)} />;
            })}
          </div>
          <Panel title="Items in clearing pipeline">
            <ChequeTable rows={cheques.filter((c) => ["presented", "paid", "settled"].includes(c.status) || c.settlementException).slice(0, 60)} onOpen={setSel} />
          </Panel>
        </TabsContent>

        <TabsContent value="context">
          <Panel title="Why modernise? Historic paper cheque clearing (ICCS)">
            <div className="grid gap-4 md:grid-cols-3">
              <Kpi label="Cheques via ICCS (2025)" value="23.78M" sub="Paper-cheque image clearing — CBUAE 2025 Annual Report" />
              <Kpi label="Value via ICCS (2025)" value="AED 1.5T" sub="Paper-cheque history, not digital-cheque adoption" />
              <Kpi label="This prototype" value="Synthetic" sub="All digital cheque figures shown are demonstration data" accent />
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="commitments"><LiabilityReport readOnly /></TabsContent>
        <TabsContent value="letters"><LetterOversight /></TabsContent>
      </Tabs>
      <ChequeDetail ndci={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function BankRow({ b }: { b: { id: BankId; issued: number; received: number; value: number; rate: number } }) {
  const link = useStore((s) => s.bankLinks[b.id]);
  return (
    <tr className="border-b last:border-0">
      <td className="p-2"><BankChip id={b.id} full /></td>
      <td className="p-2"><Mono>{bankById(b.id).swift}</Mono></td>
      <td className="p-2">{link === "up" ? <Pill tone="success">Online</Pill> : <Pill tone="danger">Outage</Pill>}</td>
      <td className="p-2 tabular-nums">{b.issued}</td>
      <td className="p-2 tabular-nums">{b.received}</td>
      <td className="p-2 tabular-nums">{aed(b.value, true)}</td>
      <td className="p-2 tabular-nums">{b.rate.toFixed(1)}%</td>
      <td className="p-2"><Pill tone="brand">Participant (demo)</Pill></td>
    </tr>
  );
}

