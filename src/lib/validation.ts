import { z } from "zod";

/** Shared password policy: 8+ chars with at least one letter and number. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password is too long.")
  .regex(/[a-zA-Z]/, "Password must include a letter.")
  .regex(/[0-9]/, "Password must include a number.");

export const registerSchema = z.object({
  name: z.string().min(2, "Please enter your name."),
  email: z.string().email("Enter a valid email."),
  password: passwordSchema,
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export const prioritySchema = z.enum(["high", "medium", "low"]);

export const goalSchema = z.object({
  name: z.string().min(2, "Give your goal a name."),
  category: z.string().min(1),
  targetAmount: z.coerce
    .number()
    .positive("Target must be greater than zero.")
    .max(1_000_000),
  color: z.string().optional(),
  priority: prioritySchema.optional(),
  allocationPct: z.coerce.number().min(0).max(100).optional(),
  targetDate: z.coerce.date().optional().nullable(),
});

export const goalUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  targetAmount: z.coerce.number().positive().max(1_000_000).optional(),
  priority: prioritySchema.optional(),
  targetDate: z.coerce.date().optional().nullable(),
  status: z.enum(["active", "paused", "archived"]).optional(),
});

export const allocationUpdateSchema = z.object({
  allocations: z
    .array(z.object({ goalId: z.string().min(1), pct: z.coerce.number().min(0).max(100) }))
    .min(1),
});

export const onboardingSchema = z.object({
  savingsRate: z.coerce.number().min(0.05).max(0.9),
  goals: z
    .array(
      z.object({
        name: z.string().min(2),
        category: z.string().min(1),
        targetAmount: z.coerce.number().positive().max(1_000_000),
        targetDate: z.coerce.date().optional().nullable(),
        priority: prioritySchema,
        allocationPct: z.coerce.number().min(0).max(100),
      }),
    )
    .max(8),
});

export const profileSchema = z.object({
  name: z.string().min(2, "Please enter your name.").max(80),
});

export const remittanceSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Amount must be greater than zero.")
    .max(1_000_000),
  sender: z.string().optional(),
  memo: z.string().max(120).optional(),
});

export const contributeSchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
});

export const savingsRateSchema = z.object({
  rate: z.coerce.number().min(0.05).max(0.9),
});

export const importWalletSchema = z.object({
  secret: z.string().min(50, "Enter a valid Stellar secret key."),
});

export const withdrawalCreateSchema = z.object({
  amountUsdc: z.coerce.number().positive("Amount must be greater than zero.").max(50_000),
  railCode: z.string().min(3).max(40),
  accountName: z
    .string()
    .trim()
    .min(2, "Enter the account holder's full name.")
    .max(80)
    .regex(/^[\p{L}\p{M} .,'-]+$/u, "Account name contains unsupported characters."),
  accountNumber: z.string().trim().min(6, "Enter the account number.").max(24),
});

export const depositCreateSchema = z.object({
  amountFiat: z.coerce.number().positive("Amount must be greater than zero.").max(1_000_000),
  fiatCurrency: z.string().length(3),
  senderName: z.string().trim().max(80).optional(),
});

// --- QR payments -----------------------------------------------------------

/** Raw scanned string. Length-capped before any parsing work happens. */
export const qrResolveSchema = z.object({
  payload: z.string().trim().min(1, "Nothing to scan.").max(2048),
});

export const paymentRequestCreateSchema = z.object({
  /**
   * Omit for an "open" request the payer fills in. The bound here is a shape
   * guard only — the real limit lives in lib/payments/fees.ts so the caller
   * gets a specific `amount_too_large` code instead of a schema error.
   */
  amount: z.coerce
    .number()
    .positive("Amount must be greater than zero.")
    .max(1_000_000)
    .optional(),
  note: z.string().trim().max(80).optional(),
  /** 5 minutes … 24 hours. */
  expiresInMinutes: z.coerce.number().int().min(5).max(1440).optional(),
  singleUse: z.boolean().optional(),
});

export const transferCreateSchema = z.object({
  /** Server-signed resolution from /api/payments/qr/resolve. */
  intentToken: z.string().min(16).max(2048),
  /** Only honoured when the request left the amount open. Business limits are
   *  enforced downstream so over-limit amounts get a specific error code. */
  amount: z.coerce.number().positive().max(1_000_000).optional(),
  note: z.string().trim().max(80).optional(),
  /** Client-generated per confirmation — makes retries safe. */
  idempotencyKey: z
    .string()
    .trim()
    .min(8, "Missing idempotency key.")
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid idempotency key."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type RemittanceInput = z.infer<typeof remittanceSchema>;
