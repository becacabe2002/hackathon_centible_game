import { useState, useEffect, useRef } from "react";
import { initialGameState, initialStatsForScenario, type GameState, type ScenarioId } from "./gameState";
import { pickEvent, applyEffects, setCustomEvents, customEvents, type GameEvent, type EventChoice, type EventEffect } from "./events";
import { endOfPeriodTick } from "./finance";
import { saveGame, loadGame, clearGame } from "./persistence";
import { checkWin, checkLose, defaultScenarioGoals } from "./goals";
import "./App.css";

function StatBar({ label, value, min = 0, max = 100, color = "blue", icon }: { label: string; value: number; min?: number; max?: number; color?: "blue" | "green" | "red" | "yellow" | "emerald" | "indigo"; icon?: string }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const colorClass = (
    {
      blue: "bg-gradient-to-r from-blue-400 to-blue-600",
      green: "bg-gradient-to-r from-green-400 to-green-600",
      red: "bg-gradient-to-r from-red-400 to-red-600",
      yellow: "bg-gradient-to-r from-yellow-400 to-yellow-600",
      emerald: "bg-gradient-to-r from-emerald-400 to-emerald-600",
      indigo: "bg-gradient-to-r from-indigo-400 to-indigo-600",
    } as const
  )[color] ?? "bg-gradient-to-r from-blue-400 to-blue-600";

  const textColorClass = (
    {
      blue: "text-blue-600",
      green: "text-green-600",
      red: "text-red-600",
      yellow: "text-yellow-600",
      emerald: "text-emerald-600",
      indigo: "text-indigo-600",
    } as const
  )[color] ?? "text-blue-600";

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center text-sm mb-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <span className="font-medium text-gray-700">{label}</span>
        </div>
        <span className={`font-bold text-sm ${textColorClass}`}>{Math.round(value)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-sm overflow-hidden">
        <div 
          className={`${colorClass} h-2.5 rounded-full transition-all duration-500 ease-out shadow-md`} 
          style={{ width: `${pct}%` }} 
        />
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
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdingChoiceId, setHoldingChoiceId] = useState<string | null>(null);
  const [showSurvey, setShowSurvey] = useState(false);
  const [profile, setProfile] = useState({ knowledge: 'beginner', risk: 'medium', region: 'US', income: 2500, fixedExpenses: initialStatsForScenario('classic').fixedExpenses, savings: 1000, debt: 0, goals: 'save more' });
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartTimeRef = useRef<number | null>(null);
  const HOLD_TIME = 1500; // 1.5 seconds to confirm
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

  // Ensure labels show only actions (no effect hints like "(+$200, -5 stress)")
  function displayChoiceLabel(s: string): string {
    // Strip a single trailing parenthetical that likely contains numbers, +/- or stat keywords
    const EFFECT_HINT_RE = /\s*\((?:[^)]*[$+\-%\d]|[^)]*(?:savings|debt|income|fixed\s*expenses|budget|happiness|stress|impulse)[^)]*)\)\s*$/i;
    return s.replace(EFFECT_HINT_RE, '').trim();
  }

  const handleMouseDown = (choice: EventChoice) => {
    if (choiceMade) return;
    setHoldingChoiceId(choice.id);
    holdStartTimeRef.current = Date.now();
    setHoldProgress(0);

    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
    }

    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - (holdStartTimeRef.current || 0);
      const progress = Math.min(100, (elapsed / HOLD_TIME) * 100);
      setHoldProgress(progress);

      if (elapsed >= HOLD_TIME) {
        clearInterval(holdTimerRef.current!);
        holdTimerRef.current = null;
        setHoldingChoiceId(null);
        handleConfirmSelection(choice);
      }
    }, 16); // ~60fps
  };

  const handleMouseUp = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldingChoiceId(null);
  };

  const handleConfirmSelection = (choice: EventChoice) => {
    if (choiceMade) return;
    setGame((g) => {
      const newStats = applyEffects(g.stats, choice.effects);
      const updated: GameState = {
        ...g,
        stats: newStats,
        log: [choice.log, ...g.log],
        lastEventId: event.id,
        lastTag: event.tag,
        lastSeen: { ...g.lastSeen, [event.id]: g.stats.month },
      };
      const win = checkWin(updated);
      const lose = checkLose(updated.stats);
      if (win.win) {
        return {
          ...updated,
          gameOver: true,
          result: { status: 'win', message: win.message ?? 'You achieved your goal!' },
        };
      }
      if (lose.lose) {
        return {
          ...updated,
          gameOver: true,
          result: { status: 'lose', message: lose.message ?? 'Game over.' },
        };
      }
      return updated;
    });
    setChoiceMade(choice);
  };

  // Confirmation of a selected choice is handled via handleConfirmSelection (long-press flow),
  // so the separate handleConfirm helper was removed to avoid an unused declaration.

  const handleNext = () => {
    setGame((g) => {
      const tick = endOfPeriodTick(g.stats);
      const updated: GameState = {
        ...g,
        stats: tick.stats,
        log: [...tick.logs, ...g.log],
      };
      const win = checkWin(updated);
      const lose = checkLose(updated.stats);
      if (win.win || lose.lose) {
        return {
          ...updated,
          gameOver: true,
          result: win.win
            ? { status: 'win', message: win.message ?? 'You achieved your goal!' }
            : { status: 'lose', message: lose.message ?? 'Game over.' },
        };
      }
      const ev = pickEvent(updated);
      setEvent(ev);
      return updated;
    });
    setChoiceMade(null);
  };

  const { stats, log } = game;

  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-gray-700 text-lg font-semibold mb-2">No Events Available</p>
          <p className="text-gray-600 text-sm">Please try generating events again or restart the game.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                💰 The Centsible Game
              </h1>
              <p className="text-gray-600 text-sm mt-1">Navigate your financial journey</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-stretch">
              <select
                className="px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold text-gray-800 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200"
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
                  setShowSurvey(false);
                }}
              >
                <option value="classic">🏠 Classic</option>
                <option value="student">🎓 Student</option>
                <option value="startup">🚀 Startup</option>
                <option value="custom">✨ Custom (AI)</option>
              </select>
              <button
                className="px-4 py-2 rounded-lg border-2 border-gray-300 hover:bg-gray-100 font-semibold text-gray-700 transition-all duration-200"
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
                🔄 New Game
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold hover:shadow-lg transition-all"
                onClick={() => saveGame(game)}
              >
                💾 Save
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        {game.gameOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full border border-gray-200 text-center">
              <div className="text-5xl mb-4">{game.result?.status === 'win' ? '🏆' : '💥'}</div>
              <h2 className="text-3xl font-extrabold mb-2">
                {game.result?.status === 'win' ? 'Congratulations!' : 'Game Over'}
              </h2>
              <p className="text-gray-700 mb-6">{game.result?.message}</p>
              <div className="flex gap-3 justify-center">
                <button
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
                  onClick={() => {
                    const freshStats = initialStatsForScenario(game.scenarioId);
                    const reset: GameState = {
                      ...initialGameState,
                      stats: freshStats,
                      scenarioId: game.scenarioId,
                      lastSeen: {},
                      log: ["New game started."],
                      // Preserve custom goal when replaying custom scenario
                      goalDescription: game.goalDescription,
                      winCondition: game.winCondition,
                    };
                    setGame(reset);
                    setEvent(pickEvent(reset));
                    setChoiceMade(null);
                  }}
                >
                  🔁 Replay Scenario
                </button>
                <button
                  className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    // Allow switching scenario after closing popup
                    setGame((g) => ({ ...g, gameOver: false, result: undefined }));
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        {showSurvey && game.scenarioId === 'custom' ? (
          <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Let's Learn About You</h2>
            <p className="text-gray-600 mb-6">Answer a few questions so we can personalize your financial journey</p>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={async (e) => {
                e.preventDefault();
                setLoadingAi(true);
                setAiError(null);
                try {
                  // Basic validation
                  if (Number.isNaN(Number(profile.income)) || Number(profile.income) < 0) throw new Error('Income must be a non-negative number');
                  if (Number.isNaN(Number(profile.fixedExpenses)) || Number(profile.fixedExpenses) < 0) throw new Error('Monthly Fixed Expenses must be a non-negative number');
                  if (Number.isNaN(Number(profile.savings)) || Number(profile.savings) < 0) throw new Error('Savings must be a non-negative number');
                  if (Number.isNaN(Number(profile.debt)) || Number(profile.debt) < 0) throw new Error('Debt must be a non-negative number');

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
                    fixedExpenses: Number(profile.fixedExpenses) || base.fixedExpenses,
                    budget: (Number(profile.income) || base.income) - (Number(profile.fixedExpenses) || base.fixedExpenses),
                    savings: Number(profile.savings) || base.savings,
                    debt: Number(profile.debt) || base.debt,
                    impulse: riskImpulse,
                  };
                  const goalFromAi = data.goal ?? null;
                  const newState: GameState = {
                    ...initialGameState,
                    stats: computedStats,
                    scenarioId: 'custom',
                    lastSeen: {},
                    log: [`Loaded ${data.events?.length ?? 0} AI events`],
                    goalDescription: goalFromAi?.description,
                    winCondition: goalFromAi?.winCondition,
                  };
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
              <label className="flex flex-col gap-2">
                <span className="font-semibold text-gray-800">🧠 Financial Knowledge</span>
                <select className="border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500" value={profile.knowledge} onChange={(e) => setProfile({ ...profile, knowledge: e.target.value })}>
                  <option value="beginner">Beginner - Just starting out</option>
                  <option value="intermediate">Intermediate - Some experience</option>
                  <option value="advanced">Advanced - Well-versed</option>
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <span className="font-semibold text-gray-800">📊 Risk Tolerance</span>
                <select className="border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500" value={profile.risk} onChange={(e) => setProfile({ ...profile, risk: e.target.value })}>
                  <option value="low">Low - Play it safe</option>
                  <option value="medium">Medium - Balanced approach</option>
                  <option value="high">High - Take bold moves</option>
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <span className="font-semibold text-gray-800">🌍 Region/Country</span>
                <input className="border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500" value={profile.region} onChange={(e) => setProfile({ ...profile, region: e.target.value })} placeholder="e.g., US, UK, Singapore" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="font-semibold text-gray-800">💵 Monthly Income ($)</span>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-600">$</span>
                  <input type="number" min={0} className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 pl-6 focus:outline-none focus:border-purple-500" value={profile.income} onChange={(e) => setProfile({ ...profile, income: Number(e.target.value) })} />
                </div>
              </label>
              <label className="flex flex-col gap-2">
                <span className="font-semibold text-gray-800">📆 Monthly Fixed Expenses ($)</span>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-600">$</span>
                  <input type="number" min={0} className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 pl-6 focus:outline-none focus:border-purple-500" value={profile.fixedExpenses} onChange={(e) => setProfile({ ...profile, fixedExpenses: Number(e.target.value) })} />
                </div>
              </label>
              <label className="flex flex-col gap-2">
                <span className="font-semibold text-gray-800">🏦 Current Savings</span>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-600">$</span>
                  <input type="number" className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 pl-6 focus:outline-none focus:border-purple-500" value={profile.savings} onChange={(e) => setProfile({ ...profile, savings: Number(e.target.value) })} />
                </div>
              </label>
              <label className="flex flex-col gap-2">
                <span className="font-semibold text-gray-800">💳 Current Debt</span>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-600">$</span>
                  <input type="number" className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 pl-6 focus:outline-none focus:border-purple-500" value={profile.debt} onChange={(e) => setProfile({ ...profile, debt: Number(e.target.value) })} />
                </div>
              </label>
              <label className="flex flex-col gap-2 md:col-span-2">
                <span className="font-semibold text-gray-800">🎯 Your Financial Goal</span>
                <textarea className="border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500" value={profile.goals} onChange={(e) => setProfile({ ...profile, goals: e.target.value })} placeholder="e.g., Build an emergency fund, pay off debt, invest for retirement..." rows={2} />
              </label>
              {aiError && <div className="md:col-span-2 bg-red-100 border-2 border-red-400 text-red-800 px-4 py-3 rounded-lg font-semibold">{aiError}</div>}
              <div className="md:col-span-2 flex gap-3">
                <button disabled={loadingAi} className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-bold hover:shadow-lg disabled:opacity-50" type="submit">
                  {loadingAi ? '⏳ Generating Events...' : '✨ Generate AI Events'}
                </button>
                <button type="button" className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50" onClick={() => setShowSurvey(false)}>Cancel</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sidebar */}
            <aside className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 lg:col-span-1 order-2 lg:order-1">
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="inline-flex items-center gap-2 bg-blue-100 rounded-full px-4 py-2">
                  <span className="text-2xl">📅</span>
                  <span className="font-bold text-gray-800">Month {stats.month}</span>
                </div>
              </div>
              <div className="mb-6 pb-4 border-b border-gray-200">
                <p className="text-xs font-bold text-gray-700 mb-1 uppercase">🎯 Goal</p>
                <p className="text-sm text-gray-800">
                  {game.goalDescription ?? defaultScenarioGoals[game.scenarioId].description}
                </p>
              </div>
              
              <div className="space-y-4 mb-6 pb-4 border-b border-gray-200">
                <StatBar label="Savings" value={stats.savings} min={0} max={10000} color="emerald" icon="🏦" />
                <StatBar label="Debt" value={stats.debt} min={0} max={10000} color="red" icon="💳" />
                <StatBar label="Income" value={stats.income} min={0} max={5000} color="blue" icon="💵" />
              </div>

              <div className="space-y-4 mb-6 pb-4 border-b border-gray-200">
                <StatBar label="Happiness" value={stats.happiness} min={0} max={100} color="green" icon="😊" />
                <StatBar label="Stress" value={stats.stress} min={0} max={100} color="red" icon="😰" />
                <StatBar label="Impulse" value={stats.impulse} min={0} max={100} color="yellow" icon="🎯" />
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200">
                <p className="text-xs font-bold text-gray-700 mb-3 uppercase">💰 Financial Overview</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Income:</span>
                    <span className="font-bold text-blue-600">${stats.income}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Expenses:</span>
                    <span className="font-bold text-orange-600">${stats.fixedExpenses}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-blue-200">
                    <span className="font-bold text-gray-800">Budget:</span>
                    <span className={`font-bold ${(stats.income - stats.fixedExpenses) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${Math.max(0, stats.income - stats.fixedExpenses)}
                    </span>
                  </div>
                </div>
              </div>
            </aside>
            
            {/* Main Content */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200 lg:col-span-2 order-1 lg:order-2">
              <div className="mb-8">
                <div className="inline-block bg-gradient-to-r from-blue-100 to-purple-100 px-4 py-2 rounded-full mb-4">
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    event.tag === 'career' ? 'text-blue-700' :
                    event.tag === 'lifestyle' ? 'text-pink-700' :
                    event.tag === 'social' ? 'text-purple-700' :
                    event.tag === 'finance' ? 'text-green-700' :
                    'text-red-700'
                  }`}>
                    {event.tag.toUpperCase()}
                  </span>
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">{event.title}</h2>
                <p className="text-gray-700 leading-relaxed mb-6">{event.description}</p>
                
                <p className="text-center text-sm text-gray-500 mb-4">👇 Hold on a choice for 1.5 seconds to select it</p>
                
                <div className="flex flex-col gap-3">
                  {event.choices.map((choice) => (
                    <div key={choice.id} className="relative">
                      <button
                        onMouseDown={() => handleMouseDown(choice)}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchStart={() => handleMouseDown(choice)}
                        onTouchEnd={handleMouseUp}
                        className={`w-full px-6 py-3 rounded-lg border-2 text-left font-semibold transition-all ${
                          choiceMade?.id === choice.id
                            ? "bg-green-100 border-green-500 text-gray-900"
                            : (holdingChoiceId === choice.id
                                ? "bg-blue-50 border-blue-500 text-gray-900 scale-105"
                                : "bg-white border-gray-300 hover:border-purple-500 hover:bg-purple-50 text-gray-900")
                        } disabled:opacity-50 select-none`}
                        disabled={!!choiceMade}
                      >
                        {displayChoiceLabel(choice.label)}
                      </button>
                      
                      {/* Progress Bar */}
                      {holdingChoiceId === choice.id && holdProgress > 0 && (
                        <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600 rounded-b-lg transition-all"
                          style={{ width: `${holdProgress}%` }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {choiceMade && (
                <div className="mb-6 p-4 bg-green-100 border-2 border-green-500 rounded-lg">
                  <p className="text-green-800 font-bold">✅ {choiceMade.log}</p>
                </div>
              )}
              
              <div className="flex gap-3 mb-6">
                <button
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold disabled:opacity-50 transition-all"
                  onClick={handleNext}
                  disabled={!choiceMade}
                >
                  → Next Event
                </button>
              </div>
              
              {choiceMade && (
                <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                  <p className="text-sm text-gray-800 leading-relaxed">
                    <span className="font-bold text-blue-600">📝 Impact: </span>
                    {choiceMade.explain ?? synthesizeExplanation(choiceMade.effects)}
                  </p>
                </div>
              )}
              
              <div className="pt-4 border-t border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3">📜 Event Log</h3>
                <div className="bg-gray-50 rounded-lg p-4 max-h-40 overflow-y-auto">
                  <ul className="text-sm text-gray-700 space-y-2">
                    {log.slice(0, 10).map((entry, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-blue-600 flex-shrink-0">→</span>
                        <span>{entry}</span>
                      </li>
                    ))}
                    {log.length > 10 && (
                      <li className="text-xs text-gray-500 italic pt-2">... and {log.length - 10} more entries</li>
                    )}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
