import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';
import HeroSection from './components/HeroSection';
import FeaturesSection from './components/FeaturesSection';
import HowItWorksSection from './components/HowItWorksSection';
import PlatformsSection from './components/PlatformsSection';
import CTASection from './components/CTASection';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main>
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <PlatformsSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
