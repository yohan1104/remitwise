import "server-only";
import { prisma } from "@/lib/prisma";
import { goalMeta } from "@/lib/constants";

export async function createGoal(input: {
  userId: string;
  name: string;
  category: string;
  targetAmount: number;
  color?: string;
  priority?: string;
  allocationPct?: number;
  targetDate?: Date | null;
}) {
  const meta = goalMeta(input.category);
  return prisma.goal.create({
    data: {
      userId: input.userId,
      name: input.name.trim(),
      category: input.category,
      targetAmount: Math.round(input.targetAmount * 100) / 100,
      color: input.color || meta.color,
      priority: input.priority ?? "medium",
      allocationPct: input.allocationPct ?? 0,
      targetDate: input.targetDate ?? null,
    },
  });
}

export async function updateGoal(
  userId: string,
  goalId: string,
  data: {
    name?: string;
    targetAmount?: number;
    priority?: string;
    targetDate?: Date | null;
    status?: string;
  },
) {
  // Scoped update — never trust the goal id alone.
  const goal = await prisma.goal.findFirstOrThrow({ where: { id: goalId, userId } });
  return prisma.goal.update({
    where: { id: goal.id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.targetAmount !== undefined && {
        targetAmount: Math.round(data.targetAmount * 100) / 100,
        isCompleted: goal.currentAmount >= data.targetAmount,
      }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.targetDate !== undefined && { targetDate: data.targetDate }),
      ...(data.status !== undefined && { status: data.status }),
    },
  });
}

/** Replace the allocation plan for a user's goals in one transaction. */
export async function updateAllocations(
  userId: string,
  allocations: { goalId: string; pct: number }[],
) {
  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: allocations.map((a) => a.goalId) } },
    select: { id: true },
  });
  const owned = new Set(goals.map((g) => g.id));
  const valid = allocations.filter((a) => owned.has(a.goalId));
  await prisma.$transaction(
    valid.map((a) =>
      prisma.goal.update({
        where: { id: a.goalId },
        data: { allocationPct: Math.round(a.pct * 10) / 10 },
      }),
    ),
  );
}

export async function deleteGoal(userId: string, goalId: string) {
  await prisma.goal.deleteMany({ where: { id: goalId, userId } });
}

export async function listGoals(userId: string) {
  return prisma.goal.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}
