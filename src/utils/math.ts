export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Calculates the bounding box of a list of points.
 */
export function getPolygonBoundingBox(points: Point[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });

  return { minX, minY, maxX, maxY };
}

/**
 * Standard ray-casting algorithm to check if a point is inside a polygon.
 */
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const x = point.x;
  const y = point.y;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Euclidean distance between two points.
 */
export function getDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Find the closest point on a line segment [a, b] to point p.
 * Returns the closest point and the distance to it.
 */
export function getClosestPointOnSegment(p: Point, a: Point, b: Point): { point: Point; distance: number; t: number } {
  const l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
  
  if (l2 === 0) return { point: a, distance: getDistance(p, a), t: 0 };
  
  // Projection factor t clamped to [0, 1]
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  
  const closestPoint = {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y)
  };
  
  return {
    point: closestPoint,
    distance: getDistance(p, closestPoint),
    t
  };
}

/**
 * Converts a physical distance in meters at a target scale (e.g. 1:100)
 * to physical PDF points (72 points = 1 inch = 25.4 mm).
 */
export function metersToPdfPoints(meters: number, scale: number): number {
  // scale of 100 means 1:100.
  // 1 meter in reality = 1000 / scale mm on paper.
  // e.g. 1m at 1:100 = 10mm.
  const mmOnPaper = (meters * 1000) / scale;
  return (mmOnPaper * 72) / 25.4;
}

/**
 * Calculates the scaling factor to convert coordinates from the uploaded PDF document
 * space to the output A4 page space.
 * 
 * @param calibratedDistanceInPdfPoints Distance measured in original PDF points
 * @param physicalDistanceInMeters Actual real-world distance in meters
 * @param targetScale Export scale (e.g. 50 for 1:50, 100 for 1:100)
 */
export function calculateExportScaleFactor(
  calibratedDistanceInPdfPoints: number,
  physicalDistanceInMeters: number,
  targetScale: number
): number {
  const originalPointsPerMeter = calibratedDistanceInPdfPoints / physicalDistanceInMeters;
  
  // Target points per meter on A4 paper:
  // e.g. at 1:100, 1 meter = 10mm = 28.346 PDF points.
  const targetPointsPerMeter = metersToPdfPoints(1, targetScale);
  
  return targetPointsPerMeter / originalPointsPerMeter;
}
