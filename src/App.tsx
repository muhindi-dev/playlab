"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type RGB = [number, number, number];
type Lab = [number, number, number];
type Game = { size: number; cells: number[]; colours: string[]; totals: number[] };
type Level = { name: string; sub: string; size: number; colours: number; icon: string };
type SavedGame = {
  id: string;
  title: string;
  updatedAt: number;
  game: Game;
  filled: boolean[];
  selected: number;
  brushSize: number;
  thumbnail: string;
};
type CompletedPicture = {
  id: string;
  title: string;
  completedAt: number;
  image: string;
};

const SAVES_KEY = "shay-zay-pixel-saves-v1";
const MAX_SAVES = 5;
const COMPLETED_DB = "shay-zay-pixel-library";
const COMPLETED_STORE = "completed-pictures";
const MAX_COMPLETED = 10;
const APP_VERSION = "v11 TEST";

function loadSavedGames(): SavedGame[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVES_KEY) ?? "[]") as SavedGame[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((save) => save?.id && save.game?.cells?.length === save.filled?.length).slice(0, MAX_SAVES);
  } catch { return []; }
}

function openCompletedLibrary() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(COMPLETED_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(COMPLETED_STORE)) {
        request.result.createObjectStore(COMPLETED_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadCompletedPictures() {
  const database = await openCompletedLibrary();
  return new Promise<CompletedPicture[]>((resolve, reject) => {
    const transaction = database.transaction(COMPLETED_STORE, "readonly");
    const request = transaction.objectStore(COMPLETED_STORE).getAll();
    request.onsuccess = () => resolve((request.result as CompletedPicture[])
      .filter((picture) => picture?.id && picture.image?.startsWith("data:image/"))
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, MAX_COMPLETED));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function storeCompletedPicture(picture: CompletedPicture) {
  const database = await openCompletedLibrary();
  return new Promise<CompletedPicture[]>((resolve, reject) => {
    let kept: CompletedPicture[] = [];
    const transaction = database.transaction(COMPLETED_STORE, "readwrite");
    const store = transaction.objectStore(COMPLETED_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      kept = [picture, ...(request.result as CompletedPicture[]).filter((item) => item.id !== picture.id)]
        .sort((a, b) => b.completedAt - a.completedAt);
      store.put(picture);
      kept.slice(MAX_COMPLETED).forEach((item) => store.delete(item.id));
      kept = kept.slice(0, MAX_COMPLETED);
    };
    transaction.oncomplete = () => { database.close(); resolve(kept); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

async function removeCompletedPicture(id: string) {
  const database = await openCompletedLibrary();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(COMPLETED_STORE, "readwrite");
    transaction.objectStore(COMPLETED_STORE).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
  return loadCompletedPictures();
}

function makeThumbnail(game: Game) {
  const canvas = document.createElement("canvas");
  const pixel = Math.max(1, Math.floor(180 / game.size));
  canvas.width = canvas.height = pixel * game.size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  game.cells.forEach((colour, index) => {
    ctx.fillStyle = game.colours[colour];
    ctx.fillRect(index % game.size * pixel, Math.floor(index / game.size) * pixel, pixel, pixel);
  });
  return canvas.toDataURL("image/png");
}

const LEVELS: Level[] = [
  { name: "Big pixels", sub: "Quick & easy · 10 colours", size: 18, colours: 10, icon: "●" },
  { name: "Photo pixels", sub: "Great balance · 16 colours", size: 30, colours: 16, icon: "◆" },
  { name: "Tiny pixels", sub: "Extra detail · 22 colours", size: 42, colours: 22, icon: "✦" },
  { name: "Ultra pixels", sub: "Finest detail · 32 colours", size: 56, colours: 32, icon: "✺" },
];

const ROCKET = [
  ".....11.....", "....1221....", "....2332....", "...233332...",
  "...234432...", "...234432...", "...233332...", "....2332....",
  "...22..22...", "..3......3..", "............", "............",
];
const ROCKET_COLOURS = ["#ffd83d", "#ff9f1c", "#ff5f58", "#48c8ff"];

function distance(a: Lab, b: Lab) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function hex(rgb: RGB) {
  return `#${rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
}

function blendHex(first: string, second: string, secondRatio: number) {
  const parse = (colour: string) => [1, 3, 5].map((start) => Number.parseInt(colour.slice(start, start + 2), 16));
  const a = parse(first); const b = parse(second);
  return `rgb(${a.map((value, index) => Math.round(value * (1 - secondRatio) + b[index] * secondRatio)).join(",")})`;
}

function rgbToLab([r, g, b]: RGB): Lab {
  const linear = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  const x = (linear[0] * .4124564 + linear[1] * .3575761 + linear[2] * .1804375) / .95047;
  const y = linear[0] * .2126729 + linear[1] * .7151522 + linear[2] * .072175;
  const z = (linear[0] * .0193339 + linear[1] * .119192 + linear[2] * .9503041) / 1.08883;
  const curve = (value: number) => value > .008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = curve(x); const fy = curve(y); const fz = curve(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function reduceColours(raw: RGB[], wanted: number) {
  const labs = raw.map(rgbToLab);
  const bins = new Map<string, { rgb: RGB; count: number }>();
  raw.forEach(([r, g, b]) => {
    const key = `${r >> 3}-${g >> 3}-${b >> 3}`;
    const item = bins.get(key);
    if (item) {
      item.rgb[0] += r; item.rgb[1] += g; item.rgb[2] += b; item.count += 1;
    } else bins.set(key, { rgb: [r, g, b], count: 1 });
  });
  const samples = [...bins.values()].map((x) => ({
    rgb: x.rgb.map((n) => n / x.count) as RGB, count: x.count,
  })).sort((a, b) => b.count - a.count);
  const sampleLabs = samples.map((sample) => rgbToLab(sample.rgb));

  const palette: RGB[] = [[...(samples[0]?.rgb ?? [255, 255, 255])] as RGB];
  const paletteLabs: Lab[] = [rgbToLab(palette[0])];
  while (palette.length < Math.min(wanted, samples.length)) {
    let pickIndex = 0; let best = -1;
    samples.forEach((sample, sampleIndex) => {
      const score = Math.min(...paletteLabs.map((p) => distance(sampleLabs[sampleIndex], p))) * Math.sqrt(sample.count);
      if (score > best) { best = score; pickIndex = sampleIndex; }
    });
    palette.push([...samples[pickIndex].rgb] as RGB);
    paletteLabs.push(rgbToLab(samples[pickIndex].rgb));
  }
  for (let pass = 0; pass < 10; pass += 1) {
    const sums = palette.map(() => [0, 0, 0, 0]);
    raw.forEach((pixel, pixelIndex) => {
      let nearest = 0;
      paletteLabs.forEach((p, i) => { if (distance(labs[pixelIndex], p) < distance(labs[pixelIndex], paletteLabs[nearest])) nearest = i; });
      sums[nearest][0] += pixel[0]; sums[nearest][1] += pixel[1]; sums[nearest][2] += pixel[2]; sums[nearest][3] += 1;
    });
    sums.forEach((sum, i) => {
      if (!sum[3]) return;
      palette[i] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
      paletteLabs[i] = rgbToLab(palette[i]);
    });
  }
  const order = palette.map((_, i) => ({ i, light: paletteLabs[i][0] })).sort((a, b) => b.light - a.light);
  const remap = new Map(order.map((x, i) => [x.i, i]));
  const cells = raw.map((_, pixelIndex) => {
    let nearest = 0;
    paletteLabs.forEach((p, i) => { if (distance(labs[pixelIndex], p) < distance(labs[pixelIndex], paletteLabs[nearest])) nearest = i; });
    return remap.get(nearest) ?? 0;
  });
  return { cells, colours: order.map((x) => hex(palette[x.i])) };
}

async function photoToGame(file: File, level: Level): Promise<Game> {
  let source: CanvasImageSource;
  let sourceWidth: number;
  let sourceHeight: number;
  let release = () => {};
  try {
    if (typeof createImageBitmap !== "function") throw new Error("ImageBitmap unavailable");
    const bitmap = await createImageBitmap(file);
    source = bitmap; sourceWidth = bitmap.width; sourceHeight = bitmap.height;
    release = () => bitmap.close();
  } catch {
    const url = URL.createObjectURL(file);
    const image = new Image();
    source = image;
    release = () => URL.revokeObjectURL(url);
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This photo format could not be opened"));
      image.src = url;
    });
    sourceWidth = image.naturalWidth; sourceHeight = image.naturalHeight;
  }
  const canvas = document.createElement("canvas");
  const samplingScale = 4;
  canvas.width = canvas.height = level.size * samplingScale;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  const crop = Math.min(sourceWidth, sourceHeight);
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (sourceWidth - crop) / 2, (sourceHeight - crop) / 2, crop, crop, 0, 0, canvas.width, canvas.height);
  release();
  const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const raw: RGB[] = [];
  for (let gridY = 0; gridY < level.size; gridY += 1) {
    for (let gridX = 0; gridX < level.size; gridX += 1) {
      let r = 0; let g = 0; let b = 0;
      for (let y = 0; y < samplingScale; y += 1) {
        for (let x = 0; x < samplingScale; x += 1) {
          const pixel = ((gridY * samplingScale + y) * canvas.width + gridX * samplingScale + x) * 4;
          r += bytes[pixel]; g += bytes[pixel + 1]; b += bytes[pixel + 2];
        }
      }
      const count = samplingScale ** 2;
      raw.push([r / count, g / count, b / count]);
    }
  }
  const result = reduceColours(raw, level.colours);
  return { ...result, size: level.size, totals: result.colours.map((_, i) => result.cells.filter((x) => x === i).length) };
}

function Logo() {
  return <span className="logo" aria-hidden="true"><img src="./comet-icon-192.png" alt="" /></span>;
}

export default function Home() {
  const camera = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastCell = useRef(-1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const zoomRef = useRef(1);
  const pinch = useRef<{ distance: number; zoom: number; x: number; y: number } | null>(null);
  const paintRect = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const filledRef = useRef<boolean[]>([]);
  const filledCountRef = useRef(0);
  const remainingCountRef = useRef<number[]>([]);
  const filledSyncTimer = useRef<number | null>(null);
  const saveNoticeTimer = useRef<number | null>(null);
  const completedSaveId = useRef<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [paintStats, setPaintStats] = useState<{ done: number; remaining: number[] }>({ done: 0, remaining: [] });
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitSize, setFitSize] = useState(480);
  const [brushSize, setBrushSize] = useState(1);
  const [savedGames, setSavedGames] = useState<SavedGame[]>(loadSavedGames);
  const [completedPictures, setCompletedPictures] = useState<CompletedPicture[]>([]);
  const [currentSaveId, setCurrentSaveId] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState("");

  function canvasBoard() {
    if (!game || !grid.current) return null;
    const logicalSize = fitSize;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const backingSize = Math.max(1, Math.round(logicalSize * pixelRatio));
    if (grid.current.width !== backingSize || grid.current.height !== backingSize) {
      grid.current.width = backingSize;
      grid.current.height = backingSize;
    }
    const context = grid.current.getContext("2d", { alpha: false });
    if (!context) return null;
    const scale = backingSize / logicalSize;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.imageSmoothingEnabled = false;
    return { context, logicalSize, unit: logicalSize / game.size, lineWidth: 1 / scale };
  }

  function paintCanvasCell(index: number, wrong = false, redrawGrid = true, prepared?: NonNullable<ReturnType<typeof canvasBoard>>) {
    if (!game) return;
    const board = prepared ?? canvasBoard();
    if (!board) return;
    const { context, unit, lineWidth } = board;
    const row = Math.floor(index / game.size); const column = index % game.size;
    const x = column * unit; const y = row * unit;
    const colourIndex = game.cells[index]; const colour = game.colours[colourIndex];
    const isFilled = filledRef.current[index]; const isTarget = !isFilled && colourIndex === selected;
    context.fillStyle = wrong ? "#ffc6c6" : isFilled ? colour : isTarget ? blendHex(colour, "#ffffff", .52) : "#ffffff";
    context.fillRect(x, y, unit + lineWidth, unit + lineWidth);
    if (!isFilled) {
      context.fillStyle = isTarget ? "#050d2e" : "#626b84";
      context.font = `${isTarget ? 900 : 800} ${Math.max(5, Math.min(21, unit * .54))}px ui-rounded, system-ui, sans-serif`;
      context.textAlign = "center"; context.textBaseline = "middle";
      context.fillText(String(colourIndex + 1), x + unit / 2, y + unit / 2 + unit * .035);
      if (isTarget && !wrong) {
        context.strokeStyle = blendHex(colour, "#101b4c", .28);
        context.lineWidth = Math.max(lineWidth, 1.25 / (grid.current!.width / fitSize));
        context.strokeRect(x + context.lineWidth / 2, y + context.lineWidth / 2, unit - context.lineWidth, unit - context.lineWidth);
      }
    }
    if (redrawGrid) {
      context.strokeStyle = "#d4d8e4"; context.lineWidth = lineWidth;
      context.strokeRect(x + lineWidth / 2, y + lineWidth / 2, unit - lineWidth, unit - lineWidth);
    }
  }

  function drawCanvasBoard() {
    if (!game) return;
    const board = canvasBoard();
    if (!board) return;
    const { context, logicalSize, unit, lineWidth } = board;
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, logicalSize, logicalSize);
    game.cells.forEach((_, index) => paintCanvasCell(index, false, false, board));
    context.beginPath();
    for (let line = 0; line <= game.size; line += 1) {
      const position = line * unit;
      context.moveTo(position, 0); context.lineTo(position, logicalSize);
      context.moveTo(0, position); context.lineTo(logicalSize, position);
    }
    context.strokeStyle = "#d4d8e4"; context.lineWidth = lineWidth; context.stroke();
  }

  useEffect(() => {
    if (!game || !viewport.current) return;
    const element = viewport.current;
    const fit = () => setFitSize(Math.max(80, Math.floor(Math.min(element.clientWidth - 18, element.clientHeight - 18))));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [game]);

  useEffect(() => {
    drawCanvasBoard();
  }, [fitSize, game, selected]);

  useEffect(() => () => {
    if (filledSyncTimer.current !== null) window.clearTimeout(filledSyncTimer.current);
    if (saveNoticeTimer.current !== null) window.clearTimeout(saveNoticeTimer.current);
  }, []);

  useEffect(() => {
    let active = true;
    loadCompletedPictures().then((pictures) => { if (active) setCompletedPictures(pictures); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const progress = game ? Math.round(paintStats.done / game.cells.length * 100) : 0;
  const remaining = paintStats.remaining;

  function showSaveMessage(message: string) {
    setSaveNotice(message);
    if (saveNoticeTimer.current !== null) window.clearTimeout(saveNoticeTimer.current);
    saveNoticeTimer.current = window.setTimeout(() => setSaveNotice(""), 2600);
  }

  function persistSaves(next: SavedGame[]) {
    try {
      localStorage.setItem(SAVES_KEY, JSON.stringify(next));
      setSavedGames(next);
      return true;
    } catch {
      showSaveMessage("This iPad couldn't save right now.");
      return false;
    }
  }

  function snapshot(id: string, title: string, thumbnail: string): SavedGame | null {
    if (!game) return null;
    return {
      id, title, thumbnail, updatedAt: Date.now(), selected, brushSize,
      game: { size: game.size, cells: [...game.cells], colours: [...game.colours], totals: [...game.totals] },
      filled: [...filledRef.current],
    };
  }

  function saveProgress(showMessage = true) {
    if (!game) return false;
    const existing = currentSaveId ? savedGames.find((save) => save.id === currentSaveId) : undefined;
    if (!existing && savedGames.length >= MAX_SAVES) {
      showSaveMessage("All 5 save slots are full. Delete one to save this picture.");
      return false;
    }
    const id = existing?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const usedTitles = new Set(savedGames.map((save) => save.title));
    let slot = 1;
    while (usedTitles.has(`Pixel Picture ${slot}`) && slot <= MAX_SAVES) slot += 1;
    const title = existing?.title ?? `Pixel Picture ${slot}`;
    const saved = snapshot(id, title, existing?.thumbnail || makeThumbnail(game));
    if (!saved) return false;
    const next = existing
      ? savedGames.map((item) => item.id === id ? saved : item)
      : [saved, ...savedGames];
    if (!persistSaves(next)) return false;
    setCurrentSaveId(id);
    if (showMessage) showSaveMessage(existing ? "Progress saved" : `${title} saved`);
    return true;
  }

  function resumeSaved(save: SavedGame) {
    if (filledSyncTimer.current !== null) window.clearTimeout(filledSyncTimer.current);
    const restored = [...save.filled];
    const remainingCounts = [...save.game.totals];
    let filledCount = 0;
    restored.forEach((yes, index) => {
      if (!yes) return;
      filledCount += 1;
      remainingCounts[save.game.cells[index]] -= 1;
    });
    const selectedColour = remainingCounts[save.selected] > 0
      ? save.selected
      : Math.max(0, remainingCounts.findIndex((count) => count > 0));
    filledSyncTimer.current = null;
    filledRef.current = restored;
    filledCountRef.current = filledCount;
    remainingCountRef.current = remainingCounts;
    setPaintStats({ done: filledCount, remaining: [...remainingCounts] });
    setGame(save.game); setSelected(selectedColour); setBrushSize(save.brushSize || 1);
    setCurrentSaveId(save.id); setCelebrate(false); setPhotoError("");
    completedSaveId.current = null;
    zoomRef.current = 1; setZoom(1);
  }

  function deleteSaved(save: SavedGame) {
    if (!window.confirm(`Delete ${save.title}? This cannot be undone.`)) return;
    const next = savedGames.filter((item) => item.id !== save.id);
    if (persistSaves(next)) {
      if (currentSaveId === save.id) setCurrentSaveId(null);
      showSaveMessage(`${save.title} deleted`);
    }
  }

  useEffect(() => {
    if (!currentSaveId || !game || filledRef.current.length !== game.cells.length) return;
    const timer = window.setTimeout(() => {
      setSavedGames((current) => {
        const existing = current.find((save) => save.id === currentSaveId);
        if (!existing) return current;
        const saved = snapshot(existing.id, existing.title, existing.thumbnail);
        if (!saved) return current;
        const next = current.map((item) => item.id === existing.id ? saved : item);
        try { localStorage.setItem(SAVES_KEY, JSON.stringify(next)); } catch { return current; }
        return next;
      });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [brushSize, currentSaveId, game, paintStats.done, selected]);

  function acceptPhoto(file?: File) {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      setPhotoError("That file is not a photo. Please choose another one.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPhotoError("");
    setPending(file); setPreview(URL.createObjectURL(file));
  }

  function openPicker(input: HTMLInputElement | null) {
    if (!input) return;
    input.value = "";
    input.click();
  }

  function photoChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.item(0) ?? undefined;
    acceptPhoto(file);
    event.currentTarget.value = "";
  }

  async function begin(level: Level) {
    if (!pending) return;
    if (game && filledCountRef.current > 0 && filledCountRef.current < game.cells.length && !currentSaveId) {
      if (!window.confirm("Replace this unsaved picture? Tap Cancel, then Save Progress if you want to keep it.")) return;
    }
    if (game && currentSaveId && !saveProgress(false)) return;
    setLoading(true);
    try {
      const next = await photoToGame(pending, level);
      const empty = Array(next.cells.length).fill(false);
      filledRef.current = empty;
      filledCountRef.current = 0;
      remainingCountRef.current = [...next.totals];
      setPaintStats({ done: 0, remaining: [...next.totals] });
      setGame(next); setSelected(0); setBrushSize(1);
      setCurrentSaveId(null);
      completedSaveId.current = null;
      zoomRef.current = 1; setZoom(1);
      URL.revokeObjectURL(preview); setPreview(""); setPending(null);
    } catch {
      setPhotoError("We couldn't open that photo. Try another photo, or save it as JPG first.");
    } finally { setLoading(false); }
  }

  function syncFilledNow() {
    if (filledSyncTimer.current !== null) {
      window.clearTimeout(filledSyncTimer.current);
      filledSyncTimer.current = null;
    }
    setPaintStats({ done: filledCountRef.current, remaining: [...remainingCountRef.current] });
  }

  function scheduleFilledSync() {
    if (filledSyncTimer.current !== null) return;
    filledSyncTimer.current = window.setTimeout(() => {
      filledSyncTimer.current = null;
      setPaintStats({ done: filledCountRef.current, remaining: [...remainingCountRef.current] });
    }, 120);
  }

  function colourCell(index: number, showWrong = true) {
    if (!game) return;
    const row = Math.floor(index / game.size); const column = index % game.size;
    const radius = Math.floor(brushSize / 2);
    const covered: number[] = [];
    for (let y = Math.max(0, row - radius); y <= Math.min(game.size - 1, row + radius); y += 1) {
      for (let x = Math.max(0, column - radius); x <= Math.min(game.size - 1, column + radius); x += 1) {
        covered.push(y * game.size + x);
      }
    }
    const matching = covered.filter((cell) => game.cells[cell] === selected);
    const changed = matching.filter((cell) => !filledRef.current[cell]);
    if (!matching.length) {
      if (!showWrong) return;
      paintCanvasCell(index, true);
      window.setTimeout(() => { if (!filledRef.current[index]) paintCanvasCell(index); }, 180);
      return;
    }
    if (!changed.length) return;
    changed.forEach((cell) => {
      filledRef.current[cell] = true;
      filledCountRef.current += 1;
      remainingCountRef.current[selected] -= 1;
      paintCanvasCell(cell);
    });
    const colourFinished = remainingCountRef.current[selected] === 0;
    const pictureFinished = filledCountRef.current === game.cells.length;
    if (colourFinished || pictureFinished) syncFilledNow();
    else scheduleFilledSync();
    if (colourFinished && !pictureFinished) {
      const nextColour = remainingCountRef.current.findIndex((count) => count > 0);
      if (nextColour >= 0) setSelected(nextColour);
    }
    if (pictureFinished) window.setTimeout(() => setCelebrate(true), 180);
  }

  function paintToCell(index: number) {
    if (!game || index === lastCell.current) return;
    const previous = lastCell.current;
    if (previous < 0) {
      lastCell.current = index;
      colourCell(index);
      return;
    }
    const startRow = Math.floor(previous / game.size); const startColumn = previous % game.size;
    const endRow = Math.floor(index / game.size); const endColumn = index % game.size;
    const steps = Math.max(Math.abs(endRow - startRow), Math.abs(endColumn - startColumn));
    for (let step = 1; step <= Math.max(1, steps); step += 1) {
      const row = Math.round(startRow + (endRow - startRow) * step / Math.max(1, steps));
      const column = Math.round(startColumn + (endColumn - startColumn) * step / Math.max(1, steps));
      const cell = row * game.size + column;
      if (cell === lastCell.current) continue;
      lastCell.current = cell;
      colourCell(cell, false);
    }
  }

  function pointToCell(clientX: number, clientY: number) {
    if (!game || !grid.current) return;
    const rect = paintRect.current ?? grid.current.getBoundingClientRect();
    paintRect.current = rect;
    const x = clientX - rect.left; const y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return;
    const column = Math.min(game.size - 1, Math.floor(x / rect.width * game.size));
    const row = Math.min(game.size - 1, Math.floor(y / rect.height * game.size));
    paintToCell(row * game.size + column);
  }

  function setBoardZoom(value: number) {
    const next = Math.max(1, Math.min(5, value));
    paintRect.current = null;
    zoomRef.current = next; setZoom(next);
  }

  function fitBoard() {
    setBoardZoom(1);
    window.requestAnimationFrame(() => viewport.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" }));
  }

  function beginPinch() {
    if (pointers.current.size < 2 || !grid.current) return;
    const [first, second] = [...pointers.current.values()];
    const rect = grid.current.getBoundingClientRect();
    const middleX = (first.x + second.x) / 2; const middleY = (first.y + second.y) / 2;
    pinch.current = {
      distance: Math.hypot(first.x - second.x, first.y - second.y),
      zoom: zoomRef.current,
      x: (middleX - rect.left) / rect.width,
      y: (middleY - rect.top) / rect.height,
    };
    paintRect.current = null;
    drawing.current = false;
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 1) {
      if (grid.current) paintRect.current = grid.current.getBoundingClientRect();
      drawing.current = true; lastCell.current = -1; pointToCell(event.clientX, event.clientY);
    } else beginPinch();
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      if (!pinch.current) beginPinch();
      const gesture = pinch.current; const [first, second] = [...pointers.current.values()];
      if (!gesture || !first || !second) return;
      const distanceNow = Math.hypot(first.x - second.x, first.y - second.y);
      const middleX = (first.x + second.x) / 2; const middleY = (first.y + second.y) / 2;
      setBoardZoom(gesture.zoom * distanceNow / Math.max(1, gesture.distance));
      window.requestAnimationFrame(() => {
        if (!grid.current || !viewport.current) return;
        const rect = grid.current.getBoundingClientRect();
        viewport.current.scrollLeft += rect.left + gesture.x * rect.width - middleX;
        viewport.current.scrollTop += rect.top + gesture.y * rect.height - middleY;
      });
    } else if (drawing.current) pointToCell(event.clientX, event.clientY);
  }

  function pointerEnd(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) { drawing.current = false; lastCell.current = -1; paintRect.current = null; }
  }

  function newPicture() {
    if (game && filledCountRef.current > 0 && filledCountRef.current < game.cells.length && !currentSaveId) {
      if (!window.confirm("Leave this unsaved picture? Tap Cancel, then Save Progress if you want to keep it.")) return;
    }
    if (game && currentSaveId && !saveProgress(false)) return;
    if (filledSyncTimer.current !== null) window.clearTimeout(filledSyncTimer.current);
    filledSyncTimer.current = null; filledRef.current = []; filledCountRef.current = 0; remainingCountRef.current = [];
    setGame(null); setPaintStats({ done: 0, remaining: [] }); setCelebrate(false); setPending(null); setPreview(""); setPhotoError(""); setCurrentSaveId(null); pointers.current.clear();
    completedSaveId.current = null;
  }

  function downloadPicture(image: string, title: string) {
    const link = document.createElement("a");
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pixel-picture"}.png`;
    link.href = image;
    link.click();
  }

  function savePicture() {
    if (!game) return;
    const canvas = document.createElement("canvas"); const px = Math.floor(1024 / game.size);
    canvas.width = canvas.height = px * game.size;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    game.cells.forEach((c, i) => { ctx.fillStyle = game.colours[c]; ctx.fillRect(i % game.size * px, Math.floor(i / game.size) * px, px, px); });
    const image = canvas.toDataURL("image/png");
    const progressSave = currentSaveId ? savedGames.find((save) => save.id === currentSaveId) : undefined;
    const title = progressSave?.title ?? "Completed Picture";
    downloadPicture(image, title);
    const progressId = currentSaveId;
    const id = completedSaveId.current ?? (progressId ? `completed-${progressId}` : `completed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
    completedSaveId.current = id;
    void storeCompletedPicture({ id, title, completedAt: Date.now(), image }).then((pictures) => {
      setCompletedPictures(pictures);
      if (progressId) {
        const next = savedGames.filter((save) => save.id !== progressId);
        if (persistSaves(next)) setCurrentSaveId(null);
      }
      showSaveMessage("Picture saved to Completed");
    }).catch(() => showSaveMessage("Picture downloaded, but couldn't be added to Completed."));
  }

  async function deleteCompleted(picture: CompletedPicture) {
    if (!window.confirm(`Delete ${picture.title} from Completed? This cannot be undone.`)) return;
    try {
      setCompletedPictures(await removeCompletedPicture(picture.id));
      showSaveMessage("Completed picture deleted");
    } catch { showSaveMessage("This iPad couldn't delete the picture right now."); }
  }

  return <main>
    <input ref={camera} className="hidden-input" type="file" accept="image/*,.heic,.heif" capture="environment" onChange={photoChosen} />
    <input ref={photos} className="hidden-input" type="file" accept="image/*,.heic,.heif" onChange={photoChosen} />

    {!game ? <div className="home">
      <header>
        <div className="brand"><Logo/><div className="brand-copy"><h1>Shay &amp; Zay <span>Pixel Fun</span></h1><small>Create · Colour · Play</small></div></div>
        <div className="header-actions"><button className="privacy" onClick={() => setPrivacy(true)}><b>🛡️</b><span><strong>Private &amp; safe</strong><small>Photos stay on this iPad</small></span></button><span className="app-version">{APP_VERSION}</span></div>
      </header>
      <section className="hero">
        <div className="intro">
          <p className="eyebrow"><span>✦</span> Your private pixel studio</p>
          <h2>Snap it. Pixel it.<br/><em>Make it yours.</em></h2>
          <p>Turn any photo into a colour-by-number adventure.</p>
          <button className="take" onClick={() => openPicker(camera.current)}>📷 <span>Take a Photo</span></button>
          <button className="choose" onClick={() => openPicker(photos.current)}>🖼️ <span>Choose a Photo</span></button>
          {photoError && <p className="photo-error" role="alert">{photoError}</p>}
          <div className="hero-chips"><span><b/>Offline ready</span><span><b/>Always ad-free</span><span><b/>On-device privacy</span></div>
        </div>
        <div className="demo">
          <h3><span>LIVE PREVIEW</span> Your picture becomes pixel art</h3>
          <div className="sparkles">✦　★　✧　✦</div>
          <div className="demo-grid">
            {ROCKET.join("").split("").map((v, i) => {
              const n = Number(v); const numbered = n > 0 && i % 12 > 6;
              return <i key={i} className={n === 0 ? "blank" : numbered ? "numbered" : ""} style={!n || numbered ? {} : { background: ROCKET_COLOURS[n - 1] }}>{numbered ? n : ""}</i>;
            })}
          </div>
        </div>
      </section>
      <section className="steps">
        <article><b>1</b><i>📷</i><div><h3>Take a photo</h3><p>Anything you like!</p></div></article>
        <article><b>2</b><i>🔢</i><div><h3>Pick a size</h3><p>Big or small pixels</p></div></article>
        <article><b>3</b><i>🖍️</i><div><h3>Colour it in</h3><p>Match the numbers</p></div></article>
      </section>
      <section className="saved-library">
        <div className="saved-heading"><div><p className="eyebrow"><span>◆</span> Your private gallery</p><h2>Saved Progress Pictures</h2><p>Resume an adventure or revisit a finished masterpiece.</p></div></div>
        <div className="library-section">
          <div className="library-subhead"><div><h3>Progress / Resume</h3><p>Continue exactly where you stopped.</p></div><b>{savedGames.length} / {MAX_SAVES} slots</b></div>
        {savedGames.length ? <div className="saved-grid">{savedGames.map((save) => {
          const savedProgress = Math.round(save.filled.filter(Boolean).length / save.game.cells.length * 100);
          return <article key={save.id} className={savedProgress === 100 ? "complete-save" : ""}>
            <img src={save.thumbnail} alt="Saved pixel picture" />
            <div className="saved-copy"><span>{savedProgress === 100 ? "Complete" : `${savedProgress}% coloured`}</span><h3>{save.title}</h3><small>Saved {new Date(save.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</small><i><b style={{ width: `${savedProgress}%` }}/></i></div>
            <div className="saved-actions"><button onClick={() => resumeSaved(save)}>Resume</button><button onClick={() => deleteSaved(save)} aria-label={`Delete ${save.title}`}>Delete</button></div>
          </article>;
        })}</div> : <div className="empty-saves"><i>◇</i><div><h3>No progress saved yet</h3><p>Start colouring, then tap <b>Save Progress</b>. Your five save slots stay private on this iPad.</p></div></div>}
        </div>
        <div className="library-section completed-section">
          <div className="library-subhead"><div><h3>Completed</h3><p>Your latest finished pixel masterpieces.</p></div><b>{completedPictures.length} / {MAX_COMPLETED}</b></div>
          {completedPictures.length ? <div className="completed-grid">{completedPictures.map((picture) => <article key={picture.id}>
            <img src={picture.image} alt={picture.title} />
            <div className="completed-copy"><span>Completed</span><h3>{picture.title}</h3><small>Saved {new Date(picture.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</small></div>
            <div className="completed-actions"><button onClick={() => downloadPicture(picture.image, picture.title)}>Save again</button><button onClick={() => deleteCompleted(picture)} aria-label={`Delete ${picture.title}`}>Delete</button></div>
          </article>)}</div> : <div className="empty-saves completed-empty"><i>✦</i><div><h3>No completed pictures yet</h3><p>Finish a picture and tap <b>Save Picture</b>. The latest 10 will appear here automatically.</p></div></div>}
        </div>
      </section>
    </div> : <div className="game">
      <header className="game-head">
        <button className="back" onClick={newPicture} aria-label="Back">‹</button>
        <div className="mini-brand"><Logo/><span className="mini-copy"><strong>Shay &amp; Zay <span>Pixel Fun</span></strong><small>Creative studio</small></span></div>
        <div className="progress"><span><b>{progress}%</b> {progress === 100 ? "Amazing!" : "Keep colouring!"}</span><i><b style={{ width: `${progress}%` }}/></i></div>
        <button className={`save-game ${currentSaveId ? "saved" : ""}`} onClick={() => saveProgress()}><b>{currentSaveId ? "✓" : "↓"}</b><span>{currentSaveId ? "Saved game" : "Save progress"}</span></button>
        <button className="new" onClick={() => openPicker(camera.current)}>📷 <span>New photo</span></button>
        <span className="app-version game-version">{APP_VERSION}</span>
      </header>
      <section className="play">
        <aside>
          <h2>Pick a colour</h2>
          <div className="palette">{game.colours.map((colour, i) => <button key={colour + i} className={`${selected === i ? "selected" : ""} ${remaining[i] === 0 ? "finished" : ""}`} style={{ "--swatch": colour } as CSSProperties} onClick={() => remaining[i] && setSelected(i)}><b>{remaining[i] ? i + 1 : "✓"}</b><span>{remaining[i] ? `${remaining[i]} left` : "Done!"}</span></button>)}</div>
        </aside>
        <div className="board">
          <div className="board-top">
            <p><span className="mission-label">Your mission</span> Colour every <b style={{ "--swatch": game.colours[selected] } as CSSProperties}>{selected + 1}</b></p>
            <div className="brush-control"><span>🖌️ Brush</span>{[1, 3, 5].map((size) => <button key={size} className={brushSize === size ? "active" : ""} onClick={() => setBrushSize(size)}>{size}×</button>)}</div>
            <div className="zoom-control"><button className="fit" disabled={zoom === 1} onClick={fitBoard}>Fit</button><button disabled={zoom <= 1} onClick={() => setBoardZoom(zoom - .5)}>−</button><span>{Math.round(zoom * 100)}%</span><button disabled={zoom >= 5} onClick={() => setBoardZoom(zoom + .5)}>+</button></div>
          </div>
          <div ref={viewport} className="grid-scroll"><span className="gesture-hint">Drag to colour · Pinch to explore</span><canvas ref={grid} className="pixel-canvas" style={{ width: fitSize * zoom, height: fitSize * zoom, minWidth: fitSize * zoom, minHeight: fitSize * zoom }}
            role="img"
            aria-label={`Colour-by-number board with ${game.size * game.size} pixels`}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}/></div>
        </div>
      </section>
    </div>}

    {pending && preview && <div className="overlay"><section className="size-modal">
      <button className="close" onClick={() => { URL.revokeObjectURL(preview); setPending(null); setPreview(""); setPhotoError(""); }}>×</button>
      <div className="preview"><img src={preview} alt="Chosen photo" /></div>
      <div className="levels"><p className="eyebrow">Choose your challenge</p><h2>How detailed?</h2><p>More pixels and colours make the finished picture look closer to your photo.</p>
        {LEVELS.map((level, i) => <button key={level.size} className={i === 1 ? "recommended" : i === 3 ? "ultra" : ""} disabled={loading} onClick={() => begin(level)}><i>{level.icon}</i><span><b>{level.name}</b><small>{level.sub}</small></span><span className="level-spec"><b>{level.size}×{level.size}</b><small>pixels</small></span>{i === 1 && <em>POPULAR</em>}{i === 3 && <em>MAX DETAIL</em>}<strong>›</strong></button>)}
        {loading && <div className="loading"><i/> Building your pixel world…</div>}
        {photoError && <p className="photo-error modal-error" role="alert">{photoError}</p>}
      </div>
    </section></div>}

    {privacy && <div className="overlay"><section className="info"><i>🛡️</i><h2>Made to be safe</h2><p>Photos are changed into pixel art right here on this iPad. They are not uploaded or shared.</p><div><span>✓ No accounts</span><span>✓ No ads</span><span>✓ No public gallery</span></div><button onClick={() => setPrivacy(false)}>Got it!</button></section></div>}

    {saveNotice && <div className="save-toast" role="status">{saveNotice}</div>}

    {celebrate && game && <div className="overlay celebration"><div className="confetti">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties}/>)}</div><section className="complete"><div className="completion-mark" aria-hidden="true"><i>✦</i><span/><span/><span/></div><p className="eyebrow">Masterpiece complete</p><h2>That looks incredible.</h2><p className="complete-caption">Made pixel by pixel in your creative studio.</p><div className="mini-grid" style={{ "--size": game.size } as CSSProperties}>{game.cells.map((c, i) => <i key={i} style={{ background: game.colours[c] }}/>)}</div><div><button onClick={savePicture}>↓ Save Picture</button><button onClick={newPicture}>＋ Create Another</button></div></section></div>}
  </main>;
}
