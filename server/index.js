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
- Return a single JSON object of type EventsResponse.
- Tailor events and goal to the provided player profile (knowledge, risk tolerance, region, income, savings, debt, goals).
- goal.description should summarize the player's main financial goal in 1 short sentence.
- goal.winCondition must be realistic and achievable given their profile.
- Use small, realistic deltas for effects (e.g., savings +/- 50..500, impulse +/- 1..10, income/fixedExpenses +/- 50..300).
- Ensure variety of tags and include cooldown to avoid repeats.
- For each choice, include an "explain" field: 1–2 short sentences in plain language explaining why the effects happen (cause → effect). No Markdown.
- Output ONLY valid JSON for EventsResponse. No Markdown, no prose, no backticks.`;

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
