import { audit, clone, EngineError, nextId, notify, tick } from './engine';
import type { BankId, Cheque, EngineState } from './types';
import { PERSONAS } from './seed';

export type LetterStage = 'Requested' | 'Validating' | 'Collecting Records' | 'Pending Bank Confirmation' | 'Pending Reconciliation' | 'Pending Approval' | 'Approved' | 'Issued' | 'Action Required' | 'Rejected' | 'Withdrawn';
export type LetterActor = { kind: 'customer'; id: string; authorized?: boolean } | { kind: 'bank'; id: string; bank: BankId; role: string } | { kind: 'preparer' | 'approver' | 'supervisor'; id: string };
export interface LetterRow extends Omit<Cheque, 'drawerAcct' | 'beneficiaryAcct'> { account: string; obligation?: string; release?: { id: string; at: number; stage: string; owner: string; disputed: boolean }; category: 'payment' | 'security' | 'disclosure' | 'excluded'; paymentStage?: string; sourceRefs: string[] }
export interface LetterSnapshot { id: string; at: number; rows: LetterRow[]; freshness: Partial<Record<BankId, number>>; totals: Record<string, { payment: number; security: number; pendingRelease: number; returned: number }> }
export interface LetterException { id: string; bank: BankId; ndci?: string; type: string; severity: 'material' | 'warning'; owner: string; at: number; note: string; resolved?: { by: string; at: number; evidence: string } }
export interface LetterDocument { id: string; version: number; snapshotId: string; draftVersion: number; status: 'Issued' | 'Superseded' | 'Revoked'; issuedAt: number; issuer: string; approver: string; token: string; hash: string; bytes: string; reason?: string }
export interface LetterRequest { id: string; customerId: string; name: string; identity: string; profile: 'individual' | 'corporate'; banks: BankId[]; accounts: { bank: BankId; masked: string }[]; purpose: string; recipient: string; language: 'en' | 'ar'; reportingDate: string; requestedAt: number; stage: LetterStage; key: string; snapshots: LetterSnapshot[]; confirmations: Partial<Record<BankId, { by: string; at: number; ref: string; snapshotId: string }>>; exceptions: LetterException[]; draftVersion: number; preparer?: string; approval?: { by: string; at: number; reason: string; snapshotId: string; version: number }; documents: LetterDocument[]; correctionOf?: string; correctionReason?: string; events: { at: number; by: string; action: string; reason?: string }[] }
export interface LettersState { requests: LetterRequest[]; authority: string; freshnessHours: number }
export const emptyLetters = (): LettersState => ({ requests: [], authority: 'EDC appointed demonstration issuer', freshnessHours: 24 });
export const letters = (s: EngineState): LettersState => s.ext.letters ?? emptyLetters();
export const mask = (value: string) => `•••• ${value.replace(/\s/g, '').slice(-4)}`;
export function visibleLetters(s: EngineState, actor: LetterActor) {
  return letters(s).requests.filter(r => actor.kind === 'customer' ? r.customerId === actor.id : actor.kind === 'bank' ? r.banks.includes(actor.bank) : true);
}
export function scopedLetter(s: EngineState, id: string, actor: LetterActor): LetterRequest {
  const r = visibleLetters(s, actor).find(r => r.id === id);
  if (!r) throw new EngineError('Request not found in your authorized demonstration scope');
  return actor.kind === 'bank' ? { ...r, accounts: r.accounts.filter(a => a.bank === actor.bank), snapshots: r.snapshots.map(v => ({ ...v, rows: v.rows.filter(c => c.issuingBank === actor.bank), totals: totals(v.rows.filter(c => c.issuingBank === actor.bank)) })), exceptions: r.exceptions.filter(e => e.bank === actor.bank), documents: [], recipient: '' } : r;
}
function mutable(s: EngineState, id: string, a: LetterActor) { scopedLetter(s, id, a); const r = letters(s).requests.find(r => r.id === id); if (!r) throw new EngineError('Request not found'); return r; }
function requireKind(a: LetterActor, kind: LetterActor['kind']) { if (a.kind !== kind) throw new EngineError(`Only an authorized demonstration ${kind} can perform this action`); }
function event(s: EngineState, r: LetterRequest, a: LetterActor, action: string, reason?: string) { tick(s); r.events.push({ at: s.now, by: a.id, action, reason }); audit(s, a.kind === 'customer' ? 'customer' : a.kind === 'bank' ? 'issuing_bank' : 'edc', `Liability letter ${r.id}: ${action}`, undefined, a.kind === 'bank' ? a.bank : undefined, { correlation: r.id, reason, institution: a.id }); notify(s, r.customerId, `Liability letter ${r.id}: ${action}`); }
export function totals(rows: LetterRow[]) {
  const out: LetterSnapshot['totals'] = {};
  rows.forEach(c => { const t = out[c.currency] ??= { payment: 0, security: 0, pendingRelease: 0, returned: 0 }; if (c.category === 'payment') t.payment += c.amount; if (c.category === 'security') { t.security += c.amount; if (c.release) t.pendingRelease += c.amount; } if (c.category === 'disclosure') t.returned += c.amount; });
  return out;
}
export function collectSnapshot(s: EngineState, r: LetterRequest): LetterSnapshot {
  const rows: LetterRow[] = Object.values(s.cheques).filter(c => c.drawerId === r.customerId && r.banks.includes(c.issuingBank) && r.accounts.some(a => a.bank === c.issuingBank && a.masked === mask(c.drawerAcct))).map(c => {
    const { drawerAcct, beneficiaryAcct: _beneficiaryAcct, ...copy } = structuredClone(c);
    const release = s.ext.requests.find(x => x.ndci === c.ndci && x.type === 'security_release' && !['completed', 'expired', 'rejected'].includes(x.status));
    const obligation = c.obligationId ? s.ext.obligations[c.obligationId] : undefined;
    const failedSignature = c.signingSessionId && s.ext.signing[c.signingSessionId]?.result !== 'signed';
    let category: LetterRow['category'] = 'payment';
    if (c.supersededBy || !c.hash || failedSignature || ['requested', 'authorized', 'cancelled', 'replaced', 'released', 'rejected'].includes(c.status)) category = 'excluded';
    else if (['returned', 'stopped'].includes(c.status) || obligation?.status === 'disputed' && c.classification !== 'security') category = 'disclosure';
    else if (c.classification === 'security') category = 'security';
    else if (['settled', 'credited'].includes(c.status) && c.settlementRef && !c.settlementException) category = 'excluded';
    return { ...copy, account: mask(drawerAcct), category, obligation: obligation?.ref, paymentStage: c.payableDate > s.now ? 'Future-dated' : ['presented', 'paid'].includes(c.status) ? 'Clearing — settlement unconfirmed' : ['deposited', 'accepted'].includes(c.status) ? 'Deposited' : 'Outstanding', release: release ? { id: release.id, at: release.createdAt, stage: release.status, owner: release.status === 'awaiting_bank' ? c.issuingBank : c.beneficiary, disputed: release.status === 'queried' || obligation?.status === 'disputed' || release.responses.some(x => x.decision === 'reject') } : undefined, sourceRefs: c.events.map((e, i) => `${c.ndci}:v${c.version}:event${i}:${e.at}`).concat(s.ext.requests.filter(x => x.ndci === c.ndci).map(x => x.id)) };
  });
  const freshness: LetterSnapshot['freshness'] = {};
  r.banks.forEach(bank => { const bankRows = rows.filter(c => c.issuingBank === bank); freshness[bank] = bankRows.length ? Math.max(...bankRows.map(c => c.updatedAt)) : s.ext.entitlements[r.customerId]?.lastConfirmedAt ?? 0; });
  return { id: `${r.id}-SNAP-${r.snapshots.length + 1}`, at: s.now, rows, freshness, totals: totals(rows) };
}
export function requestLetter(state: EngineState, a: LetterActor, input: { banks: BankId[]; accounts: { bank: BankId; masked: string }[]; purpose: string; recipient?: string; language: 'en' | 'ar'; reportingDate: string; key: string; correctionOf?: string; correctionReason?: string }): { state: EngineState; id: string } {
  requireKind(a, 'customer'); if (a.kind !== 'customer') throw new EngineError('Customer requester required');
  const p = PERSONAS.find(p => p.id === a.id); if (!p) throw new EngineError('Unknown customer');
  if (p.kind === 'corporate' && !a.authorized) throw new EngineError('Corporate requester authority is required');
  const existing = letters(state).requests.find(r => r.customerId === a.id && r.key === input.key); if (existing) return { state, id: existing.id };
  if (!input.purpose.trim() || !input.banks.length || !input.accounts.length || !input.key) throw new EngineError('Purpose, supported bank scope and included accounts are required');
  if (input.reportingDate !== new Date(state.now + 4 * 3600_000).toISOString().slice(0, 10)) throw new EngineError('Historical snapshots are unavailable; only the current demonstration date is supported');
  const knownAccounts = Object.values(state.cheques).filter(c => c.drawerId === a.id).map(c => ({ bank: c.issuingBank, masked: mask(c.drawerAcct) })).concat({ bank: p.bank, masked: mask(p.acct) });
  if (new Set(input.banks).size !== input.banks.length || input.banks.some(b => !knownAccounts.some(c => c.bank === b)) || input.accounts.some(c => !input.banks.includes(c.bank) || !knownAccounts.some(k => k.bank === c.bank && k.masked === c.masked)) || input.banks.some(b => !input.accounts.some(c => c.bank === b))) throw new EngineError('Selected bank/account coverage is unsupported');
  if (input.correctionOf && !letters(state).requests.some(r => r.customerId === a.id && r.documents.some(d => d.id === input.correctionOf)) || input.correctionOf && !input.correctionReason?.trim()) throw new EngineError('Correction requires an owned issued document and reason');
  const s = clone(state); s.ext.letters ??= emptyLetters(); const id = nextId(s, 'LL');
  const r: LetterRequest = { id, customerId: a.id, name: p.name, identity: mask(a.id), profile: p.kind, banks: [...input.banks], accounts: structuredClone(input.accounts), purpose: input.purpose.trim(), recipient: input.recipient?.trim() ?? '', language: input.language, reportingDate: input.reportingDate, requestedAt: s.now, stage: 'Requested', key: input.key, snapshots: [], confirmations: {}, exceptions: [], draftVersion: 0, documents: [], events: [], correctionOf: input.correctionOf, correctionReason: input.correctionReason };
  s.ext.letters.requests.unshift(r); event(s, r, a, 'Requested', input.correctionReason); return { state: s, id };
}
export function advanceLetter(state: EngineState, id: string, a: LetterActor): EngineState {
  requireKind(a, 'preparer'); const s = clone(state), r = mutable(s, id, a);
  if (r.stage === 'Requested' || r.stage === 'Action Required') r.stage = 'Validating';
  else if (r.stage === 'Validating') r.stage = 'Collecting Records';
  else if (r.stage === 'Collecting Records') { r.snapshots.push(collectSnapshot(s, r)); r.confirmations = {}; r.stage = 'Pending Bank Confirmation'; r.exceptions = detectExceptions(s, r); }
  else throw new EngineError('This stage requires confirmation, reconciliation or approval');
  event(s, r, a, r.stage); return s;
}
export function detectExceptions(s: EngineState, r: LetterRequest): LetterException[] {
  const v = r.snapshots.at(-1); if (!v) return [];
  const out: LetterException[] = [];
  const add = (bank: BankId, type: string, ndci?: string) => out.push({ id: `${r.id}-EX-${out.length + 1}`, bank, ndci, type, severity: 'material', owner: `bank:${bank}`, at: s.now, note: 'Authorized source evidence and renewed bank confirmation required' });
  r.banks.forEach(b => { if (s.bankLinks[b] !== 'up') add(b, 'Unavailable bank integration'); if (s.now - (v.freshness[b] ?? 0) > letters(s).freshnessHours * 3600_000) add(b, 'Missing or stale bank update'); });
  const seen = new Set<string>();
  v.rows.forEach(c => { const key = `${c.ndci}:${c.version}`; if (seen.has(key)) add(c.issuingBank, 'Duplicate NDCI/version', c.ndci); seen.add(key); if (c.replaces && v.rows.some(o => o.ndci === c.replaces && ['payment', 'security'].includes(o.category))) add(c.issuingBank, 'Original and replacement both active', c.ndci); if (c.release?.stage === 'approved' && c.status !== 'released') add(c.issuingBank, 'Approved release without final release event', c.ndci); if (c.release?.disputed || c.obligationId && s.ext.obligations[c.obligationId]?.status === 'disputed') add(c.issuingBank, 'Disputed security release', c.ndci); }); return out;
}
function ready(s: EngineState, r: LetterRequest) {
  const v = r.snapshots.at(-1); if (!v) throw new EngineError('Snapshot required');
  if (r.exceptions.some(e => e.severity === 'material' && !e.resolved)) throw new EngineError('Unresolved material discrepancies block approval and issuance');
  if (r.banks.some(b => s.bankLinks[b] !== 'up' || r.confirmations[b]?.snapshotId !== v.id || s.now - (r.confirmations[b]?.at ?? 0) > letters(s).freshnessHours * 3600_000)) throw new EngineError('Complete, fresh bank confirmation and available integration required');
  return v;
}
export function bankReview(state: EngineState, id: string, a: LetterActor, decision: 'confirm' | 'discrepancy', reason: string, reference: string, ndci?: string): EngineState {
  requireKind(a, 'bank'); if (a.kind !== 'bank') throw new EngineError('Bank reviewer required');
  if (!['Issuance Approver', 'Settlement and Reconciliation Officer', 'Risk and Fraud Analyst'].includes(a.role)) throw new EngineError('Your bank role cannot confirm liability letters');
  if (!reason.trim() || !reference.trim()) throw new EngineError('Reason and supporting reference required');
  const s = clone(state), r = mutable(s, id, a), v = r.snapshots.at(-1);
  if (!v || !['Pending Bank Confirmation', 'Pending Reconciliation', 'Pending Approval', 'Approved'].includes(r.stage)) throw new EngineError('No reviewable snapshot');
  if (s.bankLinks[a.bank] !== 'up') throw new EngineError('Integration unavailable — retry after restoration');
  if (ndci && !v.rows.some(c => c.ndci === ndci && c.issuingBank === a.bank)) throw new EngineError('Instrument outside bank scope');
  r.approval = undefined;
  if (decision === 'discrepancy') { delete r.confirmations[a.bank]; r.exceptions.push({ id: nextId(s, 'LLX'), bank: a.bank, ndci, type: 'Amount, currency or status disagreement', severity: 'material', owner: a.id, at: s.now, note: `${reason}; supporting reference: ${reference}` }); }
  else r.confirmations[a.bank] = { by: a.id, at: s.now, ref: reference, snapshotId: v.id };
  r.stage = r.exceptions.some(e => !e.resolved) ? 'Pending Reconciliation' : r.banks.every(b => r.confirmations[b]?.snapshotId === v.id) ? 'Pending Approval' : 'Pending Bank Confirmation';
  event(s, r, a, decision === 'confirm' ? `${a.bank} confirmed records` : `${a.bank} flagged discrepancy`, `${reason}; ${reference}`); return s;
}
export function resolveLetterException(state: EngineState, id: string, exceptionId: string, a: LetterActor, evidence: string): EngineState {
  if (a.kind !== 'bank' && a.kind !== 'preparer') throw new EngineError('Only reconciliation participants may resolve exceptions');
  const s = clone(state), r = mutable(s, id, a), e = r.exceptions.find(e => e.id === exceptionId);
  if (!e || a.kind === 'bank' && e.bank !== a.bank) throw new EngineError('Exception outside your scope');
  if (!['Pending Reconciliation', 'Pending Bank Confirmation'].includes(r.stage)) throw new EngineError('Request not awaiting reconciliation');
  if (!evidence.trim()) throw new EngineError('Resolution evidence required');
  if (s.bankLinks[e.bank] !== 'up') throw new EngineError('Restore integration before resolving the exception');
  const c = e.ndci ? s.cheques[e.ndci] : undefined;
  const valid = c ? c.events.some((x, i) => evidence === `${c.ndci}:v${c.version}:event${i}:${x.at}`) || s.ext.releases.some(x => x.ndci === c.ndci && x.ref === evidence) : evidence === r.confirmations[e.bank]?.ref;
  if (!valid) throw new EngineError('Resolution must reference an existing authorized lifecycle event or bank confirmation');
  e.resolved = { by: a.id, at: s.now, evidence }; r.approval = undefined;
  const previous = r.snapshots.at(-1); const changed = previous?.rows.some(x => x.issuingBank === e.bank && (s.cheques[x.ndci]?.version !== x.version || s.cheques[x.ndci]?.updatedAt !== x.updatedAt));
  if (changed) { r.snapshots.push(collectSnapshot(s, r)); r.confirmations = {}; r.exceptions = [...r.exceptions, ...detectExceptions(s, r).filter(x => !r.exceptions.some(y => y.type === x.type && y.ndci === x.ndci && y.resolved)).map(x => ({ ...x, id: nextId(s, 'LLX') }))]; }
  const v = r.snapshots.at(-1); r.stage = r.exceptions.some(x => !x.resolved) ? 'Pending Reconciliation' : r.banks.every(b => r.confirmations[b]?.snapshotId === v?.id) ? 'Pending Approval' : 'Pending Bank Confirmation'; event(s, r, a, 'Exception resolved', evidence); return s;
}
export function submitLetterDraft(state: EngineState, id: string, a: LetterActor): EngineState {
  requireKind(a, 'preparer'); const s = clone(state), r = mutable(s, id, a); if (!['Pending Approval', 'Approved'].includes(r.stage)) throw new EngineError('Request is not ready for draft submission'); ready(s, r); r.preparer = a.id; r.draftVersion++; r.approval = undefined; r.stage = 'Pending Approval'; event(s, r, a, `Draft v${r.draftVersion} submitted`); return s;
}
export function decideLetter(state: EngineState, id: string, a: LetterActor, approve: boolean, reason: string): EngineState {
  requireKind(a, 'approver'); const s = clone(state), r = mutable(s, id, a); if (!reason.trim()) throw new EngineError('Decision reason required'); if (r.stage !== 'Pending Approval' || !r.draftVersion || !r.preparer) throw new EngineError('A submitted draft is required'); if (a.id === r.preparer) throw new EngineError('Maker cannot approve their own draft'); const v = ready(s, r); if (approve) r.approval = { by: a.id, at: s.now, reason, snapshotId: v.id, version: r.draftVersion }; r.stage = approve ? 'Approved' : 'Rejected'; event(s, r, a, r.stage, reason); return s;
}
export function issueLetter(state: EngineState, id: string, a: LetterActor, doc: LetterDocument): EngineState {
  requireKind(a, 'approver'); const s = clone(state), r = mutable(s, id, a); if (r.documents.some(d => d.id === doc.id)) return state;
  const v = ready(s, r); if (r.stage !== 'Approved' || r.approval?.by !== a.id || r.approval.snapshotId !== v.id || r.approval.version !== r.draftVersion || doc.snapshotId !== v.id || doc.draftVersion !== r.draftVersion || doc.approver !== a.id || doc.issuer !== letters(s).authority || doc.version !== r.documents.length + 1 || doc.id !== `${r.id}-DOC-${doc.version}`) throw new EngineError('Approval does not match this snapshot/document version');
  if (!/^[a-f0-9]{64}$/.test(doc.hash) || !/^[a-f0-9]{48}$/.test(doc.token) || !doc.bytes || letters(s).requests.some(x => x.documents.some(d => d.token === doc.token))) throw new EngineError('Valid PDF integrity record and unique opaque token required');
  r.documents.push(structuredClone(doc)); r.stage = 'Issued';
  if (r.correctionOf) { const original = letters(s).requests.flatMap(x => x.documents).find(d => d.id === r.correctionOf); if (original) { original.status = 'Superseded'; original.reason = r.correctionReason; const parent = letters(s).requests.find(x => x.documents.some(d => d.id === original.id)); if (parent) event(s, parent, a, 'Document superseded', `${r.id}: ${r.correctionReason}`); } }
  event(s, r, a, 'Demonstration PDF issued', doc.hash); return s;
}
export function changeLetterStage(state: EngineState, id: string, a: LetterActor, stage: 'Withdrawn' | 'Action Required' | 'Rejected', reason: string): EngineState {
  const s = clone(state), r = mutable(s, id, a); if (!reason.trim()) throw new EngineError('Reason required');
  if (stage === 'Withdrawn') { requireKind(a, 'customer'); if (['Approved', 'Issued', 'Rejected', 'Withdrawn'].includes(r.stage)) throw new EngineError('Withdrawal allowed only before approval'); }
  else { requireKind(a, 'preparer'); if (['Approved', 'Issued', 'Withdrawn', 'Rejected'].includes(r.stage)) throw new EngineError('Request is no longer editable'); }
  r.stage = stage; r.approval = undefined; event(s, r, a, stage, reason); return s;
}
export function revokeLetter(state: EngineState, id: string, documentId: string, a: LetterActor, reason: string): EngineState { requireKind(a, 'approver'); const s = clone(state), r = mutable(s, id, a), d = r.documents.find(x => x.id === documentId); if (!d || d.status !== 'Issued' || !reason.trim()) throw new EngineError('Issued document and revocation reason required'); d.status = 'Revoked'; d.reason = reason; event(s, r, a, 'Document revoked', reason); return s; }
export function accessLetter(state: EngineState, id: string, documentId: string, a: LetterActor): EngineState { requireKind(a, 'customer'); const s = clone(state), r = mutable(s, id, a); if (!r.documents.some(x => x.id === documentId)) throw new EngineError('Document unavailable'); event(s, r, a, 'Document downloaded', documentId); return s; }
export function verifyLetter(state: EngineState, token: string) { const d = letters(state).requests.flatMap(r => r.documents).find(d => d.token === token); return d ? { status: d.status === 'Issued' ? 'Valid' : d.status, reference: d.id, issueDate: d.issuedAt, version: d.version, issuer: d.issuer, integrity: { algorithm: 'SHA-256', hash: d.hash } } : { status: 'Not Found' }; }
export function configureLetters(state: EngineState, a: LetterActor, authority: string, freshnessHours: number): EngineState { requireKind(a, 'approver'); if (!authority.trim() || freshnessHours < 1 || freshnessHours > 720) throw new EngineError('Demo authority and freshness threshold from 1 to 720 hours required'); const s = clone(state); s.ext.letters ??= emptyLetters(); s.ext.letters.authority = `${authority.replace(/\s*\(demonstration\)$/, '')} (demonstration)`; s.ext.letters.freshnessHours = freshnessHours; audit(s, 'edc', 'Liability letter demonstration policy updated', undefined, undefined, { institution: a.id, reason: `${authority}; ${freshnessHours} hours` }); return s; }