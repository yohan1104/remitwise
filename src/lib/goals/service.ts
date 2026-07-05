import "server-only";
import { prisma } from "@/lib/prisma";
import { goalMeta } from "@/lib/constants";

export async function createGoal(input: {
  userId: string;
  name: string;
  category: string;
  targetAmount: number;
  color?: string;
}) {
  const meta = goalMeta(input.category);
  return prisma.goal.create({
    data: {
      userId: input.userId,
      name: input.name.trim(),
      category: input.category,
      targetAmount: Math.round(input.targetAmount * 100) / 100,
      color: input.color || meta.color,
    },
  });
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
