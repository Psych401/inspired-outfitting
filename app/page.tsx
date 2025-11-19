'use client';

import React from 'react';
import Link from 'next/link';
import Button from '@/components/Button';
import TestimonialCard from '@/components/TestimonialCard';

export default function HomePage() {
  return (
    <div className="space-y-24 md:space-y-32 pb-24">
      {/* Hero Section */}
      <section className="pt-16 md:pt-24">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-6xl font-heading font-bold mb-4 animate-fade-in-down">
            See Yourself in Every Style
          </h1>
          <p className="text-lg md:text-xl max-w-3xl mx-auto text-charcoal-grey/80 mb-8 animate-fade-in-up">
            Upload your photo. Pick your outfit. See yourself styled instantly with the power of AI.
          </p>
          <Link href="/dress-yourself">
            <Button className="animate-bounce">
              Try It On Now
            </Button>
          </Link>
          <div className="mt-12 md:mt-16 relative">
             <img 
                src="https://picsum.photos/seed/fashion/1200/600" 
                alt="Fashion collage" 
                className="rounded-lg shadow-2xl w-full max-w-5xl mx-auto"
              />
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-heading font-bold">Why You'll Love It</h2>
          <p className="text-lg text-charcoal-grey/70 mt-2">The future of online shopping is here.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-lg shadow-lg text-center transition-transform transform hover:-translate-y-2">
            <h3 className="text-2xl font-heading font-semibold mb-2">Shop with Confidence</h3>
            <p>Never second-guess an online purchase again. See how clothes truly fit you before you buy.</p>
          </div>
          <div className="bg-white p-8 rounded-lg shadow-lg text-center transition-transform transform hover:-translate-y-2">
            <h3 className="text-2xl font-heading font-semibold mb-2">Unleash Creativity</h3>
            <p>Experiment with endless styles and outfits you've never dared to try. Your digital wardrobe awaits.</p>
          </div>
          <div className="bg-white p-8 rounded-lg shadow-lg text-center transition-transform transform hover:-translate-y-2">
            <h3 className="text-2xl font-heading font-semibold mb-2">Save Time & Effort</h3>
            <p>Skip the crowded stores and fitting rooms. Find your perfect look from the comfort of your home.</p>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="bg-soft-blush py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-heading font-bold">Loved by Fashionistas</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <TestimonialCard
              quote="This is a game-changer! I finally bought a dress I was unsure about, and it looked exactly like the AI preview."
              author="Jessica L."
              avatarUrl="https://picsum.photos/seed/person1/100/100"
            />
            <TestimonialCard
              quote="So much fun to play with! I've discovered new styles I wouldn't have considered before. Highly recommend."
              author="Chloe S."
              avatarUrl="https://picsum.photos/seed/person2/100/100"
            />
            <TestimonialCard
              quote="As someone who hates trying on clothes in stores, this is a dream come true. The technology is amazing."
              author="Megan R."
              avatarUrl="https://picsum.photos/seed/person3/100/100"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

