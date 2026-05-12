import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../landing/components/Footer';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const message = data.get('message') as string;
    if (message && message.length > 500) return;

    setLoading(true);

    const body = new URLSearchParams();
    data.forEach((value, key) => {
      body.append(key, value as string);
    });

    try {
      await fetch('https://readdy.ai/api/form/d6lli1g5dsf7sr1n60pg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-black text-white py-20">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-4 font-medium">Contact</p>
            <h1 className="text-5xl font-bold leading-tight mb-4">Get in touch</h1>
            <p className="text-gray-400 text-lg">
              Questions, feedback, or just want to say hello — we'd love to hear from you.
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-12">

              {/* Left — info */}
              <div className="md:col-span-2 space-y-10">
                <div>
                  <h2 className="text-lg font-bold text-black mb-3">Email us directly</h2>
                  <a
                    href="mailto:hello@marginn.co.uk"
                    className="inline-flex items-center gap-2 text-black font-semibold hover:opacity-60 transition-opacity cursor-pointer"
                  >
                    <span className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg">
                      <i className="ri-mail-line text-base" />
                    </span>
                    hello@marginn.co.uk
                  </a>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-black mb-3">Response time</h2>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    We typically reply within 24 hours on weekdays. For urgent issues, email us directly.
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-black mb-3">Other pages</h2>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <Link to="/about" className="text-gray-500 hover:text-black transition-colors cursor-pointer flex items-center gap-2">
                        <span className="w-5 h-5 flex items-center justify-center"><i className="ri-information-line" /></span>
                        About Marginn
                      </Link>
                    </li>
                    <li>
                      <Link to="/status" className="text-gray-500 hover:text-black transition-colors cursor-pointer flex items-center gap-2">
                        <span className="w-5 h-5 flex items-center justify-center"><i className="ri-pulse-line" /></span>
                        System Status
                      </Link>
                    </li>
                    <li>
                      <Link to="/privacy" className="text-gray-500 hover:text-black transition-colors cursor-pointer flex items-center gap-2">
                        <span className="w-5 h-5 flex items-center justify-center"><i className="ri-shield-line" /></span>
                        Privacy Policy
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Right — form */}
              <div className="md:col-span-3">
                {submitted ? (
                  <div className="bg-gray-50 rounded-2xl p-10 text-center border border-gray-100">
                    <div className="w-14 h-14 flex items-center justify-center bg-black rounded-full mx-auto mb-5">
                      <i className="ri-check-line text-white text-2xl" />
                    </div>
                    <h3 className="text-xl font-bold text-black mb-2">Message sent!</h3>
                    <p className="text-gray-500 text-sm mb-6">
                      Thanks for reaching out. We'll get back to you at the email you provided.
                    </p>
                    <button
                      onClick={() => setSubmitted(false)}
                      className="text-sm text-black underline underline-offset-2 hover:opacity-60 transition-opacity cursor-pointer whitespace-nowrap"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form
                    data-readdy-form
                    id="contact-form"
                    onSubmit={handleSubmit}
                    className="bg-gray-50 rounded-2xl p-8 border border-gray-100 space-y-5"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-black mb-1.5">
                          Name
                        </label>
                        <input
                          id="name"
                          name="name"
                          type="text"
                          required
                          placeholder="Jaedan Hughes"
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors"
                        />
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-black mb-1.5">
                          Email
                        </label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          required
                          placeholder="you@example.com"
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="subject" className="block text-sm font-medium text-black mb-1.5">
                        Subject
                      </label>
                      <input
                        id="subject"
                        name="subject"
                        type="text"
                        required
                        placeholder="What's this about?"
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors"
                      />
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-sm font-medium text-black mb-1.5">
                        Message
                        <span className="text-gray-400 font-normal ml-1">({charCount}/500)</span>
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        required
                        rows={5}
                        maxLength={500}
                        placeholder="Tell us what's on your mind..."
                        onChange={(e) => setCharCount(e.target.value.length)}
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors resize-none"
                      />
                      {charCount >= 500 && (
                        <p className="text-red-500 text-xs mt-1">Maximum 500 characters reached.</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading || charCount > 500}
                      className="w-full bg-black text-white text-sm font-semibold py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                    >
                      {loading ? 'Sending...' : 'Send message'}
                    </button>
                  </form>
                )}
              </div>

            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
