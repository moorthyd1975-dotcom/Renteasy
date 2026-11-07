-- ========================================================
-- RentEase: Production-Grade Hardened Supabase PostgreSQL Schema & Private Storage
-- File: supabase/schema.sql
-- Safe for Repeated & Non-Destructive Execution (Idempotent)
-- ========================================================

-- Enable essential cryptographic extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================================
-- 1. Owners Table
-- Passwords managed exclusively via Supabase Authentication (auth.users)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.owners (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    compound_name TEXT NOT NULL DEFAULT 'My Compound',
    currency TEXT NOT NULL DEFAULT 'INR',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    eb_unit_rate NUMERIC(8, 2) DEFAULT 8.50 CHECK (eb_unit_rate >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- 2. Houses (Portions) Table
-- ========================================================
CREATE TABLE IF NOT EXISTS public.houses (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    house_number TEXT NOT NULL,
    monthly_rent NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (monthly_rent >= 0),
    move_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    eb_responsibility TEXT NOT NULL CHECK (eb_responsibility IN ('owner', 'tenant_direct')),
    eb_responsibility_effective_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- 3. Tenants Table
-- ========================================================
CREATE TABLE IF NOT EXISTS public.tenants (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    id_proof_number TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'former')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- 4. Tenancy History Table
-- Historical & active leases cross-linking houses and tenants under owner
-- ========================================================
CREATE TABLE IF NOT EXISTS public.tenancy_history (
    id TEXT PRIMARY KEY,
    house_id TEXT NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    monthly_rent_agreed NUMERIC(10, 2) NOT NULL CHECK (monthly_rent_agreed >= 0),
    deposit_amount NUMERIC(10, 2) DEFAULT 0 CHECK (deposit_amount >= 0),
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_tenancy_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ========================================================
-- 5. Meters Table
-- Serial number recognition removed entirely. Pure portion meter mapping.
-- ========================================================
CREATE TABLE IF NOT EXISTS public.meters (
    id TEXT PRIMARY KEY,
    house_id TEXT NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
    meter_name TEXT NOT NULL,
    reference_photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_meters_id_house UNIQUE (id, house_id)
);

-- ========================================================
-- 6. Meter Readings Table
-- Preserves NUMERIC(12, 2) decimal units consumed (e.g. 20750.70 kWh)
-- Includes snapshot unit_rate NUMERIC(8,2) and eb_amount NUMERIC(12,2)
-- Strict relational integrity: meter must belong to same house; tenant foreign key enforced
-- ========================================================
CREATE TABLE IF NOT EXISTS public.meter_readings (
    id TEXT PRIMARY KEY,
    house_id TEXT NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
    meter_id TEXT NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    previous_reading NUMERIC(12, 2) NOT NULL CHECK (previous_reading >= 0),
    current_reading NUMERIC(12, 2) NOT NULL,
    units_consumed NUMERIC(12, 2) NOT NULL,
    unit_rate NUMERIC(8, 2),
    eb_amount NUMERIC(12, 2),
    reading_date DATE NOT NULL DEFAULT CURRENT_DATE CHECK (reading_date >= '2020-01-01'::date),
    is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
    correction_reason TEXT,
    original_reading NUMERIC(12, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_monthly_meter_reading UNIQUE (meter_id, month, year),
    CONSTRAINT chk_meter_reading_progression CHECK (current_reading >= previous_reading),
    CONSTRAINT chk_meter_units_consumed CHECK (units_consumed = (current_reading - previous_reading)),
    CONSTRAINT fk_readings_meter_house FOREIGN KEY (meter_id, house_id) REFERENCES public.meters(id, house_id) ON DELETE CASCADE
);

-- ========================================================
-- 7. Meter Evidence Table
-- Pure numerical OCR readings; serial fields removed completely
-- ========================================================
CREATE TABLE IF NOT EXISTS public.meter_evidence (
    id TEXT PRIMARY KEY,
    reading_id TEXT NOT NULL REFERENCES public.meter_readings(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    extracted_reading NUMERIC(12, 2),
    confirmed_reading NUMERIC(12, 2) NOT NULL CHECK (confirmed_reading >= 0),
    blur_score NUMERIC(5, 2),
    ocr_confidence NUMERIC(3, 2),
    verification_status TEXT NOT NULL,
    notes TEXT,
    captured_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- 8. Rent Payments Table
-- Strict math and status constraints:
-- - amount_paid cannot be negative or exceed rent_due
-- - balance_due must equal (rent_due - amount_paid)
-- - payment_status must strictly match payment amounts
-- - Prevents duplicate records for the same house, tenant, month and year
-- ========================================================
CREATE TABLE IF NOT EXISTS public.rent_payments (
    id TEXT PRIMARY KEY,
    house_id TEXT NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    rent_due NUMERIC(10, 2) NOT NULL CHECK (rent_due >= 0),
    amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    balance_due NUMERIC(10, 2) NOT NULL CHECK (balance_due >= 0),
    payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
    payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'bank_transfer', 'other')),
    payment_date DATE,
    transaction_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_monthly_rent_payment UNIQUE (house_id, tenant_id, month, year),
    CONSTRAINT chk_rent_paid_limit CHECK (amount_paid <= rent_due),
    CONSTRAINT chk_rent_balance_math CHECK (balance_due = (rent_due - amount_paid)),
    CONSTRAINT chk_rent_status_consistency CHECK (
        (payment_status = 'paid' AND amount_paid = rent_due AND balance_due = 0) OR
        (payment_status = 'partial' AND amount_paid > 0 AND amount_paid < rent_due AND balance_due = (rent_due - amount_paid)) OR
        (payment_status = 'unpaid' AND amount_paid = 0 AND balance_due = rent_due)
    )
);

-- ========================================================
-- 9. Rent Evidence Table
-- ========================================================
CREATE TABLE IF NOT EXISTS public.rent_evidence (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL REFERENCES public.rent_payments(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    notes TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- 10. EB Payments Table
-- ========================================================
CREATE TABLE IF NOT EXISTS public.eb_payments (
    id TEXT PRIMARY KEY,
    house_id TEXT NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    bill_amount NUMERIC(10, 2) NOT NULL CHECK (bill_amount >= 0),
    payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'pending')),
    payment_date DATE,
    receipt_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- 11. Audit Logs Table
-- ========================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- Relational Integrity Trigger Functions (With Safe search_path)
-- ========================================================

-- Trigger 1: Ensures house and tenant belong to the same owner before creating a tenancy
CREATE OR REPLACE FUNCTION public.validate_tenancy_owner_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_house_owner TEXT;
    v_tenant_owner TEXT;
BEGIN
    SELECT owner_id INTO v_house_owner FROM public.houses WHERE id = NEW.house_id;
    SELECT owner_id INTO v_tenant_owner FROM public.tenants WHERE id = NEW.tenant_id;

    IF v_house_owner IS NULL THEN
        RAISE EXCEPTION 'House with ID % does not exist.', NEW.house_id;
    END IF;
    IF v_tenant_owner IS NULL THEN
        RAISE EXCEPTION 'Tenant with ID % does not exist.', NEW.tenant_id;
    END IF;
    IF v_house_owner <> v_tenant_owner THEN
        RAISE EXCEPTION 'Cross-owner tenancy prohibited: House owner (%) does not match Tenant owner (%).', v_house_owner, v_tenant_owner;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tenancy_owner ON public.tenancy_history;
CREATE TRIGGER trg_validate_tenancy_owner
    BEFORE INSERT OR UPDATE ON public.tenancy_history
    FOR EACH ROW EXECUTE FUNCTION public.validate_tenancy_owner_match();

-- Trigger 2: Validates rent payment tenant is associated with the house within the tenancy billing period
-- Evaluates tenancy strictly using billing-month overlap (start_date <= month_end AND (end_date IS NULL OR end_date >= month_start))
CREATE OR REPLACE FUNCTION public.validate_rent_payment_tenancy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    v_period_start := make_date(NEW.year, NEW.month, 1);
    v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;

    IF NOT EXISTS (
        SELECT 1 
        FROM public.tenancy_history th
        JOIN public.houses h ON h.id = th.house_id
        JOIN public.tenants t ON t.id = th.tenant_id
        WHERE th.house_id = NEW.house_id
          AND th.tenant_id = NEW.tenant_id
          AND h.owner_id = t.owner_id
          AND th.start_date <= v_period_end
          AND (th.end_date IS NULL OR th.end_date >= v_period_start)
    ) THEN
        RAISE EXCEPTION 'Tenancy period validation failed: Tenant % has no tenancy covering House % for billing month %/%.',
            NEW.tenant_id, NEW.house_id, NEW.month, NEW.year;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_rent_payment_tenancy ON public.rent_payments;
CREATE TRIGGER trg_validate_rent_payment_tenancy
    BEFORE INSERT OR UPDATE ON public.rent_payments
    FOR EACH ROW EXECUTE FUNCTION public.validate_rent_payment_tenancy();

-- Trigger 3: Validates meter reading tenant occupied the house on the actual reading_date
-- Validates that reading_date falls strictly between start_date and end_date
CREATE OR REPLACE FUNCTION public.validate_meter_reading_tenancy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM public.tenancy_history th
        JOIN public.houses h ON h.id = th.house_id
        JOIN public.tenants t ON t.id = th.tenant_id
        WHERE th.house_id = NEW.house_id
          AND th.tenant_id = NEW.tenant_id
          AND h.owner_id = t.owner_id
          AND th.start_date <= NEW.reading_date
          AND (th.end_date IS NULL OR th.end_date >= NEW.reading_date)
    ) THEN
        RAISE EXCEPTION 'Tenancy date validation failed: Tenant % was not occupying House % on reading date %.',
            NEW.tenant_id, NEW.house_id, NEW.reading_date;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_meter_reading_tenancy ON public.meter_readings;
CREATE TRIGGER trg_validate_meter_reading_tenancy
    BEFORE INSERT OR UPDATE ON public.meter_readings
    FOR EACH ROW EXECUTE FUNCTION public.validate_meter_reading_tenancy();

-- ========================================================
-- Non-Destructive Migration & Defensive Normalization Block
-- ========================================================

-- Drop deprecated/obsolete serial & password columns across pre-existing tables
ALTER TABLE public.owners DROP COLUMN IF EXISTS password;
ALTER TABLE public.meters DROP COLUMN IF EXISTS serial_number;
ALTER TABLE public.meter_evidence DROP COLUMN IF EXISTS detected_serial;
ALTER TABLE public.meter_evidence DROP COLUMN IF EXISTS registered_serial;

DO $$
DECLARE
    mr_orphans_count INTEGER := 0;
    rp_orphans_count INTEGER := 0;
    meter_mismatch_count INTEGER := 0;
    rent_invalid_math_count INTEGER := 0;
BEGIN
    -- 1. Ensure all columns in public.owners exist before altering
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'owners' AND column_name = 'compound_name') THEN
        ALTER TABLE public.owners ADD COLUMN compound_name TEXT NOT NULL DEFAULT 'My Compound';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'owners' AND column_name = 'currency') THEN
        ALTER TABLE public.owners ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'owners' AND column_name = 'timezone') THEN
        ALTER TABLE public.owners ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'owners' AND column_name = 'eb_unit_rate') THEN
        ALTER TABLE public.owners ADD COLUMN eb_unit_rate NUMERIC(8, 2) DEFAULT 8.50;
    ELSE
        ALTER TABLE public.owners ALTER COLUMN eb_unit_rate TYPE NUMERIC(8, 2);
    END IF;

    -- 2. Ensure all columns in public.houses exist before altering
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'houses' AND column_name = 'eb_responsibility') THEN
        ALTER TABLE public.houses ADD COLUMN eb_responsibility TEXT NOT NULL DEFAULT 'owner';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'houses' AND column_name = 'eb_responsibility_effective_date') THEN
        ALTER TABLE public.houses ADD COLUMN eb_responsibility_effective_date DATE DEFAULT CURRENT_DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'houses' AND column_name = 'is_active') THEN
        ALTER TABLE public.houses ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'houses' AND column_name = 'monthly_rent') THEN
        ALTER TABLE public.houses ALTER COLUMN monthly_rent TYPE NUMERIC(10, 2);
    END IF;

    -- 3. Ensure all columns in public.tenants exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'status') THEN
        ALTER TABLE public.tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'id_proof_number') THEN
        ALTER TABLE public.tenants ADD COLUMN id_proof_number TEXT;
    END IF;

    -- 4. Normalize tenancy_history columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenancy_history' AND column_name = 'monthly_rent_agreed') THEN
        ALTER TABLE public.tenancy_history ALTER COLUMN monthly_rent_agreed TYPE NUMERIC(10, 2);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenancy_history' AND column_name = 'deposit_amount') THEN
        ALTER TABLE public.tenancy_history ALTER COLUMN deposit_amount TYPE NUMERIC(10, 2);
    END IF;

    -- 5. Normalize meter_readings columns to NUMERIC(12, 2) and add unit_rate & eb_amount
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meter_readings' AND column_name = 'unit_rate') THEN
        ALTER TABLE public.meter_readings ADD COLUMN unit_rate NUMERIC(8, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meter_readings' AND column_name = 'eb_amount') THEN
        ALTER TABLE public.meter_readings ADD COLUMN eb_amount NUMERIC(12, 2);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meter_readings' AND column_name = 'previous_reading') THEN
        ALTER TABLE public.meter_readings ALTER COLUMN previous_reading TYPE NUMERIC(12, 2);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meter_readings' AND column_name = 'current_reading') THEN
        ALTER TABLE public.meter_readings ALTER COLUMN current_reading TYPE NUMERIC(12, 2);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meter_readings' AND column_name = 'units_consumed') THEN
        ALTER TABLE public.meter_readings ALTER COLUMN units_consumed TYPE NUMERIC(12, 2);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meter_readings' AND column_name = 'original_reading') THEN
        ALTER TABLE public.meter_readings ALTER COLUMN original_reading TYPE NUMERIC(12, 2);
    END IF;

    -- Heal any minor math drift in existing units_consumed
    UPDATE public.meter_readings 
    SET units_consumed = (current_reading - previous_reading)
    WHERE current_reading >= previous_reading AND units_consumed <> (current_reading - previous_reading);

    -- 6. Normalize meter_evidence numeric columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meter_evidence' AND column_name = 'extracted_reading') THEN
        ALTER TABLE public.meter_evidence ALTER COLUMN extracted_reading TYPE NUMERIC(12, 2);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meter_evidence' AND column_name = 'confirmed_reading') THEN
        ALTER TABLE public.meter_evidence ALTER COLUMN confirmed_reading TYPE NUMERIC(12, 2);
    END IF;

    -- 7. Normalize rent_payments numeric columns & heal math
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rent_payments' AND column_name = 'rent_due') THEN
        ALTER TABLE public.rent_payments ALTER COLUMN rent_due TYPE NUMERIC(10, 2);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rent_payments' AND column_name = 'amount_paid') THEN
        ALTER TABLE public.rent_payments ALTER COLUMN amount_paid TYPE NUMERIC(10, 2);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rent_payments' AND column_name = 'balance_due') THEN
        ALTER TABLE public.rent_payments ALTER COLUMN balance_due TYPE NUMERIC(10, 2);
    END IF;

    -- Heal any minor legacy balance_due drift where amount_paid <= rent_due
    UPDATE public.rent_payments
    SET balance_due = (rent_due - amount_paid)
    WHERE amount_paid <= rent_due AND balance_due <> (rent_due - amount_paid);

    -- 8. Normalize eb_payments numeric columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'eb_payments' AND column_name = 'bill_amount') THEN
        ALTER TABLE public.eb_payments ALTER COLUMN bill_amount TYPE NUMERIC(10, 2);
    END IF;

    -- 9. Check for NULL, empty, or orphaned tenant_id in meter_readings before applying Foreign Key
    UPDATE public.meter_readings mr
    SET tenant_id = th.tenant_id
    FROM public.tenancy_history th
    WHERE (mr.tenant_id IS NULL OR mr.tenant_id = '' OR mr.tenant_id = 'unknown-tenant')
      AND th.house_id = mr.house_id
      AND (
          th.is_current = TRUE
          OR (
              th.start_date <= mr.reading_date
              AND (th.end_date IS NULL OR th.end_date >= mr.reading_date)
          )
      );

    SELECT COUNT(*) INTO mr_orphans_count
    FROM public.meter_readings mr
    WHERE mr.tenant_id IS NULL 
       OR mr.tenant_id = '' 
       OR mr.tenant_id NOT IN (SELECT id FROM public.tenants);

    IF mr_orphans_count > 0 THEN
        RAISE WARNING 'meter_readings contains % record(s) with NULL, empty, or unresolvable tenant_id. Foreign key meter_readings_tenant_id_fkey was SKIPPED.', mr_orphans_count;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meter_readings_tenant_id_fkey') THEN
            ALTER TABLE public.meter_readings
            ADD CONSTRAINT meter_readings_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- 10. Check for NULL, empty, or orphaned tenant_id in rent_payments before applying Foreign Key
    UPDATE public.rent_payments rp
    SET tenant_id = th.tenant_id
    FROM public.tenancy_history th
    WHERE (rp.tenant_id IS NULL OR rp.tenant_id = '' OR rp.tenant_id = 'unknown-tenant')
      AND th.house_id = rp.house_id
      AND (
          th.is_current = TRUE
          OR (
              th.start_date <= (make_date(rp.year, rp.month, 1) + interval '1 month' - interval '1 day')::date
              AND (th.end_date IS NULL OR th.end_date >= make_date(rp.year, rp.month, 1))
          )
      );

    SELECT COUNT(*) INTO rp_orphans_count
    FROM public.rent_payments rp
    WHERE rp.tenant_id IS NULL 
       OR rp.tenant_id = '' 
       OR rp.tenant_id NOT IN (SELECT id FROM public.tenants);

    IF rp_orphans_count > 0 THEN
        RAISE WARNING 'rent_payments contains % record(s) with NULL, empty, or unresolvable tenant_id. Foreign key rent_payments_tenant_id_fkey was SKIPPED.', rp_orphans_count;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_tenant_id_fkey') THEN
            ALTER TABLE public.rent_payments
            ADD CONSTRAINT rent_payments_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- 11. Ensure meters(id, house_id) unique constraint exists for composite meter verification
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_meters_id_house') THEN
        ALTER TABLE public.meters ADD CONSTRAINT uq_meters_id_house UNIQUE (id, house_id);
    END IF;

    SELECT COUNT(*) INTO meter_mismatch_count
    FROM public.meter_readings mr
    JOIN public.meters m ON m.id = mr.meter_id
    WHERE mr.house_id <> m.house_id;

    IF meter_mismatch_count > 0 THEN
        RAISE WARNING 'meter_readings contains % record(s) where reading house_id does not match meter house_id.', meter_mismatch_count;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_readings_meter_house') THEN
            ALTER TABLE public.meter_readings
            ADD CONSTRAINT fk_readings_meter_house
            FOREIGN KEY (meter_id, house_id) REFERENCES public.meters(id, house_id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- 12. Safe check constraints for rent_payments
    SELECT COUNT(*) INTO rent_invalid_math_count
    FROM public.rent_payments
    WHERE amount_paid > rent_due OR balance_due <> (rent_due - amount_paid);

    IF rent_invalid_math_count > 0 THEN
        RAISE WARNING 'rent_payments contains % record(s) with invalid math.', rent_invalid_math_count;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rent_paid_limit') THEN
            ALTER TABLE public.rent_payments ADD CONSTRAINT chk_rent_paid_limit CHECK (amount_paid <= rent_due);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rent_balance_math') THEN
            ALTER TABLE public.rent_payments ADD CONSTRAINT chk_rent_balance_math CHECK (balance_due = (rent_due - amount_paid));
        END IF;
    END IF;
END $$;

-- ========================================================
-- Query Performance Indexes
-- ========================================================
CREATE INDEX IF NOT EXISTS idx_houses_owner ON public.houses(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON public.tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenancy_house ON public.tenancy_history(house_id);
CREATE INDEX IF NOT EXISTS idx_tenancy_tenant ON public.tenancy_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meters_house ON public.meters(house_id);
CREATE INDEX IF NOT EXISTS idx_readings_meter ON public.meter_readings(meter_id);
CREATE INDEX IF NOT EXISTS idx_readings_house ON public.meter_readings(house_id);
CREATE INDEX IF NOT EXISTS idx_readings_tenant ON public.meter_readings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_payments_house ON public.rent_payments(house_id);
CREATE INDEX IF NOT EXISTS idx_rent_payments_tenant ON public.rent_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_owner ON public.audit_logs(owner_id);

-- ========================================================
-- Secure Supabase Auth Trigger with Fixed search_path
-- Automatically synchronizes authenticated users from auth.users into public.owners
-- ========================================================
CREATE OR REPLACE FUNCTION public.handle_new_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.owners (id, email, name, compound_name)
  VALUES (
    NEW.id::text,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'compound_name', 'My Compound')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_owner() FROM public;
GRANT EXECUTE ON FUNCTION public.handle_new_owner() TO postgres, service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_owner();

-- ========================================================
-- Row Level Security (RLS) Configuration
-- ========================================================
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenancy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eb_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Clean up any legacy unrestricted policies
DROP POLICY IF EXISTS "Allow all operations on owners" ON public.owners;
DROP POLICY IF EXISTS "Allow all operations on houses" ON public.houses;
DROP POLICY IF EXISTS "Allow all operations on tenants" ON public.tenants;
DROP POLICY IF EXISTS "Allow all operations on tenancy_history" ON public.tenancy_history;
DROP POLICY IF EXISTS "Allow all operations on meters" ON public.meters;
DROP POLICY IF EXISTS "Allow all operations on meter_readings" ON public.meter_readings;
DROP POLICY IF EXISTS "Allow all operations on meter_evidence" ON public.meter_evidence;
DROP POLICY IF EXISTS "Allow all operations on rent_payments" ON public.rent_payments;
DROP POLICY IF EXISTS "Allow all operations on rent_evidence" ON public.rent_evidence;
DROP POLICY IF EXISTS "Allow all operations on eb_payments" ON public.eb_payments;
DROP POLICY IF EXISTS "Allow all operations on audit_logs" ON public.audit_logs;

-- Clean up prior owner policies for idempotent execution
DROP POLICY IF EXISTS "owners_owner_policy" ON public.owners;
DROP POLICY IF EXISTS "houses_owner_policy" ON public.houses;
DROP POLICY IF EXISTS "tenants_owner_policy" ON public.tenants;
DROP POLICY IF EXISTS "tenancy_owner_policy" ON public.tenancy_history;
DROP POLICY IF EXISTS "meters_owner_policy" ON public.meters;
DROP POLICY IF EXISTS "meter_readings_owner_policy" ON public.meter_readings;
DROP POLICY IF EXISTS "meter_evidence_owner_policy" ON public.meter_evidence;
DROP POLICY IF EXISTS "rent_payments_owner_policy" ON public.rent_payments;
DROP POLICY IF EXISTS "rent_evidence_owner_policy" ON public.rent_evidence;
DROP POLICY IF EXISTS "eb_payments_owner_policy" ON public.eb_payments;
DROP POLICY IF EXISTS "audit_logs_owner_policy" ON public.audit_logs;

-- 1. Owners RLS: Owner can access and manage only their own owner record
CREATE POLICY "owners_owner_policy"
ON public.owners FOR ALL
TO authenticated
USING (id = auth.uid()::text)
WITH CHECK (id = auth.uid()::text);

-- 2. Houses RLS: Owner can access and manage only their houses
CREATE POLICY "houses_owner_policy"
ON public.houses FOR ALL
TO authenticated
USING (owner_id = auth.uid()::text)
WITH CHECK (owner_id = auth.uid()::text);

-- 3. Tenants RLS: Owner can access and manage only their registered tenants
CREATE POLICY "tenants_owner_policy"
ON public.tenants FOR ALL
TO authenticated
USING (owner_id = auth.uid()::text)
WITH CHECK (owner_id = auth.uid()::text);

-- 4. Tenancy History RLS: Validates BOTH house and tenant belong to the authenticated owner
CREATE POLICY "tenancy_owner_policy"
ON public.tenancy_history FOR ALL
TO authenticated
USING (
    house_id IN (SELECT id FROM public.houses WHERE owner_id = auth.uid()::text)
    AND tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()::text)
)
WITH CHECK (
    house_id IN (SELECT id FROM public.houses WHERE owner_id = auth.uid()::text)
    AND tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()::text)
);

