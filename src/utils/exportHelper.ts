import { jsPDF } from 'jspdf';
import type { Point, BoundingBox } from './math';

export interface ExportOptions {
  apartmentName: string;
  projectName: string;
  format: 'png' | 'pdf';
  orientation: 'portrait' | 'landscape';
  scaleMode: 'fit' | 'fixed';
  targetScale: number; // e.g. 50, 100, 200
  pixelToMeterRatio: number | null; // from calibration
  pdfPointsPerMeter: number | null; // from calibration (points in original PDF per meter)
  showLegend: boolean;
  customText?: string;
}

/**
 * Renders the cropped polygon area of a PDF page onto an offscreen canvas at high DPI.
 * Hides everything outside the polygon by filling it with solid white.
 * 
 * @param page The pdf.js PageProxy object
 * @param polygon Polygon points in original PDF page coordinates
 * @param exportScale Scale multiplier for rendering (e.g. 3.0 or 4.0 for high resolution)
 */
export async function renderCroppedArea(
  page: any,
  polygon: Point[],
  exportScale: number = 3.0
): Promise<HTMLCanvasElement> {
  // 1. Get viewport at target scale
  const viewport = page.getViewport({ scale: exportScale });
  
  // 2. Render entire page onto temporary canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = viewport.width;
  tempCanvas.height = viewport.height;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) throw new Error('Could not create 2D context for temp canvas.');
  
  await page.render({
    canvasContext: tempCtx,
    viewport: viewport
  }).promise;
  
  // 3. Convert polygon points to target high-DPI viewport scale
  const viewportPoints = polygon.map(pt => ({
    x: pt.x * exportScale,
    y: pt.y * exportScale
  }));
  
  // 4. Calculate bounding box of viewport points
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  viewportPoints.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  
  // Add a small safety margin of 5px to avoid edge clipping
  minX = Math.max(0, minX - 5);
  minY = Math.max(0, minY - 5);
  maxX = Math.min(viewport.width, maxX + 5);
  maxY = Math.min(viewport.height, maxY + 5);
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  // 5. Create target cropped canvas
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = width;
  targetCanvas.height = height;
  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) throw new Error('Could not create 2D context for target canvas.');
  
  // Fill background with white
  targetCtx.fillStyle = '#ffffff';
  targetCtx.fillRect(0, 0, width, height);
  
  // Save state, define clipping path, clip, draw, restore
  targetCtx.save();
  
  // Define polygon path offset by (-minX, -minY)
  targetCtx.beginPath();
  viewportPoints.forEach((pt, i) => {
    const px = pt.x - minX;
    const py = pt.y - minY;
    if (i === 0) targetCtx.moveTo(px, py);
    else targetCtx.lineTo(px, py);
  });
  targetCtx.closePath();
  
  targetCtx.clip();
  
  // Draw the full page rendering into the clipped region
  targetCtx.drawImage(tempCanvas, -minX, -minY);
  targetCtx.restore();
  
  return targetCanvas;
}

/**
 * Triggers a download of a canvas as a PNG file.
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = dataUrl;
  link.click();
}

/**
 * Exports the cropped plan to a DIN A4 PDF sheet (portrait/landscape),
 * either fitted to page or at a precise scale (e.g. 1:100).
 */
export async function exportToA4Pdf(
  croppedCanvas: HTMLCanvasElement,
  polygonBbox: BoundingBox, // original PDF coordinates of crop
  options: ExportOptions
): Promise<void> {
  const {
    apartmentName,
    projectName,
    orientation,
    customText
  } = options;
  
  // Create jsPDF document in points (1 point = 1/72 inch)
  const doc = new jsPDF({
    orientation: orientation,
    unit: 'pt',
    format: 'a4'
  });
  
  // A4 dimensions in points
  const a4Width = orientation === 'portrait' ? 595.28 : 841.89;
  const a4Height = orientation === 'portrait' ? 841.89 : 595.28;
  
  // Margins for exposé layout
  const marginTop = 60;
  const marginBottom = 60;
  const marginLeft = 40;
  const marginRight = 40;
  
  const printableWidth = a4Width - marginLeft - marginRight;
  const printableHeight = a4Height - marginTop - marginBottom;
  
  // Bounding box dimensions in original PDF points
  const bboxWidth = polygonBbox.maxX - polygonBbox.minX;
  const bboxHeight = polygonBbox.maxY - polygonBbox.minY;
  
  const aspect = bboxWidth / bboxHeight;
  const printableAspect = printableWidth / printableHeight;
  
  let targetWidthPt: number;
  let targetHeightPt: number;
  
  if (aspect > printableAspect) {
    targetWidthPt = printableWidth;
    targetHeightPt = printableWidth / aspect;
  } else {
    targetHeightPt = printableHeight;
    targetWidthPt = printableHeight * aspect;
  }
  
  // Center coordinates on the A4 page
  const xOffset = marginLeft + (printableWidth - targetWidthPt) / 2;
  const yOffset = marginTop + (printableHeight - targetHeightPt) / 2;
  
  // Convert cropped canvas to PNG data URL
  const imgData = croppedCanvas.toDataURL('image/png');
  
  // Draw the floor plan image
  doc.addImage(imgData, 'PNG', xOffset, yOffset, targetWidthPt, targetHeightPt);
  
  // DRAW EXPOSÉ STYLING (Fine borders and text headers)
  // Draw page border
  doc.setDrawColor(220, 225, 230);
  doc.setLineWidth(1);
  doc.rect(20, 20, a4Width - 40, a4Height - 40);
  
  // HEADER
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text(`WOHNUNGSGRUNDRISS`, 40, 45);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Slate-500
  const dateStr = new Date().toLocaleDateString('de-DE');
  doc.text(`Projekt: ${projectName || 'Mehrfamilienhaus'} | Stand: ${dateStr}`, 40, 58);
  
  // FOOTER
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(79, 70, 229); // Indigo-600
  doc.text(`Wohnung ${apartmentName}`, 40, a4Height - 45);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184); // Slate-400
  
  // Footer text disclaimer only (removed scaleText per user request)
  
  const disclamer = customText || 'Grundriss ohne Gewähr. Alle Maße sind Circa-Angaben.';
  doc.text(disclamer, a4Width - 40, a4Height - 32, { align: 'right' });
  
  // Save PDF document
  doc.save(`Grundriss_WE_${apartmentName}.pdf`);
}

/**
 * Renders the cropped polygon area of a PNG/JPG image file.
 * Trims background canvas and masks everything outside the polygon with solid white.
 */
export async function renderCroppedImageArea(
  imageSrc: string,
  polygon: Point[]
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Avoid tainted canvas for external URLs
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      // Calculate crop bounding box
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      polygon.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
      
      // Add safety margins
      minX = Math.max(0, minX - 5);
      minY = Math.max(0, minY - 5);
      maxX = Math.min(width, maxX + 5);
      maxY = Math.min(height, maxY + 5);
      
      const cropW = maxX - minX;
      const cropH = maxY - minY;
      
      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not create 2D canvas context.'));
        return;
      }
      
      // Paint white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cropW, cropH);
      
      // Apply polygon clipping path
      ctx.save();
      ctx.beginPath();
      polygon.forEach((pt, i) => {
        const px = pt.x - minX;
        const py = pt.y - minY;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.clip();
      
      // Draw cropped section of original image
      ctx.drawImage(
        img,
        minX, minY, cropW, cropH,
        0, 0, cropW, cropH
      );
      
      ctx.restore();
      resolve(canvas);
    };
    img.onerror = (e) => reject(e);
    img.src = imageSrc;
  });
}
