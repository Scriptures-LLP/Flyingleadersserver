import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  file: File;
  /** Target aspect ratio (width / height) the app expects for this image. */
  aspect: number;
  /** Exported image width in pixels (height is derived from aspect). */
  outputWidth: number;
  label?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

// Fit the crop frame inside the viewport so tall (portrait) aspect ratios don't
// push the dialog's text/controls off-screen. The frame IS the crop.
function computeFrame(aspect: number) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const maxW = Math.min(360, vw - 80);
  const maxH = Math.min(460, Math.round(vh * 0.55));
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { frameW: Math.round(w), frameH: Math.round(h) };
}

/**
 * Lightweight, dependency-free image adjuster. The visible frame is exactly what
 * gets exported — the admin drags to reposition and uses the slider (or wheel)
 * to zoom, cropping/resizing the picked image to the app's required aspect ratio
 * and dimensions before it's uploaded.
 */
export function ImageCropModal({ file, aspect, outputWidth, label, onCancel, onConfirm }: Props) {
  const { frameW: FRAME_W, frameH } = computeFrame(aspect);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [minScale, setMinScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [tl, setTl] = useState({ x: 0, y: 0 });

  // Load the picked file and fit it to "cover" the frame.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const ms = Math.max(FRAME_W / image.width, frameH / image.height);
      setImg(image);
      setMinScale(ms);
      setScale(ms);
      setTl({ x: (FRAME_W - image.width * ms) / 2, y: (frameH - image.height * ms) / 2 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, frameH, FRAME_W]);

  // Keep the image covering the frame — no empty gaps at the edges.
  const clamp = useCallback(
    (pos: { x: number; y: number }, s: number) => {
      if (!img) return pos;
      return {
        x: Math.min(0, Math.max(FRAME_W - img.width * s, pos.x)),
        y: Math.min(0, Math.max(frameH - img.height * s, pos.y)),
      };
    },
    [img, frameH, FRAME_W],
  );

  // Redraw the preview whenever the view changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, FRAME_W, frameH);
    ctx.drawImage(img, tl.x, tl.y, img.width * scale, img.height * scale);
  }, [img, scale, tl, frameH, FRAME_W]);

  function zoomTo(rawScale: number) {
    if (!img) return;
    const next = Math.max(minScale, rawScale);
    // Anchor the zoom on the frame centre so it doesn't drift.
    const cx = (FRAME_W / 2 - tl.x) / scale;
    const cy = (frameH / 2 - tl.y) / scale;
    setScale(next);
    setTl(clamp({ x: FRAME_W / 2 - cx * next, y: frameH / 2 - cy * next }, next));
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setTl((prev) => clamp({ x: prev.x + dx, y: prev.y + dy }, scale));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function apply() {
    if (!img) return;
    // The frame maps to this source rectangle of the original image (in the
    // image's own pixels).
    const sWidth = FRAME_W / scale;
    const sHeight = frameH / scale;
    const sx = -tl.x / scale;
    const sy = -tl.y / scale;

    // Export at the cropped region's native resolution rather than a fixed
    // width, so a high-res upload isn't needlessly downscaled (which looked like
    // a resolution drop after cropping/zooming). Clamped to [outputWidth, MAX_W]
    // so small/zoomed crops still fill the app's display size and files stay sane.
    const MAX_W = 2600;
    const targetW = Math.round(Math.min(MAX_W, Math.max(outputWidth, sWidth)));
    const targetH = Math.round(targetW / aspect);

    const out = document.createElement("canvas");
    out.width = targetW;
    out.height = targetH;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
    out.toBlob(
      (blob) => {
        if (!blob) return;
        const name = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
        onConfirm(new File([blob], name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
        <h3 className="mb-1 text-base font-semibold text-slate-900">Adjust image</h3>
        <p className="mb-3 text-xs text-slate-500">
          Drag to reposition, use the slider to zoom. {label ? `${label} · ` : ""}
          {outputWidth}×{Math.round(outputWidth / aspect)} px.
        </p>

        <div
          className="mx-auto overflow-hidden rounded-lg border border-slate-300 bg-slate-100"
          style={{ width: FRAME_W, height: frameH }}
        >
          <canvas
            ref={canvasRef}
            width={FRAME_W}
            height={frameH}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={(e) => zoomTo(scale * (e.deltaY < 0 ? 1.08 : 0.92))}
            className="cursor-move touch-none"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-slate-500">Zoom</span>
          <input
            type="range"
            min={minScale}
            max={minScale * 4}
            step={minScale / 100}
            value={scale}
            onChange={(e) => zoomTo(Number(e.target.value))}
            className="flex-1 accent-red-600"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!img}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
