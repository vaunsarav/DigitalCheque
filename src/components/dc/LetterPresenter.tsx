import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, Circle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import * as L from '@/lib/engine/letters';
import { seedLetterScenario, demoPreparer, demoApprover, demoBank } from '@/lib/engine/letter-scenarios';
import { prepareIssue, validateAndIssue, downloadPdf, hashPdf, pdfBytes } from '@/lib/letter-pdf';
import { toast } from 'sonner';
import { LetterNotice, LetterTotals, LiabilityLetters } from './letters';

const labels = ['Customer requests letter (load coherent synthetic examples)', 'Identity, authority and scope validated', 'Dated snapshot collected', 'Bank confirms selected records', 'Reconciliation discrepancy demonstrated and resolved', 'EDC preparer submits draft', 'Distinct demonstration approver approves', 'Demonstration PDF issued', 'Customer downloads and verifies', 'CBUAE inspects read-only oversight'];
const destinations = ['/mobile', '/edc', '/edc', '/bank', '/bank', '/edc', '/edc', '/edc', '/mobile', '/cbuae'] as const;
export function LetterPresenter() {
  const state = useStore(); const r = L.letters(state).requests.find(r => r.key === 'presenter-liability-clean'); const [step, setStep] = useState(0); const [busy, setBusy] = useState(false);
  const next = async () => {
    if (busy) return; setBusy(true);
    try {
      const current = useStore.getState();
      if (step === 0) { const out = current.run(s => seedLetterScenario(s)); if (!out.ok) return; current.setUi({ persona: 'CUST-AHMED', bank: 'ENBD' }); }
      else {
        const req = L.letters(current).requests.find(r => r.key === 'presenter-liability-clean'); if (!req) throw new Error('Request not found'); const id = req.id;
        const run = (fn: Parameters<typeof current.act>[0]) => { if (!useStore.getState().act(fn)) throw new Error('Step blocked; resolve the request in the portal before continuing'); };
        if (step === 1) { if (req.stage === 'Requested') run(s => L.advanceLetter(s, id, demoPreparer)); if (L.letters(useStore.getState()).requests.find(r => r.id === id)?.stage === 'Validating') run(s => L.advanceLetter(s, id, demoPreparer)); }
        if (step === 2 && req.stage === 'Collecting Records') run(s => L.advanceLetter(s, id, demoPreparer));
        if (step === 3) run(s => L.bankReview(s, id, demoBank, 'confirm', 'Selected records checked against synthetic bank source', `BANK-CONF-${id}`));
        if (step === 4) {
          const ndci = req.snapshots.at(-1)?.rows.find(c => c.category === 'payment')?.ndci;
          run(s => L.bankReview(s, id, demoBank, 'discrepancy', 'Active in EDC versus bank status mismatch — synthetic review exception', `MISMATCH-${id}`, ndci));
          const updated = L.letters(useStore.getState()).requests.find(r => r.id === id); const e = updated?.exceptions.find(e => !e.resolved); const source = updated?.snapshots.at(-1)?.rows.find(c => c.ndci === e?.ndci)?.sourceRefs.at(-1);
          if (!e || !source) throw new Error('Source evidence required'); run(s => L.resolveLetterException(s, id, e.id, demoBank, source)); run(s => L.bankReview(s, id, demoBank, 'confirm', 'Mismatch reconciled to authorized recorded event', `RECONF-${id}`));
        }
        if (step === 5) run(s => L.submitLetterDraft(s, id, demoPreparer));
        if (step === 6) run(s => L.decideLetter(s, id, demoApprover, true, 'Distinct checker reviewed complete confirmations and frozen draft'));
        if (step === 7 && req.stage !== 'Issued') { const doc = await prepareIssue(useStore.getState(), id, demoApprover); const fresh = useStore.getState(); const updated = await validateAndIssue(fresh, id, demoApprover, doc); fresh.act(() => updated); }
        if (step === 8) { const d = req.documents.at(-1); if (!d || await hashPdf(pdfBytes(d.bytes)) !== d.hash) throw new Error('PDF integrity check failed'); run(s => L.accessLetter(s, id, d.id, { kind: 'customer', id: req.customerId })); downloadPdf(d); if (L.verifyLetter(useStore.getState(), d.token).status !== 'Valid') throw new Error('Verification failed'); toast.success('Customer PDF downloaded and cryptographic integrity verified'); }
      }
      setStep(i => i + 1);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="space-y-4"><LetterNotice /><p className="text-sm text-muted-foreground">Every step writes the same customer, bank and EDC records. Opt-in fixture: AED 85,000 payment commitments; AED 100,000 security face values, of which AED 40,000 pending release. No combined total.</p><ol className="space-y-2">{labels.map((label, i) => <li key={label} className="flex items-center gap-3 rounded-md border p-3 text-sm">{i < step ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}<span className="min-w-0 flex-1">{label}</span><Link to={destinations[i] ?? '/edc'} className="text-xs text-primary underline">{destinations[i]?.slice(1).toUpperCase()}</Link></li>)}</ol><Button className="w-full" disabled={busy || step >= labels.length} onClick={next}><Play className="h-4 w-4" />{busy ? 'Processing…' : step >= labels.length ? 'Scenario complete' : `Run liability step ${step + 1}`}</Button>{r && <><LetterTotals snapshot={r.snapshots.at(-1)} /><LiabilityLetters mode="edc" /></>}</section>;
}
