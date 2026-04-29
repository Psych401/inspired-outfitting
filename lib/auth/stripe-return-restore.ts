const STRIPE_RETURN_RESTORE_KEY = 'stripe_checkout_return_rehydrating';

export function startStripeReturnRestore(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STRIPE_RETURN_RESTORE_KEY, '1');
}

export function finishStripeReturnRestore(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STRIPE_RETURN_RESTORE_KEY);
}

export function isStripeReturnRestoreActive(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(STRIPE_RETURN_RESTORE_KEY) === '1';
}

