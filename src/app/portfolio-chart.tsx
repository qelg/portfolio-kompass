"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { PortfolioPoint } from "@/lib/types";

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 4 });
const date = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export function PortfolioChart({ points, selectedDate }: { points: PortfolioPoint[]; selectedDate?: string }) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(() => selectedDate ? points.findIndex((point) => point.date === selectedDate) : null);
  const gradientId = useId().replace(/:/g, "");

  useEffect(() => {
    setSelectedIndex(selectedDate ? points.findIndex((point) => point.date === selectedDate) : null);
  }, [points, selectedDate]);

  if (points.length < 2) return <div className="chart-empty">Mit Kursen und Buchungen entsteht hier dein Verlauf.</div>;

  const width = 800, height = 260, left = 56, right = 18, top = 18, bottom = 28;
  const values = points.map((point) => point.valueEur);
  const min = Math.min(...values) * 0.96, max = Math.max(...values) * 1.02;
  const timestamps = points.map((point) => new Date(`${point.date}T00:00:00Z`).getTime());
  const firstTime = timestamps[0], timeSpan = timestamps.at(-1)! - firstTime;
  const coordinates = points.map((point, index) => ({
    x: left + (timeSpan ? (timestamps[index] - firstTime) / timeSpan : index / (points.length - 1)) * (width - left - right),
    y: height - bottom - (point.valueEur - min) / (max - min || 1) * (height - top - bottom),
  }));
  const line = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = `${line} L${coordinates.at(-1)!.x},${height - bottom} L${coordinates[0].x},${height - bottom} Z`;
  const selected = selectedIndex === null ? null : points[selectedIndex];
  const selectedCoordinate = selectedIndex === null ? null : coordinates[selectedIndex];

  function selectIndex(index: number) {
    setSelectedIndex(index);
    const params = new URLSearchParams(window.location.search);
    params.set("point", points[index].date);
    router.replace(`?${params.toString()}#portfolio`, { scroll: false });
  }

  function selectNearest(event: MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * width;
    const nearest = coordinates.reduce(
      (best, coordinate, index) => Math.abs(coordinate.x - x) < best.distance ? { index, distance: Math.abs(coordinate.x - x) } : best,
      { index: 0, distance: Number.POSITIVE_INFINITY },
    );
    selectIndex(nearest.index);
  }

  function selectWithKeyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (!["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") selectIndex(Math.max(0, (selectedIndex ?? points.length) - 1));
    else if (event.key === "ArrowRight") selectIndex(Math.min(points.length - 1, (selectedIndex ?? -1) + 1));
    else selectIndex(selectedIndex ?? points.length - 1);
  }

  return <div className="chart">
    <div className="chart-y-label">Portfoliowert (€)</div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label="Portfoliowert in Euro nach Datum. Kurve auswählen, um Details anzuzeigen." onClick={selectNearest} onKeyDown={selectWithKeyboard}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c5ff65" stopOpacity=".42" /><stop offset="1" stopColor="#c5ff65" stopOpacity="0" /></linearGradient></defs>
      <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} className="chart-axis" />
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="#193d33" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {selectedCoordinate && <>
        <line x1={selectedCoordinate.x} x2={selectedCoordinate.x} y1={top} y2={height - bottom} className="chart-guide" />
        <circle cx={selectedCoordinate.x} cy={selectedCoordinate.y} r="6" className="chart-point" />
      </>}
    </svg>
    <div className="chart-labels"><span>{formatShortDate(points[0].date)}</span><strong>Datum</strong><span>{formatShortDate(points.at(-1)!.date)}</span></div>
    <div className="chart-selection" aria-live="polite">
      {selected ? <>
        <span><small>Zeitpunkt</small><strong>{date.format(new Date(`${selected.date}T12:00:00Z`))}</strong></span>
        <span><small>Portfoliowert</small><strong>{eur.format(selected.valueEur)}</strong></span>
        <span><small>Anteile gesamt</small><strong>{number.format(selected.totalQuantity)} Stück</strong></span>
      </> : <p>Kurve anklicken oder antippen, um Zeitpunkt, Wert und Anteile zu sehen.</p>}
    </div>
  </div>;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" }).format(new Date(`${value}T12:00:00Z`));
}
