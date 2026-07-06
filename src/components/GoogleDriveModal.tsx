import React, { useState } from 'react';
import { X, Globe, Key, AlertTriangle } from 'lucide-react';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadUrl: (url: string) => void;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  onLoadUrl
}) => {
  const [driveUrl, setDriveUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!driveUrl.trim()) {
      setError('Bitte gib einen Link ein.');
      return;
    }

    // Attempt to extract File ID from Google Drive sharing link:
    // Format 1: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    // Format 2: https://drive.google.com/open?id=FILE_ID
    let fileId = '';
    const matchD = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const matchId = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);

    if (matchD) {
      fileId = matchD[1];
    } else if (matchId) {
      fileId = matchId[1];
    }

    if (fileId) {
      // Direct download URL for public Google Drive files
      const proxyUrl = `https://docs.google.com/uc?export=download&id=${fileId}`;
      onLoadUrl(proxyUrl);
      onClose();
    } else if (driveUrl.startsWith('http://') || driveUrl.startsWith('https://')) {
      // Generic public URL
      onLoadUrl(driveUrl);
      onClose();
    } else {
      setError('Ungültiges URL-Format. Bitte gib einen direkten PDF-Link oder einen Google Drive Freigabelink ein.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Globe size={18} style={{ color: 'var(--primary)' }} />
            Aus Cloud laden
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">Freigegebener Google Drive Link oder Web-URL</label>
            <input
              type="text"
              placeholder="https://drive.google.com/file/d/..."
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              className="input-field"
              autoFocus
            />
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--error)', fontSize: '0.75rem' }}>
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: '8px', padding: '0.75rem', fontSize: '0.75rem', color: 'var(--warning)', lineHeight: '1.4' }}>
            <div style={{ display: 'flex', gap: '0.375rem', fontWeight: 600, marginBottom: '0.25rem', alignItems: 'center' }}>
              <Key size={12} />
              <span>Hinweis zur Google Picker API Integration</span>
            </div>
            Für eine vollautomatische Google Drive Dateiauswahl (inklusive Anmeldefenster und Suchmaske) kann in der Production-Umgebung das offizielle <strong>Google Picker SDK</strong> in der Datei <code>App.tsx</code> eingebunden werden.
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary">
              PDF laden
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
