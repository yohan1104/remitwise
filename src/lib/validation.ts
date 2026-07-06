import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Please enter your name."),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(6, "Password must be at least 6 characters."),
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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type RemittanceInput = z.infer<typeof remittanceSchema>;
