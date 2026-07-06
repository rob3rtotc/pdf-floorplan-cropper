import { useState, useEffect, useCallback } from 'react';
import { usePDFParser, type PDFPageData } from './hooks/usePDFParser';
import { detectApartments, getApartmentBoundingBox, bboxToPolygon, type DetectedApartment } from './utils/autoDetect';
import { type Point, type BoundingBox } from './utils/math';
import { renderCroppedArea, exportToA4Pdf, type ExportOptions } from './utils/exportHelper';
import { recognizeApartmentNumber } from './utils/ocr';
import { DocumentViewer } from './components/DocumentViewer';
import { ControlPanel } from './components/ControlPanel';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { ExportPreview } from './components/ExportPreview';
import { Layers, AlertTriangle, CheckCircle, Info } from 'lucide-react';

function App() {
  const {
    pdfDocument,
    numPages,
    loading: pdfLoading,
    error: pdfError,
    loadPDF,
    getPageData,
    clearPDF
  } = usePDFParser();

  // App file state
  const [fileName, setFileName] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageData, setPageData] = useState<PDFPageData | null>(null);

  // Interaction modes: 'crop', 'calibrate', 'pan'
  const [activeMode, setActiveMode] = useState<'crop' | 'pan'>('pan');

  // Polygon selection points (in CSS pixels / points matching viewBox)
  const [polygon, setPolygon] = useState<Point[]>([]);

  // Selected apartment and detected lists
  const [detectedApartments, setDetectedApartments] = useState<DetectedApartment[]>([]);
  const [selectedApartment, setSelectedApartment] = useState<string | null>(null);

  // Export metadata
  const [projectName, setProjectName] = useState<string>('');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [customText, setCustomText] = useState<string>('Alle Angaben ohne Gewähr. Maße sind vor Ort zu überprüfen.');

  // Modals & UI feedback
  const [isDriveModalOpen, setIsDriveModalOpen] = useState<boolean>(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [croppedCanvas, setCroppedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isOcrLoading, setIsOcrLoading] = useState<boolean>(false);
  const [autoCropPadding, setAutoCropPadding] = useState<number>(85); // Default to 85 pt (~3cm) to include dimension chains
  
  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  // Helper to extract a project name from the filename
  const extractProjectName = (name: string): string => {
    let base = name.replace(/\.[^/.]+$/, ""); // Strip file extension
    base = base.replace(/[_-]/g, " ");
    return base
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
      .trim();
  };

  // Handle file uploads
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setProjectName(extractProjectName(file.name));
    setCurrentPage(1);
    setSelectedApartment(null);
    
    const doc = await loadPDF(file);
    if (doc) {
      showToast('PDF erfolgreich geladen!', 'success');
      setActiveMode('crop');
    }
  };

  // Handle URL uploads (e.g. from Google Drive proxy or web link)
  const handleLoadUrl = async (url: string) => {
    let name = 'Web-Dokument.pdf';
    if (url.includes('docs.google.com')) {
      name = 'Google Drive Plan';
    } else {
      try {
        const parts = url.split('/');
        name = decodeURIComponent(parts[parts.length - 1].split(/[?#]/)[0]) || 'Web-Plan';
      } catch {
        name = 'Web-Plan';
      }
    }
    setFileName(name);
    setProjectName(extractProjectName(name));
    setCurrentPage(1);
    setSelectedApartment(null);

    const doc = await loadPDF(url);
    if (doc) {
      showToast('PDF erfolgreich aus der Cloud geladen!', 'success');
      setActiveMode('crop');
    }
  };

  // Helper to update crop polygon
  const applyPolygonAndAutoOrientation = useCallback((poly: Point[]) => {
    setPolygon(poly);
  }, []);

  // Automatically adjust orientation when crop polygon coordinates change
  useEffect(() => {
    if (polygon.length < 3) return;
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
    const w = maxX - minX;
    const h = maxY - minY;
    setOrientation(w >= h ? 'landscape' : 'portrait');
  }, [polygon]);

  // Fetch page details and run detection when page changes
  useEffect(() => {
    if (!pdfDocument) {
      setPageData(null);
      setDetectedApartments([]);
      return;
    }

    const fetchPageInfo = async () => {
      const data = await getPageData(currentPage);
      if (data) {
        setPageData(data);
        
        // Auto-detect apartment groups on page (passing dimensions to filter out legend)
        const apts = detectApartments(data.textItems, data.width, data.height);
        setDetectedApartments(apts);

        if (apts.length > 0) {
          setSelectedApartment(apts[0].name);
        } else {
          setSelectedApartment(null);
        }
      }
    };

    fetchPageInfo();
  }, [pdfDocument, currentPage, getPageData]);

  // Reactively compute the crop box when selectedApartment or padding changes
  useEffect(() => {
    if (!pageData) return;

    const exists = selectedApartment 
      ? detectedApartments.some(apt => apt.name.toLowerCase() === selectedApartment.toLowerCase().trim())
      : false;

    if (exists && selectedApartment) {
      const bbox = getApartmentBoundingBox(
        pageData.textItems,
        selectedApartment,
        autoCropPadding,
        pageData.width,
        pageData.height
      );
      if (bbox) {
        const poly = bboxToPolygon(bbox);
        const height = pageData.height;
        const flippedPoly = poly.map(pt => ({
          x: pt.x,
          y: height - pt.y
        }));
        applyPolygonAndAutoOrientation(flippedPoly);
      }
    } else {
      // Default centered crop box responsive to the autoCropPadding slider
      const w = pageData.width;
      const h = pageData.height;
      
      const marginX = Math.min(w * 0.4, autoCropPadding * (w / 425));
      const marginY = Math.min(h * 0.4, autoCropPadding * (h / 425));

      const defaultPoly = [
        { x: marginX, y: marginY },
        { x: w - marginX, y: marginY },
        { x: w - marginX, y: h - marginY },
        { x: marginX, y: h - marginY }
      ];
      applyPolygonAndAutoOrientation(defaultPoly);
    }
  }, [selectedApartment, autoCropPadding, pageData, detectedApartments, applyPolygonAndAutoOrientation]);

  // Handle selection of a detected apartment unit or manual text typing
  const handleSelectApartment = (aptName: string) => {
    setSelectedApartment(aptName);
    // Note: crop calculations are handled reactively by the useEffect hook
  };

  // Run OCR on the selected crop area to recognize apartment number
  const handleScanApartment = async () => {
    if (!pdfDocument || !pageData || polygon.length < 3) return;

    try {
      setIsOcrLoading(true);
      showToast('Analysiere Ausschnitt auf Text...', 'info');
      
      const page = await pdfDocument.getPage(currentPage);
      // Render at 2x scale for decent OCR quality without being too heavy
      const canvas = await renderCroppedArea(page, polygon, 2.0);
      
      const detected = await recognizeApartmentNumber(canvas);
      if (detected) {
        setSelectedApartment(detected);
        showToast(`Wohnung WE ${detected} erfolgreich erkannt!`, 'success');
      } else {
        showToast('Keine Wohnungsnummer im Ausschnitt per OCR erkannt.', 'info');
      }
    } catch (err) {
      console.error('OCR scanning error:', err);
      showToast('OCR-Erkennung fehlgeschlagen.', 'error');
    } finally {
      setIsOcrLoading(false);
    }
  };

  // Trigger high-res rendering and open A4 preview
  const handleExportClick = async () => {
    if (!pdfDocument || !pageData || polygon.length < 3) return;

    try {
      setIsExporting(true);
      const page = await pdfDocument.getPage(currentPage);
      
      // Render at 3x scale for crisp printing
      const canvas = await renderCroppedArea(page, polygon, 3.0);
      setCroppedCanvas(canvas);
      setIsPreviewOpen(true);
    } catch (err) {
      console.error('Error generating crop preview:', err);
      showToast('Fehler bei der Zuschnitt-Generierung.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Confirm and download final PDF
  const handleConfirmPdfExport = async () => {
    if (!croppedCanvas || !pageData) return;

    try {
      setIsExporting(true);
      
      // Calculate bounding box of polygon to center/scale in PDF
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

      // The exportHelper handles A4 formatting, legends, and scaling
      const options: ExportOptions = {
        apartmentName: selectedApartment || 'Auswahl',
        projectName: projectName,
        format: 'pdf',
        orientation: orientation,
        scaleMode: 'fit',
        targetScale: 100,
        pixelToMeterRatio: null,
        pdfPointsPerMeter: null,
        showLegend: true,
        customText: customText
      };

      await exportToA4Pdf(
        croppedCanvas, 
        { minX, minY, maxX, maxY }, 
        options
      );

      showToast('PDF-Exposé erfolgreich heruntergeladen!', 'success');
      setIsPreviewOpen(false);
    } catch (err) {
      console.error('PDF export failed:', err);
      showToast('PDF-Export fehlgeschlagen.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Dynamically calculate recommended orientation based on selection aspect ratio
  const getRecommendedOrientation = (): 'portrait' | 'landscape' => {
    if (polygon.length < 3) return 'landscape';
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
    return (maxX - minX) >= (maxY - minY) ? 'landscape' : 'portrait';
  };
  const recommendedOrientation = getRecommendedOrientation();

  // Bounding box for export preview WYSIWYG placement
  const getPolygonBbox = (): BoundingBox | null => {
    if (polygon.length < 3) return null;
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
    return { minX, minY, maxX, maxY };
  };
  const polygonBbox = getPolygonBbox();

  return (
    <div className="app-container">
      {/* Side Control Panel */}
      <ControlPanel
        fileName={fileName}
        numPages={numPages}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onFileUpload={handleFileUpload}
        onOpenGoogleDrive={() => setIsDriveModalOpen(true)}
        detectedApartments={detectedApartments}
        selectedApartment={selectedApartment}
        onSelectApartment={handleSelectApartment}
        onScanApartment={handleScanApartment}
        isOcrLoading={isOcrLoading}
        autoCropPadding={autoCropPadding}
        setAutoCropPadding={setAutoCropPadding}
        recommendedOrientation={recommendedOrientation}
        projectName={projectName}
        setProjectName={setProjectName}
        orientation={orientation}
        setOrientation={setOrientation}
        customText={customText}
        setCustomText={setCustomText}
        onExport={handleExportClick}
        isExporting={isExporting}
      />

      {/* Main interactive floor plan workspace */}
      <main className="workspace">
        {pdfLoading && (
          <div className="loading-screen">
            <div className="spinner" />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>PDF wird verarbeitet...</p>
          </div>
        )}

        {pdfError && (
          <div className="loading-screen" style={{ color: 'var(--error)', gap: '0.5rem' }}>
            <AlertTriangle size={32} />
            <p style={{ fontWeight: 600 }}>Fehler beim Laden der PDF</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{pdfError}</p>
            <button className="btn btn-secondary" style={{ width: 'auto', marginTop: '1rem' }} onClick={clearPDF}>
              Zurück
            </button>
          </div>
        )}

        {!pdfDocument && !pdfLoading && !pdfError ? (
          <div className="loading-screen">
            <Layers size={48} style={{ color: 'var(--primary)', marginBottom: '0.5rem', opacity: 0.8 }} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>PlanCropper Exposé-Tool</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '400px', textAlign: 'center', lineHeight: '1.5' }}>
              Lade einen Abgeschlossenheitsplan oder ein PDF-Geschossblatt hoch, um vollautomatisch einzelne Wohnungsgrundrisse zu isolieren und zu schneiden.
            </p>
            <button 
              className="btn btn-primary" 
              style={{ width: 'auto', marginTop: '1rem' }}
              onClick={() => {
                const el = document.querySelector('input[type="file"]') as HTMLInputElement;
                el?.click();
              }}
            >
              Grundriss-Datei wählen
            </button>
          </div>
        ) : (
          pageData && (
            <DocumentViewer
              pdfDocument={pdfDocument}
              pageNum={currentPage}
              pageWidth={pageData.width}
              pageHeight={pageData.height}
              polygon={polygon}
              setPolygon={setPolygon}
              activeMode={activeMode}
              setActiveMode={setActiveMode}
            />
          )
        )}

        {/* Global Toast Messages */}
        {toast && (
          <div className="toast">
            {toast.type === 'success' && <CheckCircle size={16} style={{ color: 'var(--success)' }} />}
            {toast.type === 'info' && <Info size={16} style={{ color: 'var(--primary)' }} />}
            {toast.type === 'error' && <AlertTriangle size={16} style={{ color: 'var(--error)' }} />}
            <span>{toast.message}</span>
          </div>
        )}
      </main>

      {/* Google Drive Loading Modal */}
      <GoogleDriveModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onLoadUrl={handleLoadUrl}
      />

      {/* A4 Export Preview & Expo Layout Overlay */}
      <ExportPreview
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        onConfirm={handleConfirmPdfExport}
        croppedCanvas={croppedCanvas}
        polygonBbox={polygonBbox}
        apartmentName={selectedApartment || ''}
        projectName={projectName}
        orientation={orientation}
        customText={customText}
      />
    </div>
  );
}

export default App;
