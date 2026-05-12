
import { Link } from 'react-router-dom';
import Button from '../../../components/base/Button';

function ScanResultsMockup() {
  return (
    <div className="relative mx-auto" style={{ width: 280 }}>
      {/* Phone shell */}
      <div className="relative bg-gray-900 rounded-[40px] p-3 shadow-2xl" style={{ boxShadow: '0 40px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.08)' }}>
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full z-10" />
        {/* Screen */}
        <div className="bg-white rounded-[32px] overflow-hidden" style={{ minHeight: 560 }}>
          {/* Status bar */}
          <div className="bg-white px-5 pt-7 pb-2 flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-800">9:41</span>
            <div className="flex gap-1 items-center">
              <div className="w-3 h-2 border border-gray-700 rounded-sm relative">
                <div className="absolute inset-0.5 right-0.5 bg-gray-700 rounded-sm" style={{ right: 2 }} />
              </div>
            </div>
          </div>

          {/* App header */}
          <div className="px-4 pb-3 flex items-center justify-between border-b border-gray-100">
            <span className="text-base font-bold text-black tracking-tight">Marginn</span>
            <span className="text-xs text-gray-400">Scan Result</span>
          </div>

          {/* Clothing image area */}
          <div className="relative mx-4 mt-3 rounded-2xl overflow-hidden bg-gray-50" style={{ height: 160 }}>
            <img
              src="https://readdy.ai/api/search-image?query=Stone%20Island%20grey%20zip-up%20jacket%20laid%20flat%20on%20a%20clean%20white%20background%2C%20product%20photography%2C%20minimal%2C%20high%20contrast%2C%20fashion%20resale%20item%2C%20no%20text%2C%20studio%20lighting&width=400&height=320&seq=stone-island-jacket-mockup&orientation=landscape"
              alt="Stone Island jacket"
              className="w-full h-full object-cover object-top"
            />
            {/* BUY badge */}
            <div className="absolute top-3 right-3 bg-green-500 text-white text-sm font-extrabold px-3 py-1.5 rounded-full shadow-lg tracking-wide flex items-center gap-1">
              <i className="ri-checkbox-circle-fill text-white" style={{ fontSize: 14 }} />
              BUY
            </div>
          </div>

          {/* Brand & item info */}
          <div className="px-4 mt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">Brand</p>
                <p className="text-lg font-bold text-black leading-tight">Stone Island</p>
              </div>
              <div className="bg-gray-100 rounded-xl px-3 py-1.5 text-center">
                <p className="text-xs text-gray-400 font-medium">Condition</p>
                <p className="text-sm font-bold text-gray-800">Good</p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-4 my-3 border-t border-gray-100" />

          {/* Stats grid */}
          <div className="px-4 grid grid-cols-3 gap-2">
            {/* Resale Value */}
            <div className="bg-gray-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-gray-400 font-medium leading-tight mb-1">Resale Value</p>
              <p className="text-lg font-extrabold text-black">£95</p>
            </div>
            {/* Net Profit */}
            <div className="bg-green-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-green-600 font-medium leading-tight mb-1">Net Profit</p>
              <p className="text-lg font-extrabold text-green-600">£67</p>
            </div>
            {/* Max Buy Price */}
            <div className="bg-gray-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-gray-400 font-medium leading-tight mb-1">Max Buy</p>
              <p className="text-lg font-extrabold text-black">£25</p>
            </div>
          </div>

          {/* Platforms row */}
          <div className="px-4 mt-3 mb-4">
            <p className="text-xs text-gray-400 font-medium mb-2">Listed on</p>
            <div className="flex gap-2">
              {['Vinted', 'Depop', 'eBay'].map((p) => (
                <span key={p} className="bg-gray-100 text-gray-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Decorative glow */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-48 h-10 bg-green-400/20 rounded-full blur-2xl" />
    </div>
  );
}

export default function HeroSection() {
  return (
    <section className="relative bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl lg:text-6xl font-bold text-black leading-tight mb-6">
              Upload a photo.<br />
              <span className="text-gray-600">See resale value</span><br />
              instantly.
            </h1>
            <p className="text-xl text-gray-600 mb-4 leading-relaxed">
              Marginn identifies fashion pieces and shows real-time resale prices from Vinted, Depop and more.
            </p>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed max-w-lg italic">
              Marginn exists to build the infrastructure of the circular economy — connecting people, organisations, and resources to eliminate textile waste and create value at every stage of a garment&apos;s life.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/scan">
                <Button size="lg" className="text-white whitespace-nowrap" style={{ backgroundColor: '#1a3d2b' }}>
                  Start free scan
                </Button>
              </Link>
              <Link to="/signup">
                <Button variant="outline" size="lg" className="whitespace-nowrap border-[#1a3d2b] text-[#1a3d2b] hover:bg-[#1a3d2b]/5">
                  Sign up
                </Button>
              </Link>
            </div>
          </div>
          <div className="flex justify-center items-center py-8">
            <ScanResultsMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
