import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  Zap,
  AlertTriangle,
  RefreshCw,
  Eye,
  Check,
  Info,
} from 'lucide-react';
import { db } from '../services/db';
import { MeterReading, MeterEvidence, MeterVerificationStatus } from '../types';
import { compressImage, blobToDataUri } from '../services/supabase';
import { supabase } from '../services/supabase';

interface MeterReadingModuleProps {
  initialHouseId?: string;
  initialMeterId?: string;
  selectedMonth: number;
  selectedYear: number;
  onReadingSaved: () => void;
  onViewEvidence: (evidence: MeterEvidence, reading: MeterReading) => void;
}

export const MeterReadingModule: React.FC<MeterReadingModuleProps> = ({
  initialHouseId,
  initialMeterId,
  selectedMonth,
  selectedYear,
  onReadingSaved,
  onViewEvidence,
}) => {
  const houses = db.getHouses();
  const [selectedHouseId, setSelectedHouseId] = useState<string>(initialHouseId || (houses[0]?.id ?? ''));
  const metersForHouse = db.getMeters(selectedHouseId);
  const [selectedMeterId, setSelectedMeterId] = useState<string>(
    initialMeterId || (metersForHouse[0]?.id ?? '')
  );

  // Update meter if house changes
  useEffect(() => {
    if (initialHouseId) setSelectedHouseId(initialHouseId);
  }, [initialHouseId]);

  useEffect(() => {
    const list = db.getMeters(selectedHouseId);
    if (list.length > 0 && !list.find((m) => m.id === selectedMeterId)) {
      setSelectedMeterId(list[0].id);
    }
  }, [selectedHouseId, selectedMeterId]);

  // Capture / Process State
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // AI Extraction Result State
  const [extractedReading, setExtractedReading] = useState<number | null>(null);
  const [confirmedReading, setConfirmedReading] = useState<number | string>('');
  const [rawAiStatus, setRawAiStatus] = useState<string>('VERIFIED');
  const [aiNotes, setAiNotes] = useState<string>('');
  const [showConfirmScreen, setShowConfirmScreen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [softWarning, setSoftWarning] = useState<string | null>(null);
  const [savingReading, setSavingReading] = useState(false);

  // Camera video stream
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedHouse = db.getHouse(selectedHouseId);
  const selectedMeter = db.getMeter(selectedMeterId);
  const currentTenancy = selectedHouseId ? db.getCurrentTenancy(selectedHouseId) : undefined;
  const currentTenant = currentTenancy ? db.getTenant(currentTenancy.tenant_id) : undefined;
  const lastReading = selectedMeterId ? db.getLastMeterReading(selectedMeterId) : undefined;
  const previousReadingVal = lastReading ? lastReading.current_reading : 0;

  // Recent Readings for this meter
  const meterReadings = selectedMeterId ? db.getMeterReadings(undefined, selectedMeterId) : [];

  // Start HTML5 Camera
  const startCamera = async () => {
    try {
      setErrorMessage(null);
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setIsCameraActive(false);
      setErrorMessage('Could not open camera device. Please use file upload below.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Capture frame from video
  const capturePhotoFromCamera = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);

    stopCamera();

    // Convert to blob and compress to <= 1400px
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
        const compressedBlob = await compressImage(file, 1400, 0.8);
        const dataUri = await blobToDataUri(compressedBlob);
        await handleProcessImage(dataUri);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to compress captured photo.');
      }
    }, 'image/jpeg', 0.9);
  };

  // Upload photo from file input
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErrorMessage(null);
      const compressedBlob = await compressImage(file, 1400, 0.8);
      const dataUri = await blobToDataUri(compressedBlob);
      await handleProcessImage(dataUri);
    } catch {
      setErrorMessage('Failed to load image file. Please try another image.');
    }
  };

  // Main Image Processing & Direct Reading Pipeline
  const handleProcessImage = async (imageDataUrl: string) => {
    setCapturedImage(imageDataUrl);
    setIsProcessing(true);
    setErrorMessage(null);
    setSoftWarning(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch('/api/meter/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          imageBase64: imageDataUrl,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      const extracted = data.extractedReading !== null && data.extractedReading !== undefined
        ? Number(data.extractedReading)
        : null;

      setExtractedReading(extracted);
      setConfirmedReading(extracted !== null ? String(extracted) : (previousReadingVal ? String(previousReadingVal) : ''));
      setRawAiStatus(data.status || 'VERIFIED');
      setAiNotes(data.notes || '');

      // Check soft warning if reading is > 3x recent average consumption
      if (extracted !== null && previousReadingVal > 0) {
        checkConsumptionAnomaly(extracted, previousReadingVal);
      }

      setShowConfirmScreen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI reading failed';
      setExtractedReading(null);
      setConfirmedReading(previousReadingVal ? String(previousReadingVal) : '');
      setRawAiStatus('IMAGE_QUALITY_FAILURE');
      setAiNotes(msg);
      setShowConfirmScreen(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const checkConsumptionAnomaly = (cur: number, prev: number) => {
    const units = cur - prev;
    if (units <= 0) return;

    // Calculate recent average of last 3 readings
    const pastUnits = meterReadings.slice(0, 3).map((r) => r.units_consumed);
    if (pastUnits.length > 0) {
      const avg = pastUnits.reduce((a, b) => a + b, 0) / pastUnits.length;
      if (avg > 0 && units > avg * 3) {
        setSoftWarning(
          `Consumption alert: ${units.toFixed(1)} units is more than 3x the recent average (${avg.toFixed(1)} units). Please verify the digits on your meter.`
        );
      }
    }
  };

  // Confirm and Save reading to DB (Workflow B)
  const handleSaveConfirmedReading = async () => {
    if (!selectedHouse || !selectedMeter || !capturedImage) return;

    if (!currentTenant) {
      alert('This house portion currently has no tenant assigned. Please assign a tenant in the Houses module before recording EB readings.');
      return;
    }

    const finalReading = parseFloat(String(confirmedReading));
    if (isNaN(finalReading) || finalReading < 0) {
      alert('Please enter a valid numeric meter reading.');
      return;
    }

    if (previousReadingVal > 0 && finalReading < previousReadingVal) {
      alert(`The reading (${finalReading} kWh) cannot be lower than the previous reading (${previousReadingVal} kWh).`);
      return;
    }

    // Determine honest verification_status
    let status: MeterVerificationStatus = 'VERIFIED';
    if (rawAiStatus === 'IMAGE_QUALITY_FAILURE' || extractedReading === null) {
      status = 'IMAGE_QUALITY_FAILURE';
    } else if (Math.abs(finalReading - extractedReading) > 0.001 || rawAiStatus === 'NEEDS_CONFIRMATION') {
      status = 'NEEDS_CONFIRMATION';
    } else {
      status = 'VERIFIED';
    }

    setSavingReading(true);
    try {
      await db.recordMeterReading(
        {
          house_id: selectedHouse.id,
          meter_id: selectedMeter.id,
          tenant_id: currentTenant.id,
          month: selectedMonth,
          year: selectedYear,
          previous_reading: previousReadingVal,
          current_reading: Number(finalReading.toFixed(2)),
          reading_date: new Date().toISOString().split('T')[0],
          is_corrected: extractedReading !== null && Math.abs(finalReading - extractedReading) > 0.001,
          correction_reason:
            extractedReading !== null && Math.abs(finalReading - extractedReading) > 0.001
              ? 'Owner manual adjustment during reading confirmation'
              : undefined,
        },
        {
          image_url: capturedImage,
          extracted_reading: extractedReading,
          confirmed_reading: Number(finalReading.toFixed(2)),
          verification_status: status,
          captured_at: new Date().toISOString(),
        }
      );

      // Reset workflow
      setCapturedImage(null);
      setShowConfirmScreen(false);
      setSoftWarning(null);
      onReadingSaved();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save meter reading.');
    } finally {
      setSavingReading(false);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setShowConfirmScreen(false);
    setErrorMessage(null);
    setSoftWarning(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-5 shadow-xs">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-[#2E6B4A] uppercase">
              Module 2 · Intelligent Meter Reading
            </span>
            <h2 className="font-heading text-lg font-bold text-[#2C2C2C] sm:text-xl">
              Camera EB Meter Capture & Reading
            </h2>
            <p className="text-xs text-[#6B6B6B]">
              Extracts active energy kWh digits with decimal point precision directly from photographs.
            </p>
          </div>

          {/* House & Meter Selector */}
          {houses.length === 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No portions registered yet. Add a house first.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-[#6B6B6B]">Portion</label>
                <select
                  value={selectedHouseId}
                  onChange={(e) => setSelectedHouseId(e.target.value)}
                  className="rounded-lg border border-[#DDD2B4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                >
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.house_number} ({h.name})
                    </option>
                  ))}
                </select>
              </div>

            <div>
              <label className="block text-[10px] font-semibold text-[#6B6B6B]">Registered Meter</label>
              <select
                value={selectedMeterId}
                onChange={(e) => setSelectedMeterId(e.target.value)}
                className="rounded-lg border border-[#DDD2B4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
              >
                {metersForHouse.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.meter_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

        {/* Selected House Context Bar */}
        {selectedHouse && (
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[#DDD2B4]/60 pt-3 text-xs">
            <span className="text-[#6B6B6B]">
              Active Tenant: <strong className="text-[#2C2C2C]">{currentTenant?.name || 'Vacant'}</strong>
            </span>
            <span className="text-[#6B6B6B]">·</span>
            <span className="text-[#6B6B6B]">
              Previous Reading: <strong className="font-mono-numbers text-[#2C2C2C]">{previousReadingVal} kWh</strong>
            </span>
            <span className="text-[#6B6B6B]">·</span>
            <span className="text-[#6B6B6B]">
              Target Month: <strong className="text-[#2E6B4A]">{selectedMonth}/{selectedYear}</strong>
            </span>
            <span className="text-[#6B6B6B]">·</span>
            <span className="text-[#6B6B6B]">
              Responsibility: <strong>{selectedHouse.eb_responsibility === 'owner' ? 'Owner Pays EB' : 'Tenant Pays Directly'}</strong>
            </span>
          </div>
        )}
      </div>

      {/* ERROR / QUALITY NOTIFICATION */}
      {errorMessage && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div className="flex-1">
            <span className="font-bold">Image Quality Notice:</span> {errorMessage}
          </div>
          <button
            onClick={handleRetake}
            className="rounded-lg bg-rose-600 px-3 py-1 font-bold text-white hover:bg-rose-700"
          >
            Retake Photo
          </button>
        </div>
      )}

      {/* CAMERA / UPLOAD CAPTURE VIEWPORT */}
      {!showConfirmScreen && !isProcessing && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Camera Viewport */}
          <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-6 shadow-xs lg:col-span-2">
            <h3 className="font-heading text-sm font-bold text-[#2C2C2C]">
              Capture Meter Photograph
            </h3>
            <p className="mt-0.5 text-xs text-[#6B6B6B]">
              Position the digital LCD reading and meter serial number clearly in the frame.
            </p>

            <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#DDD2B4] bg-[#F2EBDC]/50 p-6 min-h-[320px]">
              {isCameraActive ? (
                <div className="relative w-full max-w-md overflow-hidden rounded-xl bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="h-72 w-full object-cover"
                  />
                  {/* Visual reticle overlay */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-44 w-64 rounded-lg border-2 border-dashed border-[#2E6B4A]/80 bg-black/10" />
                  </div>

                  <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3">
                    <button
                      onClick={capturePhotoFromCamera}
                      className="flex items-center gap-2 rounded-full bg-[#2E6B4A] px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-[#3F7F5C]"
                    >
                      <Camera className="h-4 w-4" />
                      Take Picture
                    </button>
                    <button
                      onClick={stopCamera}
                      className="rounded-full bg-black/60 px-4 py-2 text-xs font-semibold text-white hover:bg-black/80"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2E6B4A]/10 text-[#2E6B4A]">
                    <Camera className="h-7 w-7" />
                  </div>
                  <h4 className="mt-3 font-heading text-sm font-bold text-[#2C2C2C]">
                    Open Camera or Upload Image
                  </h4>
                  <p className="mt-1 max-w-sm text-xs text-[#6B6B6B]">
                    Take a live photo using your phone/webcam, or select a saved meter photo from your gallery.
                  </p>

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={startCamera}
                      className="flex items-center gap-2 rounded-xl bg-[#2E6B4A] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#3F7F5C]"
                    >
                      <Camera className="h-4 w-4" />
                      Open Camera
                    </button>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-xl border border-[#DDD2B4] bg-white px-4 py-2.5 text-xs font-bold text-[#2C2C2C] shadow-xs hover:bg-[#FAF6ED]"
                    >
                      <Upload className="h-4 w-4 text-[#2E6B4A]" />
                      Upload from Gallery
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  {/* Sample test meter helper for desktop sandbox */}
                  <div className="mt-6 border-t border-[#DDD2B4]/60 pt-3">
                    <button
                      onClick={() => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 640;
                        canvas.height = 400;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return;

                        // Dark outer meter casing
                        ctx.fillStyle = '#1e1e1e';
                        ctx.fillRect(0, 0, 640, 400);

                        // Inner meter faceplate
                        ctx.fillStyle = '#e8eee2';
                        ctx.strokeStyle = '#555555';
                        ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.roundRect(35, 35, 570, 330, 14);
                        ctx.fill();
                        ctx.stroke();

                        // Digital LCD Screen
                        ctx.fillStyle = '#8ea880';
                        ctx.strokeStyle = '#222222';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.roundRect(75, 65, 490, 120, 8);
                        ctx.fill();
                        ctx.stroke();

                        // Active Energy Reading digits with decimal value
                        ctx.fillStyle = '#111111';
                        ctx.font = 'bold 58px monospace';
                        ctx.textAlign = 'center';
                        ctx.fillText('20750.7', 280, 148);

                        // Red border highlight around the decimal tenths digit box (standard EB meter indicator)
                        ctx.strokeStyle = '#c53030';
                        ctx.lineWidth = 2.5;
                        ctx.strokeRect(340, 95, 52, 65);

                        // Unit label
                        ctx.fillStyle = '#111111';
                        ctx.font = 'bold 24px sans-serif';
                        ctx.fillText('kWh', 480, 145);

                        // Electricity Board Branding
                        ctx.fillStyle = '#222222';
                        ctx.font = 'bold 18px sans-serif';
                        ctx.fillText('ELECTRICITY DISTRIBUTION BOARD', 320, 240);

                        // Meter specs
                        ctx.fillStyle = '#555555';
                        ctx.font = '13px sans-serif';
                        ctx.fillText('1-Phase 2-Wire AC Static Energy Meter · 240V · 50Hz', 320, 290);

                        const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
                        handleProcessImage(jpegDataUrl);
                      }}
                      className="text-[11px] font-semibold text-[#2E6B4A] hover:underline"
                    >
                      ⚡ Test with synthetic meter photo (20750.7 kWh)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Historical Readings & Guidance */}
          <div className="rounded-2xl border border-[#DDD2B4] bg-[#F7F3E8] p-5 shadow-xs">
            <h3 className="font-heading text-sm font-bold text-[#2C2C2C]">
              Previous Readings & Evidences
            </h3>
            <span className="text-[11px] text-[#6B6B6B]">
              Month-by-month historical records for {selectedMeter?.meter_name || 'Meter'}
            </span>

            <div className="mt-4 space-y-2.5">
              {meterReadings.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#9A9A9A]">
                  No historical readings recorded yet.
                </div>
              ) : (
                meterReadings.slice(0, 5).map((r) => {
                  const ev = db.getMeterEvidence(r.id);
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-xl border border-[#DDD2B4] bg-white p-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-[#2C2C2C]">
                          {r.month}/{r.year}
                        </span>
                        <div className="mt-0.5 text-[11px] text-[#6B6B6B]">
                          Consumed: <strong className="font-mono-numbers text-[#2E6B4A]">{r.units_consumed} units</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono-numbers font-bold text-[#2C2C2C]">
                          {r.current_reading} kWh
                        </span>
                        {ev && (
                          <button
                            onClick={() => onViewEvidence(ev, r)}
                            className="flex items-center gap-1 rounded-md bg-[#2E6B4A]/10 px-2 py-1 text-[11px] font-bold text-[#2E6B4A] hover:bg-[#2E6B4A]/20"
                            title="Show original photo evidence"
                          >
                            <Eye className="h-3 w-3" />
                            Evidence
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* PROCESSING SKELETON */}
      {isProcessing && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-12 text-center shadow-xs">
          <RefreshCw className="h-10 w-10 animate-spin text-[#2E6B4A]" />
          <h3 className="mt-4 font-heading text-base font-bold text-[#2C2C2C]">
            Inspecting Meter Photograph...
          </h3>
          <p className="mt-1 max-w-sm text-xs text-[#6B6B6B]">
            Running client-side Laplacian blur check and Gemini multimodal vision to extract kWh digits and meter serial.
          </p>
        </div>
      )}

      {/* CONFIRMATION SCREEN */}
      {showConfirmScreen && capturedImage && (
        <div className="rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-6 shadow-md">
          <div className="flex items-center justify-between border-b border-[#DDD2B4] pb-4">
            <div>
              <span className="text-[11px] font-bold tracking-wider text-[#2E6B4A] uppercase">
                Meter Reading Confirmation
              </span>
              <h3 className="font-heading text-lg font-bold text-[#2C2C2C]">
                Confirm Meter Reading for {selectedHouse?.house_number}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRetake}
                className="flex items-center gap-1 rounded-lg border border-[#DDD2B4] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B6B6B] hover:bg-[#F2EBDC]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retake Photo
              </button>
            </div>
          </div>

          {/* Side-by-Side: Image Preview & Confirmation Form */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left: Original Meter Image */}
            <div className="flex flex-col items-center rounded-xl border border-[#DDD2B4] bg-black/5 p-3">
              <span className="mb-2 text-xs font-semibold text-[#6B6B6B]">
                Captured Meter Photograph
              </span>
              <img
                src={capturedImage}
                alt="Captured electricity meter"
                className="max-h-72 rounded-lg object-contain shadow-xs"
              />
            </div>

              {/* Right: Confirmation & Correction Form */}
            <div className="space-y-4">
              {aiNotes && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-bold">AI Observation: </span>
                    {aiNotes}
                  </div>
                </div>
              )}

              {softWarning && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>{softWarning}</div>
                </div>
              )}

              <div className="rounded-xl border border-[#DDD2B4] bg-white p-4">
                <div className="text-xs text-[#6B6B6B]">
                  AI Extracted Reading:
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono-numbers text-3xl font-bold text-[#2E6B4A]">
                    {extractedReading !== null ? `${extractedReading}` : 'Not Detected'}
                  </span>
                  <span className="text-sm font-semibold text-[#6B6B6B]">kWh</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2C2C2C]">
                  Confirmed Monthly Reading (kWh) *
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    value={confirmedReading}
                    onChange={(e) => {
                      setConfirmedReading(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num) && previousReadingVal > 0) {
                        checkConsumptionAnomaly(num, previousReadingVal);
                      }
                    }}
                    placeholder="e.g. 20750.7"
                    className="w-full rounded-xl border border-[#DDD2B4] bg-white px-4 py-2.5 text-base font-mono-numbers font-bold text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                    required
                  />
                  <span className="text-xs font-bold text-[#6B6B6B]">kWh</span>
                </div>
                <span className="mt-1 block text-[11px] text-[#6B6B6B]">
                  Includes decimal points (e.g. 20750.7). Edit if needed before saving.
                </span>
              </div>

              {/* Calculated Monthly Units Preview */}
              <div className="rounded-xl border border-[#DDD2B4] bg-[#F2EBDC] p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#6B6B6B]">Previous Month Reading:</span>
                  <span className="font-mono-numbers font-semibold text-[#2C2C2C]">
                    {previousReadingVal} kWh
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-[#DDD2B4] pt-2">
                  <span className="font-bold text-[#2C2C2C]">Units Consumed this Month:</span>
                  <span className="font-mono-numbers text-base font-bold text-[#2E6B4A]">
                    {(() => {
                      const cur = parseFloat(String(confirmedReading));
                      if (isNaN(cur) || cur < previousReadingVal) return 0;
                      return Number((cur - previousReadingVal).toFixed(2));
                    })()}{' '}
                    units
                  </span>
                </div>
              </div>

              {/* Confirm & Save Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSaveConfirmedReading}
                  disabled={savingReading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2E6B4A] py-3 text-xs font-bold text-white shadow-xs hover:bg-[#3F7F5C] disabled:opacity-60 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>{savingReading ? 'Saving Reading & Compressing Evidence...' : 'Confirm & Save Monthly Reading'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
