// ─── Broker Account ───────────────────────────────────────────────────────────

export type BrokerAccountStatus =
  | "NOT_CREATED"
  | "SUBMITTED"
  | "SUBMISSION_FAILED"
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "ACTIVE"
  | "REJECTED"
  | "DISABLED"
  | "ACTION_REQUIRED"
  | "ACCOUNT_CLOSED";

export interface BrokerAccount {
  alpacaAccountId: string | null;
  status: BrokerAccountStatus;
  currency?: string;
  created_at?: string;
}

export interface BrokerTradingAccount {
  buying_power: string;
  equity: string;
  cash: string;
  long_market_value: string;
  short_market_value: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  daytrade_count: number;
}

// ─── ACH ──────────────────────────────────────────────────────────────────────

export type ACHBankAccountType = "CHECKING" | "SAVINGS";
export type ACHRelationshipStatus = "QUEUED" | "APPROVED" | "PENDING" | "CANCELED";

export interface ACHRelationship {
  id: string;
  account_id: string;
  created_at: string;
  updated_at: string;
  status: ACHRelationshipStatus;
  account_owner_name: string;
  bank_account_type: ACHBankAccountType;
  bank_account_number: string; // masked
  bank_routing_number: string;
  nickname: string | null;
}

export interface CreateACHRelationshipRequest {
  account_owner_name: string;
  bank_account_type: ACHBankAccountType;
  bank_account_number: string;
  bank_routing_number: string;
  nickname?: string;
}

// ─── Transfers ────────────────────────────────────────────────────────────────

export type TransferDirection = "INCOMING" | "OUTGOING";
export type TransferStatus =
  | "QUEUED"
  | "PENDING"
  | "SENT_TO_CLEARING"
  | "REJECTED"
  | "CANCELED"
  | "APPROVED"
  | "COMPLETE"
  | "RETURNED"
  | "FAILED";

export interface Transfer {
  id: string;
  account_id: string;
  created_at: string;
  updated_at: string;
  status: TransferStatus;
  direction: TransferDirection;
  amount: string;
  type: string;
  relationship_id: string | null;
}

export interface CreateTransferRequest {
  transfer_type: "ach";
  relationship_id: string;
  amount: string;
  direction: TransferDirection;
  timing?: "immediate";
}

// ─── KYC Onboarding Form ──────────────────────────────────────────────────────

export interface KYCFormData {
  // Step 1 — Identity
  given_name: string;
  middle_name: string;
  family_name: string;
  date_of_birth: string; // YYYY-MM-DD
  tax_id: string;        // SSN: XXX-XX-XXXX
  tax_id_type: string;
  country_of_citizenship: string;
  country_of_birth: string;
  country_of_tax_residence: string;
  funding_source: string[];

  // Step 2 — Contact
  email_address: string;
  phone_number: string;
  street_address: string;
  unit: string;
  city: string;
  state: string;
  postal_code: string;

  // Step 3 — Disclosures
  is_control_person: boolean;
  is_affiliated_exchange_or_finra: boolean;
  is_politically_exposed: boolean;
  immediate_family_exposed: boolean;

  // Step 4 — Agreements (captured at submit time)
  customer_agreement: boolean;
  account_agreement: boolean;
}
