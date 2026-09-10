"use client";

import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";
import { RadialGauge } from "@/components/ui/gauges";
import { Bezel } from "@/components/ui/bezel";
import { StatusLamp } from "@/components/ui/marks";
import type { SensorQuality } from "@/lib/telemetry/schema";
import { ModelViewerPanel } from "./model-viewer-panel";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

export function AnalyticsView() {
  const { frame, history } = useTelemetryContext();

  const currentCh4 = frame?.gas?.ch4Ppm ?? 0;
  const isCh4Warn = frame?.gas?.ch4Warn ?? false;
  const isCh4Crit = frame?.gas?.ch4Crit ?? false;

  const currentCo = frame?.gas?.coPpm ?? 0;
  const coStats = frame?.gas?.coStats ?? { currentC: 0, minC: 0, maxC: 0, avgC: 0 };

  const pm1 = frame?.air?.pm1 ?? 0;
  const pm25 = frame?.air?.pm25 ?? 0;
  const pm10 = frame?.air?.pm10 ?? 0;

  const temp = frame?.thermal?.ambientC ?? 0;
  const humidity = frame?.thermal?.humidityPct ?? 0;

  const speed = frame?.motion?.speedMps ?? 0;
  const maxSpeed = frame?.motion?.speedMaxMps ?? 2;

  // Map history to Recharts format
  const chartData = history.map((f) => ({
    time: new Date(f.receivedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    ch4: f.gas?.ch4Ppm ?? 0,
    temp: f.thermal?.ambientC ?? 0,
    pm1: f.air?.pm1 ?? 0,
    pm25: f.air?.pm25 ?? 0,
    pm10: f.air?.pm10 ?? 0,
  }));

  return (
    <div className="flex min-w-0 flex-col gap-[var(--space-sm)]">
      {/* Top Section: 3D model & Telemetry Gauges */}
      <div className="grid min-w-0 grid-cols-1 gap-[var(--space-sm)] xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Live 3D Mapping Bezel */}
        <Bezel title="3D mapping & spatial telemetry" stamp="SCANNING">
          <ModelViewerPanel />
        </Bezel>

        {/* Console Health & Speed dials */}
        <Bezel title="Telemetry instruments" stamp="DIALS">
          <div className="grid grid-cols-3 gap-[var(--space-xs)] py-[var(--space-xs)]">
            <RadialGauge
              value={frame?.power.batteryHealthPct ?? 0}
              label="Bat health"
              unit="%"
            />
            <RadialGauge
              value={frame?.link.signalPct ?? 0}
              label="Com link"
              unit="%"
            />
            <Speedometer value={speed} max={maxSpeed} />
          </div>

          {/* Environmental Summary Cards Grid */}
          <div className="mt-[var(--space-sm)] grid grid-cols-1 gap-[var(--space-xs)] sm:grid-cols-2">
            <Ch4StatusCard ch4={currentCh4} warn={isCh4Warn} crit={isCh4Crit} status={frame?.gas.ch4Status} />
            <CoLevelCard
              co={currentCo}
              min={coStats.minC}
              max={coStats.maxC}
              avg={coStats.avgC}
              status={frame?.gas.coStatus}
            />
            <ParticulatesCard pm1={pm1} pm25={pm25} pm10={pm10} />
            <AmbientClimateCard temp={temp} humidity={humidity} />
          </div>
        </Bezel>
      </div>

      {/* Bottom Section: Real-Time Charts */}
      <div className="grid min-w-0 grid-cols-1 gap-[var(--space-sm)] lg:grid-cols-3">
        {/* Methane Chart */}
        <Bezel title="Methane telemetry" stamp="REAL_TIME">
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis dataKey="time" hide />
                <YAxis
                  stroke="var(--color-muted)"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  tickLine={false}
                  domain={[0, "auto"]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="ch4"
                  name="ch4"
                  stroke="var(--color-accent)"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Bezel>

        {/* Ambient Temperature Chart */}
        <Bezel title="Core temperature" stamp="REAL_TIME">
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis dataKey="time" hide />
                <YAxis
                  stroke="var(--color-muted)"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  tickLine={false}
                  domain={["dataMin - 2", "dataMax + 2"]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="temp"
                  name="temp"
                  stroke="var(--color-hazard)"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Bezel>

        {/* Particulate Matter Area Chart */}
        <Bezel title="Particulates PM1.0 / PM2.5 / PM10" stamp="REAL_TIME">
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis dataKey="time" hide />
                <YAxis
                  stroke="var(--color-muted)"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={24}
                  iconType="rect"
                  iconSize={8}
                  wrapperStyle={{
                    fontFamily: "var(--font-display)",
                    fontSize: "9px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--color-ink-2)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pm1"
                  name="PM1.0"
                  stackId="1"
                  stroke="var(--color-nominal)"
                  fill="var(--color-nominal)"
                  fillOpacity={0.15}
                />
                <Area
                  type="monotone"
                  dataKey="pm25"
                  name="PM2.5"
                  stackId="1"
                  stroke="var(--color-caution)"
                  fill="var(--color-caution)"
                  fillOpacity={0.15}
                />
                <Area
                  type="monotone"
                  dataKey="pm10"
                  name="PM10"
                  stackId="1"
                  stroke="var(--color-hazard)"
                  fill="var(--color-hazard)"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Bezel>
      </div>
    </div>
  );
}

/* Speedometer instrument widget */
function Speedometer({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = c * 0.75;
  const offset = dash - dash * pct;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 108 96" className="w-full max-w-[9.5rem]" role="img" aria-label={`Speed ${value.toFixed(2)} m/s`}>
        <circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke="var(--color-rule)"
          strokeWidth="7"
          strokeDasharray={`${dash} ${c}`}
          strokeDashoffset={c * 0.125}
          transform="rotate(135 54 54)"
        />
        <circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="7"
          strokeDasharray={`${dash} ${c}`}
          strokeDashoffset={offset + c * 0.125}
          transform="rotate(135 54 54)"
          style={{ transition: "stroke-dashoffset var(--dur-short) var(--ease-out)" }}
        />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const a = Math.PI * 0.75 + t * Math.PI * 1.5;
          const x1 = 54 + Math.cos(a) * 34;
          const y1 = 54 + Math.sin(a) * 34;
          const x2 = 54 + Math.cos(a) * 40;
          const y2 = 54 + Math.sin(a) * 40;
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-ink-2)" strokeWidth="1" />;
        })}
        <text x="54" y="52" textAnchor="middle" fill="var(--color-ink)" fontFamily="var(--font-mono)" fontSize="16">
          {value.toFixed(2)}
        </text>
        <text x="54" y="68" textAnchor="middle" fill="var(--color-muted)" fontFamily="var(--font-display)" fontSize="8" letterSpacing="1.4">
          M/S
        </text>
      </svg>
      <p className="label m-0">Robot speed</p>
    </div>
  );
}

/* Gas alert card block */
function Ch4StatusCard({
  ch4,
  warn,
  crit,
  status,
}: {
  ch4: number;
  warn: boolean;
  crit: boolean;
  status?: SensorQuality;
}) {
  const tone = status === "warming_up" ? "caution" : crit ? "hazard" : warn ? "caution" : "nominal";
  const label = status === "warming_up" ? "WARMING UP" : status === "calibrating" ? "CALIBRATING" : crit ? "EXPLOSIVE" : warn ? "CAUTION" : "NOMINAL";

  return (
    <div className="border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-[var(--space-xs)] flex flex-col justify-between">
      <div className="flex justify-between items-center">
        <p className="label m-0">CH4 status</p>
        {status && status !== "ok" && (
          <span className="px-1 text-[9px] font-bold bg-[var(--color-caution)] text-black uppercase animate-pulse">
            {status}
          </span>
        )}
      </div>
      <div className="my-[var(--space-2xs)] flex items-baseline justify-between">
        <span
          className="num text-[length:var(--text-lg)] font-bold"
          style={{ color: crit ? "var(--color-hazard)" : warn ? "var(--color-caution)" : "var(--color-ink)" }}
        >
          {status === "warming_up" ? "WARMING UP..." : status === "calibrating" ? "CALIBRATING..." : `${ch4.toFixed(2)} ppm`}
        </span>
        <StatusLamp tone={tone} label={label} />
      </div>
      {(warn || crit) && (
        <p className="num m-0 text-[10px] text-[var(--color-hazard)] uppercase tracking-wide animate-pulse">
          ⚠️ breaching threshold
        </p>
      )}
    </div>
  );
}

/* Carbon monoxide card with trend line */
function CoLevelCard({
  co,
  min,
  max,
  avg,
  status,
}: {
  co: number;
  min: number;
  max: number;
  avg: number;
  status?: SensorQuality;
}) {
  const range = max - min || 1;
  const pct = ((co - min) / range) * 100;
  const avgPct = ((avg - min) / range) * 100;

  return (
    <div className="border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-[var(--space-xs)] flex flex-col justify-between">
      <div className="flex justify-between items-baseline">
        <p className="label m-0">CO level</p>
        {status && status !== "ok" ? (
          <span className="px-1 text-[9px] font-bold bg-[var(--color-caution)] text-black uppercase animate-pulse">
            {status}
          </span>
        ) : (
          <span className="num text-[10px] text-[var(--color-ink-2)]">Avg {avg.toFixed(1)}</span>
        )}
      </div>
      <p className="num my-[var(--space-2xs)] text-[length:var(--text-lg)] font-bold">
        {status === "warming_up" ? "WARMING UP..." : status === "calibrating" ? "CALIBRATING..." : `${co.toFixed(2)} ppm`}
      </p>
      <div className="relative h-[4px] border border-[var(--color-rule)] bg-[var(--color-paper)]">
        <div
          className="absolute top-0 h-full bg-[var(--color-accent)]"
          style={{ left: `${Math.max(0, Math.min(100, avgPct))}%`, width: "2px" }}
        />
        <div
          className="h-full bg-[var(--color-nominal)] opacity-40"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="mt-[2px] flex justify-between num text-[9px] text-[var(--color-muted)]">
        <span>Min {min.toFixed(1)}</span>
        <span>Max {max.toFixed(1)}</span>
      </div>
    </div>
  );
}

/* Particulate breakdown grid card */
function ParticulatesCard({ pm1, pm25, pm10 }: { pm1: number; pm25: number; pm10: number }) {
  return (
    <div className="border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-[var(--space-xs)]">
      <p className="label m-0">Particulates</p>
      <div className="mt-[var(--space-xs)] grid grid-cols-3 gap-[var(--space-2xs)] text-center">
        <div className="border-r border-[var(--color-rule-2)] pr-1">
          <p className="label m-0 text-[9px]">PM1.0</p>
          <p className="num m-0 text-[length:var(--text-sm)] font-bold">{pm1.toFixed(1)}</p>
        </div>
        <div className="border-r border-[var(--color-rule-2)] px-1">
          <p className="label m-0 text-[9px]">PM2.5</p>
          <p className="num m-0 text-[length:var(--text-sm)] font-bold" style={{ color: pm25 > 35 ? "var(--color-caution)" : "var(--color-ink)" }}>
            {pm25.toFixed(1)}
          </p>
        </div>
        <div className="pl-1">
          <p className="label m-0 text-[9px]">PM10</p>
          <p className="num m-0 text-[length:var(--text-sm)] font-bold">{pm10.toFixed(1)}</p>
        </div>
      </div>
    </div>
  );
}

/* Ambient Climate summary card */
function AmbientClimateCard({ temp, humidity }: { temp: number; humidity: number }) {
  return (
    <div className="border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-[var(--space-xs)]">
      <p className="label m-0">Atmosphere specs</p>
      <div className="mt-[var(--space-xs)] grid grid-cols-2 gap-[var(--space-xs)]">
        <div>
          <p className="label m-0 text-[9px]">Ambient</p>
          <p className="num m-0 text-[length:var(--text-sm)] font-bold">{temp.toFixed(1)} °C</p>
        </div>
        <div>
          <p className="label m-0 text-[9px]">Rel Hum</p>
          <p className="num m-0 text-[length:var(--text-sm)] font-bold">{humidity.toFixed(0)}%</p>
        </div>
      </div>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color?: string;
    stroke?: string;
  }>;
  label?: string;
}

/* Custom tooltip for Recharts graph */
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-[var(--space-xs)] font-mono text-[10px] text-[var(--color-ink)] shadow-md">
        <p className="m-0 label text-[9px] mb-1 opacity-70">{label}</p>
        {payload.map((p) => (
          <p key={p.name} className="m-0 flex items-center gap-2" style={{ color: p.color || p.stroke }}>
            <span>{p.name.toUpperCase()}:</span>
            <span className="num font-bold">{p.value.toFixed(2)}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
}
