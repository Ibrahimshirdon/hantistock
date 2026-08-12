import type { Timestamp } from "firebase-admin/firestore";
import type { UserRole } from "./auth.types.js";

export interface UserDoc {
  uid: string;
  email: string;
  username: string | null;
  displayName: string;
  phone: string | null;
  role: UserRole;
  status: "active" | "suspended";
  photoURL?: string;
  // Admin-set restriction on how this staff member is allowed to check
  // in/out for attendance. Undefined means unrestricted (both the manual
  // button and the face kiosk work) — this is an opt-in restriction, not a
  // default lockout.
  attendanceMethod?: "face" | "manual";
  // Whether this user has enrolled a WebAuthn device (fingerprint/Face
  // unlock) as a required second login factor. Undefined/false means no
  // second factor is required yet — set true only once a credential is
  // successfully registered, so enrollment can never leave the account
  // locked out mid-setup.
  mfaEnabled?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Address {
  label: string;
  line1: string;
  line2?: string;
  city: string;
  geo?: { lat: number; lng: number };
}

export interface CustomerProfile {
  uid: string;
  walletBalance: number;
  loyaltyPoints: number;
  addresses: Address[];
  defaultAddressIndex: number;
  // Admin/manager-set ceiling on how much credit this customer can carry at
  // once — defaults to 0, meaning no loan access until explicitly granted.
  creditLimit: number;
  // Sum of every outstanding (not-yet-repaid) loan's balanceRemaining —
  // denormalized here for an O(1) credit check at checkout, same reasoning
  // as walletBalance being denormalized rather than summed from a ledger.
  outstandingLoanBalance: number;
}

export interface WalletTransaction {
  id: string;
  customerId: string;
  type: "credit" | "debit";
  amount: number;
  reason: "top_up" | "purchase" | "refund" | "adjustment" | "loan_repayment";
  relatedOrderId: string | null;
  balanceAfter: number;
  // Who actually performed this transaction — set for admin/manager-driven
  // top-ups and adjustments; null for system-driven ones (e.g. a purchase
  // deduction at checkout has no human "performer").
  performedBy: string | null;
  performedByName: string | null;
  createdAt: Timestamp;
}

export interface SupplierProfile {
  uid: string;
  companyName: string;
  taxId: string | null;
  categoriesSupplied: string[];
  bankDetails: { bankName: string; accountNumber: string } | null;
  rating: number | null;
}

export interface DriverProfile {
  uid: string;
  vehicleType: string;
  licensePlate: string;
  status: "available" | "on_delivery" | "offline";
  currentLocation?: { lat: number; lng: number; updatedAt: Timestamp };
}

export interface StaffProfile {
  uid: string;
  employeeId: string;
  department: string | null;
}
