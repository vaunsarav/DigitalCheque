import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowRight, Building2, CheckCircle2, Landmark, Play, ShieldCheck, Smartphone } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useCheques, useStore } from "@/lib/store";
import { aed } from "@/lib/engine/format";
import { BANKS } from "@/lib/engine/engine";
import featIssue from "@/assets/feat-issue.jpg";
import featVault from "@/assets/feat-vault.jpg";
import featClearing from "@/assets/feat-clearing.jpg";
import featOversight from "@/assets/feat-oversight.jpg";
import featVerify from "@/assets/feat-verify.jpg";
import featPostdated from "@/assets/feat-postdated.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EDC Digital Cheque Trust Network — UAE Ecosystem Prototype" },
      { name: "description", content: "One trusted digital cheque network for every UAE bank: issuance, custody, clearing and national oversight with regulator-grade metrics." },
      { property: "og:title", content: "EDC Digital Cheque Trust Network" },
      { property: "og:description", content: "Interactive future-state prototype of a UAE national digital cheque ecosystem with supervisory analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const APPS = [
  { to: "/cbuae", icon: Landmark, title: "CBUAE Regulatory Command Centre", desc: "National oversight, registry, risk supervision and clearing analytics." },
  { to: "/edc", icon: ShieldCheck, title: "EDC Digital Cheque Custodian", desc: "Instrument generation, signing, vault, verification and bank connectivity." },
  { to: "/bank", icon: Building2, title: "Multi-Bank Operations Portal", desc: "Issuing and payee bank workspaces: approvals, deposits, clearing, returns." },
  { to: "/mobile", icon: Smartphone, title: "Customer Mobile App", desc: "Issue, receive, verify and deposit digital cheques with live tracking." },
] as const;

const FEATURES = [
  { img: featIssue, tag: "01 · Issuance", title: "Born-digital issuance", to: "/mobile",
    summary: "Customers issue cheques in the bank app with entitlement checks, mandatory purpose, Review & Sign, and biometric or UAE PASS-style signing.",
    points: ["Cheque allowance separate from balance", "Maker-checker for corporates", "Re-sign on any change of terms"] },
  { img: featVault, tag: "02 · Custody", title: "EDC secure vault", to: "/edc",
    summary: "Every instrument gets a unique National Digital Cheque ID (NDCI), a digital signature and a tamper-evident fingerprint held in EDC custody.",
    points: ["Unique NDCI with check character", "Signed hash of canonical fields", "Full immutable audit trail"] },
  { img: featVerify, tag: "03 · Verification", title: "Instant QR verification", to: "/edc",
    summary: "Anyone holding a copy can scan its QR code to confirm authenticity, current status and payable date — tampered copies are flagged instantly.",
    points: ["Matching issuer & beneficiary copies", "Tamper detection on presentment", "Duplicate presentment blocked"] },
  { img: featClearing, tag: "04 · Clearing", title: "Interbank clearing & settlement", to: "/bank",
    summary: "e-Deposit, presentment, payment, settlement and crediting flow between all participating banks with idempotent retries during outages.",
    points: ["Stage-by-stage deposit tracking", "Returns with reason codes", "Reconciliation of exceptions"] },
  { img: featPostdated, tag: "05 · Post-dated & AI", title: "Post-dated, security & auto-deposit", to: "/mobile",
    summary: "Post-dated and security cheques stay visible as commitments; consented auto-deposit presents them on the due date; an AI assistant prepares drafts only.",
    points: ["Security cheque release workflow", "Auto-deposit mandates with limits", "AI never signs or moves money"] },
  { img: featOversight, tag: "06 · Oversight", title: "Regulator command centre", to: "/cbuae",
    summary: "CBUAE sees the whole national picture: volumes, values, return ratios, concentration, outstanding commitments and high-value alerts in real time.",
    points: ["Commitments & liability views", "Risk and fraud supervision", "Per-bank performance league"] },
] as const;

const PAID = new Set(["paid", "settled", "credited"]);
const C = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" } };

/**
 * Gradient paint definitions for the charts.
 * Rendered once in a hidden SVG: the charting library drops <defs> passed as chart
 * children, so series reference these by id (url(#id)) instead.
 */
