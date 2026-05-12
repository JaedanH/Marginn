import { Link } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../landing/components/Footer';

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="prose prose-lg max-w-none">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">MARGINN TERMS OF SERVICE</h1>
          <p className="text-gray-600 mb-8">Last updated: March 2026</p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. ABOUT MARGINN</h2>
            <p className="text-gray-700 leading-relaxed">
              Marginn is a resale intelligence tool operated by Jaedan Hughes. By using Marginn at marginn.co.uk you agree to these terms. If you disagree do not use the service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. WHAT MARGINN DOES</h2>
            <p className="text-gray-700 leading-relaxed">
              Marginn provides estimated resale valuations for second-hand clothing items based on image analysis and market data. All outputs including BUY, MAYBE and SKIP decisions are estimates only and do not constitute financial advice. You are solely responsible for any purchasing decisions you make.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. ACCURACY DISCLAIMER</h2>
            <p className="text-gray-700 leading-relaxed">
              Marginn uses AI image analysis and live market data to generate estimates. We do not guarantee the accuracy of any price estimate, demand score or resale valuation. Market conditions change rapidly and actual resale prices may differ significantly from estimates provided.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. YOUR ACCOUNT</h2>
            <p className="text-gray-700 leading-relaxed">
              You are responsible for keeping your login credentials secure. You must be at least 18 years old to use Marginn. One account per person — creating multiple accounts to abuse free credits or tokens is prohibited and will result in permanent banning.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. SUBSCRIPTIONS AND TOKENS</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Scout plan</strong> — £9.99/month, 75 scans per month, resets on billing date. Unused scans do not roll over.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Trader plan</strong> — £19/month, 200 scans per month, advanced features.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Drop In</strong> — £5 for 15 scans, one-off payment, non-refundable, no expiry.
            </p>
            <p className="text-gray-700 leading-relaxed">
              All payments are processed securely. Subscriptions auto-renew unless cancelled before the renewal date. You can cancel anytime from your account settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. REFUNDS</h2>
            <p className="text-gray-700 leading-relaxed">
              Token purchases are non-refundable. Subscription refunds are considered on a case by case basis within 7 days of purchase if the service was materially unavailable. Contact us at marginnoffical@gmail.com.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. ACCEPTABLE USE</h2>
            <p className="text-gray-700 leading-relaxed mb-3">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>Use Marginn for any unlawful purpose</li>
              <li>Attempt to reverse engineer or copy the platform</li>
              <li>Scrape or extract data from Marginn</li>
              <li>Share your account with others</li>
              <li>Use automated tools to generate scans</li>
              <li>Attempt to manipulate or game the algorithm</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. YOUR DATA</h2>
            <p className="text-gray-700 leading-relaxed">
              We collect scan data, account information and usage patterns to operate and improve the service. We do not sell your personal data to third parties. Aggregated anonymous data may be used for market research and product improvement. See our Privacy Policy for full details.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. INTELLECTUAL PROPERTY</h2>
            <p className="text-gray-700 leading-relaxed">
              All content, algorithms, brand databases, pricing logic and design on Marginn are owned by Marginn. You may not copy, reproduce or distribute any part of the platform without written permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. LIMITATION OF LIABILITY</h2>
            <p className="text-gray-700 leading-relaxed">
              Marginn is not liable for any financial loss resulting from decisions made based on our estimates. Our total liability to you for any claim shall not exceed the amount you paid us in the 3 months prior to the claim.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. CHANGES TO TERMS</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update these terms at any time. Continued use of Marginn after changes constitutes acceptance of the new terms. We will notify users of significant changes by email.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. GOVERNING LAW</h2>
            <p className="text-gray-700 leading-relaxed">
              These terms are governed by the laws of England and Wales. Any disputes shall be resolved in the courts of England and Wales.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. CONTACT</h2>
            <p className="text-gray-700 leading-relaxed">
              Jaedan Hughes<br />
              <a href="mailto:marginnoffical@gmail.com" className="text-teal-600 hover:text-teal-700 cursor-pointer">marginnoffical@gmail.com</a><br />
              <a href="https://marginn.co.uk" className="text-teal-600 hover:text-teal-700 cursor-pointer">marginn.co.uk</a>
            </p>
          </section>

          <div className="mt-12 pt-8 border-t border-gray-200">
            <Link to="/" className="text-teal-600 hover:text-teal-700 font-medium cursor-pointer">
              ← Back to Home
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}