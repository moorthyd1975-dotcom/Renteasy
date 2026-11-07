import React, { useState, useEffect } from 'react';
import {
  User,
  Home,
  Sparkles,
  Trash2,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Database,
  Download,
} from 'lucide-react';
import { db } from '../services/db';
import { SUPABASE_URL, STORAGE_BUCKET, testSupabaseConnection } from '../services/supabase';
import schemaSql from '../../supabase/schema.sql?raw';

interface SettingsModuleProps {
  onRefresh: () => void;
}

export const SettingsModule: React.FC<SettingsModuleProps> = ({ onRefresh }) => {
  const currentOwner = db.getOwner();
  const houses = db.getHouses();
  const tenants = db.getTenants();

  // Owner form state
  const [ownerName, setOwnerName] = useState(currentOwner.name);
  const [ownerPhone, setOwnerPhone] = useState(currentOwner.phone);
  const [ownerEmail, setOwnerEmail] = useState(currentOwner.email);
  const [compoundName, setCompoundName] = useState(currentOwner.compound_name);
  const [ebUnitRate, setEbUnitRate] = useState<number | string>(currentOwner.eb_unit_rate);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Supabase Integration state
  const [supabaseTesting, setSupabaseTesting] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    connected: boolean;
    tablesFound: boolean;
    bucketFound: boolean;
    message: string;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    setSupabaseTesting(true);
    const result = await testSupabaseConnection();
    setSupabaseStatus(result);
    setSupabaseTesting(false);
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(schemaSql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    } catch {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    }
  };

  const handleSyncFromSupabase = async () => {
    setSyncingCloud(true);
    setCloudNotice(null);
    const ok = await db.syncFromSupabase();
    setSyncingCloud(false);
    if (ok) {
      setCloudNotice('Synchronized all records from Supabase!');
      onRefresh();
    } else {
      setCloudNotice('Supabase tables not yet found or empty. Click "Copy Supabase SQL Setup" to run schema migration in Supabase SQL editor.');
    }
    setTimeout(() => setCloudNotice(null), 5000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedRate = Number(ebUnitRate);
    if (isNaN(parsedRate) || parsedRate < 0) {
      setFormError('Electricity unit rate must be a non-negative number.');
      return;
    }

    const roundedRate = Math.round(parsedRate * 100) / 100;

    setSavingProfile(true);
    try {
      await db.setOwner({
        ...currentOwner,
        name: ownerName.trim(),
        phone: ownerPhone.trim(),
        email: ownerEmail.trim(),
        compound_name: compoundName.trim(),
        eb_unit_rate: roundedRate,
      });
      setEbUnitRate(roundedRate);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
      onRefresh();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to update owner profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleExportDataJSON = () => {
    const backup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      owner: db.getOwner(),
      houses: db.getHouses(),
      tenants: db.getTenants(),
      tenancyHistory: db.getTenancyHistory(),
      meters: db.getMeters(),
      meterReadings: db.getMeterReadings(),
      meterEvidence: db.getAllMeterEvidence(),
      rentPayments: db.getRentPayments(),
      rentEvidence: db.getAllRentEvidence(),
      auditLogs: db.getAuditLogs(),
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RentEase_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetClean = async () => {
    if (confirm('Are you sure you want to clear all data and start completely fresh? This will delete all your houses, tenants, readings, and rent records in Supabase.')) {
      setClearing(true);
      try {
        await db.clearAllData();
        onRefresh();
      } finally {
        setClearing(false);
      }
    }
  };

  const handleSeedDemo = async () => {
    if (confirm('Load 4-portion realistic demo compound? This will populate sample houses, active tenants, payments, and meter readings in Supabase.')) {
      setSeeding(true);
      try {
        await db.seedSampleCompound();
        onRefresh();
      } finally {
        setSeeding(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-heading text-lg font-bold text-[#2C2C2C] sm:text-xl">
          Compound & Owner Settings
        </h2>
        <p className="text-xs text-[#6B6B6B]">
          Manage your property details, default electricity rates, and Supabase cloud ledger.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 spans): Owner & Compound Profile */}
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-6 shadow-xs lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-[#DDD2B4] pb-3">
            <User className="h-5 w-5 text-[#2E6B4A]" />
            <h3 className="font-heading text-sm font-bold text-[#2C2C2C]">
              Owner Profile & Property Details
            </h3>
          </div>

          <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
            {formError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                {formError}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-[#2C2C2C]">
                Compound / Property Name
              </label>
              <input
                type="text"
                value={compoundName}
                onChange={(e) => setCompoundName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                placeholder="e.g. Shanti Nilayam Compound"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">Owner Full Name</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">Phone Number</label>
                <input
                  type="text"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">Email Address</label>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">
                  Default EB Unit Rate (₹ per kWh)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ebUnitRate}
                  onChange={(e) => setEbUnitRate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs font-mono-numbers text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
                <span className="mt-0.5 block text-[10px] text-[#6B6B6B]">
                  Applied to newly calculated electricity charges (up to 2 decimals)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#DDD2B4] bg-[#F7F3E8] p-3 text-xs text-[#6B6B6B]">
                <span>Default Currency:</span>
                <strong className="block text-sm text-[#2C2C2C]">INR (₹) - Indian Rupee</strong>
              </div>
              <div className="rounded-xl border border-[#DDD2B4] bg-[#F7F3E8] p-3 text-xs text-[#6B6B6B]">
                <span>Application Timezone:</span>
                <strong className="block text-sm text-[#2C2C2C]">Asia/Kolkata (IST)</strong>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {profileSaved && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-[#2E6B4A]">
                  <CheckCircle2 className="h-4 w-4" />
                  Profile settings saved!
                </span>
              )}
              <button
                type="submit"
                disabled={savingProfile}
                className="ml-auto rounded-xl bg-[#2E6B4A] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#3F7F5C] disabled:opacity-60 cursor-pointer"
              >
                {savingProfile ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Compound Quick Summary & Storage Status */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-[#DDD2B4] pb-3">
              <Home className="h-5 w-5 text-[#2E6B4A]" />
              <h3 className="font-heading text-sm font-bold text-[#2C2C2C]">
                Compound Summary
              </h3>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between border-b border-[#DDD2B4]/40 pb-2">
                <span className="text-[#6B6B6B]">Total Portions / Houses:</span>
                <strong className="font-mono-numbers text-[#2C2C2C]">{houses.length}</strong>
              </div>
              <div className="flex justify-between border-b border-[#DDD2B4]/40 pb-2">
                <span className="text-[#6B6B6B]">Active Tenants:</span>
                <strong className="font-mono-numbers text-[#2E6B4A]">{tenants.length}</strong>
              </div>
              <div className="flex justify-between border-b border-[#DDD2B4]/40 pb-2">
                <span className="text-[#6B6B6B]">Scheduled Monthly Rent:</span>
                <strong className="font-mono-numbers text-[#2C2C2C]">
                  ₹{houses.reduce((acc, h) => acc + h.monthly_rent, 0).toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B6B6B]">Storage Type:</span>
                <strong className="text-[#2E6B4A]">Supabase Cloud Storage (Private)</strong>
              </div>
            </div>
          </div>

          {/* Supabase Cloud Database & Storage Status */}
          <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#DDD2B4] pb-3">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-[#2E6B4A]" />
                <h3 className="font-heading text-sm font-bold text-[#2C2C2C]">
                  Supabase Cloud Database
                </h3>
              </div>
              <button
                type="button"
                onClick={checkConnection}
                disabled={supabaseTesting}
                title="Test Supabase connection"
                className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#DDD2B4]/40 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${supabaseTesting ? 'animate-spin text-[#2E6B4A]' : ''}`} />
              </button>
            </div>

            <div className="mt-3 space-y-2.5 text-xs">
              <div className="rounded-lg border border-[#DDD2B4] bg-white p-2.5 font-mono text-[11px] text-[#2C2C2C] truncate">
                <span className="block text-[10px] uppercase font-sans font-semibold text-[#6B6B6B]">Project Endpoint:</span>
                {SUPABASE_URL}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#6B6B6B]">Status:</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-[#2E6B4A]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {supabaseStatus?.connected ? 'Connected' : 'Active'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#6B6B6B]">Storage Bucket:</span>
                <span className="font-mono text-[#2C2C2C]">{STORAGE_BUCKET}</span>
              </div>

              {cloudNotice && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-[11px] text-[#2E6B4A] font-medium">
                  {cloudNotice}
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#2E6B4A] bg-[#2E6B4A] px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#3F7F5C] cursor-pointer"
                >
                  {copiedSql ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedSql ? 'SQL Script Copied!' : 'Copy Supabase SQL Setup'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncFromSupabase}
                  disabled={syncingCloud}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#DDD2B4] bg-white px-2 py-2 text-xs font-bold text-[#2C2C2C] hover:bg-[#FAF6ED] disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
                  <span>{syncingCloud ? 'Syncing...' : 'Sync Now with Supabase'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management, Export & Reset */}
      <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-6 shadow-xs">
        <h3 className="font-heading text-sm font-bold text-[#2C2C2C]">
          Data Management & Ledger Backup
        </h3>
        <p className="mt-0.5 text-xs text-[#6B6B6B]">
          Export a complete copy of your rental records or reset your compound database.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportDataJSON}
            className="flex items-center gap-2 rounded-xl border border-[#DDD2B4] bg-white px-4 py-2.5 text-xs font-bold text-[#2C2C2C] shadow-xs hover:bg-[#FAF6ED] cursor-pointer"
          >
            <Download className="h-4 w-4 text-[#2E6B4A]" />
            Download Complete Ledger Backup (JSON)
          </button>

          <button
            onClick={handleSeedDemo}
            disabled={seeding}
            className="flex items-center gap-2 rounded-xl border border-[#DDD2B4] bg-white px-4 py-2.5 text-xs font-bold text-[#2E6B4A] shadow-xs hover:bg-[#FAF6ED] disabled:opacity-60 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>{seeding ? 'Seeding Compound...' : 'Seed Sample Compound (4 Portions)'}</span>
          </button>

          <button
            onClick={handleResetClean}
            disabled={clearing}
            className="flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-xs font-bold text-rose-700 shadow-xs hover:bg-rose-50 disabled:opacity-60 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            <span>{clearing ? 'Clearing Data...' : 'Reset to Clean Blank State'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
