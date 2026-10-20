import { aed, fmtDate, fmtDateTime } from "@/lib/engine/format";
import type { Cheque } from "@/lib/engine/types";
import { BankChip, Mono, Pill, StatusBadge } from "./ui";

export function ChequeTable({ rows, onOpen }: { rows: Cheque[]; onOpen: (n: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">{["NDCI", "Issuing", "Payee", "Drawer", "Beneficiary", "Amount", "Payable", "Status", "Clearing ref", "Last event"].map((h) => <th key={h} className="whitespace-nowrap p-2 text-left font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.ndci} onClick={() => onOpen(c.ndci)} className="cursor-pointer border-b last:border-0 hover:bg-muted/60">
              <td className="p-2"><Mono>{c.ndci}</Mono></td>
              <td className="p-2"><BankChip id={c.issuingBank} /></td>
              <td className="p-2"><BankChip id={c.payeeBank} /></td>
              <td className="max-w-40 truncate p-2">{c.drawer}</td>
              <td className="max-w-40 truncate p-2">{c.beneficiary}</td>
              <td className="whitespace-nowrap p-2 tabular-nums">{aed(c.amount)}</td>
              <td className="whitespace-nowrap p-2">{fmtDate(c.payableDate)}</td>
              <td className="p-2"><StatusBadge status={c.status} />{c.settlementException && <Pill tone="danger" className="ml-1">Exception</Pill>}</td>
              <td className="p-2"><Mono>{c.clearingRef ?? "—"}</Mono></td>
              <td className="whitespace-nowrap p-2 text-xs text-muted-foreground">{fmtDateTime(c.updatedAt)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">No instruments</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
