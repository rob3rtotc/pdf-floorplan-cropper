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
    clearPDF
  };
}
