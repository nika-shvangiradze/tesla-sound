'use client';

import { useEffect, useRef } from 'react';
import { STALE_MS, type Fix } from '../lib/gps';
import { useLanguage } from './language';

function draw(canvas: HTMLCanvasElement, fixes: Fix[], elapsed: number, seconds: string) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  const left = 34;
  const right = width - 10;
  const top = 12;
  const bottom = height - 29;
  const max = Math.max(20, Math.ceil(fixes.reduce((value, fix) => Math.max(value, fix.speedKmh ?? 0), 0) / 20) * 20);
  const start = Math.max(0, elapsed - 60_000);
  const end = start + 60_000;
  const x = (time: number) => left + (time - start) / (end - start) * (right - left);
  const y = (speed: number) => bottom - speed / max * (bottom - top);
  ctx.font = '11px system-ui';
  ctx.strokeStyle = '#263640';
  ctx.fillStyle = '#92a6b3';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let index = 0; index <= 4; index++) {
    const row = max * index / 4;
    const at = y(row);
    ctx.beginPath();
    ctx.moveTo(left, at);
    ctx.lineTo(right, at);
    ctx.stroke();
    ctx.fillText(String(row), left - 8, at);
  }
  ctx.textAlign = 'center';
  for (let index = 0; index <= 4; index++) {
    const time = start + index * 15_000;
    const at = x(time);
    ctx.beginPath();
    ctx.moveTo(at, top);
    ctx.lineTo(at, bottom);
    ctx.stroke();
    const label = `${Math.floor(time / 1000)} ${seconds}`;
    const halfLabel = ctx.measureText(label).width / 2;
    ctx.fillText(label, Math.min(at, width - halfLabel), bottom + 16);
  }

  ctx.strokeStyle = '#59e9d4';
  ctx.fillStyle = '#59e9d4';
  ctx.lineWidth = 2;
  let previous: Fix | undefined;
  for (const fix of fixes) {
    if (fix.speedKmh === null) {
      previous = undefined;
      continue;
    }
    const px = x(fix.elapsedMs);
    const py = y(fix.speedKmh);
    if (previous && previous.speedKmh !== null && fix.elapsedMs - previous.elapsedMs < STALE_MS) {
      ctx.beginPath();
      ctx.moveTo(x(previous.elapsedMs), y(previous.speedKmh));
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(px, py, 2.25, 0, Math.PI * 2);
    ctx.fill();
    previous = fix;
  }
}

export default function SpeedChart({ fixes, elapsed }: { fixes: Fix[]; elapsed: number }) {
  const { t } = useLanguage();
  const seconds = t('s');
  const ref = useRef<HTMLCanvasElement>(null);
  const current = useRef({ fixes, elapsed, seconds });
  useEffect(() => {
    current.current = { fixes, elapsed, seconds };
    if (ref.current) draw(ref.current, fixes, elapsed, seconds);
  }, [fixes, elapsed, seconds]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const resize = () => draw(canvas, current.current.fixes, current.current.elapsed, current.current.seconds);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <div className="chart-frame">
      <canvas ref={ref} className="speed-chart" aria-label={t('GPS speed in km/h over elapsed test time')} role="img" />
      {!fixes.some((fix) => fix.speedKmh !== null) && (
        <div className="chart-empty">{t('Waiting for speed samples')}</div>
      )}
    </div>
  );
}
