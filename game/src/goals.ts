import type { GameStats, GameState, ScenarioId } from "./gameState";

export type WinCondition = {
  stat: "savings" | "debt" | "income" | "impulse" | "stress" | "happiness" | "fixedExpenses";
  operator: "<" | "<=" | ">" | ">=";
  value: number;
};

export type ScenarioGoal = {
  description: string;
  winCondition?: WinCondition; // for custom and optionally classic/startup
};

export function evaluateWinCondition(stats: GameStats, cond: WinCondition): boolean {
  const current = stats[cond.stat];
  switch (cond.operator) {
    case "<":
      return current < cond.value;
    case "<=":
      return current <= cond.value;
    case ">":
      return current > cond.value;
    case ">=":
      return current >= cond.value;
    default:
      return false;
  }
}

export const defaultScenarioGoals: Record<ScenarioId, ScenarioGoal> = {
  classic: {
    description: "Become wiser with spending.",
    // We could represent impulse < 10 here, but we'll keep direct logic for now.
  },
  student: {
    description: "Pay off your student debt without burning out.",
  },
  startup: {
    description: "Make your startup financially stable.",
  },
  custom: {
    description: "Follow your custom financial journey.",
  },
};

export type WinCheckResult = { win: boolean; message?: string };
export type LoseCheckResult = { lose: boolean; message?: string };

export function checkWin(state: GameState): WinCheckResult {
  const { stats, scenarioId, winCondition, goalDescription } = state;

  if (scenarioId === "classic") {
    if (stats.impulse < 10) {
      return {
        win: true,
        message: goalDescription ?? "You kept your impulse under 10 and became wiser with spending.",
      };
    }
  } else if (scenarioId === "student") {
    if (stats.debt <= 0 && stats.stress < 80) {
      return {
        win: true,
        message: goalDescription ?? "You paid off your student debt without burning out.",
      };
    }
  } else if (scenarioId === "startup") {
    if (stats.income > stats.debt) {
      return {
        win: true,
        message: goalDescription ?? "Your startup income surpassed your debt and became more stable.",
      };
    }
  } else if (scenarioId === "custom" && winCondition) {
    if (evaluateWinCondition(stats, winCondition)) {
      return {
        win: true,
        message: goalDescription ?? "You achieved your custom goal.",
      };
    }
  }

  return { win: false };
}

export function checkLose(stats: GameStats): LoseCheckResult {
  if (stats.debt > 4 * stats.income) {
    return {
      lose: true,
      message: "Your debt has grown beyond four times your income and is no longer sustainable.",
    };
  }
  if (stats.stress > 95) {
    return {
      lose: true,
      message: "Your stress has reached a critical level and your wellbeing is at risk.",
    };
  }
  return { lose: false };
}