function ChartGradients() {
  const stops = (color: string, from = 0.95, to = 0.35) => (
    <>
      <stop offset="0%" style={{ stopColor: color, stopOpacity: from }} />
      <stop offset="100%" style={{ stopColor: color, stopOpacity: to }} />
    </>
  );
  const v = (id: string, color: string) => (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">{stops(color)}</linearGradient>
  );
  const h = (id: string, color: string) => (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">{stops(color, 0.6, 1)}</linearGradient>
  );
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        {v("g-volume", "var(--chart-1)")}
        {h("g-value", "var(--chart-2)")}
        {v("g-rate", "var(--chart-5)")}
        {v("g-stp", "var(--chart-3)")}
        {v("g-return", "var(--chart-5)")}
        {v("g-maturity", "var(--chart-2)")}
        {h("g-status", "var(--chart-4)")}
      </defs>
    </svg>
  );
}

function useMetrics() {
  const cheques = useCheques();
  return useMemo(() => {
    const now = cheques.reduce((m, c) => Math.max(m, c.updatedAt), 0);
    const months = new Map<string, { k: number; m: string; volume: number; value: number; returned: number }>();
    for (const c of cheques) {
      const d = new Date(c.issueDate);
      const k = d.toLocaleString("en-GB", { month: "short", year: "2-digit" });
      const r = months.get(k) ?? { k: d.getFullYear() * 12 + d.getMonth(), m: k, volume: 0, value: 0, returned: 0 };
      r.volume++; r.value += c.amount / 1e6; if (c.status === "returned") r.returned++;
      months.set(k, r);
    }
    const trend = [...months.values()].sort((a, b) => a.k - b.k).map((r) => ({ ...r, value: +r.value.toFixed(2), rate: +((r.returned / r.volume) * 100).toFixed(1) }));
    const banks = BANKS.map((b) => {
      const mine = cheques.filter((c) => c.issuingBank === b.id);
      const ret = mine.filter((c) => c.status === "returned").length;
      const done = mine.filter((c) => PAID.has(c.status)).length;
      return { bank: b.short, value: +(mine.reduce((a, c) => a + c.amount, 0) / 1e6).toFixed(2), volume: mine.length,
        returnRate: mine.length ? +((ret / mine.length) * 100).toFixed(1) : 0,
        stp: mine.length ? +((done / mine.length) * 100).toFixed(1) : 0 };
    });
    const day = 86400000;
    const buckets = [["0–30 days", 0, 30], ["31–90 days", 31, 90], ["91–180 days", 91, 180], ["180+ days", 181, 99999]] as const;
    const future = cheques.filter((c) => c.payableDate > now && !["returned", "rejected", "stopped", "cancelled", "replaced"].includes(c.status));
    const maturity = buckets.map(([label, lo, hi]) => {
      const set = future.filter((c) => { const d = (c.payableDate - now) / day; return d >= lo && d <= hi + 0.999; });
      return { bucket: label, count: set.length, value: +(set.reduce((a, c) => a + c.amount, 0) / 1e6).toFixed(2) };
    });
    const statusMap = new Map<string, number>();
    for (const c of cheques) statusMap.set(c.status, (statusMap.get(c.status) ?? 0) + 1);
    const status = [...statusMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
    const returned = cheques.filter((c) => c.status === "returned").length;
    const paid = cheques.filter((c) => PAID.has(c.status)).length;
    const highValue = cheques.filter((c) => c.amount >= 500000).length;
    const totalValue = cheques.reduce((a, c) => a + c.amount, 0);
    const hhi = banks.reduce((a, b) => a + Math.pow((b.value * 1e6) / (totalValue || 1) * 100, 2), 0);
    return { cheques, trend, banks, maturity, status, returned, paid, highValue, totalValue, hhi: Math.round(hhi),
      outstanding: future.reduce((a, c) => a + c.amount, 0) };
  }, [cheques]);
}

function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="premium-card relative overflow-hidden rounded-2xl p-5">
      <div className="gradient-rule absolute inset-x-0 top-0" />
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-4 text-xs text-muted-foreground">{note}</p>
      <div className="h-64">{children}</div>
    </div>
  );
}

