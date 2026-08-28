import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area,
} from 'recharts';
import { useStore } from '../store';

const COLORS = { acc: '#19c39a', blue: '#3d7bfd', warn: '#e99b26', purple: '#8b5cf6', grey: '#8a95ab' };

function themeAxis() {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light'
    ? { grid: '#e2e7ee', label: '#6b7689' }
    : { grid: '#232d44', label: '#7d889f' };
}

export function GrowthChart({ sim, po }: { sim: { day: number; v: number }[]; po: { day: number; v: number }[] }) {
  const ax = themeAxis();
  const data = sim.map((s, i) => ({ day: s.day, sim: s.v, po: po[i]?.v ?? null }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
        <CartesianGrid stroke={ax.grid} strokeDasharray="3 3" />
        <XAxis dataKey="day" stroke={ax.label} fontSize={10} />
        <YAxis stroke={ax.label} fontSize={10} />
        <Tooltip contentStyle={{ background: 'var(--tip-bg)', border: '1px solid var(--tip-border)', fontSize: 11, color: 'var(--txt)' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="sim" name="Simulation" stroke={COLORS.acc} dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="po" name="Catalog PO" stroke={COLORS.grey} dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function IntakeChart({ sim, po }: { sim: { day: number; v: number }[]; po: { day: number; v: number }[] }) {
  const ax = themeAxis();
  const data = sim.map((s, i) => ({ day: s.day, sim: s.v, po: po[i]?.v ?? null }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
        <defs>
          <linearGradient id="gAcc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.acc} stopOpacity={0.4} />
            <stop offset="100%" stopColor={COLORS.acc} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={ax.grid} strokeDasharray="3 3" />
        <XAxis dataKey="day" stroke={ax.label} fontSize={10} />
        <YAxis stroke={ax.label} fontSize={10} />
        <Tooltip contentStyle={{ background: 'var(--tip-bg)', border: '1px solid var(--tip-border)', fontSize: 11, color: 'var(--txt)' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="sim" name="Simulation" stroke={COLORS.acc} fill="url(#gAcc)" strokeWidth={2} />
        <Area type="monotone" dataKey="po" name="Target" stroke={COLORS.grey} fill="none" strokeWidth={1.5} strokeDasharray="4 3" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function FcrBarChart({ data }: { data: { pen: string; fcr: number }[] }) {
  const ax = themeAxis();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
        <CartesianGrid stroke={ax.grid} strokeDasharray="3 3" />
        <XAxis dataKey="pen" stroke={ax.label} fontSize={10} />
        <YAxis stroke={ax.label} fontSize={10} />
        <Tooltip contentStyle={{ background: 'var(--tip-bg)', border: '1px solid var(--tip-border)', fontSize: 11, color: 'var(--txt)' }} />
        <Bar dataKey="fcr" name="FCR" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DiurnalChart({ data }: { data: { hour: number; intake: number; dark: boolean }[] }) {
  const ax = themeAxis();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
        <defs>
          <linearGradient id="gWarn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.warn} stopOpacity={0.4} />
            <stop offset="100%" stopColor={COLORS.warn} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={ax.grid} strokeDasharray="3 3" />
        <XAxis dataKey="hour" stroke={ax.label} fontSize={10} />
        <YAxis stroke={ax.label} fontSize={10} />
        <Tooltip contentStyle={{ background: 'var(--tip-bg)', border: '1px solid var(--tip-border)', fontSize: 11, color: 'var(--txt)' }} />
        <Area type="monotone" dataKey="intake" name="Intake" stroke={COLORS.warn} fill="url(#gWarn)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StationChart({ data }: { data: { pen: string; sat: number }[] }) {
  const ax = themeAxis();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
        <CartesianGrid stroke={ax.grid} strokeDasharray="3 3" />
        <XAxis dataKey="pen" stroke={ax.label} fontSize={10} />
        <YAxis stroke={ax.label} fontSize={10} domain={[0, 1]} />
        <Tooltip contentStyle={{ background: 'var(--tip-bg)', border: '1px solid var(--tip-border)', fontSize: 11, color: 'var(--txt)' }} />
        <Bar dataKey="sat" name="Saturation" fill={COLORS.purple} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
