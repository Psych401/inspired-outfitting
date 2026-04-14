'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Button from '@/components/Button';
import { MailIcon } from '@/components/IconComponents';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams?.get('email') ?? null;

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full space-y-8 bg-white p-10 rounded-2xl shadow-2xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-soft-blush text-dusty-rose">
          <MailIcon className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-3xl font-heading font-extrabold text-charcoal-grey">Verify your email</h1>
          <p className="mt-4 text-charcoal-grey/80 leading-relaxed">
            We sent a confirmation link{email ? (
              <>
                {' '}
                to <span className="font-semibold text-charcoal-grey">{email}</span>
              </>
            ) : (
              ' to your inbox'
            )}
            . Open the email and tap <strong>Confirm your email</strong> to activate your account.
          </p>
          <p className="mt-3 text-sm text-charcoal-grey/70">
            After you confirm, you&apos;ll be taken to our plans so you can subscribe when you&apos;re ready.
          </p>
        </div>
        <div className="rounded-lg border border-dusty-rose/20 bg-warm-cream/50 px-4 py-3 text-sm text-charcoal-grey/80">
          Didn&apos;t get it? Check spam or promotions. You can request a new link from the sign-in page after a few minutes.
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/auth" className="w-full sm:w-auto">
            <Button variant="primary" className="w-full">
              Back to sign in
            </Button>
          </Link>
          <Link href="/pricing" className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full">
              View pricing
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
          <p className="text-charcoal-grey/70">Loading…</p>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