function Index() {
  const m = useMetrics();
  const verifications = useStore((s) => s.verifications);
  const n = m.cheques.length || 1;
  const kpis = [
    ["Instruments registered", m.cheques.length.toLocaleString(), "Unique NDCIs in custody"],
    ["Value registered", aed(m.totalValue, true), "Gross AED value (demo)"],
    ["Settlement rate", `${((m.paid / n) * 100).toFixed(1)}%`, "Paid, settled or credited"],
    ["Return ratio", `${((m.returned / n) * 100).toFixed(1)}%`, "Returned ÷ total instruments"],
    ["High-value alerts", String(m.highValue), "≥ AED 500,000 per instrument"],
    ["Outstanding commitments", aed(m.outstanding, true), "Post-dated, not yet payable"],
    ["Market concentration (HHI)", m.hhi.toLocaleString(), m.hhi > 2500 ? "Highly concentrated" : m.hhi > 1500 ? "Moderately concentrated" : "Unconcentrated"],
    ["Verifications", verifications.toLocaleString(), "QR / NDCI status checks"],
  ];

  return (
    <div>
      <ChartGradients />
      {/* Hero */}
      <section className="bg-hero relative overflow-hidden text-brand-foreground">
        <div className="hero-rings pointer-events-none absolute inset-0" />
        <div className="hero-sheen pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <div className="text-gradient-gold-bright text-xs font-semibold uppercase tracking-[0.25em]">UAE National Digital Cheque Ecosystem · Proof of concept</div>
            <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-[-0.03em] md:text-6xl">
              One Trusted Digital Cheque Network. Every Bank. <span className="text-gradient-gold-bright">Complete Visibility.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base opacity-85 md:text-lg">
              A native digital cheque is born electronic — signed, uniquely registered, held in EDC custody, cleared between banks and visible end-to-end to the regulator.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-gradient-gold px-6 text-brand hover:opacity-90">
                <Link to="/presenter"><Play className="h-4 w-4" /> Start guided demo</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-brand-foreground/30 bg-transparent px-6 text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground">
                <a href="#metrics">View regulator metrics <ArrowRight className="h-4 w-4" /></a>
              </Button>
            </div>
          </div>
          <div className="relative hidden md:block">
            <img src={featIssue} alt="Digital cheque issued from a smartphone" width={1024} height={768} className="rounded-2xl border border-brand-foreground/15 shadow-elevated" />
            <div className="absolute -bottom-6 -left-6 rounded-xl border border-info/50 bg-gradient-to-br from-brand to-brand/70 px-4 py-3 backdrop-blur">
              <div className="text-xs opacity-70">Value registered (demo)</div>
              <div className="text-gradient-gold-bright text-xl font-semibold tabular-nums">{aed(m.totalValue, true)}</div>
            </div>
          </div>
        </div>
        <div className="relative">
          <div className="gradient-rule" />
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-6 md:grid-cols-4">
            {kpis.slice(0, 4).map(([l, v]) => (
              <div key={l}><div className="text-gradient-gold-bright text-2xl font-semibold tabular-nums">{v}</div><div className="text-xs opacity-70">{l}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-section-gradient py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Platform features</div>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">The full digital cheque lifecycle, in one network</h2>
            <div className="gradient-rule mt-5 w-28" />
            <p className="mt-4 text-muted-foreground">From issuance on a phone to settlement between banks and national supervision — each capability below is live in this prototype.</p>
          </div>
          <div className="mt-12 space-y-16">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`grid items-center gap-10 md:grid-cols-2 ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}>
                <div className="gradient-ring overflow-hidden rounded-2xl shadow-elevated">
                  <img src={f.img} alt={f.title} width={1024} height={768} loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-700 hover:scale-105" />
                </div>
                <div>
                  <div className="text-gradient-gold text-xs font-semibold uppercase tracking-[0.2em]">{f.tag}</div>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight">{f.title}</h3>
                  <p className="mt-3 text-muted-foreground">{f.summary}</p>
                  <ul className="mt-5 space-y-2">
                    {f.points.map((p) => <li key={p} className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-teal" />{p}</li>)}
                  </ul>
                  <Link to={f.to} className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary transition-all hover:gap-2">Explore <ArrowRight className="h-4 w-4" /></Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Regulator metrics */}
      <section id="metrics" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-20">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Supervisory metrics</div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Regulator-grade indicators, live</h2>
          <div className="gradient-rule mt-5 w-28" />
          <p className="mt-4 text-muted-foreground">Indicators modelled on common payment-system oversight practice: volume and value, settlement and return ratios, concentration and outstanding commitments. Figures are computed from synthetic demo data.</p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {kpis.map(([l, v, d]) => (
            <div key={l} className="premium-card relative overflow-hidden rounded-2xl p-5">
              <div className="gradient-rule absolute inset-x-0 top-0" />
              <div className="text-xs text-muted-foreground">{l}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-primary">{v}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{d}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Monthly volume and value" note="Instruments issued (bars) and AED millions (line)">
            <ResponsiveContainer><ComposedChart data={m.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="m" tick={axis} /><YAxis yAxisId="l" tick={axis} /><YAxis yAxisId="r" orientation="right" tick={axis} />
              <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="volume" name="Volume" fill="url(#g-volume)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="r" dataKey="value" name="Value (AED m)" stroke="url(#g-value)" strokeWidth={2.5} dot={false} />
            </ComposedChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Return ratio trend" note="% of instruments returned per month — key credit-risk signal">
            <ResponsiveContainer><AreaChart data={m.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="m" tick={axis} /><YAxis tick={axis} unit="%" /><Tooltip {...tip} />
              <Area dataKey="rate" name="Return ratio %" stroke="var(--chart-5)" fill="url(#g-rate)" strokeWidth={2} />
            </AreaChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Bank performance league" note="Settlement rate vs return ratio by issuing bank (%)">
            <ResponsiveContainer><BarChart data={m.banks}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="bank" tick={axis} /><YAxis tick={axis} unit="%" /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="stp" name="Settled %" fill="url(#g-stp)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="returnRate" name="Returned %" fill="url(#g-return)" radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Market share by value" note="Share of registered value by issuing bank (AED m) — concentration risk">
            <ResponsiveContainer><PieChart>
              <Pie data={m.banks} dataKey="value" nameKey="bank" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {m.banks.map((b, i) => <Cell key={b.bank} fill={C[i % C.length]} />)}
              </Pie><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Outstanding commitments by maturity" note="Post-dated instruments not yet payable (AED m) — liquidity outlook">
            <ResponsiveContainer><BarChart data={m.maturity}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="bucket" tick={axis} /><YAxis tick={axis} /><Tooltip {...tip} />
              <Bar dataKey="value" name="Value (AED m)" fill="url(#g-maturity)" radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Lifecycle status distribution" note="Instruments by current status across the network">
            <ResponsiveContainer><BarChart data={m.status} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis type="number" tick={axis} /><YAxis type="category" dataKey="name" tick={axis} width={80} /><Tooltip {...tip} />
              <Bar dataKey="value" name="Instruments" fill="url(#g-status)" radius={[0, 4, 4, 0]} />
            </BarChart></ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      {/* Portals */}
      <section className="bg-section-gradient py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold tracking-tight">Four connected portals</h2>
          <div className="gradient-rule mt-4 w-24" />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {APPS.map((a) => (
              <Link key={a.to} to={a.to} className="premium-card gradient-lift group relative overflow-hidden rounded-2xl p-6 hover:-translate-y-0.5">
                <div className="gradient-rule absolute inset-x-0 top-0" />
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand shadow-sm">
                  <a.icon className="h-6 w-6 text-primary-foreground" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{a.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{a.desc}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary transition-all group-hover:gap-2">Open <ArrowRight className="h-4 w-4" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="gradient-panel premium-edge rounded-2xl p-6 text-sm text-muted-foreground">
          <strong className="text-foreground">Important:</strong> This is a proposed future-state ecosystem — not an existing CBUAE-approved digital cheque scheme or an approved EDC mandate. Colours reference the CBUAE public website for presentation only. EDC does not create payment obligations, hold customer funds or authorise settlement; banks keep their regulated responsibilities and CBUAE retains regulatory and settlement-system authority. All figures are synthetic.
        </div>
      </section>
    </div>
  );
}
