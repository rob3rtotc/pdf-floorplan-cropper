import type { ParsedTextItem } from '../hooks/usePDFParser';

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
  
  // 2. Exclude the title block at the bottom (typical PDF y < 12% of page height)
  if (item.y < pageHeight * 0.12) return false;
  
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
  pageWidth: number = 0,
  pageHeight: number = 0
): DetectedApartment[] {
  const counts: { [key: string]: { original: string; count: number } } = {};

  textItems.forEach(item => {
    // Exclude legend & title block texts
    if (!isWithinBuildingPlan(item, pageWidth, pageHeight)) return;

    const text = item.str.trim();
    if (!text) return;

    for (const pattern of APARTMENT_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
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
            original: key,
            count: 1
          };
        }
        break; // Match found, skip other patterns for this item
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
    { x: bbox.minX, y: bbox.maxY }, // Top-Left (PDF y-axis goes upwards!)
    { x: bbox.maxX, y: bbox.maxY }, // Top-Right
    { x: bbox.maxX, y: bbox.minY }, // Bottom-Right
    { x: bbox.minX, y: bbox.minY }  // Bottom-Left
  ];
}
