"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GalaxyViewport } from "../components/GalaxyViewport";
import { SaveMenu } from "../components/SaveMenu";
import type {
  CountryDefinition,
  Galaxy,
  ResourceDefinition,
  SaveSlot,
  Selection,
  ViewMode,
} from "../lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

const seedSaves: SaveSlot[] = [
  { id: "alpha", name: "Atlas Run", tick: 4120, updatedAt: "Just now" },
  { id: "beta", name: "Perihelion Drift", tick: 1580, updatedAt: "1 day ago" },
];

export default function Home() {
  const [view, setView] = useState<"menu" | "game">("menu");
  const [saves, setSaves] = useState<SaveSlot[]>(seedSaves);
  const [activeSave, setActiveSave] = useState<SaveSlot | null>(null);
  const [galaxy, setGalaxy] = useState<Galaxy | undefined>();
  const [selection, setSelection] = useState<Selection>(null);
  const [leftPanel, setLeftPanel] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("countries");
  const [resourceDefs, setResourceDefs] = useState<ResourceDefinition[]>([]);
  const [countryDefs, setCountryDefs] = useState<CountryDefinition[]>([]);
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

  useEffect(() => {
    if (view === "game" && !galaxy) {
      refreshGalaxy();
    }
  }, [view, galaxy, refreshGalaxy]);

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
        }}
        onDeselect={() => setSelection(null)}
        viewMode={viewMode}
        resourceDefs={resourceDefs}
        countryDefs={countryDefs}
      />

      <div className="overlay">
        <div className="left-rail">
          {["📡", "🛰️", "📜", "⚙️"].map((icon) => (
            <div
              key={icon}
              className="floating-icon"
              onClick={() => setLeftPanel((curr) => (curr === icon ? null : icon))}
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

        {selection && (
          <div className="sidebar right">
            {rightPanelContent}
            <div style={{ marginTop: 14 }}>
              <p style={{ color: "var(--muted)" }}>Click blank space to close this pane.</p>
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
