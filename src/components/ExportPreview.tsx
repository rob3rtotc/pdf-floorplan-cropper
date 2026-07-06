import React, { useEffect, useRef } from 'react';
import { X, FileDown, Eye } from 'lucide-react';

interface ExportPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  croppedCanvas: HTMLCanvasElement | null;
  apartmentName: string;
  projectName: string;
  orientation: 'portrait' | 'landscape';
  scaleMode: 'fit' | 'fixed';
  targetScale: number;
  customText: string;
}

export const ExportPreview: React.FC<ExportPreviewProps> = ({
  isOpen,
  onClose,
  onConfirm,
  croppedCanvas,
  apartmentName,
  projectName,
  orientation,
  scaleMode,
  targetScale,
  customText
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isOpen || !croppedCanvas || !previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw the cropped canvas image onto our preview container
    canvas.width = croppedCanvas.width;
    canvas.height = croppedCanvas.height;
    ctx.drawImage(croppedCanvas, 0, 0);
  }, [isOpen, croppedCanvas]);

  if (!isOpen) return null;

  const dateStr = new Date().toLocaleDateString('de-DE');

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 110 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '850px', 
          width: '95%', 
          maxHeight: '90vh', 
          display: 'flex', 
          flexDirection: 'column',
          padding: 0
        }}
      >
        <div className="modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', margin: 0 }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Eye size={18} style={{ color: 'var(--primary)' }} />
            Exposé A4-Vorschau
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable container for preview */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#11151e', padding: '2rem 1rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {/* Mock A4 Sheet */}
          <div 
            className={`a4-sheet ${orientation}`}
            style={{
              padding: '40px',
              color: '#1e293b', // Dark gray text for print style
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontFamily: 'Helvetica, Arial, sans-serif'
            }}
          >
            {/* 1. Header Area */}
            <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.025em' }}>
                  WOHNUNGSGRUNDRISS
                </h3>
                <p style={{ fontSize: '11px', margin: '4px 0 0 0', color: '#64748b' }}>
                  Projekt: {projectName || 'Mehrfamilienhaus'} | Stand: {dateStr}
                </p>
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>
                Exposé-Plan
              </div>
            </div>

            {/* 2. Map/Floor Plan Placement */}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 0', overflow: 'hidden' }}>
              <div 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                  border: '1px solid #f1f5f9',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  background: '#ffffff',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                <canvas 
                  ref={previewCanvasRef} 
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '400px', 
                    objectFit: 'contain',
                    display: 'block' 
                  }} 
                />
              </div>
            </div>

            {/* 3. Footer Area */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#4f46e5' }}>
                  Wohnung {apartmentName || '[Auswahl]'}
                </h4>
                <p style={{ fontSize: '10px', margin: '4px 0 0 0', color: '#64748b' }}>
                  Maßstab: {scaleMode === 'fixed' ? `1:${targetScale} (im Druck)` : 'Anpassung an Seitengröße'}
                </p>
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'right', maxWidth: '300px' }}>
                {customText || 'Grundriss ohne Gewähr. Alle Maße sind Circa-Angaben.'}
              </div>
            </div>
            
            {/* Subtle outer cut border */}
            <div style={{ position: 'absolute', top: '15px', left: '15px', right: '15px', bottom: '15px', border: '1px solid #e2e8f0', pointerEvents: 'none' }} />
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
