import { useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker using unpkg CDN matching the installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface ParsedTextItem {
  str: string;
  x: number; // Viewport space x
  y: number; // Viewport space y
  width: number;
  height: number;
  isBuildingPlan?: boolean;
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
  const [debugInfo, setDebugInfo] = useState<string>('');

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
      
      const transformPoint = (m: number[], px: number, py: number) => ({
        x: m[0] * px + m[2] * py + m[4],
        y: m[1] * px + m[3] * py + m[5]
      });

      const unrotatedViewport = page.getViewport({ scale: 1.0, rotation: 0 });
      const pdfWidth = unrotatedViewport.width;
      const pdfHeight = unrotatedViewport.height;

      const textItems: ParsedTextItem[] = textContent.items
        .filter((item: any) => typeof item.str === 'string' && item.str.trim() !== '')
        .map((item: any) => {
          const tx = item.transform[4];
          const ty = item.transform[5];
          const tw = item.width || 0;
          const th = item.height || 0;
          
          const pdfCx = tx + tw / 2;
          const pdfCy = ty + th / 2;
          const pt = transformPoint(viewport.transform, pdfCx, pdfCy);
          
          // In unrotated PDF space:
          // Legend is on the right (pdfCx > pdfWidth * 0.74)
          // Title block is at the bottom (pdfCy < pdfHeight * 0.15)
          const isBuildingPlan = (pdfCx <= pdfWidth * 0.74) && (pdfCy >= pdfHeight * 0.15);
          
          return {
            str: item.str,
            x: pt.x - tw / 2,
            y: pt.y - th / 2,
            width: tw,
            height: th,
            isBuildingPlan
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
      
      const OPS = (pdfjsLib as any).OPS || {
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
        setFillRGBColor: 59,
        constructPath: 91
      };

      console.log("[usePDFParser] Extracted operator list:", {
        fnArrayLength: fnArray.length,
        opsSample: fnArray.slice(0, 10),
        OPS_codes: OPS
      });

      let firstConstructPathArgs = "";

      for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i];
        const args = argsArray[i];
        
        if (fn === OPS.constructPath && !firstConstructPathArgs && args) {
          firstConstructPathArgs = `args[0]: ${typeof args[0]} (isTyped: ${args[0] instanceof Uint8Array || args[0] instanceof Array}, len: ${args[0]?.length}), args[1]: ${typeof args[1]} (len: ${args[1]?.length}), sampleOps: [${Array.from((args[0] as any) || []).slice(0, 10).join(', ')}]`;
        }
        
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
            
          case OPS.constructPath: {
            const pathBuffer = args[1] && args[1][0];
            if (!pathBuffer) break;
            
            let idx = 0;
            while (idx < pathBuffer.length) {
              const op = pathBuffer[idx++];
              
              switch (op) {
                case 0: { // DrawOPS.moveTo
                  const x = pathBuffer[idx++];
                  const y = pathBuffer[idx++];
                  currentPt = transformPoint(ctm, x, y);
                  startPt = { ...currentPt };
                  break;
                }
                  
                case 1: { // DrawOPS.lineTo
                  const x = pathBuffer[idx++];
                  const y = pathBuffer[idx++];
                  const nextPt = transformPoint(ctm, x, y);
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
                  
                case 2: { // DrawOPS.curveTo
                  // Skip cp1 and cp2 control points coordinates (4 numbers), read only the endpoint (cp3)
                  idx += 4;
                  const cp3x = pathBuffer[idx++];
                  const cp3y = pathBuffer[idx++];
                  const nextPt = transformPoint(ctm, cp3x, cp3y);
                  
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
                  
                case 3: { // DrawOPS.quadraticCurveTo
                  // Skip cp1 control point coordinates (2 numbers), read only the endpoint (cp2)
                  idx += 2;
                  const cp2x = pathBuffer[idx++];
                  const cp2y = pathBuffer[idx++];
                  const nextPt = transformPoint(ctm, cp2x, cp2y);
                  
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
                  
                case 4: // DrawOPS.closePath
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
      
      const debugStr = `fnArrayLength: ${fnArray.length}, sample: [${Array.from(fnArray.slice(0, 15)).join(', ')}], OPS.constructPath: ${OPS.constructPath}, lines: ${lines.length}, firstArgs: ${firstConstructPathArgs}`;
      setDebugInfo(debugStr);

      console.log("[usePDFParser] Total vectors parsed:", lines.length);
      return lines;
    } catch (err: any) {
      console.error('Error extracting page vectors:', err);
      setDebugInfo(`Error: ${err.message || err}`);
      return [];
    }
  }, [pdfDocument]);

  const clearPDF = useCallback(() => {
    setPdfDocument(null);
    setNumPages(0);
    setError(null);
    setDebugInfo('');
  }, []);

  return {
    pdfDocument,
    numPages,
    loading,
    error,
    debugInfo,
    loadPDF,
    getPageData,
    getPageVectors,
    clearPDF
  };
}
