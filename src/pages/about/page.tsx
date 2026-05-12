import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import Header from '../../components/feature/Header';
import Footer from '../landing/components/Footer';
import { supabase } from '@/supabaseClient';

function useCountUp(target: number, duration = 2000, started: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!started || target === 0) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(start);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, started]);
  return value;
}

function BiggerPictureSection() {
  const [co2, setCo2] = useState(0);
  const [items, setItems] = useState(0);
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
        setCo2(buys * 22);
        setItems(buys);
      });
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const animatedCo2 = useCountUp(co2, 2000, started);
  const animatedItems = useCountUp(items, 2000, started);

  return (
    <section ref={ref} className="py-20 bg-black text-white border-b border-gray-800">
      <div className="max-w-3xl mx-auto px-6">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-4 font-medium">The bigger picture</p>
        <h2 className="text-3xl font-bold mb-8 leading-snug">
          Good for your wallet.<br />Good for the planet.
        </h2>

        <p className="text-gray-300 text-lg leading-relaxed mb-6">
          Every item resold instead of thrown away saves approximately <strong className="text-white">22kg of CO₂</strong> — equivalent to driving 55 miles.
        </p>
        <p className="text-gray-300 text-lg leading-relaxed mb-10">
          We built a tool that makes resellers money and happens to be good for the planet.
        </p>

        <div className="grid grid-cols-2 gap-6 mb-10">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <p className="text-4xl font-extrabold text-green-400 mb-1">
              {animatedCo2.toLocaleString()}<span className="text-2xl font-bold"> kg</span>
            </p>
            <p className="text-sm text-gray-400 font-medium">CO₂ saved by Marginn users</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <p className="text-4xl font-extrabold text-green-400 mb-1">
              {animatedItems.toLocaleString()}
            </p>
            <p className="text-sm text-gray-400 font-medium">Items kept from UK landfill</p>
          </div>
        </div>

        <p className="text-gray-500 text-sm italic">
          Figures update in real time based on BUY decisions made by Marginn users.
        </p>
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-black text-white py-24">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-sm uppercase tracking-widest text-gray-400 mb-4 font-medium">About Marginn</p>
            <h1 className="text-5xl font-bold leading-tight mb-6">
              Built for resellers who are tired of guessing.
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed">
              Every charity shop visit is a decision — buy it or leave it. We built a tool that makes that decision instant and accurate.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="py-20 border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold text-black mb-5">What Marginn does</h2>
                <p className="text-gray-600 text-lg leading-relaxed mb-5">
                  Upload a photo. Marginn checks resale prices across Vinted, Depop and eBay and tells you exactly what it's worth and what you should pay for it.
                </p>
                <p className="text-gray-600 text-lg leading-relaxed">
                  No more guessing. No more leaving money on the table. Just a clear, instant answer.
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden" style={{ height: 320 }}>
                <img
                  src="https://readdy.ai/api/search-image?query=person%20browsing%20clothing%20rails%20in%20a%20bright%20UK%20charity%20shop%2C%20warm%20natural%20light%2C%20candid%20street%20photography%20style%2C%20colourful%20garments%20on%20hangers%2C%20wooden%20floor%2C%20minimalist%20aesthetic%2C%20editorial%20fashion%20photography&width=600&height=640&seq=about-charity-shop-browse&orientation=portrait"
                  alt="Browsing charity shop rails"
                  className="w-full h-full object-cover object-top"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <section className="py-14 bg-gray-50 border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-6">
            <div className="grid grid-cols-3 gap-8 text-center">
              <div>
                <p className="text-4xl font-extrabold text-black mb-1">124</p>
                <p className="text-sm text-gray-500 font-medium">Brands in database</p>
              </div>
              <div>
                <p className="text-4xl font-extrabold text-black mb-1">3</p>
                <p className="text-sm text-gray-500 font-medium">Platforms checked</p>
              </div>
              <div>
                <p className="text-4xl font-extrabold text-black mb-1">UK</p>
                <p className="text-sm text-gray-500 font-medium">Built for UK resellers</p>
              </div>
            </div>
          </div>
        </section>

        {/* The Bigger Picture */}
        <BiggerPictureSection />

        {/* Founder */}
        <section className="py-20 border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-black mb-10">The founder</h2>
            <div className="flex items-start gap-8">
              <div className="w-20 h-20 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                <span className="text-white text-2xl font-bold">JH</span>
              </div>
              <div>
                <p className="text-xl font-bold text-black mb-1">Jaedan Hughes</p>
                <p className="text-sm text-gray-400 mb-4 font-medium uppercase tracking-widest">Founder, Marginn</p>
                <p className="text-gray-600 text-base leading-relaxed">
                  Marginn was built out of a real frustration — standing in a charity shop, holding a jacket, and having no idea if it was worth buying. Jaedan built the tool he wished existed, and now it's available to every reseller in the UK.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Contact + CTA */}
        <section className="py-20">
          <div className="max-w-3xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div>
                <h2 className="text-2xl font-bold text-black mb-4">Get in touch</h2>
                <p className="text-gray-600 mb-4 leading-relaxed">
                  Questions, feedback, or just want to say hello — we'd love to hear from you.
                </p>
                <a
                  href="mailto:hello@marginn.co.uk"
                  className="inline-flex items-center gap-2 text-black font-semibold hover:opacity-70 transition-opacity cursor-pointer"
                >
                  <span className="w-8 h-8 flex items-center justify-center">
                    <i className="ri-mail-line text-lg" />
                  </span>
                  hello@marginn.co.uk
                </a>
              </div>
              <div className="bg-black rounded-2xl p-8 text-white flex flex-col justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-400 mb-3 font-medium">Ready to start?</p>
                  <h3 className="text-2xl font-bold mb-3">Try your first scan free</h3>
                  <p className="text-gray-400 text-sm leading-relaxed mb-6">
                    Upload a photo and get an instant resale valuation — no account needed.
                  </p>
                </div>
                <Link
                  to="/scan"
                  className="inline-block bg-white text-black text-sm font-bold px-6 py-3 rounded-lg hover:bg-gray-100 transition-colors text-center whitespace-nowrap cursor-pointer"
                >
                  Start scanning →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
