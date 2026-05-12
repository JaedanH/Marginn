import Header from '../../components/feature/Header';
import HeroSection from './components/HeroSection';
import HowItWorksSection from './components/HowItWorksSection';
import ImpactStrip from './components/ImpactStrip';
import SocialProofSection from './components/SocialProofSection';
import PricingSection from './components/PricingSection';
import Footer from './components/Footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <ImpactStrip />
        <PricingSection />
        <SocialProofSection />
      </main>
      <Footer />
    </div>
  );
}
