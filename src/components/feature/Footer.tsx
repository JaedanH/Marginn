import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <h3 className="text-2xl font-bold mb-4 tracking-tight">
              Marginn
            </h3>
            <p className="text-gray-300 mb-4 max-w-md">
              AI-powered resale analytics that helps you identify clothing items and discover profitable opportunities across multiple platforms.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-white cursor-pointer">
                <i className="ri-twitter-fill text-xl"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-white cursor-pointer">
                <i className="ri-instagram-fill text-xl"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-white cursor-pointer">
                <i className="ri-linkedin-fill text-xl"></i>
              </a>
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2">
              <li><Link to="/scan" className="text-gray-300 hover:text-white cursor-pointer">Features</Link></li>
              <li><Link to="/pricing" className="text-gray-300 hover:text-white cursor-pointer">Pricing</Link></li>
              <li><a href="#" className="text-gray-300 hover:text-white cursor-pointer">API</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2">
              <li><Link to="/about" className="text-gray-300 hover:text-white cursor-pointer">About</Link></li>
              <li><Link to="/status" className="text-gray-300 hover:text-white cursor-pointer">Status</Link></li>
              <li><Link to="/impact" className="text-gray-300 hover:text-white cursor-pointer">Impact</Link></li>
              <li><Link to="/contact" className="text-gray-300 hover:text-white cursor-pointer">Contact</Link></li>
              <li><Link to="/privacy" className="text-gray-300 hover:text-white cursor-pointer">Privacy</Link></li>
              <li><Link to="/terms" className="text-gray-300 hover:text-white cursor-pointer">Terms</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-gray-400 text-sm">
            &copy; 2024 Marginn. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-gray-400 hover:text-white text-sm cursor-pointer whitespace-nowrap">Terms of Service</Link>
            <Link to="/privacy" className="text-gray-400 hover:text-white text-sm cursor-pointer whitespace-nowrap">Privacy Policy</Link>
            <a href="https://readdy.ai/?origin=logo" className="text-gray-400 hover:text-white text-sm cursor-pointer">
              Powered by Readdy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}