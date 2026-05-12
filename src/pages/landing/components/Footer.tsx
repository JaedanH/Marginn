import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="text-white py-12" style={{ backgroundColor: '#1a3d2b' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xl font-bold mb-4">Marginn</h3>
            <p className="text-white/60">
              AI-powered resale analytics for smart sellers.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-white/60">
              <li><Link to="/scan" className="hover:text-white cursor-pointer">Features</Link></li>
              <li><Link to="/pricing" className="hover:text-white cursor-pointer">Pricing</Link></li>
              <li><Link to="/contact" className="hover:text-white cursor-pointer">API</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-white/60">
              <li><Link to="/about" className="hover:text-white cursor-pointer">About</Link></li>
              <li><Link to="/status" className="hover:text-white cursor-pointer">Status</Link></li>
              <li><Link to="/impact" className="hover:text-white cursor-pointer">Impact</Link></li>
              <li><Link to="/contact" className="hover:text-white cursor-pointer">Contact</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-white/60">
              <li><Link to="/privacy" className="hover:text-white cursor-pointer">Privacy</Link></li>
              <li><Link to="/terms" className="hover:text-white cursor-pointer">Terms</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-white/20 mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-white/60">
          <p className="text-sm">&copy; 2024 Marginn. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-sm hover:text-white cursor-pointer whitespace-nowrap">Terms of Service</Link>
            <Link to="/privacy" className="text-sm hover:text-white cursor-pointer whitespace-nowrap">Privacy Policy</Link>
            <a href="https://readdy.ai/?origin=logo" className="text-sm hover:text-white cursor-pointer whitespace-nowrap">Powered by Readdy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}