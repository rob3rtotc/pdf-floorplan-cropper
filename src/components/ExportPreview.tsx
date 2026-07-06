import React, { useEffect, useRef, useState } from 'react';
import { X, FileDown, Eye } from 'lucide-react';
import type { BoundingBox } from '../utils/math';

interface ExportPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  croppedCanvas: HTMLCanvasElement | null;
  polygonBbox: BoundingBox | null;
  apartmentName: string;
  projectName: string;
  orientation: 'portrait' | 'landscape';
  customText: string;
}

export const ExportPreview: React.FC<ExportPreviewProps> = ({
  isOpen,
  onClose,
  onConfirm,
  croppedCanvas,
  polygonBbox,
  apartmentName,
  projectName,
  orientation,
  customText
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [scale, setScale] = useState<number>(0.6);

  // 1. Draw pixels to preview canvas
  useEffect(() => {
    if (!isOpen || !croppedCanvas || !previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = croppedCanvas.width;
    canvas.height = croppedCanvas.height;
    ctx.drawImage(croppedCanvas, 0, 0);
  }, [isOpen, croppedCanvas]);

  // A4 sheet native dimensions in PDF points / CSS pixels
  const a4Width = orientation === 'portrait' ? 595.28 : 841.89;
  const a4Height = orientation === 'portrait' ? 841.89 : 595.28;

  // 2. Handle scale calculations to fit the sheet inside container dynamically
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updateScale = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const cWidth = container.clientWidth;
      const cHeight = container.clientHeight;
      
      // Calculate scale with some padding (40px)
      const scaleX = (cWidth - 40) / a4Width;
      const scaleY = (cHeight - 40) / a4Height;
      
      setScale(Math.min(scaleX, scaleY, 1.0));
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    
    // Quick timeout to let DOM dimensions settle
    const timer = setTimeout(updateScale, 50);

    return () => {
      window.removeEventListener('resize', updateScale);
      clearTimeout(timer);
    };
  }, [isOpen, orientation, a4Width, a4Height]);

  if (!isOpen || !polygonBbox) return null;

  const dateStr = new Date().toLocaleDateString('de-DE');

  // WYSIWYG positioning calculations mirroring exportHelper.ts exactly
  const marginTop = 60;
  const marginBottom = 60;
  const marginLeft = 40;
  const marginRight = 40;
  
  const printableWidth = a4Width - marginLeft - marginRight;
  const printableHeight = a4Height - marginTop - marginBottom;
  
  const bboxWidth = polygonBbox.maxX - polygonBbox.minX;
  const bboxHeight = polygonBbox.maxY - polygonBbox.minY;
  
  const aspect = bboxWidth / bboxHeight;
  const printableAspect = printableWidth / printableHeight;
  
  let targetWidthPt = 0;
  let targetHeightPt = 0;
  
  if (aspect > printableAspect) {
    targetWidthPt = printableWidth;
    targetHeightPt = printableWidth / aspect;
  } else {
    targetHeightPt = printableHeight;
    targetWidthPt = printableHeight * aspect;
  }
  
  // Center it on the sheet
  const xOffset = marginLeft + (printableWidth - targetWidthPt) / 2;
  const yOffset = marginTop + (printableHeight - targetHeightPt) / 2;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 110 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '900px', 
          width: '95%', 
          height: '92vh', 
          display: 'flex', 
          flexDirection: 'column',
          padding: 0,
          background: 'var(--bg-primary)'
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Eye size={18} style={{ color: 'var(--primary)' }} />
            Exposé A4-Vorschau (WYSIWYG)
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Scaled Preview Center Workspace */}
        <div 
          ref={containerRef}
          style={{ 
            flex: 1, 
            overflow: 'hidden', 
            background: '#192329', // Dark background for sheet contrast
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            position: 'relative'
          }}
        >
          {/* Zoom Wrapper */}
          <div 
            style={{ 
              transform: `scale(${scale})`, 
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease-out'
            }}
          >
            {/* Mock A4 Sheet (CSS matches final PDF coordinates 1-to-1) */}
            <div 
              className={`a4-sheet ${orientation}`}
              style={{
                width: `${a4Width}px`,
                height: `${a4Height}px`,
                padding: '40px',
                color: '#0f1a1f', 
                background: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                fontFamily: 'Helvetica, Arial, sans-serif',
                position: 'relative'
              }}
            >
              {/* 1. Header Area */}
              <div style={{ borderBottom: '1px solid #d2d5d8', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 10 }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#0f1a1f', letterSpacing: '-0.025em' }}>
                    WOHNUNGSGRUNDRISS
                  </h3>
                  <p style={{ fontSize: '10px', margin: '3px 0 0 0', color: '#4a555a' }}>
                    Projekt: {projectName || 'Mehrfamilienhaus'} | Stand: {dateStr}
                  </p>
                </div>
                <div style={{ fontSize: '9px', color: '#828e94', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Exposé-Plan
                </div>
              </div>

              {/* 2. WYSIWYG Cropped Floor Plan Element */}
              <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <canvas 
                  ref={previewCanvasRef} 
                  style={{ 
                    position: 'absolute',
                    left: `${xOffset}px`,
                    top: `${yOffset}px`,
                    width: `${targetWidthPt}px`,
                    height: `${targetHeightPt}px`,
                    boxShadow: '0 2px 10px rgba(15,26,31,0.04)',
                    border: '1px solid #eaeae5',
                    background: '#ffffff',
                    display: 'block'
                  }} 
                />
              </div>

              {/* 3. Footer Area */}
              <div style={{ borderTop: '1px solid #d2d5d8', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 10 }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#1f1fd8' }}>
                    Wohnung {apartmentName || '[Auswahl]'}
                  </h4>
                </div>
                <div style={{ fontSize: '9px', color: '#828e94', textAlign: 'right', maxWidth: '300px', lineHeight: '1.4' }}>
                  {customText}
                </div>
              </div>
              
              {/* Professional thin page border */}
              <div style={{ position: 'absolute', top: '20px', left: '20px', right: '20px', bottom: '20px', border: '1px solid #e1e4e6', pointerEvents: 'none' }} />
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ width: 'auto' }}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={onConfirm} style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileDown size={16} />
            Als PDF herunterladen
          </button>
        </div>
      </div>
    </div>
  );
};
