import { Link } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../landing/components/Footer';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="prose prose-lg max-w-none">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">MARGINN PRIVACY POLICY</h1>
          <p className="text-gray-600 mb-8">Last updated: March 2026</p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Who we are</h2>
            <p className="text-gray-700 leading-relaxed">
              Marginn is operated by Jaedan Hughes. If you have any questions about this policy contact us at <a href="mailto:marginnoffical@gmail.com" className="text-teal-600 hover:text-teal-700 cursor-pointer">marginnoffical@gmail.com</a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">What we collect</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>Email address and password when you sign up</li>
              <li>Photos you upload for scanning</li>
              <li>Scan history and results</li>
              <li>Buy prices you enter</li>
              <li>Payment information processed securely</li>
              <li>Usage data like scan frequency and feature usage</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">What we do NOT collect</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>We do not collect your location</li>
              <li>We do not collect data from your device beyond what you submit</li>
              <li>We do not sell your personal data to anyone ever</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">How we use your data</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>To operate your account and deliver scan results</li>
              <li>To improve the accuracy of our engine over time using anonymised aggregated data only</li>
              <li>To send you important account updates by email</li>
              <li>To process your payments securely</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Automated decision making</h2>
            <p className="text-gray-700 leading-relaxed">
              Marginn uses automated analysis to generate BUY, MAYBE and SKIP recommendations. These are estimates only and do not constitute financial advice. You are always in control of your final purchasing decision.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Third party services</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We work with carefully selected third party service providers to operate Marginn. These include services for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
              <li>Account authentication and data storage</li>
              <li>Payment processing</li>
              <li>Image analysis</li>
              <li>Market price data retrieval</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              None of our service providers are permitted to use your data for their own purposes. All providers are bound by data processing agreements and comply with GDPR.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Your rights under GDPR</h2>
            <p className="text-gray-700 leading-relaxed mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
              <li>Access all data we hold about you</li>
              <li>Request deletion of your account and all associated data</li>
              <li>Correct any inaccurate data we hold</li>
              <li>Export your scan history</li>
              <li>Object to automated decision making</li>
              <li>Withdraw consent at any time</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              To exercise any of these rights email <a href="mailto:marginnoffical@gmail.com" className="text-teal-600 hover:text-teal-700 cursor-pointer">marginnoffical@gmail.com</a> and we will respond within 30 days.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Data retention</h2>
            <p className="text-gray-700 leading-relaxed">
              We keep your data for as long as your account is active. If you delete your account we remove your personal data within 30 days. Anonymised and aggregated scan data may be retained indefinitely for product improvement purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Photos</h2>
            <p className="text-gray-700 leading-relaxed">
              Photos you upload are processed to generate your scan result and are not stored permanently after analysis is complete. We do not use your photos for any other purpose.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Cookies</h2>
            <p className="text-gray-700 leading-relaxed">
              Marginn uses essential cookies only to keep you logged in and remember your preferences. We do not use tracking cookies, advertising cookies or any third party analytics cookies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Children</h2>
            <p className="text-gray-700 leading-relaxed">
              Marginn is not intended for anyone under the age of 18. We do not knowingly collect data from anyone under 18. If you believe a minor has created an account contact us immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Changes to this policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this policy at any time. We will notify you of significant changes by email. Continued use of Marginn after changes are posted means you accept the updated policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact</h2>
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