-- 5. Meters RLS: Validates meter is installed in a house owned by the authenticated owner
CREATE POLICY "meters_owner_policy"
ON public.meters FOR ALL
TO authenticated
USING (house_id IN (SELECT id FROM public.houses WHERE owner_id = auth.uid()::text))
WITH CHECK (house_id IN (SELECT id FROM public.houses WHERE owner_id = auth.uid()::text));

-- 6. Meter Readings RLS:
-- Validates house and tenant belong to owner, meter belongs to house, AND tenant occupied the house on the actual reading_date
CREATE POLICY "meter_readings_owner_policy"
ON public.meter_readings FOR ALL
TO authenticated
USING (
    house_id IN (SELECT id FROM public.houses WHERE owner_id = auth.uid()::text)
    AND tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()::text)
    AND meter_id IN (
        SELECT m.id FROM public.meters m
        WHERE m.house_id = public.meter_readings.house_id
    )
    AND EXISTS (
        SELECT 1 FROM public.tenancy_history th
        JOIN public.houses h ON h.id = th.house_id
        JOIN public.tenants t ON t.id = th.tenant_id
        WHERE th.house_id = public.meter_readings.house_id
          AND th.tenant_id = public.meter_readings.tenant_id
          AND h.owner_id = auth.uid()::text
          AND t.owner_id = auth.uid()::text
          AND th.start_date <= public.meter_readings.reading_date
          AND (th.end_date IS NULL OR th.end_date >= public.meter_readings.reading_date)
    )
)
WITH CHECK (
    house_id IN (SELECT id FROM public.houses WHERE owner_id = auth.uid()::text)
    AND tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()::text)
    AND meter_id IN (
        SELECT m.id FROM public.meters m
        WHERE m.house_id = public.meter_readings.house_id
    )
    AND EXISTS (
        SELECT 1 FROM public.tenancy_history th
        JOIN public.houses h ON h.id = th.house_id
        JOIN public.tenants t ON t.id = th.tenant_id
        WHERE th.house_id = public.meter_readings.house_id
          AND th.tenant_id = public.meter_readings.tenant_id
          AND h.owner_id = auth.uid()::text
          AND t.owner_id = auth.uid()::text
          AND th.start_date <= public.meter_readings.reading_date
          AND (th.end_date IS NULL OR th.end_date >= public.meter_readings.reading_date)
    )
);

