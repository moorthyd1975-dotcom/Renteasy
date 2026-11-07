import React from 'react';
import {
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Home,
  Zap,
  ArrowRight,
  User,
  History,
  Calendar,
} from 'lucide-react';
import { db } from '../services/db';
import { House, Tenant } from '../types';

interface DashboardProps {
  selectedMonth: number;
  selectedYear: number;
  onNavigate: (tab: string) => void;
  onOpenQuickReading: () => void;
  onOpenQuickRent: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const Dashboard: React.FC<DashboardProps> = ({
  selectedMonth,
  selectedYear,
  onNavigate,
  onOpenQuickReading,
  onOpenQuickRent,
}) => {
  const stats = db.getDashboardStats(selectedMonth, selectedYear);
  const houses = db.getHouses();
  const tenants = db.getTenants();
  const recentLogs = db.getAuditLogs().slice(0, 5);
  const currentMonthPayments = db.getRentPayments(undefined, undefined, selectedMonth, selectedYear);

  const getTenantForHouse = (houseId: string): Tenant | undefined => {
    const tenancy = db.getCurrentTenancy(houseId);
    if (!tenancy) return undefined;
    return tenants.find((t) => t.id === tenancy.tenant_id);
  };

  const getPaymentForHouse = (houseId: string) => {
    return currentMonthPayments.find((p) => p.house_id === houseId);
  };

  const getLastReading = (houseId: string) => {
    const meters = db.getMeters(houseId);
    if (meters.length === 0) return null;
    return db.getLastMeterReading(meters[0].id);
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#2E6B4A] uppercase">
            Monthly Collection Overview
          </span>
          <h2 className="font-heading text-xl font-bold text-[#2C2C2C] sm:text-2xl">
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Rent Pulse
          </h2>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            Tracking {houses.length} {houses.length === 1 ? 'portion' : 'portions'} in your compound.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenQuickReading}
            className="flex items-center gap-2 rounded-xl bg-[#2E6B4A] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#3F7F5C]"
          >
            <Zap className="h-4 w-4" />
            Capture Meter Reading
          </button>
          <button
            onClick={onOpenQuickRent}
            className="flex items-center gap-2 rounded-xl border border-[#DDD2B4] bg-white px-4 py-2.5 text-xs font-bold text-[#2C2C2C] shadow-xs transition-colors hover:bg-[#FAF6ED]"
          >
            <CheckCircle className="h-4 w-4 text-[#2E6B4A]" />
            Record Payment
          </button>
        </div>
      </div>

      {/* KPI Cards Grid (6 Core Metrics) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* 1. Total Rent Collected */}
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B6B6B]">
            <span>Collected This Month</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E6B4A]/10 text-[#2E6B4A]">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="font-mono-numbers text-2xl font-bold text-[#2E6B4A]">
              ₹{stats.totalCollectedThisMonth.toLocaleString('en-IN')}
            </span>
          </div>
          <span className="mt-1 block text-[11px] text-[#6B6B6B]">
            Actual received rent
          </span>
        </div>

        {/* 2. Total Pending Rent */}
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B6B6B]">
            <span>Pending This Month</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="font-mono-numbers text-2xl font-bold text-amber-800">
              ₹{stats.totalPendingThisMonth.toLocaleString('en-IN')}
            </span>
          </div>
          <span className="mt-1 block text-[11px] text-[#6B6B6B]">
            Awaiting payment
          </span>
        </div>

        {/* 3. Total Income Collected This Year */}
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B6B6B]">
            <span>Collected This Year ({selectedYear})</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="font-mono-numbers text-2xl font-bold text-[#2C2C2C]">
              ₹{stats.totalCollectedThisYear.toLocaleString('en-IN')}
            </span>
          </div>
          <span className="mt-1 block text-[11px] text-[#6B6B6B]">
            Pure rental income YTD
          </span>
        </div>

        {/* 4. Number of Paid Rent Records */}
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B6B6B]">
            <span>Paid Records</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E6B4A]/10 text-[#2E6B4A]">
              <CheckCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-numbers text-2xl font-bold text-[#2E6B4A]">
              {stats.paidCount}
            </span>
            <span className="text-xs text-[#6B6B6B]">of {houses.length} portions</span>
          </div>
          <span className="mt-1 block text-[11px] text-[#6B6B6B]">
            Fully settled portions
          </span>
        </div>

        {/* 5. Number of Unpaid / Partial Records */}
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6B6B6B]">
            <span>Unpaid / Partial</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-700">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-numbers text-2xl font-bold text-rose-700">
              {stats.unpaidCount + stats.partialCount}
            </span>
            <span className="text-xs text-[#6B6B6B]">
              ({stats.partialCount} partial)
            </span>
          </div>
          <span className="mt-1 block text-[11px] text-[#6B6B6B]">
            Requires follow-up
          </span>
        </div>

        {/* 6. EB Charges This Month */}
        {(() => {
          const monthReadings = db.getMeterReadings().filter(
            (r) => r.month === selectedMonth && r.year === selectedYear
          );
          const totalUnits = monthReadings.reduce((sum, r) => sum + r.units_consumed, 0);
          const totalEb = monthReadings.reduce(
            (sum, r) => sum + (r.eb_amount ?? Math.round(r.units_consumed * (r.unit_rate ?? db.getOwner().eb_unit_rate))),
            0
          );
          const recoverable = monthReadings
            .filter((r) => db.getHouse(r.house_id)?.eb_responsibility === 'owner')
            .reduce(
              (sum, r) => sum + (r.eb_amount ?? Math.round(r.units_consumed * (r.unit_rate ?? db.getOwner().eb_unit_rate))),
              0
            );
          const informational = totalEb - recoverable;

          return (
            <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-[#6B6B6B]">
                <span>EB Charges This Month</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
                  <Zap className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="font-mono-numbers text-2xl font-bold text-[#2C2C2C]">
                  ₹{totalEb.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-[#6B6B6B] space-y-0.5">
                <div>
                  <strong className="font-mono-numbers text-[#2E6B4A]">{totalUnits.toFixed(1)}</strong> units
                </div>
                <div className="text-[10px]">
                  ₹{recoverable.toLocaleString('en-IN')} recov · ₹{informational.toLocaleString('en-IN')} direct
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Main Grid: Compound Portions Live Status & Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 spans): Portions Rent & Meter Status */}
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-5 shadow-xs lg:col-span-2">
          <div className="mb-4 flex items-center justify-between border-b border-[#DDD2B4] pb-3">
            <div>
              <h3 className="font-heading text-sm font-bold text-[#2C2C2C]">
                Portions Status ({MONTH_NAMES[selectedMonth - 1]})
              </h3>
              <span className="text-[11px] text-[#6B6B6B]">
                Monthly rent collection and latest meter readings
              </span>
            </div>
            <button
              onClick={() => onNavigate('houses')}
              className="flex items-center gap-1 text-xs font-semibold text-[#2E6B4A] hover:underline"
            >
              Manage Portions <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {houses.length === 0 ? (
            <div className="py-8 text-center">
              <Home className="mx-auto h-8 w-8 text-[#9A9A9A]" />
              <p className="mt-2 text-xs font-medium text-[#6B6B6B]">
                No houses or portions added yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {houses.map((house) => {
                const tenant = getTenantForHouse(house.id);
                const payment = getPaymentForHouse(house.id);
                const lastReading = getLastReading(house.id);

                return (
                  <div
                    key={house.id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-[#DDD2B4] bg-white p-3.5 transition-all hover:border-[#2E6B4A]/50 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FAF6ED] text-[#2E6B4A] border border-[#DDD2B4]">
                        <Home className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-heading text-xs font-bold text-[#2C2C2C]">
                            {house.house_number}
                          </span>
                          <span className="text-[11px] text-[#6B6B6B]">· {house.name}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#6B6B6B]">
                          <User className="h-3 w-3 text-[#9A9A9A]" />
                          <span>{tenant ? tenant.name : 'Vacant Portion'}</span>
                          <span>·</span>
                          <span className="font-mono-numbers font-medium text-[#2C2C2C]">
                            Rent: ₹{house.monthly_rent.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 border-t border-[#DDD2B4]/40 pt-2 sm:border-t-0 sm:pt-0">
                      {/* EB Responsibility & Meter Reading */}
                      <div className="text-right">
                        <span className="block text-[10px] font-medium text-[#6B6B6B]">
                          {house.eb_responsibility === 'owner' ? 'Owner Pays EB' : 'Tenant Pays EB'}
                        </span>
                        <span className="font-mono-numbers text-xs font-semibold text-[#2C2C2C]">
                          {lastReading ? `${lastReading.current_reading} kWh` : 'No reading'}
                        </span>
                      </div>

                      {/* Payment Status Pill */}
                      <div className="min-w-24 text-right">
                        {payment?.payment_status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#2E6B4A]/10 px-2 py-1 text-[11px] font-bold text-[#2E6B4A]">
                            <CheckCircle className="h-3 w-3" /> Paid
                          </span>
                        ) : payment?.payment_status === 'partial' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-800">
                            <Clock className="h-3 w-3" /> Partial (₹{payment.amount_paid.toLocaleString('en-IN')})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] font-bold text-rose-700">
                            <AlertCircle className="h-3 w-3" /> Unpaid
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Recent Activity & Audit Trail */}
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between border-b border-[#DDD2B4] pb-3">
            <div>
              <h3 className="font-heading text-sm font-bold text-[#2C2C2C]">
                Audit Activity Log
              </h3>
              <span className="text-[11px] text-[#6B6B6B]">
                Recent updates and ledger events
              </span>
            </div>
            <History className="h-4 w-4 text-[#6B6B6B]" />
          </div>

          {recentLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#9A9A9A]">
              No audit logs yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((log) => {
                const date = new Date(log.timestamp);
                const timeStr = date.toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={log.id}
                    className="rounded-xl border border-[#DDD2B4] bg-white p-3 text-xs"
                  >
                    <div className="flex items-center justify-between text-[10px] text-[#9A9A9A]">
                      <span className="font-semibold uppercase tracking-wider text-[#2E6B4A]">
                        {log.action} · {log.entity_type}
                      </span>
                      <span>{timeStr}</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-[#2C2C2C]">
                      {log.details}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
