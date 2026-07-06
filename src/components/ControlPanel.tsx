import React from 'react';
import type { DetectedApartment } from '../utils/autoDetect';
import { 
  Upload, FileText, ChevronLeft, ChevronRight, Check, 
  FileDown, Layers, Compass
} from 'lucide-react';

interface ControlPanelProps {
  fileName: string | null;
  numPages: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenGoogleDrive: () => void;
  detectedApartments: DetectedApartment[];
  selectedApartment: string | null;
  onSelectApartment: (aptName: string) => void;
  onScanApartment: () => void;
  isOcrLoading: boolean;
  autoCropPadding: number;
  setAutoCropPadding: (p: number) => void;
  
  // Export states
  projectName: string;
  setProjectName: (name: string) => void;
  orientation: 'portrait' | 'landscape';
  setOrientation: (o: 'portrait' | 'landscape') => void;
  customText: string;
  setCustomText: (t: string) => void;
  
  onExport: () => void;
  isExporting: boolean;
  recommendedOrientation: 'portrait' | 'landscape';
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  fileName,
  numPages,
  currentPage,
  setCurrentPage,
  onFileUpload,
  onOpenGoogleDrive,
  detectedApartments,
  selectedApartment,
  onSelectApartment,
  onScanApartment,
  isOcrLoading,
  autoCropPadding,
  setAutoCropPadding,
  
  projectName,
  setProjectName,
  orientation,
  setOrientation,
  customText,
  setCustomText,
  
  onExport,
  isExporting,
  recommendedOrientation
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleNextPage = () => {
    if (currentPage < numPages) setCurrentPage(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Layers className="logo-icon" size={24} />
        <h1 className="sidebar-title">PlanCropper</h1>
      </div>

      <div className="sidebar-content">
        {/* 1. PDF FILE UPLOAD */}
        <section className="card">
          <h2 className="card-title">
            <Upload size={16} /> 1. Datei hochladen
          </h2>
          
          {!fileName ? (
            <div className="dropzone" onClick={() => fileInputRef.current?.click()}>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={onFileUpload} 
                accept=".pdf" 
                style={{ display: 'none' }}
              />
              <FileText size={32} className="dropzone-icon" />
              <div className="dropzone-text">
                <p style={{ fontWeight: 600, color: '#fafaf7' }}>Grundriss-PDF auswählen</p>
                <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'rgba(250, 249, 245, 0.6)' }}>Oder anklicken zum Durchsuchen</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <FileText size={16} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={fileName}>
                  {fileName}
                </span>
              </div>
              <button className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={() => fileInputRef.current?.click()}>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={onFileUpload} 
                  accept=".pdf" 
                  style={{ display: 'none' }}
                />
                Andere Datei wählen
              </button>
            </div>
          )}

          {fileName && (
            <button 
              className="btn btn-secondary" 
              style={{ marginTop: '0.5rem', fontSize: '0.75rem', padding: '0.5rem' }}
              onClick={onOpenGoogleDrive}
            >
              Von Google Drive laden...
            </button>
          )}
          
          {!fileName && (
            <button 
              className="btn btn-secondary" 
              style={{ marginTop: '0.5rem' }}
              onClick={onOpenGoogleDrive}
            >
              Google Drive öffnen
            </button>
          )}

          {/* Page Selector (if multi-page PDF) */}
          {numPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '8px' }}>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '0.25rem' }} onClick={handlePrevPage} disabled={currentPage === 1}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Seite {currentPage} von {numPages}
              </span>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '0.25rem' }} onClick={handleNextPage} disabled={currentPage === numPages}>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </section>

        {/* 2. APARTMENT SELECTOR */}
        {fileName && (
          <section className="card">
            <h2 className="card-title">
              <Check size={16} /> 2. Wohnung wählen
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Wohnungsbezeichnung (z. B. 11.01)</label>
                <input 
                  type="text" 
                  placeholder="z. B. 11.01" 
                  value={selectedApartment || ''}
                  onChange={(e) => onSelectApartment(e.target.value)}
                  className="input-field" 
                />
              </div>

              <div className="input-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="input-label">Zuschnitts-Rand ({autoCropPadding} px)</label>
                  <span style={{ fontSize: '9px', color: 'rgba(250, 249, 245, 0.4)', fontWeight: 500 }}>Maßketten einblenden</span>
                </div>
                <input 
                  type="range" 
                  min="20" 
                  max="140" 
                  step="5"
                  value={autoCropPadding}
                  onChange={(e) => setAutoCropPadding(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer', marginTop: '0.25rem' }}
                />
              </div>

              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.625rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}
                onClick={onScanApartment}
                disabled={isOcrLoading}
              >
                {isOcrLoading ? (
                  <>
                    <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                    Scanne Ausschnitt...
                  </>
                ) : (
                  <>
                    <Compass size={15} style={{ color: 'var(--primary)' }} />
                    Wohnungsnummer scannen (OCR)
                  </>
                )}
              </button>

              {detectedApartments.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <label className="input-label" style={{ display: 'block', marginBottom: '0.375rem' }}>Erkannte Bezeichnungen:</label>
                  <div className="apartment-list">
                    {detectedApartments.map(apt => (
                      <div 
                        key={`apt-${apt.name}`}
                        className={`apartment-item ${selectedApartment === apt.name ? 'active' : ''}`}
                        onClick={() => onSelectApartment(apt.name)}
                      >
                        <span className="apartment-name">WE {apt.name}</span>
                        <span className="apartment-count">{apt.count} Räume</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detectedApartments.length === 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.25rem' }}>
                  Keine Bezeichnungen im PDF-Textlayer gefunden. Benutze OCR-Scan oder trage die Nummer manuell ein.
                </p>
              )}
            </div>
          </section>
        )}

        {/* 3. EXPORT & EXPOSE SETTINGS */}
        {fileName && (
          <section className="card">
            <h2 className="card-title">
              <FileDown size={16} /> 3. Exposé & Export
            </h2>

            <div className="input-group">
              <label className="input-label">Projektname</label>
              <input 
                type="text" 
                placeholder="z. B. Projektkürzel oder Adresse"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="input-field"
              />
            </div>

            <div className="input-group">
              <label className="input-label">Hinweistext (Fußzeile)</label>
              <input 
                type="text" 
                placeholder="Maße sind vor Ort zu überprüfen."
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                className="input-field"
              />
            </div>

            <div className="input-group" style={{ marginBottom: '0.75rem' }}>
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>A4-Ausrichtung</span>
                <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 600 }}>
                  Empf.: {recommendedOrientation === 'portrait' ? 'Hoch' : 'Quer'}
                </span>
              </label>
              <select 
                value={orientation} 
                onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
                className="input-field"
              >
                <option value="portrait">Hochformat</option>
                <option value="landscape">Querformat</option>
              </select>
            </div>

            <button 
              className="btn btn-primary" 
              onClick={onExport} 
              disabled={isExporting}
              style={{ marginTop: '0.5rem' }}
            >
              {isExporting ? 'Exportiert...' : 'A4 Exposé-PDF erzeugen'}
            </button>
          </section>
        )}
      </div>
    </aside>
  );
};