-- 7. Meter Evidence RLS: Validates reading belongs to a house owned by authenticated owner
CREATE POLICY "meter_evidence_owner_policy"
ON public.meter_evidence FOR ALL
TO authenticated
USING (
    reading_id IN (
        SELECT mr.id FROM public.meter_readings mr
        JOIN public.houses h ON h.id = mr.house_id
        WHERE h.owner_id = auth.uid()::text
    )
)
WITH CHECK (
    reading_id IN (
        SELECT mr.id FROM public.meter_readings mr
        JOIN public.houses h ON h.id = mr.house_id
        WHERE h.owner_id = auth.uid()::text
    )
);

-- 8. Rent Payments RLS:
-- Validates house and tenant belong to owner AND tenancy covers the billing month
CREATE POLICY "rent_payments_owner_policy"
ON public.rent_payments FOR ALL
TO authenticated
USING (
    house_id IN (SELECT id FROM public.houses WHERE owner_id = auth.uid()::text)
    AND tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()::text)
    AND EXISTS (
        SELECT 1 FROM public.tenancy_history th
        JOIN public.houses h ON h.id = th.house_id
        JOIN public.tenants t ON t.id = th.tenant_id
        WHERE th.house_id = public.rent_payments.house_id
          AND th.tenant_id = public.rent_payments.tenant_id
          AND h.owner_id = auth.uid()::text
          AND t.owner_id = auth.uid()::text
          AND th.start_date <= (make_date(public.rent_payments.year, public.rent_payments.month, 1) + interval '1 month' - interval '1 day')::date
          AND (th.end_date IS NULL OR th.end_date >= make_date(public.rent_payments.year, public.rent_payments.month, 1))
    )
)
WITH CHECK (
    house_id IN (SELECT id FROM public.houses WHERE owner_id = auth.uid()::text)
    AND tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()::text)
    AND EXISTS (
        SELECT 1 FROM public.tenancy_history th
        JOIN public.houses h ON h.id = th.house_id
        JOIN public.tenants t ON t.id = th.tenant_id
        WHERE th.house_id = public.rent_payments.house_id
          AND th.tenant_id = public.rent_payments.tenant_id
          AND h.owner_id = auth.uid()::text
          AND t.owner_id = auth.uid()::text
          AND th.start_date <= (make_date(public.rent_payments.year, public.rent_payments.month, 1) + interval '1 month' - interval '1 day')::date
          AND (th.end_date IS NULL OR th.end_date >= make_date(public.rent_payments.year, public.rent_payments.month, 1))
    )
);

