import { createWorker } from 'tesseract.js';

const OCR_APARTMENT_PATTERNS = [
  /WE\s*([0-9IO]+[\.,][0-9IO]+)/i, // matches WE 11.01, WE 11.O1, WE 11,01
  /WE\s*([0-9IO]+)/i,             // matches WE 1, WE 01
  /\b([0-9IO]+[\.,][0-9IO]+)\b/    // matches isolated 11.01, 11.02
];

/**
 * Normalizes minor OCR misreadings of numbers (e.g., letter 'O' or 'I' instead of '0' or '1')
 * and normalizes commas to dots.
 */
function normalizeNumber(str: string): string {
  return str
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/,/g, '.');
}

/**
 * Runs OCR on a canvas and extracts the most likely apartment number.
 */
export async function recognizeApartmentNumber(
  canvas: HTMLCanvasElement
): Promise<string | null> {
  const worker = await createWorker('deu+eng');
  
  try {
    const { data: { text } } = await worker.recognize(canvas);
    console.log('OCR Raw Text:', text);
    
    // Split text into words and lines to inspect
    const lines = text.split('\n');
    for (const line of lines) {
      for (const pattern of OCR_APARTMENT_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          let detected = match[1].trim();
          detected = normalizeNumber(detected);
          
          // Basic validation: must contain at least one digit
          if (/\d/.test(detected)) {
            await worker.terminate();
            return detected;
          }
        }
      }
    }
    
    await worker.terminate();
    return null;
  } catch (err) {
    console.error('OCR Error:', err);
    try {
      await worker.terminate();
    } catch (e) {}
    return null;
  }
}
