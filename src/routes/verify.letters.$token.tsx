import { createFileRoute } from '@tanstack/react-router';
import { useStore } from '@/lib/store';
import { verifyLetter } from '@/lib/engine/letters';
import { PageHeader, Pill } from '@/components/dc/ui';

export const Route = createFileRoute('/verify/letters/$token')({
  head: () => ({ meta: [
    { title: 'Demonstration Liability Letter Verification — EDC' },
    { name: 'description', content: 'Privacy-limited integrity and lifecycle verification of synthetic demonstration liability letters.' },
    { property: 'og:title', content: 'EDC Demonstration Letter Verification' },
    { property: 'og:description', content: 'Verify demonstration document status without exposing customer or financial information.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: LetterVerification,
});
function LetterVerification() {
  const { token } = Route.useParams(); const state = useStore(); const result = verifyLetter(state, token);
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-10"><PageHeader eyebrow="EDC · Demonstration registry" title="Liability Letter Verification" /><Pill tone={result.status === 'Valid' ? 'success' : 'warning'}>{result.status}</Pill>{'reference' in result && <dl className="grid gap-3 border-y py-5 text-sm"><div><dt className="text-muted-foreground">Letter reference</dt><dd>{result.reference}</dd></div><div><dt className="text-muted-foreground">Document version</dt><dd>{result.version}</dd></div><div><dt className="text-muted-foreground">Issue date</dt><dd>{new Date(result.issueDate ?? 0).toISOString()}</dd></div><div><dt className="text-muted-foreground">Demonstration issuer</dt><dd>{result.issuer}</dd></div><div><dt className="text-muted-foreground">Document integrity · SHA-256</dt><dd className="break-all font-mono text-xs">{result.integrity?.hash}</dd></div></dl>}<p className="text-xs text-muted-foreground">Synthetic demonstration only. This client-only registry is available in the originating browser, not a production public verification service. No customer identity, accounts, instruments or financial amounts are returned by verification. Document download remains separate in the simulated customer area.</p></main>;
}