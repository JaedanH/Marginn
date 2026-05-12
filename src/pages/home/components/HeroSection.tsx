import Button from '../../../components/base/Button';

export default function HeroSection() {
  return (
    <section 
      className="relative bg-brand-50 py-20 lg:py-32 overflow-hidden"
      style={{
        backgroundImage: `url('https://readdy.ai/api/search-image?query=Modern%20fashion%20analytics%20workspace%20with%20clothing%20items%2C%20smartphones%2C%20and%20data%20visualization%20screens%20in%20a%20clean%20minimalist%20studio%20setting%20with%20soft%20natural%20lighting%20and%20contemporary%20design%20elements&width=1920&height=1080&seq=hero-bg&orientation=landscape')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-white/80"></div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="w-full">
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Marginn — Know Your Resale Value
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Upload a photo of any clothing item and instantly discover its resale value, market trends, and profit potential across Depop, Vinted, and eBay.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="text-lg px-8 py-4">
                <i className="ri-camera-line mr-2"></i>
                Start Analyzing
              </Button>
              <Button variant="outline" size="lg" className="text-lg px-8 py-4">
                <i className="ri-play-circle-line mr-2"></i>
                Watch Demo
              </Button>
            </div>
            <div className="mt-8 flex items-center space-x-6 text-sm text-gray-500">
              <div className="flex items-center">
                <i className="ri-check-line text-green-500 mr-2"></i>
                Free to start
              </div>
              <div className="flex items-center">
                <i className="ri-check-line text-green-500 mr-2"></i>
                Instant results
              </div>
              <div className="flex items-center">
                <i className="ri-check-line text-green-500 mr-2"></i>
                Real-time data
              </div>
            </div>
          </div>
          
          <div className="w-full flex justify-center lg:justify-end">
            <div className="relative">
              <img 
                src="https://readdy.ai/api/search-image?query=Smartphone%20displaying%20fashion%20analytics%20app%20interface%20with%20clothing%20item%20recognition%2C%20price%20charts%2C%20and%20marketplace%20data%20in%20a%20modern%20clean%20design%20with%20vibrant%20colors%20and%20professional%20UI%20elements&width=400&height=600&seq=phone-mockup&orientation=portrait"
                alt="Marginn mobile app interface showing AI fashion analytics"
                className="w-80 h-auto rounded-2xl shadow-2xl"
              />
              <div className="absolute -top-4 -right-4 bg-black text-white px-4 py-2 rounded-full text-sm font-semibold">
                AI Powered
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
