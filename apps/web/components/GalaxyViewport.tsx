"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Container, Graphics, Stage } from "@pixi/react";
import { Delaunay } from "d3-delaunay";
import type {
  CountryDefinition,
  Galaxy,
  ResourceDefinition,
  Selection,
  ViewMode,
} from "../lib/types";
import { fallbackPalette, rgbTupleToHex } from "../lib/color";

type Props = {
  galaxy?: Galaxy;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onDeselect: () => void;
  viewMode: ViewMode;
  resourceDefs?: ResourceDefinition[];
  countryDefs?: CountryDefinition[];
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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
  resourceDefs = [],
  countryDefs = [],
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
    const startX = (size.width - galaxy.width * baseScale) / 2;
    const startY = (size.height - galaxy.height * baseScale) / 2;
    setOffset({ x: startX, y: startY });
    setZoom(1);
  }, [galaxy, baseScale, size.height, size.width]);

  const scaled = baseScale * zoom;

  const voronoiPolys = useMemo(() => {
    if (!galaxy || galaxy.stars.length === 0) return [];
    const points = galaxy.stars.map((s) => [s.x, s.y]);
    const delaunay = Delaunay.from(points);
    const voronoi = delaunay.voronoi([0, 0, galaxy.width, galaxy.height]);
    const polys: (number[] | undefined)[] = [];
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
      const nextZoom = clamp(zoom * (1 - event.deltaY * 0.001), 0.25, 6);
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
    const tolerance = 12 / scaled;
    let found: Selection = null;

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

    if (found) {
      onSelect(found);
    } else {
      onDeselect();
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
        <Container position={[offset.x, offset.y]} scale={scaled}>
          <Graphics
            draw={(g) => {
              g.clear();
              if (!galaxy) return;
              // Overlay view
              if (viewMode === "countries" || viewMode === "resources") {
                const regions = viewMode === "countries" ? galaxy.ownership : galaxy.resources;
                regions.forEach((region) => {
                const baseColor =
                  viewMode === "countries"
                    ? countryDefs[region.id]?.color
                    : resourceDefs[region.id]?.color;
                const color = baseColor ? rgbTupleToHex(baseColor) : fallbackPalette(region.id);
                  region.systems.forEach((idx) => {
                    const poly = voronoiPolys[idx];
                    if (!poly || poly.length === 0) return;
                    g.beginFill(color, 0.38);
                    g.lineStyle(0, 0, 0);
                    g.moveTo(poly[0][0], poly[0][1]);
                    for (let i = 1; i < poly.length; i++) {
                      g.lineTo(poly[i][0], poly[i][1]);
                    }
                    g.closePath();
                    g.endFill();
                  });
                });
              }

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
                g.beginFill(0xeeeeee, isSelected ? 1 : 0.9);
                g.lineStyle(isSelected ? 0.45 : 0, 0xeeeeee, isSelected ? 0.9 : 0);
                g.drawCircle(star.x, star.y, isSelected ? 2.8 : 2.2);
                g.endFill();
              });
            }}
          />
        </Container>
      </Stage>
    </div>
  );
}
