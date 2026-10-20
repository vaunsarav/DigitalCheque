import { useStore } from "./store";

const AR: Record<string, string> = {
  'Liability Letters': 'خطابات الالتزامات',
  'Request Liability Letter': 'طلب خطاب الالتزامات',
  'Liability Letter Reviews': 'مراجعة خطابات الالتزامات',
  'Submit request': 'إرسال الطلب',
  "Home": "الرئيسية",
  "CBUAE Regulator": "المصرف المركزي",
  "EDC Custodian": "أمين الشيكات EDC",
  "Bank Portal": "بوابة البنوك",
  "Customer App": "تطبيق العميل",
  "Presenter": "العرض التوضيحي",
  "Demonstration": "عرض توضيحي",
  "Proposed future-state proof of concept — not a live or approved CBUAE service. All data is synthetic.": "نموذج مقترح للمستقبل — ليس خدمة معتمدة من المصرف المركزي. جميع البيانات تجريبية.",
  "Live events": "الأحداث المباشرة",
  "Reset demo": "إعادة الضبط",
  "National Overview": "النظرة الوطنية",
  "Issue Digital Cheque": "إصدار شيك رقمي",
  "Received": "المستلمة",
  "Vault": "الخزنة",
  "Activity": "النشاط",
  "Verify": "تحقق",
  "Deposit": "إيداع",
};

export function useT() {
  const lang = useStore((s) => s.lang);
  return (k: string) => (lang === "ar" ? AR[k] ?? k : k);
}
