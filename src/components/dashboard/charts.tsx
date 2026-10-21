"use client";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmt = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
const compact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

const axis = { stroke: "var(--chart-text)", fontSize: 11, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, currency }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-bold">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}</span>
          <span className="num font-semibold">{fmt(p.value)} {currency}</span>
        </p>
      ))}
    </div>
  );
}

export function MonthlyChart({ data, currency }: { data: { month: string; revenue: number; expenses: number; profit: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="month" {...axis} reversed />
        <YAxis {...axis} tickFormatter={compact} orientation="right" width={48} />
        <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="الإيرادات" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expenses" name="المصروفات" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="profit" name="صافي الربح" stroke="var(--series-3)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }} activeDot={{ r: 5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ActivityChart({ data, currency }: { data: { name: string; revenue: number; expenses: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="name" {...axis} reversed />
        <YAxis {...axis} tickFormatter={compact} orientation="right" width={48} />
        <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="الإيرادات" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Bar dataKey="expenses" name="المصروفات" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ranked expense breakdown: one series, so one hue; bar length carries the magnitude. */
export function ExpenseBreakdown({ data, currency }: { data: { name: string; value: number }[]; currency: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.name} title={`${d.name}: ${fmt(d.value)} ${currency}`}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-semibold">{d.name}</span>
            <span className="num shrink-0 text-muted-foreground">{fmt(d.value)} · {total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-[var(--series-2)]" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
