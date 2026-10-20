import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Circle, ShieldCheck, ShieldAlert, XCircle, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MILESTONES, STATUS_LABEL, bankById, presentedHash } from "@/lib/engine/engine";
import { aed, amountInWords, fmtDate, fmtDateTime } from "@/lib/engine/format";
import type { BankId, Cheque, Status, VerifyResult } from "@/lib/engine/types";

const TONE: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info/15 text-info",
  brand: "bg-secondary text-secondary-foreground",
  orange: "bg-orange/15 text-accent-foreground",
  success: "bg-success/15 text-success",
  danger: "bg-destructive/15 text-destructive",
  warning: "bg-warning/20 text-accent-foreground",
};

export function statusTone(s: Status): keyof typeof TONE {
  if (s === "credited" || s === "settled") return "success";
  if (s === "returned" || s === "rejected" || s === "stopped") return "danger";
  if (s === "presented" || s === "paid") return "orange";
  if (s === "deposited" || s === "accepted") return "info";
  if (s === "requested") return "warning";
  return "brand";
}

export function Pill({ tone = "neutral", children, className }: { tone?: keyof typeof TONE; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[tone], className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <Pill tone={statusTone(status)}>{STATUS_LABEL[status]}</Pill>;
}

export function BankChip({ id, full }: { id: BankId; full?: boolean }) {
  const b = bankById(id);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className="grid h-5 w-5 place-items-center rounded-md text-[8px] font-bold text-brand-foreground"
        style={{ background: `oklch(0.5 0.14 ${b.hue})` }}
      >
        {b.short.slice(0, 2)}
      </span>
      {full ? b.name : b.short}
    </span>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-sm", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, icon, accent }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4", accent && "border-orange/40")}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {label}
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, desc, right }: { eyebrow: string; title: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</div>
        <h1 className="mt-1 text-3xl font-bold tracking-[-0.03em] md:text-4xl">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12px]", className)}>{children}</span>;
}

/** Rendered digital cheque instrument */
export function ChequeVisual({ c, compact }: { c: Cheque; compact?: boolean }) {
  const b = bankById(c.issuingBank);
  const tampered = c.hash && presentedHash(c) !== c.hash;
  const amount = c.tamperedAmount ?? c.amount;
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-cheque shadow-elevated">
      <div className="guilloche absolute inset-0 opacity-80" />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold text-brand-foreground" style={{ background: `oklch(0.45 0.14 ${b.hue})` }}>
              {b.short.slice(0, 3)}
            </span>
            <div>
              <div className="text-sm font-semibold">{b.name} <span className="text-muted-foreground">(demo)</span></div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Native Digital Cheque · EDC Trust Network</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground">Date</div>
            <div className="text-sm font-medium">{fmtDate(c.payableDate)}</div>
          </div>
        </div>
        <div className="mt-4 grid gap-1 text-sm">
          <div className="flex gap-2"><span className="w-16 text-muted-foreground">Pay</span><span className="font-semibold">{c.beneficiary}</span></div>
          {!compact && <div className="flex gap-2"><span className="w-16 text-muted-foreground">Words</span><span className="italic">{amountInWords(amount)}</span></div>}
        </div>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="space-y-1 text-xs">
            <div><span className="text-muted-foreground">NDCI </span><Mono className="font-semibold">{c.ndci}</Mono></div>
            <div><span className="text-muted-foreground">Cheque No </span><Mono>{c.chequeNo}</Mono> · <span className="text-muted-foreground">A/C </span><Mono>{c.drawerAcct.slice(0, 9)}••••</Mono></div>
            <div><span className="text-muted-foreground">Drawer </span>{c.drawer}</div>
            {c.hash ? (
              tampered ? (
                <Pill tone="danger"><ShieldAlert className="h-3 w-3" /> Signature invalid — altered copy</Pill>
              ) : (
                <Pill tone="success"><ShieldCheck className="h-3 w-3" /> Digitally signed · {c.certId}</Pill>
              )
            ) : (
              <Pill tone="warning">Awaiting EDC issuance</Pill>
            )}
          </div>
          <div className="flex items-end gap-3">
            <div className="rounded-xl border-2 border-primary/80 bg-card px-3 py-2 text-right">
              <div className="text-[10px] text-muted-foreground">AED</div>
              <div className="text-lg font-bold tabular-nums">{amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</div>
            </div>
            {c.qrToken && !compact && (
              <div className="rounded-lg bg-card p-1.5">
                <QRCodeSVG value={c.qrToken} size={64} />
              </div>
            )}
          </div>
        </div>
        {!compact && c.qrToken && <div className="mt-3 truncate text-[10px] text-muted-foreground">verify.edc-dctn.ae/{c.ndci} · {c.hash?.slice(0, 24)}…</div>}
      </div>
    </div>
  );
}

