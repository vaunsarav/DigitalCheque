import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, Bell, Building2, Landmark, Languages, Moon, Play, RotateCcw, ShieldCheck, Smartphone, Sun, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { fmtDateTime, fmtTime } from "@/lib/engine/format";
import { Mono, Pill } from "./ui";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/cbuae", label: "CBUAE Regulator", icon: Landmark },
  { to: "/edc", label: "EDC Custodian", icon: ShieldCheck },
  { to: "/bank", label: "Bank Portal", icon: Building2 },
  { to: "/mobile", label: "Customer App", icon: Smartphone },
  { to: "/presenter", label: "Presenter", icon: Play },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { lang, dark, setUi, reset, now } = useStore();
  const audit = useStore((s) => s.audit);
  const openAlerts = useStore((s) => s.alerts.filter((a) => !a.resolved).length);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle("dark", dark);
  }, [lang, dark]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-lg font-black text-sidebar-primary-foreground">E</span>
            <span className="hidden leading-tight lg:block">
              <span className="block text-xl font-bold tracking-tight">EDC Digital Cheque</span>
              <span className="block text-xs uppercase tracking-widest opacity-70">Trust Network</span>
            </span>
          </Link>
          <div className="flex-1" />
          <Link to="/presenter" className="-my-2.5 flex items-center gap-3 self-stretch bg-primary px-5 text-base font-semibold text-primary-foreground transition hover:bg-primary/90">
            {t("Presenter")} <Play className="h-4 w-4" />
          </Link>
          <div className="hidden text-right text-xs leading-tight opacity-70 md:block">
            Demo clock (Dubai)
            <div className="font-mono text-sm opacity-100">{fmtDateTime(now)}</div>
          </div>
          <button aria-label="Toggle language" onClick={() => setUi({ lang: lang === "en" ? "ar" : "en" })} className="rounded-xl p-2.5 hover:bg-sidebar-accent">
            <Languages className="h-5 w-5" />
          </button>
          <button aria-label="Toggle dark mode" onClick={() => setUi({ dark: !dark })} className="rounded-xl p-2.5 hover:bg-sidebar-accent">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button aria-label="Live events" onClick={() => setOpen(true)} className="relative rounded-xl p-2.5 hover:bg-sidebar-accent">
            <Bell className="h-5 w-5" />
            {openAlerts > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-sidebar-primary px-1 text-[10px] font-bold text-sidebar-primary-foreground">{openAlerts}</span>}
          </button>
        </div>
        <nav className="mx-auto flex max-w-[1500px] items-center gap-2 overflow-x-auto border-t border-sidebar-border/70 px-4 py-1.5">
          {NAV.filter((n) => n.to !== "/presenter").map((n, i) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold opacity-80 transition hover:bg-sidebar-accent hover:opacity-100 data-[status=active]:bg-sidebar-accent data-[status=active]:opacity-100 data-[status=active]:text-primary"
            >
              <sup className="text-[11px] opacity-60">{String(i + 1).padStart(2, "0")}</sup>
              {t(n.label)}
            </Link>
          ))}
        </nav>
        <div className="bg-orange px-4 py-1.5 text-center text-xs font-medium text-orange-foreground">
          {t("Demonstration")} · {t("Proposed future-state proof of concept — not a live or approved CBUAE service. All data is synthetic.")}
        </div>
      </header>
      <main>{children}</main>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> {t("Live events")}</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 px-4 pb-6">
            <Button variant="outline" size="sm" onClick={reset} className="w-full">
              <RotateCcw className="h-3.5 w-3.5" /> {t("Reset demo")}
            </Button>
            {audit.slice(0, 80).map((a) => (
              <div key={a.id} className="rounded-lg border p-2.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{a.action}</span>
                  <span className="text-muted-foreground">{fmtTime(a.at)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                  <Pill>{a.actor.replace("_", " ")}</Pill>
                  {a.ndci && <Mono>{a.ndci}</Mono>}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