-- 9. Rent Evidence RLS: Validates payment belongs to owner's house
CREATE POLICY "rent_evidence_owner_policy"
ON public.rent_evidence FOR ALL
TO authenticated
USING (
    payment_id IN (
        SELECT rp.id FROM public.rent_payments rp
        JOIN public.houses h ON h.id = rp.house_id
        WHERE h.owner_id = auth.uid()::text
    )
)
WITH CHECK (
    payment_id IN (
        SELECT rp.id FROM public.rent_payments rp
        JOIN public.houses h ON h.id = rp.house_id
        WHERE h.owner_id = auth.uid()::text
    )
);

-- 10. EB Payments RLS: Validates house belongs to authenticated owner
CREATE POLICY "eb_payments_owner_policy"
ON public.eb_payments FOR ALL
TO authenticated
USING (house_id IN (SELECT id FROM public.houses WHERE owner_id = auth.uid()::text))
WITH CHECK (house_id IN (SELECT id FROM public.houses WHERE owner_id = auth.uid()::text));

-- 11. Audit Logs RLS: Validates owner_id matches authenticated owner
CREATE POLICY "audit_logs_owner_policy"
ON public.audit_logs FOR ALL
TO authenticated
USING (owner_id = auth.uid()::text)
WITH CHECK (owner_id = auth.uid()::text);

