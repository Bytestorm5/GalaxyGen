"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GalaxyViewport } from "../components/GalaxyViewport";
import { SaveMenu } from "../components/SaveMenu";
import type {
  CountryDefinition,
  EmpireEconomy,
  Galaxy,
  ResourceDefinition,
  SaveSlot,
  Selection,
  ViewMode,
} from "../lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

const seedSaves: SaveSlot[] = [
  { id: "alpha", name: "Atlas Run", tick: 0, updatedAt: "Just now" },
];

export default function Home() {
  const [view, setView] = useState<"menu" | "game">("menu");
  const [saves, setSaves] = useState<SaveSlot[]>(seedSaves);
  const [activeSave, setActiveSave] = useState<SaveSlot | null>(null);
  const [galaxy, setGalaxy] = useState<Galaxy | undefined>();
  const [selection, setSelection] = useState<Selection>(null);
  const [leftPanel, setLeftPanel] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<"selection" | "economy" | null>(null);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("countries");
  const [resourceDefs, setResourceDefs] = useState<ResourceDefinition[]>([]);
  const [countryDefs, setCountryDefs] = useState<CountryDefinition[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [economy, setEconomy] = useState<EmpireEconomy | null>(null);
  const [budgetForm, setBudgetForm] = useState({ tax: 0.15, infra: 0, grants: 0 });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const refreshGalaxy = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/galaxy`);
      const data = await res.json();
      setGalaxy(data.galaxy);
      setResourceDefs(data.resources ?? []);
      setCountryDefs(data.countries ?? []);
      setStatus("Synced galaxy from API.");
    } catch (err) {
      setStatus("Unable to reach API.");
    } finally {
      setLoading(false);
    }
  }, []);

  const generateGalaxy = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/galaxy/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_count: 1200, use_resources: true }),
      });
      const data = await res.json();
      setGalaxy(data.galaxy);
      setResourceDefs(data.resources ?? []);
      setCountryDefs(data.countries ?? []);
      const now = new Date().toLocaleString();
      const newSave: SaveSlot = { id: crypto.randomUUID(), name: `New Save ${saves.length + 1}`, tick: 0, updatedAt: now };
      setSaves((prev) => [newSave, ...prev]);
      setActiveSave(newSave);
      setView("game");
      setStatus("Generated and loaded a new galaxy.");
      setTick(0);
    } catch (err) {
      setStatus("Generation failed.");
    } finally {
      setLoading(false);
    }
  }, [saves.length]);

  const bootstrapSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setSessionId(data.session_id);
      setTick(data.state.clock.tick);
    } catch (err) {
      setStatus("Unable to create session.");
    }
  }, []);

  useEffect(() => {
    if (view === "game" && !galaxy) {
      refreshGalaxy();
    }
  }, [view, galaxy, refreshGalaxy]);

  useEffect(() => {
    if (view === "game" && !sessionId) {
      bootstrapSession();
    }
  }, [bootstrapSession, sessionId, view]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!paused) {
        setTick((t) => t + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    if (!activeSave) return;
    setSaves((prev) => prev.map((s) => (s.id === activeSave.id ? { ...s, tick } : s)));
  }, [activeSave, tick]);

  const startSave = (slot: SaveSlot) => {
    setActiveSave(slot);
    setTick(slot.tick);
    setView("game");
    refreshGalaxy();
    bootstrapSession();
  };

  const renameSave = (id: string, name: string) => {
    setSaves((prev) => prev.map((s) => (s.id === id ? { ...s, name, updatedAt: "Just now" } : s)));
  };

  const duplicateSave = (id: string) => {
    setSaves((prev) => {
      const target = prev.find((s) => s.id === id);
      if (!target) return prev;
      const clone = { ...target, id: crypto.randomUUID(), name: `${target.name} Copy`, updatedAt: "Just now" };
      return [clone, ...prev];
    });
  };

  const deleteSave = (id: string) => {
    setSaves((prev) => prev.filter((s) => s.id !== id));
    if (activeSave?.id === id) {
      setActiveSave(null);
      setView("menu");
    }
  };

  const fetchEconomy = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/economy`);
      const data = await res.json();
      setEconomy(data.economy);
    } catch (err) {
      setStatus("Unable to fetch economy.");
    }
  }, [sessionId]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (sessionId) {
      interval = setInterval(async () => {
        try {
          await fetch(`${API_BASE}/sessions/${sessionId}/tick`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ steps: 1 }),
          });
          await fetchEconomy();
        } catch (e) {
          // ignore for now
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchEconomy, sessionId]);

  const updateBudget = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          income_tax_rate: budgetForm.tax,
          infrastructure_investment: budgetForm.infra,
          rd_grants: budgetForm.grants,
        }),
      });
      const data = await res.json();
      setEconomy(data.economy);
      setStatus("Budget updated.");
    } catch (err) {
      setStatus("Budget update failed.");
    }
  };

  const rightPanelContent = useMemo(() => {
    if (!selection || !galaxy) return null;
    if (selection.type === "star") {
      const star = galaxy.stars[selection.id];
      return (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Star #{selection.id}</h3>
            <button className="close" onClick={() => setSelection(null)}>
              ✕
            </button>
          </div>
          <p style={{ color: "var(--muted)" }}>
            Position: ({star.x}, {star.y})
          </p>
        </>
      );
    }
    const lane = galaxy.hyperlanes[selection.id];
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Hyperlane #{selection.id}</h3>
          <button className="close" onClick={() => setSelection(null)}>
            ✕
          </button>
        </div>
        <p style={{ color: "var(--muted)" }}>
          Connects stars {lane.a} ↔ {lane.b}
        </p>
      </>
    );
  }, [galaxy, selection]);

  if (view === "menu") {
    return (
      <SaveMenu
        saves={saves}
        onStart={startSave}
        onGenerate={generateGalaxy}
        onRename={renameSave}
        onDuplicate={duplicateSave}
        onDelete={deleteSave}
      />
    );
  }

  return (
    <div className="game-shell">
      <GalaxyViewport
        galaxy={galaxy}
        selection={selection}
        onSelect={(sel) => {
          setSelection(sel);
          setRightPanel("selection");
        }}
        onDeselect={() => {
          setSelection(null);
          if (rightPanel === "selection") setRightPanel(null);
        }}
        viewMode={viewMode}
        resourceDefs={resourceDefs}
        countryDefs={countryDefs}
      />

      <div className="overlay">
        <div className="left-rail">
          {["📡", "💰", "🛰️", "⚙️"].map((icon) => (
            <div
              key={icon}
              className="floating-icon"
              onClick={() => {
                if (icon === "💰") {
                  setRightPanel("economy");
                  fetchEconomy();
                } else {
                  setLeftPanel((curr) => (curr === icon ? null : icon));
                }
              }}
              title="Open panel"
            >
              <span style={{ fontSize: 18 }}>{icon}</span>
            </div>
          ))}
        </div>

        {leftPanel && (
          <div className="sidebar left">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Panel {leftPanel}</h3>
              <button className="close" onClick={() => setLeftPanel(null)}>
                ✕
              </button>
            </div>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>
              This is a placeholder for future fleet/empire overlays. Swap the icon list on the left to add more modules.
            </p>
          </div>
        )}

        {rightPanel === "selection" && selection && (
          <div className="sidebar right">
            {rightPanelContent}
            <div style={{ marginTop: 14 }}>
              <p style={{ color: "var(--muted)" }}>Click blank space to close this pane.</p>
            </div>
          </div>
        )}

        {rightPanel === "economy" && (
          <div className="sidebar right">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Economy</h3>
              <button className="close" onClick={() => setRightPanel(null)}>
                ✕
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <p style={{ color: "var(--muted)" }}>Budget & macro overview for your empire.</p>
              {economy ? (
                <>
                  <div className="pill" style={{ marginTop: 8 }}>
                    Debt: {economy.budget.debt.toFixed(0)} | Credit: {economy.budget.credit_availability.toFixed(2)}
                  </div>
                  {economy.planets.slice(0, 1).map((p) => {
                    const pop = p.population.cohorts.reduce((a, b) => a + b, 0);
                    return (
                      <div key={p.id} style={{ marginTop: 12 }}>
                        <strong>{p.id}</strong>
                        <p style={{ color: "var(--muted)" }}>
                          Pop: {(pop / 1e9).toFixed(2)}B | QoL: {p.qol.toFixed(2)} | Housing price:{" "}
                          {p.housing.price.toFixed(2)} | Vacancy: {(p.housing.vacancy_rate * 100).toFixed(1)}%
                        </p>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 12 }}>
                    <h4>Budget Controls</h4>
                    <div style={{ display: "grid", gap: 8 }}>
                      <label>
                        Income Tax Rate
                        <input
                          type="number"
                          min={0}
                          max={0.9}
                          step={0.01}
                          value={budgetForm.tax}
                          onChange={(e) => setBudgetForm((f) => ({ ...f, tax: Number(e.target.value) }))}
                          style={{ width: "100%", marginTop: 4 }}
                        />
                      </label>
                      <label>
                        Infrastructure Investment
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={budgetForm.infra}
                          onChange={(e) => setBudgetForm((f) => ({ ...f, infra: Number(e.target.value) }))}
                          style={{ width: "100%", marginTop: 4 }}
                        />
                      </label>
                      <label>
                        R&D Grants
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={budgetForm.grants}
                          onChange={(e) => setBudgetForm((f) => ({ ...f, grants: Number(e.target.value) }))}
                          style={{ width: "100%", marginTop: 4 }}
                        />
                      </label>
                      <button onClick={updateBudget}>Apply Budget</button>
                    </div>
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--muted)" }}>Loading economy…</p>
              )}
            </div>
          </div>
        )}

        <div className="bottom-bar">
          <div className="toolbar">
            <button onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</button>
            <div className="pill">Tick {tick.toLocaleString()}</div>
            {activeSave ? <div className="pill">{activeSave.name}</div> : null}
          </div>
          <div className="toolbar">
            <div className="pill" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => setViewMode("countries")}
                style={{ opacity: viewMode === "countries" ? 1 : 0.6 }}
              >
                Countries
              </button>
              <button
                onClick={() => setViewMode("resources")}
                style={{ opacity: viewMode === "resources" ? 1 : 0.6 }}
              >
                Resources
              </button>
            </div>
            <div className="stat">{loading ? "Talking to API..." : status || "Drag to pan, scroll to zoom."}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
