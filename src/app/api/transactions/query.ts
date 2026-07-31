import { z } from "zod";
import { isMonthKey, monthRange } from "@/lib/export";
import type { ListTransactionsOptions } from "@/lib/dashboard/transactions";

const querySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  /** Comma-separated transaction types. */
  types: z.string().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Shortcut for a whole month: "yyyy-MM" (overrides from/to). */
  month: z.string().refine(isMonthKey, "Invalid month.").optional(),
  q: z.string().max(80).optional(),
});

/** Parse + normalize list/export query params; null on invalid input. */
export function parseListQuery(url: string): ListTransactionsOptions | null {
  const params = Object.fromEntries(new URL(url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return null;
  const { month, types, ...rest } = parsed.data;
  const range = month ? monthRange(month) : {};
  return {
    ...rest,
    ...range,
    types: types ? types.split(",").filter(Boolean) : undefined,
  };
}
