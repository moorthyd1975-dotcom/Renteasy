import React, { useState } from 'react';
import { db } from '../services/db';
import { Home, Zap, User, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [compoundName, setCompoundName] = useState('My Rental Compound');
  const [ownerName, setOwnerName] = useState('Property Owner');
  const [ownerPhone, setOwnerPhone] = useState('+91 98765 43210');
  const [ebUnitRate, setEbUnitRate] = useState(8.5);

  const [portionName, setPortionName] = useState('Ground Floor Front (2BHK)');
  const [houseNumber, setHouseNumber] = useState('Portion 1A');
  const [monthlyRent, setMonthlyRent] = useState(12000);
  const [ebResponsibility, setEbResponsibility] = useState<'owner' | 'tenant_direct'>('tenant_direct');
  const [meterName, setMeterName] = useState('Main Meter - 1A');

  const [tenantName, setTenantName] = useState('Arun Kumar');
  const [tenantPhone, setTenantPhone] = useState('+91 98401 23456');
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantIdProof, setTenantIdProof] = useState('AADHAAR-8921-4412-1092');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFinish = async () => {
    setErrorMessage(null);
    const parsedRate = Number(ebUnitRate);
    if (isNaN(parsedRate) || parsedRate < 0) {
      setErrorMessage('Electricity unit rate must be a non-negative number.');
      return;
    }

    setLoading(true);
    try {
      // 1. Save Owner
      const currentOwner = db.getOwner();
      await db.setOwner({
        ...currentOwner,
        name: ownerName.trim(),
        phone: ownerPhone.trim(),
        compound_name: compoundName.trim(),
        eb_unit_rate: Math.round(parsedRate * 100) / 100,
      });

      // 2. Save House
      const houseId = crypto.randomUUID();
      const newHouse = await db.saveHouse({
        id: houseId,
        owner_id: currentOwner.id,
        name: portionName.trim(),
        house_number: houseNumber.trim(),
        monthly_rent: Number(monthlyRent),
        move_in_date: new Date().toISOString().split('T')[0],
        eb_responsibility: ebResponsibility,
        is_active: true,
        created_at: new Date().toISOString(),
      });

      // 3. Save Meter
      const meterId = crypto.randomUUID();
      await db.saveMeter({
        id: meterId,
        house_id: newHouse.id,
        meter_name: meterName.trim(),
        created_at: new Date().toISOString(),
      });

      // 4. Save Tenant
      const tenantId = crypto.randomUUID();
      const newTenant = await db.saveTenant({
        id: tenantId,
        owner_id: currentOwner.id,
        name: tenantName.trim(),
        phone: tenantPhone.trim(),
        email: tenantEmail.trim() || undefined,
        id_proof_number: tenantIdProof.trim() || undefined,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      // 5. Assign Tenancy
      await db.assignTenant(newHouse.id, newTenant.id, Number(monthlyRent), new Date().toISOString().split('T')[0]);

      // 6. Generate initial rent payment for current month
      const now = new Date();
      await db.saveRentPayment({
        house_id: newHouse.id,
        tenant_id: newTenant.id,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        rent_due: Number(monthlyRent),
        amount_paid: 0,
        balance_due: Number(monthlyRent),
        payment_status: 'unpaid',
      });

      try {
        confetti({
          particleCount: 75,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#2E6B4A', '#A9D3B7', '#3F7F5C'],
        });
      } catch {
        // Ignore if canvas confetti is unavailable
      }

      onComplete();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save setup.');
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDemo = async () => {
    setLoading(true);
    try {
      await db.seedSampleCompound();
      try {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#2E6B4A', '#A9D3B7', '#3F7F5C'],
        });
      } catch {
        // Ignore if canvas confetti is unavailable
      }
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-6 shadow-2xl sm:p-8">
        {/* Step Indicator */}
        <div className="mb-6 flex items-center justify-between border-b border-[#DDD2B4] pb-4">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-[#2E6B4A] uppercase">
              First-Time Setup Wizard
            </span>
            <h2 className="font-heading text-lg font-bold text-[#2C2C2C]">
              Welcome to RentEase
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B6B6B]">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                step === 1 ? 'bg-[#2E6B4A] text-white' : 'bg-[#DDD2B4] text-[#2C2C2C]'
              }`}
            >
              1
            </span>
            <div className="h-0.5 w-4 bg-[#DDD2B4]" />
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                step === 2 ? 'bg-[#2E6B4A] text-white' : 'bg-[#DDD2B4] text-[#2C2C2C]'
              }`}
            >
              2
            </span>
            <div className="h-0.5 w-4 bg-[#DDD2B4]" />
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                step === 3 ? 'bg-[#2E6B4A] text-white' : 'bg-[#DDD2B4] text-[#2C2C2C]'
              }`}
            >
              3
            </span>
          </div>
        </div>

        {/* STEP 1: Compound & Owner Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#2E6B4A]">
              <Home className="h-4 w-4" />
              <span>Step 1 of 3: Compound & Owner Profile</span>
            </div>
            <p className="text-xs text-[#6B6B6B]">
              Enter the name of your compound or property and your contact details.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">Compound / Building Name</label>
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
                  <label className="text-xs font-semibold text-[#2C2C2C]">Owner Phone Number</label>
                  <input
                    type="text"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">
                  Default EB Unit Rate (₹ per kWh)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={ebUnitRate}
                  onChange={(e) => setEbUnitRate(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs font-mono-numbers text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={handleSeedDemo}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#2E6B4A] hover:underline"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Or populate with 4 demo portions
              </button>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-2 rounded-lg bg-[#2E6B4A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3F7F5C]"
              >
                Next: Add House <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: House & Meter Details */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#2E6B4A]">
              <Zap className="h-4 w-4" />
              <span>Step 2 of 3: First House & EB Meter</span>
            </div>
            <p className="text-xs text-[#6B6B6B]">
              Add your first portion and specify who pays the electricity bill.
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">House / Portion Name</label>
                  <input
                    type="text"
                    value={portionName}
                    onChange={(e) => setPortionName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    placeholder="e.g. Ground Floor Front"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">House Number / Identifier</label>
                  <input
                    type="text"
                    value={houseNumber}
                    onChange={(e) => setHouseNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    placeholder="e.g. Portion 1A"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">Monthly Rent Amount (₹)</label>
                <input
                  type="number"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs font-mono-numbers text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>

              {/* EB Responsibility Radio */}
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">
                  Electricity (EB) Payment Responsibility
                </label>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                      ebResponsibility === 'tenant_direct'
                        ? 'border-[#2E6B4A] bg-[#A9D3B7]/20 font-semibold text-[#2C2C2C]'
                        : 'border-[#DDD2B4] bg-white text-[#6B6B6B]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ebResp"
                      checked={ebResponsibility === 'tenant_direct'}
                      onChange={() => setEbResponsibility('tenant_direct')}
                      className="mt-0.5 text-[#2E6B4A] focus:ring-0"
                    />
                    <div>
                      <span className="block font-semibold">Tenant pays EB directly</span>
                      <span className="text-[11px] text-[#6B6B6B]">
                        To electricity board. Pure reading tracking only.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                      ebResponsibility === 'owner'
                        ? 'border-[#2E6B4A] bg-[#A9D3B7]/20 font-semibold text-[#2C2C2C]'
                        : 'border-[#DDD2B4] bg-white text-[#6B6B6B]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ebResp"
                      checked={ebResponsibility === 'owner'}
                      onChange={() => setEbResponsibility('owner')}
                      className="mt-0.5 text-[#2E6B4A] focus:ring-0"
                    />
                    <div>
                      <span className="block font-semibold">Owner pays EB bill</span>
                      <span className="text-[11px] text-[#6B6B6B]">
                        Owner pays & records bill amount and reimbursement.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Meter details */}
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">Meter Name</label>
                <input
                  type="text"
                  value={meterName}
                  onChange={(e) => setMeterName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  placeholder="e.g. Main Digital Meter"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-[#6B6B6B] hover:text-[#2C2C2C]"
              >
                Back
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-2 rounded-lg bg-[#2E6B4A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3F7F5C]"
              >
                Next: Assign Tenant <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: First Tenant Details */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#2E6B4A]">
              <User className="h-4 w-4" />
              <span>Step 3 of 3: Assign Tenant</span>
            </div>
            <p className="text-xs text-[#6B6B6B]">
              Enter the tenant occupying this portion to initialize your rental ledger.
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">Tenant Full Name</label>
                  <input
                    type="text"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">Tenant Phone Number</label>
                  <input
                    type="text"
                    value={tenantPhone}
                    onChange={(e) => setTenantPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">Tenant Email (Optional)</label>
                  <input
                    type="email"
                    value={tenantEmail}
                    onChange={(e) => setTenantEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    placeholder="tenant@email.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">
                    ID Proof / Aadhaar Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={tenantIdProof}
                    onChange={(e) => setTenantIdProof(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    placeholder="AADHAAR-XXXX-XXXX"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[#A9D3B7] bg-[#A9D3B7]/20 p-3 text-xs text-[#2C2C2C]">
                <div className="flex items-center gap-2 font-bold text-[#2E6B4A]">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Ready to start managing!</span>
                </div>
                <span className="mt-1 block text-[11px] text-[#6B6B6B]">
                  Click Complete Setup to create your compound and begin capturing meter photos and rent payments.
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs font-semibold text-[#6B6B6B] hover:text-[#2C2C2C]"
              >
                Back
              </button>

              <button
                type="button"
                onClick={handleFinish}
                className="flex items-center gap-2 rounded-lg bg-[#2E6B4A] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#3F7F5C]"
              >
                Complete Setup & Open RentEase
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
