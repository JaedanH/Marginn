import { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Card from '../../../components/base/Card';

const faqs = [
  {
    q: 'How does the AI scan work?',
    a: 'Upload a photo of any clothing or accessory item. Our AI analyses the image to identify the brand, model, and condition, then searches live marketplace data across Vinted, Depop, and eBay to give you an accurate resale price estimate.',
  },
  {
    q: 'How many scans do I get?',
    a: 'Free Trial accounts get 5 scans. Scout plan gives you 75 scans per month. Trader plan is unlimited. You can also top up with a Drop In pack (10 scans for £3) at any time.',
  },
  {
    q: 'Why is my scan count not updating?',
    a: 'Scan counts update in real time. If you\'re not seeing the latest count, try refreshing the page. If the issue persists, contact our support team.',
  },
  {
    q: 'Can I scan any type of item?',
    a: 'Marginn is optimised for clothing, footwear, and accessories. It works best with branded items that have an active resale market. Items without clear branding may return lower confidence results.',
  },
  {
    q: 'How accurate are the price estimates?',
    a: 'Our estimates are based on real sold listings from the past 30 days. Accuracy depends on how many recent listings exist for your item. High-demand items like Nike, Supreme, and Stone Island tend to have very accurate estimates.',
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'Go to Billing in the sidebar and click "Cancel plan". You\'ll keep full access until the end of your current billing period. No hidden fees or dark patterns.',
  },
  {
    q: 'What happens to my data?',
    a: 'Your scan history and saved items are stored securely in your account. We never sell your data to third parties. You can delete your account at any time from Settings.',
  },
  {
    q: 'The deep links aren\'t showing the right results',
    a: 'The Vinted, Depop, and eBay buttons use the search term identified by our AI. If the results look off, try adding brand keywords in the scan form to help the AI identify the item more precisely.',
  },
];

export default function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold text-black">Help &amp; Support</h1>
          <p className="text-gray-500 mt-1">Answers to common questions</p>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: 'ri-mail-line', label: 'Email Support', sub: 'hello@marginn.app', href: 'mailto:hello@marginn.app' },
            { icon: 'ri-twitter-x-line', label: 'Twitter / X', sub: '@marginnapp', href: 'https://twitter.com/marginnapp' },
            { icon: 'ri-book-open-line', label: 'Docs', sub: 'Read the guide', href: '#' },
          ].map(({ icon, label, sub, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block cursor-pointer"
            >
              <Card className="p-4 hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center mb-3">
                  <i className={`${icon} text-gray-600 text-base`}></i>
                </div>
                <p className="text-sm font-semibold text-black">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
              </Card>
            </a>
          ))}
        </div>

        {/* FAQ */}
        <div>
          <h2 className="text-lg font-bold text-black mb-4">Frequently Asked Questions</h2>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <Card key={i} className="overflow-hidden">
                <button
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-black pr-4">{faq.q}</span>
                  <i className={`ri-arrow-down-s-line text-gray-400 text-lg flex-shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}></i>
                </button>
                {openIndex === i && (
                  <div className="px-5 pb-4">
                    <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>

        {/* Contact Card */}
        <Card className="p-6 bg-gray-50">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
              <i className="ri-customer-service-2-line text-white text-base"></i>
            </div>
            <div>
              <h3 className="font-semibold text-black mb-1">Still need help?</h3>
              <p className="text-sm text-gray-500 mb-3">
                Our support team typically responds within a few hours on weekdays.
              </p>
              <a
                href="mailto:hello@marginn.app"
                className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline cursor-pointer"
              >
                <i className="ri-mail-send-line"></i>
                Send us a message
              </a>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
