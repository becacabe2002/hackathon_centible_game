// events.ts

import type { GameStats, GameState, ScenarioId } from "./gameState";

export type EventEffect = Partial<{
  budget: number;
  impulse: number;
  savings: number;
  debt: number;
  income: number;
  fixedExpenses: number;
  happiness: number;
  stress: number;
}>;

export type EventChoice = {
  id: string;
  label: string;
  effects: EventEffect;
  log: string;
};

export type GameEvent = {
  id: string;
  title: string;
  description: string;
  tag: "career" | "lifestyle" | "social" | "finance" | "risk";
  choices: EventChoice[];
  condition?: (stats: GameStats) => boolean;
  weight?: number; // base chance relative to others
  cooldown?: number; // months before this event can repeat
};

// Custom events pack (generated at runtime)
export let customEvents: GameEvent[] = [];
export function setCustomEvents(events: GameEvent[]) {
  // Always inject debt payment and fixed expense reduction events
  const debtEvent: GameEvent = {
    id: "pay-debt-custom",
    title: "Debt Repayment Opportunity",
    description: "You have enough savings to pay down your debt.",
    tag: "finance",
    cooldown: 2,
    condition: (s) => s.savings >= 1000 && s.debt > 0,
    choices: [
      {
        id: "pay-500",
        label: "Pay $500 from savings to reduce debt",
        effects: { savings: -500, debt: -500, stress: -2, happiness: 2 },
        log: "You made an extra payment and reduced your debt."
      },
      {
        id: "pay-1000",
        label: "Pay $1000 from savings to reduce debt",
        effects: { savings: -1000, debt: -1000, stress: -4, happiness: 4 },
        log: "You made a large payment and significantly reduced your debt."
      },
      {
        id: "skip",
        label: "Skip payment (no change)",
        effects: {},
        log: "You skipped a payment this month."
      }
    ]
  };
  const expenseEvent: GameEvent = {
    id: "cut-expense-custom",
    title: "Cut Recurring Expenses",
    description: "You have a chance to reduce your recurring bills or fixed expenses.",
    tag: "finance",
    cooldown: 4,
    choices: [
      {
        id: "cut-100",
        label: "Negotiate and cut fixed expenses by $100",
        effects: { fixedExpenses: -100, stress: 1, happiness: 1 },
        log: "You successfully negotiated your bills and reduced your fixed expenses."
      },
      {
        id: "cut-200",
        label: "Switch to a cheaper plan (cut $200, -2 happiness)",
        effects: { fixedExpenses: -200, happiness: -2 },
        log: "You switched to a cheaper plan and saved money, but lost some perks."
      },
      {
        id: "skip",
        label: "Do nothing",
        effects: {},
        log: "You decided not to change your bills this month."
      }
    ]
  };
  customEvents = [...events, debtEvent, expenseEvent];
}

