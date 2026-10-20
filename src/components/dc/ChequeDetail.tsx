import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useStore } from "@/lib/store";
import { bankById } from "@/lib/engine/engine";
import { aed, fmtDate, fmtDateTime } from "@/lib/engine/format";
import { ChequeVisual, Mono, StatusBadge, Timeline } from "./ui";
import type { ReactNode } from "react";

export function ChequeDetail({ ndci, onClose, actions }: { ndci: string | null; onClose: () => void; actions?: ReactNode }) {
  const c = useStore((s) => (ndci ? s.cheques[ndci] : undefined));
  return (
    <Sheet open={!!ndci} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {c && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Mono className="text-sm">{c.ndci}</Mono> <StatusBadge status={c.status} />
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-8">
              <ChequeVisual c={c} />
              {actions}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border p-4 text-xs">
                {[
                  ["Issuing bank", bankById(c.issuingBank).name],
                  ["Payee bank", bankById(c.payeeBank).name],
                  ["Drawer", c.drawer],
                  ["Beneficiary", c.beneficiary],
                  ["Amount", aed(c.amount)],
                  ["Purpose", c.purpose],
                  ["Issue date", fmtDate(c.issueDate)],
                  ["Payable date", fmtDate(c.payableDate)],
                  ["Request ID", c.requestId],
                  ["Instrument version", `v${c.version}`],
                  ["Created", fmtDateTime(c.createdAt)],
                  ["Vault reference", c.docRef ?? "—"],
                  ["Signing certificate", c.certId ?? "—"],
                  ["Clearing ref", c.clearingRef ?? "—"],
                  ["Settlement ref", c.settlementRef ?? "—"],
                  ["Return reason", c.returnReason ?? "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium break-all">{v}</dd>
                  </div>
                ))}
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Document hash</dt>
                  <dd><Mono className="break-all">{c.hash ?? "—"}</Mono></dd>
                </div>
              </dl>
              <div>
                <h4 className="mb-3 text-sm font-semibold">Lifecycle</h4>
                <Timeline c={c} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
