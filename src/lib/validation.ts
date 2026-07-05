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

export const goalSchema = z.object({
  name: z.string().min(2, "Give your goal a name."),
  category: z.string().min(1),
  targetAmount: z.coerce
    .number()
    .positive("Target must be greater than zero.")
    .max(1_000_000),
  color: z.string().optional(),
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
