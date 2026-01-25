"use client";

import { useCallback, useEffect, useState } from "react";
import { GalaxyViewport } from "../components/GalaxyViewport";
import { hexToRgb, rgbToHex } from "../lib/color";
import type {
  CelestialBody,
  CountryDefinition,
  EditMode,
  Galaxy,
  ResourceDefinition,
  Selection,
  Star,
  ViewMode,
} from "../lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function Home() {
  const [galaxy, setGalaxy] = useState<Galaxy | undefined>();
  const [selection, setSelection] = useState<Selection | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>("galaxy");
  const [editMode, setEditMode] = useState<EditMode>("view");
  const [selectedStar, setSelectedStar] = useState<number | undefined>();
  const [editedStar, setEditedStar] = useState<Star | undefined>();
  const [editedBody, setEditedBody] = useState<CelestialBody | undefined>();
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
      console.error(err);
      setStatus("Failed to load galaxy.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = useCallback((sel: Selection) => {
    setSelection(sel);
    if (sel.type === "star") {
      setViewMode("system");
      setSelectedStar(sel.id);
      setEditedStar(galaxy?.stars[sel.id]);
    }
  }, [galaxy]);

  const handleDeselect = useCallback(() => {
    setSelection(undefined);
    setViewMode("galaxy");
    setSelectedStar(undefined);
    setEditedStar(undefined);
    setEditedBody(undefined);
  }, []);

  useEffect(() => {
    if (selection?.type === "body" && editedStar) {
      setEditedBody({...editedStar.bodies[selection.bodyIdx]});
    } else {
      setEditedBody(undefined);
    }
  }, [selection, editedStar]);

  return (
    <div className="app">
      <div className="tabs">
        {(["view", "geography", "political", "lore"] as EditMode[]).map(mode => (
          <button key={mode} className={editMode === mode ? "active" : ""} onClick={() => setEditMode(mode)}>
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>
      <div className="viewport">
        <GalaxyViewport
          galaxy={galaxy}
          selection={selection as Selection | undefined}
          onSelect={handleSelect}
          onDeselect={handleDeselect}
          viewMode={viewMode}
          editMode={editMode}
          resourceDefs={resourceDefs}
          countryDefs={countryDefs}
          selectedStar={selectedStar}
        />
      </div>
      {viewMode === "system" && editedStar && (
        <div className="sidebar">
          {editedBody ? (
            <>
              <h3>Body Editor</h3>
              <button onClick={() => setSelection({type: "star", id: selectedStar!})}>Back to Star</button>
              <label>
                Name: <input type="text" value={editedBody.name} onChange={(e) => setEditedBody({...editedBody, name: e.target.value})} />
              </label>
              <label>
                Type: <input type="text" value={editedBody.type} readOnly />
              </label>
              <button onClick={() => {
                const newBodies = [...editedStar.bodies];
                newBodies[(selection as any).bodyIdx] = editedBody;
                setEditedStar({...editedStar, bodies: newBodies});
                setSelection({type: "star", id: selectedStar!});
              }}>Save</button>
            </>
          ) : (
            <>
              <h3>Star Editor</h3>
              <label>
                Name: <input type="text" value={editedStar.name} onChange={(e) => setEditedStar({...editedStar, name: e.target.value})} />
              </label>
              <label>
                Type: <input type="text" value={editedStar.star_type} readOnly />
              </label>
              <label>
                Description: <textarea value={editedStar.description} onChange={(e) => setEditedStar({...editedStar, description: e.target.value})} />
              </label>
              <h4>Admin Levels</h4>
              <datalist id="countries">
                {countryDefs.map((country, idx) => (
                  <option key={idx} value={country.name} />
                ))}
              </datalist>
              {[0, 1, 2, 3].map(level => {
                const countryIdx = editedStar.admin_levels[level];
                const country = countryIdx != null ? countryDefs[countryIdx] : null;
                return (
                  <div key={level} style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <label>
                      Level {level}: 
                      <input 
                        type="text" 
                        list="countries"
                        value={country?.name ?? ""} 
                        onChange={(e) => {
                          const newLevels = [...editedStar.admin_levels];
                          const idx = countryDefs.findIndex(c => c.name === e.target.value);
                          newLevels[level] = idx >= 0 ? idx : null;
                          setEditedStar({...editedStar, admin_levels: newLevels});
                        }}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value && !countryDefs.some(c => c.name === value)) {
                            if (confirm(`Create new country "${value}"?`)) {
                              const randomColor: [number, number, number] = [
                                Math.floor(Math.random() * 256),
                                Math.floor(Math.random() * 256),
                                Math.floor(Math.random() * 256)
                              ];
                              const newCountry = { name: value, color: randomColor };
                              setCountryDefs([...countryDefs, newCountry]);
                              const newLevels = [...editedStar.admin_levels];
                              newLevels[level] = countryDefs.length;
                              setEditedStar({...editedStar, admin_levels: newLevels});
                            } else {
                              // Reset to previous
                              const newLevels = [...editedStar.admin_levels];
                              newLevels[level] = countryIdx;
                              setEditedStar({...editedStar, admin_levels: newLevels});
                            }
                          }
                        }}
                      />
                    </label>
                    {country && (
                      <input 
                        type="color" 
                        value={rgbToHex(country.color)} 
                        onChange={(e) => {
                          if (countryIdx != null) {
                            const newDefs = [...countryDefs];
                            newDefs[countryIdx].color = hexToRgb(e.target.value);
                            setCountryDefs(newDefs);
                          }
                        }}
                      />
                    )}
                  </div>
                );
              })}
              <h4>Celestial Bodies</h4>
              {editedStar.bodies.map((body, idx) => (
                <button key={idx} onClick={() => setSelection({type: "body", starId: selectedStar!, bodyIdx: idx})}>
                  {body.name} ({body.type})
                </button>
              ))}
              <button>Save</button>
            </>
          )}
        </div>
      )}
      <div className="bottom-bar">
        {viewMode === "system" && (
          <button onClick={() => setViewMode("galaxy")}>Back to Galaxy</button>
        )}
        <button onClick={refreshGalaxy} disabled={loading}>
          {loading ? "Loading..." : "Refresh Galaxy"}
        </button>
        <div className="status">{status}</div>
      </div>
    </div>
  );
}
