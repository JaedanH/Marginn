import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../landing/components/Footer';
import { supabase } from '@/supabaseClient';

function useCountUp(target: number, duration = 2200, started: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!started || target === 0) return;
    let current = 0;
    const steps = Math.max(60, Math.ceil(duration / 16));
    const increment = target / steps;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(Math.floor(current));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, started]);
  return value;
}

function LiveCounters() {
  const [co2, setCo2] = useState(0);
  const [items, setItems] = useState(0);
  const [years, setYears] = useState(0);
  const [trees, setTrees] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from('scans')
      .select('decision')
      .then(({ data }) => {
        if (!data) return;
        const buys = data.filter((s: { decision: string }) =>
          s.decision?.toUpperCase() === 'BUY'
        ).length;
        const co2Val = buys * 22;
        setCo2(co2Val);
        setItems(buys);
        setYears(Math.round(buys * 2.5));
        setTrees(Math.round(co2Val / 21));
      });
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const animCo2 = useCountUp(co2, 2200, started);
  const animItems = useCountUp(items, 2200, started);
  const animYears = useCountUp(years, 2200, started);
  const animTrees = useCountUp(trees, 2200, started);

  const stats = [
    { value: animCo2, suffix: ' kg', label: 'CO₂ saved', icon: '🌍', color: 'text-green-400' },
    { value: animItems, suffix: '', label: 'Items kept from landfill', icon: '👕', color: 'text-emerald-400' },
    { value: animYears, suffix: ' yrs', label: 'Clothing life extended', icon: '♻️', color: 'text-teal-400' },
    { value: animTrees, suffix: '', label: 'Trees equivalent planted', icon: '🌱', color: 'text-lime-400' },
  ];

  return (
    <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center text-center"
        >
          <span className="text-3xl mb-3">{s.icon}</span>
          <p className={`text-4xl font-extrabold ${s.color} mb-1 tabular-nums`}>
            {s.value.toLocaleString()}{s.suffix}
          </p>
          <p className="text-sm text-gray-400 font-medium leading-snug">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function ImpactPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative bg-black text-white overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{
              backgroundImage:
                "url('https://readdy.ai/api/search-image?query=aerial%20view%20of%20a%20vast%20green%20forest%20canopy%20with%20morning%20mist%2C%20lush%20trees%20stretching%20to%20the%20horizon%2C%20environmental%20conservation%2C%20nature%20photography%2C%20soft%20golden%20light%20filtering%20through%20leaves%2C%20serene%20and%20hopeful%20atmosphere%2C%20wide%20landscape&width=1440&height=700&seq=impact-hero-bg&orientation=landscape')",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
          <div className="relative max-w-4xl mx-auto px-6 py-32 text-center">
            <span className="inline-block text-xs uppercase tracking-widest text-green-400 font-semibold mb-5 border border-green-400/30 rounded-full px-4 py-1">
              Environmental Impact
            </span>
            <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6">
              Every flip fights<br />fashion waste.
            </h1>
            <p className="text-lg text-gray-300 max-w-xl mx-auto leading-relaxed">
              Marginn turns resale decisions into environmental action — one scan at a time.
            </p>
          </div>
        </section>

        {/* The Problem */}
        <section className="py-20 bg-white border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-6">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-4">The problem</p>
            <h2 className="text-3xl font-bold text-black mb-8 leading-snug">
              Fashion is one of the world's<br />most wasteful industries.
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
                <p className="text-5xl font-extrabold text-black mb-3">300k</p>
                <p className="text-gray-600 leading-relaxed">
                  <strong className="text-black">tonnes of clothing</strong> sent to UK landfill every single year — enough to fill the Royal Albert Hall more than 400 times.
                </p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
                <p className="text-5xl font-extrabold text-black mb-3">7×</p>
                <p className="text-gray-600 leading-relaxed">
                  The average garment is worn just <strong className="text-black">7 times</strong> before being discarded — a fraction of its useful life.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Live Counters */}
        <section className="py-20 bg-black text-white">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-xs uppercase tracking-widest text-green-400 font-semibold mb-3">Live impact</p>
              <h2 className="text-3xl font-bold">What Marginn users have achieved</h2>
              <p className="text-gray-400 mt-3 text-sm">Updated in real time from every BUY decision made on the platform.</p>
            </div>
            <LiveCounters />
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 bg-white border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-6">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-4">How it works</p>
            <h2 className="text-3xl font-bold text-black mb-6 leading-snug">
              Profit and planet,<br />working together.
            </h2>
            <p className="text-gray-600 text-lg leading-relaxed mb-6">
              Marginn makes reselling more profitable. More successful resales means less clothing in landfill. Every <strong className="text-black">BUY decision</strong> is a vote for sustainable fashion.
            </p>
            <p className="text-gray-600 text-lg leading-relaxed mb-12">
              When a reseller buys a garment instead of leaving it on the shelf, that item gets a second life — worn more, washed less per use, and kept out of the waste stream for years longer.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  step: '01',
                  title: 'Scan an item',
                  desc: 'Upload a photo at a charity shop or car boot sale.',
                },
                {
                  step: '02',
                  title: 'Get a BUY decision',
                  desc: 'Marginn checks live resale prices and tells you if it\'s worth buying.',
                },
                {
                  step: '03',
                  title: 'Save an item from landfill',
                  desc: 'That garment gets resold, worn again, and kept out of UK landfill.',
                },
              ].map((item) => (
                <div key={item.step} className="border border-gray-100 rounded-2xl p-6">
                  <p className="text-xs font-bold text-gray-300 mb-3 tracking-widest">{item.step}</p>
                  <h3 className="text-base font-bold text-black mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CO2 Fact */}
        <section className="py-16 bg-gray-50 border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-5xl mb-4">🌿</p>
            <p className="text-2xl font-bold text-black mb-3">
              Each resold item saves ~22kg of CO₂
            </p>
            <p className="text-gray-500 text-base leading-relaxed max-w-xl mx-auto">
              That's the equivalent of driving <strong className="text-black">55 miles</strong> in a petrol car — avoided entirely because one garment found a new home instead of a landfill.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-black text-white">
          <div className="max-w-2xl mx-auto px-6 text-center">
            <p className="text-xs uppercase tracking-widest text-green-400 font-semibold mb-5">Join the movement</p>
            <h2 className="text-4xl font-extrabold mb-5 leading-tight">
              Join UK resellers making money<br />and making a difference.
            </h2>
            <p className="text-gray-400 text-base leading-relaxed mb-10 max-w-lg mx-auto">
              Every scan you make contributes to a growing collective impact. Start for free — no account needed.
            </p>
            <Link
              to="/scan"
              className="inline-block bg-green-400 text-black font-bold px-10 py-4 rounded-xl hover:bg-green-300 transition-colors text-base whitespace-nowrap cursor-pointer"
            >
              Start scanning free →
            </Link>
            <p className="text-gray-600 text-xs mt-5">No credit card required. First scan is free.</p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
