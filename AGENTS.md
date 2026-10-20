<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Digital cheque prototype
- All business rules live in the pure engine `src/lib/engine/engine.ts` (every state change goes through it and writes an audit event); UI never mutates cheque state directly. Why: one testable source of truth for all four portals.
- Shared state is a zustand store persisted to localStorage (`skipHydration`, rehydrated on client mount) and synced across tabs via the `storage` event. Why: live cross-portal updates without a backend; seed data is deterministic so SSR and client match.
- The browser store initializes and resets with the fresh-customer seed option; scenario tests retain the populated seed. Why: customer accounts start without activity while regulator charts and scenario fixtures remain available.
- tsconfig has `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` off. Why: the engine indexes typed record maps heavily; the strict flags added noise without catching real bugs.
- Portal presentation uses shared AppShell, PageHeader and Panel components with the original horizontal tab layouts; business workflows remain in the existing engine. Why: shared styling keeps all portals consistent without duplicating transaction logic.
- PRD v8 extensions (entitlement, signing, service requests, security release, auto-deposit, AI assistant, liability, commercial) live in `src/lib/engine/ext.ts` over `EngineState.ext`; screens share `src/components/dc/ext.tsx`. Why: keeps the core cheque state machine small while every extension still goes through pure, tested engine functions.
- The AI assistants are rule-based over app records and only prepare drafts; consequential actions need explicit approval. Why: works without a backend and enforces the "AI never signs/releases/moves money" rule in the engine.
- Liability letter rules live in the pure engine `letters.ts` over optional `EngineState.ext.letters`, with browser-safe PDF generation in `letter-pdf.ts` and shared portal screens in `components/dc/letters.tsx`. Why: versioned immutable snapshots and access-scoped actions stay consistent across all portals without introducing a disconnected ledger or backend.
- Liability letters use SHA-256 over final PDF bytes and opaque random verification tokens; verification returns a minimal projection and customer downloads enforce engine scope. Why: preserve verifiable byte integrity and privacy within explicitly simulated client-only access control.
- Liability demonstration fixtures are opt-in presenter engine actions, never part of the fresh-customer initialization. Why: preserve empty customer accounts while providing coherent scenario data in the same registry.
