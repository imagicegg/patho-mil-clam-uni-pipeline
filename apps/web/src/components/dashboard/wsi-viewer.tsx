'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { getSlideDziUrl, getSlideHeatmapDziUrl } from '@/lib/api';
import { SlideRecord } from '@/types/slide';

type OpenSeadragonModule = typeof import('openseadragon');
type OpenSeadragonViewer = import('openseadragon').Viewer;
type OpenSeadragonTiledImage = import('openseadragon').TiledImage;

const MPP_REF_40X = 0.25;

function imageZoomToMagnification(imageZoom: number, slide: SlideRecord | null): number {
  if (slide?.objective_power != null && slide.objective_power > 0) {
    return slide.objective_power * imageZoom;
  }

  if (slide?.mpp_x != null && slide.mpp_x > 0) {
    return (MPP_REF_40X / slide.mpp_x) * 40 * imageZoom;
  }

  return imageZoom;
}

export type WsiViewerHandle = {
  fitToWindow: () => void;
  goHome: () => void;
  focusOnRegion: (region: { x: number; y: number; width: number; height: number }) => void;
  clearRuler: () => void;
};

type WsiViewerProps = {
  slide: SlideRecord | null;
  heatmapOn: boolean;
  heatmapOpacity: number;
  onZoomChange: (zoom: number) => void;
  onCoordinateChange: (text: string) => void;
  rulerMode?: boolean;
};

type RulerState = {
  phase: 'idle' | 'measuring' | 'done';
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
  cursor: { x: number; y: number } | null;
};

