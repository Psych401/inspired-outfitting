'use client';

/**
 * Marketing homepage — boutique AI try-on landing.
 *
 * IMAGE_SWAP_GUIDE (use files under public/ — never hotlink CDN URLs):
 * - Hero: find JSX comments beginning IMAGE_SWAP — use e.g. public/images/hero/model.jpg.
 * - AI fitting room preview: swap gradient panels for next/image fills.
 * - Designed for real outfit decisions: card backgrounds from public/images/use-cases/.
 * - Lookbook: triple panels per card under public/images/lookbook/.
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PLAN_LABEL, SUBSCRIPTION_PLANS, type SubscriptionPlanKey } from '@/lib/billing/products';

const PLAN_ORDER: SubscriptionPlanKey[] = ['closet', 'studio', 'runway'];

function Reveal({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

const primaryCtaClass =
  'inline-flex items-center justify-center px-8 py-3.5 rounded-full font-semibold text-lg transition-all duration-300 shadow-boutique-rose hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-boutique-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-boutique-ivory bg-boutique-rose text-white hover:bg-boutique-rose/90 motion-safe:hover:-translate-y-0.5 motion-reduce:hover:translate-y-0';

const secondaryCtaClass =
  'inline-flex items-center justify-center px-8 py-3.5 rounded-full font-semibold text-lg transition-all duration-300 shadow-boutique hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-boutique-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-boutique-ivory bg-white/95 text-boutique-cocoa border border-boutique-blush hover:bg-white motion-safe:hover:-translate-y-0.5 motion-reduce:hover:translate-y-0';

function SilhouetteFigure({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 240" fill="none" aria-hidden>
      <path
        fill="currentColor"
        fillOpacity="0.2"
        d="M60 12c7 0 13 6 13 13s-6 13-13 13-13-6-13-13 6-13 13-13zm2 30c14 1 26 10 30 23l9 42 14 5-3 10-22-7-5 92H47l-7-58-7 58H26l-6-92-21 7-3-10 14-5 10-42c4-14 17-24 32-24h10z"
      />
    </svg>
  );
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FloatingTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute z-20 whitespace-nowrap rounded-full border border-white/70 bg-white/92 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-boutique-cocoa shadow-boutique backdrop-blur-md motion-safe:animate-float-soft motion-reduce:animate-none ${className ?? ''}`}
    >
      {children}
    </span>
  );
}

function HeroEditorialCollage() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none lg:pr-4">
      {/* IMAGE_SWAP: Optional soft-focus editorial photography layer behind cards — e.g. `/images/hero/atelier-bg.jpg` */}
      <div
        className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-[radial-gradient(ellipse_at_30%_20%,rgba(243,214,216,0.55),transparent_55%),radial-gradient(ellipse_at_80%_70%,rgba(217,185,143,0.35),transparent_50%)] opacity-90 blur-2xl motion-safe:animate-float-soft-alt motion-reduce:animate-none"
        aria-hidden
      />

      <div className="relative min-h-[380px] md:min-h-[460px] lg:min-h-[520px]">
        <FloatingTag className="left-4 top-6 md:left-8">Silhouette</FloatingTag>
        <FloatingTag className="bottom-[52%] right-2 motion-safe:animate-float-soft-delay md:right-10">Drape</FloatingTag>
        <FloatingTag className="bottom-[18%] left-6 md:left-14">Fabric story</FloatingTag>

        {/* Back plane — editorial wash */}
        <div className="absolute left-4 top-16 h-[68%] w-[58%] rounded-[2rem] bg-gradient-to-br from-boutique-cocoa/25 via-boutique-blush/60 to-boutique-ivory shadow-boutique ring-1 ring-white/60 motion-safe:animate-float-soft motion-reduce:animate-none md:left-8 md:top-20 md:w-[52%]">
          {/* IMAGE_SWAP: Replace gradient with fashion editorial crop — `<Image fill className="object-cover rounded-[2rem]" />` */}
          <div className="relative flex h-full w-full items-end justify-center overflow-hidden rounded-[2rem]">
            <SilhouetteFigure className="mb-2 h-[92%] w-auto text-boutique-cocoa" />
            <p className="absolute bottom-4 left-4 font-accent text-xs italic text-white/90 drop-shadow-md">
              Quiet luxury moodboard
            </p>
          </div>
        </div>

        {/* Model photo card */}
        <div className="absolute right-2 top-10 z-10 w-[46%] rounded-[1.65rem] border border-white/80 bg-white/95 p-3 shadow-boutique-rose ring-1 ring-boutique-blush/40 backdrop-blur-md motion-safe:animate-float-soft-alt motion-reduce:animate-none md:right-6 md:top-12 md:w-[40%]">
          <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.22em] text-boutique-rose">Your photo</p>
          <div className="relative mt-2 aspect-[3/4] overflow-hidden rounded-xl bg-gradient-to-b from-boutique-blush via-boutique-ivory to-white shadow-boutique-inner">
            {/* IMAGE_SWAP: User-style portrait placeholder → `/images/hero/model-photo.jpg` */}
            <SilhouetteFigure className="absolute inset-x-0 bottom-0 mx-auto h-[108%] max-w-none text-boutique-rose/35" />
          </div>
        </div>

        {/* Garment item */}
        <div className="absolute bottom-[26%] left-[2%] z-10 w-[38%] rounded-[1.5rem] border border-boutique-champagne/50 bg-white/90 p-3 shadow-boutique ring-1 ring-boutique-champagne/25 backdrop-blur-sm motion-safe:animate-float-soft-delay motion-reduce:animate-none md:left-[6%] md:w-[34%]">
          <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.2em] text-boutique-cocoa/75">Piece</p>
          <div className="relative mt-2 aspect-square overflow-hidden rounded-xl bg-gradient-to-tr from-boutique-champagne/40 via-white to-boutique-blush/50">
            {/* IMAGE_SWAP: Flat-lay garment → `/images/hero/garment.png` */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl opacity-30">⌟</span>
            </div>
          </div>
        </div>

        {/* AI result + notes */}
        <div className="absolute bottom-6 right-4 z-20 w-[54%] rounded-[1.65rem] border border-boutique-rose/35 bg-gradient-to-br from-white via-boutique-ivory to-boutique-blush/35 p-3 shadow-boutique-rose ring-1 ring-white/80 backdrop-blur-md motion-safe:animate-float-soft motion-reduce:animate-none md:bottom-10 md:right-10 md:w-[48%]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.22em] text-boutique-cocoa">AI fitting room</span>
            <span className="rounded-full bg-boutique-champagne/35 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-boutique-cocoa/80">
              Preview
            </span>
          </div>
          <div className="relative mt-2 aspect-[5/6] overflow-hidden rounded-xl bg-gradient-to-br from-boutique-cocoa/15 via-boutique-blush/45 to-boutique-champagne/40 shadow-inner">
            {/* IMAGE_SWAP: Generated try-on preview → `/images/hero/ai-result.jpg` */}
            <SilhouetteFigure className="absolute inset-x-2 bottom-0 text-boutique-cocoa/25" />
          </div>
          <div className="mt-2 rounded-lg border border-white/60 bg-white/70 px-3 py-2 text-[11px] leading-snug text-boutique-cocoa/75">
            <span className="font-semibold text-boutique-rose">Style notes ·</span> Hem line, shoulder ease, colour harmony — yours to refine.
          </div>
        </div>
      </div>
    </div>
  );
}

