"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Container, Graphics, Stage } from "@pixi/react";
import { Delaunay } from "d3-delaunay";
import type {
  CountryDefinition,
  EditMode,
  Galaxy,
  ResourceDefinition,
  Selection,
  ViewMode,
} from "../lib/types";
import { fallbackPalette, rgbTupleToHex } from "../lib/color";

type Props = {
  galaxy?: Galaxy;
  selection: Selection | undefined;
  onSelect?: (selection: Selection) => void;
  onDeselect?: () => void;
  viewMode: ViewMode;
  editMode: EditMode;
  resourceDefs?: ResourceDefinition[];
  countryDefs?: CountryDefinition[];
  selectedStar?: number;
  onContextMenu?: (type: 'empty' | 'star' | 'lane', clientX: number, clientY: number, id?: number) => void;
  onGalaxyClick?: (type: 'empty' | 'star' | 'lane', shiftKey: boolean, id?: number, position?: {x: number, y: number}) => void;
  onGalaxyKeyDown?: (key: string) => void;
  addingHyperlane?: boolean;
  galaxySelection?: {type: 'star' | 'lane', id: number} | null;
  selectedAdminForPaint?: number | null;
  adminFocus?: (number | null)[];
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// Simple seeded random number generator
const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const distanceToSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const clamped = clamp(t, 0, 1);
  const proj = { x: a.x + clamped * dx, y: a.y + clamped * dy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
};

export function GalaxyViewport({
  galaxy,
  selection,
  onSelect,
  onDeselect,
  viewMode,
  editMode,
  resourceDefs = [],
  countryDefs = [],
  selectedStar,
  onContextMenu,
  onGalaxyClick,
  onGalaxyKeyDown,
  addingHyperlane = false,
  galaxySelection,
  selectedAdminForPaint,
  adminFocus = [],
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const prevViewModeRef = useRef<ViewMode>(viewMode);
  const galaxyZoomRef = useRef<number>(1);
  const [size, setSize] = useState({ width: 1200, height: 720 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [startOffset, setStartOffset] = useState({ x: 0, y: 0 });
  const [moved, setMoved] = useState(false);
  const [downPos, setDownPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const syncSize = () => {
      if (!mountRef.current) return;
      setSize({ width: mountRef.current.clientWidth, height: mountRef.current.clientHeight });
    };
    syncSize();
    window.addEventListener("resize", syncSize);
    return () => window.removeEventListener("resize", syncSize);
  }, []);

  const galaxyBounds = useMemo(() => {
    if (!galaxy || galaxy.stars.length === 0) {
      return { minX: 0, maxX: galaxy?.width || 800, minY: 0, maxY: galaxy?.height || 800, width: galaxy?.width || 800, height: galaxy?.height || 800 };
    }
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    galaxy.stars.forEach(star => {
      minX = Math.min(minX, star.x);
      maxX = Math.max(maxX, star.x);
      minY = Math.min(minY, star.y);
      maxY = Math.max(maxY, star.y);
    });
    
    // Add buffer for display
    const buffer = 50;
    const displayMinX = minX - buffer;
    const displayMaxX = maxX + buffer;
    const displayMinY = minY - buffer;
    const displayMaxY = maxY + buffer;
    
    return {
      minX: displayMinX,
      maxX: displayMaxX,
      minY: displayMinY,
      maxY: displayMaxY,
      width: displayMaxX - displayMinX,
      height: displayMaxY - displayMinY
    };
  }, [galaxy]);

  const baseScale = useMemo(() => {
    if (!galaxy) return 1;
    return Math.min(size.width / galaxyBounds.width, size.height / galaxyBounds.height);
  }, [galaxy, galaxyBounds, size.height, size.width]);

  const scaled = baseScale * zoom;

  useEffect(() => {
    if (!galaxy) return;
    
    const viewModeChanged = prevViewModeRef.current !== viewMode;
    const previousViewMode = prevViewModeRef.current;
    prevViewModeRef.current = viewMode;
    
    if (viewMode === "galaxy") {
      if (viewModeChanged) {
        // Only reposition when view mode changes
        const startX = (size.width - galaxyBounds.width * baseScale) / 2 - galaxyBounds.minX * baseScale;
        const startY = (size.height - galaxyBounds.height * baseScale) / 2 - galaxyBounds.minY * baseScale;
        setOffset({ x: startX, y: startY });
        
        if (previousViewMode === "system") {
          // Switching back from system view, restore saved galaxy zoom
          setZoom(galaxyZoomRef.current);
        } else {
          // First time entering galaxy view, start with zoom 1
          setZoom(1);
          galaxyZoomRef.current = 1;
        }
      }
      // If viewMode didn't change, don't touch offset or zoom
    } else if (viewMode === "system" && selectedStar !== undefined) {
      // Save current galaxy zoom before switching to system
      if (viewModeChanged && previousViewMode === "galaxy") {
        galaxyZoomRef.current = zoom;
      }
      
      const star = galaxy.stars[selectedStar];
      const maxDist = star && star.bodies.length > 0 ? Math.max(...star.bodies.map(b => b.distance_au)) : 1;
      const requiredZoom = (Math.min(size.width, size.height) / 2) / (maxDist * 10);
      setOffset({ x: 0, y: 0 });
      setZoom(clamp(requiredZoom, 0.1, 1));
    }
  }, [galaxy, baseScale, size.height, size.width, viewMode, selectedStar]);

  // Reposition when window size changes
  useEffect(() => {
    if (!galaxy || viewMode !== "galaxy") return;
    const startX = (size.width - galaxyBounds.width * baseScale) / 2 - galaxyBounds.minX * baseScale;
    const startY = (size.height - galaxyBounds.height * baseScale) / 2 - galaxyBounds.minY * baseScale;
    setOffset({ x: startX, y: startY });
  }, [galaxyBounds, baseScale, size.width, size.height, viewMode, galaxy]);

  useEffect(() => {
    if (!galaxy || viewMode !== "galaxy") return;
    const startX = (size.width - galaxyBounds.width * scaled) / 2 - galaxyBounds.minX * scaled;
    const startY = (size.height - galaxyBounds.height * scaled) / 2 - galaxyBounds.minY * scaled;
    setOffset({ x: startX, y: startY });
  }, [galaxy, scaled, size.height, size.width, viewMode]);

  const voronoiPolys = useMemo(() => {
    if (!galaxy || galaxy.stars.length === 0) return [];
    const points = galaxy.stars.map((s) => [s.x, s.y]);
    const delaunay = Delaunay.from(points as any);
    
    // Calculate bounds based on star positions with buffer
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    galaxy.stars.forEach(star => {
      minX = Math.min(minX, star.x);
      maxX = Math.max(maxX, star.x);
      minY = Math.min(minY, star.y);
      maxY = Math.max(maxY, star.y);
    });
    
    // Add buffer around the star bounds
    const buffer = 100;
    const voronoiMinX = minX - buffer;
    const voronoiMaxX = maxX + buffer;
    const voronoiMinY = minY - buffer;
    const voronoiMaxY = maxY + buffer;
    
    const voronoi = delaunay.voronoi([voronoiMinX, voronoiMinY, voronoiMaxX, voronoiMaxY]);
    const polys: (number[][] | undefined)[] = [];
    for (let i = 0; i < points.length; i++) {
      const cell = voronoi.cellPolygon(i);
      polys.push(cell ?? undefined);
    }
    return polys;
  }, [galaxy]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      if (!mountRef.current) return { x: 0, y: 0 };
      const rect = mountRef.current.getBoundingClientRect();
      const x = (clientX - rect.left - offset.x) / scaled;
      const y = (clientY - rect.top - offset.y) / scaled;
      return { x, y };
    },
    [offset.x, offset.y, scaled]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      event.preventDefault();
      if (!mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      const centerX = viewMode === "system" ? size.width / 2 : 0;
      const centerY = viewMode === "system" ? size.height / 2 : 0;
      const focus = { x: event.clientX - rect.left - centerX, y: event.clientY - rect.top - centerY };
      const minZoom = viewMode === "system" ? 0.1 : 0.25;
      const nextZoom = clamp(zoom * (1 - event.deltaY * 0.001), minZoom, 6);
      const scaleRatio = nextZoom / zoom;
      setOffset(({ x, y }) => ({
        x: focus.x - (focus.x - x) * scaleRatio,
        y: focus.y - (focus.y - y) * scaleRatio,
      }));
      setZoom(nextZoom);
    },
    [zoom, viewMode, size]
  );

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!galaxy || viewMode !== "galaxy") return;
    const worldPos = toWorld(event.clientX, event.clientY);
    let type: 'empty' | 'star' | 'lane' = 'empty';
    let id: number | undefined;
    // check stars
    for (let i = 0; i < galaxy.stars.length; i++) {
      const star = galaxy.stars[i];
      const dx = star.x - worldPos.x;
      const dy = star.y - worldPos.y;
      if (dx * dx + dy * dy < 25) {
        type = 'star';
        id = i;
        break;
      }
    }
    if (type === 'empty') {
      // check lanes
      for (let i = 0; i < galaxy.hyperlanes.length; i++) {
        const lane = galaxy.hyperlanes[i];
        const a = galaxy.stars[lane.a];
        const b = galaxy.stars[lane.b];
        const dist = distanceToSegment(worldPos, { x: a.x, y: a.y }, { x: b.x, y: b.y });
        if (dist < 5) {
          type = 'lane';
          id = i;
          break;
        }
      }
    }
    onContextMenu?.(type, event.clientX, event.clientY, id);
  }, [galaxy, viewMode, toWorld, onContextMenu]);

  const handleGalaxyClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!galaxy || viewMode !== "galaxy") return;
    const worldPos = toWorld(downPos.x, downPos.y);
    let type: 'empty' | 'star' | 'lane' = 'empty';
    let id: number | undefined;
    // check stars
    for (let i = 0; i < galaxy.stars.length; i++) {
      const star = galaxy.stars[i];
      const dx = star.x - worldPos.x;
      const dy = star.y - worldPos.y;
      if (dx * dx + dy * dy < 25) {
        type = 'star';
        id = i;
        break;
      }
    }
    if (type === 'empty') {
      // check lanes
      for (let i = 0; i < galaxy.hyperlanes.length; i++) {
        const lane = galaxy.hyperlanes[i];
        const a = galaxy.stars[lane.a];
        const b = galaxy.stars[lane.b];
        const dist = distanceToSegment(worldPos, { x: a.x, y: a.y }, { x: b.x, y: b.y });
        if (dist < 5) {
          type = 'lane';
          id = i;
          break;
        }
      }
    }
    onGalaxyClick?.(type, event.shiftKey, id, type === 'empty' ? worldPos : undefined);
  }, [galaxy, viewMode, toWorld, onGalaxyClick, downPos]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (viewMode === "galaxy") {
      onGalaxyKeyDown?.(event.key);
    }
  }, [viewMode, onGalaxyKeyDown]);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    setDragging(true);
    setDragStart({ x: event.clientX, y: event.clientY });
    setStartOffset(offset);
    setMoved(false);
    setDownPos({ x: event.clientX, y: event.clientY });
  }, [offset]);

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragging) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) setMoved(true);
    setOffset({ x: startOffset.x + dx, y: startOffset.y + dy });
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    setDragging(false);
    if (moved) return;
    if (!galaxy) return;
    const world = toWorld(event.clientX, event.clientY);
    let found: Selection | undefined = undefined;

    if (viewMode === "galaxy") {
      const tolerance = 12 / scaled;
      for (let i = 0; i < galaxy.stars.length; i++) {
        const star = galaxy.stars[i];
        const dist = Math.hypot(world.x - star.x, world.y - star.y);
        if (dist <= tolerance) {
          found = { type: "star", id: i };
          break;
        }
      }

      if (!found) {
        for (let i = 0; i < galaxy.hyperlanes.length; i++) {
          const lane = galaxy.hyperlanes[i];
          const a = galaxy.stars[lane.a];
          const b = galaxy.stars[lane.b];
          const dist = distanceToSegment(world, a, b);
          if (dist <= tolerance) {
            found = { type: "lane", id: i };
            break;
          }
        }
      }
    } else if (viewMode === "system" && selectedStar != null) {
      const star = galaxy.stars[selectedStar];
      const tolerance = 20 / scaled;
      for (let i = 0; i < star.bodies.length; i++) {
        const body = star.bodies[i];
        const angleRad = (body.angle_deg * Math.PI) / 180;
        const x = body.distance_au * Math.cos(angleRad);
        const y = body.distance_au * Math.sin(angleRad);
        const dist = Math.hypot(world.x - x, world.y - y);
        if (dist <= tolerance) {
          found = { type: "body", starId: selectedStar, bodyIdx: i };
          break;
        }
      }
    }

    if (found) {
      onSelect?.(found);
    } else {
      onDeselect?.();
    }
  };

  return (
    <div
      ref={mountRef}
      className="viewport"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setDragging(false)}
      onContextMenu={handleContextMenu}
      onClick={handleGalaxyClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <Stage
        width={size.width}
        height={size.height}
        options={{ backgroundColor: 0x000000, antialias: true, resolution: 1 }}
      >
        <Container position={viewMode === "system" ? [size.width / 2 + offset.x, size.height / 2 + offset.y] : [offset.x, offset.y]} scale={viewMode === "system" ? 10 * zoom : scaled}>
          <Graphics
            draw={(g) => {
              g.clear();
              if (!galaxy) return;
              if (viewMode === "system" && selectedStar !== undefined) {
                const star = galaxy.stars[selectedStar];
                if (!star) return;
                // Draw star at center
                g.beginFill(0xffffff, 1);
                g.drawCircle(0, 0, 5);
                g.endFill();
                // Draw orbits
                star.bodies.forEach((body) => {
                  if (body.type !== "asteroid_belt") {
                    const orbitRadius = body.distance_au * 230;
                    g.lineStyle(1, 0x444444, 0.5);
                    g.drawCircle(0, 0, orbitRadius);
                    g.lineStyle(0);
                  }
                });
                // Draw bodies
                star.bodies.forEach((body, idx) => {
                  if (body.type === "asteroid_belt") {
                    // Draw asteroid belt as randomized circles
                    const beltRadius = body.distance_au * 230;
                    const beltWidthAU = 0.1; // thickness in AU
                    const beltWidth = beltWidthAU * 230;
                    for (let i = 0; i < 50; i++) {
                      const seed = (selectedStar || 0) * 10000 + idx * 100 + i;
                      const angle = seededRandom(seed + 1) * 2 * Math.PI;
                      const radius = beltRadius + (seededRandom(seed + 2) - 0.5) * beltWidth;
                      const x = Math.cos(angle) * radius;
                      const y = Math.sin(angle) * radius;
                      const size = seededRandom(seed + 3) * 1.5 + 0.5;
                      g.beginFill(0x666666, 0.8);
                      g.drawCircle(x, y, size);
                      g.endFill();
                    }
                  } else {
                    const angle = (idx / star.bodies.length) * 2 * Math.PI;
                    const distance = body.distance_au * 230;
                    const x = Math.cos(angle) * distance;
                    const y = Math.sin(angle) * distance;
                    const color = body.color ? rgbTupleToHex(body.color) : 0x888888;
                    g.beginFill(color, 1);
                    g.drawCircle(x, y, 2);
                    g.endFill();
                  }
                });
              } else {
                // Galaxy view
                g.lineStyle(0.25, 0x1e90ff, 0.35);
                galaxy.hyperlanes.forEach((lane, idx) => {
                  const a = galaxy.stars[lane.a];
                  const b = galaxy.stars[lane.b];
                  if (!a || !b) return;
                  const isSelected = galaxySelection?.type === "lane" && galaxySelection.id === idx;
                  g.lineStyle(isSelected ? 0.75 : 0.5, isSelected ? 0xeeeeee : 0x55b7ff, isSelected ? 0.8 : 0.5);
                  g.moveTo(a.x, a.y);
                  g.lineTo(b.x, b.y);
                });

                galaxy.stars.forEach((star, idx) => {
                  const isSelected = galaxySelection?.type === "star" && galaxySelection.id === idx;
                  const isHighlighted = addingHyperlane || (editMode === "political" && selectedAdminForPaint != null && star.admin_levels[adminFocus.length] !== selectedAdminForPaint);
                  let fillColor = 0xeeeeee;
                  if (editMode === "political") {
                    const level = adminFocus.length;
                    const divId = star.admin_levels[level];
                    if (divId !== null && divId !== undefined) {
                      let color: [number, number, number] | undefined;
                      if (level === 0) {
                        color = countryDefs[divId]?.color;
                      } else if (level === 1) {
                        const countryId = star.admin_levels[0];
                        if (countryId !== null) {
                          color = countryDefs[countryId]?.sectors[divId]?.color;
                        }
                      } else if (level === 2) {
                        const countryId = star.admin_levels[0];
                        const sectorId = star.admin_levels[1];
                        if (countryId !== null && sectorId !== null) {
                          color = countryDefs[countryId]?.sectors[sectorId]?.provinces[divId]?.color;
                        }
                      } else if (level === 3) {
                        const countryId = star.admin_levels[0];
                        const sectorId = star.admin_levels[1];
                        const provinceId = star.admin_levels[2];
                        if (countryId !== null && sectorId !== null && provinceId !== null) {
                          color = countryDefs[countryId]?.sectors[sectorId]?.provinces[provinceId]?.clusters[divId]?.color;
                        }
                      }
                      if (color) {
                        fillColor = rgbTupleToHex(color);
                      }
                    }
                  }
                  g.beginFill(fillColor, isSelected ? 1 : 0.9);
                  g.lineStyle(isSelected ? 0.45 : 0, isHighlighted ? 0xffff00 : 0xeeeeee, isSelected ? 0.9 : (isHighlighted ? 0.8 : 0));
                  g.drawCircle(star.x, star.y, isSelected ? 2.8 : 2.2);
                  g.endFill();
                });

                // Draw voronoi regions for view, political modes
                if (editMode === "view" || editMode === "political") {
                  const zoomLevel = Math.floor(zoom * 2); // 0: <0.5, 1: 0.5-1, 2: 1-1.5, 3: 1.5-2, etc.
                  const displayLevel = Math.min(zoomLevel, 3); // max level 3
                  voronoiPolys.forEach((poly, idx) => {
                    if (!poly) return;
                    const star = galaxy.stars[idx];
                    const level = adminFocus.length;
                    const divId = star.admin_levels[level];
                    let color = 0x333333; // default gray
                    let alpha = 0.1;
                    if (divId !== null && divId !== undefined) {
                      let col: [number, number, number] | undefined;
                      if (level === 0) {
                        col = countryDefs[divId]?.color;
                      } else if (level === 1) {
                        const countryId = star.admin_levels[0];
                        if (countryId !== null) {
                          col = countryDefs[countryId]?.sectors[divId]?.color;
                        }
                      } else if (level === 2) {
                        const countryId = star.admin_levels[0];
                        const sectorId = star.admin_levels[1];
                        if (countryId !== null && sectorId !== null) {
                          col = countryDefs[countryId]?.sectors[sectorId]?.provinces[divId]?.color;
                        }
                      } else if (level === 3) {
                        const countryId = star.admin_levels[0];
                        const sectorId = star.admin_levels[1];
                        const provinceId = star.admin_levels[2];
                        if (countryId !== null && sectorId !== null && provinceId !== null) {
                          col = countryDefs[countryId]?.sectors[sectorId]?.provinces[provinceId]?.clusters[divId]?.color;
                        }
                      }
                      if (col) {
                        color = rgbTupleToHex(col);
                        alpha = displayLevel === 0 ? 0.4 : 0.2;
                      }
                    }
                    g.beginFill(color, alpha);
                    g.lineStyle(0.5, color, 0.3);
                    g.moveTo(poly[0][0], poly[0][1]);
                    for (let i = 1; i < poly.length; i++) {
                      g.lineTo(poly[i][0], poly[i][1]);
                    }
                    g.closePath();
                    g.endFill();
                  });
                }
              }
            }}
          />
        </Container>
      </Stage>
    </div>
  );
}
