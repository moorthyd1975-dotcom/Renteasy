import React, { useState } from 'react';
import {
  BarChart3,
  Download,
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle,
  FileSpreadsheet,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { db } from '../services/db';

interface AnalyticsModuleProps {
  selectedMonth: number;
  selectedYear: number;
  onYearChange: (year: number) => void;
}

export const AnalyticsModule: React.FC<AnalyticsModuleProps> = ({
  selectedMonth,
  selectedYear,
  onYearChange,
}) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const stats = db.getDashboardStats(selectedMonth, selectedYear);
  const chartData = db.getMonthlyIncomeSeries(selectedYear);
  const tenants = db.getTenants();
  const houses = db.getHouses();
  const allYearPayments = db.getRentPayments(undefined, undefined, undefined, selectedYear);

  // Tenant-wise summary calculation
  const tenantSummaries = tenants.map((tenant) => {
    const tenantPayments = allYearPayments.filter((p) => p.tenant_id === tenant.id);
    const totalCollected = tenantPayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
    const totalPending = tenantPayments.reduce((sum, p) => sum + (p.balance_due || 0), 0);
    const count = tenantPayments.length;

    // Find current assigned house
    const currentTenancy = db.getTenancyHistory(undefined, tenant.id).find((th) => th.is_current);
    const house = currentTenancy ? db.getHouse(currentTenancy.house_id) : undefined;

    return {
      tenant,
      house,
      totalCollected,
      totalPending,
      paymentCount: count,
    };
  });

  // Download Report (CSV)
  const handleDownloadReport = () => {
    const headers = [
      'Month',
      'Year',
      'Actual Collected Rent (INR)',
      'Pending Rent (INR)',
      'Total Rent Due (INR)',
    ];

    const rows = chartData.map((d) => [
      d.month,
      selectedYear,
      d.collected,
      d.pending,
      d.totalDue,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `RentEase_Rental_Income_Report_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Custom Tooltip for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-[#DDD2B4] bg-[#F7F3E8] p-3 text-xs shadow-lg">
          <p className="font-heading font-bold text-[#2C2C2C]">{label} {selectedYear}</p>
          <div className="mt-1 space-y-1">
            <p className="font-mono-numbers text-[#2E6B4A]">
              Collected: <strong>₹{payload[0].value.toLocaleString('en-IN')}</strong>
            </p>
            {payload[1] && (
              <p className="font-mono-numbers text-amber-800">
                Pending: <strong>₹{payload[1].value.toLocaleString('en-IN')}</strong>
              </p>
            )}
          </div>
          <span className="mt-1 block text-[10px] text-[#9A9A9A]">
            Pure rental income (Excludes EB utility bills)
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#2E6B4A] uppercase">
            Module 5 · Pure Rental Income Analytics
          </span>
          <h2 className="font-heading text-lg font-bold text-[#2C2C2C] sm:text-xl">
            Financial Analytics & Real Collection Trends
          </h2>
          <p className="text-xs text-[#6B6B6B]">
            Tracks confirmed rental receipts. Strictly isolates rent income from electricity payments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Year selector */}
          <select
            value={selectedYear}
            onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
            className="rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs font-semibold text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </select>

          <button
            onClick={handleDownloadReport}
            className="flex items-center gap-2 rounded-xl border border-[#DDD2B4] bg-white px-3.5 py-2 text-xs font-bold text-[#2C2C2C] shadow-xs hover:bg-[#FAF6ED]"
          >
            <Download className="h-4 w-4 text-[#2E6B4A]" />
            Download Income Report
          </button>
        </div>
      </div>

      {/* KPI Cards Strip (Pure Rental Totals) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B6B6B]">
            <span>Total Collected in {selectedYear}</span>
            <TrendingUp className="h-4 w-4 text-[#2E6B4A]" />
          </div>
          <div className="mt-2 font-mono-numbers text-2xl font-bold text-[#2E6B4A]">
            ₹{stats.totalCollectedThisYear.toLocaleString('en-IN')}
          </div>
          <span className="mt-1 block text-[11px] text-[#6B6B6B]">
            Actual money received in bank/cash/UPI
          </span>
        </div>

        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B6B6B]">
            <span>Selected Month ({selectedMonth}/{selectedYear})</span>
            <Clock className="h-4 w-4 text-amber-700" />
          </div>
          <div className="mt-2 font-mono-numbers text-2xl font-bold text-[#2C2C2C]">
            ₹{stats.totalCollectedThisMonth.toLocaleString('en-IN')}
          </div>
          <span className="mt-1 block text-[11px] text-[#6B6B6B]">
            Pending this month: ₹{stats.totalPendingThisMonth.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B6B6B]">
            <span>Total Active Tenancies</span>
            <CheckCircle className="h-4 w-4 text-[#2E6B4A]" />
          </div>
          <div className="mt-2 font-mono-numbers text-2xl font-bold text-[#2C2C2C]">
            {houses.length} Portions
          </div>
          <span className="mt-1 block text-[11px] text-[#6B6B6B]">
            Small-scale compound collection
          </span>
        </div>
      </div>

      {/* Monthly Income Bar Chart (Recharts) */}
      <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-6 shadow-xs">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center border-b border-[#DDD2B4] pb-4">
          <div>
            <h3 className="font-heading text-sm font-bold text-[#2C2C2C]">
              Actual Monthly Rent Collected ({selectedYear})
            </h3>
            <span className="text-[11px] text-[#6B6B6B]">
              Bar chart of actual confirmed receipts vs outstanding pending amounts
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[#DDD2B4] bg-white p-1">
            <button
              onClick={() => setViewMode('chart')}
              className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                viewMode === 'chart'
                  ? 'bg-[#2E6B4A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
              }`}
            >
              Bar Chart
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-[#2E6B4A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
              }`}
            >
              Monthly Table
            </button>
          </div>
        </div>

        {viewMode === 'chart' ? (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5DEC9" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={{ stroke: '#DDD2B4' }}
                  tick={{ fill: '#6B6B6B', fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={{ stroke: '#DDD2B4' }}
                  tick={{ fill: '#6B6B6B', fontSize: 11 }}
                  tickFormatter={(val) => `₹${val / 1000}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: 15, fontSize: 12 }}
                  formatter={(value) => (value === 'collected' ? 'Rent Collected' : 'Pending Rent')}
                />
                <Bar
                  dataKey="collected"
                  name="collected"
                  fill="#2E6B4A"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="pending"
                  name="pending"
                  fill="#D4B483"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#DDD2B4] bg-[#F7F3E8] text-[11px] font-bold text-[#6B6B6B]">
                <tr>
                  <th className="p-3">Month</th>
                  <th className="p-3 text-right">Rent Collected</th>
                  <th className="p-3 text-right">Pending Amount</th>
                  <th className="p-3 text-right">Total Scheduled</th>
                  <th className="p-3 text-right">Collection Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD2B4]/40">
                {chartData.map((d) => {
                  const rate = d.totalDue > 0 ? Math.round((d.collected / d.totalDue) * 100) : 0;
                  return (
                    <tr key={d.month} className="hover:bg-[#FAF6ED]">
                      <td className="p-3 font-semibold text-[#2C2C2C]">
                        {d.month} {selectedYear}
                      </td>
                      <td className="p-3 text-right font-mono-numbers font-bold text-[#2E6B4A]">
                        ₹{d.collected.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-right font-mono-numbers font-medium text-amber-800">
                        ₹{d.pending.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-right font-mono-numbers text-[#6B6B6B]">
                        ₹{d.totalDue.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-right font-mono-numbers font-semibold">
                        {rate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tenant-Wise Income Summary */}
      <div className="rounded-2xl border border-[#DDD2B4] bg-white p-5 shadow-xs">
        <h3 className="font-heading text-sm font-bold text-[#2C2C2C]">
          Tenant-Wise Income Summary ({selectedYear})
        </h3>
        <p className="text-xs text-[#6B6B6B]">
          Cumulative breakdown of received rent by tenant across the entire calendar year.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#DDD2B4] bg-[#F7F3E8] text-[11px] font-bold text-[#6B6B6B]">
              <tr>
                <th className="p-3">Tenant Name</th>
                <th className="p-3">Assigned Portion</th>
                <th className="p-3 text-right">Collected This Year</th>
                <th className="p-3 text-right">Pending Balance</th>
                <th className="p-3 text-right">Total Paid Records</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD2B4]/40">
              {tenantSummaries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[#9A9A9A]">
                    No tenant records found.
                  </td>
                </tr>
              ) : (
                tenantSummaries.map(({ tenant, house, totalCollected, totalPending, paymentCount }) => (
                  <tr key={tenant.id} className="hover:bg-[#FAF6ED]/60">
                    <td className="p-3 font-semibold text-[#2C2C2C]">
                      {tenant.name}
                    </td>
                    <td className="p-3 text-[#6B6B6B]">
                      {house ? `${house.house_number} (${house.name})` : 'Former / Unassigned'}
                    </td>
                    <td className="p-3 text-right font-mono-numbers font-bold text-[#2E6B4A]">
                      ₹{totalCollected.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-mono-numbers font-medium text-amber-800">
                      ₹{totalPending.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-mono-numbers text-[#6B6B6B]">
                      {paymentCount} months
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
