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
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 720 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [startOffset, setStartOffset] = useState({ x: 0, y: 0 });
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    const syncSize = () => {
      if (!mountRef.current) return;
      setSize({ width: mountRef.current.clientWidth, height: mountRef.current.clientHeight });
    };
    syncSize();
    window.addEventListener("resize", syncSize);
    return () => window.removeEventListener("resize", syncSize);
  }, []);

  const baseScale = useMemo(() => {
    if (!galaxy) return 1;
    return Math.min(size.width / galaxy.width, size.height / galaxy.height);
  }, [galaxy, size.height, size.width]);

  useEffect(() => {
    if (!galaxy) return;
    if (viewMode === "galaxy") {
      const startX = (size.width - galaxy.width * baseScale) / 2;
      const startY = (size.height - galaxy.height * baseScale) / 2;
      setOffset({ x: startX, y: startY });
      setZoom(1);
    } else if (viewMode === "system" && selectedStar !== undefined) {
      const star = galaxy.stars[selectedStar];
      const maxDist = star && star.bodies.length > 0 ? Math.max(...star.bodies.map(b => b.distance_au)) : 1;
      const requiredZoom = (Math.min(size.width, size.height) / 2) / (maxDist * 10);
      setOffset({ x: 0, y: 0 });
      setZoom(clamp(requiredZoom, 0.1, 1));
    }
  }, [galaxy, baseScale, size.height, size.width, viewMode, selectedStar]);

  const scaled = baseScale * zoom;

  const voronoiPolys = useMemo(() => {
    if (!galaxy || galaxy.stars.length === 0) return [];
    const points = galaxy.stars.map((s) => [s.x, s.y]);
    const delaunay = Delaunay.from(points as any);
    const voronoi = delaunay.voronoi([0, 0, galaxy.width, galaxy.height]);
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
      const focus = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const minZoom = viewMode === "system" ? 0.1 : 0.25;
      const nextZoom = clamp(zoom * (1 - event.deltaY * 0.001), minZoom, 6);
      const scaleRatio = nextZoom / zoom;
      setOffset(({ x, y }) => ({
        x: focus.x - (focus.x - x) * scaleRatio,
        y: focus.y - (focus.y - y) * scaleRatio,
      }));
      setZoom(nextZoom);
    },
    [zoom]
  );

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    setDragging(true);
    setDragStart({ x: event.clientX, y: event.clientY });
    setStartOffset(offset);
    setMoved(false);
  };

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
                  const isSelected = selection?.type === "lane" && selection.id === idx;
                  g.lineStyle(isSelected ? 0.75 : 0.5, isSelected ? 0xeeeeee : 0x55b7ff, isSelected ? 0.8 : 0.5);
                  g.moveTo(a.x, a.y);
                  g.lineTo(b.x, b.y);
                });

                galaxy.stars.forEach((star, idx) => {
                  const isSelected = selection?.type === "star" && selection.id === idx;
                  let fillColor = 0xeeeeee;
                  if (editMode === "political") {
                    const countryId = star.admin_levels[0];
                    if (countryId !== null && countryId !== undefined) {
                      const country = countryDefs[countryId];
                      if (country) {
                        fillColor = rgbTupleToHex(country.color);
                      }
                    }
                  }
                  g.beginFill(fillColor, isSelected ? 1 : 0.9);
                  g.lineStyle(isSelected ? 0.45 : 0, 0xeeeeee, isSelected ? 0.9 : 0);
                  g.drawCircle(star.x, star.y, isSelected ? 2.8 : 2.2);
                  g.endFill();
                });
              }
            }}
          />
        </Container>
      </Stage>
    </div>
  );
}
