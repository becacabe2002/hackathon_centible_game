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
- goal.description should summarize the player's main financial goal in 1 short sentence.
- goal.winCondition must be realistic and achievable given their profile, and may reference savings, debt, income, impulse, stress, happiness, or fixedExpenses.`;

app.post('/api/generate-events', async (req, res) => {
  try {
    const profile = req.body ?? {};
    const userPrompt = `Player Profile (JSON): ${JSON.stringify(profile)}\nGenerate tailored events.`;

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
    const goal = data?.goal ?? null;

    return res.json({ events, goal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate events' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => console.log(`AI Event server listening on http://0.0.0.0:${PORT}`));
