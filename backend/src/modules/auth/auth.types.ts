import { z } from "zod";

// Letters/digits/underscore only, so a username can never collide with an
// email-shaped string (which always contains "@") — that's what lets the
// login resolver tell the two apart with a single character check.
const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores");

export const registerCustomerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2),
  phone: z.string().optional(),
  username: usernameSchema.optional(),
});
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

export const createUserByAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2),
  phone: z.string().optional(),
  username: usernameSchema.optional(),
  role: z.enum(["admin", "manager", "staff", "supplier", "driver", "customer"]),
  employeeId: z.string().optional(),
  department: z.string().optional(),
  companyName: z.string().optional(),
  vehicleType: z.string().optional(),
  licensePlate: z.string().optional(),
});
export type CreateUserByAdminInput = z.infer<typeof createUserByAdminSchema>;

export const setUserStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

export const updateMyProfileSchema = z.object({
  displayName: z.string().min(2).optional(),
  phone: z.string().optional(),
  username: usernameSchema.optional(),
  email: z.string().email().optional(),
});
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;

export const updateUserByAdminSchema = z.object({
  displayName: z.string().min(2).optional(),
  phone: z.string().optional(),
  username: usernameSchema.optional(),
  employeeId: z.string().optional(),
  department: z.string().optional(),
  companyName: z.string().optional(),
  vehicleType: z.string().optional(),
  licensePlate: z.string().optional(),
});
export type UpdateUserByAdminInput = z.infer<typeof updateUserByAdminSchema>;

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(8),
});
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;
