export default function SocialProofSection() {
  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-2xl font-semibold text-black mb-4">
          Trusted by Depop and Vinted sellers
        </p>
        
        <div className="mt-12 grid grid-cols-3 gap-8 items-center opacity-60 max-w-lg mx-auto">
          <div className="text-center">
            <i className="ri-shopping-bag-3-line text-4xl text-gray-400 mb-2"></i>
            <p className="text-sm font-medium text-gray-500">Depop</p>
          </div>
          <div className="text-center">
            <i className="ri-store-2-line text-4xl text-gray-400 mb-2"></i>
            <p className="text-sm font-medium text-gray-500">Vinted</p>
          </div>
          <div className="text-center">
            <i className="ri-auction-line text-4xl text-gray-400 mb-2"></i>
            <p className="text-sm font-medium text-gray-500">eBay</p>
          </div>
        </div>
      </div>
    </section>
  );
}
