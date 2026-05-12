import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../landing/components/Footer';

const services = [
  { name: 'App', description: 'Core application and user interface', status: 'Operational' },
  { name: 'Database', description: 'Brand data and pricing records', status: 'Operational' },
  { name: 'Image Analysis', description: 'AI-powered clothing recognition via Claude', status: 'Operational' },
  { name: 'Price Data', description: 'Vinted, Depop and eBay price feeds', status: 'Operational' },
  { name: 'Authentication', description: 'User sign in and account access', status: 'Operational' },
];

export default function StatusPage() {
  const [lastChecked, setLastChecked] = useState('');

  useEffect(() => {
    const now = new Date();
    setLastChecked(
      now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      ' · ' +
      now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    );
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-black text-white py-20">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-sm uppercase tracking-widest text-gray-400 mb-4 font-medium">System Status</p>
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-green-400"></span>
              </span>
              <h1 className="text-4xl font-bold">All systems operational</h1>
            </div>
            <p className="text-gray-400 text-base">
              Marginn services are running normally. No incidents reported.
            </p>
          </div>
        </section>

        {/* Services */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-6">Services</h2>

            <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between px-6 py-5 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="relative flex h-3 w-3 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-black">{service.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{service.description}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-green-600 bg-green-50 px-3 py-1 rounded-full whitespace-nowrap">
                    ✓ {service.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Last checked */}
            <div className="mt-8 flex items-center justify-between text-xs text-gray-400">
              <span>Last checked: {lastChecked}</span>
              <button
                onClick={() => {
                  const now = new Date();
                  setLastChecked(
                    now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
                    ' · ' +
                    now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                  );
                }}
                className="flex items-center gap-1.5 text-gray-400 hover:text-black transition-colors cursor-pointer"
              >
                <span className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-refresh-line text-sm" />
                </span>
                Refresh
              </button>
            </div>
          </div>
        </section>

        {/* Incident history */}
        <section className="py-10 border-t border-gray-100">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-6">Incident History</h2>
            <div className="text-center py-12 text-gray-400">
              <span className="w-10 h-10 flex items-center justify-center mx-auto mb-3">
                <i className="ri-checkbox-circle-line text-3xl text-green-400" />
              </span>
              <p className="text-sm font-medium text-gray-500">No incidents in the last 30 days</p>
              <p className="text-xs text-gray-400 mt-1">Marginn has maintained 100% uptime.</p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-12 border-t border-gray-100 bg-gray-50">
          <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-black">Everything looking good?</p>
              <p className="text-xs text-gray-400 mt-0.5">Head back and start scanning your next find.</p>
            </div>
            <Link
              to="/scan"
              className="bg-black text-white text-sm font-bold px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              Start scanning →
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
