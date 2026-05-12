import Button from '../../../components/base/Button';

export default function CTASection() {
  return (
    <section className="py-20 bg-brand-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
          Ready to Maximize Your Fashion Resale Profits?
        </h2>
        <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
          Join thousands of successful resellers who use Marginn to identify profitable opportunities and make data-driven decisions.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Button size="lg" className="bg-white text-brand-600 hover:bg-gray-50 text-lg px-8 py-4">
            <i className="ri-camera-line mr-2"></i>
            Start Free Analysis
          </Button>
          <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-brand-600 text-lg px-8 py-4">
            <i className="ri-play-circle-line mr-2"></i>
            Watch Demo
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold text-white mb-2">50K+</div>
            <div className="text-white/70">Items Analyzed</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-2">95%</div>
            <div className="text-white/70">Accuracy Rate</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-2">$2M+</div>
            <div className="text-white/70">Profits Generated</div>
          </div>
        </div>
      </div>
    </section>
  );
}
