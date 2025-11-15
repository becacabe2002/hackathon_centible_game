// Simple backend proxy to generate events with OpenAI
// Usage: set OPENAI_API_KEY in .env or environment and run: node index.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PORT = process.env.PORT || 8787;

// --- Goal parsing helpers ---
function formatMoney(n) {
  const val = Math.round(Number(n) || 0);
  return `$${val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function roundMoney(n) {
  const num = Number(n) || 0;
  // Round to the nearest $50 for cleaner targets
  return Math.max(0, Math.round(num / 50) * 50);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function parseAbsoluteNumberToken(text) {
  // Exclude percentages; capture $4,000, 4000, 4k
  const m = text.match(/(?:\$|usd\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(k))?(?!\s*%)/i);
  if (!m) return null;
  const raw = m[1]?.replace(/,/g, '') ?? '';
  const base = parseFloat(raw);
  if (Number.isNaN(base)) return null;
  const hasK = !!m[2];
  return hasK ? base * 1000 : base;
}

function parsePercentToken(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  return parseFloat(m[1]);
}

function detectStat(text) {
  const t = text.toLowerCase();
  if (/pay\s*off\s*debt|debt[-\s]?free|clear\s*debt/.test(t)) return 'debt';
  if (/savings?|save\b/.test(t)) return 'savings';
  if (/\bdebt\b|owe\b/.test(t)) return 'debt';
  if (/income|salary|paycheck|wage/.test(t)) return 'income';
  if (/(fixed\s*)?expenses|bills/.test(t)) return 'fixedExpenses';
  if (/stress(ed)?\b/.test(t)) return 'stress';
  if (/happiness|happy\b/.test(t)) return 'happiness';
  if (/impulse|impulsivity/.test(t)) return 'impulse';
  return null;
}

function currentFor(profile, stat) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  switch (stat) {
    case 'savings':
      return num(profile?.savings);
    case 'debt':
      return num(profile?.debt);
    case 'income':
      return num(profile?.income);
    case 'fixedExpenses':
      return num(profile?.fixedExpenses);
    case 'impulse': {
      const risk = String(profile?.risk || 'medium').toLowerCase();
      return risk === 'high' ? 60 : risk === 'low' ? 25 : 40;
    }
    case 'happiness':
      return 60; // default baseline consistent with game defaults
    case 'stress':
      return 40; // default baseline consistent with game defaults
    default:
      return 0;
  }
}

function minimalMoneyBump(profile) {
  const income = Number(profile?.income) || 0;
  const fixed = Number(profile?.fixedExpenses) || 0;
  const budget = income - fixed;
  const slice = Math.round(Math.abs(budget) * 0.1);
  return Math.max(50, slice, 25);
}

function buildDescription(stat, current, target) {
  const dirWord = (s) => (['debt', 'fixedExpenses', 'stress', 'impulse'].includes(s) ? 'Reduce' : ['happiness'].includes(s) ? 'Increase' : 'Grow');
  if (['savings', 'income', 'debt', 'fixedExpenses'].includes(stat)) {
    return `${dirWord(stat)} your ${stat === 'fixedExpenses' ? 'fixed expenses' : stat} from ${formatMoney(current)} to ${formatMoney(target)}.`;
  }
  // points-based stats
  const pretty = (n) => Math.round(n);
  const label = stat;
  return `${dirWord(stat)} ${label} from ${pretty(current)} to ${pretty(target)}.`;
}

function parseUserGoal(goalText, profile) {
  if (!goalText || typeof goalText !== 'string') return null;
  const text = goalText.trim();
  if (!text) return null;

  const stat = detectStat(text);
  if (!stat) return null;

  const positiveStats = new Set(['savings', 'income', 'happiness']);
  const operator = positiveStats.has(stat) ? '>=' : '<=';

  const percent = parsePercentToken(text);
  // If there is a % we treat as relative; else attempt absolute number
  const absoluteNum = percent == null ? parseAbsoluteNumberToken(text) : null;

  let current = currentFor(profile, stat);
  let target;
  let usedNumeric = false;
  let usedRelative = false;

  // Special phrase: pay off debt
  if (stat === 'debt' && /pay\s*off|debt[-\s]?free|clear\s*debt/.test(text.toLowerCase())) {
    target = 0;
    usedNumeric = true; // special numeric-like target
  }

  if (target == null) {
    if (absoluteNum != null) {
      target = Math.max(0, absoluteNum);
      usedNumeric = true;
    } else if (percent != null) {
      // safety filter: clamp within 5-20%
      const p = clamp(percent / 100, 0.05, 0.2);
      if (positiveStats.has(stat)) {
        target = current * (1 + p);
      } else {
        target = current * (1 - p);
      }
      usedNumeric = true;
      usedRelative = true;
    } else {
      // check for phrases like "+ 400" or "by 400"
      const byAbs = text.match(/(?:by|\+|plus|increase|decrease|reduce|cut)\s*(\$?\d[\d,]*)(?!\s*%)/i);
      if (byAbs) {
        const n = parseFloat(byAbs[1].replace(/[$,]/g, '')) || 0;
        if (positiveStats.has(stat)) target = current + n; else target = Math.max(0, current - n);
        usedNumeric = true;
        usedRelative = true;
      }
    }
  }

  if (target == null) return null;

  // Round and bounds
  let rounded;
  if (['savings', 'income', 'debt', 'fixedExpenses'].includes(stat)) {
    rounded = roundMoney(target);
    if (stat === 'debt') rounded = Math.max(0, rounded);
  } else {
    rounded = Math.round(target);
    if (stat === 'happiness') rounded = clamp(rounded, 0, 100);
    if (stat === 'stress' || stat === 'impulse') rounded = clamp(rounded, 0, 100);
  }

  // Not already satisfied guard: bump minimally beyond current
  const satisfied = operator === '>=' ? current >= rounded : current <= rounded;
  if (satisfied) {
    if (['savings', 'income', 'debt', 'fixedExpenses'].includes(stat)) {
      const bump = minimalMoneyBump(profile);
      if (operator === '>=') rounded = roundMoney(current + bump);
      else {
        const floorZero = stat === 'debt' || stat === 'fixedExpenses';
        const candidate = current - bump;
        rounded = roundMoney(floorZero ? Math.max(0, candidate) : candidate);
        if (floorZero && rounded === 0 && current === 0) {
          // If already zero and cannot go lower, switch to small related savings target
          const alt = roundMoney((Number(profile?.savings) || 0) + Math.max(100, bump));
          return {
            description: buildDescription('savings', Number(profile?.savings) || 0, alt),
            winCondition: { stat: 'savings', operator: '>=', value: alt },
            override: true,
          };
        }
      }
    } else {
      // points-based minimal bump of 1 within bounds
      if (operator === '>=') rounded = clamp(Math.round(current + 1), 0, 100);
      else rounded = clamp(Math.round(current - 1), 0, 100);
    }
  }

  const desc = buildDescription(stat, current, rounded);
  return {
    description: desc,
    winCondition: { stat, operator, value: rounded },
    override: usedNumeric || false,
    usedRelative: !!usedRelative,
  };
}

const systemPrompt = `You are a game content designer for a financial life simulator.
Generate events and a scenario goal as strict JSON following these TypeScript types:

type EventChoice = { id: string; label: string; effects: Partial<{ budget:number; impulse:number; savings:number; debt:number; income:number; fixedExpenses:number; happiness:number; stress:number; }>; log: string; explain?: string };

type GameEvent = {
  id: string;
  title: string;
  description: string;
  tag: 'career' | 'lifestyle' | 'social' | 'finance' | 'risk';
  choices: EventChoice[];
  condition?: never; // don't include functions
  weight?: number;
  cooldown?: number;
};

type WinCondition = {
  stat: 'savings' | 'debt' | 'income' | 'impulse' | 'stress' | 'happiness' | 'fixedExpenses';
  operator: '<' | '<=' | '>' | '>=';
  value: number;
};

type ScenarioGoal = {
  description: string;
  winCondition: WinCondition;
};

type EventsResponse = {
  events: GameEvent[];
  goal: ScenarioGoal;
};

Rules:
- Return a single JSON object of type EventsResponse. Output ONLY valid JSON for EventsResponse. No Markdown, no prose, no backticks.
- Tailor events and goal to the provided player profile (knowledge, risk tolerance, region, income, savings, debt, fixedExpenses, goals). Explicitly consider fixedExpenses when scaling money amounts.
- EventsResponse.events must contain exactly 20 events.
- Tags must be balanced: exactly 4 'career', 4 'lifestyle', 4 'finance', 4 'social', and 4 'risk' events.
- Enforce uniqueness: all event ids and titles must be unique. Avoid near-duplicates (do not repeat the same scenario with only numbers changed).
- Prohibit "Debt Repayment" and "Cut/Negotiate Recurring Expenses" events; those are handled by the game separately. Do not create events primarily about paying down debt or cutting recurring bills.
- Scale money deltas to the player's profile while keeping realistic caps:
  • income/fixedExpenses deltas: about ±5–20% of the player's income/fixedExpenses, capped within ±1500 absolute; round to sensible increments.
  • savings deltas: about ±5–25% of (income - fixedExpenses) or within ±50–500 when budget is small/negative.
  • debt deltas: about ±3–15% of current debt (use negative for repayments, positive for new debt), cap within ±2000; avoid zero if the event is about debt change.
  • impulse: ±1–10; happiness/stress: ±1–10.
- Provide concise, varied "explain" text for each choice: 1–2 short sentences with cause→effect reasoning. No Markdown.
- Include a cooldown on each event to reduce repetition. You may include optional weight to influence distribution.
Goal constraints (strict):
- The goal must ONLY reflect an improvement over the player’s current status. Choose exactly one stat from ['savings','debt','income','impulse','stress','happiness','fixedExpenses'] and set a target that is strictly better than the current value.
- Compute the target relative to the current value, not as an absolute or generic threshold:
  • savings, income: operator ">=" with a realistic +5–20% increase from current; round to sensible increments; cap absolute change at +1500.
  • debt, fixedExpenses: operator "<=" with a realistic 5–20% decrease from current; round to sensible increments; cap absolute change at -2000 for debt and -1500 for fixedExpenses; do not go below 0 for debt.
  • stress: operator "<=" with a 5–15 point reduction; floor at 5.
  • happiness: operator ">=" with a 5–15 point increase; ceiling at 95.
  • impulse: operator "<=" with a 1–5 point reduction; floor at 0.
- The winCondition must NOT already be satisfied at generation time.
- goal.description must explicitly reference the improvement relative to the current value (e.g., "Reduce your debt from $12,000 to about $10,200" or "Lower impulse by 3 points").`;

app.post('/api/generate-events', async (req, res) => {
  try {
    const profile = req.body ?? {};

    // Parse an explicit numeric goal if present; this will be enforced server-side
    const parsed = parseUserGoal(String(profile?.goals || ''), profile);
    const hint = parsed?.winCondition
      ? `${parsed.winCondition.stat} ${parsed.winCondition.operator} ${parsed.winCondition.value}`
      : 'none';

    const userPrompt = `Player Profile (JSON): ${JSON.stringify(profile)}\nParsedGoalHint: ${hint}\nNote: Use ParsedGoalHint to theme events and narratives. The server may enforce a specific goal if provided.\nGenerate tailored events and the improved-status goal.`;

    const completion = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
    });

    const text = completion.output_text || '';
    // Attempt to parse JSON payload from the assistant text as EventsResponse
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    const slice = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;

    let data;
    try {
      data = JSON.parse(slice);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid JSON from model', raw: text });
    }

    const events = Array.isArray(data?.events) ? data.events : [];
    const modelGoal = data?.goal ?? null;

    // If we parsed a numeric target, override the model's goal
    const finalGoal = parsed?.winCondition && parsed?.override
      ? { description: parsed.description, winCondition: parsed.winCondition }
      : modelGoal;

    return res.json({ events, goal: finalGoal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate events' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => console.log(`AI Event server listening on http://0.0.0.0:${PORT}`));
