import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import * as E from "./engine/engine";
import { makeSeed } from "./engine/seed";
import type { BankId, EngineState, VerifyResult, Cheque } from "./engine/types";

export type Lang = "en" | "ar";

interface UiState {
  lang: Lang;
  dark: boolean;
  bank: BankId;
  bankRole: string;
  persona: string;
}

interface Store extends EngineState, UiState {
  setUi: (p: Partial<UiState>) => void;
  reset: () => void;
  run: <T>(fn: (s: EngineState) => { state: EngineState } & T, success?: string) => (T & { ok: true }) | { ok: false; error: string };
  act: (fn: (s: EngineState) => EngineState, success?: string) => boolean;
  createRequest: (i: E.NewChequeInput) => string | null;
  verify: (q: string, actor?: Parameters<typeof E.verify>[2]) => { result: VerifyResult; cheque?: Cheque };
}

function pickEngine(s: Store): EngineState {
  const { now, seq, cheques, order, alerts, audit, bankLinks, retryQueue, balances, verifications, ext } = s;
  return { now, seq, cheques, order, alerts, audit, bankLinks, retryQueue, balances, verifications, ext };
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...makeSeed({ freshCustomers: true }),
      lang: "en",
      dark: false,
      bank: "ENBD",
      bankRole: "Issuance Approver",
      persona: "CUST-AHMED",
      setUi: (p) => set(p),
      reset: () => {
        set({ ...makeSeed({ freshCustomers: true }) });
        toast.success("Demo data reset");
      },
      run: (fn, success) => {
        try {
          const out = fn(pickEngine(get()));
          set(out.state);
          if (success) toast.success(success);
          return { ...out, ok: true } as never;
        } catch (e) {
          const err = e as Error & { state?: EngineState };
          if (err.state) set(err.state);
          toast.error(err.message);
          return { ok: false, error: err.message };
        }
      },
      act: (fn, success) => get().run((s) => ({ state: fn(s) }), success).ok,
      createRequest: (input) => {
        const r = get().run((s) => E.createRequest(s, input), "Digital cheque request submitted");
        return r.ok ? (r as unknown as { ndci: string }).ndci : null;
      },
      verify: (q, actor) => {
        const out = E.verify(pickEngine(get()), q, actor);
        set(out.state);
        return { result: out.result, cheque: out.cheque };
      },
    }),
    {
      name: "edc-dctn-v6",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ ...pickEngine(s), lang: s.lang, dark: s.dark, bank: s.bank, bankRole: s.bankRole, persona: s.persona }),
    },
  ),
);

/** Call once on the client: load saved state and keep tabs in sync */
export function startStoreSync() {
  useStore.persist.rehydrate();
  const onStorage = (e: StorageEvent) => {
    if (e.key === "edc-dctn-v6") useStore.persist.rehydrate();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export const useCheques = () => {
  const order = useStore((s) => s.order);
  const cheques = useStore((s) => s.cheques);
  return order.map((k) => cheques[k]);
};
