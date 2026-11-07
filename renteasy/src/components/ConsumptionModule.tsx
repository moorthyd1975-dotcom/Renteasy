import React, { useState } from 'react';
import {
  Activity,
  Download,
  Search,
  Eye,
  Edit2,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Calendar,
  X,
} from 'lucide-react';
import { db } from '../services/db';
import { MeterReading, MeterEvidence } from '../types';

interface ConsumptionModuleProps {
  onRefresh: () => void;
  onViewEvidence: (evidence: MeterEvidence, reading: MeterReading) => void;
}

export const ConsumptionModule: React.FC<ConsumptionModuleProps> = ({
  onRefresh,
  onViewEvidence,
}) => {
  const [filterHouseId, setFilterHouseId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingReading, setEditingReading] = useState<MeterReading | null>(null);
  const [correctedValue, setCorrectedValue] = useState<number>(0);
  const [correctionReason, setCorrectionReason] = useState('');

  const houses = db.getHouses();
  const allReadings = db.getMeterReadings();

  // Filter Readings
  const filteredReadings = allReadings.filter((r) => {
    if (filterHouseId !== 'all' && r.house_id !== filterHouseId) return false;

    const house = db.getHouse(r.house_id);
    const tenant = db.getTenant(r.tenant_id);

    const matchText = `${house?.house_number || ''} ${house?.name || ''} ${tenant?.name || ''}`.toLowerCase();
    return matchText.includes(searchTerm.toLowerCase());
  });

  // Calculate totals
  const totalUnitsConsumed = filteredReadings.reduce((sum, r) => sum + r.units_consumed, 0);
  const totalEbAmount = filteredReadings.reduce((sum, r) => sum + (r.eb_amount || 0), 0);
  const averageUnits = filteredReadings.length > 0 ? Math.round(totalUnitsConsumed / filteredReadings.length) : 0;

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredReadings.length === 0) return;

    const headers = [
      'Month',
      'Year',
      'House Number',
      'Portion Name',
      'Tenant Name',
      'Meter Name',
      'Previous Reading (kWh)',
      'Current Reading (kWh)',
      'Units Consumed (kWh)',
      'Unit Rate (INR)',
      'EB Amount (INR)',
      'Responsibility',
      'Reading Date',
      'Is Corrected',
      'Correction Reason',
    ];

    const rows = filteredReadings.map((r) => {
      const house = db.getHouse(r.house_id);
      const tenant = db.getTenant(r.tenant_id);
      const meter = db.getMeter(r.meter_id);
      const isOwner = house?.eb_responsibility === 'owner';

      return [
        r.month,
        r.year,
        `"${house?.house_number || ''}"`,
        `"${house?.name || ''}"`,
        `"${tenant?.name || 'Vacant'}"`,
        `"${meter?.meter_name || ''}"`,
        r.previous_reading,
        r.current_reading,
        r.units_consumed,
        r.unit_rate ?? '',
        r.eb_amount ?? '',
        isOwner ? 'Recoverable from tenant' : 'Informational (tenant pays directly)',
        r.reading_date,
        r.is_corrected ? 'Yes' : 'No',
        `"${r.correction_reason || ''}"`,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `RentEase_EB_Consumption_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenEdit = (reading: MeterReading) => {
    setEditingReading(reading);
    setCorrectedValue(reading.current_reading);
    setCorrectionReason('');
  };

  const [savingCorrection, setSavingCorrection] = useState(false);

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReading || !correctionReason.trim()) {
      alert('Please provide a correction reason for the audit trail.');
      return;
    }

    setSavingCorrection(true);
    try {
      await db.correctMeterReading(editingReading.id, Number(correctedValue), correctionReason.trim());
      setEditingReading(null);
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update reading.');
    } finally {
      setSavingCorrection(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#2E6B4A] uppercase">
            Module 3 · Consumption History
          </span>
          <h2 className="font-heading text-lg font-bold text-[#2C2C2C] sm:text-xl">
            EB Consumption Ledger & Rollover Records
          </h2>
          <p className="text-xs text-[#6B6B6B]">
            Automated consumption calculation: Current month reading minus previous month reading.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 rounded-xl border border-[#DDD2B4] bg-white px-4 py-2.5 text-xs font-bold text-[#2C2C2C] shadow-xs hover:bg-[#FAF6ED]"
        >
          <Download className="h-4 w-4 text-[#2E6B4A]" />
          Export EB Ledger (CSV)
        </button>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <span className="text-xs font-semibold text-[#6B6B6B]">Total Units Recorded</span>
          <div className="mt-1 font-mono-numbers text-2xl font-bold text-[#2E6B4A]">
            {totalUnitsConsumed.toLocaleString('en-IN')} kWh
          </div>
          <span className="text-[11px] text-[#6B6B6B]">Across filtered records</span>
        </div>

        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <span className="text-xs font-semibold text-[#6B6B6B]">Average Monthly Consumption</span>
          <div className="mt-1 font-mono-numbers text-2xl font-bold text-[#2C2C2C]">
            {averageUnits} kWh / portion
          </div>
          <span className="text-[11px] text-[#6B6B6B]">Per portion per month</span>
        </div>

        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <span className="text-xs font-semibold text-[#6B6B6B]">Active Portions with Meters</span>
          <div className="mt-1 font-mono-numbers text-2xl font-bold text-[#2C2C2C]">
            {houses.length} Portions
          </div>
          <span className="text-[11px] text-[#6B6B6B]">Preserving tenant history</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search portion or tenant..."
            className="w-full rounded-lg border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#6B6B6B]" />
          <select
            value={filterHouseId}
            onChange={(e) => setFilterHouseId(e.target.value)}
            className="rounded-lg border border-[#DDD2B4] bg-white px-3 py-1.5 text-xs font-semibold text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
          >
            <option value="all">All Portions</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.house_number} ({h.name})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Consumption Table (Formula: Current - Previous) */}
      <div className="overflow-hidden rounded-2xl border border-[#DDD2B4] bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#DDD2B4] bg-[#F7F3E8] text-[11px] font-bold text-[#6B6B6B]">
              <tr>
                <th className="p-3">Month / Year</th>
                <th className="p-3">House & Portion</th>
                <th className="p-3">Tenant at Capture</th>
                <th className="p-3 text-right">Prev Reading</th>
                <th className="p-3 text-right">Curr Reading</th>
                <th className="p-3 text-right font-bold text-[#2E6B4A]">Units Consumed</th>
                <th className="p-3 text-right">Rate</th>
                <th className="p-3 text-right font-bold text-[#2C2C2C]">EB Amount (₹)</th>
                <th className="p-3">Responsibility</th>
                <th className="p-3">Evidence</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD2B4]/40">
              {filteredReadings.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-[#9A9A9A]">
                    No electricity readings found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredReadings.map((r) => {
                  const house = db.getHouse(r.house_id);
                  const tenant = db.getTenant(r.tenant_id);
                  const evidence = db.getMeterEvidence(r.id);
                  const isOwner = house?.eb_responsibility === 'owner';

                  // Flag unusual consumption
                  const isHighConsumption = r.units_consumed > 500;
                  const isRolloverOrAnomaly = r.current_reading < r.previous_reading;

                  return (
                    <tr key={r.id} className="transition-colors hover:bg-[#FAF6ED]/60">
                      <td className="p-3 font-semibold text-[#2C2C2C]">
                        {r.month}/{r.year}
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-[#2C2C2C]">
                          {house?.house_number || 'N/A'}
                        </span>
                        <span className="block text-[11px] text-[#6B6B6B]">
                          {house?.name || ''}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-[#2C2C2C]">
                        {tenant?.name || 'Vacant'}
                      </td>
                      <td className="p-3 text-right font-mono-numbers text-[#6B6B6B]">
                        {r.previous_reading} kWh
                      </td>
                      <td className="p-3 text-right font-mono-numbers font-semibold text-[#2C2C2C]">
                        {r.current_reading} kWh
                      </td>
                      <td className="p-3 text-right font-mono-numbers font-bold text-[#2E6B4A]">
                        {r.units_consumed} units
                        {isHighConsumption && (
                          <span
                            className="ml-1 inline-flex items-center text-amber-700"
                            title="Unusually high consumption (>500 units)"
                          >
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        )}
                        {isRolloverOrAnomaly && (
                          <span
                            className="ml-1 inline-flex items-center text-rose-700"
                            title="Reading lower than previous month (Rollover or Replacement)"
                          >
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono-numbers text-[#6B6B6B]">
                        ₹{r.unit_rate ?? db.getOwner().eb_unit_rate}
                      </td>
                      <td className="p-3 text-right font-mono-numbers font-bold text-[#2C2C2C]">
                        ₹{r.eb_amount !== undefined && r.eb_amount !== null ? r.eb_amount.toLocaleString('en-IN') : Math.round(r.units_consumed * (r.unit_rate ?? db.getOwner().eb_unit_rate)).toLocaleString('en-IN')}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            isOwner
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                          title={
                            isOwner
                              ? 'Owner pays EB board directly; recoverable from tenant'
                              : 'Tenant pays EB board directly; informational ledger'
                          }
                        >
                          {isOwner ? 'Recoverable' : 'Direct Tenant'}
                        </span>
                      </td>
                      <td className="p-3">
                        {evidence ? (
                          <button
                            onClick={() => onViewEvidence(evidence, r)}
                            className="flex items-center gap-1 rounded-md bg-[#2E6B4A]/10 px-2.5 py-1 text-[11px] font-bold text-[#2E6B4A] hover:bg-[#2E6B4A]/20"
                          >
                            <Eye className="h-3 w-3" />
                            Photo
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#9A9A9A]">Manual</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenEdit(r)}
                          className="rounded-md p-1.5 text-[#6B6B6B] hover:bg-[#DDD2B4]/40 hover:text-[#2C2C2C]"
                          title="Correct reading (Workflow D)"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: WORKFLOW D - CORRECT EB READING WITH AUDIT LOG & RECALCULATION */}
      {editingReading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDD2B4] pb-3">
              <div>
                <span className="text-[10px] font-bold tracking-wider text-[#2E6B4A] uppercase">
                  Workflow D · Audit-Protected Edit
                </span>
                <h3 className="font-heading text-base font-bold text-[#2C2C2C]">
                  Correct Meter Reading ({editingReading.month}/{editingReading.year})
                </h3>
              </div>
              <button
                onClick={() => setEditingReading(null)}
                className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#DDD2B4]/40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCorrection} className="mt-4 space-y-4">
              <div className="rounded-xl border border-[#DDD2B4] bg-white p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#6B6B6B]">Previous Reading:</span>
                  <span className="font-mono-numbers font-bold text-[#2C2C2C]">
                    {editingReading.previous_reading} kWh
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-[#6B6B6B]">Original Recorded Reading:</span>
                  <span className="font-mono-numbers font-bold text-[#6B6B6B]">
                    {editingReading.current_reading} kWh
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">
                  Corrected Reading (kWh) *
                </label>
                <input
                  type="number"
                  step="any"
                  value={correctedValue}
                  onChange={(e) => setCorrectedValue(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs font-mono-numbers font-bold text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>

              {/* Recalculated Units */}
              <div className="rounded-lg bg-[#FAF6ED] p-2.5 text-xs">
                <span className="text-[#6B6B6B]">Recalculated Units Consumed:</span>{' '}
                <strong className="font-mono-numbers text-[#2E6B4A]">
                  {Math.max(0, Number((correctedValue - editingReading.previous_reading).toFixed(2)))} units
                </strong>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">
                  Correction Reason (Mandatory for audit trail) *
                </label>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g. OCR misread digit 8 as 0; verified from physical meter."
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white p-2.5 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#DDD2B4] pt-4">
                <button
                  type="button"
                  onClick={() => setEditingReading(null)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[#6B6B6B] hover:text-[#2C2C2C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#2E6B4A] px-5 py-2 text-xs font-bold text-white hover:bg-[#3F7F5C]"
                >
                  Save & Recalculate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
