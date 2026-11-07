/**
 * RentEase Unified Storage & Database Engine
 * Source of truth: Supabase PostgreSQL & Storage
 * Features:
 * - Real Supabase Authentication integration (Owner ID = auth.uid())
 * - In-memory cache hydrated on login, window focus, and manual sync
 * - Complete cloud replacement on sync (including empty results)
 * - All mutations fully async, awaited, and checked for errors
 * - Random UUIDs for all entity IDs (crypto.randomUUID())
 * - Snapshot unit_rate and eb_amount calculations
 * - Multi-evidence support with latest by captured_at
 */

import {
  Owner,
  House,
  Tenant,
  TenancyHistory,
  Meter,
  MeterReading,
  MeterEvidence,
  RentPayment,
  RentEvidence,
  EBPayment,
  AuditLog,
} from '../types';
import { supabase, isSupabaseConfigured, uploadEvidenceToStorage } from './supabase';

type ToastListener = (message: string, type: 'error' | 'success') => void;

class RentEaseDB {
  private isSyncing = false;
  private currentOwner: Owner | null = null;

  // In-memory cache for fast synchronous UI reads
  private houses: House[] = [];
  private tenants: Tenant[] = [];
  private tenancyHistory: TenancyHistory[] = [];
  private meters: Meter[] = [];
  private meterReadings: MeterReading[] = [];
  private meterEvidence: MeterEvidence[] = [];
  private rentPayments: RentPayment[] = [];
  private rentEvidence: RentEvidence[] = [];
  private ebPayments: EBPayment[] = [];
  private auditLogs: AuditLog[] = [];

  private syncListeners: Array<() => void> = [];
  private toastListeners: Array<ToastListener> = [];

  // Track month checks to avoid repeating ensureRentRecords in same session
  private verifiedRentMonths = new Set<string>();

