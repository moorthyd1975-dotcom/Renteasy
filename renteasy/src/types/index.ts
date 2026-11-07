/**
 * RentEase Core Data Models & Schema Types
 */

export interface Owner {
  id: string;
  email: string;
  name: string;
  phone: string;
  compound_name: string;
  currency: string; // e.g. "INR"
  timezone: string; // e.g. "Asia/Kolkata"
  eb_unit_rate: number; // e.g. ₹8.50 per unit
  created_at: string;
}

export type EBResponsibility = 'owner' | 'tenant_direct';

export interface House {
  id: string;
  owner_id: string;
  name: string; // Portion name e.g. "Ground Floor Front"
  house_number: string; // e.g. "Portion 1A", "House 01"
  monthly_rent: number;
  move_in_date: string;
  description?: string;
  eb_responsibility: EBResponsibility;
  eb_responsibility_effective_date?: string;
  is_active: boolean;
  created_at: string;
}

export interface Tenant {
  id: string;
  owner_id: string;
  name: string;
  phone: string;
  email?: string;
  id_proof_number?: string;
  status: 'active' | 'former';
  created_at: string;
}

export interface TenancyHistory {
  id: string;
  house_id: string;
  tenant_id: string;
  start_date: string;
  end_date?: string;
  monthly_rent_agreed: number;
  deposit_amount?: number;
  is_current: boolean;
  notes?: string;
  created_at: string;
}

export interface Meter {
  id: string;
  house_id: string;
  meter_name: string; // e.g. "TNEB Digital Meter 1"
  reference_photo_url?: string;
  created_at: string;
}

export type MeterVerificationStatus =
  | 'VERIFIED'
  | 'NEEDS_CONFIRMATION'
  | 'POTENTIAL_MISMATCH'
  | 'INVALID_READING'
  | 'IMAGE_QUALITY_FAILURE';

export interface MeterReading {
  id: string;
  house_id: string;
  meter_id: string;
  tenant_id: string;
  month: number; // 1-12
  year: number;
  previous_reading: number;
  current_reading: number;
  units_consumed: number;
  unit_rate?: number | null;
  eb_amount?: number | null;
  reading_date: string;
  is_corrected: boolean;
  correction_reason?: string;
  original_reading?: number;
  created_at: string;
  updated_at?: string;
}

export interface MeterEvidence {
  id: string;
  reading_id: string;
  image_url: string; // Storage path, Base64 data URL, or remote URL
  extracted_reading: number | null;
  confirmed_reading: number;
  blur_score?: number; // 0 to 100+
  ocr_confidence?: number; // 0 to 1
  verification_status: MeterVerificationStatus;
  notes?: string;
  captured_at: string;
}

export type PaymentStatus = 'paid' | 'unpaid' | 'partial';
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'other';

export interface RentPayment {
  id: string;
  house_id: string;
  tenant_id: string;
  month: number; // 1-12
  year: number;
  rent_due: number;
  amount_paid: number;
  balance_due: number;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  payment_date?: string;
  transaction_reference?: string;
  created_at: string;
  updated_at: string;
}

export interface RentEvidence {
  id: string;
  payment_id: string;
  image_url: string;
  file_name: string;
  notes?: string;
  uploaded_at: string;
}

export interface EBPayment {
  id: string;
  house_id: string;
  month: number;
  year: number;
  bill_amount: number;
  payment_status: 'paid' | 'pending';
  payment_date?: string;
  receipt_url?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  owner_id?: string;
  entity_type: 'rent_payment' | 'meter_reading' | 'house' | 'tenant' | 'tenancy' | 'owner';
  entity_id: string;
  action: 'create' | 'update' | 'correct' | 'archive' | 'transfer';
  details: string;
  timestamp: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  connected: boolean;
  lastTestedAt?: string;
}