// Classic pack
const classicEvents: GameEvent[] = [
  {
    id: "pay-debt",
    title: "Debt Repayment Opportunity",
    description: "You have enough savings to pay down your debt.",
    tag: "finance",
    cooldown: 2,
    condition: (s) => s.savings >= 1000 && s.debt > 0,
    choices: [
      {
        id: "pay-500",
        label: "Pay $500 from savings to reduce debt",
        effects: { savings: -500, debt: -500, stress: -2, happiness: 2 },
        log: "You made an extra payment and reduced your debt."
      },
      {
        id: "pay-1000",
        label: "Pay $1000 from savings to reduce debt",
        effects: { savings: -1000, debt: -1000, stress: -4, happiness: 4 },
        log: "You made a large payment and significantly reduced your debt."
      },
      {
        id: "skip",
        label: "Skip payment (no change)",
        effects: {},
        log: "You skipped a payment this month."
      }
    ]
  },
  {
    id: "negotiate-bills",
    title: "Negotiate Bills",
    description: "You have a chance to negotiate your recurring bills or switch to a cheaper plan.",
    tag: "finance",
    cooldown: 4,
    choices: [
      {
        id: "negotiate",
        label: "Negotiate and cut fixed expenses by $100",
        effects: { fixedExpenses: -100, stress: 1, happiness: 1 },
        log: "You successfully negotiated your bills and reduced your fixed expenses."
      },
      {
        id: "switch",
        label: "Switch to a cheaper plan (cut $200, -2 happiness)",
        effects: { fixedExpenses: -200, happiness: -2 },
        log: "You switched to a cheaper plan and saved money, but lost some perks."
      },
      {
        id: "skip",
        label: "Do nothing",
        effects: {},
        log: "You decided not to change your bills this month."
      }
    ]
  },
  {
    id: "side-gig",
    title: "Side Gig Opportunity",
    description: "A friend offers you a weekend side gig. It pays, but you'll have less free time.",
    tag: "career",
    cooldown: 3,
    choices: [
      { id: "accept", label: "Accept the side gig (+$200, +5 stress)", effects: { savings: 200, stress: 5 }, log: "You worked the side gig and earned extra cash, but it was tiring." },
      { id: "decline", label: "Decline (no change)", effects: {}, log: "You declined the side gig and kept your free time." },
    ],
  },
  {
    id: "impulse-buy",
    title: "Impulse Buy Temptation",
    description: "You see a gadget on sale that you don't really need.",
    tag: "risk",
    cooldown: 2,
    choices: [
      { id: "buy", label: "Buy it (-$100, +10 happiness, +10 impulse)", effects: { savings: -100, happiness: 10, impulse: 10 }, log: "You bought the gadget. It's fun, but your wallet is lighter." },
      { id: "skip", label: "Skip (-5 impulse, +2 stress)", effects: { impulse: -5, stress: 2 }, log: "You resisted the urge, but it took some willpower." },
    ],
    condition: (s) => s.savings > 100,
  },
  {
    id: "unexpected-bill",
    title: "Unexpected Bill",
    description: "A surprise medical bill arrives.",
    tag: "finance",
    cooldown: 4,
    choices: [
      { id: "pay", label: "Pay from savings (-$300, +5 stress)", effects: { savings: -300, stress: 5 }, log: "You paid the bill from your savings." },
      { id: "defer", label: "Defer payment (+$300 debt, +10 stress)", effects: { debt: 300, stress: 10 }, log: "You deferred the bill, but your debt increased." },
    ],
  },
  {
    id: "rent-change",
    title: "Housing Decision",
    description: "Your lease is up. You can upgrade, keep your current place, or find a roommate.",
    tag: "lifestyle",
    cooldown: 6,
    choices: [
      { id: "upgrade", label: "Upgrade apartment (+$400 fixed expenses, +8 happiness)", effects: { fixedExpenses: 400, happiness: 8 }, log: "You upgraded your apartment. Nicer place, higher costs." },
      { id: "same", label: "Stay put (no change)", effects: {}, log: "You renewed your current lease." },
      { id: "roommate", label: "Get a roommate (-$300 fixed expenses, -5 happiness)", effects: { fixedExpenses: -300, happiness: -5 }, log: "You found a roommate and cut expenses, but it's less private." },
    ],
  },
  {
    id: "annual-raise",
    title: "Performance Review",
    description: "Your manager offers more responsibilities for a raise.",
    tag: "career",
    cooldown: 6,
    choices: [
      { id: "accept", label: "Accept (+$200 income, +5 stress)", effects: { income: 200, stress: 5 }, log: "You took on more responsibilities and got a raise." },
      { id: "decline", label: "Decline (no change)", effects: {}, log: "You kept your current role." },
    ],
  },
];

