"use client";

import { create } from "zustand";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  BrokerAccount,
  BrokerAccountStatus,
  BrokerTradingAccount,
  ACHRelationship,
  CreateACHRelationshipRequest,
  Transfer,
  CreateTransferRequest,
  KYCFormData,
} from "@/types/broker";
import type { AlpacaOrder, AlpacaPosition, PlaceOrderRequest } from "@/types/market";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function brokerFetch<T>(
  path: string,
  uid: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": uid,
      ...(init?.headers ?? {}),
    },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(body.detail ?? `HTTP ${resp.status}`);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

const ACTIVE_STATUSES: BrokerAccountStatus[] = ["ACTIVE", "APPROVED"];

interface BrokerState {
  // ─── Account
  account: BrokerAccount | null;
  tradingAccount: BrokerTradingAccount | null;

  // ─── Trading data
  positions: AlpacaPosition[];
  orders: AlpacaOrder[];

  // ─── Funding
  achRelationships: ACHRelationship[];
  transfers: Transfer[];

  // ─── UI state
  loading: boolean;
  error: string | null;

  // ─── Computed
  isActive: boolean;
  accountId: string | null;

  // ─── Actions
  loadFromFirestore: (uid: string) => Promise<void>;
  createAccount: (uid: string, formData: KYCFormData) => Promise<BrokerAccount>;
  fetchAccountStatus: (uid: string) => Promise<BrokerAccountStatus>;
  fetchTradingAccount: (uid: string) => Promise<void>;
  fetchPositions: (uid: string) => Promise<void>;
  fetchOrders: (uid: string) => Promise<void>;
  createACHRelationship: (uid: string, req: CreateACHRelationshipRequest) => Promise<ACHRelationship>;
  deleteACHRelationship: (uid: string, relationshipId: string) => Promise<void>;
  fetchACHRelationships: (uid: string) => Promise<void>;
  createTransfer: (uid: string, req: CreateTransferRequest) => Promise<Transfer>;
  fetchTransfers: (uid: string) => Promise<void>;
  placeOrder: (uid: string, req: PlaceOrderRequest) => Promise<AlpacaOrder>;
  cancelOrder: (uid: string, orderId: string) => Promise<void>;
  refresh: (uid: string) => Promise<void>;
  clearError: () => void;
}

