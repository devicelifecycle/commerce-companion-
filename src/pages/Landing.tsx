import { ArrowRight, Menu, X, Package, BarChart3, Globe, TrendingUp, Shield, Zap, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import warehouseLogo from '@/assets/warehouse-logo.png';

const BG_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_155101_f2540600-6fe9-433e-8e48-b3f4b72f0727.mp4';

const NAV_ITEMS = ['Features', 'Integrations', 'Accounting', 'Marketplace', 'Insights'];

const FEATURES = [
  { icon: Package,    label: 'Inventory Tracking',  desc: 'Real-time stock across both entities & FBA' },
  { icon: BarChart3,  label: 'Financial Reports',   desc: 'P&L, balance sheets, and tax filing' },
  { icon: Globe,      label: 'Marketplace Sync',    desc: 'Shopify, Amazon & Best Buy integration' },
  { icon: TrendingUp, label: 'Profit Analytics',    desc: 'Per-unit COGS, margins & fee analysis' },
  { icon: Shield,     label: 'Tax Compliance',      desc: 'GST/HST/PST tracking & CRA reporting' },
  { icon: Zap,        label: 'Automation',          desc: 'Auto journal entries & order imports' },
];

/* ─────────────────────────── Hamburger ─────────────────────────── */
function HamburgerButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden relative w-9 h-9 flex items-center justify-center rounded-full transition-all duration-300"
      style={{ backgroundColor: open ? '#1a1a1a' : 'transparent' }}
      aria-label="Toggle menu"
    >
      <span
        className="absolute transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ opacity: open ? 0 : 1, transform: open ? 'rotate(-90deg) scale(0.5)' : 'rotate(0deg) scale(1)' }}
      >
        <Menu size={20} color="white" strokeWidth={1.5} />
      </span>
      <span
        className="absolute transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ opacity: open ? 1 : 0, transform: open ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.5)' }}
      >
        <X size={20} color="white" strokeWidth={1.5} />
      </span>
    </button>
  );
}