/** Parcel-tracking style timeline */
export function Timeline({ c }: { c: Cheque }) {
  const reached = new Map(c.events.filter((e) => e.status !== "note").map((e) => [e.status, e]));
  const terminal = ["returned", "rejected", "stopped"].includes(c.status) ? c.events[c.events.length - 1] : null;
  const notes = c.events.filter((e) => e.status === "note");
  const lastIdx = Math.max(...MILESTONES.map((m, i) => (reached.has(m) ? i : -1)));
  return (
    <ol className="relative space-y-0">
      {MILESTONES.map((m, i) => {
        const e = reached.get(m);
        const cut = terminal && i > lastIdx;
        if (cut && i > lastIdx + 1) return null;
        const isTerm = cut;
        return (
          <li key={m} className="relative flex gap-3 pb-4 last:pb-0">
            {i < MILESTONES.length - 1 && <span className={cn("absolute left-[9px] top-5 h-full w-px", e ? "bg-success" : "bg-border")} />}
            {isTerm ? (
              <XCircle className="relative z-10 h-5 w-5 shrink-0 text-destructive" />
            ) : e ? (
              <CheckCircle2 className={cn("relative z-10 h-5 w-5 shrink-0", i === lastIdx ? "text-orange" : "text-success")} />
            ) : (
              <Circle className="relative z-10 h-5 w-5 shrink-0 text-border" />
            )}
            <div className="-mt-0.5 min-w-0">
              <div className={cn("text-sm", e || isTerm ? "font-medium" : "text-muted-foreground")}>{isTerm ? terminal!.label : STATUS_LABEL[m]}</div>
              {(e || isTerm) && (
                <div className="text-xs text-muted-foreground">
                  {fmtDateTime((isTerm ? terminal! : e!).at)} {(isTerm ? terminal! : e!).detail && `· ${(isTerm ? terminal! : e!).detail}`}
                </div>
              )}
            </div>
          </li>
        );
      })}
      {notes.map((n, k) => (
        <li key={k} className="mt-2 flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-accent-foreground" /> {n.label} · {fmtDateTime(n.at)} {n.detail && `— ${n.detail}`}
        </li>
      ))}
    </ol>
  );
}

export const VERIFY_COPY: Record<VerifyResult, { title: string; tone: keyof typeof TONE; desc: string }> = {
  genuine: { title: "Authentic instrument", tone: "success", desc: "Signature, hash and registry record match." },
  tampered: { title: "Tampered — do not accept", tone: "danger", desc: "The presented content does not match the signed hash in the EDC registry." },
  revoked: { title: "Revoked / stopped", tone: "danger", desc: "The issuing bank has stopped or cancelled this instrument." },
  presented: { title: "Already presented", tone: "warning", desc: "This instrument is already in clearing. A second presentment will be blocked." },
  settled: { title: "Already settled", tone: "info", desc: "Funds for this instrument have already been settled." },
  returned: { title: "Instrument returned", tone: "danger", desc: "The issuing bank returned this cheque." },
  not_found: { title: "Not found", tone: "danger", desc: "No instrument with this identifier exists in the national registry." },
};

export function VerifyResultCard({ result, cheque }: { result: VerifyResult; cheque?: Cheque }) {
  const v = VERIFY_COPY[result];
  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <div className="flex items-center gap-2">
        <Pill tone={v.tone} className="text-xs">{v.title}</Pill>
        {cheque && <Mono>{cheque.ndci}</Mono>}
      </div>
      <p className="text-sm text-muted-foreground">{v.desc}</p>
      {cheque && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Issuing bank: </span>{bankById(cheque.issuingBank).name}</div>
          <div><span className="text-muted-foreground">Amount: </span>{aed(cheque.amount)}</div>
          <div><span className="text-muted-foreground">Payable: </span>{fmtDate(cheque.payableDate)}</div>
          <div><span className="text-muted-foreground">Status: </span>{STATUS_LABEL[cheque.status]}</div>
        </div>
      )}
      <div className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground">
        Authenticity verified does not guarantee payment or available funds.
      </div>
    </div>
  );
}

export function DataNote() {
  return <span className="text-[11px] text-muted-foreground">Demonstration data</span>;
}
