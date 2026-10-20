import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { issueLetter, letters, scopedLetter, type LetterActor, type LetterDocument, type LetterRequest } from './engine/letters';
import type { EngineState } from './engine/types';

export const verificationUrl = (token: string) => `${window.location.origin}/verify/letters/${token}`;
export function pdfBytes(base64: string): Uint8Array { return Uint8Array.from(atob(base64), c => c.charCodeAt(0)); }
export async function hashPdf(bytes: Uint8Array) { const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer); return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''); }
export async function generateLetterPdf(r: LetterRequest, authority: string): Promise<LetterDocument> {
  const snapshot = r.snapshots.at(-1); if (!snapshot || !r.approval) throw new Error('Approved snapshot required');
  const version = r.documents.length + 1;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // PDF palette mirrors the portal's navy/blue brand; PDF is a fixed light document.
  const navy = rgb(0.02, 0.12, 0.38), ink = rgb(0.14, 0.18, 0.24), blue = rgb(0.86, 0.93, 0.98);
  let page = doc.addPage([595.28, 841.89]), y = 775;
  const ascii = (s: string) => s.replace(/••••/g, '****').replace(/[—–]/g, '-').replace(/[^\x20-\x7E]/g, '?');
  const heading = () => { page.drawRectangle({ x: 36, y: 790, width: 523, height: 30, color: navy }); page.drawText('DEMONSTRATION LIABILITY LETTER', { x: 48, y: 800, font: bold, size: 13, color: rgb(1, 1, 1) }); };
  heading();
  const newPage = () => { page = doc.addPage([595.28, 841.89]); y = 775; heading(); };
  const text = (value: string, strong = false, size = 10) => {
    const words = ascii(value).split(/\s+/); let line = '';
    for (const word of words) { const trial = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(trial, size) > 510 && line) { if (y < 60) newPage(); page.drawText(line, { x: 42, y, size, font: strong ? bold : font, color: ink }); y -= size + 5; line = word; } else line = trial; }
    if (y < 60) newPage(); page.drawText(line, { x: 42, y, size, font: strong ? bold : font, color: ink }); y -= size + 7;
  };
  text('Synthetic data - not an official bank certificate', true);
  text(`Letter ${r.id} | document version ${version} | draft version ${r.draftVersion}`, true);
  text(`Issued: ${new Date(r.approval.at).toISOString()} | Snapshot: ${new Date(snapshot.at).toISOString()}`);
  text(`Customer: ${r.name} | Masked identity: ${r.identity} | Profile: ${r.profile}`);
  text(`Purpose: ${r.purpose} | Recipient: ${r.recipient || 'Secure in-app delivery only'}`);
  text(`Requested language: ${r.language === 'ar' ? 'Arabic; this demonstration PDF uses English (Arabic PDF typography not supported)' : 'English'}`);
  text(`Banks and accounts: ${r.accounts.map(a => `${a.bank} ${a.masked}`).join(', ')}`);
  text(`Source freshness: ${Object.entries(snapshot.freshness).map(([b, t]) => `${b}: ${new Date(t ?? 0).toISOString()}`).join('; ')}`);
  y -= 8; text('CATEGORY SUMMARIES (NO COMBINED TOTAL)', true, 12);
  if (!Object.keys(snapshot.totals).length) text('No registered instruments in the selected scope.');
  Object.entries(snapshot.totals).forEach(([currency, t]) => { text(`${currency} Outstanding payment commitments: ${t.payment.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, true); text(`${currency} Active security cheque face values: ${t.security.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, true); text(`Of the security face values above: pending release ${currency} ${t.pendingRelease.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`); text(`Returned / disputed disclosure (separate): ${currency} ${t.returned.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`); });
  text('Pending releases overlap security face values; never add them again. Security face value is not an amount currently payable.');
  text('Returned or disputed records do not establish that an underlying obligation has ended.');
  y -= 8; text('DETAILED INSTRUMENT SCHEDULE', true, 12);
  const columns = [42, 195, 287, 365, 450];
  const tableHeading = () => { page.drawRectangle({ x: 36, y: y - 6, width: 523, height: 22, color: blue }); ['NDCI / version', 'Bank / account', 'Amount', 'Status', 'Category'].forEach((v, i) => page.drawText(v, { x: columns[i] ?? 42, y, font: bold, size: 8, color: navy })); y -= 28; };
  tableHeading();
  for (const row of snapshot.rows) {
    if (y < 170) { newPage(); text('INSTRUMENT SCHEDULE (continued)', true); tableHeading(); }
    [ `${row.ndci} / ${row.version}`, `${row.issuingBank} ${ascii(row.account)}`, `${row.currency} ${row.amount.toLocaleString('en-GB')}`, row.status, row.category ].forEach((v, i) => page.drawText(ascii(v), { x: columns[i] ?? 42, y, font, size: 7, color: ink })); y -= 16;
    text(`Issuer: ${row.drawer} | Beneficiary: ${row.beneficiary}`, false, 8);
    text(`Issue: ${new Date(row.issueDate).toISOString().slice(0, 10)} | Payable: ${new Date(row.payableDate).toISOString().slice(0, 10)} | ${row.paymentStage ?? ''} | Purpose: ${row.purpose}`, false, 8);
    text(`Obligation: ${row.obligation ?? 'Not registered'} | Replacement: ${row.replaces ?? row.supersededBy ?? 'None'} | Last update: ${new Date(row.updatedAt).toISOString()}`, false, 8);
    if (row.release) text(`Release ${row.release.id}: ${row.release.stage} | Requested ${new Date(row.release.at).toISOString()} | Responsible: ${row.release.owner} | Disputed: ${row.release.disputed ? 'Yes' : 'No'}`, false, 8);
    if (row.returnReason) text(`Disclosure reason: ${row.returnReason}`, false, 8);
    text(`Source evidence: ${row.sourceRefs.at(-1) ?? 'No recorded event'}`, false, 7);
    y -= 6;
  }
  if (y < 300) newPage(); y -= 8; text('COVERAGE AND LIMITATIONS', true, 12);
  text('Registered digital cheques within selected accounts only. Drafts, failed signatures, cancellations, superseded originals, confirmed settled payments and fully released security instruments are excluded from active totals, with history retained. Complete selected-bank confirmation required.');
  text('This letter reflects registered digital cheque records within the stated scope and as-of timestamp. It does not certify all debts, loans or obligations of the customer.');
  text(`Authorized demonstration approver: ${r.approval.by} | Authority: ${authority}`);
  text(`Approval: ${r.approval.reason}`);
  text('Simulated digital signature. No official authority, production certification or legal validity.', true);
  const url = verificationUrl(token); text(`Verification reference: ${token}`, false, 8);
  const qr = await doc.embedPng(await QRCode.toDataURL(url, { margin: 1, width: 160 }));
  if (y < 155) newPage(); page.drawImage(qr, { x: 42, y: y - 94, width: 90, height: 90 });
  doc.getPages().forEach((p, i, all) => p.drawText(`SYNTHETIC DEMONSTRATION | ${r.id} v${version} | Page ${i + 1} of ${all.length}`, { x: 42, y: 28, size: 8, font, color: navy }));
  const bytes = await doc.save(); const hash = await hashPdf(bytes);
  let binary = ''; bytes.forEach(b => { binary += String.fromCharCode(b); });
  return { id: `${r.id}-DOC-${version}`, version, snapshotId: snapshot.id, draftVersion: r.draftVersion, status: 'Issued', issuedAt: r.approval.at, issuer: authority, approver: r.approval.by, token, hash, bytes: btoa(binary) };
}
export async function prepareIssue(state: EngineState, id: string, actor: LetterActor) { const r = scopedLetter(state, id, actor); return generateLetterPdf(r, letters(state).authority); }
export async function validateAndIssue(state: EngineState, id: string, actor: LetterActor, doc: LetterDocument) {
  if (await hashPdf(pdfBytes(doc.bytes)) !== doc.hash) throw new Error('PDF bytes fail integrity verification');
  // Browser stores also contain UI callbacks, which are not cloneable engine data.
  const { now, seq, cheques, order, alerts, audit, bankLinks, retryQueue, balances, verifications, ext } = state;
  return issueLetter({ now, seq, cheques, order, alerts, audit, bankLinks, retryQueue, balances, verifications, ext }, id, actor, doc);
}
export function downloadPdf(doc: LetterDocument) { const url = URL.createObjectURL(new Blob([new Uint8Array(pdfBytes(doc.bytes)).buffer], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = url; a.download = `${doc.id}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
