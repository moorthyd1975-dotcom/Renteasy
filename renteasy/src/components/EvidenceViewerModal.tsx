import React, { useState, useEffect } from 'react';
import { X, CheckCircle, ShieldCheck, Calendar, User, Zap, Download, Loader2 } from 'lucide-react';
import { MeterEvidence, MeterReading, RentPayment, RentEvidence } from '../types';
import { db } from '../services/db';
import { getEvidenceSignedUrl } from '../services/supabase';

interface EvidenceViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  meterData?: {
    evidence: MeterEvidence;
    reading: MeterReading;
  } | null;
  rentData?: {
    payment: RentPayment;
    evidenceList: RentEvidence[];
  } | null;
}

export const EvidenceViewerModal: React.FC<EvidenceViewerModalProps> = ({
  isOpen,
  onClose,
  meterData,
  rentData,
}) => {
  const [resolvedMeterImageUrl, setResolvedMeterImageUrl] = useState<string | null>(null);
  const [resolvedRentImageUrls, setResolvedRentImageUrls] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setResolvedMeterImageUrl(null);
      setResolvedRentImageUrls({});
      return;
    }

    let isMounted = true;
    setLoadingImages(true);

    const resolveUrls = async () => {
      try {
        if (meterData?.evidence.image_url) {
          const url = await getEvidenceSignedUrl(meterData.evidence.image_url);
          if (isMounted) setResolvedMeterImageUrl(url);
        }

        if (rentData?.evidenceList && rentData.evidenceList.length > 0) {
          const map: Record<string, string> = {};
          for (const ev of rentData.evidenceList) {
            const url = await getEvidenceSignedUrl(ev.image_url);
            map[ev.id] = url;
          }
          if (isMounted) setResolvedRentImageUrls(map);
        }
      } finally {
        if (isMounted) setLoadingImages(false);
      }
    };

    resolveUrls();
    return () => {
      isMounted = false;
    };
  }, [isOpen, meterData, rentData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#DDD2B4] pb-4">
          <div>
            <span className="text-[10px] font-bold tracking-wider text-[#2E6B4A] uppercase">
              Permanent Evidence Vault
            </span>
            <h3 className="font-heading text-base font-bold text-[#2C2C2C]">
              {meterData ? 'EB Meter Photograph & OCR Evidence' : 'Rent Payment Proof & Receipt'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#DDD2B4]/40 hover:text-[#2C2C2C] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* METER EVIDENCE VIEW */}
        {meterData && (
          <div className="mt-4 space-y-4">
            {/* Image Preview Container */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-[#DDD2B4] bg-black/10 p-3 min-h-[220px]">
              {loadingImages ? (
                <div className="flex items-center gap-2 text-xs text-[#6B6B6B]">
                  <Loader2 className="h-5 w-5 animate-spin text-[#2E6B4A]" />
                  <span>Loading secured image...</span>
                </div>
              ) : (
                <img
                  src={resolvedMeterImageUrl || meterData.evidence.image_url}
                  alt="Preserved EB Meter Evidence"
                  className="max-h-80 w-auto rounded-lg object-contain shadow-xs"
                />
              )}
              <span className="mt-2 text-[11px] text-[#6B6B6B]">
                Captured on {new Date(meterData.evidence.captured_at).toLocaleString('en-IN')}
              </span>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#DDD2B4] bg-white p-4 text-xs sm:grid-cols-4">
              <div>
                <span className="text-[#9A9A9A]">Portion:</span>
                <span className="block font-bold text-[#2C2C2C]">
                  {db.getHouse(meterData.reading.house_id)?.house_number}
                </span>
                <span className="text-[10px] text-[#6B6B6B]">
                  {db.getHouse(meterData.reading.house_id)?.name}
                </span>
              </div>

              <div>
                <span className="text-[#9A9A9A]">Tenant at Capture:</span>
                <span className="block font-bold text-[#2C2C2C]">
                  {db.getTenant(meterData.reading.tenant_id)?.name || 'Vacant'}
                </span>
              </div>

              <div>
                <span className="text-[#9A9A9A]">Target Month:</span>
                <span className="block font-bold text-[#2C2C2C]">
                  {meterData.reading.month}/{meterData.reading.year}
                </span>
                <span className="text-[10px] text-[#6B6B6B]">
                  Recorded on {meterData.reading.reading_date}
                </span>
              </div>

              <div>
                <span className="text-[#9A9A9A]">Status:</span>
                <span className="block font-bold text-[#2E6B4A]">
                  Saved & Confirmed
                </span>
                <span className="text-[10px] text-[#6B6B6B]">
                  Direct kWh Reading
                </span>
              </div>
            </div>

            {/* Reading Numbers Comparison Strip */}
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-[#DDD2B4] bg-[#FAF6ED] p-3 text-center text-xs">
              <div>
                <span className="text-[#6B6B6B]">Previous Reading</span>
                <div className="font-mono-numbers font-semibold text-[#2C2C2C]">
                  {meterData.reading.previous_reading} kWh
                </div>
              </div>
              <div className="border-x border-[#DDD2B4]">
                <span className="text-[#6B6B6B]">Confirmed Reading</span>
                <div className="font-mono-numbers text-base font-bold text-[#2C2C2C]">
                  {meterData.reading.current_reading} kWh
                </div>
              </div>
              <div>
                <span className="text-[#6B6B6B]">Units Consumed</span>
                <div className="font-mono-numbers text-base font-bold text-[#2E6B4A]">
                  {meterData.reading.units_consumed} units
                </div>
              </div>
            </div>

            {meterData.reading.is_corrected && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <span className="font-bold">Manual Correction Recorded:</span>{' '}
                {meterData.reading.correction_reason} (Original: {meterData.reading.original_reading} kWh)
              </div>
            )}
          </div>
        )}

        {/* RENT PAYMENT EVIDENCE VIEW */}
        {rentData && (
          <div className="mt-4 space-y-4">
            {rentData.evidenceList.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#9A9A9A]">
                No screenshot uploaded for this payment record.
              </div>
            ) : (
              rentData.evidenceList.map((ev) => (
                <div
                  key={ev.id}
                  className="flex flex-col items-center rounded-xl border border-[#DDD2B4] bg-black/10 p-3"
                >
                  <img
                    src={resolvedRentImageUrls[ev.id] || ev.image_url}
                    alt={ev.file_name}
                    className="max-h-80 w-auto rounded-lg object-contain shadow-xs"
                  />
                  <span className="mt-2 text-xs font-semibold text-[#2C2C2C]">
                    {ev.file_name} · Uploaded on {new Date(ev.uploaded_at).toLocaleString('en-IN')}
                  </span>
                </div>
              ))
            )}

            {/* Payment Details */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#DDD2B4] bg-white p-4 text-xs sm:grid-cols-4">
              <div>
                <span className="text-[#9A9A9A]">Portion:</span>
                <span className="block font-bold text-[#2C2C2C]">
                  {db.getHouse(rentData.payment.house_id)?.house_number}
                </span>
              </div>
              <div>
                <span className="text-[#9A9A9A]">Tenant:</span>
                <span className="block font-bold text-[#2C2C2C]">
                  {db.getTenant(rentData.payment.tenant_id)?.name}
                </span>
              </div>
              <div>
                <span className="text-[#9A9A9A]">Month / Year:</span>
                <span className="block font-bold text-[#2C2C2C]">
                  {rentData.payment.month}/{rentData.payment.year}
                </span>
              </div>
              <div>
                <span className="text-[#9A9A9A]">Amount Paid:</span>
                <span className="block font-mono-numbers font-bold text-[#2E6B4A]">
                  ₹{rentData.payment.amount_paid.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[#DDD2B4] bg-[#FAF6ED] p-3 text-xs">
              <div>
                <span className="text-[#6B6B6B]">Payment Method:</span>{' '}
                <strong className="uppercase text-[#2C2C2C]">
                  {rentData.payment.payment_method || '—'}
                </strong>
              </div>
              {rentData.payment.transaction_reference && (
                <div>
                  <span className="text-[#6B6B6B]">Txn Ref:</span>{' '}
                  <strong className="font-mono-numbers text-[#2C2C2C]">
                    {rentData.payment.transaction_reference}
                  </strong>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end border-t border-[#DDD2B4] pt-4">
          <button
            onClick={onClose}
            className="rounded-xl bg-[#2E6B4A] px-5 py-2 text-xs font-bold text-white hover:bg-[#3F7F5C]"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
