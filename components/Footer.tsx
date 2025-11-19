'use client';

import React from 'react';
import Link from 'next/link';

const Footer: React.FC = () => {
  return (
    <footer className="bg-soft-blush">
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
          <div>
            <h3 className="text-xl font-heading font-bold mb-4">Inspired Outfitting</h3>
            <p className="text-charcoal-grey/80">See yourself in every style.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><Link href="/" className="hover:text-dusty-rose transition-colors">Home</Link></li>
              <li><Link href="/dress-yourself" className="hover:text-dusty-rose transition-colors">Dress Yourself</Link></li>
              <li><Link href="/pricing" className="hover:text-dusty-rose transition-colors">Pricing</Link></li>
              <li><Link href="/contact" className="hover:text-dusty-rose transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Contact Us</h3>
            <p>Cork, Ireland</p>
            <p>Email: <a href="mailto:webdevdesigner404@gmail.com" className="hover:text-dusty-rose transition-colors">webdevdesigner404@gmail.com</a></p>
          </div>
        </div>
        <div className="text-center mt-8 border-t border-dusty-rose/20 pt-6">
          <p>&copy; {new Date().getFullYear()} Inspired Outfitting. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;