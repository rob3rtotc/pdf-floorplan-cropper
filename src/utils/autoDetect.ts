import type { ParsedTextItem } from '../hooks/usePDFParser';

// Regex patterns to detect apartment numbers
// 1. Matches WE followed by numbers, optionally with dots (e.g., WE 11.01, WE 1, WE 12)
// 2. Matches isolated decimal numbers (e.g. 11.01, 12.02)
// 3. Matches numbers inside parentheses (e.g. (11.01))
const APARTMENT_PATTERNS = [
  /\bWE\s*(\d+(?:\.\d+)*)\b/i,
  /\b(\d+\.\d+)\b/,
  /\((\d+(?:\.\d+)*)\)/
];

export interface DetectedApartment {
  name: string;      // Normalized identifier, e.g. "11.01" or "WE 1"
  originalText: string;
  count: number;     // Number of occurrences
}

/**
 * Parses all text items on a page and returns a list of detected apartment numbers,
 * sorted by frequency of occurrence.
 */
export function detectApartments(textItems: ParsedTextItem[]): DetectedApartment[] {
  const counts: { [key: string]: { original: string; count: number } } = {};

  textItems.forEach(item => {
    const text = item.str.trim();
    if (!text) return;

    for (const pattern of APARTMENT_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        // Use the captured group (e.g. "11.01" from "WE 11.01") as the normalized key
        const key = match[1];
        
        // Ignore single digits unless prefixed by "WE" or inside parens,
        // to avoid matching random scale numbers, wall measurements (e.g. 24, 10, 4.44)
        if (key.length <= 1 && !text.toUpperCase().includes('WE') && !text.includes('(')) {
          continue;
        }
        
        // Ignore typical wall thicknesses and dimensions (e.g. 24, 10, 15, 36.5, 1:100)
        if (/^(24|10|15|30|36|40|50|100|1:100|1:50)$/.test(key)) {
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
    // Filter out items that only appear once unless they match a standard pattern
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
 * belonging to a specific apartment.
 */
export function getApartmentBoundingBox(
  textItems: ParsedTextItem[],
  apartmentName: string,
  padding: number = 60 // PDF points (approx 2cm)
): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  const normalizedTarget = apartmentName.toLowerCase().trim();

  textItems.forEach(item => {
    const text = item.str.toLowerCase().trim();
    // Check if the text contains the apartment name
    if (text.includes(normalizedTarget)) {
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
