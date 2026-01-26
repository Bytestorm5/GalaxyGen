"use client";

import { useMemo } from "react";
import { Container, Graphics, Stage } from "@pixi/react";
import type { Galaxy } from "../lib/types";

type Props = {
  galaxy?: Galaxy;
  width?: number;
  height?: number;
};

const fallback = {
  stars: [
    { x: 0, y: 0 },
    { x: 1, y: 0.25 },
    { x: 0.7, y: 0.9 },
    { x: 0.3, y: 0.65 },
  ],
  hyperlanes: [
    { a: 0, b: 1 },
    { a: 1, b: 2 },
    { a: 2, b: 3 },
    { a: 3, b: 0 },
  ],
  width: 1,
  height: 1,
};

export function GalaxyCanvas({ galaxy, width = 900, height = 600 }: Props) {
  const normalized = galaxy ?? fallback;

  const { stars, hyperlanes } = useMemo(() => {
    const sx = width / (normalized.width || 1);
    const sy = height / (normalized.height || 1);
    const stars = normalized.stars.map((star) => ({
      x: star.x * sx,
      y: star.y * sy,
    }));
    return { stars, hyperlanes: normalized.hyperlanes };
  }, [galaxy, height, normalized, width]);

  return (
    <Stage width={width} height={height} options={{ backgroundAlpha: 0 }}>
      <Container>
        <Graphics
          draw={(g) => {
            g.clear();
            g.lineStyle(1.2, 0x65f3ff, 0.7);
            hyperlanes.forEach((lane) => {
              const start = stars[lane.a];
              const end = stars[lane.b];
              if (!start || !end) return;
              g.moveTo(start.x, start.y);
              g.lineTo(end.x, end.y);
            });
            g.lineStyle(0);
            stars.forEach((star) => {
              g.beginFill(0xffffff, 1);
              g.drawCircle(star.x, star.y, 4.5);
              g.endFill();
            });
          }}
        />
      </Container>
    </Stage>
  );
}
