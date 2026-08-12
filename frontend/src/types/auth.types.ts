import type { Address } from "./delivery.types";

interface FirestoreTimestampLike {
  _seconds: number;
  _nanoseconds: number;
}

export type UserRole = "admin" | "manager" | "staff" | "customer" | "supplier" | "driver";

export interface UserDoc {
  uid: string;
  email: string;
  username: string | null;
  displayName: string;
  phone: string | null;
  role: UserRole;
  status: "active" | "suspended";
  photoURL?: string;
  attendanceMethod?: "face" | "manual";
  mfaEnabled?: boolean;
  createdAt: FirestoreTimestampLike;
  updatedAt: FirestoreTimestampLike;
}

export interface CustomerProfile {
  uid: string;
  walletBalance: number;
  loyaltyPoints: number;
  addresses: Address[];
  defaultAddressIndex: number;
  creditLimit: number;
  outstandingLoanBalance: number;
}

export interface SupplierProfile {
  uid: string;
  companyName: string;
  taxId: string | null;
  categoriesSupplied: string[];
  rating: number | null;
  bankDetails: { bankName: string; accountNumber: string } | null;
}

export interface DriverProfile {
  uid: string;
  vehicleType: string;
  licensePlate: string;
  status: "available" | "on_delivery" | "offline";
  currentLocation?: { lat: number; lng: number; updatedAt: FirestoreTimestampLike };
}

export interface StaffProfile {
  uid: string;
  employeeId: string;
  department: string | null;
}

export type RoleProfile = CustomerProfile | SupplierProfile | DriverProfile | StaffProfile | null;

export interface UserProfile extends UserDoc {
  profile: RoleProfile;
}

export const ROLE_HOME_ROUTE: Record<UserRole, string> = {
  admin: "/app/dashboard",
  manager: "/app/dashboard",
  staff: "/app/dashboard",
  customer: "/portal/dashboard",
  supplier: "/supplier/dashboard",
  driver: "/driver/active",
};

export const ROLE_ACCOUNT_SETTINGS_ROUTE: Record<UserRole, string> = {
  admin: "/app/account/settings",
  manager: "/app/account/settings",
  staff: "/app/account/settings",
  customer: "/portal/account/settings",
  supplier: "/supplier/account/settings",
  driver: "/driver/account/settings",
};
