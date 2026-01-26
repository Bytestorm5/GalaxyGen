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
  const [adminDraft, setAdminDraft] = useState<Record<number, string>>({});
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, type: 'empty' | 'star' | 'lane', id?: number} | null>(null);
  const [addingHyperlane, setAddingHyperlane] = useState(false);
  const [hyperlaneFrom, setHyperlaneFrom] = useState<number | null>(null);
  const [galaxySelection, setGalaxySelection] = useState<{type: 'star' | 'lane', id: number} | null>(null);
  const [selectedAdminForPaint, setSelectedAdminForPaint] = useState<number | null>(null);
  const [adminFocus, setAdminFocus] = useState<(number | null)[]>([]);

  const getDivisionOptions = (level: number, adminLevels: (number | null)[]): string[] => {
    if (level === 0) {
      return countryDefs.map(c => c.name);
    } else if (level === 1) {
      const countryIdx = adminLevels[0];
      if (countryIdx != null) {
        return countryDefs[countryIdx].sectors.map(s => s.name);
      }
    } else if (level === 2) {
      const countryIdx = adminLevels[0];
      const sectorIdx = adminLevels[1];
      if (countryIdx != null && sectorIdx != null) {
        return countryDefs[countryIdx].sectors[sectorIdx].provinces.map(p => p.name);
      }
    } else if (level === 3) {
      const countryIdx = adminLevels[0];
      const sectorIdx = adminLevels[1];
      const provinceIdx = adminLevels[2];
      if (countryIdx != null && sectorIdx != null && provinceIdx != null) {
        return countryDefs[countryIdx].sectors[sectorIdx].provinces[provinceIdx].clusters.map(c => c.name);
      }
    }
    return [];
  };

  useEffect(() => {
    if (saveTimeout) clearTimeout(saveTimeout);
    setSaveTimeout(setTimeout(() => {
      if (editedStar) saveStar();
    }, 1000)); // autosave after 1 second of inactivity
  }, [editedStar]);

  const saveStar = useCallback(async () => {
    if (!galaxy || selectedStar === undefined || !editedStar) return;
    setLoading(true);
    try {
      const updatedGalaxy = { ...galaxy };
      updatedGalaxy.stars[selectedStar] = editedStar;
      const res = await fetch(`${API_BASE}/galaxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ galaxy: updatedGalaxy, countries: countryDefs }),
      });
      if (res.ok) {
        setGalaxy(updatedGalaxy);
        setStatus("Star saved successfully.");
      } else {
        setStatus("Failed to save star.");
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to save star.");
    } finally {
      setLoading(false);
    }
  }, [galaxy, selectedStar, editedStar, countryDefs]);

  const saveGalaxy = useCallback(async (updatedGalaxy: Galaxy, oldGalaxy?: Galaxy) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/galaxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ galaxy: updatedGalaxy, countries: countryDefs }),
      });
      if (res.ok) {
        setGalaxy(updatedGalaxy);
        setStatus("Galaxy saved successfully.");
      } else {
        setStatus("Failed to save galaxy.");
        if (oldGalaxy) setGalaxy(oldGalaxy);
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to save galaxy.");
      if (oldGalaxy) setGalaxy(oldGalaxy);
    } finally {
      setLoading(false);
    }
  }, [countryDefs]);

  const handleContextMenu = useCallback((type: 'empty' | 'star' | 'lane', clientX: number, clientY: number, id?: number) => {
    setContextMenu({x: clientX, y: clientY, type, id});
  }, []);

  const handleGalaxyClick = useCallback(async (type: 'empty' | 'star' | 'lane', shiftKey: boolean, id?: number, position?: {x: number, y: number}) => {
    if (addingHyperlane && type === 'star' && id !== undefined && hyperlaneFrom !== null && id !== hyperlaneFrom) {
      // add hyperlane
      if (!galaxy) return;
      const oldGalaxy = galaxy;
      const newGalaxy = { ...galaxy, hyperlanes: [...galaxy.hyperlanes, { a: hyperlaneFrom, b: id }] };
      setGalaxy(newGalaxy);
      saveGalaxy(newGalaxy, oldGalaxy);
      setAddingHyperlane(false);
      setHyperlaneFrom(null);
    } else if (editMode === 'political' && selectedAdminForPaint !== null && type === 'star' && id !== undefined) {
      // assign admin
      if (!galaxy) return;
      const oldGalaxy = galaxy;
      const newStars = [...galaxy.stars];
      newStars[id] = { ...newStars[id], admin_levels: [...newStars[id].admin_levels] };
      newStars[id].admin_levels[adminFocus.length] = selectedAdminForPaint;
      // clear lower levels
      for (let i = adminFocus.length + 1; i < 4; i++) {
        newStars[id].admin_levels[i] = null;
      }
      const newGalaxy = { ...galaxy, stars: newStars };
      setGalaxy(newGalaxy);
      if (selectedStar === id) {
        setEditedStar(newStars[id]);
      }
      saveGalaxy(newGalaxy, oldGalaxy);
    } else if (editMode === 'geography' && shiftKey && type === 'empty') {
      // add star
      if (!galaxy || !position) return;
      const oldGalaxy = galaxy;
      const x = Math.round(position.x);
      const y = Math.round(position.y);
      
      // Check if we need to expand galaxy bounds
      const buffer = 100;
      let newWidth = galaxy.width;
      let newHeight = galaxy.height;
      
      if (x < 0) {
        newWidth = Math.max(newWidth, galaxy.width - x + buffer);
      } else if (x >= galaxy.width) {
        newWidth = Math.max(newWidth, x + buffer);
      }
      
      if (y < 0) {
        newHeight = Math.max(newHeight, galaxy.height - y + buffer);
      } else if (y >= galaxy.height) {
        newHeight = Math.max(newHeight, y + buffer);
      }
      
      // Create temporary star for generation
      const tempStar = {
        x,
        y,
        name: "",
        description: "",
        star_type: "G" as const,
        admin_levels: [null, null, null, null],
        bodies: []
      };
      const tempGalaxy = { ...galaxy, width: newWidth, height: newHeight, stars: [...galaxy.stars, tempStar] };
      
      try {
        // Generate system profile
        const res = await fetch(`${API_BASE}/galaxy/generate-system`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ galaxy: tempGalaxy, star_index: galaxy.stars.length }),
        });
        if (!res.ok) throw new Error('Failed to generate system');
        const profile = await res.json();
        const generatedName = typeof profile.name === "string" ? profile.name.trim() : "";
        
        // Create star with generated properties
        const newStar: Star = {
          x,
          y,
          name: generatedName || `Star ${galaxy.stars.length + 1}`,
          description: `A ${profile.classification} type star`,
          star_type: profile.classification,
          admin_levels: [null, null, null, null],
          bodies: profile.bodies.map((body: any, idx: number) => {
            const rawName = typeof body.name === "string" ? body.name.trim() : "";
            let name = rawName || `Body ${idx + 1}`;
            if (body.type === "asteroid_belt" && !name.endsWith(" Belt")) {
              name = `${name} Belt`;
            }
            return {
              name,
              type: body.type,
              distance_au: body.dist_au,
              angle_deg: 0.0,
              radius_km: 1000.0, // placeholder
            };
          })
        };
        
        const newGalaxy = { ...galaxy, width: newWidth, height: newHeight, stars: [...galaxy.stars, newStar] };
        setGalaxy(newGalaxy);
        saveGalaxy(newGalaxy, oldGalaxy);
      } catch (err) {
        console.error('Failed to generate system:', err);
        // Fallback to basic star creation
        const newStar = {
          x,
          y,
          name: `Star ${galaxy.stars.length + 1}`,
          description: "",
          star_type: "G" as const,
          admin_levels: [null, null, null, null],
          bodies: []
        };
        const newGalaxy = { ...galaxy, width: newWidth, height: newHeight, stars: [...galaxy.stars, newStar] };
        setGalaxy(newGalaxy);
        saveGalaxy(newGalaxy, oldGalaxy);
      }
    } else {
      // select
      if (type === 'star' || type === 'lane') {
        setGalaxySelection({ type, id: id! });
      } else {
        setGalaxySelection(null);
      }
      setAddingHyperlane(false);
      setHyperlaneFrom(null);
    }
  }, [addingHyperlane, hyperlaneFrom, editMode, selectedAdminForPaint, adminFocus, galaxy, saveGalaxy]);

  const handleGalaxyKeyDown = useCallback((key: string) => {
    if (key === 'Delete' && galaxySelection) {
      if (!galaxy) return;
      if (galaxySelection.type === 'star') {
        const oldGalaxy = galaxy;
        const newGalaxy = { ...galaxy };
        newGalaxy.stars = galaxy.stars.filter((_, i) => i !== galaxySelection.id);
        // adjust hyperlane indices
        newGalaxy.hyperlanes = galaxy.hyperlanes
          .filter(l => l.a !== galaxySelection.id && l.b !== galaxySelection.id)
          .map(l => ({
            a: l.a > galaxySelection.id ? l.a - 1 : l.a,
            b: l.b > galaxySelection.id ? l.b - 1 : l.b
          }));
        setGalaxy(newGalaxy);
        saveGalaxy(newGalaxy, oldGalaxy);
      } else if (galaxySelection.type === 'lane') {
        const oldGalaxy = galaxy;
        const newGalaxy = { ...galaxy, hyperlanes: galaxy.hyperlanes.filter((_, i) => i !== galaxySelection.id) };
        setGalaxy(newGalaxy);
        saveGalaxy(newGalaxy, oldGalaxy);
      }
      setGalaxySelection(null);
    }
  }, [galaxySelection, galaxy, saveGalaxy]);

  const getDivisionName = (level: number, adminLevels: (number | null)[]): string => {
    if (level === 0) {
      const idx = adminLevels[0];
      return idx != null ? countryDefs[idx].name : "";
    } else if (level === 1) {
      const cIdx = adminLevels[0];
      const sIdx = adminLevels[1];
      return cIdx != null && sIdx != null ? countryDefs[cIdx].sectors[sIdx].name : "";
    } else if (level === 2) {
      const cIdx = adminLevels[0];
      const sIdx = adminLevels[1];
      const pIdx = adminLevels[2];
      return cIdx != null && sIdx != null && pIdx != null ? countryDefs[cIdx].sectors[sIdx].provinces[pIdx].name : "";
    } else if (level === 3) {
      const cIdx = adminLevels[0];
      const sIdx = adminLevels[1];
      const pIdx = adminLevels[2];
      const clIdx = adminLevels[3];
      return cIdx != null && sIdx != null && pIdx != null && clIdx != null ? countryDefs[cIdx].sectors[sIdx].provinces[pIdx].clusters[clIdx].name : "";
    }
    return "";
  };

  const handleAdminConfirm = useCallback((level: number, value: string) => {
    if (!editedStar) return;
    const options = getDivisionOptions(level, editedStar.admin_levels);
    if (value && options.indexOf(value) === -1) {
      if (confirm(`Create new ${["Country", "Sector", "Province", "Cluster"][level].toLowerCase()} "${value}"?`)) {
        const newDefs = [...countryDefs];
        if (level === 0) {
          const randomColor: [number, number, number] = [
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256)
          ];
          newDefs.push({ name: value, color: randomColor, sectors: [] });
          const newLevels = [...editedStar.admin_levels];
          newLevels[0] = newDefs.length - 1;
          newLevels[1] = null;
          newLevels[2] = null;
          newLevels[3] = null;
          setEditedStar({...editedStar, admin_levels: newLevels});
        } else if (level === 1) {
          const cIdx = editedStar.admin_levels[0];
          if (cIdx != null) {
            const randomColor: [number, number, number] = [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)];
            newDefs[cIdx].sectors.push({ name: value, color: randomColor, provinces: [] });
            const newLevels = [...editedStar.admin_levels];
            newLevels[1] = newDefs[cIdx].sectors.length - 1;
            newLevels[2] = null;
            newLevels[3] = null;
            setEditedStar({...editedStar, admin_levels: newLevels});
          }
        } else if (level === 2) {
          const cIdx = editedStar.admin_levels[0];
          const sIdx = editedStar.admin_levels[1];
          if (cIdx != null && sIdx != null) {
            const randomColor: [number, number, number] = [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)];
            newDefs[cIdx].sectors[sIdx].provinces.push({ name: value, color: randomColor, clusters: [] });
            const newLevels = [...editedStar.admin_levels];
            newLevels[2] = newDefs[cIdx].sectors[sIdx].provinces.length - 1;
            newLevels[3] = null;
            setEditedStar({...editedStar, admin_levels: newLevels});
          }
        } else if (level === 3) {
          const cIdx = editedStar.admin_levels[0];
          const sIdx = editedStar.admin_levels[1];
          const pIdx = editedStar.admin_levels[2];
          if (cIdx != null && sIdx != null && pIdx != null) {
            const randomColor: [number, number, number] = [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)];
            newDefs[cIdx].sectors[sIdx].provinces[pIdx].clusters.push({ name: value, color: randomColor });
            const newLevels = [...editedStar.admin_levels];
            newLevels[3] = newDefs[cIdx].sectors[sIdx].provinces[pIdx].clusters.length - 1;
            setEditedStar({...editedStar, admin_levels: newLevels});
          }
        }
        setCountryDefs(newDefs);
      } else {
        const newLevels = [...editedStar.admin_levels];
        newLevels[level] = null;
        if (level < 3) {
          for (let i = level + 1; i <= 3; i++) {
            newLevels[i] = null;
          }
        }
        setEditedStar({...editedStar, admin_levels: newLevels});
      }
    }
    setAdminDraft(d => {
      const copy = { ...d };
      delete copy[level];
      return copy;
    });
  }, [editedStar, countryDefs]);

  const refreshGalaxy = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/galaxy`);
      if (res.ok) {
        const data = await res.json();
        setGalaxy(data.galaxy);
        setResourceDefs(data.resources);
        // Fix missing colors in countryDefs
        const fixedCountryDefs = data.countries.map((country: any) => ({
          ...country,
          sectors: country.sectors.map((sector: any) => ({
            ...sector,
            color: sector.color || [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)],
            provinces: sector.provinces.map((province: any) => ({
              ...province,
              color: province.color || [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)],
              clusters: province.clusters.map((cluster: any) => ({
                ...cluster,
                color: cluster.color || [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)]
              }))
            }))
          }))
        }));
        setCountryDefs(fixedCountryDefs);
        setStatus("Galaxy loaded successfully.");
      } else {
        setStatus("Failed to load galaxy.");
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to load galaxy.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshGalaxy();
  }, [refreshGalaxy]);

  const handleSelect = useCallback((sel: Selection) => {
    setSelection(sel);
    if (sel.type === "star") {
      setSelectedStar(sel.id);
      if (editMode !== "geography" && editMode !== "political") {
        setViewMode("system");
        setEditedStar(galaxy?.stars[sel.id]);
      }
      setAdminDraft({});
    }
  }, [galaxy, editMode]);

  const handleDeselect = useCallback(() => {
    setSelection(undefined);
    setViewMode("galaxy");
    setSelectedStar(undefined);
    setEditedStar(undefined);
    setEditedBody(undefined);
    setAdminDraft({});
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
        {(["view", "geography", "political"] as EditMode[]).map(mode => (
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
          onContextMenu={handleContextMenu}
          onGalaxyClick={handleGalaxyClick}
          onGalaxyKeyDown={handleGalaxyKeyDown}
          addingHyperlane={addingHyperlane}
          galaxySelection={galaxySelection}
          selectedAdminForPaint={selectedAdminForPaint}
          adminFocus={adminFocus}
        />
      </div>
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'white',
            border: '1px solid black',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >

          {contextMenu.type === 'star' && editMode === 'geography' && (
            <>
              <button style={{ color: 'black' }} onClick={() => {
                if (!galaxy || contextMenu.id === undefined) return;
                const oldGalaxy = galaxy;
                const newGalaxy = { ...galaxy };
                newGalaxy.stars = galaxy.stars.filter((_, i) => i !== contextMenu.id);
                newGalaxy.hyperlanes = galaxy.hyperlanes
                  .filter(l => l.a !== contextMenu.id && l.b !== contextMenu.id)
                  .map(l => ({
                    a: l.a > contextMenu.id! ? l.a - 1 : l.a,
                    b: l.b > contextMenu.id! ? l.b - 1 : l.b
                  }));
                setGalaxy(newGalaxy);
                saveGalaxy(newGalaxy, oldGalaxy);
                setContextMenu(null);
              }}>Remove Star</button>
              <button style={{ color: 'black' }} onClick={() => {
                setAddingHyperlane(true);
                setHyperlaneFrom(contextMenu.id!);
                setContextMenu(null);
              }}>Add Hyperlane</button>
            </>
          )}
          {contextMenu.type === 'lane' && editMode === 'geography' && (
            <button style={{ color: 'black' }} onClick={() => {
              if (!galaxy || contextMenu.id === undefined) return;
              const oldGalaxy = galaxy;
              const newGalaxy = { ...galaxy, hyperlanes: galaxy.hyperlanes.filter((_, i) => i !== contextMenu.id) };
              setGalaxy(newGalaxy);
              saveGalaxy(newGalaxy, oldGalaxy);
              setContextMenu(null);
            }}>Remove Hyperlane</button>
          )}
          {contextMenu.type === 'star' && editMode === 'political' && (
            <button style={{ color: 'black' }} onClick={() => {
              if (!galaxy || contextMenu.id === undefined) return;
              const oldGalaxy = galaxy;
              const newStars = [...galaxy.stars];
              newStars[contextMenu.id] = { ...newStars[contextMenu.id], admin_levels: [null, null, null, null] };
              const newGalaxy = { ...galaxy, stars: newStars };
              setGalaxy(newGalaxy);
              if (selectedStar === contextMenu.id) {
                setEditedStar(newStars[contextMenu.id]);
              }
              saveGalaxy(newGalaxy, oldGalaxy);
              setContextMenu(null);
            }}>Unassign Admin Divisions</button>
          )}
        </div>
      )}
      {viewMode === "galaxy" && editMode === "political" && (
        <div className="sidebar" style={{ left: 0, width: '300px', top: '60px' }}>
          <h3>Political Editor</h3>
          {adminFocus.length > 0 && (
            <button onClick={() => setAdminFocus(adminFocus.slice(0, -1))}>Unfocus</button>
          )}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {(() => {
              let divisions: any[] = [];
              if (adminFocus.length === 0) {
                divisions = countryDefs.map((c, i) => ({ name: c.name, color: c.color, index: i, hasSub: c.sectors.length > 0, level: 0 }));
              } else {
                let current: any[] = countryDefs;
                for (let i = 0; i < adminFocus.length; i++) {
                  const idx = adminFocus[i];
                  if (idx == null) break;
                  if (i === 0) current = countryDefs[idx].sectors;
                  else if (i === 1) current = current[idx].provinces;
                  else if (i === 2) current = current[idx].clusters;
                }
                divisions = current.map((d: any, i: number) => ({
                  name: d.name,
                  color: d.color,
                  index: i,
                  hasSub: 'sectors' in d ? d.sectors.length > 0 : 'provinces' in d ? d.provinces.length > 0 : false,
                  level: adminFocus.length
                }));
              }
              return divisions.map((div, i) => (
                <div key={i} style={{ margin: '5px 0', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: selectedAdminForPaint === div.index ? 'rgba(158, 252, 255, 0.2)' : 'transparent', padding: '2px', borderRadius: '4px' }}>
                  <span style={{ flex: 1 }}>{div.name}</span>
                  <input
                    type="color"
                    value={rgbToHex(div.color)}
                    onChange={(e) => {
                      const newColor = hexToRgb(e.target.value);
                      const newDefs = [...countryDefs];
                      if (adminFocus.length === 0) {
                        newDefs[div.index].color = newColor;
                      } else if (adminFocus.length === 1) {
                        newDefs[adminFocus[0] as number].sectors[div.index].color = newColor;
                      } else if (adminFocus.length === 2) {
                        newDefs[adminFocus[0] as number].sectors[adminFocus[1] as number].provinces[div.index].color = newColor;
                      } else if (adminFocus.length === 3) {
                        newDefs[adminFocus[0] as number].sectors[adminFocus[1] as number].provinces[adminFocus[2] as number].clusters[div.index].color = newColor;
                      }
                      setCountryDefs(newDefs);
                    }}
                    style={{ width: '30px', height: '20px', border: 'none', padding: '0' }}
                  />
                  <button onClick={() => setSelectedAdminForPaint(div.index)} style={{ fontSize: '12px', padding: '4px 8px' }}>Select</button>
                  {div.hasSub && <button onClick={() => setAdminFocus([...adminFocus, div.index])} style={{ fontSize: '12px', padding: '4px 8px' }}>Focus</button>}
                </div>
              ));
            })()}
          </div>
        </div>
      )}
      {viewMode === "system" && editedStar && (
        <div className="sidebar">
          {editedBody ? (
            <>
              <h3>Body Editor</h3>
              <button onClick={() => setSelection({type: "star", id: selectedStar!})}>Back to Star</button>
              <br/><label>
                Name: <input type="text" value={editedBody.name} onChange={(e) => setEditedBody({...editedBody, name: e.target.value})} />
              </label>
              <br/><label>
                Type: 
                <select value={editedBody.type} onChange={(e) => setEditedBody({...editedBody, type: e.target.value})}>
                  <option value="terrestrial">Terrestrial</option>
                  <option value="gas_giant">Gas Giant</option>
                  <option value="ice_giant">Ice Giant</option>
                  <option value="asteroid_belt">Asteroid Belt</option>
                </select>
              </label>
              <br/><button onClick={() => {
                const newBodies = [...editedStar.bodies];
                newBodies[(selection as any).bodyIdx] = editedBody;
                setEditedStar({...editedStar, bodies: newBodies});
                setSelection({type: "star", id: selectedStar!});
              }}>Save</button>
            </>
          ) : (
            <>
              <h3>Star Editor</h3>
              <br/><label>
                Name: <input type="text" value={editedStar.name} onChange={(e) => setEditedStar({...editedStar, name: e.target.value})} />
              </label>
              <br/><label>
                Type: 
                <select value={editedStar.star_type} onChange={(e) => setEditedStar({...editedStar, star_type: e.target.value})}>
                  <option value="O">O</option>
                  <option value="B">B</option>
                  <option value="A">A</option>
                  <option value="F">F</option>
                  <option value="G">G</option>
                  <option value="K">K</option>
                  <option value="M">M</option>
                </select>
              </label>
              <br/><label>
                Description: <br/><textarea value={editedStar.description} onChange={(e) => setEditedStar({...editedStar, description: e.target.value})} />
              </label>
              <h4>Admin Levels</h4>
              <datalist id="countries">
                {countryDefs.map((country, idx) => (
                  <option key={idx} value={country.name} />
                ))}
              </datalist>
              {[
                { level: 0, name: "Country" },
                { level: 1, name: "Sector" },
                { level: 2, name: "Province" },
                { level: 3, name: "Cluster" },
              ].filter(({ level }) => level === 0 || editedStar.admin_levels[level - 1] != null).map(({ level, name }) => {
                const options = getDivisionOptions(level, editedStar.admin_levels);
                const currentName = getDivisionName(level, editedStar.admin_levels);
                const displayed = adminDraft[level] ?? currentName;
                const countryIdx = editedStar.admin_levels[0];
                const country = level === 0 && countryIdx != null ? countryDefs[countryIdx] : null;
                return (
                  <div key={level} style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <label>
                      {name}: 
                      <input 
                        type="text" 
                        list={level === 0 ? "countries" : `divisions-${level}`}
                        value={displayed} 
                        onChange={(e) => {
                          const value = e.target.value;
                          setAdminDraft(d => ({ ...d, [level]: value }));

                          const options = getDivisionOptions(level, editedStar.admin_levels);
                          const idx = options.indexOf(value);

                          if (value === "") {
                            const newLevels = [...editedStar.admin_levels];
                            newLevels[level] = null;
                            setEditedStar({ ...editedStar, admin_levels: newLevels });
                            setAdminDraft(d => {
                              const copy = { ...d };
                              delete copy[level];
                              return copy;
                            });
                          } else if (idx >= 0) {
                            // handle special for level 0
                            if (level === 0 && idx !== editedStar.admin_levels[0]) {
                              const hasLower = editedStar.admin_levels.slice(1).some(l => l != null);
                              if (hasLower) {
                                const currentSectorName = getDivisionName(1, editedStar.admin_levels);
                                const newCountry = countryDefs[idx];
                                const hasCollision = newCountry.sectors.some(s => s.name === currentSectorName);
                                if (hasCollision) {
                                  // clear lower
                                  const newLevels = [...editedStar.admin_levels];
                                  newLevels[0] = idx;
                                  newLevels[1] = null;
                                  newLevels[2] = null;
                                  newLevels[3] = null;
                                  setEditedStar({...editedStar, admin_levels: newLevels});
                                  setAdminDraft(d => {
                                    const copy = { ...d };
                                    delete copy[level];
                                    return copy;
                                  });
                                } else {
                                  if (confirm("Changing country: clear lower-level divisions or create new division in new country?")) {
                                    // clear
                                    const newLevels = [...editedStar.admin_levels];
                                    newLevels[0] = idx;
                                    newLevels[1] = null;
                                    newLevels[2] = null;
                                    newLevels[3] = null;
                                    setEditedStar({...editedStar, admin_levels: newLevels});
                                    setAdminDraft(d => {
                                      const copy = { ...d };
                                      delete copy[level];
                                      return copy;
                                    });
                                  } else {
                                    // create new division
                                    const newDefs = [...countryDefs];
                                    const randomColor: [number, number, number] = [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)];
                                    newDefs[idx].sectors.push({ name: currentSectorName, color: randomColor, provinces: [] });
                                    const newLevels = [...editedStar.admin_levels];
                                    newLevels[0] = idx;
                                    newLevels[1] = newDefs[idx].sectors.length - 1;
                                    newLevels[2] = null;
                                    newLevels[3] = null;
                                    setEditedStar({...editedStar, admin_levels: newLevels});
                                    setCountryDefs(newDefs);
                                    setAdminDraft(d => {
                                      const copy = { ...d };
                                      delete copy[level];
                                      return copy;
                                    });
                                  }
                                }
                              } else {
                                // just set
                                const newLevels = [...editedStar.admin_levels];
                                newLevels[0] = idx;
                                setEditedStar({...editedStar, admin_levels: newLevels});
                                setAdminDraft(d => {
                                  const copy = { ...d };
                                  delete copy[level];
                                  return copy;
                                });
                              }
                            } else {
                              // normal commit
                              const newLevels = [...editedStar.admin_levels];
                              newLevels[level] = idx;
                              setEditedStar({ ...editedStar, admin_levels: newLevels });
                              setAdminDraft(d => {
                                const copy = { ...d };
                                delete copy[level];
                                return copy;
                              });
                            }
                          } else {
                            // idx === -1, keep typing, draft already set
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAdminConfirm(level, e.currentTarget.value.trim());
                          }
                        }}
                        onBlur={(e) => {
                          handleAdminConfirm(level, e.target.value.trim());
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
                    {level > 0 && (
                      <datalist id={`divisions-${level}`}>
                        {options.map((opt, idx) => (
                          <option key={idx} value={opt} />
                        ))}
                      </datalist>
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
              <br/><br/><button onClick={saveStar}>Save</button>
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
