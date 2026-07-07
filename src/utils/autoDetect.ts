import type { ParsedTextItem, VectorLine } from '../hooks/usePDFParser';
import type { Point } from './math';

// Regex patterns to detect apartment numbers
// 1. Matches WE followed by numbers, optionally with dots (e.g., WE 11.01, WE 1, WE 12)
// 2. Matches isolated decimal numbers (e.g. 11.01, 12.02)
// 3. Matches numbers inside parentheses (e.g. (11.01))
const APARTMENT_PATTERNS = [
  /\bWE\s*(\d+(?:\.\d+)*)\b/i,
  /\b(\d+\.(?:0[1-9]|1[0-9]))\b/,
  /\((\d+(?:\.\d+)*)\)/
];

export interface DetectedApartment {
  name: string;      // Normalized identifier, e.g. "1" or "11.01"
  originalText: string;
  count: number;     // Number of occurrences
}

/**
 * Helper to check if a text item is located within the building plan drawing area
 * (excluding the legend block on the right and the title block at the bottom).
 */
function isWithinBuildingPlan(item: ParsedTextItem, pageWidth: number, pageHeight: number): boolean {
  if (pageWidth <= 0 || pageHeight <= 0) return true;
  
  // 1. Exclude the legend on the right (typical x > 75% of page width)
  if (item.x > pageWidth * 0.75) return false;
  
  // 2. Exclude the title block at the bottom (typical y > 88% of page height in viewport space)
  if (item.y > pageHeight * 0.88) return false;
  
  return true;
}

/**
 * Normalizes apartment keys by stripping "WE" prefixes and trimming.
 * For example: "WE 1" -> "1", "WE1" -> "1", "11.01" -> "11.01".
 */
function normalizeApartmentKey(key: string): string {
  return key.toUpperCase().replace(/^WE\s*/, '').trim();
}

/**
 * Parses all text items on a page and returns a list of detected apartment numbers,
 * sorted by frequency of occurrence. Excludes legend and title block texts.
 */
export function detectApartments(
  textItems: ParsedTextItem[],
  _pageWidth: number = 0,
  _pageHeight: number = 0
): DetectedApartment[] {
  const counts: { [key: string]: { original: string; count: number } } = {};

  textItems.forEach(item => {
    // DO NOT exclude the legend block for apartment detection, as it contains 
    // the most reliable list of all units. The crop limits will be constrained
    // to the building plan coordinate space later during the snap phase.
    const text = item.str.trim();
    if (!text) return;

    for (const pattern of APARTMENT_PATTERNS) {
      // Convert pattern to global regex to find all occurrences in multi-line blocks
      const globalPattern = new RegExp(pattern.source, 'gi');
      let match;
      
      while ((match = globalPattern.exec(text)) !== null) {
        const rawKey = match[1];
        const key = normalizeApartmentKey(rawKey);
        
        // Ignore single digits unless prefixed by "WE" or inside parens,
        // to avoid matching random scale numbers, wall measurements
        if (key.length <= 1 && !text.toUpperCase().includes('WE') && !text.includes('(')) {
          continue;
        }
        
        // Ignore typical wall thicknesses and dimensions (e.g. 24, 10, 15, 30, 36)
        if (/^(24|10|15|30|36|40|50|100|1:100|1:50)$/.test(key)) {
          continue;
        }
        
        // Ignore typical window sizes and outer wall dimension chains (e.g. 1.02, 2.04, 1.82, 2.80)
        // that frequently appear in floor plans but are not apartment numbers
        if (/^(1[\.,]0[1-3]|1[\.,]82|2[\.,]0[45]|0[\.,]77|0[\.,]88|1[\.,]26|1[\.,]47|2[\.,]49|2[\.,]80|1[\.,]72|2[\.,]52|4[\.,]20|4[\.,]35|3[\.,]22|3[\.,]96|4[\.,]36|1[\.,]67|2[\.,]46|4[\.,]25|10[\.,]00)$/.test(key)) {
          continue;
        }

        if (counts[key]) {
          counts[key].count++;
        } else {
          counts[key] = {
            original: rawKey,
            count: 1
          };
        }
      }
    }
  });

  return Object.keys(counts)
    .map(key => ({
      name: counts[key].original,
      originalText: counts[key].original,
      count: counts[key].count
    }))
    .filter(apt => apt.count >= 1)
    .sort((a, b) => b.count - a.count);
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Calculates the bounding box in PDF points around all text items
 * belonging to a specific apartment. Excludes items outside the building drawing area.
 */
export function getApartmentBoundingBox(
  textItems: ParsedTextItem[],
  apartmentName: string,
  padding: number = 60, // PDF points
  pageWidth: number = 0,
  pageHeight: number = 0
): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  const normalizedTarget = normalizeApartmentKey(apartmentName);

  textItems.forEach(item => {
    // Exclude legend & title block texts when computing building coordinates
    if (!isWithinBuildingPlan(item, pageWidth, pageHeight)) return;

    const text = normalizeApartmentKey(item.str);
    
    // Check if the text matches the apartment key (e.g. "1" matches "1" or "WE1")
    if (text === normalizedTarget || item.str.toLowerCase().includes(apartmentName.toLowerCase())) {
      found = true;
      const x = item.x;
      const y = item.y;
      const width = item.width || 20;
      const height = item.height || 10;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + width > maxX) maxX = x + width;
      if (y + height > maxY) maxY = y + height;
    }
  });

  if (!found) return null;

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding
  };
}

