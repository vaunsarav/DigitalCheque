import { authorize, checkerApprove, issue, deposit, acceptDeposit, present, decide, audit, nextId } from './engine';
import { createRequestExt, createServiceRequest, respondServiceRequest, bankDecideRequest } from './ext';
import { PERSONAS } from './seed';
import { mask, requestLetter, letters, type LetterActor } from './letters';
import type { EngineState } from './types';

export const demoPreparer: LetterActor = { kind: 'preparer', id: 'EDC Demo Preparer' };
export const demoApprover: LetterActor = { kind: 'approver', id: 'EDC Demo Approver' };
export const demoBank: LetterActor = { kind: 'bank', bank: 'ENBD', id: 'ENBD Demo Reviewer', role: 'Issuance Approver' };
/** Opt-in fixtures use existing issuance and service-request engines, not a parallel ledger. */
export function seedLetterScenario(state: EngineState): { state: EngineState; id: string } {
  const previous = letters(state).requests.find(r => r.key === 'presenter-liability-clean'); if (previous) return { state, id: previous.id };
  let s = state; const drawer = PERSONAS.find(p => p.id === 'CUST-AHMED'), beneficiary = PERSONAS.find(p => p.id === 'CUST-FATIMA'); if (!drawer || !beneficiary) throw new Error('Demo personas unavailable');
  // Distinct supported synthetic subaccount keeps the exact fixture position coherent even after other scenarios.
  const acct = 'AE00 0260 0000 0000 0000 777';
  const make = (amount: number, security = false, account = acct, due = s.now + 86400_000) => {
    const result = createRequestExt(s, { issuingBank: drawer.bank, payeeBank: beneficiary.bank, drawer: drawer.name, drawerId: drawer.id, drawerAcct: account, beneficiary: beneficiary.name, beneficiaryId: beneficiary.id, beneficiaryAcct: beneficiary.acct, amount, payableDate: due, purpose: security ? 'Demonstration performance security' : 'Demonstration supplier commitment', purposeCategory: security ? 'security' : 'supplier', classification: security ? 'security' : 'payment', ...(security ? { obligation: { ref: `LL-DEMO-CONTRACT-${amount}`, kind: 'Synthetic performance contract', counterparty: beneficiary.name, startDate: s.now, securityAmount: amount, closureParty: beneficiary.name } } : {}) }); s = result.state;
    if (s.cheques[result.ndci]?.makerChecker?.pending) s = checkerApprove(s, result.ndci, 'Demo corporate checker'); s = authorize(s, result.ndci).state; s = issue(s, result.ndci); return result.ndci;
  };
  make(50_000); make(35_000); make(60_000, true); const releaseInstrument = make(40_000, true);
  const release = createServiceRequest(s, { type: 'security_release', ndci: releaseInstrument, by: drawer.id, reason: 'Demo contract completion claim', evidence: 'Synthetic contract handover' }); s = release.state;
  s = respondServiceRequest(s, release.id, beneficiary.id, 'accept', 'Synthetic handover confirmed');
  // Authorized return and controlled amendment use the existing audited lifecycle.
  const returnedId = make(8_000, false, acct, s.now);
  s = deposit(s, returnedId); s = acceptDeposit(s, returnedId); s = present(s, returnedId); s = decide(s, returnedId, false, 'Insufficient funds (synthetic demonstration)');
  const originalId = make(12_000, false, 'AE00 0260 0000 0000 0000 888');
  const amendment = createServiceRequest(s, { type: 'amend', ndci: originalId, by: drawer.id, reason: 'Synthetic authorized amendment', proposed: { amount: 12_000 } }); s = amendment.state;
  s = respondServiceRequest(s, amendment.id, beneficiary.id, 'accept', 'Synthetic revised terms accepted');
  s = bankDecideRequest(s, amendment.id, true, 'Authorized replacement for demonstration', 'Demo bank checker');
  const replacementId = s.ext.requests.find(r => r.id === amendment.id)?.replacementNdci;
  if (!replacementId) throw new Error('Controlled replacement missing');
  s = authorize(s, replacementId).state; s = issue(s, replacementId);
  audit(s, 'system', 'Opt-in liability letter synthetic fixture registered', undefined, 'ENBD', { evidence: nextId(s, 'LLFIX') });
  return requestLetter(s, { kind: 'customer', id: drawer.id }, { banks: ['ENBD'], accounts: [{ bank: 'ENBD', masked: mask(acct) }], purpose: 'Presenter J demonstration commitment statement', language: 'en', reportingDate: new Date(s.now + 4 * 3600_000).toISOString().slice(0, 10), key: 'presenter-liability-clean' });
}
