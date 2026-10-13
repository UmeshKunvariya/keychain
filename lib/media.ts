export const DISPLAY_SIZE = 240;
export const MAX_FRAMES = 36;

export type Crop = { x: number; y: number; zoom: number };

export type PreparedMedia = {
  url: string;
  kind: "image" | "gif" | "video";
  name: string;
  duration: number;
  file: File;
};

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.72): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error("Could not encode a frame."));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/jpeg", quality);
  });
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  crop: Crop,
) {
  const baseScale = Math.max(DISPLAY_SIZE / sourceWidth, DISPLAY_SIZE / sourceHeight);
  const scale = baseScale * crop.zoom;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const maxX = Math.max(0, (width - DISPLAY_SIZE) / 2);
  const maxY = Math.max(0, (height - DISPLAY_SIZE) / 2);
  const x = (DISPLAY_SIZE - width) / 2 + crop.x * maxX;
  const y = (DISPLAY_SIZE - height) / 2 + crop.y * maxY;
  ctx.fillStyle = "#0b0d0c";
  ctx.fillRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
  ctx.drawImage(source, x, y, width, height);
}

async function seek(video: HTMLVideoElement, time: number) {
  await new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("Could not read this video frame.")); };
    const cleanup = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.currentTime = time;
  });
}

export async function buildKeychainFile(
  media: PreparedMedia,
  crop: Crop,
  trim: [number, number],
  onProgress: (value: number) => void,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = DISPLAY_SIZE;
  canvas.height = DISPLAY_SIZE;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");

  const frames: Uint8Array[] = [];
  let fps = 1;

  if (media.kind === "video") {
    const video = document.createElement("video");
    video.src = media.url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This video format is not supported by your browser."));
    });
    const span = Math.max(0.1, trim[1] - trim[0]);
    fps = Math.min(10, Math.max(2, Math.floor(MAX_FRAMES / span)));
    const count = Math.min(MAX_FRAMES, Math.max(1, Math.ceil(span * fps)));
    for (let i = 0; i < count; i += 1) {
      await seek(video, Math.min(trim[1], trim[0] + i / fps));
      drawCover(ctx, video, video.videoWidth, video.videoHeight, crop);
      frames.push(await canvasToJpeg(canvas));
      onProgress((i + 1) / count);
    }
  } else if (media.kind === "gif") {
    const { parseGIF, decompressFrames } = await import("gifuct-js");
    const parsed = parseGIF(await media.file.arrayBuffer());
    const decoded = decompressFrames(parsed, true);
    if (!decoded.length) throw new Error("No frames were found in this GIF.");
    const gifWidth = parsed.lsd.width;
    const gifHeight = parsed.lsd.height;
    const composition = document.createElement("canvas");
    composition.width = gifWidth;
    composition.height = gifHeight;
    const compositionCtx = composition.getContext("2d");
    if (!compositionCtx) throw new Error("Could not decode this GIF.");
    let elapsed = 0;
    const eligible: number[] = [];
    for (let index = 0; index < decoded.length; index += 1) {
      if (elapsed >= trim[0] * 1000 && elapsed <= trim[1] * 1000) eligible.push(index);
      elapsed += Math.max(20, decoded[index].delay || 100);
    }
    if (!eligible.length) eligible.push(0);
    const stride = Math.max(1, Math.ceil(eligible.length / MAX_FRAMES));
    const chosen = eligible.filter((_, index) => index % stride === 0).slice(0, MAX_FRAMES);
    const chosenSet = new Set(chosen);
    let totalDelay = 0;
    let previousDisposal = 0;
    let previousDims: { left: number; top: number; width: number; height: number } | null = null;
    let restore: ImageData | null = null;
    for (let i = 0; i < decoded.length; i += 1) {
      const frame = decoded[i];
      if (previousDisposal === 2 && previousDims) compositionCtx.clearRect(previousDims.left, previousDims.top, previousDims.width, previousDims.height);
      if (previousDisposal === 3 && restore) compositionCtx.putImageData(restore, 0, 0);
      restore = frame.disposalType === 3 ? compositionCtx.getImageData(0, 0, gifWidth, gifHeight) : null;
      const pixels = new Uint8ClampedArray(frame.patch.length);
      pixels.set(frame.patch);
      const patch = new ImageData(pixels, frame.dims.width, frame.dims.height);
      compositionCtx.putImageData(patch, frame.dims.left, frame.dims.top);
      if (chosenSet.has(i) && frames.length < MAX_FRAMES) {
        drawCover(ctx, composition, gifWidth, gifHeight, crop);
        frames.push(await canvasToJpeg(canvas));
        totalDelay += Math.max(20, frame.delay || 100) * stride;
        onProgress(frames.length / chosen.length);
      }
      previousDisposal = frame.disposalType;
      previousDims = frame.dims;
    }
    fps = Math.max(1, Math.min(20, Math.round(1000 / Math.max(50, totalDelay / frames.length))));
  } else {
    const image = new Image();
    image.src = media.url;
    await image.decode();
    drawCover(ctx, image, image.naturalWidth, image.naturalHeight, crop);
    frames.push(await canvasToJpeg(canvas, 0.82));
    onProgress(1);
  }

  const headerSize = 16;
  const total = headerSize + frames.reduce((sum, frame) => sum + 4 + frame.byteLength, 0);
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes.set([0x4b, 0x43, 0x41, 0x31], 0); // KCA1
  view.setUint16(4, DISPLAY_SIZE, true);
  view.setUint16(6, DISPLAY_SIZE, true);
  view.setUint16(8, frames.length, true);
  view.setUint16(10, Math.round(1000 / fps), true);
  view.setUint32(12, 0, true);
  let offset = headerSize;
  for (const frame of frames) {
    view.setUint32(offset, frame.byteLength, true);
    offset += 4;
    bytes.set(frame, offset);
    offset += frame.byteLength;
  }
  return new Blob([buffer], { type: "application/octet-stream" });
}
