import React from 'react';
import {
  LayoutDashboard,
  Home,
  ReceiptText,
  Zap,
  Activity,
  BarChart3,
  Settings,
  PlusCircle,
  Menu,
  X,
  ShieldCheck,
  LogOut,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  onOpenQuickReading: () => void;
  onOpenQuickRent: () => void;
  onLogout: () => void;
}

export const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'houses', label: 'Houses & Portions', icon: Home },
  { id: 'rent', label: 'Rent Management', icon: ReceiptText },
  { id: 'meters', label: 'EB Meter Reading', icon: Zap },
  { id: 'consumption', label: 'EB Consumption', icon: Activity },
  { id: 'analytics', label: 'Income Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  mobileOpen,
  setMobileOpen,
  onOpenQuickReading,
  onOpenQuickRent,
  onLogout,
}) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-68 flex-col justify-between border-r border-[#DDD2B4] bg-[#F7F3E8] p-5 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col gap-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2E6B4A] text-white shadow-xs">
                <Home className="h-5 w-5" />
              </div>
              <div>
                <span className="font-heading text-lg font-bold tracking-tight text-[#2C2C2C]">
                  RentEase
                </span>
                <span className="block text-[11px] font-medium text-[#6B6B6B]">
                  Compound Management
                </span>
              </div>
            </div>

            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1 text-[#6B6B6B] hover:bg-[#DDD2B4]/40 lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col gap-2 rounded-xl border border-[#DDD2B4] bg-[#F2EBDC]/60 p-3">
            <span className="text-[11px] font-semibold tracking-wider text-[#6B6B6B] uppercase">
              Quick Actions
            </span>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => {
                  onOpenQuickReading();
                  setMobileOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg bg-[#2E6B4A] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#3F7F5C]"
              >
                <Zap className="h-4 w-4" />
                Capture EB Reading
              </button>
              <button
                onClick={() => {
                  onOpenQuickRent();
                  setMobileOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg border border-[#DDD2B4] bg-white px-3 py-2 text-xs font-semibold text-[#2C2C2C] transition-colors hover:bg-[#FAF6ED]"
              >
                <PlusCircle className="h-4 w-4 text-[#2E6B4A]" />
                Record Rent Payment
              </button>
            </div>
          </div>

          {/* Main Navigation */}
          <nav className="flex flex-col gap-1">
            <span className="px-2 text-[11px] font-semibold tracking-wider text-[#9A9A9A] uppercase">
              Management
            </span>
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setMobileOpen(false);
                  }}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#2E6B4A] text-white shadow-xs'
                      : 'text-[#2C2C2C] hover:bg-[#DDD2B4]/40 hover:text-[#2E6B4A]'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-[#6B6B6B]'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Footer Info & Logout */}
        <div className="border-t border-[#DDD2B4] pt-4 space-y-2.5">
          <div className="flex items-center gap-2 text-[11px] text-[#6B6B6B]">
            <ShieldCheck className="h-4 w-4 text-[#2E6B4A]" />
            <span>Secure Compound Ledger Active</span>
          </div>
          <span className="block text-[10px] text-[#9A9A9A]">
            Currency: INR (₹) · Asia/Kolkata
          </span>

          <button
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout Account
          </button>
        </div>
      </aside>
    </>
  );
};

interface HeaderProps {
  compoundName: string;
  ownerName: string;
  selectedMonth: number;
  selectedYear: number;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
  onOpenMobileMenu: () => void;
  onLogout: () => void;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const TopHeader: React.FC<HeaderProps> = ({
  compoundName,
  ownerName,
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange,
  onOpenMobileMenu,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#DDD2B4] bg-[#F7F3E8]/90 px-4 backdrop-blur-md sm:px-6">
      {/* Mobile Menu trigger & Compound Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-[#2C2C2C] hover:bg-[#DDD2B4]/40 lg:hidden cursor-pointer"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <h1 className="font-heading text-sm font-bold text-[#2C2C2C] sm:text-base">
            {compoundName}
          </h1>
          <span className="text-[11px] text-[#6B6B6B]">
            {ownerName} · Monthly Ledger
          </span>
        </div>
      </div>

      {/* Date Selectors & User Logout */}
      <div className="flex items-center gap-2">
        <select
          value={selectedMonth}
          onChange={(e) => onMonthChange(parseInt(e.target.value, 10))}
          className="rounded-lg border border-[#DDD2B4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#2C2C2C] shadow-2xs focus:border-[#2E6B4A] focus:outline-hidden"
        >
          {MONTHS.map((m, idx) => (
            <option key={m} value={idx + 1}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
          className="rounded-lg border border-[#DDD2B4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#2C2C2C] shadow-2xs focus:border-[#2E6B4A] focus:outline-hidden"
        >
          {[2024, 2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <button
          onClick={onLogout}
          className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[#DDD2B4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#6B6B6B] hover:text-rose-700 hover:border-rose-300 cursor-pointer"
          title="Sign out of owner account"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};
