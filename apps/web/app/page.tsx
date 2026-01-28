"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Timeline,
  TimelineEvent,
  ViewMode,
} from "../lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://asarto-api.kamilarif.com");
const POLL_UPS = 10;
const POLL_INTERVAL_MS = 1000 / POLL_UPS;
const TIMELINE_MIN_YEAR = 2000;
const TIMELINE_MAX_YEAR = 2399;
const ADMIN_EVENT_TYPE = "admin_divisions";
const COUNTRY_PROFILE_EVENT_TYPE = "country_profile";
const EMPTY_ADMIN_LEVELS: (number | null)[] = [null, null, null, null];

type AdminTimelineData = { admin_levels?: (number | null)[] };
type CountryProfileData = { name?: string; color?: [number, number, number] };

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const normalizeAdminLevels = (levels?: (number | null)[]) => {
  const normalized = [...EMPTY_ADMIN_LEVELS];
  if (Array.isArray(levels)) {
    for (let i = 0; i < normalized.length; i++) {
      const value = levels[i];
      normalized[i] = typeof value === "number" ? value : null;
    }
  }
  return normalized;
};

const adminLevelsEqual = (a: (number | null)[], b: (number | null)[]) =>
  a.length === b.length && a.every((value, idx) => value === b[idx]);

const getAdminTimelineEvents = (star: Star): TimelineEvent[] => {
  return (star.timeline?.events || [])
    .filter((event) => event.type === ADMIN_EVENT_TYPE && typeof event.year === "number")
    .slice()
    .sort((a, b) => a.year - b.year);
};

const isBaselineAdminEvent = (event: TimelineEvent) => {
  if (event.year !== 0) return false;
  const data = (event.data || {}) as AdminTimelineData;
  const levels = normalizeAdminLevels(data.admin_levels);
  return levels.every((level) => level == null);
};

const hasOnlyBaselineAdminEvent = (events: TimelineEvent[]) =>
  events.length === 1 && isBaselineAdminEvent(events[0]);

const getAdminLevelsAtYear = (star: Star, year: number) => {
  const events = getAdminTimelineEvents(star);
  if (events.length === 0 || hasOnlyBaselineAdminEvent(events)) {
    return normalizeAdminLevels(star.admin_levels);
  }
  let current = normalizeAdminLevels();
  for (const event of events) {
    if (event.year > year) break;
    const data = (event.data || {}) as AdminTimelineData;
    current = normalizeAdminLevels(data.admin_levels);
  }
  return current;
};

const ensureStarTimeline = (star: Star): Timeline => {
  const events = Array.isArray(star.timeline?.events) ? [...star.timeline.events] : [];
  if (!events.some((event) => event.type === ADMIN_EVENT_TYPE && event.year === 0)) {
    events.push({
      year: 0,
      type: ADMIN_EVENT_TYPE,
      data: { admin_levels: [...EMPTY_ADMIN_LEVELS] },
    });
  }
  return { events };
};

const createDefaultStarTimeline = (): Timeline => ({
  events: [
    {
      year: 0,
      type: ADMIN_EVENT_TYPE,
      data: { admin_levels: [...EMPTY_ADMIN_LEVELS] },
    },
  ],
});

const upsertAdminTimelineEvent = (
  star: Star,
  year: number,
  adminLevels: (number | null)[]
) => {
  const timeline = ensureStarTimeline(star);
  const nextLevels = normalizeAdminLevels(adminLevels);
  const events = [...timeline.events];
  const existingIndex = events.findIndex(
    (event) => event.type === ADMIN_EVENT_TYPE && event.year === year
  );
  if (existingIndex >= 0) {
    const existing = events[existingIndex];
    events[existingIndex] = {
      ...existing,
      data: { ...(existing.data || {}), admin_levels: nextLevels },
    };
  } else {
    events.push({
      year,
      type: ADMIN_EVENT_TYPE,
      data: { admin_levels: nextLevels },
    });
  }
  return { ...star, timeline: { events } };
};

const getCountryProfileAtYear = (country: CountryDefinition, year: number) => {
  const events = (country.timeline?.events || [])
    .filter((event) => event.type === COUNTRY_PROFILE_EVENT_TYPE && typeof event.year === "number")
    .slice()
    .sort((a, b) => a.year - b.year);
  let profile: CountryProfileData = { name: country.name, color: country.color };
  for (const event of events) {
    if (event.year > year) break;
    const data = (event.data || {}) as CountryProfileData;
    if (typeof data.name === "string") profile.name = data.name;
    if (Array.isArray(data.color)) profile.color = data.color as [number, number, number];
  }
  return profile;
};

const upsertCountryProfileEvent = (
  country: CountryDefinition,
  year: number,
  updates: CountryProfileData
) => {
  const events = Array.isArray(country.timeline?.events) ? [...country.timeline.events] : [];
  const existingIndex = events.findIndex(
    (event) => event.type === COUNTRY_PROFILE_EVENT_TYPE && event.year === year
  );
  const current = getCountryProfileAtYear(country, year);
  const nextData = { ...current, ...updates };
  if (existingIndex >= 0) {
    const existing = events[existingIndex];
    events[existingIndex] = { ...existing, data: { ...(existing.data || {}), ...updates } };
  } else {
    events.push({ year, type: COUNTRY_PROFILE_EVENT_TYPE, data: nextData });
  }
  return { ...country, timeline: { events } };
};

