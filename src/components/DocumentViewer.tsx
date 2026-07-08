import React, { useRef, useState, useEffect, useCallback } from 'react';
import { type Point, getClosestPointOnSegment } from '../utils/math';
import { ZoomIn, ZoomOut, Maximize, Scissors, Hand } from 'lucide-react';

import { type VectorLine } from '../hooks/usePDFParser';

interface DocumentViewerProps {
  pdfDocument: any;
  imageSrc: string | null;
  pageNum: number;
  pageWidth: number;
  pageHeight: number;
  polygon: Point[];
  setPolygon: (points: Point[]) => void;
  activeMode: 'crop' | 'pan';
  setActiveMode: (mode: 'crop' | 'pan') => void;
  showHelpers?: boolean;
  pageVectors?: VectorLine[];
  roomRects?: { x0: number; y0: number; x1: number; y1: number }[];
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  pdfDocument,
  imageSrc,
  pageNum,
  pageWidth,
  pageHeight,
  polygon,
  setPolygon,
  activeMode,
  setActiveMode,
  showHelpers = false,
  pageVectors = [],
  roomRects = []
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const wasDragging = useRef<boolean>(false);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Draggable state
  const [draggedVertexIndex, setDraggedVertexIndex] = useState<number | null>(null);
  const [isDraggingPolygon, setIsDraggingPolygon] = useState<boolean>(false);
  const [dragPolygonStart, setDragPolygonStart] = useState<Point>({ x: 0, y: 0 });

  // Edge hover (subdivision)
  const [hoveredEdgePoint, setHoveredEdgePoint] = useState<{ point: Point; index: number } | null>(null);