/**
 * Converts a bounding box to a 4-point polygon (clockwise starting from top-left)
 * to be used with the polygon selection tool.
 */
export function bboxToPolygon(bbox: BoundingBox): { x: number; y: number }[] {
  return [
    { x: bbox.minX, y: bbox.minY }, // Top-Left (viewport space)
    { x: bbox.maxX, y: bbox.minY }, // Top-Right
    { x: bbox.maxX, y: bbox.maxY }, // Bottom-Right
    { x: bbox.minX, y: bbox.maxY }  // Bottom-Left
  ];
}

/**
 * Computes the outer outline polygon of a union of rectangles,
 * and offsets it outwards by 'padding'.
 */
export function computePolygonUnionAndOffset(
  rectangles: { x0: number; y0: number; x1: number; y1: number }[],
  padding: number
): Point[] {
  if (rectangles.length === 0) return [];
  
  // 1. Collect all x and y coordinates
  const xCoords = Array.from(new Set(rectangles.flatMap(r => [r.x0, r.x1]))).sort((a, b) => a - b);
  const yCoords = Array.from(new Set(rectangles.flatMap(r => [r.y0, r.y1]))).sort((a, b) => a - b);
  
  const isInside = (x: number, y: number) => {
    for (const r of rectangles) {
      if (r.x0 + 0.05 < x && x < r.x1 - 0.05 && r.y0 + 0.05 < y && y < r.y1 - 0.05) {
        return true;
      }
    }
    return false;
  };
  
  // 2. Extract horizontal boundary sub-segments
  interface HorizSegment {
    x0: number;
    x1: number;
    y: number;
    offsetDir: number;
  }
  const horizSegments: HorizSegment[] = [];
  for (const y of yCoords) {
    for (let i = 0; i < xCoords.length - 1; i++) {
      const x0 = xCoords[i];
      const x1 = xCoords[i + 1];
      const mx = (x0 + x1) / 2;
      
      let isEdge = false;
      for (const r of rectangles) {
        if (r.x0 <= x0 && x1 <= r.x1 && (Math.abs(r.y0 - y) < 0.05 || Math.abs(r.y1 - y) < 0.05)) {
          isEdge = true;
          break;
        }
      }
      
      if (isEdge && !isInside(mx, y)) {
        const insideAbove = isInside(mx, y - 0.5);
        const insideBelow = isInside(mx, y + 0.5);
        if (insideAbove !== insideBelow) {
          const offsetDir = insideAbove ? 1 : -1;
          horizSegments.push({ x0, x1, y, offsetDir });
        }
      }
    }
  }
  
  // 3. Extract vertical boundary sub-segments
  interface VertSegment {
    y0: number;
    y1: number;
    x: number;
    offsetDir: number;
  }
  const vertSegments: VertSegment[] = [];
  for (const x of xCoords) {
    for (let i = 0; i < yCoords.length - 1; i++) {
      const y0 = yCoords[i];
      const y1 = yCoords[i + 1];
      const my = (y0 + y1) / 2;
      
      let isEdge = false;
      for (const r of rectangles) {
        if (r.y0 <= y0 && y1 <= r.y1 && (Math.abs(r.x0 - x) < 0.05 || Math.abs(r.x1 - x) < 0.05)) {
          isEdge = true;
          break;
        }
      }
      
      if (isEdge && !isInside(x, my)) {
        const insideLeft = isInside(x - 0.5, my);
        const insideRight = isInside(x + 0.5, my);
        if (insideLeft !== insideRight) {
          const offsetDir = insideLeft ? 1 : -1;
          vertSegments.push({ y0, y1, x, offsetDir });
        }
      }
    }
  }
  
  // 4. Find all intersections of offset segments
  interface Corner {
    vx: number;
    hy: number;
    ox: number;
    oy: number;
  }
  const originalCorners: Corner[] = [];
  for (const vs of vertSegments) {
    for (const hs of horizSegments) {
      const xMatch = Math.abs(vs.x - hs.x0) < 0.05 || Math.abs(vs.x - hs.x1) < 0.05;
      const yMatch = Math.abs(hs.y - vs.y0) < 0.05 || Math.abs(hs.y - vs.y1) < 0.05;
      if (xMatch && yMatch) {
        const ox = vs.x + vs.offsetDir * padding;
        const oy = hs.y + hs.offsetDir * padding;
        originalCorners.push({ vx: vs.x, hy: hs.y, ox, oy });
      }
    }
  }
  
  if (originalCorners.length === 0) return [];
  
  // 5. Connect the corners to build the closed polygon loop
  const polygon: Point[] = [];
  let current = originalCorners[0];
  const visited = new Set<Corner>();
  
  while (visited.size < originalCorners.length) {
    visited.add(current);
    polygon.push({ x: current.ox, y: current.oy });
    
    const isVertStep = visited.size % 2 === 1;
    let nextCorner: Corner | null = null;
    
    for (const c of originalCorners) {
      if (visited.has(c)) continue;
      if (isVertStep) {
        if (Math.abs(c.vx - current.vx) < 0.05) {
          nextCorner = c;
          break;
        }
      } else {
        if (Math.abs(c.hy - current.hy) < 0.05) {
          nextCorner = c;
          break;
        }
      }
    }
    
    if (!nextCorner) {
      for (const c of originalCorners) {
        if (!visited.has(c)) {
          if (Math.abs(c.vx - current.vx) < 0.05 || Math.abs(c.hy - current.hy) < 0.05) {
            nextCorner = c;
            break;
          }
        }
      }
    }
    
    if (!nextCorner) break;
    current = nextCorner;
  }
  
  return polygon;
}

