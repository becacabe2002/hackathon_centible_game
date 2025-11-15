import { useState, useEffect } from "react";
import { initialGameState, initialStatsForScenario, type GameState, type ScenarioId } from "./gameState";
import { pickEvent, applyEffects, setCustomEvents, customEvents, type GameEvent, type EventChoice, type EventEffect } from "./events";
import { endOfPeriodTick } from "./finance";
import { saveGame, loadGame, clearGame } from "./persistence";
import "./App.css";

function StatBar({ label, value, min = 0, max = 100, color = "blue" }: { label: string; value: number; min?: number; max?: number; color?: "blue" | "green" | "red" | "yellow" | "emerald" | "indigo" }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const colorClass = (
    {
      blue: "bg-blue-500",
      green: "bg-green-500",
      red: "bg-red-500",
      yellow: "bg-yellow-500",
      emerald: "bg-emerald-500",
      indigo: "bg-indigo-500",
    } as const
  )[color] ?? "bg-blue-500";

  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="font-mono text-gray-900">{value}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div className={`${colorClass} h-3 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function App() {
  const saved = loadGame();
  const [game, setGame] = useState<GameState>(() => saved ?? { ...initialGameState });
  const [event, setEvent] = useState<GameEvent>(() => {
    const g = saved ?? initialGameState;
    return pickEvent(g);
  });
  const [choiceMade, setChoiceMade] = useState<EventChoice | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<EventChoice | null>(null);
  const [showSurvey, setShowSurvey] = useState(false);
  const [profile, setProfile] = useState({ knowledge: 'beginner', risk: 'medium', region: 'US', income: 2500, savings: 1000, debt: 0, goals: 'save more' });
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  useEffect(() => {
    saveGame(game);
  }, [game]);

  // If a saved game loads with custom scenario but no custom events (fresh reload), prompt survey
  useEffect(() => {
    if (game.scenarioId === 'custom' && customEvents.length === 0) {
      setShowSurvey(true);
    }
  }, [game.scenarioId]);

  // Ensure we always have an event to display (defensive)
  useEffect(() => {
    if (!event) {
      setEvent(pickEvent(game));
    }
  }, [event, game]);

  // Backend API base: configurable via VITE_API_BASE, defaults to same host on port 8787
  const apiBase = import.meta.env.VITE_API_BASE ?? `${window.location.protocol}//${window.location.hostname}:8787`;

  // Build a natural-language fallback explanation if a choice lacks `explain`
  function synthesizeExplanation(effects: EventEffect): string {
    const parts: string[] = [];
    const money = (n: number) => `$${Math.abs(n)}`;
    const plus = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

    if (effects.savings) {
      parts.push(
        effects.savings < 0
          ? `use ${money(effects.savings)} of savings`
          : `add ${money(effects.savings)} to savings`
      );
    }
    if (effects.debt) {
      parts.push(
        effects.debt < 0
          ? `reduce debt by ${money(effects.debt)}`
          : `increase debt by ${money(effects.debt)}`
      );
    }
    if (effects.income) {
      parts.push(
        effects.income > 0
          ? `increase monthly income by ${money(effects.income)}`
          : `decrease monthly income by ${money(effects.income)}`
      );
    }
    if (effects.fixedExpenses) {
      parts.push(
        effects.fixedExpenses > 0
          ? `raise monthly fixed expenses by ${money(effects.fixedExpenses)}`
          : `lower monthly fixed expenses by ${money(effects.fixedExpenses)}`
      );
    }
    if (effects.happiness) {
      parts.push(`${effects.happiness > 0 ? 'raise' : 'lower'} happiness by ${plus(effects.happiness)}`);
    }
    if (effects.stress) {
      parts.push(`${effects.stress > 0 ? 'raise' : 'lower'} stress by ${plus(effects.stress)}`);
    }
    if (effects.impulse) {
      parts.push(`${effects.impulse > 0 ? 'raise' : 'lower'} impulse by ${plus(effects.impulse)}`);
    }

    if (parts.length === 0) return 'No immediate changes from this choice.';
    const first = parts[0];
    const rest = parts.slice(1).join(', ');
    return rest ? `This will ${first}, ${rest}.` : `This will ${first}.`;
  }



  const handleChoice = (choice: EventChoice) => {
    if (choiceMade) return;
    setSelectedChoice(choice);
  };

  const handleConfirm = () => {
    if (!selectedChoice || choiceMade) return;
    const newStats = applyEffects(game.stats, selectedChoice.effects);
    setGame((g) => ({
      ...g,
      stats: newStats,
      log: [...g.log, selectedChoice.log],
      lastEventId: event.id,
      lastTag: event.tag,
      lastSeen: { ...g.lastSeen, [event.id]: g.stats.month },
    }));
    setChoiceMade(selectedChoice);
  };

  const handleNext = () => {
    setGame((g) => {
      const tick = endOfPeriodTick(g.stats);
      const nextStateForPick: GameState = { ...g, stats: tick.stats };
      const ev = pickEvent(nextStateForPick);
      setEvent(ev);
      return {
        ...g,
        stats: tick.stats,
        log: [...g.log, ...tick.logs],
      };
    });
    setChoiceMade(null);
    setSelectedChoice(null);
  };

  const { stats, log } = game;

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-8 text-center text-red-600 text-lg">
          No events available. Please try generating events again or restart the game.
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <header className="max-w-5xl mx-auto mb-6 flex items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-blue-700">Centible Life</h1>
          <p className="text-gray-600">A financial life simulator</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-600">Scenario</label>
          <select
            className="px-3 py-1 border rounded"
            value={game.scenarioId}
            onChange={(e) => {
              const sc = (e.target as HTMLSelectElement).value as ScenarioId;
              if (sc === 'custom') {
                const base = initialStatsForScenario('classic');
                const newState: GameState = { ...initialGameState, stats: base, scenarioId: 'custom', lastSeen: {}, log: ["Custom (AI) scenario selected. Fill the survey to generate events."] };
                setGame(newState);
                setShowSurvey(true);
                setChoiceMade(null);
                setSelectedChoice(null);
                return;
              }
              // For predefined scenarios, do not show survey, just use predefined events
              const freshStats = initialStatsForScenario(sc);
              const newState: GameState = { ...initialGameState, stats: freshStats, scenarioId: sc, lastSeen: {}, log: [`Scenario set to ${sc}`] };
              setGame(newState);
              setEvent(pickEvent(newState));
              setChoiceMade(null);
              setSelectedChoice(null);
              setShowSurvey(false);
            }}
          >
            <option value="classic">Classic</option>
            <option value="student">Student</option>
            <option value="startup">Startup</option>
            <option value="custom">Custom (AI)</option>
          </select>
          <button
            className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100"
            onClick={() => {
              clearGame();
              if (game.scenarioId === 'custom') {
                const base = initialStatsForScenario('classic');
                const fresh: GameState = { ...initialGameState, stats: base, scenarioId: 'custom', lastSeen: {}, log: ["New game (AI) - fill the survey to generate events."] };
                setGame(fresh);
                setShowSurvey(true);
                setChoiceMade(null);
                return;
              }
              const freshStats = initialStatsForScenario(game.scenarioId);
              const fresh: GameState = { ...initialGameState, stats: freshStats, scenarioId: game.scenarioId, lastSeen: {}, log: ["New game started."] };
              setGame(fresh);
              setEvent(pickEvent(fresh));
              setChoiceMade(null);
              setSelectedChoice(null);
            }}
          >
            New Game
          </button>
          <button
            className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => saveGame(game)}
          >
            Save
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto">
        {showSurvey && game.scenarioId === 'custom' ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Quick Financial Profile</h2>
            <form
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setLoadingAi(true);
                setAiError(null);
                try {
                  const resp = await fetch(`${apiBase}/api/generate-events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(profile),
                  });
                  const data = await resp.json();
                  if (!resp.ok) throw new Error(data.error || 'Failed to generate');
                  setCustomEvents(data.events);
                  const base = initialStatsForScenario('classic');
                  const riskImpulse = profile.risk === 'high' ? 60 : (profile.risk === 'low' ? 25 : 40);
                  const computedStats = {
                    ...base,
                    income: Number(profile.income) || base.income,
                    savings: Number(profile.savings) || base.savings,
                    debt: Number(profile.debt) || base.debt,
                    impulse: riskImpulse,
                  };
                  const newState: GameState = { ...initialGameState, stats: computedStats, scenarioId: 'custom', lastSeen: {}, log: [`Loaded ${data.events?.length ?? 0} AI events`] };
                  setGame(newState);
                  setEvent(pickEvent(newState));
                  setChoiceMade(null);
                  setSelectedChoice(null);
                  setShowSurvey(false);
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err);
                  setAiError(msg || 'Error generating events');
                } finally {
                  setLoadingAi(false);
                }
              }}
            >
              <label className="flex flex-col gap-1">
                <span className="text-sm text-gray-700">Financial knowledge</span>
                <select className="border rounded px-2 py-1" value={profile.knowledge} onChange={(e) => setProfile({ ...profile, knowledge: e.target.value })}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-gray-700">Risk tolerance</span>
                <select className="border rounded px-2 py-1" value={profile.risk} onChange={(e) => setProfile({ ...profile, risk: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-gray-700">Region</span>
                <input className="border rounded px-2 py-1" value={profile.region} onChange={(e) => setProfile({ ...profile, region: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-gray-700">Monthly income ($)</span>
                <input type="number" className="border rounded px-2 py-1" value={profile.income} onChange={(e) => setProfile({ ...profile, income: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-gray-700">Savings ($)</span>
                <input type="number" className="border rounded px-2 py-1" value={profile.savings} onChange={(e) => setProfile({ ...profile, savings: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-gray-700">Debt ($)</span>
                <input type="number" className="border rounded px-2 py-1" value={profile.debt} onChange={(e) => setProfile({ ...profile, debt: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-sm text-gray-700">Goal</span>
                <input className="border rounded px-2 py-1" value={profile.goals} onChange={(e) => setProfile({ ...profile, goals: e.target.value })} />
              </label>
              {aiError && <div className="md:col-span-2 text-red-600 text-sm">{aiError}</div>}
              <div className="md:col-span-2 flex gap-2">
                <button disabled={loadingAi} className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400" type="submit">
                  {loadingAi ? 'Generating…' : 'Generate AI Events'}
                </button>
                <button type="button" className="px-3 py-2 border rounded" onClick={() => setShowSurvey(false)}>Cancel</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <aside className="bg-white rounded-lg shadow p-4 md:sticky md:top-4 h-fit">
              <div className="mb-3 text-sm text-gray-500">Month: {stats.month}</div>
              <div className="mb-4 flex flex-col gap-2">
                <StatBar label="Savings" value={stats.savings} min={0} max={10000} color="emerald" />
                <StatBar label="Debt" value={stats.debt} min={0} max={10000} color="red" />
                <StatBar label="Impulse" value={stats.impulse} min={0} max={100} color="red" />
                <StatBar label="Happiness" value={stats.happiness} min={0} max={100} color="green" />
                <StatBar label="Stress" value={stats.stress} min={0} max={100} color="red" />
              </div>
              <div className="text-sm text-gray-600">
                <div>Income: ${stats.income}</div>
                <div>Fixed Expenses: ${stats.fixedExpenses}</div>
                <div>Budget: ${stats.income - stats.fixedExpenses}</div>
              </div>
            </aside>
            <section className="md:col-span-2 bg-white rounded-lg shadow p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">{event.title}</h2>
                <p className="mb-4">{event.description}</p>
                <div className="flex flex-col gap-2">
                  {event.choices.map((choice) => (
                    <button
                      key={choice.id}
                      className={`px-4 py-2 rounded border text-left ${
                        choiceMade?.id === choice.id
                          ? "bg-blue-200 border-blue-400"
                          : (selectedChoice?.id === choice.id
                              ? "bg-blue-50 border-blue-400"
                              : "bg-white border-gray-300 hover:bg-blue-50")
                      }`}
                      onClick={() => handleChoice(choice)}
                      disabled={!!choiceMade}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
              {choiceMade && (
                <div className="mb-4 text-green-700 font-medium">{choiceMade.log}</div>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  className="px-4 py-2 bg-emerald-600 text-white rounded disabled:bg-gray-400"
                  onClick={handleConfirm}
                  disabled={!selectedChoice || !!choiceMade}
                >
                  Confirm
                </button>
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
                  onClick={handleNext}
                  disabled={!choiceMade}
                >
                  Next
                </button>
              </div>
              {choiceMade && (
                <div className="mt-3 p-3 border rounded text-sm text-gray-700 bg-gray-50">
                  {choiceMade.explain ?? synthesizeExplanation(choiceMade.effects)}
                </div>
              )}
              <div className="mt-6">
                <h3 className="font-semibold mb-1">Log</h3>
                <ul className="text-xs text-gray-600 max-h-40 overflow-y-auto list-disc pl-4">
                  {log.map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