const getCountryBorderRecency = (stars: Star[], year: number) => {
  const recency = new Map<number, number>();
  stars.forEach((star) => {
    const events = getAdminTimelineEvents(star);
    if (events.length === 0 || hasOnlyBaselineAdminEvent(events)) {
      const fallbackCountry = normalizeAdminLevels(star.admin_levels)[0];
      if (fallbackCountry != null) {
        const existing = recency.get(fallbackCountry) ?? -Infinity;
        recency.set(fallbackCountry, Math.max(existing, TIMELINE_MIN_YEAR));
      }
      return;
    }

    let previousCountry: number | null = null;
    for (const event of events) {
      if (event.year > year) break;
      const data = (event.data || {}) as AdminTimelineData;
      const levels = normalizeAdminLevels(data.admin_levels);
      const countryId = levels[0];
      if (countryId !== previousCountry) {
        if (previousCountry != null) {
          const existing = recency.get(previousCountry) ?? -Infinity;
          recency.set(previousCountry, Math.max(existing, event.year));
        }
        if (countryId != null) {
          const existing = recency.get(countryId) ?? -Infinity;
          recency.set(countryId, Math.max(existing, event.year));
        }
        previousCountry = countryId;
      }
    }
  });
  return recency;
};

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
  const [newDivisionName, setNewDivisionName] = useState("");
  const [newBodyName, setNewBodyName] = useState("");
  const [newBodyType, setNewBodyType] = useState("terrestrial");
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, type: 'empty' | 'star' | 'lane', id?: number} | null>(null);
  const [addingHyperlane, setAddingHyperlane] = useState(false);
  const [hyperlaneFrom, setHyperlaneFrom] = useState<number | null>(null);
  const [galaxySelection, setGalaxySelection] = useState<{type: 'star' | 'lane', id: number} | null>(null);
  const [selectedAdminForPaint, setSelectedAdminForPaint] = useState<number | null>(null);
  const [adminFocus, setAdminFocus] = useState<(number | null)[]>([]);
  const [selectedStarSignature, setSelectedStarSignature] = useState<{x: number, y: number} | null>(null);
  const [modal, setModal] = useState<{title: string, message: string} | null>(null);
  const [timelineYear, setTimelineYear] = useState<number>(TIMELINE_MIN_YEAR);
  const [timelineInput, setTimelineInput] = useState<string>(String(TIMELINE_MIN_YEAR));
  const [activeCountryTimeline, setActiveCountryTimeline] = useState<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const pollInFlight = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const suppressAutosaveRef = useRef(false);

  const adminLevelsByStar = useMemo(() => {
    if (!galaxy) return [];
    return galaxy.stars.map((star) => getAdminLevelsAtYear(star, timelineYear));
  }, [galaxy, timelineYear]);

  const displayCountryDefs = useMemo(() => {
    return countryDefs.map((country) => {
      const profile = getCountryProfileAtYear(country, timelineYear);
      const name = typeof profile.name === "string" ? profile.name : country.name;
      const color = Array.isArray(profile.color) ? profile.color : country.color;
      return { ...country, name, color };
    });
  }, [countryDefs, timelineYear]);

  const countryBorderRecency = useMemo(() => {
    return getCountryBorderRecency(galaxy?.stars || [], timelineYear);
  }, [galaxy, timelineYear]);

  useEffect(() => {
    setTimelineInput(String(timelineYear));
  }, [timelineYear]);

  const getDivisionOptions = (level: number, adminLevels: (number | null)[]): string[] => {
    if (level === 0) {
      return displayCountryDefs.map(c => c.name);
    } else if (level === 1) {
      const countryIdx = adminLevels[0];
      if (countryIdx != null) {
        return displayCountryDefs[countryIdx].sectors.map(s => s.name);
      }
    } else if (level === 2) {
      const countryIdx = adminLevels[0];
      const sectorIdx = adminLevels[1];
      if (countryIdx != null && sectorIdx != null) {
        return displayCountryDefs[countryIdx].sectors[sectorIdx].provinces.map(p => p.name);
      }
    } else if (level === 3) {
      const countryIdx = adminLevels[0];
      const sectorIdx = adminLevels[1];
      const provinceIdx = adminLevels[2];
      if (countryIdx != null && sectorIdx != null && provinceIdx != null) {
        return displayCountryDefs[countryIdx].sectors[sectorIdx].provinces[provinceIdx].clusters.map(c => c.name);
      }
    }
    return [];
  };

  const makeRandomColor = (): [number, number, number] => ([
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
  ]);

  const commitTimelineInput = useCallback(() => {
    const parsed = Number.parseInt(timelineInput, 10);
    if (Number.isNaN(parsed)) {
      setTimelineInput(String(timelineYear));
      return;
    }
    const clamped = clampNumber(parsed, TIMELINE_MIN_YEAR, TIMELINE_MAX_YEAR);
    setTimelineYear(clamped);
  }, [timelineInput, timelineYear]);

  const buildEditableStar = useCallback((star?: Star) => {
    if (!star) return undefined;
    const timeline = ensureStarTimeline(star);
    const adminLevels = getAdminLevelsAtYear({ ...star, timeline }, timelineYear);
    return { ...star, timeline, admin_levels: adminLevels };
  }, [timelineYear]);

  const saveCountries = useCallback(async (countries: CountryDefinition[]) => {
    try {
      const res = await fetch(`${API_BASE}/galaxy/countries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countries }),
      });
      if (!res.ok) {
        setStatus("Failed to save countries.");
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to save countries.");
    }
  }, []);

  const updateStarOnServer = useCallback(async (starId: number, star: Star, oldGalaxy?: Galaxy) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/galaxy/star/${starId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ star }),
      });
      if (res.ok) {
        setStatus("Star saved successfully.");
      } else {
        setStatus("Failed to save star.");
        if (oldGalaxy) {
          setGalaxy(oldGalaxy);
          if (selectedStar === starId) {
            setEditedStar(buildEditableStar(oldGalaxy.stars[starId]));
          }
        }
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to save star.");
      if (oldGalaxy) {
        setGalaxy(oldGalaxy);
        if (selectedStar === starId) {
          setEditedStar(buildEditableStar(oldGalaxy.stars[starId]));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedStar, buildEditableStar]);

  const saveStar = useCallback(async () => {
    if (!galaxy || selectedStar === undefined || !editedStar) return;
    const oldGalaxy = galaxy;
    const currentStar = galaxy.stars[selectedStar];
    const currentAdminLevels = getAdminLevelsAtYear(currentStar, timelineYear);
    const nextAdminLevels = normalizeAdminLevels(editedStar.admin_levels);
    let starToSave = { ...editedStar, admin_levels: nextAdminLevels, timeline: ensureStarTimeline(editedStar) };

    if (!adminLevelsEqual(currentAdminLevels, nextAdminLevels)) {
      starToSave = upsertAdminTimelineEvent(starToSave, timelineYear, nextAdminLevels);
    }

    const updatedGalaxy = { ...galaxy, stars: [...galaxy.stars] };
    updatedGalaxy.stars[selectedStar] = starToSave;
    setGalaxy(updatedGalaxy);
    suppressAutosaveRef.current = true;
    setEditedStar(starToSave);
    updateStarOnServer(selectedStar, starToSave, oldGalaxy);
  }, [galaxy, selectedStar, editedStar, timelineYear, updateStarOnServer]);

  useEffect(() => {
    if (suppressAutosaveRef.current) {
      suppressAutosaveRef.current = false;
      return;
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (editedStar) saveStar();
    }, 1000); // autosave after 1 second of inactivity
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [editedStar, saveStar]);

  useEffect(() => {
    setNewDivisionName("");
  }, [adminFocus]);

  useEffect(() => {
    if (adminFocus.length !== 0 && activeCountryTimeline !== null) {
      setActiveCountryTimeline(null);
    }
  }, [adminFocus, activeCountryTimeline]);

  useEffect(() => {
    if (activeCountryTimeline != null && activeCountryTimeline >= countryDefs.length) {
      setActiveCountryTimeline(null);
    }
  }, [activeCountryTimeline, countryDefs.length]);

  useEffect(() => {
    if (editMode !== "political" || viewMode !== "galaxy") {
      setActiveCountryTimeline(null);
    }
  }, [editMode, viewMode]);

  useEffect(() => {
    setNewBodyName("");
    setNewBodyType("terrestrial");
  }, [selectedStar]);

  const addStarOnServer = useCallback(async (star: Star, width: number, height: number, oldGalaxy?: Galaxy) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/galaxy/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ star, width, height }),
      });
      if (res.ok) {
        setStatus("Star added successfully.");
      } else {
        setStatus("Failed to add star.");
        if (oldGalaxy) setGalaxy(oldGalaxy);
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to add star.");
      if (oldGalaxy) setGalaxy(oldGalaxy);
    } finally {
      setLoading(false);
    }
  }, []);

  const removeStarOnServer = useCallback(async (starId: number, oldGalaxy?: Galaxy) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/galaxy/star/${starId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setStatus("Star removed successfully.");
      } else {
        setStatus("Failed to remove star.");
        if (oldGalaxy) setGalaxy(oldGalaxy);
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to remove star.");
      if (oldGalaxy) setGalaxy(oldGalaxy);
    } finally {
      setLoading(false);
    }
  }, []);

  const addHyperlaneOnServer = useCallback(async (a: number, b: number, oldGalaxy?: Galaxy) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/galaxy/hyperlane`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a, b }),
      });
      if (res.ok) {
        setStatus("Hyperlane added successfully.");
      } else {
        setStatus("Failed to add hyperlane.");
        if (oldGalaxy) setGalaxy(oldGalaxy);
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to add hyperlane.");
      if (oldGalaxy) setGalaxy(oldGalaxy);
    } finally {
      setLoading(false);
    }
  }, []);

  const removeHyperlaneOnServer = useCallback(async (laneId: number, oldGalaxy?: Galaxy) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/galaxy/hyperlane/${laneId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setStatus("Hyperlane removed successfully.");
      } else {
        setStatus("Failed to remove hyperlane.");
        if (oldGalaxy) setGalaxy(oldGalaxy);
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to remove hyperlane.");
      if (oldGalaxy) setGalaxy(oldGalaxy);
    } finally {
      setLoading(false);
    }
  }, []);

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
      addHyperlaneOnServer(hyperlaneFrom, id, oldGalaxy);
      setAddingHyperlane(false);
      setHyperlaneFrom(null);
      } else if (editMode === 'political' && selectedAdminForPaint !== null && type === 'star' && id !== undefined) {
        // assign admin
        if (!galaxy) return;
        const oldGalaxy = galaxy;
        const newStars = [...galaxy.stars];
        const targetStar = newStars[id];
        const currentLevels = normalizeAdminLevels(adminLevelsByStar[id] || targetStar.admin_levels);
        const nextLevels = [...currentLevels];
        nextLevels[adminFocus.length] = selectedAdminForPaint;
        // clear lower levels
        for (let i = adminFocus.length + 1; i < 4; i++) {
          nextLevels[i] = null;
        }
        if (adminLevelsEqual(currentLevels, nextLevels)) return;
        let updatedStar = { ...targetStar, admin_levels: nextLevels };
        updatedStar = upsertAdminTimelineEvent(updatedStar, timelineYear, nextLevels);
        newStars[id] = updatedStar;
        const newGalaxy = { ...galaxy, stars: newStars };
        setGalaxy(newGalaxy);
        if (selectedStar === id) {
          suppressAutosaveRef.current = true;
          setEditedStar(buildEditableStar(updatedStar));
        }
        updateStarOnServer(id, updatedStar, oldGalaxy);
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
        bodies: [],
        timeline: createDefaultStarTimeline(),
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
          timeline: createDefaultStarTimeline(),
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
        addStarOnServer(newStar, newWidth, newHeight, oldGalaxy);
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
          bodies: [],
          timeline: createDefaultStarTimeline(),
        };
        const newGalaxy = { ...galaxy, width: newWidth, height: newHeight, stars: [...galaxy.stars, newStar] };
        setGalaxy(newGalaxy);
        addStarOnServer(newStar, newWidth, newHeight, oldGalaxy);
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
  }, [addingHyperlane, hyperlaneFrom, editMode, selectedAdminForPaint, adminFocus, galaxy, adminLevelsByStar, timelineYear, buildEditableStar, addHyperlaneOnServer, updateStarOnServer, addStarOnServer, selectedStar]);

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
        removeStarOnServer(galaxySelection.id, oldGalaxy);
      } else if (galaxySelection.type === 'lane') {
        const oldGalaxy = galaxy;
        const newGalaxy = { ...galaxy, hyperlanes: galaxy.hyperlanes.filter((_, i) => i !== galaxySelection.id) };
        setGalaxy(newGalaxy);
        removeHyperlaneOnServer(galaxySelection.id, oldGalaxy);
      }
      setGalaxySelection(null);
    }
  }, [galaxySelection, galaxy, removeStarOnServer, removeHyperlaneOnServer]);

  const getDivisionName = (level: number, adminLevels: (number | null)[]): string => {
    if (level === 0) {
      const idx = adminLevels[0];
      return idx != null ? displayCountryDefs[idx].name : "";
    } else if (level === 1) {
      const cIdx = adminLevels[0];
      const sIdx = adminLevels[1];
      return cIdx != null && sIdx != null ? displayCountryDefs[cIdx].sectors[sIdx].name : "";
    } else if (level === 2) {
      const cIdx = adminLevels[0];
      const sIdx = adminLevels[1];
      const pIdx = adminLevels[2];
      return cIdx != null && sIdx != null && pIdx != null ? displayCountryDefs[cIdx].sectors[sIdx].provinces[pIdx].name : "";
    } else if (level === 3) {
      const cIdx = adminLevels[0];
      const sIdx = adminLevels[1];
      const pIdx = adminLevels[2];
      const clIdx = adminLevels[3];
      return cIdx != null && sIdx != null && pIdx != null && clIdx != null ? displayCountryDefs[cIdx].sectors[sIdx].provinces[pIdx].clusters[clIdx].name : "";
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
          const color = makeRandomColor();
          newDefs.push({
            name: value,
            color,
            sectors: [],
            timeline: {
              events: [
                {
                  year: timelineYear,
                  type: COUNTRY_PROFILE_EVENT_TYPE,
                  data: { name: value, color },
                },
              ],
            },
          });
          const newLevels = [...editedStar.admin_levels];
          newLevels[0] = newDefs.length - 1;
          newLevels[1] = null;
          newLevels[2] = null;
          newLevels[3] = null;
          setEditedStar({...editedStar, admin_levels: newLevels});
        } else if (level === 1) {
          const cIdx = editedStar.admin_levels[0];
          if (cIdx != null) {
            newDefs[cIdx].sectors.push({ name: value, color: makeRandomColor(), provinces: [] });
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
            newDefs[cIdx].sectors[sIdx].provinces.push({ name: value, color: makeRandomColor(), clusters: [] });
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
            newDefs[cIdx].sectors[sIdx].provinces[pIdx].clusters.push({ name: value, color: makeRandomColor() });
            const newLevels = [...editedStar.admin_levels];
            newLevels[3] = newDefs[cIdx].sectors[sIdx].provinces[pIdx].clusters.length - 1;
            setEditedStar({...editedStar, admin_levels: newLevels});
          }
        }
        setCountryDefs(newDefs);
        saveCountries(newDefs);
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
  }, [editedStar, countryDefs, saveCountries, makeRandomColor, timelineYear]);

  const addAdminDivision = useCallback(() => {
    const name = newDivisionName.trim();
    if (!name) return;
    const level = adminFocus.length;
    const newDefs = [...countryDefs];
    let newIndex: number | null = null;

    if (level === 0) {
      const normalized = name.toLowerCase();
      if (displayCountryDefs.some((country) => country.name.trim().toLowerCase() === normalized)) {
        return;
      }
      const color = makeRandomColor();
      newDefs.push({
        name,
        color,
        sectors: [],
        timeline: {
          events: [
            {
              year: timelineYear,
              type: COUNTRY_PROFILE_EVENT_TYPE,
              data: { name, color },
            },
          ],
        },
      });
      newIndex = newDefs.length - 1;
    } else if (level === 1) {
      const cIdx = adminFocus[0];
      if (cIdx == null || !newDefs[cIdx]) return;
      newDefs[cIdx].sectors.push({ name, color: makeRandomColor(), provinces: [] });
      newIndex = newDefs[cIdx].sectors.length - 1;
    } else if (level === 2) {
      const cIdx = adminFocus[0];
      const sIdx = adminFocus[1];
      if (cIdx == null || sIdx == null || !newDefs[cIdx]?.sectors?.[sIdx]) return;
      newDefs[cIdx].sectors[sIdx].provinces.push({ name, color: makeRandomColor(), clusters: [] });
      newIndex = newDefs[cIdx].sectors[sIdx].provinces.length - 1;
    } else if (level === 3) {
      const cIdx = adminFocus[0];
      const sIdx = adminFocus[1];
      const pIdx = adminFocus[2];
      if (cIdx == null || sIdx == null || pIdx == null || !newDefs[cIdx]?.sectors?.[sIdx]?.provinces?.[pIdx]) return;
      newDefs[cIdx].sectors[sIdx].provinces[pIdx].clusters.push({ name, color: makeRandomColor() });
      newIndex = newDefs[cIdx].sectors[sIdx].provinces[pIdx].clusters.length - 1;
    } else {
      return;
    }

    setCountryDefs(newDefs);
    saveCountries(newDefs);
    if (newIndex != null) {
      setSelectedAdminForPaint(newIndex);
    }
    setNewDivisionName("");
  }, [adminFocus, countryDefs, displayCountryDefs, makeRandomColor, newDivisionName, saveCountries, timelineYear]);

  const updateCountryProfileEntry = useCallback((
    countryIndex: number,
    timelineIndex: number,
    updates: CountryProfileData & { year?: number }
  ) => {
    const newDefs = [...countryDefs];
    const country = newDefs[countryIndex];
    if (!country) return;
    const events = Array.isArray(country.timeline?.events) ? [...country.timeline.events] : [];
    const existing = events[timelineIndex];
    if (!existing) return;
    const { year, ...dataUpdates } = updates;
    const nextEvent = {
      ...existing,
      data: { ...(existing.data || {}), ...dataUpdates },
    };
    if (typeof year === "number") {
      nextEvent.year = clampNumber(year, TIMELINE_MIN_YEAR, TIMELINE_MAX_YEAR);
    }
    events[timelineIndex] = nextEvent;
    newDefs[countryIndex] = { ...country, timeline: { events } };
    setCountryDefs(newDefs);
    saveCountries(newDefs);
  }, [countryDefs, saveCountries]);

  const addCountryProfileEventBetween = useCallback((
    countryIndex: number,
    _prevYear?: number,
    _nextYear?: number
  ) => {
    const newDefs = [...countryDefs];
    const country = newDefs[countryIndex];
    if (!country) return;
    const events = Array.isArray(country.timeline?.events) ? [...country.timeline.events] : [];
    const currentProfile = getCountryProfileAtYear(country, timelineYear);
    const newYear = clampNumber(timelineYear, TIMELINE_MIN_YEAR, TIMELINE_MAX_YEAR);
    events.push({
      year: newYear,
      type: COUNTRY_PROFILE_EVENT_TYPE,
      data: {
        name: currentProfile.name,
        color: currentProfile.color,
      },
    });
    newDefs[countryIndex] = { ...country, timeline: { events } };
    setCountryDefs(newDefs);
    saveCountries(newDefs);
  }, [countryDefs, saveCountries, timelineYear]);

  const addBodyToStar = useCallback(() => {
    if (!editedStar || selectedStar === undefined) return;
    const name = newBodyName.trim() || `Body ${editedStar.bodies.length + 1}`;
    const maxDistance = editedStar.bodies.reduce((acc, body) => Math.max(acc, body.distance_au), 0);
    const newBody: CelestialBody = {
      name,
      type: newBodyType,
      distance_au: Math.max(0.3, maxDistance + 0.5),
      angle_deg: 0,
      radius_km: 1000,
    };
    const newBodies = [...editedStar.bodies, newBody];
    setEditedStar({ ...editedStar, bodies: newBodies });
    setSelection({ type: "body", starId: selectedStar, bodyIdx: newBodies.length - 1 });
    setNewBodyName("");
  }, [editedStar, selectedStar, newBodyName, newBodyType]);

  const handleSelect = useCallback((sel: Selection) => {
    setSelection(sel);
    if (sel.type === "star") {
      setSelectedStar(sel.id);
      const star = galaxy?.stars[sel.id];
      if (star) {
        setSelectedStarSignature({ x: star.x, y: star.y });
      } else {
        setSelectedStarSignature(null);
      }
      if (editMode !== "geography" && editMode !== "political") {
        setViewMode("system");
        suppressAutosaveRef.current = true;
        setEditedStar(buildEditableStar(star));
      }
      setAdminDraft({});
    }
  }, [galaxy, editMode, buildEditableStar]);

  const handleDeselect = useCallback(() => {
    setSelection(undefined);
    setViewMode("galaxy");
    setSelectedStar(undefined);
    setSelectedStarSignature(null);
    setEditedStar(undefined);
    setEditedBody(undefined);
    setAdminDraft({});
  }, []);

  const refreshGalaxy = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    const hasLocalStarEdits =
      editedStar &&
      selectedStar !== undefined &&
      galaxy &&
      JSON.stringify(editedStar) !== JSON.stringify(galaxy.stars[selectedStar]);
    const hasLocalBodyEdits =
      selection?.type === "body" &&
      editedStar &&
      editedBody &&
      JSON.stringify(editedBody) !== JSON.stringify(editedStar.bodies[selection.bodyIdx]);
    const hasLocalEdits = hasLocalStarEdits || hasLocalBodyEdits;
    if (!silent) setLoading(true);
    try {
        const res = await fetch(`${API_BASE}/galaxy`);
        if (res.ok) {
          const data = await res.json();
          const normalizedGalaxy = {
            ...data.galaxy,
            stars: (data.galaxy?.stars || []).map((star: Star) => ({
              ...star,
              timeline: ensureStarTimeline(star),
            })),
          };
          setGalaxy(normalizedGalaxy);
        setResourceDefs(data.resources || []);
        // Fix missing colors in countryDefs
        const fixedCountryDefs = (data.countries || []).map((country: any) => {
          const fallbackColor = Array.isArray(country.color)
            ? country.color
            : [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)];
          const timelineEvents = Array.isArray(country.timeline?.events)
            ? [...country.timeline.events]
            : [];
          if (!timelineEvents.some((event: any) => event.type === COUNTRY_PROFILE_EVENT_TYPE)) {
            timelineEvents.push({
              year: TIMELINE_MIN_YEAR,
              type: COUNTRY_PROFILE_EVENT_TYPE,
              data: { name: country.name, color: fallbackColor },
            });
          }
          const sectors = Array.isArray(country.sectors) ? country.sectors : [];
          return {
            ...country,
            color: fallbackColor,
            timeline: { events: timelineEvents },
            sectors: sectors.map((sector: any) => ({
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
          };
        });
        setCountryDefs(fixedCountryDefs);

        if (!silent) {
          setStatus("Galaxy loaded successfully.");
        }

          if (galaxySelection) {
            if (
              (galaxySelection.type === "star" && galaxySelection.id >= normalizedGalaxy.stars.length) ||
              (galaxySelection.type === "lane" && galaxySelection.id >= normalizedGalaxy.hyperlanes.length)
            ) {
              setGalaxySelection(null);
            }
          }

          if (selectedStar !== undefined) {
            const serverStar = normalizedGalaxy.stars[selectedStar];
            const signature = selectedStarSignature;
            const signatureMismatch =
              signature && serverStar
                ? serverStar.x !== signature.x || serverStar.y !== signature.y
                : false;

          if (!serverStar || signatureMismatch) {
              const matchIndex = signature
                ? normalizedGalaxy.stars.findIndex(
                    (star: Star) => star.x === signature.x && star.y === signature.y
                  )
                : -1;

            if (matchIndex >= 0) {
              if (selectedStar !== matchIndex) {
                setSelectedStar(matchIndex);
                if (selection?.type === "star") {
                  setSelection({ type: "star", id: matchIndex });
                } else if (selection?.type === "body") {
                  setSelection({ type: "body", starId: matchIndex, bodyIdx: selection.bodyIdx });
                }
                if (galaxySelection?.type === "star" && galaxySelection.id === selectedStar) {
                  setGalaxySelection({ type: "star", id: matchIndex });
                }
              }
                if (viewMode === "system" && !hasLocalEdits) {
                  suppressAutosaveRef.current = true;
                  setEditedStar(buildEditableStar(normalizedGalaxy.stars[matchIndex]));
                }
            } else {
              if (viewMode === "system") {
                setModal({
                  title: "System deleted",
                  message: "The system you were viewing was removed by another editor."
                });
              }
              handleDeselect();
            }
          } else {
            if (!signature) {
              setSelectedStarSignature({ x: serverStar.x, y: serverStar.y });
            }
              if (viewMode === "system" && !hasLocalEdits) {
                suppressAutosaveRef.current = true;
                setEditedStar(buildEditableStar(serverStar));
              }
          }
        }
      } else if (!silent) {
        setStatus("Failed to load galaxy.");
      }
    } catch (err) {
      console.error(err);
      if (!silent) {
        setStatus("Failed to load galaxy.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [editedBody, editedStar, galaxy, galaxySelection, handleDeselect, selectedStar, selectedStarSignature, selection, viewMode, buildEditableStar]);

  useEffect(() => {
    refreshGalaxy();
    // Intentionally run once on mount to avoid recursive refresh loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      const shouldPoll =
        document.visibilityState === "visible" && document.hasFocus();
      if (!shouldPoll || pollInFlight.current) return;
      pollInFlight.current = true;
      refreshGalaxy({ silent: true }).finally(() => {
        pollInFlight.current = false;
      });
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [refreshGalaxy]);

  useEffect(() => {
    if (selection?.type === "body" && editedStar) {
      const current = editedStar.bodies[selection.bodyIdx];
      if (!current) {
        setSelection({ type: "star", id: selection.starId });
        setEditedBody(undefined);
        return;
      }
      if (editedBody && JSON.stringify(editedBody) !== JSON.stringify(current)) {
        return;
      }
      setEditedBody({ ...current });
    } else {
      setEditedBody(undefined);
    }
  }, [selection, editedStar, editedBody]);

  const currentAdminLabel =
    ["Country", "Sector", "Province", "Cluster"][adminFocus.length] ?? "Division";
  const countrySearchTerm =
    adminFocus.length === 0 ? newDivisionName.trim().toLowerCase() : "";
  const isDuplicateCountryName =
    adminFocus.length === 0 &&
    countrySearchTerm.length > 0 &&
    displayCountryDefs.some(
      (country) => country.name.trim().toLowerCase() === countrySearchTerm
    );
  const canAddDivision =
    newDivisionName.trim().length > 0 &&
    !(adminFocus.length === 0 && isDuplicateCountryName);
  const activeCountry = activeCountryTimeline != null ? countryDefs[activeCountryTimeline] : undefined;
  const activeCountryDisplay = activeCountryTimeline != null ? displayCountryDefs[activeCountryTimeline] : undefined;
  const activeCountryProfileEvents = useMemo(() => {
    if (activeCountryTimeline == null) return [];
    const country = countryDefs[activeCountryTimeline];
    if (!country) return [];
    const events = Array.isArray(country.timeline?.events) ? country.timeline.events : [];
    return events
      .map((event, timelineIndex) => ({ event, timelineIndex }))
      .filter(({ event }) => event.type === COUNTRY_PROFILE_EVENT_TYPE)
      .sort((a, b) => a.event.year - b.event.year);
  }, [countryDefs, activeCountryTimeline]);

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
          countryDefs={displayCountryDefs}
          selectedStar={selectedStar}
          onContextMenu={handleContextMenu}
          onGalaxyClick={handleGalaxyClick}
          onGalaxyKeyDown={handleGalaxyKeyDown}
          addingHyperlane={addingHyperlane}
          galaxySelection={galaxySelection}
          selectedAdminForPaint={selectedAdminForPaint}
          adminFocus={adminFocus}
          adminLevelsByStar={adminLevelsByStar}
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
                removeStarOnServer(contextMenu.id, oldGalaxy);
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
              removeHyperlaneOnServer(contextMenu.id, oldGalaxy);
              setContextMenu(null);
            }}>Remove Hyperlane</button>
          )}
          {contextMenu.type === 'star' && editMode === 'political' && (
            <button style={{ color: 'black' }} onClick={() => {
              if (!galaxy || contextMenu.id === undefined) return;
              const oldGalaxy = galaxy;
              const newStars = [...galaxy.stars];
              const targetStar = newStars[contextMenu.id];
              const currentLevels = normalizeAdminLevels(adminLevelsByStar[contextMenu.id] || targetStar.admin_levels);
              const nextLevels = normalizeAdminLevels();
              if (adminLevelsEqual(currentLevels, nextLevels)) {
                setContextMenu(null);
                return;
              }
              let updatedStar = { ...targetStar, admin_levels: nextLevels };
              updatedStar = upsertAdminTimelineEvent(updatedStar, timelineYear, nextLevels);
              newStars[contextMenu.id] = updatedStar;
              const newGalaxy = { ...galaxy, stars: newStars };
              setGalaxy(newGalaxy);
              if (selectedStar === contextMenu.id) {
                suppressAutosaveRef.current = true;
                setEditedStar(buildEditableStar(updatedStar));
              }
              updateStarOnServer(contextMenu.id, updatedStar, oldGalaxy);
              setContextMenu(null);
            }}>Unassign Admin Divisions</button>
          )}
        </div>
      )}
      {modal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200
          }}
        >
          <div
            style={{
              background: 'white',
              color: 'black',
              padding: '20px',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}
          >
            <h3 style={{ marginTop: 0 }}>{modal.title}</h3>
            <p>{modal.message}</p>
            <button
              onClick={() => setModal(null)}
              style={{
                color: 'black',
                background: '#e6e6e6',
                border: '1px solid #999',
                padding: '6px 12px',
                borderRadius: '4px'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
      {viewMode === "galaxy" && editMode === "political" && (
        <div className="sidebar" style={{ left: 0, width: '360px', top: '60px' }}>
          <h3>Political Editor</h3>
          {adminFocus.length > 0 && (
            <button onClick={() => setAdminFocus(adminFocus.slice(0, -1))}>Unfocus</button>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', margin: '10px 0' }}>
              <input
                type="text"
                value={newDivisionName}
                placeholder={
                  adminFocus.length === 0
                    ? "Search or add Country"
                    : `New ${currentAdminLabel}`
                }
                onChange={(e) => setNewDivisionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addAdminDivision();
                  }
              }}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '8px',
                border: '1px solid rgba(158, 252, 255, 0.2)',
                background: 'rgba(0, 0, 0, 0.35)',
                color: 'white'
              }}
              />
              <button onClick={addAdminDivision} disabled={!canAddDivision}>
                Add
              </button>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {(() => {
                let divisions: any[] = [];
                if (adminFocus.length === 0) {
                  divisions = displayCountryDefs.map((c, i) => ({
                    name: c.name,
                    color: c.color,
                    index: i,
                    hasSub: c.sectors.length > 0,
                    level: 0,
                    recency: countryBorderRecency.get(i) ?? -Infinity,
                  }));
                  if (countrySearchTerm) {
                    divisions = divisions.filter((div) =>
                      div.name.toLowerCase().includes(countrySearchTerm)
                    );
                  }
                  divisions.sort((a, b) => {
                    if (b.recency !== a.recency) return b.recency - a.recency;
                    return a.name.localeCompare(b.name);
                  });
                } else {
                  let current: any[] = displayCountryDefs;
                  for (let i = 0; i < adminFocus.length; i++) {
                    const idx = adminFocus[i];
                    if (idx == null) break;
                    if (i === 0) current = displayCountryDefs[idx].sectors;
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
              return divisions.map((div) => (
                <div key={`${div.level}-${div.index}`} style={{ margin: '5px 0', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: selectedAdminForPaint === div.index ? 'rgba(158, 252, 255, 0.2)' : 'transparent', padding: '2px', borderRadius: '4px' }}>
                  <span style={{ flex: 1 }}>{div.name}</span>
                  <input
                    type="color"
                    value={rgbToHex(div.color)}
                      onChange={(e) => {
                        const newColor = hexToRgb(e.target.value);
                        const newDefs = [...countryDefs];
                        if (adminFocus.length === 0) {
                          newDefs[div.index] = upsertCountryProfileEvent(
                            newDefs[div.index],
                            timelineYear,
                            { color: newColor }
                          );
                        } else if (adminFocus.length === 1) {
                          newDefs[adminFocus[0] as number].sectors[div.index].color = newColor;
                        } else if (adminFocus.length === 2) {
                          newDefs[adminFocus[0] as number].sectors[adminFocus[1] as number].provinces[div.index].color = newColor;
                        } else if (adminFocus.length === 3) {
                        newDefs[adminFocus[0] as number].sectors[adminFocus[1] as number].provinces[adminFocus[2] as number].clusters[div.index].color = newColor;
                      }
                      setCountryDefs(newDefs);
                      saveCountries(newDefs);
                    }}
                    style={{ width: '30px', height: '20px', border: 'none', padding: '0' }}
                  />
                  <button onClick={() => setSelectedAdminForPaint(div.index)} style={{ fontSize: '12px', padding: '4px 8px' }}>Select</button>
                  {adminFocus.length === 0 && (
                    <button
                      onClick={() =>
                        setActiveCountryTimeline((current) =>
                          current === div.index ? null : div.index
                        )
                      }
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                    >
                      Timeline
                    </button>
                  )}
                  {div.hasSub && <button onClick={() => setAdminFocus([...adminFocus, div.index])} style={{ fontSize: '12px', padding: '4px 8px' }}>Focus</button>}
                </div>
              ));
            })()}
          </div>
        </div>
      )}
      {viewMode === "galaxy" && editMode === "political" && activeCountry && (
        <div className="sidebar" style={{ left: '380px', width: '360px', top: '60px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3>Country Timeline</h3>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {activeCountryDisplay?.name ?? activeCountry.name}
              </div>
            </div>
            <button className="close" onClick={() => setActiveCountryTimeline(null)}>X</button>
          </div>
          {activeCountryProfileEvents.length === 0 && (
            <button
              style={{ width: '100%', marginBottom: '12px' }}
              onClick={() => {
                if (activeCountryTimeline == null) return;
                addCountryProfileEventBetween(activeCountryTimeline);
              }}
            >
              Add name/color event
            </button>
          )}
          {activeCountryProfileEvents.map((entry, idx) => {
            const nextEntry = activeCountryProfileEvents[idx + 1];
            const event = entry.event;
            const data = (event.data || {}) as CountryProfileData;
            const resolvedProfile = activeCountry
              ? getCountryProfileAtYear(activeCountry, event.year)
              : { name: "", color: [255, 255, 255] as [number, number, number] };
            const nameValue =
              typeof data.name === "string" ? data.name : (resolvedProfile.name || "");
            const colorValue = Array.isArray(data.color)
              ? (data.color as [number, number, number])
              : (resolvedProfile.color || [255, 255, 255]);
            return (
              <div key={entry.timelineIndex} style={{ marginBottom: '12px' }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(158, 252, 255, 0.12)',
                  background: 'rgba(0, 0, 0, 0.25)'
                }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      min={TIMELINE_MIN_YEAR}
                      max={TIMELINE_MAX_YEAR}
                      value={event.year}
                      onChange={(e) => {
                        if (activeCountryTimeline == null) return;
                        const nextYear = Number.parseInt(e.target.value, 10);
                        if (Number.isNaN(nextYear)) return;
                        updateCountryProfileEntry(activeCountryTimeline, entry.timelineIndex, { year: nextYear });
                      }}
                      style={{
                        width: '90px',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(158, 252, 255, 0.2)',
                        background: 'rgba(0, 0, 0, 0.35)',
                        color: 'white',
                      }}
                    />
                    <input
                      type="text"
                      value={nameValue}
                      onChange={(e) => {
                        if (activeCountryTimeline == null) return;
                        updateCountryProfileEntry(activeCountryTimeline, entry.timelineIndex, { name: e.target.value });
                      }}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(158, 252, 255, 0.2)',
                        background: 'rgba(0, 0, 0, 0.35)',
                        color: 'white',
                      }}
                    />
                    <input
                      type="color"
                      value={rgbToHex(colorValue)}
                      onChange={(e) => {
                        if (activeCountryTimeline == null) return;
                        const nextColor = hexToRgb(e.target.value);
                        updateCountryProfileEntry(activeCountryTimeline, entry.timelineIndex, { color: nextColor });
                      }}
                      style={{ width: '34px', height: '24px', border: 'none', padding: 0 }}
                    />
                  </div>
                </div>
                {idx < activeCountryProfileEvents.length - 1 && (
                  <button
                    style={{ width: '100%', marginTop: '8px', fontSize: '12px', padding: '6px 8px' }}
                    onClick={() => {
                      if (activeCountryTimeline == null) return;
                      addCountryProfileEventBetween(
                        activeCountryTimeline,
                        event.year,
                        nextEntry?.event.year
                      );
                    }}
                  >
                    Add event
                  </button>
                )}
              </div>
            );
          })}
          {activeCountryProfileEvents.length > 0 && (
            <button
              style={{ width: '100%', marginTop: '4px' }}
              onClick={() => {
                if (activeCountryTimeline == null) return;
                const last = activeCountryProfileEvents[activeCountryProfileEvents.length - 1];
                addCountryProfileEventBetween(activeCountryTimeline, last.event.year);
              }}
            >
              Add event
            </button>
          )}
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
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={() => {
                  const newBodies = [...editedStar.bodies];
                  newBodies[(selection as any).bodyIdx] = editedBody;
                  setEditedStar({...editedStar, bodies: newBodies});
                  setSelection({type: "star", id: selectedStar!});
                }}>Save</button>
                <button onClick={() => {
                  if (!editedStar || selection?.type !== "body") return;
                  if (!confirm(`Delete ${editedBody.name}?`)) return;
                  const newBodies = editedStar.bodies.filter((_, idx) => idx !== selection.bodyIdx);
                  setEditedStar({ ...editedStar, bodies: newBodies });
                  setEditedBody(undefined);
                  setSelection({ type: "star", id: selectedStar! });
                }}>Delete</button>
              </div>
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
                  {displayCountryDefs.map((country, idx) => (
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
                                    saveCountries(newDefs);
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
                            saveCountries(newDefs);
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="text"
                    value={newBodyName}
                    placeholder="New body name"
                    onChange={(e) => setNewBodyName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addBodyToStar();
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid rgba(158, 252, 255, 0.2)',
                      background: 'rgba(0, 0, 0, 0.35)',
                      color: 'white'
                    }}
                  />
                  <select
                    value={newBodyType}
                    onChange={(e) => setNewBodyType(e.target.value)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid rgba(158, 252, 255, 0.2)',
                      background: 'rgba(0, 0, 0, 0.35)',
                      color: 'white'
                    }}
                  >
                    <option value="terrestrial">Terrestrial</option>
                    <option value="gas_giant">Gas Giant</option>
                    <option value="ice_giant">Ice Giant</option>
                    <option value="asteroid_belt">Asteroid Belt</option>
                  </select>
                  <button onClick={addBodyToStar} disabled={!editedStar}>
                    Add
                  </button>
                </div>
                {editedStar.bodies.map((body, idx) => {
                  const isSelected = selection?.type === "body" && selection.bodyIdx === idx;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: isSelected ? 'rgba(158, 252, 255, 0.2)' : 'transparent',
                        padding: '4px 6px',
                        borderRadius: '6px'
                      }}
                    >
                      <span style={{ flex: 1 }}>{body.name}</span>
                      <span style={{ fontSize: '12px', opacity: 0.75 }}>
                        {body.type.replace(/_/g, " ")}
                      </span>
                      <button
                        onClick={() => setSelection({ type: "body", starId: selectedStar!, bodyIdx: idx })}
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                      >
                        Edit
                      </button>
                    </div>
                  );
                })}
              </div>
              <br/><button onClick={saveStar}>Save</button>
            </>
          )}
        </div>
      )}
      <div className="bottom-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {viewMode === "system" && (
            <button onClick={() => setViewMode("galaxy")}>Back to Galaxy</button>
          )}
          <button onClick={() => refreshGalaxy()} disabled={loading}>
            {loading ? "Loading..." : "Refresh Galaxy"}
          </button>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "14px", margin: "0 18px" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)" }}>
              <span>{TIMELINE_MIN_YEAR}</span>
              <span>{TIMELINE_MAX_YEAR}</span>
            </div>
            <input
              type="range"
              min={TIMELINE_MIN_YEAR}
              max={TIMELINE_MAX_YEAR}
              value={timelineYear}
              onChange={(e) => {
                const nextYear = clampNumber(
                  Number(e.target.value),
                  TIMELINE_MIN_YEAR,
                  TIMELINE_MAX_YEAR
                );
                setTimelineYear(nextYear);
              }}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>Year</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={timelineInput}
              onChange={(e) => setTimelineInput(e.target.value)}
              onBlur={commitTimelineInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitTimelineInput();
                }
              }}
              style={{
                width: "90px",
                padding: "6px 8px",
                borderRadius: "8px",
                border: "1px solid rgba(158, 252, 255, 0.2)",
                background: "rgba(0, 0, 0, 0.35)",
                color: "white",
              }}
            />
          </div>
        </div>
        <div className="status">{status}</div>
      </div>
    </div>
  );
}