  constructor() {
    // Listen to window focus to re-hydrate cloud data automatically
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        if (this.currentOwner) {
          this.syncFromSupabase().catch((err) =>
            console.warn('Window focus re-hydration notice:', err?.message)
          );
        }
      });
    }
  }

  public subscribe(listener: () => void) {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  public onToast(listener: ToastListener) {
    this.toastListeners.push(listener);
    return () => {
      this.toastListeners = this.toastListeners.filter((l) => l !== listener);
    };
  }

  public showToast(message: string, type: 'error' | 'success' = 'error') {
    this.toastListeners.forEach((l) => {
      try {
        l(message, type);
      } catch (e) {
        console.error('Toast listener error:', e);
      }
    });
  }

  private notify() {
    this.syncListeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        console.error('Sync listener error:', e);
      }
    });
  }

  private clearMemoryCache() {
    this.houses = [];
    this.tenants = [];
    this.tenancyHistory = [];
    this.meters = [];
    this.meterReadings = [];
    this.meterEvidence = [];
    this.rentPayments = [];
    this.rentEvidence = [];
    this.ebPayments = [];
    this.auditLogs = [];
    this.verifiedRentMonths.clear();
  }

  // --- SUPABASE CLOUD SYNCHRONIZATION ---

  /**
   * Pulls all records from Supabase PostgreSQL tables into the in-memory cache.
   * RLS automatically isolates data to the authenticated owner (auth.uid()::text).
   * Note: Completely replaces in-memory cache, including empty arrays.
   */
  public async syncFromSupabase(): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    if (this.isSyncing) return false;
    this.isSyncing = true;

    try {
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();

      if (sessionErr || !session?.user) {
        this.currentOwner = null;
        this.clearMemoryCache();
        this.notify();
        return false;
      }

      const userId = session.user.id;

      // 1. Fetch authenticated owner record
      const { data: ownerData, error: ownerErr } = await supabase
        .from('owners')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (ownerErr && ownerErr.code !== 'PGRST116') {
        console.warn('Supabase owner fetch error:', ownerErr.message);
      }

      if (ownerData) {
        this.currentOwner = ownerData;
      } else {
        // Fallback owner profile initialized from user metadata
        const metadata = session.user.user_metadata || {};
        const fallbackOwner: Owner = {
          id: userId,
          email: session.user.email || '',
          name: metadata.name || session.user.email?.split('@')[0] || 'Compound Owner',
          phone: metadata.phone || '',
          compound_name: metadata.compound_name || 'My Compound',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          eb_unit_rate: 8.5,
          created_at: new Date().toISOString(),
        };

        // Attempt upsert to ensure public.owners exists
        const { data: createdOwner, error: createOwnerErr } = await supabase
          .from('owners')
          .upsert(fallbackOwner)
          .select()
          .maybeSingle();

        this.currentOwner = (!createOwnerErr && createdOwner) ? createdOwner : fallbackOwner;
      }

      // 2. Fetch all modules in parallel (RLS filters to current user's records)
      const [
        housesRes,
        tenantsRes,
        tenancyRes,
        metersRes,
        readingsRes,
        meterEvRes,
        paymentsRes,
        rentEvRes,
        ebRes,
        logsRes,
      ] = await Promise.all([
        supabase.from('houses').select('*'),
        supabase.from('tenants').select('*'),
        supabase.from('tenancy_history').select('*'),
        supabase.from('meters').select('*'),
        supabase.from('meter_readings').select('*'),
        supabase.from('meter_evidence').select('*'),
        supabase.from('rent_payments').select('*'),
        supabase.from('rent_evidence').select('*'),
        supabase.from('eb_payments').select('*'),
        supabase.from('audit_logs').select('*'),
      ]);

      // Check for errors on core tables
      if (housesRes.error) console.warn('Houses sync notice:', housesRes.error.message);
      if (tenantsRes.error) console.warn('Tenants sync notice:', tenantsRes.error.message);

      // REPLACE cache contents with cloud result, including empty results
      this.houses = housesRes.data || [];
      this.tenants = tenantsRes.data || [];
      this.tenancyHistory = tenancyRes.data || [];
      this.meters = metersRes.data || [];
      this.meterReadings = readingsRes.data || [];
      this.meterEvidence = meterEvRes.data || [];
      this.rentPayments = paymentsRes.data || [];
      this.rentEvidence = rentEvRes.data || [];
      this.ebPayments = ebRes.data || [];
      this.auditLogs = logsRes.data || [];

      this.notify();
      return true;
    } catch (err: any) {
      console.warn('Sync from Supabase error:', err?.message);
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  // --- AUTHENTICATION & SESSION MANAGEMENT ---

  public getCurrentUser(): Owner | null {
    return this.currentOwner;
  }

  public getOwner(): Owner {
    if (this.currentOwner) return this.currentOwner;
    return {
      id: '',
      email: '',
      name: 'Guest Owner',
      phone: '',
      compound_name: 'My Compound',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      eb_unit_rate: 8.5,
      created_at: new Date().toISOString(),
    };
  }

  public async setOwner(ownerData: Partial<Owner>): Promise<Owner> {
    if (!this.currentOwner) throw new Error('No authenticated owner session');

    const updated: Owner = {
      ...this.currentOwner,
      ...ownerData,
      id: this.currentOwner.id,
    };

    const previous = { ...this.currentOwner };
    this.currentOwner = updated;
    this.notify();

    const { error } = await supabase
      .from('owners')
      .upsert({
        id: updated.id,
        email: updated.email,
        name: updated.name,
        phone: updated.phone || null,
        compound_name: updated.compound_name,
        currency: updated.currency || 'INR',
        timezone: updated.timezone || 'Asia/Kolkata',
        eb_unit_rate: updated.eb_unit_rate,
      });

    if (error) {
      this.currentOwner = previous;
      this.notify();
      this.showToast(`Failed to update owner profile: ${error.message}`);
      throw new Error(error.message);
    }

    await this.addAuditLog(
      'owner',
      updated.id,
      'update',
      `Updated compound profile: ${updated.compound_name} (EB Rate: ₹${updated.eb_unit_rate}/unit)`
    );

    return updated;
  }

  public async logout(): Promise<void> {
    const ownerId = this.currentOwner?.id;
    if (ownerId) {
      await this.addAuditLog('owner', ownerId, 'update', 'Owner signed out.').catch(() => {});
    }

    await supabase.auth.signOut();
    this.currentOwner = null;
    this.clearMemoryCache();

    // Clear legacy local storage keys for shared-device privacy
    this.discardLegacyLocalStorage();
    this.notify();
  }

  // --- AUDIT LOGS ---

  public async addAuditLog(
    entity_type: AuditLog['entity_type'],
    entity_id: string,
    action: AuditLog['action'],
    details: string
  ): Promise<void> {
    const ownerId = this.currentOwner?.id;
    if (!ownerId) return;

    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      owner_id: ownerId,
      entity_type,
      entity_id,
      action,
      details,
      timestamp: new Date().toISOString(),
    };

    this.auditLogs.unshift(newLog);
    if (this.auditLogs.length > 200) {
      this.auditLogs = this.auditLogs.slice(0, 200);
    }
    this.notify();

    const { error } = await supabase.from('audit_logs').insert(newLog);
    if (error && error.code !== 'PGRST205') {
      console.warn('Audit log write error:', error.message);
    }
  }

  public getAuditLogs(): AuditLog[] {
    return [...this.auditLogs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // --- HOUSES (PORTIONS) ---

  public getHouses(): House[] {
    if (!this.currentOwner) return [];
    return [...this.houses].sort((a, b) => a.house_number.localeCompare(b.house_number));
  }

  public getHouse(id: string): House | undefined {
    return this.houses.find((h) => h.id === id);
  }

  public async saveHouse(houseInput: Partial<House> & { name: string; house_number: string }): Promise<House> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    const houseId = houseInput.id || crypto.randomUUID();
    const house: House = {
      id: houseId,
      owner_id: this.currentOwner.id,
      name: houseInput.name.trim(),
      house_number: houseInput.house_number.trim(),
      monthly_rent: Number(houseInput.monthly_rent || 0),
      move_in_date: houseInput.move_in_date || new Date().toISOString().split('T')[0],
      description: houseInput.description || '',
      eb_responsibility: houseInput.eb_responsibility || 'owner',
      eb_responsibility_effective_date:
        houseInput.eb_responsibility_effective_date || new Date().toISOString().split('T')[0],
      is_active: houseInput.is_active !== false,
      created_at: houseInput.created_at || new Date().toISOString(),
    };

    // Optimistic cache update
    const previous = [...this.houses];
    const index = this.houses.findIndex((h) => h.id === house.id);
    const isNew = index < 0;

    if (isNew) {
      this.houses.push(house);
    } else {
      this.houses[index] = house;
    }
    this.notify();

    const { error } = await supabase.from('houses').upsert({
      id: house.id,
      owner_id: house.owner_id,
      name: house.name,
      house_number: house.house_number,
      monthly_rent: house.monthly_rent,
      move_in_date: house.move_in_date,
      description: house.description || null,
      eb_responsibility: house.eb_responsibility,
      eb_responsibility_effective_date: house.eb_responsibility_effective_date || null,
      is_active: house.is_active,
      created_at: house.created_at,
    });

    if (error) {
      this.houses = previous;
      this.notify();
      this.showToast(`Failed to save house: ${error.message}`);
      throw new Error(error.message);
    }

    await this.addAuditLog(
      'house',
      house.id,
      isNew ? 'create' : 'update',
      `${isNew ? 'Created' : 'Updated'} house portion: ${house.house_number} (${house.name})`
    );

    return house;
  }

  public async deleteHouse(id: string): Promise<boolean> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    const previousHouses = [...this.houses];
    const previousMeters = [...this.meters];
    const previousTenancy = [...this.tenancyHistory];

    this.houses = this.houses.filter((h) => h.id !== id);
    this.meters = this.meters.filter((m) => m.house_id !== id);
    this.tenancyHistory = this.tenancyHistory.filter((th) => th.house_id !== id);
    this.notify();

    const { error } = await supabase.from('houses').delete().eq('id', id);

    if (error) {
      this.houses = previousHouses;
      this.meters = previousMeters;
      this.tenancyHistory = previousTenancy;
      this.notify();
      this.showToast(`Failed to delete house portion: ${error.message}`);
      throw new Error(error.message);
    }

    await this.addAuditLog('house', id, 'archive', `Deleted house portion ID: ${id}`);
    return true;
  }

  // --- TENANTS ---

  public getTenants(): Tenant[] {
    if (!this.currentOwner) return [];
    return [...this.tenants].sort((a, b) => a.name.localeCompare(b.name));
  }

  public getTenant(id: string): Tenant | undefined {
    return this.tenants.find((t) => t.id === id);
  }

  public async saveTenant(tenantInput: Partial<Tenant> & { name: string; phone: string }): Promise<Tenant> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    const tenantId = tenantInput.id || crypto.randomUUID();
    const tenant: Tenant = {
      id: tenantId,
      owner_id: this.currentOwner.id,
      name: tenantInput.name.trim(),
      phone: tenantInput.phone.trim(),
      email: tenantInput.email?.trim() || undefined,
      id_proof_number: tenantInput.id_proof_number?.trim() || undefined,
      status: tenantInput.status || 'active',
      created_at: tenantInput.created_at || new Date().toISOString(),
    };

    const previous = [...this.tenants];
    const index = this.tenants.findIndex((t) => t.id === tenant.id);
    const isNew = index < 0;

    if (isNew) {
      this.tenants.push(tenant);
    } else {
      this.tenants[index] = tenant;
    }
    this.notify();

    const { error } = await supabase.from('tenants').upsert({
      id: tenant.id,
      owner_id: tenant.owner_id,
      name: tenant.name,
      phone: tenant.phone,
      email: tenant.email || null,
      id_proof_number: tenant.id_proof_number || null,
      status: tenant.status,
      created_at: tenant.created_at,
    });

    if (error) {
      this.tenants = previous;
      this.notify();
      this.showToast(`Failed to save tenant: ${error.message}`);
      throw new Error(error.message);
    }

    await this.addAuditLog(
      'tenant',
      tenant.id,
      isNew ? 'create' : 'update',
      `${isNew ? 'Added' : 'Updated'} tenant: ${tenant.name}`
    );

    return tenant;
  }

  // --- TENANCY HISTORY ---

  public getTenancyHistory(houseId?: string, tenantId?: string): TenancyHistory[] {
    if (!this.currentOwner) return [];
    let list = [...this.tenancyHistory];
    if (houseId) list = list.filter((th) => th.house_id === houseId);
    if (tenantId) list = list.filter((th) => th.tenant_id === tenantId);
    return list.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  }

  public getCurrentTenancy(houseId: string): TenancyHistory | undefined {
    return this.getTenancyHistory(houseId).find((th) => th.is_current);
  }

  public async assignTenant(
    houseId: string,
    tenantId: string,
    monthlyRent: number,
    startDate: string,
    depositAmount = 0,
    notes?: string
  ): Promise<TenancyHistory> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    const previousHistory = [...this.tenancyHistory];

    // 1. End any active prior tenancy for this house - MUST BE AWAITED
    const activePrior = this.tenancyHistory.find((th) => th.house_id === houseId && th.is_current);
    if (activePrior) {
      const { error: endPriorErr } = await supabase
        .from('tenancy_history')
        .update({ is_current: false, end_date: startDate })
        .eq('id', activePrior.id);

      if (endPriorErr) {
        this.showToast(`Failed to update prior tenancy: ${endPriorErr.message}`);
        throw new Error(endPriorErr.message);
      }

      activePrior.is_current = false;
      activePrior.end_date = startDate;
    }

    // 2. Create and insert new tenancy record
    const newTenancy: TenancyHistory = {
      id: crypto.randomUUID(),
      house_id: houseId,
      tenant_id: tenantId,
      start_date: startDate,
      monthly_rent_agreed: monthlyRent,
      deposit_amount: depositAmount || 0,
      is_current: true,
      notes: notes || undefined,
      created_at: new Date().toISOString(),
    };

    this.tenancyHistory.push(newTenancy);
    this.notify();

    const { error: insertErr } = await supabase.from('tenancy_history').insert({
      id: newTenancy.id,
      house_id: newTenancy.house_id,
      tenant_id: newTenancy.tenant_id,
      start_date: newTenancy.start_date,
      end_date: null,
      monthly_rent_agreed: newTenancy.monthly_rent_agreed,
      deposit_amount: newTenancy.deposit_amount || 0,
      is_current: true,
      notes: newTenancy.notes || null,
      created_at: newTenancy.created_at,
    });

    if (insertErr) {
      this.tenancyHistory = previousHistory;
      this.notify();
      this.showToast(`Failed to assign tenancy: ${insertErr.message}`);
      throw new Error(insertErr.message);
    }

    const house = this.getHouse(houseId);
    const tenant = this.getTenant(tenantId);
    await this.addAuditLog(
      'tenancy',
      newTenancy.id,
      'create',
      `Assigned tenant ${tenant?.name || tenantId} to ${house?.house_number || houseId} at ₹${monthlyRent.toLocaleString('en-IN')}/mo`
    );

    return newTenancy;
  }

  public async endTenancy(tenancyId: string, endDate: string): Promise<boolean> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    const target = this.tenancyHistory.find((th) => th.id === tenancyId);
    if (!target) return false;

    const previousStatus = target.is_current;
    const previousEndDate = target.end_date;

    target.is_current = false;
    target.end_date = endDate;
    this.notify();

    const { error } = await supabase
      .from('tenancy_history')
      .update({ is_current: false, end_date: endDate })
      .eq('id', tenancyId);

    if (error) {
      target.is_current = previousStatus;
      target.end_date = previousEndDate;
      this.notify();
      this.showToast(`Failed to end tenancy: ${error.message}`);
      throw new Error(error.message);
    }

    await this.addAuditLog('tenancy', tenancyId, 'update', `Ended tenancy on ${endDate}`);
    return true;
  }

  // --- METERS ---

  public getMeters(houseId?: string): Meter[] {
    if (!this.currentOwner) return [];
    let list = [...this.meters];
    if (houseId) list = list.filter((m) => m.house_id === houseId);
    return list;
  }

  public getMeter(id: string): Meter | undefined {
    return this.meters.find((m) => m.id === id);
  }

  public async saveMeter(meterInput: Partial<Meter> & { house_id: string; meter_name: string }): Promise<Meter> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    const meterId = meterInput.id || crypto.randomUUID();
    const meter: Meter = {
      id: meterId,
      house_id: meterInput.house_id,
      meter_name: meterInput.meter_name.trim(),
      reference_photo_url: meterInput.reference_photo_url,
      created_at: meterInput.created_at || new Date().toISOString(),
    };

    const previous = [...this.meters];
    const index = this.meters.findIndex((m) => m.id === meter.id);
    const isNew = index < 0;

    if (isNew) {
      this.meters.push(meter);
    } else {
      this.meters[index] = meter;
    }
    this.notify();

    const { error } = await supabase.from('meters').upsert({
      id: meter.id,
      house_id: meter.house_id,
      meter_name: meter.meter_name,
      reference_photo_url: meter.reference_photo_url || null,
      created_at: meter.created_at,
    });

    if (error) {
      this.meters = previous;
      this.notify();
      this.showToast(`Failed to save meter: ${error.message}`);
      throw new Error(error.message);
    }

    await this.addAuditLog(
      'meter_reading',
      meter.id,
      isNew ? 'create' : 'update',
      `${isNew ? 'Registered' : 'Updated'} meter: ${meter.meter_name}`
    );

    return meter;
  }

  // --- METER READINGS & EVIDENCE ---

  public getMeterReadings(houseId?: string, meterId?: string): MeterReading[] {
    if (!this.currentOwner) return [];
    let list = [...this.meterReadings];
    if (houseId) list = list.filter((r) => r.house_id === houseId);
    if (meterId) list = list.filter((r) => r.meter_id === meterId);
    return list.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
  }

  public getLastMeterReading(meterId: string): MeterReading | undefined {
    const list = this.getMeterReadings(undefined, meterId);
    return list[0]; // sorted latest month/year first
  }

  /**
   * Returns latest meter evidence for a reading by captured_at
   */
  public getMeterEvidence(readingId: string): MeterEvidence | undefined {
    const evidences = this.meterEvidence.filter((e) => e.reading_id === readingId);
    if (evidences.length === 0) return undefined;
    return evidences.sort(
      (a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
    )[0];
  }

  public getAllMeterEvidence(): MeterEvidence[] {
    return [...this.meterEvidence];
  }

  /**
   * Records a meter reading with automatic upsert (DB has UNIQUE(meter_id, month, year))
   * Snapshots current owner eb_unit_rate and computes eb_amount = ROUND(units * rate, 2)
   */
  public async recordMeterReading(
    readingData: Omit<MeterReading, 'id' | 'created_at' | 'units_consumed'>,
    evidenceData: Omit<MeterEvidence, 'id' | 'reading_id'>
  ): Promise<{ reading: MeterReading; evidence: MeterEvidence }> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    // 1. Upload image to private storage if not already a storage path
    let storagePath = evidenceData.image_url;
    if (storagePath && (storagePath.startsWith('data:') || storagePath.startsWith('blob:'))) {
      storagePath = await uploadEvidenceToStorage(
        evidenceData.image_url,
        'meter',
        `reading-${readingData.meter_id}-${readingData.month}-${readingData.year}`
      );
    }

    const units_consumed = Math.max(
      0,
      Number((readingData.current_reading - readingData.previous_reading).toFixed(2))
    );

    // Snapshot owner rate
    const unitRate = Number(this.currentOwner.eb_unit_rate || 8.5);
    const ebAmount = Math.round(units_consumed * unitRate * 100) / 100;

    // Check if reading for same meter, month, and year already exists
    const existingIndex = this.meterReadings.findIndex(
      (r) =>
        r.meter_id === readingData.meter_id &&
        r.month === readingData.month &&
        r.year === readingData.year
    );

    let readingId: string;
    let isCorrection = false;
    let originalReadingVal: number | undefined;

    if (existingIndex >= 0) {
      const existing = this.meterReadings[existingIndex];
      readingId = existing.id;
      isCorrection = true;
      originalReadingVal = existing.original_reading ?? existing.current_reading;
    } else {
      readingId = crypto.randomUUID();
    }

    const finalReading: MeterReading = {
      ...readingData,
      id: readingId,
      units_consumed,
      unit_rate: unitRate,
      eb_amount: ebAmount,
      is_corrected: isCorrection || readingData.is_corrected,
      correction_reason: isCorrection
        ? readingData.correction_reason || 'Re-recorded meter photo'
        : readingData.correction_reason,
      original_reading: originalReadingVal,
      created_at:
        existingIndex >= 0 ? this.meterReadings[existingIndex].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const newEvidence: MeterEvidence = {
      ...evidenceData,
      id: crypto.randomUUID(),
      reading_id: readingId,
      image_url: storagePath,
      captured_at: new Date().toISOString(),
    };

    const prevReadings = [...this.meterReadings];
    const prevEvidence = [...this.meterEvidence];

    if (existingIndex >= 0) {
      this.meterReadings[existingIndex] = finalReading;
    } else {
      this.meterReadings.unshift(finalReading);
    }
    this.meterEvidence.unshift(newEvidence);
    this.notify();

    // Persist reading in Supabase
    const { error: readingErr } = await supabase.from('meter_readings').upsert({
      id: finalReading.id,
      house_id: finalReading.house_id,
      meter_id: finalReading.meter_id,
      tenant_id: finalReading.tenant_id,
      month: finalReading.month,
      year: finalReading.year,
      previous_reading: finalReading.previous_reading,
      current_reading: finalReading.current_reading,
      units_consumed: finalReading.units_consumed,
      unit_rate: finalReading.unit_rate,
      eb_amount: finalReading.eb_amount,
      reading_date: finalReading.reading_date,
      is_corrected: finalReading.is_corrected,
      correction_reason: finalReading.correction_reason || null,
      original_reading: finalReading.original_reading || null,
      created_at: finalReading.created_at,
      updated_at: finalReading.updated_at,
    });

    if (readingErr) {
      this.meterReadings = prevReadings;
      this.meterEvidence = prevEvidence;
      this.notify();
      this.showToast(`Failed to record reading: ${readingErr.message}`);
      throw new Error(readingErr.message);
    }

    // Persist evidence in Supabase
    const { error: evidenceErr } = await supabase.from('meter_evidence').insert({
      id: newEvidence.id,
      reading_id: newEvidence.reading_id,
      image_url: newEvidence.image_url,
      extracted_reading: newEvidence.extracted_reading || null,
      confirmed_reading: newEvidence.confirmed_reading,
      blur_score: newEvidence.blur_score || null,
      ocr_confidence: newEvidence.ocr_confidence || null,
      verification_status: newEvidence.verification_status,
      notes: newEvidence.notes || null,
      captured_at: newEvidence.captured_at,
    });

    if (evidenceErr) {
      console.warn('Meter evidence insert notice:', evidenceErr.message);
    }

    const house = this.getHouse(finalReading.house_id);
    await this.addAuditLog(
      'meter_reading',
      readingId,
      isCorrection ? 'correct' : 'create',
      `Recorded reading for ${house?.house_number || 'House'}: ${finalReading.current_reading} kWh. Consumed: ${units_consumed} units (₹${ebAmount})`
    );

    return { reading: finalReading, evidence: newEvidence };
  }

  /**
   * Corrects a meter reading and cascades updates to the next sequential reading.
   * Both queries are explicitly awaited in order.
   */
  public async correctMeterReading(
    readingId: string,
    correctedReading: number,
    reason: string
  ): Promise<MeterReading | null> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    const index = this.meterReadings.findIndex((r) => r.id === readingId);
    if (index === -1) return null;

    const target = this.meterReadings[index];
    const oldVal = target.current_reading;
    const oldPrev = target.previous_reading;

    const units_consumed = Math.max(0, Number((correctedReading - oldPrev).toFixed(2)));
    const unitRate = Number(target.unit_rate || this.currentOwner.eb_unit_rate || 8.5);
    const ebAmount = Math.round(units_consumed * unitRate * 100) / 100;

    const updatedTarget: MeterReading = {
      ...target,
      original_reading: target.original_reading ?? oldVal,
      current_reading: correctedReading,
      units_consumed,
      eb_amount: ebAmount,
      is_corrected: true,
      correction_reason: reason,
      updated_at: new Date().toISOString(),
    };

    this.meterReadings[index] = updatedTarget;

    // 1. Await main reading correction in Supabase
    const { error: mainErr } = await supabase
      .from('meter_readings')
      .update({
        current_reading: updatedTarget.current_reading,
        units_consumed: updatedTarget.units_consumed,
        eb_amount: updatedTarget.eb_amount,
        original_reading: updatedTarget.original_reading,
        is_corrected: true,
        correction_reason: reason,
        updated_at: updatedTarget.updated_at,
      })
      .eq('id', readingId);

    if (mainErr) {
      this.showToast(`Failed to update reading: ${mainErr.message}`);
      throw new Error(mainErr.message);
    }

    // 2. Cascade next reading update for the same meter - AWAITED
    const nextReading = this.meterReadings.find(
      (r) => r.meter_id === target.meter_id && r.previous_reading === oldVal
    );

    if (nextReading) {
      const nextUnits = Math.max(0, Number((nextReading.current_reading - correctedReading).toFixed(2)));
      const nextRate = Number(nextReading.unit_rate || this.currentOwner.eb_unit_rate || 8.5);
      const nextEbAmount = Math.round(nextUnits * nextRate * 100) / 100;

      nextReading.previous_reading = correctedReading;
      nextReading.units_consumed = nextUnits;
      nextReading.eb_amount = nextEbAmount;
      nextReading.updated_at = new Date().toISOString();

      const { error: cascadeErr } = await supabase
        .from('meter_readings')
        .update({
          previous_reading: nextReading.previous_reading,
          units_consumed: nextReading.units_consumed,
          eb_amount: nextReading.eb_amount,
          updated_at: nextReading.updated_at,
        })
        .eq('id', nextReading.id);

      if (cascadeErr) {
        console.warn('Cascaded next reading update notice:', cascadeErr.message);
      }
    }

    this.notify();

    await this.addAuditLog(
      'meter_reading',
      readingId,
      'correct',
      `Corrected reading from ${oldVal} to ${correctedReading} kWh. Reason: ${reason}`
    );

    return updatedTarget;
  }

  // --- RENT PAYMENTS ---

  public getRentPayments(
    houseId?: string,
    tenantId?: string,
    month?: number,
    year?: number
  ): RentPayment[] {
    if (!this.currentOwner) return [];
    let list = [...this.rentPayments];
    if (houseId) list = list.filter((p) => p.house_id === houseId);
    if (tenantId) list = list.filter((p) => p.tenant_id === tenantId);
    if (month) list = list.filter((p) => p.month === month);
    if (year) list = list.filter((p) => p.year === year);
    return list.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
  }

  public getRentPayment(id: string): RentPayment | undefined {
    return this.rentPayments.find((p) => p.id === id);
  }

  /**
   * Batched, awaited rent record creator called from useEffect in RentModule.
   * Only creates records for active tenancies that cover the specified month/year,
   * where month is not in the future.
   */
  public async ensureRentRecordsForMonth(month: number, year: number): Promise<void> {
    if (!this.currentOwner) return;

    const checkKey = `${month}-${year}`;
    if (this.verifiedRentMonths.has(checkKey)) return;
    this.verifiedRentMonths.add(checkKey);

    const now = new Date();
    const currentCalendarMonth = now.getMonth() + 1;
    const currentCalendarYear = now.getFullYear();

    // Do not create records for future calendar months
    if (year > currentCalendarYear || (year === currentCalendarYear && month > currentCalendarMonth)) {
      return;
    }

    const monthStartDate = new Date(year, month - 1, 1);
    const monthEndDate = new Date(year, month, 0); // last day of month

    const missingPayments: RentPayment[] = [];

    for (const house of this.houses) {
      // Find tenancy that covers this month
      const tenancies = this.getTenancyHistory(house.id);
      const coveringTenancy = tenancies.find((th) => {
        const leaseStart = new Date(th.start_date);
        const leaseEnd = th.end_date ? new Date(th.end_date) : null;
        return leaseStart <= monthEndDate && (!leaseEnd || leaseEnd >= monthStartDate);
      });

      if (!coveringTenancy) continue;

      const existing = this.rentPayments.find(
        (p) =>
          p.house_id === house.id &&
          p.tenant_id === coveringTenancy.tenant_id &&
          p.month === month &&
          p.year === year
      );

      if (!existing) {
        const rentDue = Number(coveringTenancy.monthly_rent_agreed || house.monthly_rent || 0);
        const newPayment: RentPayment = {
          id: crypto.randomUUID(),
          house_id: house.id,
          tenant_id: coveringTenancy.tenant_id,
          month,
          year,
          rent_due: rentDue,
          amount_paid: 0,
          balance_due: rentDue,
          payment_status: 'unpaid',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        missingPayments.push(newPayment);
      }
    }

    if (missingPayments.length === 0) return;

    // Optimistically update cache
    this.rentPayments.push(...missingPayments);
    this.notify();

    // Write to Supabase in one batch
    const { error } = await supabase.from('rent_payments').upsert(
      missingPayments.map((p) => ({
        id: p.id,
        house_id: p.house_id,
        tenant_id: p.tenant_id,
        month: p.month,
        year: p.year,
        rent_due: p.rent_due,
        amount_paid: p.amount_paid,
        balance_due: p.balance_due,
        payment_status: p.payment_status,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }))
    );

    if (error) {
      console.warn('Batch rent records creation notice:', error.message);
      // Rollback on error
      const idsToRemove = new Set(missingPayments.map((p) => p.id));
      this.rentPayments = this.rentPayments.filter((p) => !idsToRemove.has(p.id));
      this.notify();
    }
  }

  public async saveRentPayment(
    paymentData: Omit<RentPayment, 'id' | 'created_at' | 'updated_at'>,
    evidenceFile?: { imageUrl: string; fileName: string; notes?: string }
  ): Promise<RentPayment> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    // Mathematical validations (matches DB constraints)
    if (paymentData.amount_paid < 0 || paymentData.rent_due < 0) {
      throw new Error('Rent amount cannot be negative');
    }
    if (paymentData.amount_paid > paymentData.rent_due) {
      throw new Error('Amount paid cannot exceed rent due (overpayments not allowed)');
    }

    const balanceDue = Number((paymentData.rent_due - paymentData.amount_paid).toFixed(2));
    let derivedStatus: RentPayment['payment_status'] = 'unpaid';
    if (paymentData.amount_paid >= paymentData.rent_due) {
      derivedStatus = 'paid';
    } else if (paymentData.amount_paid > 0) {
      derivedStatus = 'partial';
    }

    const existingIndex = this.rentPayments.findIndex(
      (p) =>
        p.house_id === paymentData.house_id &&
        p.tenant_id === paymentData.tenant_id &&
        p.month === paymentData.month &&
        p.year === paymentData.year
    );

    const now = new Date().toISOString();
    const paymentId = existingIndex >= 0 ? this.rentPayments[existingIndex].id : crypto.randomUUID();

    const finalPayment: RentPayment = {
      ...paymentData,
      id: paymentId,
      amount_paid: paymentData.amount_paid,
      balance_due: balanceDue,
      payment_status: derivedStatus,
      payment_date: paymentData.amount_paid > 0 ? paymentData.payment_date || now.split('T')[0] : undefined,
      created_at: existingIndex >= 0 ? this.rentPayments[existingIndex].created_at : now,
      updated_at: now,
    };

    const prevPayments = [...this.rentPayments];
    const prevEvidence = [...this.rentEvidence];

    if (existingIndex >= 0) {
      this.rentPayments[existingIndex] = finalPayment;
    } else {
      this.rentPayments.unshift(finalPayment);
    }
    this.notify();

    // 1. Await Supabase upsert
    const { error: paymentErr } = await supabase.from('rent_payments').upsert({
      id: finalPayment.id,
      house_id: finalPayment.house_id,
      tenant_id: finalPayment.tenant_id,
      month: finalPayment.month,
      year: finalPayment.year,
      rent_due: finalPayment.rent_due,
      amount_paid: finalPayment.amount_paid,
      balance_due: finalPayment.balance_due,
      payment_status: finalPayment.payment_status,
      payment_method: finalPayment.payment_method || null,
      payment_date: finalPayment.payment_date || null,
      transaction_reference: finalPayment.transaction_reference || null,
      created_at: finalPayment.created_at,
      updated_at: finalPayment.updated_at,
    });

    if (paymentErr) {
      this.rentPayments = prevPayments;
      this.notify();
      this.showToast(`Failed to save payment: ${paymentErr.message}`);
      throw new Error(paymentErr.message);
    }

    // 2. Upload and save evidence if provided
    if (evidenceFile?.imageUrl) {
      let storagePath = evidenceFile.imageUrl;
      if (storagePath.startsWith('data:') || storagePath.startsWith('blob:')) {
        storagePath = await uploadEvidenceToStorage(
          evidenceFile.imageUrl,
          'rent',
          `receipt-${finalPayment.id}`
        );
      }

      const newEvidence: RentEvidence = {
        id: crypto.randomUUID(),
        payment_id: finalPayment.id,
        image_url: storagePath,
        file_name: evidenceFile.fileName || 'Receipt Screenshot',
        notes: evidenceFile.notes,
        uploaded_at: now,
      };

      this.rentEvidence.unshift(newEvidence);
      this.notify();

      const { error: evErr } = await supabase.from('rent_evidence').insert({
        id: newEvidence.id,
        payment_id: newEvidence.payment_id,
        image_url: newEvidence.image_url,
        file_name: newEvidence.file_name,
        notes: newEvidence.notes || null,
        uploaded_at: newEvidence.uploaded_at,
      });

      if (evErr) {
        console.warn('Rent evidence upload notice:', evErr.message);
      }
    }

    const house = this.getHouse(finalPayment.house_id);
    await this.addAuditLog(
      'rent_payment',
      finalPayment.id,
      existingIndex >= 0 ? 'update' : 'create',
      `Recorded rent for ${house?.house_number || 'Portion'}: Paid ₹${finalPayment.amount_paid.toLocaleString('en-IN')} of ₹${finalPayment.rent_due.toLocaleString('en-IN')} (${finalPayment.payment_status})`
    );

    return finalPayment;
  }

  public getRentEvidence(paymentId: string): RentEvidence[] {
    return this.rentEvidence.filter((e) => e.payment_id === paymentId);
  }

  public getAllRentEvidence(): RentEvidence[] {
    return [...this.rentEvidence];
  }

  // --- EB PAYMENTS ---

  public getEBPayments(houseId?: string): EBPayment[] {
    if (!this.currentOwner) return [];
    let list = [...this.ebPayments];
    if (houseId) list = list.filter((p) => p.house_id === houseId);
    return list.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
  }

  public async saveEBPayment(paymentData: Omit<EBPayment, 'id' | 'created_at'>): Promise<EBPayment> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    const newPayment: EBPayment = {
      ...paymentData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    const previous = [...this.ebPayments];
    this.ebPayments.unshift(newPayment);
    this.notify();

    const { error } = await supabase.from('eb_payments').insert({
      id: newPayment.id,
      house_id: newPayment.house_id,
      month: newPayment.month,
      year: newPayment.year,
      bill_amount: newPayment.bill_amount,
      payment_status: newPayment.payment_status,
      payment_date: newPayment.payment_date || null,
      receipt_url: newPayment.receipt_url || null,
      created_at: newPayment.created_at,
    });

    if (error) {
      this.ebPayments = previous;
      this.notify();
      this.showToast(`Failed to record EB payment: ${error.message}`);
      throw new Error(error.message);
    }

    await this.addAuditLog(
      'house',
      newPayment.house_id,
      'create',
      `Recorded EB payment: ₹${newPayment.bill_amount} (${newPayment.payment_status})`
    );

    return newPayment;
  }

  // --- DASHBOARD & ANALYTICS ---

  public getDashboardStats(selectedMonth: number, selectedYear: number) {
    const houses = this.getHouses();
    const payments = this.getRentPayments(undefined, undefined, selectedMonth, selectedYear);

    const totalCollectedThisMonth = payments.reduce((acc, p) => acc + (p.amount_paid || 0), 0);
    const totalPendingThisMonth = payments.reduce((acc, p) => acc + (p.balance_due || 0), 0);

    const yearPayments = this.getRentPayments(undefined, undefined, undefined, selectedYear);
    const totalCollectedThisYear = yearPayments.reduce((acc, p) => acc + (p.amount_paid || 0), 0);

    const paidCount = payments.filter((p) => p.payment_status === 'paid').length;
    const unpaidCount = payments.filter((p) => p.payment_status === 'unpaid').length;
    const partialCount = payments.filter((p) => p.payment_status === 'partial').length;

    // EB Charges this month calculation across all portions
    const monthReadings = this.getMeterReadings().filter(
      (r) => r.month === selectedMonth && r.year === selectedYear
    );
    const totalEBChargesThisMonth = monthReadings.reduce((sum, r) => sum + (r.eb_amount || 0), 0);
    const totalEBUnitsThisMonth = monthReadings.reduce((sum, r) => sum + (r.units_consumed || 0), 0);

    return {
      totalHouses: houses.length,
      totalCollectedThisMonth,
      totalPendingThisMonth,
      totalCollectedThisYear,
      paidCount,
      unpaidCount,
      partialCount,
      totalEBChargesThisMonth,
      totalEBUnitsThisMonth,
    };
  }

  public getMonthlyIncomeSeries(year: number) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    const payments = this.getRentPayments(undefined, undefined, undefined, year);

    return months.map((monthName, idx) => {
      const monthNum = idx + 1;
      const monthRecords = payments.filter((p) => p.month === monthNum);
      const collected = monthRecords.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
      const pending = monthRecords.reduce((sum, p) => sum + (p.balance_due || 0), 0);

      return {
        month: monthName,
        monthNum,
        collected,
        pending,
        totalDue: collected + pending,
      };
    });
  }

  // --- RESET & DEMO SEEDING ---

  /**
   * Clears this owner's data in the cloud first, then wipes in-memory cache.
   * Children cascade automatically via Foreign Key constraints.
   */
  public async clearAllData(): Promise<boolean> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    const ownerId = this.currentOwner.id;

    // Delete in cloud first: houses and tenants
    const [delHouses, delTenants] = await Promise.all([
      supabase.from('houses').delete().eq('owner_id', ownerId),
      supabase.from('tenants').delete().eq('owner_id', ownerId),
    ]);

    if (delHouses.error) {
      this.showToast(`Failed to delete compound houses: ${delHouses.error.message}`);
      throw new Error(delHouses.error.message);
    }
    if (delTenants.error) {
      this.showToast(`Failed to delete compound tenants: ${delTenants.error.message}`);
      throw new Error(delTenants.error.message);
    }

    this.clearMemoryCache();
    this.notify();

    await this.addAuditLog('owner', ownerId, 'archive', 'Cleared all compound houses, tenants, and records.');
    return true;
  }

  /**
   * Seeds sample compound for testing only.
   * Uses crypto.randomUUID() and strictly satisfies database constraints.
   */
  public async seedSampleCompound(): Promise<boolean> {
    if (!this.currentOwner) throw new Error('Not authenticated');

    await this.clearAllData();
    const ownerId = this.currentOwner.id;
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;

    // 4 Portions
    const housesData: House[] = [
      {
        id: crypto.randomUUID(),
        owner_id: ownerId,
        name: 'Ground Floor Front (2BHK)',
        house_number: 'Portion 1A',
        monthly_rent: 14000,
        move_in_date: '2025-01-01',
        eb_responsibility: 'tenant_direct',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        owner_id: ownerId,
        name: 'Ground Floor Rear (1BHK)',
        house_number: 'Portion 1B',
        monthly_rent: 9500,
        move_in_date: '2025-01-01',
        eb_responsibility: 'owner',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        owner_id: ownerId,
        name: 'First Floor North (2BHK)',
        house_number: 'Portion 2A',
        monthly_rent: 16000,
        move_in_date: '2025-01-01',
        eb_responsibility: 'tenant_direct',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        owner_id: ownerId,
        name: 'First Floor South (2BHK)',
        house_number: 'Portion 2B',
        monthly_rent: 15500,
        move_in_date: '2025-01-01',
        eb_responsibility: 'owner',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ];

    for (const h of housesData) {
      await this.saveHouse(h);
    }

    // 4 Tenants
    const tenantsData: Tenant[] = [
      {
        id: crypto.randomUUID(),
        owner_id: ownerId,
        name: 'Arun Kumar',
        phone: '+91 98401 23456',
        email: 'arun.kumar@example.com',
        id_proof_number: 'AADHAAR-8921-4412-1092',
        status: 'active',
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        owner_id: ownerId,
        name: 'Priya Sundaram',
        phone: '+91 97902 34567',
        email: 'priya.s@example.com',
        id_proof_number: 'AADHAAR-3310-9981-6721',
        status: 'active',
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        owner_id: ownerId,
        name: 'Karthik Raja',
        phone: '+91 91765 67890',
        email: 'karthik.r@example.com',
        id_proof_number: 'AADHAAR-7712-4410-3329',
        status: 'active',
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        owner_id: ownerId,
        name: 'Venkatesh Prasad',
        phone: '+91 94451 98765',
        email: 'v.prasad@example.com',
        id_proof_number: 'AADHAAR-1290-8841-5520',
        status: 'active',
        created_at: new Date().toISOString(),
      },
    ];

    for (const t of tenantsData) {
      await this.saveTenant(t);
    }

    // Tenancies
    await this.assignTenant(housesData[0].id, tenantsData[0].id, 14000, '2025-01-01', 50000);
    await this.assignTenant(housesData[1].id, tenantsData[1].id, 9500, '2025-01-01', 35000);
    await this.assignTenant(housesData[2].id, tenantsData[2].id, 16000, '2025-01-01', 60000);
    await this.assignTenant(housesData[3].id, tenantsData[3].id, 15500, '2025-01-01', 55000);

    // Meters (serial numbers removed)
    const m1 = await this.saveMeter({ house_id: housesData[0].id, meter_name: 'Main Meter - 1A' });
    const m2 = await this.saveMeter({ house_id: housesData[1].id, meter_name: 'Main Meter - 1B' });
    const m3 = await this.saveMeter({ house_id: housesData[2].id, meter_name: 'Main Meter - 2A' });
    const m4 = await this.saveMeter({ house_id: housesData[3].id, meter_name: 'Main Meter - 2B' });

    // Seed readings for Portion 1A
    await this.recordMeterReading(
      {
        house_id: housesData[0].id,
        meter_id: m1.id,
        tenant_id: tenantsData[0].id,
        month: prevMonth,
        year: prevYear,
        previous_reading: 14200.0,
        current_reading: 14480.5,
        reading_date: `${prevYear}-${String(prevMonth).padStart(2, '0')}-02`,
        is_corrected: false,
      },
      {
        image_url: 'placeholder/sample_meter_reading.jpg',
        extracted_reading: 14480.5,
        confirmed_reading: 14480.5,
        verification_status: 'VERIFIED',
        captured_at: new Date().toISOString(),
      }
    );

    await this.recordMeterReading(
      {
        house_id: housesData[0].id,
        meter_id: m1.id,
        tenant_id: tenantsData[0].id,
        month: curMonth,
        year: curYear,
        previous_reading: 14480.5,
        current_reading: 14755.7,
        reading_date: `${curYear}-${String(curMonth).padStart(2, '0')}-02`,
        is_corrected: false,
      },
      {
        image_url: 'placeholder/sample_meter_reading.jpg',
        extracted_reading: 14755.7,
        confirmed_reading: 14755.7,
        verification_status: 'VERIFIED',
        captured_at: new Date().toISOString(),
      }
    );

    // Seed rent payments
    await this.saveRentPayment({
      house_id: housesData[0].id,
      tenant_id: tenantsData[0].id,
      month: curMonth,
      year: curYear,
      rent_due: 14000,
      amount_paid: 14000,
      balance_due: 0,
      payment_status: 'paid',
      payment_method: 'upi',
      payment_date: `${curYear}-${String(curMonth).padStart(2, '0')}-05`,
      transaction_reference: 'UPI/2026/884192019',
    });

    await this.saveRentPayment({
      house_id: housesData[1].id,
      tenant_id: tenantsData[1].id,
      month: curMonth,
      year: curYear,
      rent_due: 9500,
      amount_paid: 5000,
      balance_due: 4500,
      payment_status: 'partial',
      payment_method: 'bank_transfer',
      payment_date: `${curYear}-${String(curMonth).padStart(2, '0')}-07`,
      transaction_reference: 'IMPS/NEFT/662019',
    });

    await this.saveRentPayment({
      house_id: housesData[2].id,
      tenant_id: tenantsData[2].id,
      month: curMonth,
      year: curYear,
      rent_due: 16000,
      amount_paid: 0,
      balance_due: 16000,
      payment_status: 'unpaid',
    });

    await this.saveRentPayment({
      house_id: housesData[3].id,
      tenant_id: tenantsData[3].id,
      month: curMonth,
      year: curYear,
      rent_due: 15500,
      amount_paid: 15500,
      balance_due: 0,
      payment_status: 'paid',
      payment_method: 'cash',
      payment_date: `${curYear}-${String(curMonth).padStart(2, '0')}-04`,
    });

    this.showToast('Sample compound loaded successfully (4 portions)!', 'success');
    return true;
  }

  // --- LEGACY BROWSER DATA UTILITIES ---

  public hasLegacyLocalStorage(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('rentease_')) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  public getLegacyBackupData(): Record<string, any> {
    const backup: Record<string, any> = {};
    if (typeof window === 'undefined') return backup;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('rentease_')) {
          const val = localStorage.getItem(key);
          try {
            backup[key] = val ? JSON.parse(val) : val;
          } catch {
            backup[key] = val;
          }
        }
      }
    } catch (e) {
      console.warn('Could not read legacy backup:', e);
    }
    return backup;
  }

  public downloadLegacyLocalStorageBackup(): void {
    const backup = this.getLegacyBackupData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RentEase_Legacy_LocalStorage_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public discardLegacyLocalStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('rentease_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.warn('Error clearing legacy keys:', e);
    }
  }
}

export const db = new RentEaseDB();