/* ─────────────────────────── Mobile Menu ─────────────────────────── */
function MobileMenu({ open, onClose, onSignIn }: { open: boolean; onClose: () => void; onSignIn: () => void }) {
  return (
    <>
      <div
        className="fixed inset-0 z-30 lg:hidden transition-all duration-500"
        style={{
          backdropFilter: open ? 'blur(12px)' : 'blur(0px)',
          backgroundColor: open ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={onClose}
      />
      <div
        className="fixed top-0 left-0 right-0 z-40 lg:hidden overflow-hidden"
        style={{ maxHeight: open ? '480px' : '0px', transition: 'max-height 0.5s cubic-bezier(0.23, 1, 0.32, 1)' }}
      >
        <div
          className="pt-20 pb-6 px-5"
          style={{ backgroundColor: 'rgba(8,8,8,0.97)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item, i) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                onClick={onClose}
                className="text-white/70 hover:text-white text-base py-3 px-3 rounded-xl hover:bg-white/5 transition-all duration-200 flex items-center justify-between group"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  opacity: open ? 1 : 0,
                  transform: open ? 'translateY(0)' : 'translateY(-8px)',
                  transition: `opacity 0.4s cubic-bezier(0.23,1,0.32,1) ${i * 50 + 80}ms, transform 0.4s cubic-bezier(0.23,1,0.32,1) ${i * 50 + 80}ms, color 0.2s, background 0.2s`,
                }}
              >
                {item}
                <ArrowRight size={14} className="opacity-0 group-hover:opacity-40 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
              </a>
            ))}
          </div>
          <div
            className="mt-5 pt-5 flex flex-col gap-2"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.07)',
              opacity: open ? 1 : 0,
              transform: open ? 'translateY(0)' : 'translateY(-8px)',
              transition: `opacity 0.4s cubic-bezier(0.23,1,0.32,1) 360ms, transform 0.4s cubic-bezier(0.23,1,0.32,1) 360ms`,
            }}
          >
            <button
              onClick={() => { onClose(); onSignIn(); }}
              className="w-full py-3 rounded-full text-black text-sm font-medium transition-all duration-300 hover:opacity-80"
              style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#ffffff' }}
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── Navbar ─────────────────────────── */
function Navbar({ onSignIn }: { onSignIn: () => void }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll); };
  }, []);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-4 lg:px-10 lg:py-5 transition-all duration-500"
        style={{ backgroundColor: scrolled ? 'rgba(8,8,8,0.85)' : 'transparent', backdropFilter: scrolled ? 'blur(16px)' : 'none', borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <img src={warehouseLogo} alt="Warehouse" className="w-8 h-8 rounded-lg" draggable={false} />
          <span className="text-white text-[15px] font-semibold tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
            Warehouse
          </span>
        </div>

        {/* Desktop nav pills */}
        <div className="hidden lg:flex items-center gap-1 rounded-full px-2 py-1.5" style={{ backgroundColor: '#0C0C0C' }}>
          {NAV_ITEMS.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-white/70 hover:text-white text-sm px-4 py-1.5 rounded-full hover:bg-white/10 transition-all duration-200"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {item}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-2">
          <HamburgerButton open={open} onClick={() => setOpen((v) => !v)} />
          <button
            onClick={onSignIn}
            className="hidden lg:block text-sm font-medium px-5 py-2 rounded-full text-black transition-all duration-300 hover:opacity-85 active:scale-95"
            style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#ffffff' }}
          >
            Sign In
          </button>
        </div>
      </nav>
      <MobileMenu open={open} onClose={() => setOpen(false)} onSignIn={onSignIn} />
    </>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */
function Hero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="relative z-20 flex flex-col items-center text-center pt-[130px] md:pt-[160px] px-5 sm:px-8 pb-20">
      {/* Pill badge */}
      <div
        className="mb-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter, sans-serif' }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Purpose-built for Canadian e-commerce
      </div>

      <h1
        className="text-white font-semibold leading-[1.1] tracking-tight max-w-3xl"
        style={{ fontFamily: 'Inter, sans-serif', fontSize: 'clamp(2rem, 5.5vw, 3.2rem)' }}
      >
        Your entire operation,
        <br />
        <span style={{ background: 'linear-gradient(90deg, #f59e0b, #10b981, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          one dashboard.
        </span>
      </h1>

      <p
        className="mt-5 md:mt-6 text-white/55 leading-relaxed max-w-md"
        style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: 'clamp(0.8rem, 1.5vw, 0.95rem)', letterSpacing: '0.01em' }}
      >
        Multi-entity inventory, marketplace orders, and full accrual
        <br className="hidden sm:block" />
        accounting — built for TGW & VES Electronics.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
        <button
          onClick={onSignIn}
          className="flex items-center gap-2.5 px-6 py-3 rounded-full text-black text-sm font-semibold transition-all duration-300 hover:opacity-85 active:scale-95 group"
          style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#ffffff' }}
        >
          Sign In to Dashboard
          <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform duration-200" />
        </button>
        <a
          href="#features"
          className="flex items-center gap-1.5 px-4 py-3 rounded-full text-sm transition-all duration-300 hover:text-white"
          style={{ fontFamily: 'Inter, sans-serif', color: 'rgba(255,255,255,0.5)' }}
        >
          See features <ChevronRight size={14} />
        </a>
      </div>

      {/* Stats row */}
      <div className="mt-14 flex flex-wrap justify-center gap-6 md:gap-12">
        {[
          { value: '2', label: 'Entities' },
          { value: '4+', label: 'Marketplaces' },
          { value: '90+', label: 'DB Migrations' },
          { value: 'CRA', label: 'Tax Compliant' },
        ].map(({ value, label }) => (
          <div key={label} className="text-center">
            <div className="text-white text-2xl font-bold" style={{ fontFamily: 'Inter, sans-serif' }}>{value}</div>
            <div className="text-white/40 text-xs mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Features ─────────────────────────── */
function Features() {
  return (
    <section id="features" className="relative z-20 px-5 sm:px-8 lg:px-16 py-20 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter, sans-serif' }}>
          Platform
        </p>
        <h2 className="text-white text-2xl md:text-3xl font-semibold tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
          Everything your operation needs
        </h2>
        <p className="mt-3 text-sm max-w-md mx-auto" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter, sans-serif' }}>
          Accounting, inventory, orders, and tax — unified in a single system with real-time data across both entities.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="group flex items-start gap-4 p-5 rounded-2xl transition-all duration-300 cursor-default"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'; }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <Icon size={16} color="white" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-white mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>{label}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter, sans-serif' }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Integrations ─────────────────────────── */
function Integrations() {
  const platforms = [
    { name: 'Shopify', color: '#96bf48' },
    { name: 'Amazon', color: '#ff9900' },
    { name: 'Best Buy', color: '#0046be' },
    { name: 'Temu', color: '#ff5722' },
    { name: 'Supabase', color: '#3ecf8e' },
    { name: 'Vercel', color: '#ffffff' },
  ];
  return (
    <section id="integrations" className="relative z-20 px-5 sm:px-8 lg:px-16 py-20 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter, sans-serif' }}>Integrations</p>
        <h2 className="text-white text-2xl md:text-3xl font-semibold tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>Connected to your entire stack</h2>
        <p className="mt-3 text-sm max-w-sm mx-auto" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter, sans-serif' }}>
          Orders flow in automatically. Accounting entries are created the moment a sale closes.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {platforms.map(({ name, color }) => (
          <div
            key={name}
            className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color, fontFamily: 'Inter, sans-serif' }}
          >
            {name}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Workflow ─────────────────────────── */
function Workflow() {
  const steps = [
    { n: '01', title: 'Order comes in', body: 'Sales are imported automatically from Amazon, Shopify, or Best Buy via webhook or scheduled sync.' },
    { n: '02', title: 'Inventory updates', body: 'Device or product is matched, marked sold, and cost of goods sold is calculated per unit.' },
    { n: '03', title: 'Journal entries created', body: 'Revenue, COGS, and tax entries post automatically — no manual bookkeeping needed.' },
    { n: '04', title: 'Reports ready', body: 'P&L, balance sheet, HST reconciliation, and CRA filings are always up to date.' },
  ];
  return (
    <section id="accounting" className="relative z-20 px-5 sm:px-8 lg:px-16 py-20 max-w-5xl mx-auto">
      <div className="text-center mb-14">
        <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter, sans-serif' }}>How it works</p>
        <h2 className="text-white text-2xl md:text-3xl font-semibold tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>From order to accounting in seconds</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {steps.map(({ n, title, body }) => (
          <div key={n} className="p-6 rounded-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-xs font-mono mb-3 block" style={{ color: 'rgba(255,255,255,0.25)' }}>{n}</span>
            <p className="text-white text-base font-medium mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>{title}</p>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter, sans-serif' }}>{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── CTA ─────────────────────────── */
function CTA({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="relative z-20 px-5 sm:px-8 py-24 flex flex-col items-center text-center">
      <div className="max-w-xl">
        <h2 className="text-white text-2xl md:text-3xl font-semibold tracking-tight mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
          Ready to take control?
        </h2>
        <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter, sans-serif' }}>
          Your dashboard is live. Sign in with your credentials to access TGW & VES operations.
        </p>
        <button
          onClick={onSignIn}
          className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full text-black text-sm font-semibold transition-all duration-300 hover:opacity-85 active:scale-95 group"
          style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#ffffff' }}
        >
          Sign In to Dashboard
          <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform duration-200" />
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────── Footer ─────────────────────────── */
function Footer() {
  return (
    <footer className="relative z-20 px-5 sm:px-8 lg:px-16 py-10" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <img src={warehouseLogo} alt="Warehouse" className="w-6 h-6 rounded-md" draggable={false} />
          <span className="text-white/60 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>Warehouse Management</span>
        </div>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif' }}>
          Multi-entity · Canadian tax compliant · Real-time sync
        </p>
      </div>
    </footer>
  );
}

/* ─────────────────────────── Root ─────────────────────────── */
export default function Landing() {
  const navigate = useNavigate();
  const goToAuth = () => navigate('/auth');

  return (
    <div className="relative w-full min-h-screen overflow-x-hidden bg-black" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Video background — covers only the hero viewport */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src={BG_VIDEO}
          autoPlay
          loop
          muted
          playsInline
        />
        {/* Gradient overlay so sections below the fold are readable */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0.95) 80%, #000 100%)' }}
        />
      </div>

      <Navbar onSignIn={goToAuth} />
      <Hero onSignIn={goToAuth} />
      <Features />
      <Integrations />
      <Workflow />
      <CTA onSignIn={goToAuth} />
      <Footer />
    </div>
  );
}