function FittingRoomPreviewSection() {
  const steps = [
    {
      title: 'Your photo',
      caption: 'Natural light, relaxed stance — we map the silhouette gently.',
      gradient: 'from-boutique-blush via-boutique-ivory to-white',
    },
    {
      title: 'Clothing item',
      caption: 'A dress, blazer, or knit — the piece you are flirting with buying.',
      gradient: 'from-boutique-champagne/45 via-white to-boutique-blush/40',
    },
    {
      title: 'AI outfit preview',
      caption: 'See composition and proportion before it lands in your wardrobe.',
      gradient: 'from-boutique-cocoa/20 via-boutique-blush/50 to-boutique-champagne/35',
    },
  ];

  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(243,214,216,0.35)_100%)]"
        aria-hidden
      />
      <div className="relative container mx-auto px-5 md:px-6">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="font-accent text-lg italic text-boutique-rose">AI fitting room preview</p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-boutique-cocoa md:text-4xl lg:text-[2.75rem]">
            From mirror selfie to styled preview
          </h2>
          <p className="mt-4 text-boutique-cocoa/78">
            Three transformations — laid out like a couture workbook spread, so you always know what happens next.
          </p>
        </Reveal>

        <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-4">
          {steps.map((step, i) => (
            <React.Fragment key={step.title}>
              <Reveal>
                <div className="group flex h-full flex-col overflow-hidden rounded-[2rem] border border-boutique-blush/45 bg-white/75 shadow-boutique ring-1 ring-white/90 backdrop-blur-sm transition-all duration-500 motion-safe:hover:-translate-y-2 motion-safe:hover:shadow-boutique-rose motion-reduce:hover:translate-y-0">
                  <div className={`relative aspect-[3/4] w-full bg-gradient-to-br ${step.gradient}`}>
                    {/* IMAGE_SWAP: Step visual — `/images/fitting/step-${i + 1}.jpg` */}
                    <SilhouetteFigure className="absolute inset-x-4 bottom-0 h-[95%] text-boutique-cocoa/18 transition duration-500 group-hover:text-boutique-cocoa/28 motion-reduce:transition-none" />
                    <span className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 font-heading text-sm font-bold text-boutique-rose shadow-md">
                      {i + 1}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-heading text-xl font-semibold text-boutique-cocoa">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-boutique-cocoa/72">{step.caption}</p>
                  </div>
                </div>
              </Reveal>
              {i < steps.length - 1 && (
                <div className="hidden items-center justify-center text-boutique-champagne lg:flex">
                  <IconArrowRight className="h-10 w-10" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function DecisionUseCaseCard({
  title,
  subtitle,
  gradient,
}: {
  title: string;
  subtitle: string;
  gradient: string;
}) {
  return (
    <div className="group relative flex min-h-[280px] flex-col justify-end overflow-hidden rounded-[2rem] border border-white/50 shadow-boutique ring-1 ring-boutique-blush/30 transition-all duration-500 motion-safe:hover:-translate-y-2 motion-safe:hover:shadow-boutique-rose motion-reduce:hover:translate-y-0 sm:min-h-[340px]">
      {/* IMAGE_SWAP: `/images/decisions/${slug}.jpg` as background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      <SilhouetteFigure className="absolute -right-6 bottom-0 h-[85%] text-white/25 transition duration-500 group-hover:scale-[1.02] motion-reduce:transition-none md:-right-10" />
      <div className="relative bg-gradient-to-t from-boutique-cocoa/85 via-boutique-cocoa/25 to-transparent p-8 pt-24">
        <h3 className="font-heading text-2xl font-bold text-boutique-ivory">{title}</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-boutique-ivory/85">{subtitle}</p>
      </div>
    </div>
  );
}

function LookbookCard({
  lookNumber,
  palette,
}: {
  lookNumber: number;
  palette: [string, string, string];
}) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-boutique-cocoa/10 bg-white/90 shadow-boutique ring-1 ring-boutique-champagne/20 backdrop-blur-sm transition-all duration-500 motion-safe:hover:-translate-y-2 motion-safe:hover:shadow-boutique-rose motion-reduce:hover:translate-y-0">
      <div className="grid grid-cols-3 gap-0.5 bg-boutique-cocoa/10">
        {/* IMAGE_SWAP: lookbook triple — before / item / result assets */}
        <div className={`aspect-square bg-gradient-to-br ${palette[0]}`} />
        <div className={`aspect-square bg-gradient-to-br ${palette[1]}`} />
        <div className={`aspect-square bg-gradient-to-br ${palette[2]}`} />
      </div>
      <div className="flex items-start justify-between gap-4 border-t border-boutique-blush/30 p-6">
        <div>
          <p className="font-heading text-[11px] font-semibold uppercase tracking-[0.28em] text-boutique-rose">Look {lookNumber}</p>
          <p className="mt-1 font-accent text-lg italic text-boutique-cocoa">Before · Garment · Result</p>
        </div>
        <span className="shrink-0 rounded-full bg-boutique-blush/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-boutique-cocoa/70">
          Editorial
        </span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const valueStrip = ['Style smarter', 'Shop with confidence', 'Plan outfits faster', 'Avoid wasted purchases'];

  const howSteps = [
    { title: 'Upload your photo', body: 'Natural light flatters every preview — keep shoulders relaxed.', n: '01' },
    { title: 'Add the clothing item', body: 'Wishlist piece, runway reference, or boutique find.', n: '02' },
    { title: 'See your AI try-on', body: 'Preview silhouette and mood before you checkout.', n: '03' },
  ];

  const decisions = [
    {
      title: 'Online shopping',
      subtitle: 'Scroll less blindly — land on pieces that already suit your frame.',
      gradient: 'from-boutique-rose/40 via-boutique-blush to-boutique-ivory',
    },
    {
      title: 'Event outfits',
      subtitle: 'Guest lists, venues, dress codes — visualize the complete gesture.',
      gradient: 'from-boutique-champagne/50 via-boutique-blush/70 to-white',
    },
    {
      title: 'Holiday wardrobes',
      subtitle: 'Pack with intention when every inch of suitcase matters.',
      gradient: 'from-boutique-cocoa/30 via-boutique-rose/25 to-boutique-blush',
    },
    {
      title: 'Workwear styling',
      subtitle: 'Polish that reads on camera and in the conference room.',
      gradient: 'from-boutique-ivory via-boutique-champagne/35 to-boutique-blush/60',
    },
  ];

  const lookbookPalettes: [string, string, string][] = [
    ['from-boutique-blush to-boutique-ivory', 'from-boutique-champagne/50 to-white', 'from-boutique-cocoa/20 to-boutique-rose/40'],
    ['from-boutique-cocoa/25 to-boutique-blush', 'from-white to-boutique-blush/50', 'from-boutique-champagne/40 to-boutique-cocoa/15'],
    ['from-boutique-rose/35 to-boutique-ivory', 'from-boutique-blush to-white', 'from-boutique-cocoa/18 to-boutique-champagne/45'],
    ['from-boutique-champagne/45 to-boutique-blush', 'from-boutique-ivory to-boutique-rose/25', 'from-boutique-blush/80 to-boutique-cocoa/12'],
    ['from-white via-boutique-blush to-boutique-rose/30', 'from-boutique-champagne/35 to-boutique-ivory', 'from-boutique-cocoa/22 to-boutique-blush'],
    ['from-boutique-blush/90 to-white', 'from-boutique-cocoa/15 to-boutique-champagne/40', 'from-boutique-rose/40 to-boutique-ivory'],
  ];

  return (
    <div className="bg-boutique-ivory text-boutique-cocoa">
      {/* Hero — dramatic editorial first impression */}
      <section className="relative overflow-hidden pb-16 pt-10 md:pb-24 md:pt-14 lg:min-h-[88vh] lg:flex lg:items-center lg:pb-28 lg:pt-20">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_85%_5%,rgba(243,214,216,0.65),transparent),radial-gradient(ellipse_70%_55%_at_5%_95%,rgba(217,185,143,0.28),transparent)]"
          aria-hidden
        />
        <div className="relative container mx-auto grid items-center gap-12 px-5 lg:grid-cols-2 lg:gap-8 lg:px-6">
          <Reveal className="order-2 text-center lg:order-1 lg:text-left">
            <div className="mb-5 inline-flex items-center gap-3 border-b border-boutique-champagne/60 pb-2">
              <span className="h-px w-10 bg-boutique-champagne" aria-hidden />
              <span className="font-accent text-sm italic tracking-wide text-boutique-rose md:text-base">Inspired Outfitting</span>
            </div>
            <h1 className="font-heading text-[2.35rem] font-bold leading-[1.08] tracking-tight text-boutique-cocoa sm:text-5xl lg:text-[3.35rem] xl:text-[3.65rem]">
              Try on outfits before you buy them.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-boutique-cocoa/80 lg:mx-0 lg:text-xl">
              Upload your photo, add a clothing item, and see how it looks on you in seconds with your personal AI fitting
              room.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
              <Link href="/dress-yourself" className={primaryCtaClass}>
                Try Your First Outfit
              </Link>
              <Link href="/pricing" prefetch={false} className={secondaryCtaClass}>
                View Pricing
              </Link>
            </div>
          </Reveal>
          <Reveal className="order-1 lg:order-2">
            <HeroEditorialCollage />
          </Reveal>
        </div>
      </section>

      <section className="border-y border-boutique-blush/45 bg-gradient-to-r from-white/70 via-boutique-blush/35 to-white/70 py-9 backdrop-blur-md">
        <div className="container mx-auto px-5 md:px-6">
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-5 text-center font-heading text-xs font-semibold uppercase tracking-[0.22em] text-boutique-cocoa/78 md:text-[11px]">
            {valueStrip.map((label) => (
              <span key={label} className="whitespace-nowrap">
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <FittingRoomPreviewSection />

      <section className="relative pb-20 md:pb-28">
        <div className="container mx-auto px-5 md:px-6">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2 className="font-heading text-3xl font-bold md:text-4xl">Designed for real outfit decisions</h2>
            <p className="mt-4 text-boutique-cocoa/76">
              Image-led cards — swap photography in later without redesigning the grid.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-2">
            {decisions.map((d) => (
              <Reveal key={d.title}>
                <DecisionUseCaseCard title={d.title} subtitle={d.subtitle} gradient={d.gradient} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-boutique-blush/35 bg-white/35 py-16 md:py-24">
        <div className="container mx-auto px-5 md:px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold text-boutique-cocoa md:text-4xl">How it works</h2>
            <p className="mt-3 text-boutique-cocoa/72">Simple choreography — no runway intimidation required.</p>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {howSteps.map((s) => (
              <Reveal key={s.title}>
                <div className="flex h-full flex-col rounded-[2rem] border border-boutique-blush/40 bg-boutique-ivory/90 p-8 shadow-boutique ring-1 ring-white transition-all duration-500 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-boutique-rose motion-reduce:hover:translate-y-0">
                  <span className="font-accent text-3xl italic text-boutique-champagne">{s.n}</span>
                  <h3 className="mt-4 font-heading text-xl font-semibold text-boutique-cocoa">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-boutique-cocoa/74">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-b from-boutique-blush/25 via-boutique-ivory to-boutique-ivory py-20 md:py-28">
        <div className="pointer-events-none absolute left-0 top-24 h-72 w-72 rounded-full bg-boutique-champagne/20 blur-3xl" aria-hidden />
        <div className="relative container mx-auto px-5 md:px-6">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="font-accent text-lg italic text-boutique-rose">Lookbook</p>
            <h2 className="mt-2 font-heading text-3xl font-bold md:text-4xl lg:text-[2.75rem]">From inspiration to outfit preview</h2>
            <p className="mt-4 text-boutique-cocoa/75">
              Six layouts ready for photography — strong contrast between panels keeps the story readable at a glance.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {lookbookPalettes.map((palette, idx) => (
              <Reveal key={idx}>
                <LookbookCard lookNumber={idx + 1} palette={palette} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-20 pt-4 md:pb-28">
        <div className="container mx-auto px-5 md:px-6">
          <Reveal className="mx-auto flex max-w-5xl flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <h2 className="font-heading text-3xl font-bold md:text-4xl">Favourite looks & saved wardrobe</h2>
              <p className="mt-4 text-boutique-cocoa/76">
                Heart try-ons and garments in your profile — curate a shelf of outfits that feel unmistakably yours (sync
                refinements ship on our roadmap).
              </p>
              <Link
                href="/profile"
                className="mt-8 inline-flex rounded-full border-2 border-boutique-cocoa/15 bg-white px-8 py-3 font-semibold text-boutique-cocoa shadow-boutique transition hover:border-boutique-rose/40 hover:bg-boutique-blush/25"
              >
                Open your profile
              </Link>
            </div>
            <div className="relative flex min-h-[220px] flex-1 justify-center gap-4 sm:gap-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`relative w-[28%] max-w-[140px] rounded-[1.5rem] border border-white/80 bg-white/90 shadow-boutique-rose ring-1 ring-boutique-blush/35 backdrop-blur-sm ${
                    i === 1 ? 'motion-safe:animate-float-soft -translate-y-6 sm:-translate-y-10' : 'motion-safe:animate-float-soft-alt translate-y-4'
                  } motion-reduce:translate-y-0 motion-reduce:animate-none`}
                >
                  {/* IMAGE_SWAP: Saved outfit mock → `/images/teaser/saved-${i + 1}.jpg` */}
                  <div
                    className={`aspect-[4/5] rounded-[1.25rem] bg-gradient-to-br ${
                      i === 0
                        ? 'from-boutique-blush to-boutique-champagne/40'
                        : i === 1
                          ? 'from-boutique-cocoa/20 to-boutique-rose/35'
                          : 'from-boutique-champagne/45 to-boutique-blush'
                    } m-2 shadow-inner`}
                  />
                  <span className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-boutique-rose text-sm text-white shadow-md">
                    ♥
                  </span>
                  <p className="p-3 text-center font-heading text-[10px] font-semibold uppercase tracking-widest text-boutique-cocoa/55">
                    Saved look
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="pb-20 md:pb-28">
        <div className="container mx-auto px-5 md:px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold text-boutique-cocoa md:text-4xl">Membership at a glance</h2>
            <p className="mt-4 text-boutique-cocoa/75">Credits renew with your plan — top up anytime.</p>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PLAN_ORDER.map((key) => (
              <Reveal key={key}>
                <div className="flex h-full flex-col rounded-[2rem] border border-boutique-blush/45 bg-gradient-to-b from-white to-boutique-blush/20 p-8 shadow-boutique transition duration-500 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-boutique-rose motion-reduce:hover:translate-y-0">
                  <h3 className="font-heading text-2xl font-bold">{PLAN_LABEL[key]}</h3>
                  <p className="mt-4 text-4xl font-heading font-bold text-boutique-rose">{SUBSCRIPTION_PLANS[key].creditsPerPeriod}</p>
                  <p className="text-sm font-medium text-boutique-cocoa/65">credits / billing period</p>
                  <p className="mt-6 flex-1 text-sm leading-relaxed text-boutique-cocoa/72">
                    Elevated try-on allowance for how often you love to explore clothes.
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-12 text-center">
            <Link href="/pricing" prefetch={false} className={primaryCtaClass}>
              Compare plans & packs
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-boutique-blush/40 bg-boutique-blush/20 py-16 md:py-20">
        <div className="container mx-auto px-5 md:px-6">
          <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-3">
            <Reveal>
              <h3 className="font-heading text-lg font-semibold">Simple uploads</h3>
              <p className="mt-2 text-sm leading-relaxed text-boutique-cocoa/75">
                You decide what to bring into each session — quick, considered, yours.
              </p>
            </Reveal>
            <Reveal>
              <h3 className="font-heading text-lg font-semibold">You stay in control</h3>
              <p className="mt-2 text-sm leading-relaxed text-boutique-cocoa/75">
                Billing and wardrobe tools live in your profile whenever you need them.
              </p>
            </Reveal>
            <Reveal>
              <h3 className="font-heading text-lg font-semibold">Made for everyday styling</h3>
              <p className="mt-2 text-sm leading-relaxed text-boutique-cocoa/75">
                We complement your taste — we don&apos;t replace it.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Full-width premium closing gradient */}
      <section className="relative overflow-hidden bg-gradient-to-br from-boutique-cocoa via-[#4a3835] to-boutique-rose py-24 md:py-32">
        <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-boutique-champagne/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-boutique-blush/25 blur-3xl" aria-hidden />
        <div className="relative container mx-auto px-5 text-center md:px-6">
          <Reveal>
            <h2 className="font-heading text-3xl font-bold leading-tight text-boutique-ivory md:text-4xl lg:text-[2.85rem]">
              Create your first AI outfit preview today.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-boutique-ivory/88">
              Slip into your fitting room — refined visuals, gentle motion, decisions that feel as good as the clothes.
            </p>
            <Link
              href="/dress-yourself"
              className="mt-12 inline-flex items-center justify-center rounded-full bg-boutique-ivory px-12 py-4 font-heading text-lg font-semibold text-boutique-cocoa shadow-boutique transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boutique-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-boutique-cocoa motion-safe:hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            >
              Start in the fitting room
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
