export type Side = {
  x: number
  y: number
  len: number
  deg: number
  light: number
}

export function roundedSides(width: number, depth: number, radius: number, steps = 6): Side[] {
  const corners: [number, number][] = []
  const arc = (cx: number, cy: number, from: number, to: number) => {
    for (let i = 0; i <= steps; i++) {
      const a = ((from + (to - from) * (i / steps)) * Math.PI) / 180
      corners.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)])
    }
  }

  const hx = width / 2
  const hy = depth / 2
  arc(hx - radius, hy - radius, 90, 0)
  arc(hx - radius, -hy + radius, 0, -90)
  arc(-hx + radius, -hy + radius, -90, -180)
  arc(-hx + radius, hy - radius, 180, 90)

  const sides: Side[] = []
  for (let i = 0; i < corners.length; i++) {
    const [x, y] = corners[i]
    const [nx, ny] = corners[(i + 1) % corners.length]
    const len = Math.hypot(nx - x, ny - y)
    if (len < 0.5) continue
    const ang = Math.atan2(ny - y, nx - x)
    const lx = -Math.sin(ang)
    const ly = Math.cos(ang)
    sides.push({
      x,
      y,
      len,
      deg: (ang * 180) / Math.PI,
      light: lx * -0.34 + ly * 0.94,
    })
  }
  return sides
}