export const useBrokerStore = create<BrokerState>((set, get) => ({
  account: null,
  tradingAccount: null,
  positions: [],
  orders: [],
  achRelationships: [],
  transfers: [],
  loading: false,
  error: null,

  get isActive() {
    const a = get().account;
    return a != null && ACTIVE_STATUSES.includes(a.status as BrokerAccountStatus);
  },

  get accountId() {
    return get().account?.alpacaAccountId ?? null;
  },

  // ─── Load existing account from Firestore (on login) ─────────────────────
  loadFromFirestore: async (uid) => {
    try {
      const snap = await getDoc(doc(db, "users", uid, "broker", "account"));
      if (snap.exists()) {
        const data = snap.data() as { alpacaAccountId?: string; status?: string };
        if (data.alpacaAccountId) {
          set({
            account: {
              alpacaAccountId: data.alpacaAccountId,
              status: (data.status ?? "SUBMITTED") as BrokerAccountStatus,
            },
          });
        }
      }
    } catch {
      // Non-fatal: user may not have a broker account yet
    }
  },

  // ─── KYC account creation ─────────────────────────────────────────────────
  createAccount: async (uid, formData) => {
    set({ loading: true, error: null });
    try {
      const now = new Date().toISOString();
      // Get client IP (best-effort; backend can also record this)
      let ipAddress = "0.0.0.0";
      try {
        const ipResp = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipResp.json();
        ipAddress = ipData.ip ?? "0.0.0.0";
      } catch {
        // fallback to 0.0.0.0
      }

      const streetAddress = [formData.street_address];
      if (formData.unit) streetAddress.push(formData.unit);

      const payload = {
        identity: {
          given_name: formData.given_name,
          middle_name: formData.middle_name || undefined,
          family_name: formData.family_name,
          date_of_birth: formData.date_of_birth,
          tax_id: formData.tax_id.replace(/-/g, ""),
          tax_id_type: formData.tax_id_type,
          country_of_citizenship: formData.country_of_citizenship,
          country_of_birth: formData.country_of_birth,
          country_of_tax_residence: formData.country_of_tax_residence,
          funding_source: formData.funding_source,
        },
        contact: {
          email_address: formData.email_address,
          phone_number: formData.phone_number,
          street_address: streetAddress,
          city: formData.city,
          state: formData.state,
          postal_code: formData.postal_code,
          country: "USA",
        },
        disclosures: {
          is_control_person: formData.is_control_person,
          is_affiliated_exchange_or_finra: formData.is_affiliated_exchange_or_finra,
          is_politically_exposed: formData.is_politically_exposed,
          immediate_family_exposed: formData.immediate_family_exposed,
        },
        agreements: [
          {
            agreement: "customer_agreement",
            signed_at: now,
            ip_address: ipAddress,
          },
          {
            agreement: "account_agreement",
            signed_at: now,
            ip_address: ipAddress,
          },
        ],
      };

      const result = await brokerFetch<{ alpacaAccountId: string; status: string }>(
        "/api/v1/broker/accounts",
        uid,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      const account: BrokerAccount = {
        alpacaAccountId: result.alpacaAccountId,
        status: result.status as BrokerAccountStatus,
      };
      set({ account, loading: false });
      return account;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  // ─── Poll account status ──────────────────────────────────────────────────
  fetchAccountStatus: async (uid) => {
    try {
      const result = await brokerFetch<BrokerAccount>(
        `/api/v1/broker/accounts/${uid}`,
        uid,
      );
      set({ account: result });
      return result.status;
    } catch (e) {
      set({ error: (e as Error).message });
      return get().account?.status ?? "SUBMITTED";
    }
  },

  // ─── Trading account (buying power etc.) ──────────────────────────────────
  fetchTradingAccount: async (uid) => {
    try {
      const data = await brokerFetch<BrokerTradingAccount>(
        `/api/v1/broker/accounts/${uid}/trading`,
        uid,
      );
      set({ tradingAccount: data });
    } catch {
      // silently ignore background refresh failures
    }
  },

  // ─── Positions + orders ───────────────────────────────────────────────────
  fetchPositions: async (uid) => {
    try {
      const positions = await brokerFetch<AlpacaPosition[]>(
        `/api/v1/broker/accounts/${uid}/positions`,
        uid,
      );
      set({ positions });
    } catch {
      // silently ignore
    }
  },

  fetchOrders: async (uid) => {
    try {
      const orders = await brokerFetch<AlpacaOrder[]>(
        `/api/v1/broker/accounts/${uid}/orders`,
        uid,
      );
      set({ orders });
    } catch {
      // silently ignore
    }
  },

  // ─── ACH ──────────────────────────────────────────────────────────────────
  fetchACHRelationships: async (uid) => {
    try {
      const rels = await brokerFetch<ACHRelationship[]>(
        `/api/v1/broker/accounts/${uid}/ach`,
        uid,
      );
      set({ achRelationships: rels });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  createACHRelationship: async (uid, req) => {
    set({ loading: true, error: null });
    try {
      const rel = await brokerFetch<ACHRelationship>(
        `/api/v1/broker/accounts/${uid}/ach`,
        uid,
        { method: "POST", body: JSON.stringify(req) },
      );
      set((s) => ({ achRelationships: [...s.achRelationships, rel], loading: false }));
      return rel;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  deleteACHRelationship: async (uid, relationshipId) => {
    set({ loading: true, error: null });
    try {
      await brokerFetch<void>(
        `/api/v1/broker/accounts/${uid}/ach/${relationshipId}`,
        uid,
        { method: "DELETE" },
      );
      set((s) => ({
        achRelationships: s.achRelationships.filter((r) => r.id !== relationshipId),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  // ─── Transfers ────────────────────────────────────────────────────────────
  fetchTransfers: async (uid) => {
    try {
      const transfers = await brokerFetch<Transfer[]>(
        `/api/v1/broker/accounts/${uid}/transfers`,
        uid,
      );
      set({ transfers });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  createTransfer: async (uid, req) => {
    set({ loading: true, error: null });
    try {
      const transfer = await brokerFetch<Transfer>(
        `/api/v1/broker/accounts/${uid}/transfers`,
        uid,
        { method: "POST", body: JSON.stringify(req) },
      );
      set((s) => ({ transfers: [transfer, ...s.transfers], loading: false }));
      return transfer;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  // ─── Orders ───────────────────────────────────────────────────────────────
  placeOrder: async (uid, req) => {
    const order = await brokerFetch<AlpacaOrder>(
      `/api/v1/broker/accounts/${uid}/orders`,
      uid,
      { method: "POST", body: JSON.stringify(req) },
    );
    void get().fetchOrders(uid);
    void get().fetchTradingAccount(uid);
    return order;
  },

  cancelOrder: async (uid, orderId) => {
    await brokerFetch<void>(
      `/api/v1/broker/accounts/${uid}/orders/${orderId}`,
      uid,
      { method: "DELETE" },
    );
    void get().fetchOrders(uid);
  },

  // ─── Refresh all ──────────────────────────────────────────────────────────
  refresh: async (uid) => {
    await Promise.all([
      get().fetchTradingAccount(uid),
      get().fetchPositions(uid),
      get().fetchOrders(uid),
      get().fetchACHRelationships(uid),
      get().fetchTransfers(uid),
    ]);
  },

  clearError: () => set({ error: null }),
}));