/**
 * Extracts and snaps room bounding boxes for the selected apartment.
 */
export function getRoomRects(
  textItems: ParsedTextItem[],
  lines: VectorLine[],
  apartmentName: string,
  pageWidth: number,
  pageHeight: number
): { x0: number; y0: number; x1: number; y1: number }[] {
  const normalizedTarget = normalizeApartmentKey(apartmentName);
  const roomRects: { x0: number; y0: number; x1: number; y1: number }[] = [];

  if (lines.length === 0) return [];

  // 1. Separate vector lines into horizontal and vertical wall segments
  interface LineSegment {
    coord: number;
    min: number;
    max: number;
  }
  const horizontalWalls: LineSegment[] = [];
  const verticalWalls: LineSegment[] = [];

  lines.forEach(l => {
    const isDark = !l.color || l.color === 'black' || l.color === '#000000' || l.color.startsWith('rgb(0,') || l.color.startsWith('rgba(0,');
    if (!isDark) return;

    const w = l.x1 - l.x0;
    const h = l.y1 - l.y0;
    if (w < 1 && h < 1) return;
    
    const isHoriz = h < w;
    if (isHoriz) {
      horizontalWalls.push({ coord: (l.y0 + l.y1) / 2, min: l.x0, max: l.x1 });
    } else {
      verticalWalls.push({ coord: (l.x0 + l.x1) / 2, min: l.y0, max: l.y1 });
    }
  });

  // 2. Map all text elements in the plan area into viewport space
  interface RoomCandidate {
    cx: number;
    cy: number;
    text: string;
  }
  const roomCandidates: RoomCandidate[] = [];

  textItems.forEach(item => {
    if (!isWithinBuildingPlan(item, pageWidth, pageHeight)) return;
    const text = item.str.trim();
    if (!text) return;

    const cx = item.x + (item.width || 10) / 2;
    const cy = item.y + (item.height || 8) / 2;
    roomCandidates.push({ cx, cy, text });
  });

  // 3. Find and group room label centers belonging to this apartment
  const roomCenters: Point[] = [];
  const roomKeywords = ['BAD', 'SCHLAFEN', 'WOHNEN', 'FLUR', 'KOCHEN', 'KÜCHE', 'KINDER', 'DIELE', 'WC', 'ABSTELL', 'BALKON', 'TERRASSE'];

  roomCandidates.forEach(cand => {
    const norm = normalizeApartmentKey(cand.text);
    const upperText = cand.text.toUpperCase();
    
    const isCommonArea = upperText === 'G' || upperText === 'TH' || upperText === 'TR' || 
                         upperText.includes('TREPPENHAUS') || upperText.includes('GEMEINSCHAFT');
    if (isCommonArea) {
      roomCenters.push({ x: cand.cx, y: cand.cy });
      return;
    }

    if (norm === normalizedTarget) {
      roomCenters.push({ x: cand.cx, y: cand.cy });
      return;
    }

    const isRoomName = roomKeywords.some(keyword => upperText.includes(keyword));
    if (isRoomName) {
      let closestLabel: string | null = null;
      let minDist = 60.0;
      
      roomCandidates.forEach(lbl => {
        const lblNorm = normalizeApartmentKey(lbl.text);
        if (lblNorm === normalizedTarget) {
          const dist = Math.sqrt(Math.pow(cand.cx - lbl.cx, 2) + Math.pow(cand.cy - lbl.cy, 2));
          if (dist < minDist) {
            minDist = dist;
            closestLabel = lblNorm;
          }
        }
      });
      
      if (closestLabel === normalizedTarget) {
        roomCenters.push({ x: cand.cx, y: cand.cy });
      }
    }
  });

  if (roomCenters.length === 0) return [];

  // 4. Ray-cast boundary snap for each room center to find walls
  const tolerance = 15;

  roomCenters.forEach(pt => {
    const cx = pt.x;
    const cy = pt.y;

    let leftWall = 0;
    verticalWalls.forEach(w => {
      if (w.coord < cx && w.min - tolerance <= cy && cy <= w.max + tolerance) {
        leftWall = Math.max(leftWall, w.coord);
      }
    });

    let rightWall = pageWidth;
    verticalWalls.forEach(w => {
      if (w.coord > cx && w.min - tolerance <= cy && cy <= w.max + tolerance) {
        rightWall = Math.min(rightWall, w.coord);
      }
    });

    let upWall = 0;
    horizontalWalls.forEach(w => {
      if (w.coord < cy && w.min - tolerance <= cx && cx <= w.max + tolerance) {
        upWall = Math.max(upWall, w.coord);
      }
    });

    let downWall = pageHeight;
    horizontalWalls.forEach(w => {
      if (w.coord > cy && w.min - tolerance <= cx && cx <= w.max + tolerance) {
        downWall = Math.min(downWall, w.coord);
      }
    });

    const x0 = leftWall > 0 ? leftWall : cx - 80;
    const x1 = rightWall < pageWidth ? rightWall : cx + 80;
    const y0 = upWall > 0 ? upWall : cy - 80;
    const y1 = downWall < pageHeight ? downWall : cy + 80;
    
    if (x0 < x1 && y0 < y1) {
      roomRects.push({ x0, y0, x1, y1 });
    }
  });

  return roomRects;
}

