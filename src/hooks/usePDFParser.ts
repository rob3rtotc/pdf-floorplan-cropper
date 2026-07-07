import { useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker using unpkg CDN matching the installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface ParsedTextItem {
  str: string;
  x: number; // PDF space x
  y: number; // PDF space y
  width: number;
  height: number;
}

export interface VectorLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  width: number;
}

export interface PDFPageData {
  pageIndex: number;
  width: number;  // original width in PDF points
  height: number; // original height in PDF points
  textItems: ParsedTextItem[];
}

export function usePDFParser() {
  const [pdfDocument, setPdfDocument] = useState<any | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadPDF = useCallback(async (fileOrUrl: File | string) => {
    setLoading(true);
    setError(null);
    try {
      let documentProxy;
      if (typeof fileOrUrl === 'string') {
        documentProxy = await pdfjsLib.getDocument({ url: fileOrUrl }).promise;
      } else {
        const arrayBuffer = await fileOrUrl.arrayBuffer();
        documentProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      }
      setPdfDocument(documentProxy);
      setNumPages(documentProxy.numPages);
      setLoading(false);
      return documentProxy;
    } catch (err: any) {
      console.error('Error parsing PDF:', err);
      setError(err?.message || 'Failed to load and parse PDF document.');
      setLoading(false);
      return null;
    }
  }, []);

  const getPageData = useCallback(async (pageNum: number): Promise<PDFPageData | null> => {
    if (!pdfDocument) return null;
    try {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      
      const textItems: ParsedTextItem[] = textContent.items
        .filter((item: any) => typeof item.str === 'string' && item.str.trim() !== '')
        .map((item: any) => {
          // transform is a 6-element array representing the 2D transform matrix:
          // [scaleX, skewY, skewX, scaleY, transformX, transformY]
          const x = item.transform[4];
          const y = item.transform[5];
          return {
            str: item.str,
            x,
            y,
            width: item.width || 0,
            height: item.height || 0
          };
        });

      return {
        pageIndex: pageNum - 1,
        width: viewport.width,
        height: viewport.height,
        textItems
      };
    } catch (err: any) {
      console.error(`Error loading page ${pageNum}:`, err);
      setError(`Failed to extract data from page ${pageNum}.`);
      return null;
    }
  }, [pdfDocument]);

  const getPageVectors = useCallback(async (pageNum: number): Promise<VectorLine[]> => {
    if (!pdfDocument) return [];
    try {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const operatorList = await page.getOperatorList();
      
      const { fnArray, argsArray } = operatorList;
      const lines: VectorLine[] = [];
      
      // Matrix helper
      const multiply = (m1: number[], m2: number[]): number[] => [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
      ];
      
      const transformPoint = (m: number[], px: number, py: number) => ({
        x: m[0] * px + m[2] * py + m[4],
        y: m[1] * px + m[3] * py + m[5]
      });

      // Initialize CTM with the page viewport's transform matrix
      let ctm = [...viewport.transform];
      const ctmStack: number[][] = [];
      
      let currentPt = { x: 0, y: 0 };
      let startPt = { x: 0, y: 0 };
      
      // Default styles
      let strokeColor = '#000000';
      let strokeWidth = 1.0;
      
      // OPS codes mapping matching PDF.js
      const OPS = {
        save: 10,
        restore: 11,
        transform: 12,
        moveTo: 13,
        lineTo: 14,
        curveTo: 15,
        curveTo2: 16,
        curveTo3: 17,
        closePath: 18,
        rectangle: 19,
        setLineWidth: 2,
        setStrokeGray: 56,
        setFillGray: 57,
        setStrokeRGBColor: 58,
        setFillRGBColor: 59
      };

      for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i];
        const args = argsArray[i];
        
        switch (fn) {
          case OPS.save:
            ctmStack.push([...ctm]);
            break;
            
          case OPS.restore:
            if (ctmStack.length > 0) {
              ctm = ctmStack.pop()!;
            }
            break;
            
          case OPS.transform:
            ctm = multiply(ctm, args);
            break;
            
          case OPS.setLineWidth:
            strokeWidth = args[0];
            break;
            
          case OPS.setStrokeGray:
            strokeColor = args[0] < 0.2 ? '#000000' : 'gray';
            break;
            
          case OPS.setFillGray:
            strokeColor = args[0] < 0.2 ? '#000000' : 'gray';
            break;
            
          case OPS.setStrokeRGBColor: {
            const sr = args[0], sg = args[1], sb = args[2];
            if (sr > 200 && sg < 150 && sb < 50) {
              strokeColor = 'red';
            } else if (sr < 50 && sg < 50 && sb < 50) {
              strokeColor = '#000000';
            } else {
              strokeColor = `rgb(${sr},${sg},${sb})`;
            }
            break;
          }
            
          case OPS.setFillRGBColor: {
            const fr = args[0], fg = args[1], fb = args[2];
            if (fr > 200 && fg < 150 && fb < 50) {
              strokeColor = 'red';
            } else if (fr < 50 && fg < 50 && fb < 50) {
              strokeColor = '#000000';
            } else {
              strokeColor = `rgb(${fr},${fg},${fb})`;
            }
            break;
          }
            
          case OPS.moveTo:
            currentPt = transformPoint(ctm, args[0], args[1]);
            startPt = { ...currentPt };
            break;
            
          case OPS.lineTo: {
            const nextPt = transformPoint(ctm, args[0], args[1]);
            lines.push({
              x0: currentPt.x,
              y0: currentPt.y,
              x1: nextPt.x,
              y1: nextPt.y,
              color: strokeColor,
              width: strokeWidth
            });
            currentPt = nextPt;
            break;
          }
            
          case OPS.rectangle: {
            const rx = args[0];
            const ry = args[1];
            const rw = args[2];
            const rh = args[3];
            
            const p00 = transformPoint(ctm, rx, ry);
            const p10 = transformPoint(ctm, rx + rw, ry);
            const p11 = transformPoint(ctm, rx + rw, ry + rh);
            const p01 = transformPoint(ctm, rx, ry + rh);
            
            lines.push(
              { x0: p00.x, y0: p00.y, x1: p10.x, y1: p10.y, color: strokeColor, width: strokeWidth },
              { x0: p10.x, y0: p10.y, x1: p11.x, y1: p11.y, color: strokeColor, width: strokeWidth },
              { x0: p11.x, y0: p11.y, x1: p01.x, y1: p01.y, color: strokeColor, width: strokeWidth },
              { x0: p01.x, y0: p01.y, x1: p00.x, y1: p00.y, color: strokeColor, width: strokeWidth }
            );
            break;
          }
            
          case OPS.curveTo: {
            const cp3 = transformPoint(ctm, args[4], args[5]);
            lines.push({
              x0: currentPt.x,
              y0: currentPt.y,
              x1: cp3.x,
              y1: cp3.y,
              color: strokeColor,
              width: strokeWidth
            });
            currentPt = cp3;
            break;
          }
            
          case OPS.curveTo2: {
            const cp3_2 = transformPoint(ctm, args[2], args[3]);
            lines.push({
              x0: currentPt.x,
              y0: currentPt.y,
              x1: cp3_2.x,
              y1: cp3_2.y,
              color: strokeColor,
              width: strokeWidth
            });
            currentPt = cp3_2;
            break;
          }
            
          case OPS.curveTo3: {
            const cp3_3 = transformPoint(ctm, args[2], args[3]);
            lines.push({
              x0: currentPt.x,
              y0: currentPt.y,
              x1: cp3_3.x,
              y1: cp3_3.y,
              color: strokeColor,
              width: strokeWidth
            });
            currentPt = cp3_3;
            break;
          }
            
          case OPS.closePath:
            lines.push({
              x0: currentPt.x,
              y0: currentPt.y,
              x1: startPt.x,
              y1: startPt.y,
              color: strokeColor,
              width: strokeWidth
            });
            currentPt = { ...startPt };
            break;
        }
      }
      
      return lines;
    } catch (err) {
      console.error('Error extracting page vectors:', err);
      return [];
    }
  }, [pdfDocument]);

  const clearPDF = useCallback(() => {
    setPdfDocument(null);
    setNumPages(0);
    setError(null);
  }, []);

  return {
    pdfDocument,
    numPages,
    loading,
    error,
    loadPDF,
    getPageData,
    getPageVectors,
    clearPDF
  };
}
