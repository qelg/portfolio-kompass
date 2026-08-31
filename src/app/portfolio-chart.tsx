"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { PerformancePoint } from "@/lib/types";

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const percent = new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 4 });
const date = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

type ChartMode = "value" | "gain" | "mwr" | "twr";

const modes: { value: ChartMode; label: string }[] = [
  { value: "value", label: "Vermögen" },
  { value: "gain", label: "Gewinn / Verlust" },
  { value: "mwr", label: "Kapitalgewichtet" },
  { value: "twr", label: "Zeitgewichtet" },
];

const modeDetails: Record<ChartMode, {
  axisLabel: string;
  selectionLabel: string;
  emptyMessage: string;
  value: (point: PerformancePoint) => number | null;
  format: (value: number) => string;
}> = {
  value: {
    axisLabel: "Portfoliowert (€)", selectionLabel: "Portfoliowert",
    emptyMessage: "Mit Kursen und Buchungen entsteht hier dein Verlauf.",
    value: (point) => point.valueEur, format: (value) => eur.format(value),
  },
  gain: {
    axisLabel: "Gewinn / Verlust (€)", selectionLabel: "Gewinn / Verlust",
    emptyMessage: "Für diesen Zeitraum kann noch kein Wertzuwachs berechnet werden.",
    value: (point) => point.gainEur, format: (value) => eur.format(value),
  },
  mwr: {
    axisLabel: "Kapitalgewichtete Rendite (%)", selectionLabel: "Kapitalgewichtet",
    emptyMessage: "Für diesen Zeitraum kann noch keine kapitalgewichtete Rendite berechnet werden.",
    value: (point) => point.periodMwr, format: (value) => percent.format(value),
  },
  twr: {
    axisLabel: "Zeitgewichtete Rendite (%)", selectionLabel: "Zeitgewichtet",
    emptyMessage: "Für diesen Zeitraum kann noch keine zeitgewichtete Rendite berechnet werden.",
    value: (point) => point.periodTwr, format: (value) => percent.format(value),
  },
};

export function PortfolioChart({ points, selectedDate }: { points: PerformancePoint[]; selectedDate?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<ChartMode>("value");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, "");
  const details = modeDetails[mode];
  const chartPoints = points
    .map((point) => ({ point, value: details.value(point) }))
    .filter((item): item is { point: PerformancePoint; value: number } => item.value !== null && Number.isFinite(item.value));

  useEffect(() => {
    const index = selectedDate ? chartPoints.findIndex(({ point }) => point.date === selectedDate) : -1;
    setSelectedIndex(index >= 0 ? index : null);
  }, [points, selectedDate, mode]);

  function selectIndex(index: number) {
    setSelectedIndex(index);
    const params = new URLSearchParams(window.location.search);
    params.set("point", chartPoints[index].point.date);
    router.replace(`?${params.toString()}#portfolio`, { scroll: false });
  }

  return <div className="chart">
    <div className="chart-mode-picker" role="group" aria-label="Darstellung des Portfolioverlaufs">
      {modes.map((option) => <button
        className={mode === option.value ? "active" : undefined}
        key={option.value}
        type="button"
        aria-pressed={mode === option.value}
        onClick={() => setMode(option.value)}
      >{option.label}</button>)}
    </div>
    {chartPoints.length < 2
      ? <div className="chart-empty">{details.emptyMessage}</div>
      : <ChartGraphic
          chartPoints={chartPoints}
          details={details}
          gradientId={gradientId}
          selectedIndex={selectedIndex}
          selectIndex={selectIndex}
        />}
  </div>;
}

function ChartGraphic({ chartPoints, details, gradientId, selectedIndex, selectIndex }: {
  chartPoints: { point: PerformancePoint; value: number }[];
  details: typeof modeDetails[ChartMode];
  gradientId: string;
  selectedIndex: number | null;
  selectIndex: (index: number) => void;
}) {
  const width = 800, height = 260, left = 56, right = 18, top = 18, bottom = 28;
  const values = chartPoints.map(({ value }) => value);
  const rawMin = Math.min(...values), rawMax = Math.max(...values);
  const padding = (rawMax - rawMin || Math.max(Math.abs(rawMin), Math.abs(rawMax)) * 0.1 || 1) * 0.08;
  const min = rawMin - padding, max = rawMax + padding;
  const timestamps = chartPoints.map(({ point }) => new Date(`${point.date}T00:00:00Z`).getTime());
  const firstTime = timestamps[0], timeSpan = timestamps.at(-1)! - firstTime;
  const coordinates = chartPoints.map(({ value }, index) => ({
    x: left + (timeSpan ? (timestamps[index] - firstTime) / timeSpan : index / (chartPoints.length - 1)) * (width - left - right),
    y: height - bottom - (value - min) / (max - min) * (height - top - bottom),
  }));
  const line = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = `${line} L${coordinates.at(-1)!.x},${height - bottom} L${coordinates[0].x},${height - bottom} Z`;
  const zeroY = min <= 0 && max >= 0 ? height - bottom - (0 - min) / (max - min) * (height - top - bottom) : null;
  const selected = selectedIndex === null ? null : chartPoints[selectedIndex];
  const selectedCoordinate = selectedIndex === null ? null : coordinates[selectedIndex];

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
    if (event.key === "ArrowLeft") selectIndex(Math.max(0, (selectedIndex ?? chartPoints.length) - 1));
    else if (event.key === "ArrowRight") selectIndex(Math.min(chartPoints.length - 1, (selectedIndex ?? -1) + 1));
    else selectIndex(selectedIndex ?? chartPoints.length - 1);
  }

  return <>
    <div className="chart-y-label">{details.axisLabel}</div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label={`${details.axisLabel} nach Datum. Kurve auswählen, um Details anzuzeigen.`} onClick={selectNearest} onKeyDown={selectWithKeyboard}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c5ff65" stopOpacity=".42" /><stop offset="1" stopColor="#c5ff65" stopOpacity="0" /></linearGradient></defs>
      <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} className="chart-axis" />
      {zeroY !== null && <line x1={left} x2={width - right} y1={zeroY} y2={zeroY} className="chart-zero" />}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="#193d33" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {selectedCoordinate && <>
        <line x1={selectedCoordinate.x} x2={selectedCoordinate.x} y1={top} y2={height - bottom} className="chart-guide" />
        <circle cx={selectedCoordinate.x} cy={selectedCoordinate.y} r="6" className="chart-point" />
      </>}
    </svg>
    <div className="chart-labels"><span>{formatShortDate(chartPoints[0].point.date)}</span><strong>Datum</strong><span>{formatShortDate(chartPoints.at(-1)!.point.date)}</span></div>
    <div className="chart-selection" aria-live="polite">
      {selected ? <>
        <span><small>Zeitpunkt</small><strong>{date.format(new Date(`${selected.point.date}T12:00:00Z`))}</strong></span>
        <span><small>{details.selectionLabel}</small><strong>{details.format(selected.value)}</strong></span>
        <span><small>Anteile gesamt</small><strong>{number.format(selected.point.totalQuantity)} Stück</strong></span>
      </> : <p>Kurve anklicken oder antippen, um Zeitpunkt und Wert zu sehen.</p>}
    </div>
  </>;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" }).format(new Date(`${value}T12:00:00Z`));
}
