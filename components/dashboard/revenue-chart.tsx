"use client";

// This file is the ONLY place recharts is imported.
// dynamic(() => import('./revenue-chart')) in client.tsx ensures
// recharts (~200 kB) is split into its own lazy chunk and never
// blocks the initial page paint.
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import { chartColor } from "@/lib/constants";
import type { ChartPoint } from "@/lib/actions/dashboard";

// Series colour comes from the audited palette rather than a literal. This
// chart was already close to brand, but "close" is how a palette drifts:
// check-contrast.mjs guards --chart-1..6 and CHART_SERIES mirrors them, so a
// hex written here is a value nothing measures.
const SERIES = chartColor(0);

export default function RevenueChart({ data }: { data: ChartPoint[] }) {
  if (!data.length) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
        No revenue data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="cr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={SERIES} stopOpacity={0.3} />
            <stop offset="95%" stopColor={SERIES} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" />
        {/* No stroke/fontSize props: the RECHARTS block in app/globals.css sets
            the axis line, tick lines and tick text with !important, so anything
            passed here is silently overridden. A literal left in place reads as
            if it were the live value. */}
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip formatter={(v: number) => formatCurrency(v)} />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke={SERIES}
          strokeWidth={2}
          fill="url(#cr)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