export const WsiViewer = forwardRef<WsiViewerHandle, WsiViewerProps>(function WsiViewer(
  { slide, heatmapOn, heatmapOpacity, onZoomChange, onCoordinateChange, rulerMode = false },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rulerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<OpenSeadragonViewer | null>(null);
  const moduleRef = useRef<OpenSeadragonModule | null>(null);
  const heatmapLayerRef = useRef<OpenSeadragonTiledImage | null>(null);
  const zoomChangeRef = useRef(onZoomChange);
  const coordinateChangeRef = useRef(onCoordinateChange);
  const slideRef = useRef(slide);
  const heatmapOnRef = useRef(heatmapOn);
  const heatmapOpacityRef = useRef(heatmapOpacity);
  const pendingZoomRef = useRef<number | null>(null);
  const zoomTimerRef = useRef<number | null>(null);
  const pendingCoordinateRef = useRef<string | null>(null);
  const coordinateTimerRef = useRef<number | null>(null);
  const rulerModeRef = useRef(rulerMode);
  const rulerStateRef = useRef<RulerState>({ phase: 'idle', start: null, end: null, cursor: null });

  useEffect(() => {
    zoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  useEffect(() => {
    coordinateChangeRef.current = onCoordinateChange;
  }, [onCoordinateChange]);

  useEffect(() => {
    slideRef.current = slide;
  }, [slide]);

  useEffect(() => {
    heatmapOnRef.current = heatmapOn;
  }, [heatmapOn]);

  useEffect(() => {
    heatmapOpacityRef.current = heatmapOpacity;
  }, [heatmapOpacity]);

  useEffect(() => {
    rulerModeRef.current = rulerMode;
    if (!rulerMode) {
      rulerStateRef.current = { phase: 'idle', start: null, end: null, cursor: null };
      clearRulerCanvas();
    }
  }, [rulerMode]);

  function clearRulerCanvas() {
    const canvas = rulerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function resizeRulerCanvas() {
    const canvas = rulerCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = container.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  function drawRuler() {
    const canvas = rulerCanvasRef.current;
    const viewer = viewerRef.current;
    const osdModule = moduleRef.current;
    if (!canvas || !viewer || !osdModule) return;

    const tiledImage = viewer.world.getItemAt(0);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const state = rulerStateRef.current;
    if (!state.start) return;

    const toScreenPx = (imgX: number, imgY: number): { x: number; y: number } | null => {
      if (!tiledImage) return null;
      const vp = tiledImage.imageToViewportCoordinates(new osdModule.Point(imgX, imgY));
      const px = viewer.viewport.pixelFromPoint(vp);
      return { x: px.x * dpr, y: px.y * dpr };
    };

    const sp = toScreenPx(state.start.x, state.start.y);
    if (!sp) return;

    const endImg = state.phase === 'done' ? state.end : state.cursor;
    const ep = endImg ? toScreenPx(endImg.x, endImg.y) : null;

    // endpoint dot at start
    ctx.save();
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = dpr;
    ctx.stroke();
    ctx.restore();

    if (!ep) return;

    // line
    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([6 * dpr, 3 * dpr]);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(ep.x, ep.y);
    ctx.stroke();
    ctx.restore();

    // endpoint dot at end
    ctx.save();
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, 5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = dpr;
    ctx.stroke();
    ctx.restore();

    // distance label
    if (!endImg) return;
    const dx = endImg.x - state.start.x;
    const dy = endImg.y - state.start.y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const slide = slideRef.current;
    let label: string;
    if (slide?.mpp_x && slide.mpp_x > 0) {
      const um = pixelDist * slide.mpp_x;
      label = um >= 1000 ? `${(um / 1000).toFixed(3)} mm` : `${um.toFixed(1)} μm`;
    } else {
      label = `${pixelDist.toFixed(0)} px`;
    }

    const mx = (sp.x + ep.x) / 2;
    const my = (sp.y + ep.y) / 2;
    const fontSize = 12 * dpr;

    ctx.save();
    ctx.font = `bold ${fontSize}px monospace`;
    const metrics = ctx.measureText(label);
    const pad = 4 * dpr;
    const bw = metrics.width + pad * 2;
    const bh = fontSize + pad * 2;

    // keep label away from canvas edges
    const lx = Math.max(pad, Math.min(canvas.width - bw - pad, mx - bw / 2));
    const ly = Math.max(pad, Math.min(canvas.height - bh - pad, my - bh / 2 - 16 * dpr));

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath();
    ctx.roundRect(lx, ly, bw, bh, 3 * dpr);
    ctx.fill();

    ctx.fillStyle = '#facc15';
    ctx.fillText(label, lx + pad, ly + pad + fontSize * 0.85);
    ctx.restore();
  }

  function flushZoomChange(immediate = false) {
    if (pendingZoomRef.current == null) {
      return;
    }

    if (zoomTimerRef.current != null) {
      window.clearTimeout(zoomTimerRef.current);
      zoomTimerRef.current = null;
    }

    if (immediate) {
      const zoom = pendingZoomRef.current;
      pendingZoomRef.current = null;
      zoomChangeRef.current(zoom);
      return;
    }

    zoomTimerRef.current = window.setTimeout(() => {
      zoomTimerRef.current = null;
      const zoom = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (zoom != null) {
        zoomChangeRef.current(zoom);
      }
    }, 80);
  }

  function scheduleZoomChange(zoom: number, immediate = false) {
    pendingZoomRef.current = zoom;
    flushZoomChange(immediate);
  }

  function flushCoordinateChange(immediate = false) {
    if (pendingCoordinateRef.current == null) {
      return;
    }

    if (coordinateTimerRef.current != null) {
      window.clearTimeout(coordinateTimerRef.current);
      coordinateTimerRef.current = null;
    }

    if (immediate) {
      const coordinateText = pendingCoordinateRef.current;
      pendingCoordinateRef.current = null;
      coordinateChangeRef.current(coordinateText);
      return;
    }

    coordinateTimerRef.current = window.setTimeout(() => {
      coordinateTimerRef.current = null;
      const coordinateText = pendingCoordinateRef.current;
      pendingCoordinateRef.current = null;
      if (coordinateText != null) {
        coordinateChangeRef.current(coordinateText);
      }
    }, 50);
  }

  function scheduleCoordinateChange(coordinateText: string, immediate = false) {
    pendingCoordinateRef.current = coordinateText;
    flushCoordinateChange(immediate);
  }

  function emitCurrentZoom(immediate = false) {
    const viewer = viewerRef.current;
    const tiledImage = viewer?.world.getItemAt(0);
    if (!viewer || !tiledImage) {
      scheduleZoomChange(1, true);
      return;
    }

    const imageZoom = tiledImage.viewportToImageZoom(viewer.viewport.getZoom(true));
    const magnification = imageZoomToMagnification(
      Number.isFinite(imageZoom) && imageZoom > 0 ? imageZoom : 1,
      slideRef.current,
    );
    scheduleZoomChange(magnification, immediate);
  }

  function removeHeatmapLayer() {
    const viewer = viewerRef.current;
    const heatmapLayer = heatmapLayerRef.current;
    if (!viewer || !heatmapLayer) {
      heatmapLayerRef.current = null;
      return;
    }

    try {
      viewer.world.removeItem(heatmapLayer);
    } catch {
      // The layer may already be detached when the world resets.
    }

    heatmapLayerRef.current = null;
  }

  function syncHeatmapLayer() {
    const viewer = viewerRef.current;
    const currentSlide = slideRef.current;
    const heatmapEnabled = heatmapOnRef.current;
    const opacity = heatmapOpacityRef.current / 100;

    if (!viewer || !currentSlide || viewer.world.getItemCount() === 0) {
      removeHeatmapLayer();
      return;
    }

    if (!heatmapEnabled || !currentSlide.diagnosis) {
      removeHeatmapLayer();
      return;
    }

    const existingLayer = heatmapLayerRef.current;
    if (existingLayer) {
      existingLayer.setOpacity(opacity);
      return;
    }

    const baseLayer = viewer.world.getItemAt(0);
    const baseBounds = baseLayer.getBoundsNoRotate();
    const slideId = currentSlide.id;

    viewer.addTiledImage({
      tileSource: getSlideHeatmapDziUrl(slideId),
      fitBounds: baseBounds,
      opacity,
      preload: false,
      crossOriginPolicy: 'Anonymous',
      success: (event) => {
        const { item } = event as Event & { item: OpenSeadragonTiledImage };

        if (slideRef.current?.id !== slideId || !heatmapOnRef.current) {
          try {
            viewer.world.removeItem(item);
          } catch {
            // The layer can be removed by close/open before the async add completes.
          }
          return;
        }

        heatmapLayerRef.current = item;
        item.setOpacity(heatmapOpacityRef.current / 100);
        viewer.world.setItemIndex(item, 1);
      },
      error: () => {
        if (heatmapLayerRef.current === null) {
          return;
        }

        heatmapLayerRef.current = null;
      },
    });
  }

  useImperativeHandle(ref, () => ({
    fitToWindow() {
      viewerRef.current?.viewport.goHome(true);
    },
    goHome() {
      viewerRef.current?.viewport.goHome(true);
    },
    focusOnRegion(region) {
      const viewer = viewerRef.current;
      const baseLayer = viewer?.world.getItemAt(0);
      if (!viewer || !baseLayer) {
        return;
      }

      const padding = Math.max(region.width, region.height) * 0.2;
      const viewportRect = baseLayer.imageToViewportRectangle(
        Math.max(0, region.x - padding / 2),
        Math.max(0, region.y - padding / 2),
        region.width + padding,
        region.height + padding,
      );
      viewer.viewport.fitBoundsWithConstraints(viewportRect, true);
      emitCurrentZoom(true);
    },
    clearRuler() {
      rulerStateRef.current = { phase: 'idle', start: null, end: null, cursor: null };
      clearRulerCanvas();
    },
  }));

  useEffect(() => {
    let disposed = false;
    let pointerHandler: ((event: PointerEvent) => void) | null = null;
    let rulerClickHandler: ((event: MouseEvent) => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;

    async function bootstrap() {
      const importedModule = await import('openseadragon');
      const OpenSeadragon = (
        'default' in importedModule ? importedModule.default : importedModule
      ) as unknown as OpenSeadragonModule;

      if (disposed || !containerRef.current || viewerRef.current) {
        return;
      }

      moduleRef.current = OpenSeadragon;

      const viewer = OpenSeadragon({
        element: containerRef.current,
        showNavigationControl: false,
        showNavigator: true,
        navigatorAutoFade: false,
        visibilityRatio: 1,
        constrainDuringPan: true,
        minZoomImageRatio: 1,
        maxZoomPixelRatio: 2,
        animationTime: 0.7,
        blendTime: 0,
        alwaysBlend: false,
        immediateRender: true,
        subPixelRoundingForTransparency: {
          '*': OpenSeadragon.SUBPIXEL_ROUNDING_OCCURRENCES.NEVER,
        },
        crossOriginPolicy: 'Anonymous',
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
        gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: false },
      });

      viewerRef.current = viewer;

      const emitZoom = () => {
        const tiledImage = viewer.world.getItemAt(0);
        if (!tiledImage) {
          scheduleZoomChange(1, true);
          return;
        }

        const imageZoom = tiledImage.viewportToImageZoom(viewer.viewport.getZoom(true));
        const magnification = imageZoomToMagnification(
          Number.isFinite(imageZoom) && imageZoom > 0 ? imageZoom : 1,
          slideRef.current,
        );
        scheduleZoomChange(magnification);
      };

      viewer.addHandler('open', () => {
        removeHeatmapLayer();
        syncHeatmapLayer();
        emitZoom();
      });

      viewer.addHandler('animation', emitZoom);
      viewer.addHandler('zoom', emitZoom);
      viewer.addHandler('update-viewport', () => drawRuler());

      if (slideRef.current) {
        viewer.open(getSlideDziUrl(slideRef.current.id) as unknown as Parameters<OpenSeadragonViewer['open']>[0]);
      }

      pointerHandler = (event: PointerEvent) => {
        const currentContainer = containerRef.current;
        const osdModule = moduleRef.current;
        const tiledImage = viewer.world.getItemAt(0);
        if (!currentContainer || !osdModule || !tiledImage) {
          return;
        }

        const rect = currentContainer.getBoundingClientRect();
        const viewportPoint = viewer.viewport.pointFromPixel(
          new osdModule.Point(event.clientX - rect.left, event.clientY - rect.top),
        );
        const imagePoint = tiledImage.viewportToImageCoordinates(viewportPoint);
        const slide = slideRef.current;
        if (slide) {
          const pctX = Math.min(100, Math.max(0, (imagePoint.x / slide.width) * 100));
          const pctY = Math.min(100, Math.max(0, (imagePoint.y / slide.height) * 100));
          scheduleCoordinateChange(`X: ${pctX.toFixed(1)}% | Y: ${pctY.toFixed(1)}%`);
        } else {
          scheduleCoordinateChange(`X: ${Math.max(0, Math.round(imagePoint.x))} | Y: ${Math.max(0, Math.round(imagePoint.y))}`);
        }

        if (rulerModeRef.current) {
          const rs = rulerStateRef.current;
          if (rs.phase === 'measuring') {
            rulerStateRef.current = { ...rs, cursor: { x: imagePoint.x, y: imagePoint.y } };
            drawRuler();
          }
        }
      };

      rulerClickHandler = (event: MouseEvent) => {
        if (!rulerModeRef.current) return;
        const osdModule = moduleRef.current;
        const tiledImage = viewer.world.getItemAt(0);
        const currentContainer = containerRef.current;
        if (!osdModule || !tiledImage || !currentContainer) return;

        const rect = currentContainer.getBoundingClientRect();
        const vp = viewer.viewport.pointFromPixel(
          new osdModule.Point(event.clientX - rect.left, event.clientY - rect.top),
        );
        const ip = tiledImage.viewportToImageCoordinates(vp);
        const pt = { x: ip.x, y: ip.y };
        const rs = rulerStateRef.current;

        if (rs.phase === 'idle' || rs.phase === 'done') {
          rulerStateRef.current = { phase: 'measuring', start: pt, end: null, cursor: pt };
        } else {
          rulerStateRef.current = { phase: 'done', start: rs.start, end: pt, cursor: null };
        }
        drawRuler();
      };

      containerRef.current.addEventListener('pointermove', pointerHandler);
      containerRef.current.addEventListener('click', rulerClickHandler);

      resizeRulerCanvas();
      resizeObserver = new ResizeObserver(() => {
        resizeRulerCanvas();
        drawRuler();
      });
      resizeObserver.observe(containerRef.current);
    }

    void bootstrap();

    return () => {
      disposed = true;

      if (containerRef.current && pointerHandler) {
        containerRef.current.removeEventListener('pointermove', pointerHandler);
      }

      if (containerRef.current && rulerClickHandler) {
        containerRef.current.removeEventListener('click', rulerClickHandler);
      }

      resizeObserver?.disconnect();

      flushZoomChange(true);
      flushCoordinateChange(true);

      if (zoomTimerRef.current != null) {
        window.clearTimeout(zoomTimerRef.current);
        zoomTimerRef.current = null;
      }

      if (coordinateTimerRef.current != null) {
        window.clearTimeout(coordinateTimerRef.current);
        coordinateTimerRef.current = null;
      }

      removeHeatmapLayer();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      heatmapLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    if (!slide) {
      removeHeatmapLayer();
      viewer.close();
      scheduleZoomChange(1, true);
      scheduleCoordinateChange('X: 0 | Y: 0', true);
      return;
    }

    viewer.open(getSlideDziUrl(slide.id) as unknown as Parameters<OpenSeadragonViewer['open']>[0]);
  }, [slide?.id]);

  useEffect(() => {
    syncHeatmapLayer();
  }, [slide?.id, slide?.diagnosis, slide?.height, slide?.width, heatmapOn, heatmapOpacity]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      <canvas
        ref={rulerCanvasRef}
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: 10 }}
      />
    </div>
  );
});
