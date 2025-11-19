'use client';

import React, { useState } from 'react';
import Button from '@/components/Button';

const FaqItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-dusty-rose/30 py-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center text-left"
      >
        <h3 className="text-lg font-semibold">{question}</h3>
        <span className="text-2xl text-dusty-rose">{isOpen ? '-' : '+'}</span>
      </button>
      {isOpen && <p className="mt-4 text-charcoal-grey/80">{answer}</p>}
    </div>
  );
};

export default function ContactPage() {
  const [formState, setFormState] = useState({ name: '', email: '', message: '' });
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormState({ ...formState, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here you would typically send the form data to a server
    console.log('Form submitted:', formState);
    setIsSubmitted(true);
  };

  return (
    <div className="container mx-auto px-6 py-16 md:py-24">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-heading font-bold">Get In Touch</h1>
        <p className="text-lg text-charcoal-grey/70 mt-2">We'd love to hear from you.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-16 items-start">
        {/* Contact Form */}
        <div className="bg-white p-8 rounded-lg shadow-lg">
          <h2 className="text-2xl font-heading font-semibold mb-6">Send us a message</h2>
          {isSubmitted ? (
            <div className="text-center p-8 bg-soft-blush rounded-lg">
              <h3 className="text-xl font-semibold">Thank you!</h3>
              <p>Your message has been sent. We'll get back to you shortly.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-charcoal-grey/90">Full Name</label>
                <input type="text" name="name" id="name" required className="mt-1 block w-full px-3 py-2 bg-warm-cream/50 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-dusty-rose focus:border-dusty-rose" onChange={handleChange} />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-charcoal-grey/90">Email Address</label>
                <input type="email" name="email" id="email" required className="mt-1 block w-full px-3 py-2 bg-warm-cream/50 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-dusty-rose focus:border-dusty-rose" onChange={handleChange} />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-charcoal-grey/90">Message</label>
                <textarea name="message" id="message" rows={4} required className="mt-1 block w-full px-3 py-2 bg-warm-cream/50 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-dusty-rose focus:border-dusty-rose" onChange={handleChange}></textarea>
              </div>
              <Button type="submit" className="w-full">
                Send Message
              </Button>
            </form>
          )}
        </div>

        {/* FAQ */}
        <div>
          <h2 className="text-2xl font-heading font-semibold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-2">
            <FaqItem
              question="How does the AI try-on work?"
              answer="Our advanced AI analyzes the photo of you and the outfit image. It then intelligently maps the clothing onto your body, adjusting for shape, lighting, and texture to create a realistic preview of how it would look."
            />
            <FaqItem
              question="What kind of photos should I upload?"
              answer="For best results, use a clear, well-lit, full-body photo of yourself standing straight. For outfits, use clear product shots on a plain background if possible."
            />
            <FaqItem
              question="Is my data and are my photos secure?"
              answer="Absolutely. We prioritize your privacy. All uploaded images are encrypted and used solely for the purpose of generating your try-on preview. They are never shared or used for any other purpose."
            />
             <FaqItem
              question="Can I try on accessories or shoes?"
              answer="Currently, our AI is optimized for clothing items like dresses, shirts, pants, and jackets. We are constantly improving our technology and plan to include accessories and shoes in a future update!"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

