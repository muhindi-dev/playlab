"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type RGB = [number, number, number];
type Lab = [number, number, number];
type Game = { size: number; cells: number[]; colours: string[]; totals: number[] };
type Level = { name: string; sub: string; size: number; colours: number; icon: string };

const LEVELS: Level[] = [
  { name: "Big pixels", sub: "Easiest to colour", size: 18, colours: 10, icon: "🟨" },
  { name: "Photo pixels", sub: "Best picture match", size: 30, colours: 16, icon: "✨" },
  { name: "Tiny pixels", sub: "Most photo detail", size: 42, colours: 22, icon: "🔍" },
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
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const samplingScale = 4;
  canvas.width = canvas.height = level.size * samplingScale;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  const crop = Math.min(bitmap.width, bitmap.height);
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, canvas.width, canvas.height);
  bitmap.close();
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
  return <span className="logo" aria-hidden="true"><i>★</i></span>;
}

export default function Home() {
  const camera = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const lastCell = useRef(-1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const zoomRef = useRef(1);
  const pinch = useRef<{ distance: number; zoom: number; x: number; y: number } | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [filled, setFilled] = useState<boolean[]>([]);
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [wrong, setWrong] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const [fitSize, setFitSize] = useState(480);
  const [brushSize, setBrushSize] = useState(1);

  useEffect(() => {
    if (!game || !viewport.current) return;
    const element = viewport.current;
    const fit = () => setFitSize(Math.max(80, Math.floor(Math.min(element.clientWidth - 18, element.clientHeight - 18))));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [game]);

  const done = useMemo(() => filled.filter(Boolean).length, [filled]);
  const progress = game ? Math.round(done / game.cells.length * 100) : 0;
  const remaining = useMemo(() => {
    if (!game) return [];
    const left = [...game.totals];
    filled.forEach((yes, i) => { if (yes) left[game.cells[i]] -= 1; });
    return left;
  }, [filled, game]);

  function acceptPhoto(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    if (preview) URL.revokeObjectURL(preview);
    setPending(file); setPreview(URL.createObjectURL(file));
  }

  async function begin(level: Level) {
    if (!pending) return;
    setLoading(true);
    try {
      const next = await photoToGame(pending, level);
      setGame(next); setFilled(Array(next.cells.length).fill(false)); setSelected(0); setBrushSize(1);
      zoomRef.current = 1; setZoom(1);
      URL.revokeObjectURL(preview); setPreview(""); setPending(null);
    } finally { setLoading(false); }
  }

  function colourCell(index: number) {
    if (!game || index === lastCell.current) return;
    lastCell.current = index;
    const row = Math.floor(index / game.size); const column = index % game.size;
    const radius = Math.floor(brushSize / 2);
    const covered: number[] = [];
    for (let y = Math.max(0, row - radius); y <= Math.min(game.size - 1, row + radius); y += 1) {
      for (let x = Math.max(0, column - radius); x <= Math.min(game.size - 1, column + radius); x += 1) {
        covered.push(y * game.size + x);
      }
    }
    const canPaint = covered.some((cell) => game.cells[cell] === selected);
    if (!canPaint) {
      setWrong(index); window.setTimeout(() => setWrong(-1), 220); return;
    }
    setFilled((current) => {
      const next = [...current];
      covered.forEach((cell) => { if (game.cells[cell] === selected) next[cell] = true; });
      if (game.cells.every((c, i) => c !== selected || next[i])) {
        const nextColour = game.colours.findIndex((_, c) => game.cells.some((x, i) => x === c && !next[i]));
        if (nextColour >= 0) setSelected(nextColour);
      }
      if (next.every(Boolean)) window.setTimeout(() => setCelebrate(true), 180);
      return next;
    });
  }

  function pointToCell(event: ReactPointerEvent<HTMLDivElement>) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-pixel]");
    const index = Number(target?.dataset.pixel);
    if (Number.isInteger(index)) colourCell(index);
  }

  function setBoardZoom(value: number) {
    const next = Math.max(1, Math.min(5, value));
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
    drawing.current = false;
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 1) {
      drawing.current = true; lastCell.current = -1; pointToCell(event);
    } else beginPinch();
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
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
    } else if (drawing.current) pointToCell(event);
  }

  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) { drawing.current = false; lastCell.current = -1; }
  }

  function newPicture() {
    setGame(null); setFilled([]); setCelebrate(false); setPending(null); setPreview(""); pointers.current.clear();
  }

  function savePicture() {
    if (!game) return;
    const canvas = document.createElement("canvas"); const px = Math.floor(1024 / game.size);
    canvas.width = canvas.height = px * game.size;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    game.cells.forEach((c, i) => { ctx.fillStyle = game.colours[c]; ctx.fillRect(i % game.size * px, Math.floor(i / game.size) * px, px, px); });
    const link = document.createElement("a"); link.download = "my-pixel-picture.png"; link.href = canvas.toDataURL(); link.click();
  }

  return <main>
    <input ref={camera} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => acceptPhoto(e.target.files?.[0])} />
    <input ref={photos} className="hidden-input" type="file" accept="image/*" onChange={(e) => acceptPhoto(e.target.files?.[0])} />

    {!game ? <div className="home">
      <header>
        <div className="brand"><Logo/><h1>Pixel <span>Colour</span> Fun</h1></div>
        <button className="privacy" onClick={() => setPrivacy(true)}><b>🛡️</b><span><strong>Private &amp; safe</strong><small>Photos stay on this iPad</small></span></button>
      </header>
      <section className="hero">
        <div className="intro">
          <p className="eyebrow">Make your own pixel magic</p>
          <h2>Turn a photo into pixel art!</h2>
          <p>Snap something you love, then colour it by number.</p>
          <button className="take" onClick={() => camera.current?.click()}>📷 <span>Take a Photo</span></button>
          <button className="choose" onClick={() => photos.current?.click()}>🖼️ <span>Choose a Photo</span></button>
        </div>
        <div className="demo">
          <h3>Your picture becomes pixel art!</h3>
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
    </div> : <div className="game">
      <header className="game-head">
        <button className="back" onClick={newPicture} aria-label="Back">‹</button>
        <div className="mini-brand"><Logo/><strong>Pixel Colour Fun</strong></div>
        <div className="progress"><span><b>{progress}%</b> {progress === 100 ? "Amazing!" : "Keep colouring!"}</span><i><b style={{ width: `${progress}%` }}/></i></div>
        <button className="new" onClick={() => camera.current?.click()}>📷 <span>New photo</span></button>
      </header>
      <section className="play">
        <aside>
          <h2>Pick a colour</h2>
          <div className="palette">{game.colours.map((colour, i) => <button key={colour + i} className={`${selected === i ? "selected" : ""} ${remaining[i] === 0 ? "finished" : ""}`} style={{ "--swatch": colour } as CSSProperties} onClick={() => remaining[i] && setSelected(i)}><b>{remaining[i] ? i + 1 : "✓"}</b><span>{remaining[i] ? `${remaining[i]} left` : "Done!"}</span></button>)}</div>
        </aside>
        <div className="board">
          <div className="board-top">
            <p>Colour every <b style={{ "--swatch": game.colours[selected] } as CSSProperties}>{selected + 1}</b></p>
            <div className="brush-control"><span>🖌️ Brush</span>{[1, 3, 5].map((size) => <button key={size} className={brushSize === size ? "active" : ""} onClick={() => setBrushSize(size)}>{size}×</button>)}</div>
            <div className="zoom-control"><button className="fit" disabled={zoom === 1} onClick={fitBoard}>Fit</button><button disabled={zoom <= 1} onClick={() => setBoardZoom(zoom - .5)}>−</button><span>{Math.round(zoom * 100)}%</span><button disabled={zoom >= 5} onClick={() => setBoardZoom(zoom + .5)}>+</button></div>
          </div>
          <div ref={viewport} className="grid-scroll"><div ref={grid} className="pixel-grid" style={{ "--size": game.size, width: fitSize * zoom, height: fitSize * zoom, minWidth: fitSize * zoom, minHeight: fitSize * zoom } as CSSProperties}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}>
            {game.cells.map((colour, i) => <button key={i} data-pixel={i} className={`${filled[i] ? "filled" : ""} ${!filled[i] && colour === selected ? "target" : ""} ${wrong === i ? "wrong" : ""}`} style={{ "--cell": game.colours[colour] } as CSSProperties} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") colourCell(i); }} aria-label={`Pixel number ${colour + 1}`}>{filled[i] ? "" : colour + 1}</button>)}
          </div></div>
        </div>
      </section>
    </div>}

    {pending && preview && <div className="overlay"><section className="size-modal">
      <button className="close" onClick={() => { URL.revokeObjectURL(preview); setPending(null); setPreview(""); }}>×</button>
      <div className="preview"><img src={preview} alt="Chosen photo" /></div>
      <div className="levels"><p className="eyebrow">One more step</p><h2>Choose your pixel size</h2><p>Photo pixels give the best mix of detail and easy colouring.</p>
        {LEVELS.map((level, i) => <button key={level.size} className={i === 1 ? "recommended" : ""} disabled={loading} onClick={() => begin(level)}><i>{level.icon}</i><span><b>{level.name}</b><small>{level.sub}</small></span>{i === 1 && <em>BEST MATCH</em>}<strong>›</strong></button>)}
        {loading && <div className="loading"><i/> Making pixel magic…</div>}
      </div>
    </section></div>}

    {privacy && <div className="overlay"><section className="info"><i>🛡️</i><h2>Made to be safe</h2><p>Photos are changed into pixel art right here on this iPad. They are not uploaded or shared.</p><div><span>✓ No accounts</span><span>✓ No ads</span><span>✓ No public gallery</span></div><button onClick={() => setPrivacy(false)}>Got it!</button></section></div>}

    {celebrate && game && <div className="overlay celebration"><div className="confetti">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties}/>)}</div><section className="complete"><i>⭐</i><p className="eyebrow">Pixel perfect!</p><h2>You made amazing art!</h2><div className="mini-grid" style={{ "--size": game.size } as CSSProperties}>{game.cells.map((c, i) => <i key={i} style={{ background: game.colours[c] }}/>)}</div><div><button onClick={savePicture}>⬇️ Save Picture</button><button onClick={newPicture}>📷 Make Another</button></div></section></div>}
  </main>;
}
