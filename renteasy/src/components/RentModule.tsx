import React, { useState, useRef } from 'react';
import {
  ReceiptText,
  Search,
  Filter,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  Plus,
  Upload,
  Calendar,
  X,
  CreditCard,
  FileCheck,
} from 'lucide-react';
import { db } from '../services/db';
import { RentPayment, RentEvidence, PaymentStatus, PaymentMethod } from '../types';
import { compressImage } from '../utils/imageQuality';

interface RentModuleProps {
  selectedMonth: number;
  selectedYear: number;
  onRefresh: () => void;
  onViewRentEvidence: (payment: RentPayment, evidence: RentEvidence[]) => void;
}

export const RentModule: React.FC<RentModuleProps> = ({
  selectedMonth,
  selectedYear,
  onRefresh,
  onViewRentEvidence,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'partial'>('all');
  const [editingPayment, setEditingPayment] = useState<RentPayment | null>(null);

  const [modalAmountPaid, setModalAmountPaid] = useState<number>(0);
  const [modalPaymentStatus, setModalPaymentStatus] = useState<PaymentStatus>('paid');
  const [modalPaymentMethod, setModalPaymentMethod] = useState<PaymentMethod>('upi');
  const [modalPaymentDate, setModalPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [modalTxnRef, setModalTxnRef] = useState<string>('');
  const [modalEvidenceImage, setModalEvidenceImage] = useState<string | null>(null);
  const [modalEvidenceFileName, setModalEvidenceFileName] = useState<string>('');
  const [modalNotes, setModalNotes] = useState<string>('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Batched async creation of missing rent payments for valid tenancies overlapping selectedMonth/Year
  React.useEffect(() => {
    let isCancelled = false;
    db.ensureRentRecordsForMonth(selectedMonth, selectedYear).then(() => {
      if (!isCancelled) {
        onRefresh();
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [selectedMonth, selectedYear]);

  const payments = db.getRentPayments(undefined, undefined, selectedMonth, selectedYear);

  // Filtered Payments
  const filteredPayments = payments.filter((p) => {
    if (statusFilter !== 'all' && p.payment_status !== statusFilter) return false;

    const house = db.getHouse(p.house_id);
    const tenant = db.getTenant(p.tenant_id);
    const searchStr = `${house?.house_number || ''} ${house?.name || ''} ${tenant?.name || ''}`.toLowerCase();
    return searchStr.includes(searchTerm.toLowerCase());
  });

  const totalRentDue = payments.reduce((acc, p) => acc + p.rent_due, 0);
  const totalRentCollected = payments.reduce((acc, p) => acc + (p.amount_paid || 0), 0);
  const totalRentPending = payments.reduce((acc, p) => acc + (p.balance_due || 0), 0);

  const handleOpenEditPayment = (p: RentPayment) => {
    setEditingPayment(p);
    setValidationError(null);
    setModalAmountPaid(p.amount_paid || p.rent_due);
    setModalPaymentStatus(p.payment_status === 'unpaid' ? 'paid' : p.payment_status);
    setModalPaymentMethod(p.payment_method || 'upi');
    setModalPaymentDate(p.payment_date || new Date().toISOString().split('T')[0]);
    setModalTxnRef(p.transaction_reference || '');
    setModalEvidenceImage(null);
    setModalEvidenceFileName('');
    setModalNotes('');
  };

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 1400, 0.85);
      setModalEvidenceImage(compressed);
      setModalEvidenceFileName(file.name);
    } catch {
      alert('Failed to load image file. Please try another screenshot.');
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    setValidationError(null);

    const paidVal = Number(modalAmountPaid);
    if (isNaN(paidVal) || paidVal < 0) {
      setValidationError('Amount paid cannot be negative.');
      return;
    }

    if (paidVal > editingPayment.rent_due) {
      setValidationError(`Amount paid (₹${paidVal}) cannot exceed monthly rent due (₹${editingPayment.rent_due}).`);
      return;
    }

    if (paidVal > 0 && !modalPaymentDate) {
      setValidationError('Please specify a payment date when an amount is recorded as paid.');
      return;
    }

    const balance = Math.max(0, editingPayment.rent_due - paidVal);

    let calculatedStatus: PaymentStatus = 'unpaid';
    if (paidVal >= editingPayment.rent_due) {
      calculatedStatus = 'paid';
    } else if (paidVal > 0) {
      calculatedStatus = 'partial';
    } else {
      calculatedStatus = 'unpaid';
    }

    setSavingPayment(true);
    try {
      await db.saveRentPayment(
        {
          house_id: editingPayment.house_id,
          tenant_id: editingPayment.tenant_id,
          month: editingPayment.month,
          year: editingPayment.year,
          rent_due: editingPayment.rent_due,
          amount_paid: paidVal,
          balance_due: balance,
          payment_status: calculatedStatus,
          payment_method: paidVal > 0 ? modalPaymentMethod : undefined,
          payment_date: paidVal > 0 ? modalPaymentDate : undefined,
          transaction_reference: modalTxnRef ? modalTxnRef.trim() : undefined,
        },
        modalEvidenceImage
          ? {
              imageUrl: modalEvidenceImage,
              fileName: modalEvidenceFileName || 'payment_receipt.jpg',
              notes: modalNotes,
            }
          : undefined
      );

      setEditingPayment(null);
      onRefresh();
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Failed to save payment record.');
    } finally {
      setSavingPayment(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#2E6B4A] uppercase">
            Module 4 · Primary Business Ledger
          </span>
          <h2 className="font-heading text-lg font-bold text-[#2C2C2C] sm:text-xl">
            Rent Payment Collection & Evidence
          </h2>
          <p className="text-xs text-[#6B6B6B]">
            Track monthly rental payments, upload UPI/bank screenshots, and manage pending balances.
          </p>
        </div>
      </div>

      {/* Financial Pulse Cards for Selected Month */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <span className="text-xs font-semibold text-[#6B6B6B]">Total Rent Due</span>
          <div className="mt-1 font-mono-numbers text-2xl font-bold text-[#2C2C2C]">
            ₹{totalRentDue.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-[#6B6B6B]">Target for {selectedMonth}/{selectedYear}</span>
        </div>

        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <span className="text-xs font-semibold text-[#6B6B6B]">Actual Rent Collected</span>
          <div className="mt-1 font-mono-numbers text-2xl font-bold text-[#2E6B4A]">
            ₹{totalRentCollected.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-[#6B6B6B]">Verified received income</span>
        </div>

        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-4 shadow-xs">
          <span className="text-xs font-semibold text-[#6B6B6B]">Outstanding Balance</span>
          <div className="mt-1 font-mono-numbers text-2xl font-bold text-amber-800">
            ₹{totalRentPending.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-[#6B6B6B]">Unpaid or partial rent</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tenant or portion..."
            className="w-full rounded-lg border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-[#DDD2B4] bg-white p-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'all'
                ? 'bg-[#2E6B4A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
            }`}
          >
            All Portions
          </button>
          <button
            onClick={() => setStatusFilter('paid')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'paid'
                ? 'bg-[#2E6B4A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
            }`}
          >
            Paid
          </button>
          <button
            onClick={() => setStatusFilter('unpaid')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'unpaid'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
            }`}
          >
            Unpaid
          </button>
          <button
            onClick={() => setStatusFilter('partial')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'partial'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
            }`}
          >
            Partial
          </button>
        </div>
      </div>

      {/* Main Monthly Rent Ledger Table */}
      <div className="overflow-hidden rounded-2xl border border-[#DDD2B4] bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#DDD2B4] bg-[#F7F3E8] text-[11px] font-bold text-[#6B6B6B]">
              <tr>
                <th className="p-3">House & Portion</th>
                <th className="p-3">Tenant Name</th>
                <th className="p-3 text-right">Rent Due</th>
                <th className="p-3 text-right font-bold text-[#2E6B4A]">Paid Amount</th>
                <th className="p-3 text-right">Balance Due</th>
                <th className="p-3">Status</th>
                <th className="p-3">Method & Date</th>
                <th className="p-3">Payment Evidence</th>
                <th className="p-3 text-right">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD2B4]/40">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#9A9A9A]">
                    No rental records found for {selectedMonth}/{selectedYear}.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const house = db.getHouse(p.house_id);
                  const tenant = db.getTenant(p.tenant_id);
                  const evidences = db.getRentEvidence(p.id);

                  return (
                    <tr key={p.id} className="transition-colors hover:bg-[#FAF6ED]/60">
                      <td className="p-3">
                        <span className="font-bold text-[#2C2C2C]">
                          {house?.house_number || 'N/A'}
                        </span>
                        <span className="block text-[11px] text-[#6B6B6B]">
                          {house?.name || ''}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-[#2C2C2C]">
                          {tenant?.name || 'Vacant Portion'}
                        </span>
                        {tenant && (
                          <span className="block text-[11px] text-[#6B6B6B]">
                            {tenant.phone}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono-numbers font-medium text-[#2C2C2C]">
                        ₹{p.rent_due.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-right font-mono-numbers font-bold text-[#2E6B4A]">
                        ₹{p.amount_paid.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-right font-mono-numbers font-semibold text-amber-800">
                        {p.balance_due > 0 ? `₹${p.balance_due.toLocaleString('en-IN')}` : '₹0'}
                      </td>
                      <td className="p-3">
                        {p.payment_status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#2E6B4A]/10 px-2 py-0.5 text-[11px] font-bold text-[#2E6B4A]">
                            <CheckCircle className="h-3 w-3" /> Paid
                          </span>
                        ) : p.payment_status === 'partial' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                            <Clock className="h-3 w-3" /> Partial
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                            <AlertCircle className="h-3 w-3" /> Unpaid
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-[11px] text-[#6B6B6B]">
                        {p.payment_method ? (
                          <>
                            <span className="font-semibold uppercase text-[#2C2C2C]">
                              {p.payment_method}
                            </span>
                            <span className="block text-[10px]">
                              {p.payment_date || 'Date not recorded'}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3">
                        {evidences.length > 0 ? (
                          <button
                            onClick={() => onViewRentEvidence(p, evidences)}
                            className="flex items-center gap-1 rounded-md bg-[#2E6B4A]/10 px-2.5 py-1 text-[11px] font-bold text-[#2E6B4A] hover:bg-[#2E6B4A]/20"
                          >
                            <Eye className="h-3 w-3" />
                            Proof ({evidences.length})
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#9A9A9A]">No proof</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenEditPayment(p)}
                          className="rounded-lg bg-[#FAF6ED] px-2.5 py-1 text-[11px] font-bold text-[#2E6B4A] border border-[#DDD2B4] hover:bg-[#2E6B4A] hover:text-white transition-colors"
                        >
                          Record Payment
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

      {/* MODAL: RECORD / UPDATE PAYMENT STATUS & UPLOAD EVIDENCE */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDD2B4] pb-3">
              <div>
                <span className="text-[10px] font-bold tracking-wider text-[#2E6B4A] uppercase">
                  Workflow C · Payment Ledger
                </span>
                <h3 className="font-heading text-base font-bold text-[#2C2C2C]">
                  Update Rent Payment ({editingPayment.month}/{editingPayment.year})
                </h3>
              </div>
              <button
                onClick={() => setEditingPayment(null)}
                className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#DDD2B4]/40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="mt-4 space-y-4">
              {validationError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                  {validationError}
                </div>
              )}

              {/* House & Tenant Context Box */}
              <div className="rounded-xl border border-[#DDD2B4] bg-white p-3.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#6B6B6B]">Portion:</span>
                  <span className="font-bold text-[#2C2C2C]">
                    {db.getHouse(editingPayment.house_id)?.house_number} ({db.getHouse(editingPayment.house_id)?.name})
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-[#6B6B6B]">Tenant:</span>
                  <span className="font-bold text-[#2C2C2C]">
                    {db.getTenant(editingPayment.tenant_id)?.name}
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-[#6B6B6B]">Agreed Monthly Rent:</span>
                  <span className="font-mono-numbers font-bold text-[#2E6B4A]">
                    ₹{editingPayment.rent_due.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Amount Paid Input */}
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">
                  Amount Paid by Tenant (₹) *
                </label>
                <input
                  type="number"
                  value={modalAmountPaid}
                  onChange={(e) => setModalAmountPaid(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-base font-mono-numbers font-bold text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
                <div className="mt-1 flex justify-between text-[11px] text-[#6B6B6B]">
                  <span>
                    Balance Remaining:{' '}
                    <strong className="font-mono-numbers text-amber-800">
                      ₹{Math.max(0, editingPayment.rent_due - modalAmountPaid).toLocaleString('en-IN')}
                    </strong>
                  </span>
                  <span>
                    Status:{' '}
                    <strong className="capitalize text-[#2E6B4A]">
                      {modalAmountPaid >= editingPayment.rent_due
                        ? 'Paid in Full'
                        : modalAmountPaid > 0
                        ? 'Partially Paid'
                        : 'Unpaid'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Payment Method & Date */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">Payment Method</label>
                  <select
                    value={modalPaymentMethod}
                    onChange={(e) => setModalPaymentMethod(e.target.value as PaymentMethod)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs font-semibold text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  >
                    <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="bank_transfer">Bank Transfer / NEFT / IMPS</option>
                    <option value="cash">Cash in Hand</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#2C2C2C]">Payment Date</label>
                  <input
                    type="date"
                    value={modalPaymentDate}
                    onChange={(e) => setModalPaymentDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Transaction Reference Number */}
              <div>
                <label className="text-xs font-semibold text-[#2C2C2C]">
                  UPI / Transaction Reference Number (Optional)
                </label>
                <input
                  type="text"
                  value={modalTxnRef}
                  onChange={(e) => setModalTxnRef(e.target.value)}
                  placeholder="e.g. UPI/2026/198273648"
                  className="mt-1 w-full rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs font-mono-numbers text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                />
              </div>

              {/* Upload Payment Evidence Proof */}
              <div className="border-t border-[#DDD2B4] pt-3">
                <span className="text-xs font-bold text-[#2E6B4A]">
                  Payment Evidence (UPI screenshot or bank receipt)
                </span>
                <p className="text-[11px] text-[#6B6B6B]">
                  Uploaded evidence will be preserved and linked to this rent record.
                </p>

                {modalEvidenceImage ? (
                  <div className="mt-2 flex items-center justify-between rounded-xl border border-[#A9D3B7] bg-[#A9D3B7]/20 p-2.5">
                    <div className="flex items-center gap-2">
                      <FileCheck className="h-5 w-5 text-[#2E6B4A]" />
                      <span className="text-xs font-bold text-[#2C2C2C]">{modalEvidenceFileName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalEvidenceImage(null)}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#DDD2B4] bg-white p-3 text-xs font-semibold text-[#2C2C2C] hover:bg-[#FAF6ED]"
                    >
                      <Upload className="h-4 w-4 text-[#2E6B4A]" />
                      Upload Screenshot or Photo
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleEvidenceUpload}
                      className="hidden"
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#DDD2B4] pt-4">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[#6B6B6B] hover:text-[#2C2C2C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#2E6B4A] px-5 py-2 text-xs font-bold text-white hover:bg-[#3F7F5C]"
                >
                  Save & Update Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
