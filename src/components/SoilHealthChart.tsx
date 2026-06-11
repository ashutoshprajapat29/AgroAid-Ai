import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SoilReport } from './FieldManager';
import { useLanguage } from '../lib/LanguageContext';

interface SoilHealthChartProps {
  data: SoilReport[];
}

export default function SoilHealthChart({ data }: SoilHealthChartProps) {
  const { t } = useLanguage();
  // Sort data chronologically for the chart (oldest first)
  const chartData = [...data]
    .sort((a, b) => new Date(a.testDate).getTime() - new Date(b.testDate).getTime())
    .map(report => ({
      date: new Date(report.testDate).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      pH: report.ph || 0,
      Nitrogen: report.nitrogen || 0,
      Phosphorus: report.phosphorus || 0,
      Potassium: report.potassium || 0,
      Carbon: report.organicCarbon || 0
    }));

  if (chartData.length < 2) return null;

  return (
    <div className="bg-[var(--bg-card)] rounded-3xl p-6 shadow-sm border border-[var(--border-card)] mt-6 overflow-hidden">
      <div className="mb-6">
        <h4 className="font-black text-lg text-[var(--text-main)] tracking-tight">{t("soilchart.title")}</h4>
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-1">{t("soilchart.subtitle")}</p>
      </div>
      <div className="h-64 w-full relative">
        <ResponsiveContainer width="100%" height={256} minWidth={0}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorN" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorP" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorK" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorPH" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-input)" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)', fontWeight: 600 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)', fontWeight: 600 }} />
            <Tooltip 
              contentStyle={{ borderRadius: '16px', border: '1px solid var(--border-card)', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', fontWeight: 'bold', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
              itemStyle={{ fontSize: '13px' }}
              labelStyle={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '20px', color: 'var(--text-main)' }} />
            
            <Area type="monotone" dataKey="Nitrogen" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorN)" />
            <Area type="monotone" dataKey="Phosphorus" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorP)" />
            <Area type="monotone" dataKey="Potassium" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorK)" />
            <Area type="monotone" dataKey="pH" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorPH)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
