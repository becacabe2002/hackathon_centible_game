// finance.ts
import type { GameStats } from "./gameState";

export type TickResult = {
  stats: GameStats;
  logs: string[];
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function endOfPeriodTick(prev: GameStats): TickResult {
  const logs: string[] = [];

  // Impulse-driven variable spending
  const impulseProb = Math.min(0.4, prev.impulse / 100 * 0.4); // up to 40% chance
  let variableSpend = 0;
  if (Math.random() < impulseProb) {
    const base = 10;
    const swing = prev.impulse * 2; // up to ~200 when impulse=100
    variableSpend = Math.round(base + Math.random() * swing);
    logs.push(`Impulse spending this period: -$${variableSpend}`);
  }

  const debtInterestRate = 0.01; // 1% monthly
  const savingsInterestRate = 0.002; // 0.2% monthly

  const net = prev.income - prev.fixedExpenses - variableSpend;
  let savings = prev.savings;
  let debt = prev.debt;

  if (net >= 0) {
    savings += net;
    logs.push(`Positive cash flow: +$${net} to savings`);
  } else {
    const deficit = -net;
    if (savings >= deficit) {
      savings -= deficit;
      logs.push(`Covered deficit from savings: -$${deficit}`);
    } else {
      const newDebt = deficit - savings;
      savings = 0;
      debt += newDebt;
      logs.push(`Deficit led to new debt: +$${newDebt}`);
    }
  }

  if (debt > 0) {
    const interest = Math.round(debt * debtInterestRate);
    debt += interest;
    if (interest > 0) logs.push(`Debt interest: +$${interest}`);
  }
  if (savings > 0) {
    const interest = Math.round(savings * savingsInterestRate);
    savings += interest;
    if (interest > 0) logs.push(`Savings interest: +$${interest}`);
  }

  const budget = prev.income - prev.fixedExpenses; // tracked as a stat for UI/reference

  // Mood adjustments
  const happiness = clamp(prev.happiness + (net >= 0 ? 1 : -2), 0, 100);
  const stress = clamp(prev.stress + (net >= 0 ? -1 : 3), 0, 100);

  // Slight impulse normalization over time
  const impulse = clamp(prev.impulse - 1, 0, 100);

  const next: GameStats = {
    ...prev,
    month: prev.month + 1,
    budget,
    savings,
    debt,
    happiness,
    stress,
    impulse,
  };

  return { stats: next, logs };
}
