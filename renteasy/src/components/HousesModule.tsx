import React, { useState } from 'react';
import {
  Home,
  Plus,
  Search,
  User,
  Zap,
  Edit2,
  Trash2,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  UserCheck,
  UserMinus,
  X,
} from 'lucide-react';
import { db } from '../services/db';
import { House, Tenant, TenancyHistory, Meter, EBResponsibility } from '../types';

interface HousesModuleProps {
  selectedMonth: number;
  selectedYear: number;
  onRefresh: () => void;
  onSelectCaptureMeter: (houseId: string, meterId?: string) => void;
}

export const HousesModule: React.FC<HousesModuleProps> = ({
  selectedMonth,
  selectedYear,
  onRefresh,
  onSelectCaptureMeter,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid' | 'partial'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingHouse, setEditingHouse] = useState<House | null>(null);
  const [selectedTenantHistory, setSelectedTenantHistory] = useState<Tenant | null>(null);
  const [isChangeTenantModalOpen, setIsChangeTenantModalOpen] = useState(false);
  const [targetHouseForTenantChange, setTargetHouseForTenantChange] = useState<House | null>(null);

  // Form State for Add / Edit House
  const [formPortionName, setFormPortionName] = useState('');
  const [formHouseNumber, setFormHouseNumber] = useState('');
  const [formRent, setFormRent] = useState(12000);
  const [formMoveInDate, setFormMoveInDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDesc, setFormDesc] = useState('');
  const [formEbResp, setFormEbResp] = useState<EBResponsibility>('tenant_direct');
  const [formMeterName, setFormMeterName] = useState('Main Meter');
  const [formTenantName, setFormTenantName] = useState('');
  const [formTenantPhone, setFormTenantPhone] = useState('');
  const [formTenantEmail, setFormTenantEmail] = useState('');

  // Form State for Changing Tenant
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [newTenantStartDate, setNewTenantStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTenantRent, setNewTenantRent] = useState(12000);

  const [savingHouse, setSavingHouse] = useState(false);
  const [changingTenant, setChangingTenant] = useState(false);

  const houses = db.getHouses();
  const tenants = db.getTenants();
  const payments = db.getRentPayments(undefined, undefined, selectedMonth, selectedYear);

  // Filter houses
  const filteredHouses = houses.filter((h) => {
    const matchesSearch =
      h.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.house_number.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'all') return true;

    const payment = payments.find((p) => p.house_id === h.id);
    const status = payment ? payment.payment_status : 'unpaid';
    return status === filterStatus;
  });

  const getTenantForHouse = (houseId: string): Tenant | undefined => {
    const tenancy = db.getCurrentTenancy(houseId);
    if (!tenancy) return undefined;
    return tenants.find((t) => t.id === tenancy.tenant_id);
  };

  const getLastReading = (houseId: string) => {
    const meters = db.getMeters(houseId);
    if (meters.length === 0) return null;
    return db.getLastMeterReading(meters[0].id);
  };

  const getPaymentStatus = (houseId: string) => {
    const p = payments.find((item) => item.house_id === houseId);
    return p ? p.payment_status : 'unpaid';
  };

  const handleOpenAdd = () => {
    setEditingHouse(null);
    setFormPortionName('');
    setFormHouseNumber('');
    setFormRent(12000);
    setFormMoveInDate(new Date().toISOString().split('T')[0]);
    setFormDesc('');
    setFormEbResp('tenant_direct');
    setFormMeterName('Main Digital Meter');
    setFormTenantName('');
    setFormTenantPhone('');
    setFormTenantEmail('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (house: House) => {
    setEditingHouse(house);
    setFormPortionName(house.name);
    setFormHouseNumber(house.house_number);
    setFormRent(house.monthly_rent);
    setFormMoveInDate(house.move_in_date);
    setFormDesc(house.description || '');
    setFormEbResp(house.eb_responsibility);

    const meters = db.getMeters(house.id);
    if (meters.length > 0) {
      setFormMeterName(meters[0].meter_name);
    } else {
      setFormMeterName('Main Digital Meter');
    }

    const tenant = getTenantForHouse(house.id);
    if (tenant) {
      setFormTenantName(tenant.name);
      setFormTenantPhone(tenant.phone);
      setFormTenantEmail(tenant.email || '');
    } else {
      setFormTenantName('');
      setFormTenantPhone('');
      setFormTenantEmail('');
    }

    setIsAddModalOpen(true);
  };

  const handleSaveHouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const owner = db.getOwner();
    setSavingHouse(true);

    try {
      if (editingHouse) {
        // Update existing house
        const updatedHouse = await db.saveHouse({
          ...editingHouse,
          name: formPortionName,
          house_number: formHouseNumber,
          monthly_rent: Number(formRent),
          description: formDesc,
          eb_responsibility: formEbResp,
          eb_responsibility_effective_date: new Date().toISOString().split('T')[0],
        });

        // Update Meter
        const meters = db.getMeters(updatedHouse.id);
        if (meters.length > 0) {
          await db.saveMeter({
            ...meters[0],
            meter_name: formMeterName,
          });
        } else {
          await db.saveMeter({
            id: crypto.randomUUID(),
            house_id: updatedHouse.id,
            meter_name: formMeterName,
            created_at: new Date().toISOString(),
          });
        }

        // Update current tenant details if present
        const currentTenancy = db.getCurrentTenancy(updatedHouse.id);
        if (currentTenancy && formTenantName.trim()) {
          const tenant = db.getTenant(currentTenancy.tenant_id);
          if (tenant) {
            await db.saveTenant({
              ...tenant,
              name: formTenantName,
              phone: formTenantPhone,
              email: formTenantEmail || undefined,
            });
          }
        }
      } else {
        // Create new house with UUID
        const houseId = crypto.randomUUID();
        const newHouse = await db.saveHouse({
          id: houseId,
          owner_id: owner.id,
          name: formPortionName,
          house_number: formHouseNumber,
          monthly_rent: Number(formRent),
          move_in_date: formMoveInDate,
          description: formDesc,
          eb_responsibility: formEbResp,
          is_active: true,
          created_at: new Date().toISOString(),
        });

        // Create Meter
        await db.saveMeter({
          id: crypto.randomUUID(),
          house_id: newHouse.id,
          meter_name: formMeterName,
          created_at: new Date().toISOString(),
        });

        // Create Tenant if entered
        if (formTenantName.trim()) {
          const tenantId = crypto.randomUUID();
          const newTenant = await db.saveTenant({
            id: tenantId,
            owner_id: owner.id,
            name: formTenantName,
            phone: formTenantPhone,
            email: formTenantEmail || undefined,
            status: 'active',
            created_at: new Date().toISOString(),
          });

          await db.assignTenant(newHouse.id, newTenant.id, Number(formRent), formMoveInDate);

          // Seed initial rent record
          await db.saveRentPayment({
            house_id: newHouse.id,
            tenant_id: newTenant.id,
            month: selectedMonth,
            year: selectedYear,
            rent_due: Number(formRent),
            amount_paid: 0,
            balance_due: Number(formRent),
            payment_status: 'unpaid',
          });
        }
      }

      setIsAddModalOpen(false);
      onRefresh();
    } finally {
      setSavingHouse(false);
    }
  };

  const handleDeleteHouse = async (house: House) => {
    if (confirm(`Are you sure you want to remove ${house.house_number} (${house.name})? All historical data will be preserved in audit logs.`)) {
      await db.deleteHouse(house.id);
      onRefresh();
    }
  };

  // Changing Tenant Workflow (Workflow E)
  const handleOpenChangeTenant = (house: House) => {
    setTargetHouseForTenantChange(house);
    setNewTenantName('');
    setNewTenantPhone('');
    setNewTenantEmail('');
    setNewTenantStartDate(new Date().toISOString().split('T')[0]);
    setNewTenantRent(house.monthly_rent);
    setIsChangeTenantModalOpen(true);
  };

  const handleExecuteChangeTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetHouseForTenantChange || !newTenantName.trim()) return;

    const owner = db.getOwner();
    setChangingTenant(true);

    try {
      // 1. Create new tenant with UUID
      const newTenant = await db.saveTenant({
        id: crypto.randomUUID(),
        owner_id: owner.id,
        name: newTenantName,
        phone: newTenantPhone,
        email: newTenantEmail || undefined,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      // 2. End previous tenancy (preserves old association) & start new tenancy
      await db.assignTenant(
        targetHouseForTenantChange.id,
        newTenant.id,
        Number(newTenantRent),
        newTenantStartDate
      );

      // 3. Initialize future rent payment
      await db.saveRentPayment({
        house_id: targetHouseForTenantChange.id,
        tenant_id: newTenant.id,
        month: selectedMonth,
        year: selectedYear,
        rent_due: Number(newTenantRent),
        amount_paid: 0,
        balance_due: Number(newTenantRent),
        payment_status: 'unpaid',
      });

      setIsChangeTenantModalOpen(false);
      onRefresh();
    } finally {
      setChangingTenant(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Search / Filters */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-heading text-lg font-bold text-[#2C2C2C] sm:text-xl">
            Houses & Portions ({houses.length})
          </h2>
          <p className="text-xs text-[#6B6B6B]">
            Manage rental portions, tenants, meter configurations, and EB responsibility.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 rounded-xl bg-[#2E6B4A] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#3F7F5C]"
        >
          <Plus className="h-4 w-4" />
          Add Portion / House
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search portion or number..."
            className="w-full rounded-lg border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
          />
        </div>

        {/* Status segmented tabs */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-[#DDD2B4] bg-white p-1">
          <button
            onClick={() => setFilterStatus('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              filterStatus === 'all'
                ? 'bg-[#2E6B4A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
            }`}
          >
            All Portions
          </button>
          <button
            onClick={() => setFilterStatus('paid')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              filterStatus === 'paid'
                ? 'bg-[#2E6B4A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
            }`}
          >
            Paid
          </button>
          <button
            onClick={() => setFilterStatus('unpaid')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              filterStatus === 'unpaid'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
            }`}
          >
            Unpaid
          </button>
          <button
            onClick={() => setFilterStatus('partial')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              filterStatus === 'partial'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
            }`}
          >
            Partial
          </button>
        </div>
      </div>

      {/* Houses Grid (Individual Cards as per Spec) */}
      {filteredHouses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DDD2B4] bg-[#FAF6ED] p-12 text-center">
          <Home className="mx-auto h-10 w-10 text-[#9A9A9A]" />
          <h3 className="mt-3 font-heading text-sm font-bold text-[#2C2C2C]">
            No portions found
          </h3>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            {searchTerm ? 'Try adjusting your search criteria.' : 'Click Add Portion / House above to create one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredHouses.map((house) => {
            const tenant = getTenantForHouse(house.id);
            const status = getPaymentStatus(house.id);
            const lastReading = getLastReading(house.id);
            const meters = db.getMeters(house.id);
            const primaryMeter = meters[0];

            return (
              <div
                key={house.id}
                className="flex flex-col justify-between rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-5 shadow-xs transition-shadow hover:shadow-md"
              >
                <div>
                  {/* Top Badge: House Number & Payment Status */}
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-heading text-base font-bold text-[#2C2C2C]">
                        {house.house_number}
                      </span>
                      <h4 className="text-xs font-medium text-[#6B6B6B]">
                        {house.name}
                      </h4>
                    </div>

                    {status === 'paid' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#2E6B4A]/10 px-2 py-0.5 text-[11px] font-bold text-[#2E6B4A]">
                        <CheckCircle className="h-3 w-3" /> Paid
                      </span>
                    ) : status === 'partial' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        <Clock className="h-3 w-3" /> Partial
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                        <AlertCircle className="h-3 w-3" /> Unpaid
                      </span>
                    )}
                  </div>

                  {/* Financial & EB Responsibility */}
                  <div className="mt-4 space-y-2 border-t border-[#DDD2B4]/60 pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6B6B6B]">Monthly Rent:</span>
                      <span className="font-mono-numbers font-bold text-[#2C2C2C]">
                        ₹{house.monthly_rent.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6B6B6B]">EB Responsibility:</span>
                      <span
                        className={`font-semibold ${
                          house.eb_responsibility === 'owner'
                            ? 'text-amber-800'
                            : 'text-[#2E6B4A]'
                        }`}
                      >
                        {house.eb_responsibility === 'owner'
                          ? 'Owner Pays EB'
                          : 'Tenant Pays Directly'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6B6B6B]">Last EB Reading:</span>
                      <span className="font-mono-numbers font-semibold text-[#2C2C2C]">
                        {lastReading ? `${lastReading.current_reading} kWh` : 'No reading yet'}
                      </span>
                    </div>
                  </div>

                  {/* Tenant Profile Box */}
                  <div className="mt-4 rounded-xl border border-[#DDD2B4] bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FAF6ED] text-[#2E6B4A]">
                          <User className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-[#2C2C2C]">
                            {tenant ? tenant.name : 'Vacant Portion'}
                          </span>
                          {tenant && (
                            <span className="block text-[11px] text-[#6B6B6B]">
                              {tenant.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      {tenant && (
                        <button
                          onClick={() => setSelectedTenantHistory(tenant)}
                          className="text-[11px] font-semibold text-[#2E6B4A] hover:underline"
                        >
                          Profile & History
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="mt-5 flex items-center justify-between border-t border-[#DDD2B4] pt-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(house)}
                      className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#DDD2B4]/40 hover:text-[#2C2C2C]"
                      title="Edit house details"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleOpenChangeTenant(house)}
                      className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#DDD2B4]/40 hover:text-[#2C2C2C]"
                      title="Change / Assign Tenant"
                    >
                      <UserCheck className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteHouse(house)}
                      className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                      title="Archive portion"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => onSelectCaptureMeter(house.id, primaryMeter?.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-[#2E6B4A] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#3F7F5C]"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Read Meter
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: ADD / EDIT HOUSE */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDD2B4] pb-3">
              <h3 className="font-heading text-base font-bold text-[#2C2C2C]">
                {editingHouse ? 'Edit Portion / House' : 'Add New House or Portion'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#DDD2B4]/40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveHouse} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">Portion Name *</label>
                  <input
                    type="text"
                    value={formPortionName}
                    onChange={(e) => setFormPortionName(e.target.value)}
                    placeholder="e.g. Ground Floor Rear"
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">House Number *</label>
                  <input
                    type="text"
                    value={formHouseNumber}
                    onChange={(e) => setFormHouseNumber(e.target.value)}
                    placeholder="e.g. Portion 1B"
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">Monthly Rent (₹) *</label>
                  <input
                    type="number"
                    value={formRent}
                    onChange={(e) => setFormRent(parseInt(e.target.value, 10) || 0)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs font-mono-numbers text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">Move-in Date</label>
                  <input
                    type="date"
                    value={formMoveInDate}
                    onChange={(e) => setFormMoveInDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* EB Responsibility Radio Selection (Option A vs Option B) */}
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">
                  Electricity (EB) Payment Responsibility *
                </label>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs ${
                      formEbResp === 'tenant_direct'
                        ? 'border-[#2E6B4A] bg-[#A9D3B7]/25 font-semibold text-[#2C2C2C]'
                        : 'border-[#DDD2B4] bg-white text-[#6B6B6B]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="modalEbResp"
                      checked={formEbResp === 'tenant_direct'}
                      onChange={() => setFormEbResp('tenant_direct')}
                      className="mt-0.5 text-[#2E6B4A]"
                    />
                    <div>
                      <span className="block font-semibold">Tenant pays EB directly</span>
                      <span className="text-[10px] text-[#6B6B6B]">
                        Pure reading tracking. No EB payment ledger required.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs ${
                      formEbResp === 'owner'
                        ? 'border-[#2E6B4A] bg-[#A9D3B7]/25 font-semibold text-[#2C2C2C]'
                        : 'border-[#DDD2B4] bg-white text-[#6B6B6B]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="modalEbResp"
                      checked={formEbResp === 'owner'}
                      onChange={() => setFormEbResp('owner')}
                      className="mt-0.5 text-[#2E6B4A]"
                    />
                    <div>
                      <span className="block font-semibold">Owner pays EB bill</span>
                      <span className="text-[10px] text-[#6B6B6B]">
                        Owner records monthly bill payments & receipts.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Meter Registration */}
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">Meter Name</label>
                <input
                  type="text"
                  value={formMeterName}
                  onChange={(e) => setFormMeterName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  placeholder="e.g. Main Digital Meter"
                />
              </div>

              {/* Tenant Section */}
              <div className="border-t border-[#DDD2B4] pt-3">
                <span className="text-xs font-bold text-[#2E6B4A]">
                  Tenant Information
                </span>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-[#2C2C2C]">Tenant Name</label>
                    <input
                      type="text"
                      value={formTenantName}
                      onChange={(e) => setFormTenantName(e.target.value)}
                      placeholder="e.g. Arun Kumar"
                      className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#2C2C2C]">Tenant Phone</label>
                    <input
                      type="text"
                      value={formTenantPhone}
                      onChange={(e) => setFormTenantPhone(e.target.value)}
                      placeholder="+91 98401..."
                      className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#DDD2B4] pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[#6B6B6B] hover:text-[#2C2C2C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#2E6B4A] px-5 py-2 text-xs font-bold text-white hover:bg-[#3F7F5C]"
                >
                  {editingHouse ? 'Save Changes' : 'Create Portion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CHANGE TENANT (WORKFLOW E - PRESERVE HISTORICAL RECORDS) */}
      {isChangeTenantModalOpen && targetHouseForTenantChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDD2B4] pb-3">
              <div>
                <span className="text-[10px] font-bold tracking-wider text-[#2E6B4A] uppercase">
                  Workflow E: Tenancy Transition
                </span>
                <h3 className="font-heading text-base font-bold text-[#2C2C2C]">
                  Change Tenant for {targetHouseForTenantChange.house_number}
                </h3>
              </div>
              <button
                onClick={() => setIsChangeTenantModalOpen(false)}
                className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#DDD2B4]/40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-[#6B6B6B]">
              Assigning a new tenant will end the active tenancy while fully preserving all previous payment records and meter readings associated with the prior tenant.
            </p>

            <form onSubmit={handleExecuteChangeTenant} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">New Tenant Name *</label>
                <input
                  type="text"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">Phone Number *</label>
                  <input
                    type="text"
                    value={newTenantPhone}
                    onChange={(e) => setNewTenantPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">Monthly Rent (₹)</label>
                  <input
                    type="number"
                    value={newTenantRent}
                    onChange={(e) => setNewTenantRent(parseInt(e.target.value, 10) || 0)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs font-mono-numbers text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">Move-in / Lease Start Date</label>
                <input
                  type="date"
                  value={newTenantStartDate}
                  onChange={(e) => setNewTenantStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#DDD2B4] pt-4">
                <button
                  type="button"
                  onClick={() => setIsChangeTenantModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[#6B6B6B] hover:text-[#2C2C2C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#2E6B4A] px-5 py-2 text-xs font-bold text-white hover:bg-[#3F7F5C]"
                >
                  Start New Tenancy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DEDICATED TENANT PROFILE & HISTORICAL LEDGER */}
      {selectedTenantHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDD2B4] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2E6B4A] text-white">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold text-[#2C2C2C]">
                    {selectedTenantHistory.name}
                  </h3>
                  <span className="text-xs text-[#6B6B6B]">
                    Tenant Profile · {selectedTenantHistory.phone}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedTenantHistory(null)}
                className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#DDD2B4]/40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tenant Details Card */}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[#DDD2B4] bg-white p-3.5 text-xs sm:grid-cols-4">
              <div>
                <span className="text-[#9A9A9A]">Status:</span>
                <span className="block font-semibold capitalize text-[#2E6B4A]">
                  {selectedTenantHistory.status}
                </span>
              </div>
              <div>
                <span className="text-[#9A9A9A]">Email:</span>
                <span className="block font-medium text-[#2C2C2C]">
                  {selectedTenantHistory.email || 'None'}
                </span>
              </div>
              <div>
                <span className="text-[#9A9A9A]">ID Proof:</span>
                <span className="block font-mono-numbers font-medium text-[#2C2C2C]">
                  {selectedTenantHistory.id_proof_number || 'Not provided'}
                </span>
              </div>
              <div>
                <span className="text-[#9A9A9A]">Customer Since:</span>
                <span className="block text-[#2C2C2C]">
                  {new Date(selectedTenantHistory.created_at).toLocaleDateString('en-IN')}
                </span>
              </div>
            </div>

            {/* Tenancy History Section */}
            <div className="mt-5">
              <h4 className="text-xs font-bold text-[#2C2C2C] uppercase tracking-wider">
                Tenancy Periods
              </h4>
              <div className="mt-2 space-y-2">
                {db.getTenancyHistory(undefined, selectedTenantHistory.id).map((th) => {
                  const house = db.getHouse(th.house_id);
                  return (
                    <div
                      key={th.id}
                      className="flex items-center justify-between rounded-lg border border-[#DDD2B4] bg-[#FAF6ED] p-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-[#2C2C2C]">
                          {house ? `${house.house_number} (${house.name})` : th.house_id}
                        </span>
                        <div className="mt-0.5 text-[11px] text-[#6B6B6B]">
                          {th.start_date} → {th.is_current ? 'Present (Active)' : th.end_date}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono-numbers font-bold text-[#2C2C2C]">
                          ₹{th.monthly_rent_agreed.toLocaleString('en-IN')}/mo
                        </span>
                        {th.deposit_amount && (
                          <span className="block text-[10px] text-[#6B6B6B]">
                            Deposit: ₹{th.deposit_amount.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Monthly Rent History */}
            <div className="mt-5">
              <h4 className="text-xs font-bold text-[#2C2C2C] uppercase tracking-wider">
                Monthly Rent Payment History
              </h4>
              <div className="mt-2 overflow-x-auto rounded-xl border border-[#DDD2B4] bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#DDD2B4] bg-[#F7F3E8] text-[11px] font-bold text-[#6B6B6B]">
                    <tr>
                      <th className="p-2.5">Month/Year</th>
                      <th className="p-2.5">Rent Due</th>
                      <th className="p-2.5">Amount Paid</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DDD2B4]/40">
                    {db.getRentPayments(undefined, selectedTenantHistory.id).map((p) => (
                      <tr key={p.id}>
                        <td className="p-2.5 font-semibold text-[#2C2C2C]">
                          {p.month}/{p.year}
                        </td>
                        <td className="p-2.5 font-mono-numbers">
                          ₹{p.rent_due.toLocaleString('en-IN')}
                        </td>
                        <td className="p-2.5 font-mono-numbers font-bold text-[#2E6B4A]">
                          ₹{p.amount_paid.toLocaleString('en-IN')}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              p.payment_status === 'paid'
                                ? 'bg-[#2E6B4A]/10 text-[#2E6B4A]'
                                : p.payment_status === 'partial'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {p.payment_status}
                          </span>
                        </td>
                        <td className="p-2.5 uppercase text-[#6B6B6B]">
                          {p.payment_method || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
