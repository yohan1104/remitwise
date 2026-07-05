import "server-only";
import { env } from "@/lib/env";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { AiInsight, DashboardData } from "@/lib/types";

/**
 * ---------------------------------------------------------------------------
 *  AI Financial Insights
 * ---------------------------------------------------------------------------
 *  A provider-agnostic service. When AI_API_KEY is set it calls any
 *  OpenAI-compatible chat endpoint; otherwise it returns high-quality,
 *  deterministic mock insights derived from the user's real numbers so the
 *  demo is always populated and never depends on an external API.
 * ---------------------------------------------------------------------------
 */
export async function generateInsights(data: DashboardData): Promise<AiInsight[]> {
  if (env.ai.enabled) {
    try {
      return await generateWithProvider(data);
    } catch (err) {
      console.error("AI provider failed, falling back to mock insights:", err);
    }
  }
  return generateMockInsights(data);
}

// ---------------------------------------------------------------------------
//  Deterministic mock engine
// ---------------------------------------------------------------------------
export function generateMockInsights(data: DashboardData): AiInsight[] {
  const insights: AiInsight[] = [];
  const { totals, goals, transactions, savingsRate } = data;

  const lastRemittance = transactions.find((t) => t.type === "remittance_received");
  const remittanceCount = totals.remittanceCount;
  const avgSavedPerRemittance =
    remittanceCount > 0 ? totals.lifetimeSaved / remittanceCount : 0;

  // 1) Savings from latest remittance
  if (lastRemittance?.savedAmount) {
    insights.push({
      id: "savings-latest",
      kind: "savings",
      title: "Smart save on your latest remittance",
      body: `You automatically saved ${formatCurrency(
        lastRemittance.savedAmount,
      )} (${formatPercent(savingsRate)}) from ${
        lastRemittance.sender ?? "your latest transfer"
      }. That's money working for your future instead of slipping away.`,
      emphasis: formatCurrency(lastRemittance.savedAmount),
    });
  }

  // 2) Closest goal progress
  const activeGoals = goals.filter((g) => !g.isCompleted);
  const closest = [...activeGoals].sort((a, b) => b.progress - a.progress)[0];
  if (closest) {
    const remaining = closest.targetAmount - closest.currentAmount;
    insights.push({
      id: "goal-progress",
      kind: "goal",
      title: `You're ${formatPercent(closest.progress)} to ${closest.name}`,
      body: `Just ${formatCurrency(remaining)} to go on your ${
        closest.name
      }. Every remittance nudges you closer — you've got real momentum here.`,
      emphasis: formatPercent(closest.progress),
    });
  }

  // 3) Forecast to reach the closest goal
  if (closest && avgSavedPerRemittance > 0) {
    const remaining = closest.targetAmount - closest.currentAmount;
    const periods = Math.max(1, Math.ceil(remaining / avgSavedPerRemittance));
    insights.push({
      id: "forecast",
      kind: "forecast",
      title: "Goal forecast",
      body: `At your current pace of ${formatCurrency(
        avgSavedPerRemittance,
      )} saved per remittance, you're on track to fully fund ${
        closest.name
      } in about ${periods} more remittance${periods === 1 ? "" : "s"}.`,
      emphasis: `${periods} remittance${periods === 1 ? "" : "s"}`,
    });
  }

  // 4) Spending observation
  if (remittanceCount >= 2) {
    const spendable = totals.totalRemittances - totals.lifetimeSaved;
    insights.push({
      id: "spending",
      kind: "spending",
      title: "Spending vs. saving balance",
      body: `Of ${formatCurrency(
        totals.totalRemittances,
      )} received, you've kept ${formatCurrency(
        totals.lifetimeSaved,
      )} as savings and ${formatCurrency(
        spendable,
      )} as spendable. A healthy split that keeps daily life comfortable while building security.`,
    });
  }

  // 5) Personalized, actionable advice
  const hasEmergency = goals.some((g) => g.category === "emergency");
  if (!hasEmergency) {
    insights.push({
      id: "advice",
      kind: "advice",
      title: "Build your safety net first",
      body: "You don't have an Emergency Fund yet — 3 to 6 months of expenses is the single biggest boost to financial resilience. Start one and every remittance will help fund it.",
      action: { label: "Create Emergency Fund", kind: "create_emergency", value: 2000 },
    });
  } else if (savingsRate < 0.25) {
    const nextRate = Math.min(0.25, savingsRate + 0.05);
    const extraPerThousand = Math.round((nextRate - savingsRate) * 1000);
    insights.push({
      id: "advice",
      kind: "advice",
      title: `Save ${formatCurrency(extraPerThousand)} more per $1,000`,
      body: `You're auto-saving ${formatPercent(
        savingsRate,
      )}. Raising it to ${formatPercent(
        nextRate,
      )} would meaningfully accelerate every goal — most people don't feel a 5% nudge day to day.`,
      action: { label: `Raise rate to ${formatPercent(nextRate)}`, kind: "raise_rate", value: nextRate },
    });
  } else {
    insights.push({
      id: "advice",
      kind: "advice",
      title: "You're a top-tier saver",
      body: `Saving ${formatPercent(
        savingsRate,
      )} of every remittance puts you ahead of most. Keep it steady and let the vault do the work — consistency is what compounds.`,
    });
  }

  return insights;
}

// ---------------------------------------------------------------------------
//  OpenAI-compatible provider
// ---------------------------------------------------------------------------
async function generateWithProvider(data: DashboardData): Promise<AiInsight[]> {
  const summary = buildSummary(data);
  const res = await fetch(`${env.ai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ai.apiKey}`,
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: env.ai.model,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are RemitWise's financial coach for overseas workers and freelancers. " +
            "Given a JSON snapshot of the user's remittances, savings and goals, return " +
            'JSON of the shape {"insights":[{"kind","title","body","emphasis"}]}. ' +
            "kind must be one of savings|goal|spending|advice|forecast. Keep each body to " +
            "1-2 warm, specific, encouraging sentences that reference the real numbers. Return 5 insights.",
        },
        { role: "user", content: JSON.stringify(summary) },
      ],
    }),
  });

  if (!res.ok) throw new Error(`AI provider responded ${res.status}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as { insights?: Omit<AiInsight, "id">[] };
  const insights = (parsed.insights ?? []).map((ins, i) => ({
    id: `ai-${i}`,
    ...ins,
  }));
  return insights.length > 0 ? insights : generateMockInsights(data);
}

function buildSummary(data: DashboardData) {
  return {
    savingsRatePercent: Math.round(data.savingsRate * 100),
    totalRemittances: data.totals.totalRemittances,
    remittanceCount: data.totals.remittanceCount,
    lifetimeSaved: data.totals.lifetimeSaved,
    availableBalance: data.totals.availableBalance,
    savingsBalance: data.totals.savingsBalance,
    financialHealthScore: data.financialHealth.score,
    goals: data.goals.map((g) => ({
      name: g.name,
      category: g.category,
      target: g.targetAmount,
      current: g.currentAmount,
      progressPercent: Math.round(g.progress * 100),
    })),
    recentSenders: data.transactions
      .filter((t) => t.type === "remittance_received")
      .slice(0, 3)
      .map((t) => t.sender),
  };
}