// Student pack
const studentEvents: GameEvent[] = [
  {
    id: "pay-debt-student",
    title: "Student Loan Payment Opportunity",
    description: "You have enough savings to pay down your student loan.",
    tag: "finance",
    cooldown: 2,
    condition: (s) => s.savings >= 1000 && s.debt > 0,
    choices: [
      {
        id: "pay-500",
        label: "Pay $500 from savings to reduce debt",
        effects: { savings: -500, debt: -500, stress: -2, happiness: 2 },
        log: "You made an extra payment and reduced your student loan."
      },
      {
        id: "pay-1000",
        label: "Pay $1000 from savings to reduce debt",
        effects: { savings: -1000, debt: -1000, stress: -4, happiness: 4 },
        log: "You made a large payment and significantly reduced your student loan."
      },
      {
        id: "skip",
        label: "Skip payment (no change)",
        effects: {},
        log: "You skipped a payment this month."
      }
    ]
  },
  {
    id: "find-roommate",
    title: "Find a Roommate",
    description: "You consider finding a roommate to help cut down your rent.",
    tag: "lifestyle",
    cooldown: 6,
    choices: [
      {
        id: "find",
        label: "Find a roommate (cut $200 fixed expenses, -2 happiness)",
        effects: { fixedExpenses: -200, happiness: -2, stress: 1 },
        log: "You found a roommate and reduced your rent, but lost some privacy."
      },
      {
        id: "skip",
        label: "Stay solo (no change)",
        effects: {},
        log: "You decided to keep your place to yourself."
      }
    ]
  },
  {
    id: "textbooks",
    title: "Textbooks Needed",
    description: "A new semester starts and you need textbooks.",
    tag: "finance",
    cooldown: 4,
    choices: [
      { id: "buy-new", label: "Buy new (-$250)", effects: { savings: -250 }, log: "You bought new textbooks." },
      { id: "buy-used", label: "Buy used (-$120, +2 stress)", effects: { savings: -120, stress: 2 }, log: "You hunted for used textbooks and saved money." },
      { id: "borrow", label: "Borrow from library (0$, +5 stress)", effects: { stress: 5 }, log: "You borrowed textbooks and deal with limited time slots." },
    ],
  },
  {
    id: "campus-job",
    title: "Campus Job Opening",
    description: "The library offers a part-time position.",
    tag: "career",
    cooldown: 3,
    choices: [
      { id: "apply", label: "Apply (+$150 savings, +5 stress)", effects: { savings: 150, stress: 5 }, log: "You got the campus job and earn a little extra." },
      { id: "skip", label: "Focus on studies (+2 happiness)", effects: { happiness: 2 }, log: "You focused on studies instead." },
    ],
  },
  {
    id: "roommate-conflict",
    title: "Roommate Conflict",
    description: "Your roommate is late on rent.",
    tag: "lifestyle",
    cooldown: 5,
    choices: [
      { id: "cover", label: "Cover their part this month (-$250, +5 stress)", effects: { savings: -250, stress: 5 }, log: "You covered the rent and will talk later." },
      { id: "landlord", label: "Talk to landlord (+5 stress, potential future change)", effects: { stress: 5 }, log: "You informed the landlord." },
    ],
  },
];

