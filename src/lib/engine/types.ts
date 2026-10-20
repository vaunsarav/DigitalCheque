export type BankId = "ENBD" | "ADCB" | "FAB" | "MASHREQ" | "RAKBANK" | "DIB";

export interface Bank {
  id: BankId;
  name: string;
  short: string;
  swift: string;
  hue: number;
}

export type Status =
  | "requested"
  | "authorized"
  | "issued"
  | "delivered"
  | "verified"
  | "deposited"
  | "accepted"
  | "presented"
  | "paid"
  | "settled"
  | "credited"
  | "returned"
  | "rejected"
  | "stopped"
  | "cancelled"
  | "replaced"
  | "released";

export type Actor = "customer" | "beneficiary" | "issuing_bank" | "payee_bank" | "edc" | "clearing" | "cbuae" | "system";

export interface ChequeEvent {
  status: Status | "note";
  label: string;
  at: number;
  actor: Actor;
  detail?: string | undefined;
}

export interface Cheque {
  ndci: string;
  requestId: string;
  chequeNo: string;
  issuingBank: BankId;
  payeeBank: BankId;
  drawer: string;
  drawerId: string;
  drawerAcct: string;
  beneficiary: string;
  beneficiaryId: string;
  beneficiaryAcct: string;
  amount: number;
  currency: "AED";
  issueDate: number;
  payableDate: number;
  purpose: string;
  remarks?: string | undefined;
  status: Status;
  version: number;
  createdAt: number;
  updatedAt: number;
  docRef?: string | undefined;
  hash?: string | undefined;
  certId?: string | undefined;
  qrToken?: string | undefined;
  clearingRef?: string | undefined;
  settlementRef?: string | undefined;
  returnReason?: string | undefined;
  presentCount: number;
  tamperedAmount?: number | undefined;
  settlementException?: boolean | undefined;
  saved?: boolean | undefined;
  /** PRD extensions */
  purposeCategory?: PurposeCategory | undefined;
  classification?: "payment" | "security" | undefined;
  obligationId?: string | undefined;
  reservationId?: string | undefined;
  signingSessionId?: string | undefined;
  depositRef?: string | undefined;
  replaces?: string | undefined;
  supersededBy?: string | undefined;
  makerChecker?: { maker: string; checker?: string | undefined; pending: boolean } | undefined;
  events: ChequeEvent[];
}

export type AlertKind =
  | "duplicate_presentment"
  | "high_value"
  | "failed_auth"
  | "abnormal_returns"
  | "processing_delay"
  | "certificate"
  | "tampered"
  | "integration"
  | "settlement";

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: "low" | "medium" | "high" | "critical";
  ndci?: string | undefined;
  bank?: BankId | undefined;
  message: string;
  at: number;
  resolved?: boolean | undefined;
}

export interface AuditEvent {
  id: string;
  at: number;
  actor: Actor;
  action: string;
  ndci?: string | undefined;
  bank?: BankId | undefined;
  institution?: string | undefined;
  reason?: string | undefined;
  correlation?: string | undefined;
  evidence?: string | undefined;
}

export interface RetryJob {
  id: string;
  ndci: string;
  action: "authorize";
  attempts: number;
  lastError: string;
  createdAt: number;
}

export interface EngineState {
  now: number;
  seq: number;
  cheques: Record<string, Cheque>;
  order: string[]; // newest first
  alerts: Alert[];
  audit: AuditEvent[];
  bankLinks: Record<BankId, "up" | "down">;
  retryQueue: RetryJob[];
  balances: Record<string, number>;
  verifications: number;
  ext: ExtState;
}

export type VerifyResult =
  | "genuine"
  | "tampered"
  | "revoked"
  | "presented"
  | "settled"
  | "returned"
  | "not_found";

// ---------------- PRD v8 extensions ----------------
export type PurposeCategory = "rent" | "supplier" | "milestone" | "loan" | "refund" | "security" | "other";

