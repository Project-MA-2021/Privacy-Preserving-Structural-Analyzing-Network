// src/utils/sphereLayout.ts
import type { Node } from '../types/symbolNetwork';

export type Coord3D = [number, number, number];

export function computeSphereLayout(
  nodes: Node[],
  radius = 10
): Record<string, Coord3D> {
  const n = nodes.length;
  const coords: Record<string, Coord3D> = {};

  if (n === 0) return coords;

  if (n === 1) {
    const node = nodes[0];
    if (!node) return coords; // 理论上不会走到这里，只是让 TS 安心
    coords[node.id] = [0, 0, radius];
    return coords;
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // 约 2.39996

  nodes.forEach((node, i) => {
    const t = i / (n - 1);          // [0, 1]
    const y = 1 - 2 * t;            // [1, -1]
    const r = Math.sqrt(1 - y * y); // 圆环半径
    const theta = goldenAngle * i;

    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;

    coords[node.id] = [x * radius, y * radius, z * radius];
  });

  return coords;
}