// Startup pack
const startupEvents: GameEvent[] = [
  {
    id: "pay-debt-startup",
    title: "Business Loan Payment Opportunity",
    description: "You have enough savings to pay down your business loan.",
    tag: "finance",
    cooldown: 2,
    condition: (s) => s.savings >= 1000 && s.debt > 0,
    choices: [
      {
        id: "pay-500",
        label: "Pay $500 from savings to reduce debt",
        effects: { savings: -500, debt: -500, stress: -2, happiness: 2 },
        log: "You made an extra payment and reduced your business loan."
      },
      {
        id: "pay-1000",
        label: "Pay $1000 from savings to reduce debt",
        effects: { savings: -1000, debt: -1000, stress: -4, happiness: 4 },
        log: "You made a large payment and significantly reduced your business loan."
      },
      {
        id: "skip",
        label: "Skip payment (no change)",
        effects: {},
        log: "You skipped a payment this month."
      }
    ]
  },
  {
    id: "cut-office-costs",
    title: "Cut Office Costs",
    description: "You consider moving to a smaller office or switching to remote work to cut fixed expenses.",
    tag: "lifestyle",
    cooldown: 6,
    choices: [
      {
        id: "move-remote",
        label: "Switch to remote work (cut $300 fixed expenses, -2 happiness)",
        effects: { fixedExpenses: -300, happiness: -2, stress: 1 },
        log: "You switched to remote work and reduced your office costs."
      },
      {
        id: "downsize",
        label: "Move to a smaller office (cut $150 fixed expenses, -1 happiness)",
        effects: { fixedExpenses: -150, happiness: -1 },
        log: "You moved to a smaller office and saved on rent."
      },
      {
        id: "skip",
        label: "Keep current office (no change)",
        effects: {},
        log: "You kept your current office setup."
      }
    ]
  },
  {
    id: "pitch-trip",
    title: "Investor Pitch Trip",
    description: "Travel to pitch investors.",
    tag: "career",
    cooldown: 4,
    choices: [
      { id: "go", label: "Go (-$300 savings, +10 stress, chance for future raise)", effects: { savings: -300, stress: 10 }, log: "You traveled and pitched the startup." },
      { id: "remote", label: "Pitch remote (0$, -2 happiness)", effects: { happiness: -2 }, log: "You pitched remotely to save money." },
    ],
  },
  {
    id: "equity-vs-salary",
    title: "Equity vs Salary",
    description: "Your startup offers more equity for less salary.",
    tag: "finance",
    cooldown: 6,
    choices: [
      { id: "equity", label: "Take equity (-$200 income, +5 happiness)", effects: { income: -200, happiness: 5 }, log: "You chose equity; money is tight now." },
      { id: "salary", label: "Keep salary (+$0)", effects: {}, log: "You kept your current compensation." },
    ],
  },
  {
    id: "coworking",
    title: "Coworking Space",
    description: "Rent a desk in a coworking space.",
    tag: "lifestyle",
    cooldown: 6,
    choices: [
      { id: "rent", label: "Rent (+$200 fixed expenses, +3 happiness)", effects: { fixedExpenses: 200, happiness: 3 }, log: "You rented a desk; productivity improved." },
      { id: "home", label: "Work from home (no change)", effects: {}, log: "You kept working from home." },
    ],
  },
];

export const scenarioEvents: Record<ScenarioId, GameEvent[]> = {
  classic: classicEvents,
  student: studentEvents,
  startup: startupEvents,
  custom: customEvents,
};

function weightedRandom<T>(items: { item: T; weight: number }[]): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of items) {
    if (r < x.weight) return x.item;
    r -= x.weight;
  }
  return items[items.length - 1].item; // fallback
}

// Select a random event with cooldowns and tag variety, from scenario pack
export function pickEvent(state: GameState): GameEvent {
  const { stats, lastEventId, lastTag, lastSeen, scenarioId } = state;
  const pack = scenarioId === "custom" ? customEvents : (scenarioEvents[scenarioId] ?? classicEvents);
  const now = stats.month;

  const candidates = pack.filter((ev) => {
    if (ev.id === lastEventId) return false; // avoid immediate repeat
    if (ev.condition && !ev.condition(stats)) return false;
    const last = lastSeen?.[ev.id] ?? -Infinity;
    const cd = ev.cooldown ?? 0;
    if (now - last < cd) return false; // still on cooldown
    return true;
  });

  const weighted = candidates.map((ev) => {
    let w = ev.weight ?? 1;
    if (lastTag && ev.tag === lastTag) w *= 0.35; // discourage repeating same tag
    return { item: ev, weight: w };
  });

  if (weighted.length === 0) {
    const fallback = pack.filter((ev) => !ev.condition || ev.condition(stats));
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  return weightedRandom(weighted);
}

// Apply effects to stats
export function applyEffects(stats: GameStats, effects: EventEffect): GameStats {
  const next = {
    ...stats,
    ...Object.fromEntries(
      Object.entries(effects).map(([k, v]) => [
        k,
        (stats as Record<string, number>)[k] + (v ?? 0),
      ])
    ),
  } as GameStats;
  // Recompute derived budget to reflect any income/fixedExpenses changes immediately
  next.budget = next.income - next.fixedExpenses;
  return next;
}
