'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { MenuIcon, XIcon } from './IconComponents';
import { canPurchaseCreditPacks } from '@/lib/billing/subscription';
import { PLAN_LABEL, type SubscriptionPlanKey } from '@/lib/billing/products';
import type { SubscriptionStatus } from '@/lib/billing/user-store';

const Header: React.FC = () => {
  const { isAuthenticated, user, logout, billing, refreshBilling } = useAuth();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const creditsHref = (() => {
    const tier: SubscriptionPlanKey | 'none' =
      billing.subscriptionTier === 'none' ? 'none' : billing.subscriptionTier;
    const subscribed = canPurchaseCreditPacks(
      billing.subscriptionStatus as SubscriptionStatus,
      tier
    );
    return subscribed ? '/pricing#credit-packs' : '/pricing#subscription-plans';
  })();

  const creditsLabel =
    billing.loading || billing.credits === null
      ? '…'
      : `${billing.credits} credit${billing.credits === 1 ? '' : 's'}`;

  const NavLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
    <Link
      href={href}
      onClick={() => setIsMenuOpen(false)}
      className="text-charcoal-grey hover:text-dusty-rose transition-colors duration-300 py-2"
    >
      {children}
    </Link>
  );

  const navItems = (
    <>
      <NavLink href="/">Home</NavLink>
      <NavLink href="/dress-yourself">Dress Yourself</NavLink>
      <NavLink href="/pricing">Pricing</NavLink>
      <NavLink href="/contact">Contact</NavLink>
    </>
  );

  return (
    <header className="bg-warm-cream/80 backdrop-blur-lg sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="text-2xl font-heading font-bold text-charcoal-grey">
          Inspired Outfitting
        </Link>
        <nav className="hidden md:flex items-center space-x-6">
          {navItems}
          {isAuthenticated ? (
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => {
                  void refreshBilling();
                  router.push(creditsHref);
                }}
                className="inline-flex items-center rounded-full border border-dusty-rose/40 bg-soft-blush/60 px-3 py-1 text-xs font-semibold text-charcoal-grey shadow-sm transition hover:bg-soft-blush hover:border-dusty-rose/60"
                title={subscribedTitle(billing)}
              >
                {creditsLabel}
              </button>
              <NavLink href="/profile">{user?.name}</NavLink>
              <button
                onClick={handleLogout}
                className="bg-dusty-rose text-white px-4 py-2 rounded-full hover:bg-opacity-80 transition-all duration-300"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              href="/auth"
              className="bg-dusty-rose text-white px-4 py-2 rounded-full hover:bg-opacity-80 transition-all duration-300"
            >
              Login / Sign Up
            </Link>
          )}
        </nav>
        <div className="md:hidden">
          <button onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      {isMenuOpen && (
        <div className="md:hidden bg-warm-cream pb-4">
          <nav className="flex flex-col items-center space-y-4 px-6">
            {navItems}
            {isAuthenticated ? (
              <div className="flex flex-col items-center space-y-4 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    void refreshBilling();
                    router.push(creditsHref);
                  }}
                  className="inline-flex items-center rounded-full border border-dusty-rose/40 bg-soft-blush/60 px-3 py-1 text-xs font-semibold text-charcoal-grey"
                >
                  {creditsLabel}
                </button>
                <NavLink href="/profile">{user?.name}</NavLink>
                <button
                  onClick={handleLogout}
                  className="bg-dusty-rose text-white w-full px-4 py-2 rounded-full hover:bg-opacity-80 transition-all duration-300"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                href="/auth"
                onClick={() => setIsMenuOpen(false)}
                className="bg-dusty-rose text-white w-full px-4 py-2 rounded-full hover:bg-opacity-80 transition-all duration-300 text-center"
              >
                Login / Sign Up
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};

function subscribedTitle(billing: { subscriptionTier: string; subscriptionStatus: string }): string {
  const tier =
    billing.subscriptionTier === 'none'
      ? 'Not subscribed'
      : `${PLAN_LABEL[billing.subscriptionTier as SubscriptionPlanKey]} · ${billing.subscriptionStatus}`;
  return `Billing: ${tier}. Click to manage plans or credit packs.`;
}

export default Header;
