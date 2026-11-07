import React, { useState, useEffect } from 'react';
import { db } from './services/db';
import { Sidebar, TopHeader } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { HousesModule } from './components/HousesModule';
import { MeterReadingModule } from './components/MeterReadingModule';
import { ConsumptionModule } from './components/ConsumptionModule';
import { RentModule } from './components/RentModule';
import { AnalyticsModule } from './components/AnalyticsModule';
import { SettingsModule } from './components/SettingsModule';
import { OnboardingModal } from './components/OnboardingModal';
import { EvidenceViewerModal } from './components/EvidenceViewerModal';
import { AuthScreen } from './components/AuthScreen';
import { MeterEvidence, MeterReading, RentPayment, RentEvidence, Owner } from './types';
import { isSupabaseConfigured, supabase } from './services/supabase';
import { AlertCircle, AlertTriangle, Download, Trash2, X, Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Owner | null>(() => db.getCurrentUser());
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [authResetMode, setAuthResetMode] = useState<boolean>(false);

  // Toast notifications for optimistic mutations or errors
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  // Legacy localStorage migration / discard prompt
  const [showLegacyModal, setShowLegacyModal] = useState<boolean>(false);

  // Month & Year state (Initialized to current date)
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  // First-time onboarding trigger
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);

  // Quick Meter capture targeting
  const [targetHouseId, setTargetHouseId] = useState<string | undefined>(undefined);
  const [targetMeterId, setTargetMeterId] = useState<string | undefined>(undefined);

  // Evidence Viewer Modal State
  const [evidenceModalOpen, setEvidenceModalOpen] = useState<boolean>(false);
  const [meterEvidenceData, setMeterEvidenceData] = useState<{
    evidence: MeterEvidence;
    reading: MeterReading;
  } | null>(null);
  const [rentEvidenceData, setRentEvidenceData] = useState<{
    payment: RentPayment;
    evidenceList: RentEvidence[];
  } | null>(null);

  // Register toast listener
  useEffect(() => {
    const unsub = db.onToast((message, type) => {
      setToast({ message, type });
      setTimeout(() => {
        setToast((current) => (current?.message === message ? null : current));
      }, 5000);
    });
    return unsub;
  }, []);

  // Supabase Auth listener & Session hydration
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsInitializing(false);
      return;
    }

    const initAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          await db.syncFromSupabase();
          setCurrentUser(db.getCurrentUser());

          if (db.hasLegacyLocalStorage()) {
            setShowLegacyModal(true);
          }
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        console.warn('Initial session sync failed:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthResetMode(true);
      } else if (event === 'SIGNED_IN' && session?.user) {
        await db.syncFromSupabase();
        setCurrentUser(db.getCurrentUser());
        if (db.hasLegacyLocalStorage()) {
          setShowLegacyModal(true);
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setCurrentTab('dashboard');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Check if owner starts with blank state (0 houses)
  useEffect(() => {
    if (!currentUser || isInitializing) return;
    const houses = db.getHouses();
    if (houses.length === 0) {
      setIsOnboardingOpen(true);
    }
  }, [refreshKey, currentUser, isInitializing]);

  const handleRefresh = () => {
    setCurrentUser(db.getCurrentUser());
    setRefreshKey((prev) => prev + 1);
  };

  const handleLogout = async () => {
    await db.logout();
    setCurrentUser(null);
    setCurrentTab('dashboard');
    handleRefresh();
  };

  const handleOpenQuickReading = (houseId?: string, meterId?: string) => {
    setTargetHouseId(houseId);
    setTargetMeterId(meterId);
    setCurrentTab('meters');
  };

  const handleOpenQuickRent = () => {
    setCurrentTab('rent');
  };

  const handleViewMeterEvidence = (evidence: MeterEvidence, reading: MeterReading) => {
    setMeterEvidenceData({ evidence, reading });
    setRentEvidenceData(null);
    setEvidenceModalOpen(true);
  };

  const handleViewRentEvidence = (payment: RentPayment, evidenceList: RentEvidence[]) => {
    setRentEvidenceData({ payment, evidenceList });
    setMeterEvidenceData(null);
    setEvidenceModalOpen(true);
  };

  // 1. Missing Supabase Environment Variables Screen
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F2EBDC] p-4 text-[#2C2C2C]">
        <div className="max-w-md w-full rounded-2xl border border-rose-300 bg-white p-6 shadow-xl">
          <div className="flex items-center gap-3 text-rose-700">
            <AlertCircle className="h-6 w-6" />
            <h2 className="font-heading text-lg font-bold">Supabase Not Configured</h2>
          </div>
          <p className="mt-3 text-xs text-[#6B6B6B] leading-relaxed">
            RentEase requires active Supabase credentials to manage your compound safely. Please configure <code className="font-mono font-bold bg-[#FAF6ED] px-1 py-0.5 rounded border border-[#DDD2B4]">VITE_SUPABASE_URL</code> and <code className="font-mono font-bold bg-[#FAF6ED] px-1 py-0.5 rounded border border-[#DDD2B4]">VITE_SUPABASE_ANON_KEY</code> in your environment.
          </p>
        </div>
      </div>
    );
  }

  // 2. Initial Session Loading Screen
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F2EBDC]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#2E6B4A]" />
          <span className="text-xs font-semibold text-[#6B6B6B]">Connecting to RentEase Cloud...</span>
        </div>
      </div>
    );
  }

  // 3. If not authenticated or in password recovery, render the AuthScreen
  if (!currentUser || authResetMode) {
    return (
      <AuthScreen
        initialMode={authResetMode ? 'reset-password' : 'login'}
        onAuthSuccess={async () => {
          setAuthResetMode(false);
          await db.syncFromSupabase();
          setCurrentUser(db.getCurrentUser());
          handleRefresh();
        }}
      />
    );
  }

  const owner = currentUser;

  return (
    <div className="flex min-h-screen bg-[#F2EBDC] text-[#2C2C2C]">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        onOpenQuickReading={() => handleOpenQuickReading()}
        onOpenQuickRent={handleOpenQuickRent}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <TopHeader
          compoundName={owner.compound_name}
          ownerName={owner.name}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onMonthChange={setSelectedMonth}
          onYearChange={setSelectedYear}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onLogout={handleLogout}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {currentTab === 'dashboard' && (
              <Dashboard
                key={refreshKey}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                onNavigate={setCurrentTab}
                onOpenQuickReading={() => handleOpenQuickReading()}
                onOpenQuickRent={handleOpenQuickRent}
              />
            )}

            {currentTab === 'houses' && (
              <HousesModule
                key={refreshKey}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                onRefresh={handleRefresh}
                onSelectCaptureMeter={(hId, mId) => handleOpenQuickReading(hId, mId)}
              />
            )}

            {currentTab === 'rent' && (
              <RentModule
                key={refreshKey}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                onRefresh={handleRefresh}
                onViewRentEvidence={handleViewRentEvidence}
              />
            )}

            {currentTab === 'meters' && (
              <MeterReadingModule
                key={`${refreshKey}-${targetHouseId || ''}`}
                initialHouseId={targetHouseId}
                initialMeterId={targetMeterId}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                onReadingSaved={handleRefresh}
                onViewEvidence={handleViewMeterEvidence}
              />
            )}

            {currentTab === 'consumption' && (
              <ConsumptionModule
                key={refreshKey}
                onRefresh={handleRefresh}
                onViewEvidence={handleViewMeterEvidence}
              />
            )}

            {currentTab === 'analytics' && (
              <AnalyticsModule
                key={refreshKey}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                onYearChange={setSelectedYear}
              />
            )}

            {currentTab === 'settings' && (
              <SettingsModule key={refreshKey} onRefresh={handleRefresh} />
            )}
          </div>
        </main>
      </div>

      {/* First-time Onboarding Wizard */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onComplete={() => {
          setIsOnboardingOpen(false);
          handleRefresh();
        }}
      />

      {/* Evidence Vault Viewer Modal */}
      <EvidenceViewerModal
        isOpen={evidenceModalOpen}
        onClose={() => setEvidenceModalOpen(false)}
        meterData={meterEvidenceData}
        rentData={rentEvidenceData}
      />

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-[#DDD2B4] bg-[#2C2C2C] px-4 py-3 text-xs font-semibold text-white shadow-xl">
          {toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Legacy Data Modal (Workflow from Review) */}
      {showLegacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="max-w-md w-full rounded-2xl border border-[#DDD2B4] bg-[#FAF6ED] p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#DDD2B4] pb-3">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-heading text-base font-bold">Old Local Data Detected</h3>
              </div>
              <button
                onClick={() => setShowLegacyModal(false)}
                className="text-[#6B6B6B] hover:text-[#2C2C2C] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-[#6B6B6B] leading-relaxed">
              We found older offline data saved in your browser from a previous version. Supabase is now your authenticated cloud database. Would you like to download a JSON backup of that older local data or discard it?
            </p>

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  db.downloadLegacyLocalStorageBackup();
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#2E6B4A] bg-[#2E6B4A] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#3F7F5C] cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download Backup of Old Local Data (JSON)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  db.discardLegacyLocalStorage();
                  setShowLegacyModal(false);
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>Discard Old Local Data</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
