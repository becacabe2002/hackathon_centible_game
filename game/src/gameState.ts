// gameState.ts

export type ScenarioId = "classic" | "student" | "startup" | "custom";

export type GameStats = {
  month: number;
  budget: number; // Net monthly cash flow
  impulse: number; // 0-100, higher = more likely to overspend
  savings: number;
  debt: number;
  income: number;
  fixedExpenses: number;
  happiness: number; // 0-100
  stress: number; // 0-100
};

export type GameState = {
  stats: GameStats;
  log: string[];
  gameOver: boolean;
  lastEventId?: string;
  lastTag?: string;
  lastSeen: Record<string, number>; // eventId -> month last seen
  scenarioId: ScenarioId; // which scenario determines event pack
};

export const baseStats: GameStats = {
  month: 1,
  budget: 0,
  impulse: 30,
  savings: 1000,
  debt: 0,
  income: 2500,
  fixedExpenses: 1800,
  happiness: 60,
  stress: 40,
};

export function initialStatsForScenario(scenarioId: ScenarioId): GameStats {
  switch (scenarioId) {
    case "student":
      return {
        month: 1,
        budget: 0,
        impulse: 35,
        savings: 300,
        debt: 12000, // student loan
        income: 900,
        fixedExpenses: 800,
        happiness: 65,
        stress: 50,
      };
    case "startup":
      return {
        month: 1,
        budget: 0,
        impulse: 45,
        savings: 2000,
        debt: 0,
        income: 1200, // low salary early on
        fixedExpenses: 1500,
        happiness: 70,
        stress: 55,
      };
    case "classic":
    default:
      return { ...baseStats };
  }
}

export const initialGameState: GameState = {
  stats: { ...baseStats },
  log: ["Welcome to Centible Life!"],
  gameOver: false,
  lastSeen: {},
  scenarioId: "classic",
};