  // Render PDF page or Image to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (imageSrc) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
      };
      img.src = imageSrc;
      return;
    }

    if (!pdfDocument) return;

    const renderPage = async () => {
      try {
        // Cancel existing render task if active
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          try {
            await renderTaskRef.current.promise;
          } catch (e) {
            // expected cancellation exception
          }
        }

        const page = await pdfDocument.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Render at 2x base resolution for sharp screen display
        const renderScale = 2.0;
        const viewport = page.getViewport({ scale: renderScale });
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };
        
        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
        }
      }
    };

    renderPage();

    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDocument, pageNum, imageSrc]);

  // Center the document when loaded
  useEffect(() => {
    if (pageWidth > 0 && containerRef.current) {
      const container = containerRef.current;
      const cWidth = container.clientWidth;
      const cHeight = container.clientHeight;
      
      // Scale to fit screen
      const fitZoom = Math.min((cWidth - 80) / pageWidth, (cHeight - 80) / pageHeight, 1.5);
      setZoom(fitZoom);
      
      // Center
      setPan({
        x: (cWidth - pageWidth * fitZoom) / 2,
        y: (cHeight - pageHeight * fitZoom) / 2
      });
    }
  }, [pageWidth, pageHeight, pageNum]);

  // Transform coordinates from container-mouse space to original PDF/viewBox space
  const screenToDocCoords = useCallback((clientX: number, clientY: number): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    
    // Position relative to container
    const rx = clientX - rect.left;
    const ry = clientY - rect.top;
    
    // Reverse zoom and pan
    return {
      x: (rx - pan.x) / zoom,
      y: (ry - pan.y) / zoom
    };
  }, [pan, zoom]);

  // Handle zooming via mouse wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const zoomIntensity = 0.1;
    const mouseDocPos = screenToDocCoords(e.clientX, e.clientY);
    
    let nextZoom = zoom - e.deltaY * zoomIntensity * 0.01 * zoom;
    nextZoom = Math.max(0.2, Math.min(6.0, nextZoom));

    // Shift pan offset to center zoom on mouse position
    const rect = containerRef.current.getBoundingClientRect();
    const rx = e.clientX - rect.left;
    const ry = e.clientY - rect.top;

    setZoom(nextZoom);
    setPan({
      x: rx - mouseDocPos.x * nextZoom,
      y: ry - mouseDocPos.y * nextZoom
    });
  };

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Start panning on middle click, spacebar hold, or pan mode
    const isMiddleClick = e.button === 1;
    const isPanMode = activeMode === 'pan' && e.button === 0;

    if (isMiddleClick || isPanMode) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handlePolygonDragStart = (e: React.PointerEvent) => {
    if (activeMode !== 'crop') return;
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingPolygon(true);
    setDragPolygonStart(screenToDocCoords(e.clientX, e.clientY));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    const mouseDoc = screenToDocCoords(e.clientX, e.clientY);

    // Handle whole polygon dragging
    if (isDraggingPolygon && activeMode === 'crop') {
      const dx = mouseDoc.x - dragPolygonStart.x;
      const dy = mouseDoc.y - dragPolygonStart.y;
      
      const nextPoints = polygon.map(p => ({
        x: Math.max(0, Math.min(pageWidth, p.x + dx)),
        y: Math.max(0, Math.min(pageHeight, p.y + dy))
      }));
      
      setPolygon(nextPoints);
      setDragPolygonStart(mouseDoc);
      wasDragging.current = true;
      return;
    }

    // 1. Handle vertex dragging
    if (draggedVertexIndex !== null && activeMode === 'crop') {
      const nextPoints = [...polygon];
      nextPoints[draggedVertexIndex] = {
        x: Math.max(0, Math.min(pageWidth, mouseDoc.x)),
        y: Math.max(0, Math.min(pageHeight, mouseDoc.y))
      };
      setPolygon(nextPoints);
      wasDragging.current = true;
      return;
    }

    // 3. Handle edge hover check (only in crop mode and when not dragging)
    if (activeMode === 'crop' && draggedVertexIndex === null) {
      let closestEdge: { point: Point; index: number; dist: number } | null = null;
      const hoverThreshold = 10 / zoom; // 10 screen pixels

      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const res = getClosestPointOnSegment(mouseDoc, a, b);

        if (res.distance < hoverThreshold) {
          if (!closestEdge || res.distance < closestEdge.dist) {
            closestEdge = { point: res.point, index: i, dist: res.distance };
          }
        }
      }

      if (closestEdge) {
        setHoveredEdgePoint({ point: closestEdge.point, index: closestEdge.index });
      } else {
        setHoveredEdgePoint(null);
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedVertexIndex(null);
    setIsDraggingPolygon(false);
    setTimeout(() => {
      wasDragging.current = false;
    }, 50);
  };

  // Click on SVG edge to insert a vertex
  const handleSvgClick = (e: React.MouseEvent) => {
    if (wasDragging.current) {
      e.stopPropagation();
      return;
    }
    if (activeMode === 'crop' && hoveredEdgePoint) {
      e.stopPropagation();
      const insertIndex = hoveredEdgePoint.index + 1;
      const nextPoints = [...polygon];
      nextPoints.splice(insertIndex, 0, hoveredEdgePoint.point);
      setPolygon(nextPoints);
      setHoveredEdgePoint(null);
    }
  };

  // Delete a vertex on right-click or double-click
  const handleVertexDelete = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (polygon.length > 3) {
      const nextPoints = polygon.filter((_, i) => i !== index);
      setPolygon(nextPoints);
      setHoveredEdgePoint(null);
    }
  };

  // Convert polygon points to SVG path syntax
  const getSvgPolygonPoints = (): string => {
    return polygon.map(p => `${p.x},${p.y}`).join(' ');
  };

  // Create SVG path for the inverted mask overlay
  const getMaskPath = (): string => {
    return `M 0 0 h ${pageWidth} v ${pageHeight} h -${pageWidth} Z 
            M ${polygon[0].x} ${polygon[0].y} 
            ${polygon.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')} Z`;
  };



  return (
    <div 
      className="viewer-container" 
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{ overflow: 'hidden' }}
    >
      {/* Zoom / Pan Container Wrapper */}
      <div 
        className="viewer-canvas-wrapper"
        style={{
          width: `${pageWidth}px`,
          height: `${pageHeight}px`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* Rendered PDF Page */}
        <canvas 
          ref={canvasRef} 
          className="viewer-canvas"
          style={{ width: '100%', height: '100%' }}
        />

        {/* Interactive Overlay Graphics */}
        <svg 
          className="viewer-overlay"
          viewBox={`0 0 ${pageWidth} ${pageHeight}`}
          style={{ 
            width: '100%', 
            height: '100%', 
            position: 'absolute', 
            top: 0, 
            left: 0,
            pointerEvents: 'auto',
            cursor: activeMode === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair'
          }}
          onClick={handleSvgClick}
        >
          {/* 0. DEBUG HELPERS (Red walls and blue room rects) */}
          {showHelpers && (
            <g pointerEvents="none">
              {/* Extracted wall lines in semi-transparent red */}
              {pageVectors.map((l, idx) => {
                const isDark = !l.color || l.color === 'black' || l.color === '#000000' || l.color.startsWith('rgb(0,') || l.color.startsWith('rgba(0,');
                if (!isDark) return null;
                return (
                  <line
                    key={`vec-${idx}`}
                    x1={l.x0}
                    y1={l.y0}
                    x2={l.x1}
                    y2={l.y1}
                    stroke="rgba(239, 68, 68, 0.35)"
                    strokeWidth={1.5 / zoom}
                  />
                );
              })}
              
              {/* Snapped room rectangles in blue (subtle tint only, no outline to avoid clutter) */}
              {roomRects.map((r, idx) => (
                <rect
                  key={`rrect-${idx}`}
                  x={r.x0}
                  y={r.y0}
                  width={r.x1 - r.x0}
                  height={r.y1 - r.y0}
                  fill="rgba(59, 130, 246, 0.04)"
                />
              ))}
            </g>
          )}

          {/* 1. MASK OVERLAY (dims everything outside crop area) */}
          {activeMode === 'crop' && polygon.length >= 3 && (
            <path
              d={getMaskPath()}
              fill="rgba(9, 13, 22, 0.65)"
              fillRule="evenodd"
              onClick={handleSvgClick}
            />
          )}

          {/* 2. CROP POLYGON OUTLINE */}
          {activeMode === 'crop' && (
            <polygon
              points={getSvgPolygonPoints()}
              fill="rgba(31, 31, 216, 0.04)"
              stroke="#1f1fd8"
              strokeWidth={2 / zoom}
              strokeDasharray={4 / zoom}
              style={{ cursor: 'move', pointerEvents: 'auto' }}
              onPointerDown={handlePolygonDragStart}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId);
                setIsDraggingPolygon(false);
              }}
            />
          )}

          {/* 3. EDGE SUBDIVISION INDICATOR */}
          {activeMode === 'crop' && hoveredEdgePoint && (
            <g
              transform={`translate(${hoveredEdgePoint.point.x}, ${hoveredEdgePoint.point.y})`}
              style={{ cursor: 'pointer' }}
              onClick={handleSvgClick}
            >
              <circle
                r={6 / zoom}
                fill="#a855f7"
                stroke="white"
                strokeWidth={1.5 / zoom}
              />
              <path
                d={`M -3 0 h 6 M 0 -3 v 6`}
                stroke="white"
                strokeWidth={1 / zoom}
              />
            </g>
          )}

          {/* 4. DRAGGABLE POLYGON VERTICES */}
          {activeMode === 'crop' && polygon.map((pt, idx) => (
            <circle
              key={`vertex-${idx}`}
              cx={pt.x}
              cy={pt.y}
              r={7 / zoom}
              fill="#6366f1"
              stroke="#ffffff"
              strokeWidth={2 / zoom}
              style={{ cursor: 'move' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                setDraggedVertexIndex(idx);
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId);
                setDraggedVertexIndex(null);
              }}
              onDoubleClick={(e) => handleVertexDelete(idx, e)}
              onContextMenu={(e) => handleVertexDelete(idx, e)}
            />
          ))}
        </svg>
      </div>

      {/* Mode Indicators and Floating Controls */}
      <div className="info-badge">
        Page {pageNum} | Zoom: {Math.round(zoom * 100)}%
      </div>

      {/* Floating Toolbar */}
      <div className="floating-toolbar">
        <button 
          className={`toolbar-btn ${activeMode === 'pan' ? 'active' : ''}`}
          onClick={() => setActiveMode('pan')}
          title="Plan verschieben (Hand)"
        >
          <Hand size={16} />
        </button>
        <button 
          className={`toolbar-btn ${activeMode === 'crop' ? 'active' : ''}`}
          onClick={() => setActiveMode('crop')}
          title="Zuschnitt bearbeiten (Polygon)"
        >
          <Scissors size={16} />
        </button>
        
        <div className="toolbar-separator" />
        
        <button 
          className="toolbar-btn"
          onClick={() => setZoom(z => Math.min(z + 0.15, 6.0))}
          title="Heranzoomen"
        >
          <ZoomIn size={16} />
        </button>
        <button 
          className="toolbar-btn"
          onClick={() => setZoom(z => Math.max(z - 0.15, 0.2))}
          title="Herauszoomen"
        >
          <ZoomOut size={16} />
        </button>
        <button 
          className="toolbar-btn"
          onClick={() => {
            if (containerRef.current) {
              const cWidth = containerRef.current.clientWidth;
              const cHeight = containerRef.current.clientHeight;
              const fitZoom = Math.min((cWidth - 80) / pageWidth, (cHeight - 80) / pageHeight);
              setZoom(fitZoom);
              setPan({
                x: (cWidth - pageWidth * fitZoom) / 2,
                y: (cHeight - pageHeight * fitZoom) / 2
              });
            }
          }}
          title="Ganzes Blatt anzeigen"
        >
          <Maximize size={16} />
        </button>
      </div>
    </div>
  );
};
