'use client';

import React from 'react';
import Button from '@/components/Button';
import { CheckIcon, SparklesIcon } from '@/components/IconComponents';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const PricingCard: React.FC<{
  plan: string;
  price: string;
  credits: number;
  costPerCredit: string;
  features: string[];
  isFeatured?: boolean;
  onSubscribe: () => void;
}> = ({ plan, price, credits, costPerCredit, features, isFeatured = false, onSubscribe }) => {
  return (
    <div className={`border rounded-xl p-8 flex flex-col transition-all duration-300 relative overflow-hidden ${isFeatured ? 'border-dusty-rose bg-white shadow-2xl scale-105 z-10' : 'border-gray-200 bg-white shadow-lg hover:shadow-xl'}`}>
      {isFeatured && (
        <div className="absolute top-0 right-0 bg-gold-beige text-white text-xs font-bold px-4 py-1 rounded-bl-lg">
          MOST POPULAR
        </div>
      )}
      <h3 className="text-2xl font-heading font-bold text-charcoal-grey">{plan}</h3>
      
      <div className="mt-6 mb-2">
        <span className="text-5xl font-heading font-extrabold text-charcoal-grey">{price}</span>
        <span className="text-charcoal-grey/60 font-medium">/mo</span>
      </div>
      
      <div className="bg-soft-blush/30 rounded-lg p-4 mb-6 border border-dusty-rose/20">
        <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold text-dusty-rose">{credits}</span>
            <span className="text-charcoal-grey font-semibold">Credits</span>
        </div>
        <p className="text-xs text-charcoal-grey/60 mt-1 uppercase tracking-wide font-semibold">
          {costPerCredit} per credit
        </p>
      </div>

      <ul className="space-y-4 mb-8 flex-grow">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <CheckIcon className="text-gold-beige w-5 h-5 mr-3 mt-1 flex-shrink-0" />
            <span className="text-charcoal-grey/80">{feature}</span>
          </li>
        ))}
        <li className="flex items-start">
            <CheckIcon className="text-gold-beige w-5 h-5 mr-3 mt-1 flex-shrink-0" />
            <span className="text-charcoal-grey/80 font-medium">Credits reset monthly</span>
        </li>
      </ul>
      
      <Button onClick={onSubscribe} variant={isFeatured ? 'primary' : 'secondary'} className="w-full mt-auto">
        Subscribe
      </Button>
    </div>
  );
};

const AddOnCard: React.FC<{
  credits: number;
  price: string;
  onPurchase: () => void;
}> = ({ credits, price, onPurchase }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col items-center text-center">
      <div className="w-12 h-12 bg-soft-blush rounded-full flex items-center justify-center mb-3 text-dusty-rose">
        <SparklesIcon className="w-6 h-6" />
      </div>
      <h4 className="text-xl font-bold text-charcoal-grey">{credits} Credits</h4>
      <p className="text-2xl font-heading font-bold text-dusty-rose my-2">{price}</p>
      <p className="text-xs text-charcoal-grey/50 mb-4">One-time payment</p>
      <Button onClick={onPurchase} variant="secondary" className="w-full text-sm py-2">
        Buy Pack
      </Button>
    </div>
  );
};

export default function PricingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isSubscriber = user && user.subscription !== 'Free';

  const handleSubscribe = () => {
    // In a real app, this would lead to a stripe checkout
    if (!user) {
        router.push('/auth');
    } else {
        // Proceed to checkout logic
        console.log("Proceed to subscription checkout");
    }
  };

  const handleAddOnPurchase = () => {
      console.log("Proceed to add-on checkout");
  };

  return (
    <div className="bg-warm-cream py-16 md:py-24">
      <div className="container mx-auto px-6">
        
        {/* Header & Free Trial Banner */}
        <div className="text-center mb-16">
          <div className="inline-block bg-dusty-rose/10 border border-dusty-rose text-dusty-rose px-6 py-2 rounded-full font-semibold mb-6 animate-fade-in-down">
            🎁 New users get 3 free credits — no payment required.
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-bold text-charcoal-grey">Simple, Credit-Based Pricing</h1>
          <p className="text-lg text-charcoal-grey/70 mt-4 max-w-2xl mx-auto">
            Choose a monthly plan to get your credits. Need more? Top up anytime.
          </p>
        </div>

        {/* Subscription Plans */}
        <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-start mb-20">
          <PricingCard
            plan="Starter"
            price="€9.99"
            credits={80}
            costPerCredit="€0.12"
            features={[
              "Standard generation speed",
              "HD quality downloads",
              "Access to community styles",
            ]}
            onSubscribe={handleSubscribe}
          />
          <PricingCard
            plan="Pro"
            price="€19.99"
            credits={220}
            costPerCredit="€0.09"
            features={[
              "Fast generation speed",
              "4K Ultra-HD downloads",
              "Priority support",
              "Private gallery"
            ]}
            isFeatured
            onSubscribe={handleSubscribe}
          />
          <PricingCard
            plan="Elite"
            price="€39.99"
            credits={500}
            costPerCredit="€0.08"
            features={[
              "Turbo generation speed",
              "Highest fidelity outputs",
              "Commercial usage rights",
              "Early access to beta features",
              "Dedicated account support"
            ]}
            onSubscribe={handleSubscribe}
          />
        </div>

        {/* Subscriber-Only Add-Ons */}
        {isSubscriber ? (
          <div className="max-w-4xl mx-auto animate-fade-in-up">
            <div className="text-center mb-10">
                <h2 className="text-3xl font-heading font-bold text-charcoal-grey">Need more credits?</h2>
                <p className="text-charcoal-grey/70">Exclusive top-up packs for active subscribers.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
                <AddOnCard credits={30} price="€4.99" onPurchase={handleAddOnPurchase} />
                <AddOnCard credits={60} price="€9.99" onPurchase={handleAddOnPurchase} />
                <AddOnCard credits={130} price="€19.99" onPurchase={handleAddOnPurchase} />
            </div>
          </div>
        ) : (
            <div className="max-w-3xl mx-auto text-center p-8 border-2 border-dashed border-gray-300 rounded-xl">
                <h3 className="text-xl font-semibold text-charcoal-grey/60">Subscriber Exclusive</h3>
                <p className="text-charcoal-grey/50 mt-2">Log in with an active subscription to view and purchase add-on credit packs.</p>
                {!user && (
                    <Button onClick={() => router.push('/auth')} variant="secondary" className="mt-4">
                        Login
                    </Button>
                )}
            </div>
        )}

      </div>
    </div>
  );
}

