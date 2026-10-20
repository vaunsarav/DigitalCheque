import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Bell, Bookmark, Bot, CalendarClock, ChevronRight, FileText, Fingerprint, Home, Inbox, PenLine, ScanLine, Send, Shield, Wallet } from "lucide-react";
import { toast } from "sonner";
import * as X from "@/lib/engine/ext";
import { AiPanel, CopyActions, CustomerRequests, DepositStages, EntitlementCard, IssuanceCheck, MandatesPanel, RaiseRequest, SecurityRegister, Watermark } from "@/components/dc/ext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCheques, useStore } from "@/lib/store";
import * as E from "@/lib/engine/engine";
import { bankById } from "@/lib/engine/engine";
import { PERSONAS, personaById } from "@/lib/engine/seed";
import { aed, amountInWords, dubaiDay, fmtDate, fmtDateTime } from "@/lib/engine/format";
import type { Cheque, PurposeCategory, VerifyResult } from "@/lib/engine/types";
import { ChequeVisual, Mono, Pill, StatusBadge, Timeline, VerifyResultCard } from "@/components/dc/ui";
import { useT } from "@/lib/i18n";
import { LiabilityLetters } from '@/components/dc/letters';

export const Route = createFileRoute("/mobile")({
  head: () => ({
    meta: [
      { title: "Customer Mobile App — Issue & Deposit Digital Cheques" },
      { name: "description", content: "Mobile banking simulator: issue, receive, verify, deposit and track native digital cheques." },
      { property: "og:title", content: "Digital Cheque Customer App" },
      { property: "og:description", content: "Mobile journey for issuing and depositing digital cheques (prototype)." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Mobile,
});

type Screen = { k: "home" } | { k: "letters" } | { k: "issue" } | { k: "received" } | { k: "vault" } | { k: "requests" } | { k: "security" } | { k: "ai" } | { k: "auto" } | { k: "cheque"; ndci: string } | { k: "deposit"; ndci: string };

function Mobile() {
  const persona = useStore((s) => s.persona);
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[1fr_400px] md:px-6">
      <div className="space-y-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange">Customer mobile banking</div>
        <h1 className="text-3xl font-semibold tracking-tight">Issue, receive and deposit a digital cheque from your phone.</h1>
        <p className="text-sm text-muted-foreground">Switch persona to play the drawer or the beneficiary. Open the bank portal in another window to authorise requests and watch the status update here instantly.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PERSONAS.map((p) => (
            <button key={p.id} onClick={() => setUi({ persona: p.id })} className={`rounded-xl border p-3 text-left text-sm transition ${persona === p.id ? "border-orange bg-accent" : "hover:border-orange/50"}`}>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">{bankById(p.bank).name} (demo) · {p.kind}</div>
            </button>
          ))}
        </div>
      </div>
      <Phone key={persona} />
    </div>
  );
}

function Phone() {
  const t = useT();
  const pid = useStore((s) => s.persona);
  const p = personaById(pid)!;
  const balance = useStore((s) => s.balances[pid] ?? 0);
  const all = useCheques();
  const [screen, setScreen] = useState<Screen>({ k: "home" });
  const issued = all.filter((c) => c.drawerId === pid);
  const received = all.filter((c) => c.beneficiaryId === pid && c.hash);
  const notifications = useMemo(
    () => [...issued, ...received].flatMap((c) => c.events.map((e) => ({ ...e, c }))).sort((a, b) => b.at - a.at).slice(0, 5),
    [issued, received],
  );
  const b = bankById(p.bank);
  const allNotices = useStore((s) => s.ext.notices);
  const notices = useMemo(() => allNotices.filter((n) => n.to === pid).slice(0, 4), [allNotices, pid]);
  const reqCount = useStore((s) => s.ext.requests.filter((r) => ["awaiting_counterparty", "queried"].includes(r.status) && r.initiatorId !== pid && (s.cheques[r.ndci]?.drawerId === pid || s.cheques[r.ndci]?.beneficiaryId === pid)).length);

  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div className="rounded-[2.75rem] border-[10px] border-brand bg-brand p-0 shadow-elevated">
        <div className="relative h-[760px] overflow-hidden rounded-[2rem] bg-background">
          <div className="absolute left-1/2 top-2 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-brand" />
          <div className="h-full overflow-y-auto pb-20">
            {screen.k === "home" && (
              <div>
                <div className="bg-hero px-5 pb-6 pt-12 text-brand-foreground">
                  <div className="flex items-center justify-between text-xs opacity-80"><span>{b.name} (demo)</span><Bell className="h-4 w-4" /></div>
                  <div className="mt-3 text-sm opacity-80">Welcome, {p.name.split(" ")[0]}</div>
                  <div className="mt-4 text-xs opacity-70">Available balance</div>
                  <div className="text-3xl font-semibold tabular-nums">{aed(balance)}</div>
                  <div className="mt-1 font-mono text-[10px] opacity-60">{p.acct}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 p-4">
                  {[
                    { l: t("Issue Digital Cheque"), i: PenLine, s: { k: "issue" } as Screen },
                    { l: t("Received"), i: Inbox, s: { k: "received" } as Screen, n: received.filter((c) => ["delivered", "verified"].includes(c.status)).length },
                    { l: t("Vault"), i: Wallet, s: { k: "vault" } as Screen },
                    { l: "Service Requests", i: FileText, s: { k: "requests" } as Screen, n: reqCount },
                    { l: "Security Cheques", i: Shield, s: { k: "security" } as Screen },
                    { l: "AI Assistant", i: Bot, s: { k: "ai" } as Screen },
                    { l: "Auto-deposit", i: CalendarClock, s: { k: "auto" } as Screen },
                    { l: t('Liability Letters'), i: FileText, s: { k: 'letters' } as Screen },
                  ].map((a) => (
                    <button key={a.l} onClick={() => setScreen(a.s)} className="relative flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center text-[11px] font-medium">
                      <a.i className="h-5 w-5 text-orange" />{a.l}
                      {!!a.n && <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-orange text-[9px] text-orange-foreground">{a.n}</span>}
                    </button>
                  ))}
                </div>
                <div className="px-4 pb-3"><EntitlementCard customerId={pid} compact /></div>
                <div className="px-4">
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">Notifications</div>
                  <div className="space-y-2">
                    {notices.map((n) => (
                      <button key={n.id} onClick={() => n.ndci && setScreen({ k: "cheque", ndci: n.ndci })} className="flex w-full items-center gap-3 rounded-xl border border-orange/40 bg-card p-3 text-left">
                        <Bell className="h-3.5 w-3.5 shrink-0 text-orange" /><span className="min-w-0 flex-1 text-xs">{n.text}</span><span className="text-[10px] text-muted-foreground">{fmtDateTime(n.at).slice(-5)}</span>
                      </button>
                    ))}
                    {notifications.length === 0 && <p className="text-xs text-muted-foreground">No activity yet.</p>}
                    {notifications.map((n, i) => (
                      <button key={i} onClick={() => setScreen({ k: "cheque", ndci: n.c.ndci })} className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary"><Send className="h-3.5 w-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{n.label}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{aed(n.c.amount)} · {n.c.drawerId === pid ? `to ${n.c.beneficiary}` : `from ${n.c.drawer}`}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground">{fmtDateTime(n.at).slice(-5)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {screen.k === "issue" && <IssueWizard onDone={(ndci) => setScreen(ndci ? { k: "cheque", ndci } : { k: "home" })} />}
            {screen.k === 'letters' && <div><Top title={t('Liability Letters')} onBack={() => setScreen({ k: 'home' })} /><div className="p-4"><LiabilityLetters mode="customer" customerId={pid} /></div></div>}
            {screen.k === "received" && (
              <ListScreen title="Received cheques" list={received} onBack={() => setScreen({ k: "home" })} onOpen={(n) => setScreen({ k: "cheque", ndci: n })} empty="No cheques received yet." />
            )}
            {screen.k === "vault" && (
              <ListScreen title="Cheque vault" list={[...issued, ...received.filter((c) => c.saved)]} onBack={() => setScreen({ k: "home" })} onOpen={(n) => setScreen({ k: "cheque", ndci: n })} empty="Your vault is empty." showPdc />
            )}
            {screen.k === "cheque" && <ChequeScreen key={screen.ndci} ndci={screen.ndci} onBack={() => setScreen({ k: "home" })} onDeposit={() => setScreen({ k: "deposit", ndci: screen.ndci })} onOpen={(n) => setScreen({ k: "cheque", ndci: n })} />}
            {screen.k === "requests" && <div><Top title="Cheque Service Requests" onBack={() => setScreen({ k: "home" })} /><div className="p-4"><CustomerRequests customerId={pid} /></div></div>}
            {screen.k === "security" && <div><Top title="Security Cheques" onBack={() => setScreen({ k: "home" })} /><div className="p-4"><SecurityRegister customerId={pid} /></div></div>}
            {screen.k === "ai" && <div><Top title="AI Cheque Assistant" onBack={() => setScreen({ k: "home" })} /><div className="p-4"><AiPanel scope="customer" customerId={pid} /></div></div>}
            {screen.k === "auto" && <div><Top title="Auto-deposit" onBack={() => setScreen({ k: "home" })} /><div className="space-y-3 p-4"><p className="text-xs text-muted-foreground">Standing preference for eligible incoming payment cheques. Security cheques are never included.</p><MandatesPanel customerId={pid} /></div></div>}
            {screen.k === "deposit" && <DepositWizard ndci={screen.ndci} onDone={() => setScreen({ k: "cheque", ndci: screen.ndci })} />}
          </div>
          <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t bg-card/95 px-2 py-3 backdrop-blur">
            {[
              { i: Home, s: { k: "home" } as Screen, l: t("Home") },
              { i: PenLine, s: { k: "issue" } as Screen, l: "Issue" },
              { i: Inbox, s: { k: "received" } as Screen, l: t("Received") },
              { i: Wallet, s: { k: "vault" } as Screen, l: t("Vault") },
            ].map((n) => (
              <button key={n.l} onClick={() => setScreen(n.s)} className={`flex flex-col items-center gap-0.5 text-[10px] ${screen.k === n.s.k ? "text-orange" : "text-muted-foreground"}`}>
                <n.i className="h-5 w-5" />{n.l}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

function Top({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 pb-3 pt-11 backdrop-blur">
      <button onClick={onBack} aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
      <span className="font-semibold">{title}</span>
    </div>
  );
}

function ListScreen({ title, list, onBack, onOpen, empty, showPdc }: { title: string; list: Cheque[]; onBack: () => void; onOpen: (n: string) => void; empty: string; showPdc?: boolean }) {
  const now = useStore((s) => s.now);
  const pdc = list.filter((c) => c.payableDate > now && !["stopped", "rejected"].includes(c.status));
  return (
    <div>
      <Top title={title} onBack={onBack} />
      <div className="space-y-2 p-4">
        {showPdc && pdc.length > 0 && (
          <div className="rounded-2xl bg-accent p-3 text-xs text-accent-foreground">
            <div className="flex items-center gap-1.5 font-semibold"><CalendarClock className="h-4 w-4" /> Post-dated cheques</div>
            {pdc.map((c) => <div key={c.ndci} className="mt-1 flex justify-between"><span>{fmtDate(c.payableDate)}</span><span>{aed(c.amount)}</span></div>)}
          </div>
        )}
        {list.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>}
        {list.map((c) => (
          <button key={c.ndci} onClick={() => onOpen(c.ndci)} className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.drawerId === useStore.getState().persona ? c.beneficiary : c.drawer}</div>
              <div className="text-[11px] text-muted-foreground">{bankById(c.issuingBank).short} · {fmtDate(c.payableDate)}</div>
              <div className="mt-1"><StatusBadge status={c.status} /></div>
            </div>
            <div className="text-right text-sm font-semibold tabular-nums">{aed(c.amount)}</div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function IssueWizard({ onDone }: { onDone: (ndci: string | null) => void }) {
  const pid = useStore((s) => s.persona);
  const now = useStore((s) => s.now);
  const store = useStore();
  const p = personaById(pid)!;
  const others = PERSONAS.filter((x) => x.id !== pid);
  const [step, setStep] = useState(1);
  const [benId, setBenId] = useState(others[0].id);
  const ben = personaById(benId)!;
  const [amount, setAmount] = useState(25000);
  const [date, setDate] = useState(new Date(now + 4 * 3600_000).toISOString().slice(0, 10));
  const [cat, setCat] = useState<PurposeCategory>("rent");
  const [purpose, setPurpose] = useState("Monthly rent");
  const [classification, setCls] = useState<"payment" | "security">("payment");
  const [contractRef, setContractRef] = useState("");
  const [remarks, setRemarks] = useState("");
  const [declared, setDeclared] = useState(false);
  const [auth, setAuth] = useState<"face_id" | "otp" | null>(null);
  const [otp, setOtp] = useState("");
  const [signMethod, setSignMethod] = useState<"uae_pass" | "provider">("uae_pass");
  const [failSign, setFailSign] = useState(false);
  const [session, setSession] = useState<{ id: string; hash: string } | null>(null);
  const [requestKey] = useState(() => `KEY-${pid}-${Date.now()}`);
  const payable = dubaiDay(Date.parse(`${date}T08:00:00+04:00`));
  const ent = E.entitlementSummary(store, pid);
  const input: E.NewChequeInput = {
    issuingBank: p.bank, payeeBank: ben.bank, drawer: p.name, drawerId: p.id, drawerAcct: p.acct, beneficiary: ben.name, beneficiaryId: ben.id, beneficiaryAcct: ben.acct,
    amount, payableDate: payable, purpose, remarks, purposeCategory: cat, classification, requestKey,
  };
  const hash = E.termsHash(input);
  const stale = session && session.hash !== hash;
  const draft: Cheque = {
    ndci: "AE-DC-2026-PENDING", requestId: "", chequeNo: "——", issuingBank: p.bank, payeeBank: ben.bank, drawer: p.name, drawerId: p.id, drawerAcct: p.acct,
    beneficiary: ben.name, beneficiaryId: ben.id, beneficiaryAcct: ben.acct, amount, currency: "AED", issueDate: now, payableDate: payable, purpose,
    status: "requested", version: 1, createdAt: now, updatedAt: now, presentCount: 0, events: [],
  };
  const sign = () => {
    const r = store.run((s) => X.signTerms(s, { ...input, signatory: p.name }, { authMethod: auth ?? "otp", signMethod, fail: failSign }));
    if (r.ok) {
      const ok = (r as unknown as { ok: true; sessionId: string; ok2?: boolean }).sessionId;
      const sess = useStore.getState().ext.signing[ok];
      if (sess?.result === "signed") { setSession({ id: ok, hash }); setStep(5); }
      else toast.error("Signing failed (simulated) — nothing was submitted. Try again.");
    }
  };
  const submit = () => {
    const obligation = classification === "security" || contractRef ? { ref: contractRef || `REF-${Date.now() % 100000}`, kind: classification === "security" ? "Security obligation" : "Agreement", counterparty: ben.name, startDate: now, securityAmount: classification === "security" ? amount : undefined, closureParty: ben.name } : undefined;
    const r = store.run((s) => X.createRequestExt(s, { ...input, signingSessionId: session?.id, obligation }), "Signed request submitted — entitlement reserved");
    if (r.ok) onDone((r as unknown as { ndci: string }).ndci);
  };
  const blocked = !ent || ent.available <= 0 || ent.pendingVerification;
  return (
    <div>
      <Top title={`Issue digital cheque · ${step}/5`} onBack={() => (step > 1 ? setStep(step - 1) : onDone(null))} />
      <div className="space-y-4 p-4">
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-orange" : "bg-muted"}`} />)}</div>
        {step === 1 && (
          <>
            <Label>Debit account</Label>
            <div className="rounded-2xl border-2 border-orange bg-card p-4 text-sm">
              <div className="font-medium">Current Account · {bankById(p.bank).short}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{p.acct}</div>
              <div className="mt-2 font-semibold">{aed(useStore.getState().balances[pid] ?? 0)} <span className="text-[10px] font-normal text-muted-foreground">account balance</span></div>
            </div>
            <EntitlementCard customerId={pid} />
            <Button className="w-full" disabled={blocked} onClick={() => setStep(2)}>{blocked ? "Issuance blocked — no entitlement" : "Continue"}</Button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="space-y-1.5"><Label>Beneficiary</Label>
              <select value={benId} onChange={(e) => setBenId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {others.map((o) => <option key={o.id} value={o.id}>{o.name} — {bankById(o.bank).short}</option>)}
              </select>
              <div className="text-[11px] text-muted-foreground">Bank: {bankById(ben.bank).name} · <span className="font-mono">{ben.acct}</span></div>
            </div>
            <div className="space-y-1.5"><Label>Amount (AED)</Label><Input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Cheque date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />{payable > now && <Pill tone="orange">Post-dated</Pill>}</div>
            <div className="space-y-1.5"><Label>Purpose category (required)</Label>
              <select value={cat} onChange={(e) => { const v = e.target.value as PurposeCategory; setCat(v); if (v === "security") setCls("security"); }} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {Object.entries(X.PURPOSE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="space-y-1.5"><Label>Purpose description</Label><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Classification</Label>
              <div className="grid grid-cols-2 gap-2">{(["payment", "security"] as const).map((k) => <button key={k} onClick={() => setCls(k)} className={`rounded-lg border p-2 text-xs capitalize ${classification === k ? "border-orange bg-accent" : ""}`}>{k} cheque</button>)}</div></div>
            <div className="space-y-1.5"><Label>Agreement / contract reference{classification === "security" ? " (linked obligation)" : " (optional)"}</Label><Input value={contractRef} onChange={(e) => setContractRef(e.target.value)} placeholder="e.g. LEASE-2026-001" /></div>
            <div className="space-y-1.5"><Label>{cat === "other" ? "Explain the purpose (required)" : "Remarks (optional)"}</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
            <IssuanceCheck draft={input} />
            <Button className="w-full" disabled={!(amount > 0) || !purpose.trim() || (cat === "other" && !remarks.trim())} onClick={() => setStep(3)}>Review and sign</Button>
          </>
        )}
        {step === 3 && (
          <>
            <div className="text-sm font-semibold">Review and Sign</div>
            <div className="relative"><ChequeVisual c={draft} compact /><Watermark /></div>
            <dl className="space-y-1 text-xs">
              {[
                ["Issuing account", `${bankById(p.bank).short} · ${p.acct.slice(0, 12)}…`], ["Beneficiary", `${ben.name} · ${bankById(ben.bank).short}`], ["Amount", aed(amount)], ["In words", amountInWords(amount)],
                ["Issue date", fmtDate(now)], ["Payable date", fmtDate(payable)], ["Purpose", `${X.PURPOSE_LABEL[cat]} — ${purpose}`], ["Linked obligation", contractRef || "—"],
                ["Entitlement ref", ent?.id ?? "—"], ["Classification", classification], ["Auto-deposit", classification === "security" ? "Not eligible (security)" : "Eligible — beneficiary’s choice"], ["Document hash", `${hash.slice(0, 18)}…`],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>)}
            </dl>
            <label className="flex gap-2 text-[11px]"><input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} /> I confirm these terms are correct and instruct {bankById(p.bank).name} to authorise and EDC to register this instrument. I understand this is a demonstration and no legally effective signature is created.</label>
            <Button className="w-full" disabled={!declared} onClick={() => setStep(4)}>Proceed to authentication</Button>
          </>
        )}
        {step === 4 && (
          <>
            <div className="text-center"><Shield className="mx-auto h-8 w-8 text-orange" /><div className="mt-1 font-semibold">Authenticate, then sign</div></div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={auth === "face_id" ? "default" : "outline"} onClick={() => setAuth("face_id")}><Fingerprint className="h-4 w-4" /> Face ID</Button>
              <Button variant={auth === "otp" ? "default" : "outline"} onClick={() => setAuth("otp")}>OTP</Button>
            </div>
            {auth === "otp" && <Input value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} placeholder="Demo OTP 123456" className="text-center font-mono" />}
            <p className="text-[11px] text-muted-foreground">Device authentication confirms it’s you — it does not by itself create a document signature.</p>
            <Label>Signing journey (simulated)</Label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSignMethod("uae_pass")} className={`rounded-lg border p-2 text-xs ${signMethod === "uae_pass" ? "border-orange bg-accent" : ""}`}>UAE PASS journey<br /><span className="text-muted-foreground">simulated, not integrated</span></button>
              <button onClick={() => setSignMethod("provider")} className={`rounded-lg border p-2 text-xs ${signMethod === "provider" ? "border-orange bg-accent" : ""}`}>Configured signing provider<br /><span className="text-muted-foreground">approval not verified</span></button>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground"><input type="checkbox" checked={failSign} onChange={(e) => setFailSign(e.target.checked)} /> Simulate signing failure</label>
            <Button className="w-full" disabled={!auth || (auth === "otp" && otp !== "123456")} onClick={sign}>Sign exact reviewed version</Button>
          </>
        )}
        {step === 5 && session && (
          <>
            <div className="rounded-xl border p-3 text-xs">
              <div className="mb-1 font-semibold text-success">Signed (simulated)</div>
              {(() => { const ss = store.ext.signing[session.id]; return ss && (<dl className="space-y-0.5">{[["Signatory", ss.signatory], ["Authority", ss.authorityRef], ["Authentication", ss.authMethod], ["Provider ref", ss.providerRef], ["Version / hash", `v${ss.docVersion} · ${ss.hash.slice(0, 14)}…`], ["Consent time", fmtDateTime(ss.consentAt)]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl>); })()}
            </div>
            {stale && <div className="rounded-lg bg-destructive/15 p-2 text-xs text-destructive">Terms changed after review — authorization invalidated. Go back and sign again.</div>}
            {p.kind === "corporate" && <p className="text-[11px] text-muted-foreground">Corporate account: an independent checker must approve before bank authorization (maker-checker).</p>}
            <Button className="w-full" disabled={!!stale} onClick={submit}>Submit signed request</Button>
          </>
        )}
      </div>
    </div>
  );
}

function ChequeScreen({ ndci, onBack, onDeposit, onOpen }: { ndci: string; onBack: () => void; onDeposit: () => void; onOpen: (n: string) => void }) {
  const c = useStore((s) => s.cheques[ndci]);
  const pid = useStore((s) => s.persona);
  const now = useStore((s) => s.now);
  const obl = useStore((s) => (c?.obligationId ? s.ext.obligations[c.obligationId] : undefined));
  const { verify, act } = useStore();
  const [vr, setVr] = useState<{ result: VerifyResult; cheque?: Cheque } | null>(null);
  const [checker, setChecker] = useState("");
  if (!c) return null;
  const mineAsBen = c.beneficiaryId === pid;
  const canDeposit = mineAsBen && ["delivered", "verified"].includes(c.status);
  const pdc = c.payableDate > now;
  return (
    <div>
      <Top title={mineAsBen ? "Received cheque" : "Issued cheque"} onBack={onBack} />
      <div className="space-y-4 p-4">
        <div className="relative"><ChequeVisual c={c} compact /><Watermark /></div>
        <div className="flex items-center justify-between"><Mono className="text-[10px]">{c.ndci}</Mono><StatusBadge status={c.status} /></div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Pill tone={c.classification === "security" ? "warning" : "info"}>{c.classification ?? "payment"} cheque</Pill>
          {c.purposeCategory && <Pill>{X.PURPOSE_LABEL[c.purposeCategory]}</Pill>}
          {obl && <Pill>Obligation {obl.ref}: {obl.status.replace("_", " ")}</Pill>}
        </div>
        {c.replaces && <button className="text-xs underline" onClick={() => onOpen(c.replaces!)}>Replaces {c.replaces}</button>}
        {c.supersededBy && <button className="block text-xs text-destructive underline" onClick={() => onOpen(c.supersededBy!)}>Superseded by {c.supersededBy} — this original is not payable</button>}
        {c.makerChecker?.pending && !mineAsBen && (
          <div className="space-y-1.5 rounded-xl border p-3 text-xs">
            <div className="font-semibold">Corporate checker approval required</div>
            <div className="text-muted-foreground">Maker: {c.makerChecker.maker}</div>
            <Input className="h-8" placeholder="Checker name (must differ)" value={checker} onChange={(e) => setChecker(e.target.value)} />
            <Button size="sm" className="w-full" disabled={!checker} onClick={() => act((s) => E.checkerApprove(s, c.ndci, checker), "Checker approved")}>Approve as checker</Button>
          </div>
        )}
        {mineAsBen && c.hash && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => setVr(verify(c.qrToken ?? c.ndci, "beneficiary"))}><ScanLine className="h-4 w-4" /> Verify</Button>
            <Button variant="outline" size="sm" onClick={() => act((s) => E.toggleSaved(s, c.ndci), c.saved ? "Removed from wallet" : "Saved to secure wallet")}><Bookmark className="h-4 w-4" /> {c.saved ? "Saved" : "Save"}</Button>
            {canDeposit && <Button size="sm" className="col-span-2" onClick={onDeposit}>{pdc ? `e-Deposit (payable ${fmtDate(c.payableDate)})` : "e-Deposit cheque"}</Button>}
          </div>
        )}
        {vr && <VerifyResultCard {...vr} />}
        {c.depositRef && <DepositStages c={c} />}
        <CopyActions c={c} customerId={pid} />
        {mineAsBen && canDeposit && <MandatesPanel customerId={pid} ndci={c.ndci} />}
        <RaiseRequest c={c} customerId={pid} />
        <div className="rounded-2xl border p-4"><div className="mb-3 text-sm font-semibold">Tracking</div><Timeline c={c} /></div>
      </div>
    </div>
  );
}

function DepositWizard({ ndci, onDone }: { ndci: string; onDone: () => void }) {
  const c = useStore((s) => s.cheques[ndci]);
  const now = useStore((s) => s.now);
  const pid = useStore((s) => s.persona);
  const { act, verify } = useStore();
  const p = personaById(pid)!;
  const [step, setStep] = useState(1);
  const [checks, setChecks] = useState<VerifyResult | null>(null);
  if (!c) return null;
  const mature = c.payableDate <= dubaiDay(now);
  return (
    <div>
      <Top title={`e-Deposit Cheque · ${step}/3`} onBack={onDone} />
      <div className="space-y-4 p-4">
        {step === 1 && (
          <>
            <div className="text-sm font-semibold">Step 08 · Eligibility checks</div>
            <Button variant="outline" className="w-full" onClick={() => setChecks(verify(c.qrToken ?? c.ndci, "beneficiary").result)}><ScanLine className="h-4 w-4" /> Run checks</Button>
            {checks && (
              <ul className="space-y-1 text-xs">
                <li>{c.beneficiaryId === pid ? "✓" : "✗"} Ownership: you are the beneficiary</li>
                <li>{checks === "genuine" ? "✓" : "✗"} Authenticity & registry status: {checks}</li>
                <li>{mature ? "✓" : "✗"} Maturity: payable {fmtDate(c.payableDate)}</li>
                <li>{c.depositRef ? "✗ Already deposited" : "✓ No prior deposit or presentment"}</li>
              </ul>
            )}
            <Button className="w-full" disabled={checks !== "genuine" || !mature || !!c.depositRef} onClick={() => setStep(2)}>Continue</Button>
          </>
        )}
        {step === 2 && (
          <>
            <Label>Receiving account</Label>
            <div className="rounded-2xl border-2 border-orange p-4 text-sm"><div className="font-medium">{bankById(p.bank).name} · eligible</div><div className="font-mono text-[11px] text-muted-foreground">{p.acct}</div></div>
            <Button className="w-full" onClick={() => setStep(3)}>Review instruction</Button>
          </>
        )}
        {step === 3 && (
          <>
            <ChequeVisual c={c} compact />
            <div className="rounded-xl bg-muted p-3 text-xs">Deposit {aed(c.amount)} to {p.acct}. Your bank validates, then clearing, settlement and credit follow separately — submission is not realization.</div>
            <Button className="w-full" onClick={() => { if (act((s) => X.eDeposit(s, ndci, pid, p.acct), "Deposit submitted — reference created")) onDone(); }}>Authorize deposit</Button>
          </>
        )}
      </div>
    </div>
  );
}
