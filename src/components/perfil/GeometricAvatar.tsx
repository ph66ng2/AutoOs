import type { ReactNode } from "react";

/**
 * Avatares geométricos (desenhos em previews/avatares-geometricos/). Fundo e olhos usam
 * `currentColor`, a silhueta é branca. O canto arredondado vem da caixa do ProfileAvatar.
 */
const eye = (x: number, y: number, rotate?: { angle: number; cx: number; cy: number }, height = 20) => (
  <rect
    x={x}
    y={y}
    width={8}
    height={height}
    rx={4}
    transform={rotate ? `rotate(${rotate.angle} ${rotate.cx} ${rotate.cy})` : undefined}
    fill="currentColor"
  />
);

export const GEOMETRIC_SHAPES: Record<string, ReactNode> = {
  "shape-orb": (
    <>
      <circle cx="64" cy="64" r="39" fill="#fff" />
      {eye(49, 53, { angle: -13, cx: 53, cy: 63 })}
      {eye(71, 50, { angle: -13, cx: 75, cy: 60 })}
    </>
  ),
  "shape-square": (
    <>
      <rect x="26" y="27" width="76" height="74" rx="18" fill="#fff" />
      {eye(49, 53)}
      {eye(71, 53)}
    </>
  ),
  "shape-peak": (
    <>
      <path d="M54 28c5-8 15-8 20 0l33 54c7 12-1 21-14 21H35c-13 0-21-9-14-21z" fill="#fff" />
      {eye(50, 58, { angle: -16, cx: 54, cy: 68 })}
      {eye(72, 54, { angle: -16, cx: 76, cy: 64 })}
    </>
  ),
  "shape-pill": (
    <>
      <rect x="41" y="23" width="46" height="82" rx="23" fill="#fff" />
      {eye(52, 55, { angle: -18, cx: 56, cy: 65 })}
      {eye(71, 50, { angle: -18, cx: 75, cy: 60 })}
    </>
  ),
  "shape-bean": (
    <>
      <path
        d="M41 28c12-9 28-7 42 1 15 9 23 23 22 39-1 16-12 29-29 33-13 3-22-4-35 2-12 5-25-2-25-16 0-11 8-17 16-23 7-5 9-12 5-20-3-7-2-12 4-16z"
        fill="#fff"
      />
      {eye(51, 59, { angle: -17, cx: 55, cy: 69 })}
      {eye(74, 55, { angle: -17, cx: 78, cy: 65 })}
    </>
  ),
  "shape-hex": (
    <>
      <path
        d="M40 27h48c5 0 9 2 12 7l19 25c2 3 2 7 0 10l-19 25c-3 5-7 7-12 7H40c-5 0-9-2-12-7L9 69c-2-3-2-7 0-10l19-25c3-5 7-7 12-7z"
        fill="#fff"
      />
      {eye(50, 54)}
      {eye(70, 54)}
    </>
  ),
  "shape-arch": (
    <>
      <path d="M25 101V64c0-24 17-40 39-40s39 16 39 40v37H82V82c0-10-7-17-18-17s-18 7-18 17v19z" fill="#fff" />
      {eye(49, 49, { angle: 15, cx: 53, cy: 58 }, 18)}
      {eye(72, 49, { angle: 15, cx: 76, cy: 58 }, 18)}
    </>
  ),
  "shape-cloud": (
    <>
      <path
        d="M31 96c-15 0-24-10-24-23 0-12 9-21 20-22 3-18 18-29 36-29 17 0 30 10 35 24 14 0 23 11 23 25 0 15-11 25-26 25z"
        fill="#fff"
      />
      {eye(50, 57, { angle: -15, cx: 54, cy: 66 }, 18)}
      {eye(72, 54, { angle: -15, cx: 76, cy: 63 }, 18)}
    </>
  ),
  "shape-block": (
    <>
      <path d="M42 28h44c10 0 17 7 17 17v42c0 10-7 17-17 17H42c-10 0-17-7-17-17V45c0-10 7-17 17-17z" fill="#fff" />
      <path d="M37 98h16v11c0 3-2 5-5 5h-6c-3 0-5-2-5-5zm38 0h16v11c0 3-2 5-5 5h-6c-3 0-5-2-5-5z" fill="#fff" />
      {eye(49, 54, { angle: -10, cx: 53, cy: 64 })}
      {eye(71, 52, { angle: -10, cx: 75, cy: 62 })}
    </>
  ),
};

export function isGeometricShape(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(GEOMETRIC_SHAPES, id);
}

/** Desenho inline (o `currentColor` só herda a cor assim). Ocupa a caixa inteira. */
export function GeometricAvatar({ shape, color, className }: { shape: string; color: string; className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} style={{ color }} aria-hidden="true" focusable="false">
      <rect width="128" height="128" fill="currentColor" />
      {GEOMETRIC_SHAPES[shape]}
    </svg>
  );
}