export interface ChequeEntitlement {
  id: string;
  customerId: string;
  bank: BankId;
  allocated: number;
  consumed: number;
  suspended: boolean;
  expired: boolean;
  pendingVerification: boolean;
  lastConfirmedAt: number;
  additionalRequested: number;
}
export interface EntitlementReservation {
  id: string;
  entitlementId: string;
  customerId: string;
  requestKey: string;
  ndci?: string | undefined;
  status: "reserved" | "consumed" | "released";
  at: number;
}
export interface LinkedObligation {
  id: string;
  ref: string;
  kind: string;
  counterparty: string;
  startDate: number;
  completionDate?: number | undefined;
  status: "active" | "completion_claimed" | "completed" | "disputed";
  securityAmount?: number | undefined;
  closureParty: string;
  evidence?: string | undefined;
}
export interface SigningSession {
  id: string;
  customerId: string;
  signatory: string;
  authorityRef: string;
  authMethod: "face_id" | "otp";
  signMethod: "uae_pass" | "provider";
  providerRef: string;
  docVersion: number;
  hash: string;
  consentAt: number;
  result: "signed" | "failed";
  evidence: string;
}
export interface DeliveryAck {
  id: string;
  ndci: string;
  party: "issuer" | "beneficiary";
  customerId: string;
  event: "delivered" | "opened" | "downloaded" | "printed";
  docVersion: number;
  hash: string;
  at: number;
}
export interface CustomerMandate {
  id: string;
  customerId: string;
  scope: "cheque" | "standing";
  ndci?: string | undefined;
  acct: string;
  maxAmount: number;
  schedule: "maturity" | "date";
  executeOn?: number | undefined;
  status: "active" | "paused" | "revoked";
  consentAt: number;
}
export interface AutoDepositExecution {
  id: string;
  mandateId: string;
  ndci: string;
  status: "scheduled" | "paused" | "submitted" | "failed" | "revoked";
  reason?: string | undefined;
  depositRef?: string | undefined;
  attempts: number;
  at: number;
}
export type ServiceType = "stop" | "cancel" | "amend" | "replace" | "security_release" | "acknowledge" | "objection";
export interface CounterpartyResponse { by: string; decision: "accept" | "reject" | "query" | "answer"; note: string; at: number }
export interface ApprovalDecision { by: string; institution: string; approve: boolean; reason: string; at: number; correlation: string }
export interface ServiceRequest {
  id: string;
  type: ServiceType;
  ndci: string;
  initiatorId: string;
  initiatorRole: "issuer" | "beneficiary";
  reason: string;
  evidence?: string | undefined;
  proposed?: { amount?: number | undefined; payableDate?: number | undefined } | undefined;
  status: "awaiting_counterparty" | "queried" | "awaiting_bank" | "approved" | "rejected" | "completed" | "expired";
  responses: CounterpartyResponse[];
  decisions: ApprovalDecision[];
  replacementNdci?: string | undefined;
  correlation: string;
  createdAt: number;
  expiresAt: number;
}
export interface ApprovalRule {
  label: string;
  initiators: ("issuer" | "beneficiary")[];
  counterpartyConsent: boolean;
  bank: "issuing" | "payee" | "none";
  eligible: Status[];
  evidence: string;
  expiryDays: number;
  securityOnly?: boolean | undefined;
}
export interface ReleaseEvidence { id: string; ndci: string; obligationId?: string | undefined; outcome: string; by: string; at: number; ref: string }
export interface AgentRecommendation {
  id: string;
  scope: "customer" | "edc";
  customerId?: string | undefined;
  trigger: string;
  records: string[];
  findings: string[];
  references: string[];
  recommendation: string;
  cls: "A" | "B" | "C";
  approvalRequired: boolean;
  action?: { kind: "draft_release" | "draft_entitlement" | "draft_auto_deposit" | "draft_reminder"; ndci?: string | undefined } | undefined;
  status: "open" | "approved" | "dismissed";
  result?: string | undefined;
  auditRef?: string | undefined;
  at: number;
}
export interface CommercialAssumptions {
  banks: number;
  monthlyInstruments: number;
  adoptionPct: number;
  onboardingFee: number;
  subscriptionPerBankMonth: number;
  perInstrumentFee: number;
  aiPackagePerBankMonth: number;
  fixedOpexMonth: number;
  variableCostPerInstrument: number;
}
export interface Notice { id: string; to: string; text: string; at: number; ndci?: string | undefined }
export interface ExtState {
  letters?: import('./letters').LettersState;
  entitlements: Record<string, ChequeEntitlement>;
  reservations: EntitlementReservation[];
  obligations: Record<string, LinkedObligation>;
  signing: Record<string, SigningSession>;
  copies: DeliveryAck[];
  mandates: CustomerMandate[];
  autoRuns: AutoDepositExecution[];
  requests: ServiceRequest[];
  matrix: Record<ServiceType, ApprovalRule>;
  releases: ReleaseEvidence[];
  agent: AgentRecommendation[];
  commercial: CommercialAssumptions;
  notices: Notice[];
}
