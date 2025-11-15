import { useState, useEffect } from "react";
import { initialGameState, initialStatsForScenario, type GameState, type ScenarioId } from "./gameState";
import { pickEvent, applyEffects, setCustomEvents, type GameEvent, type EventChoice } from "./events";
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
  const [game, setGame] = useState<GameState>(() => saved ?? { ...initialGameState, scenarioId: 'custom', lastSeen: {}, log: ["Welcome! Please complete the quick survey to start."] });
  const [event, setEvent] = useState<GameEvent>(() => {
    const g = saved ?? initialGameState;
    return pickEvent(g);
  });
  const [choiceMade, setChoiceMade] = useState<EventChoice | null>(null);
  const [showSurvey, setShowSurvey] = useState(!saved);
  const [profile, setProfile] = useState({ knowledge: 'beginner', risk: 'medium', region: 'US', income: 2500, savings: 1000, debt: 0, goals: 'save more' });
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  useEffect(() => {
    saveGame(game);
  }, [game]);



  const handleChoice = (choice: EventChoice) => {
    if (choiceMade) return;
    const newStats = applyEffects(game.stats, choice.effects);
    setGame((g) => ({
      ...g,
      stats: newStats,
      log: [...g.log, choice.log],
      lastEventId: event.id,
      lastTag: event.tag,
      lastSeen: { ...g.lastSeen, [event.id]: g.stats.month },
    }));
    setChoiceMade(choice);
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
                return;
              }
              const freshStats = initialStatsForScenario(sc);
              const newState: GameState = { ...initialGameState, stats: freshStats, scenarioId: sc, lastSeen: {}, log: [`Scenario set to ${sc}`] };
              setGame(newState);
              setEvent(pickEvent(newState));
              setChoiceMade(null);
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
        {showSurvey ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Quick Financial Profile</h2>
            <form
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setLoadingAi(true);
                setAiError(null);
                try {
                  const resp = await fetch('http://localhost:8787/api/generate-events', {
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
                          : "bg-white border-gray-300 hover:bg-blue-50"
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
              <button
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
                onClick={handleNext}
                disabled={!choiceMade}
              >
                Next
              </button>
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