-- ========================================================
-- PRIVATE Storage Bucket Provisioning
-- Bucket: rentease-evidence (public = false)
-- Limit: 5MB (5242880 bytes), JPEG / PNG / WebP only
-- ========================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'rentease-evidence',
    'rentease-evidence',
    false, -- Strictly private
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ========================================================
-- Storage Security Policy Cleanup
-- Dynamically drops any broad or legacy storage policies targeting rentease-evidence
-- ========================================================
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND (
            policyname IN (
                'Public Access for rentease-evidence',
                'Owner storage select policy',
                'Owner storage insert policy',
                'Owner storage update policy',
                'Owner storage delete policy'
            )
            OR (
                (policyname ILIKE '%rentease%' OR policyname ILIKE '%evidence%')
                AND NOT (policyname ILIKE '%avatar%' OR policyname ILIKE '%profile_photo%')
            )
            OR (
                COALESCE(qual, '') ILIKE '%rentease-evidence%' 
                OR COALESCE(with_check, '') ILIKE '%rentease-evidence%'
            )
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- ========================================================
-- Strict Owner Folder Isolation Storage Policies
-- Storage Path Structure: <owner_id>/<rent|meter|profile>/<filename>
-- Enforces: (storage.foldername(name))[1] = auth.uid()::text
-- ========================================================

-- 1. Storage SELECT: Owner can only view files within their own folder
CREATE POLICY "Owner storage select policy"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'rentease-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Storage INSERT: Owner can only upload files within their own folder
CREATE POLICY "Owner storage insert policy"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'rentease-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Storage UPDATE: Owner can only modify files within their own folder
CREATE POLICY "Owner storage update policy"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'rentease-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'rentease-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Storage DELETE: Owner can only delete files within their own folder
CREATE POLICY "Owner storage delete policy"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'rentease-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ========================================================
-- VERIFICATION QUERIES (Run these in Supabase SQL editor to verify setup)
-- ========================================================
/*
-- 1. Verify all 11 public tables exist with RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Verify all RLS policies on public tables and storage.objects
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- 3. Verify triggers are attached to their respective tables
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema IN ('public', 'auth')
ORDER BY event_object_table, trigger_name;

-- 4. Verify private storage bucket 'rentease-evidence'
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'rentease-evidence';
*/