/**
 * High-precision snapping algorithm using horizontal/vertical black wall lines
 * and grouping room texts by proximity to target unit labels.
 * If lines are empty (e.g. image-based plan), falls back to default rectangular bounding box.
 */
export function getSnappedApartmentBbox(
  textItems: ParsedTextItem[],
  lines: VectorLine[],
  apartmentName: string,
  padding: number,
  pageWidth: number,
  pageHeight: number
): Point[] {
  // Fallback 1: If no vector lines are present (e.g., raster images), return standard rectangular crop
  if (lines.length === 0) {
    const rawBox = getApartmentBoundingBox(textItems, apartmentName, padding, pageWidth, pageHeight);
    if (!rawBox) return [];
    return bboxToPolygon(rawBox);
  }

  const roomRects = getRoomRects(textItems, lines, apartmentName, pageWidth, pageHeight);

  // Fallback 2: If no matching room coordinates are grouped, use standard bounding box fallback
  if (roomRects.length === 0) {
    const rawBox = getApartmentBoundingBox(textItems, apartmentName, padding, pageWidth, pageHeight);
    if (!rawBox) return [];
    return bboxToPolygon(rawBox);
  }

  // 5. Run the Orthogonal Polygon Union and Offset algorithm
  return computePolygonUnionAndOffset(roomRects, padding);
}
