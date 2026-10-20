const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

export function numberToWords(n: number): string {
  n = Math.floor(n);
  if (n === 0) return "Zero";
  const scales: [number, string][] = [
    [1e9, "Billion"],
    [1e6, "Million"],
    [1e3, "Thousand"],
  ];
  const parts: string[] = [];
  for (const [v, name] of scales) {
    if (n >= v) {
      parts.push(`${below1000(Math.floor(n / v))} ${name}`);
      n %= v;
    }
  }
  if (n > 0) parts.push(below1000(n));
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  const dirhams = Math.floor(amount);
  const fils = Math.round((amount - dirhams) * 100);
  let s = `UAE Dirhams ${numberToWords(dirhams)}`;
  if (fils > 0) s += ` and ${numberToWords(fils)} Fils`;
  return `${s} Only`;
}

export function aed(n: number, compact = false): string {
  if (compact) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `AED ${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `AED ${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `AED ${(n / 1e3).toFixed(1)}K`;
  }
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TZ = "Asia/Dubai";
export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
}
export function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const DAY = 86_400_000;

/** Start of day in Dubai (UTC+4, no DST) */
export function dubaiDay(ms: number): number {
  const off = 4 * 3600_000;
  return Math.floor((ms + off) / DAY) * DAY - off;
}
