export default function HowItWorksSection() {
  const steps = [
    {
      number: '01',
      title: 'Upload or Capture',
      description: 'Take a photo of any clothing item or upload an existing image from your device.',
      icon: 'ri-camera-line'
    },
    {
      number: '02',
      title: 'AI Analysis',
      description: 'Our AI instantly identifies the brand, style, size, and condition of the item.',
      icon: 'ri-brain-line'
    },
    {
      number: '03',
      title: 'Market Research',
      description: 'We search across multiple resale platforms to find similar items and current prices.',
      icon: 'ri-search-line'
    },
    {
      number: '04',
      title: 'Get Insights',
      description: 'Receive detailed analytics including price ranges, demand levels, and profit potential.',
      icon: 'ri-bar-chart-line'
    }
  ];

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            How FashionScope Works
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Get professional fashion resale insights in just four simple steps.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="text-center">
              <div className="relative mb-8">
                <div className="w-20 h-20 bg-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className={`${step.icon} text-2xl text-white`}></i>
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-brand-700 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {step.number}
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-10 left-full w-full h-0.5 bg-gray-300 transform -translate-y-1/2"></div>
                )}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {step.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
