'use client';

import React from 'react';
import Link from 'next/link';

const ExampleCard: React.FC<{
  title: string;
  examples: string[];
  type: 'good' | 'bad' | 'okay';
}> = ({ title, examples, type }) => {
  const colors = {
    good: 'bg-green-50 border-green-200 text-green-800',
    bad: 'bg-red-50 border-red-200 text-red-800',
    okay: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  };

  const icons = {
    good: '✅',
    bad: '❌',
    okay: '⚠️',
  };

  return (
    <div className={`p-4 rounded-lg border-2 ${colors[type]}`}>
      <h4 className="font-semibold mb-2 flex items-center gap-2">
        <span>{icons[type]}</span>
        {title}
      </h4>
      <ul className="list-disc list-inside space-y-1 text-sm">
        {examples.map((example, index) => (
          <li key={index}>{example}</li>
        ))}
      </ul>
    </div>
  );
};

const GarmentTypeSection: React.FC<{
  title: string;
  description: string;
  goodExamples: string[];
  badExamples: string[];
  okayExamples: string[];
}> = ({ title, description, goodExamples, badExamples, okayExamples }) => {
  return (
    <section className="mb-12">
      <h2 className="text-3xl font-heading font-bold mb-2">{title}</h2>
      <p className="text-charcoal-grey/70 mb-6">{description}</p>
      
      <div className="grid md:grid-cols-3 gap-4">
        <ExampleCard title="Good Examples" examples={goodExamples} type="good" />
        <ExampleCard title="Bad Examples" examples={badExamples} type="bad" />
        <ExampleCard title="Okay Examples" examples={okayExamples} type="okay" />
      </div>
    </section>
  );
};

export default function UploadGuidePage() {
  return (
    <div className="container mx-auto px-6 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4">
            Upload Guide - Getting Best Results
          </h1>
          <p className="text-lg text-charcoal-grey/70 max-w-2xl mx-auto">
            Follow these guidelines to get the most accurate virtual try-on results. 
            The AI works best with clear, well-lit images of garments by themselves.
          </p>
        </div>

        {/* Quick Tips */}
        <div className="bg-soft-blush/50 border border-dusty-rose/30 rounded-lg p-6 mb-12">
          <h2 className="text-2xl font-heading font-semibold mb-4">💡 Quick Tips</h2>
          <ul className="space-y-2 text-charcoal-grey/80">
            <li>• Upload images of the garment itself, not on a person</li>
            <li>• Use clear, well-lit photos with good contrast</li>
            <li>• Plain backgrounds work best (white, gray, or solid colors)</li>
            <li>• Ensure the entire garment is visible in the frame</li>
            <li>• Avoid blurry, dark, or heavily edited images</li>
          </ul>
        </div>

        {/* Top Garments */}
        <GarmentTypeSection
          title="Tops (Shirts, Blouses, Jackets)"
          description="For best results with tops, use images where the garment is clearly visible and not being worn."
          goodExamples={[
            'Top laid flat on solid background',
            'Top on a hanger against plain wall',
            'Clear, well-lit image of just the top',
            'Front and back view if available',
          ]}
          badExamples={[
            'Top being worn by a model',
            'Multiple garments in one image',
            'Dark or blurry images',
            'Partially obscured garment',
          ]}
          okayExamples={[
            'Top on a mannequin',
            'Cropped image from a model photo',
            'Garment with simple background pattern',
          ]}
        />

        {/* Bottom Garments */}
        <GarmentTypeSection
          title="Bottoms (Pants, Skirts, Shorts)"
          description="Bottom garments should show the full length and shape clearly."
          goodExamples={[
            'Bottoms laid flat or folded',
            'On hanger against plain background',
            'Clear view of entire garment',
            'Both front and back if possible',
          ]}
          badExamples={[
            'Bottoms being worn',
            'Busy background patterns',
            'Partially obscured garments',
            'Multiple items in frame',
          ]}
          okayExamples={[
            'Mannequin wearing the bottoms',
            'Cropped from full outfit photo',
            'Simple background with good lighting',
          ]}
        />

        {/* Full Body Garments */}
        <GarmentTypeSection
          title="Full Body (Dresses, Jumpsuits, Outfits)"
          description="Full-body garments need to show the complete silhouette clearly."
          goodExamples={[
            'Garment on a hanger or laid flat',
            'Mannequin wearing the outfit',
            'Clear, full-length view',
            'Good lighting showing all details',
          ]}
          badExamples={[
            'Outfit on a moving model',
            'Multiple outfits in frame',
            'Poor lighting or angles',
            'Obstructed or partially hidden',
          ]}
          okayExamples={[
            'Cropped from catalog photo',
            'Model standing still (may include body parts)',
            'Simple studio background',
          ]}
        />

        {/* Visual Examples Section */}
        <section className="mb-12">
          <h2 className="text-3xl font-heading font-bold mb-6">Visual Examples</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="font-semibold mb-3 text-green-700">✅ Ideal Upload</h3>
              <div className="bg-gray-100 h-48 rounded flex items-center justify-center mb-3">
                <p className="text-gray-400 text-sm">Garment on plain background</p>
              </div>
              <p className="text-sm text-charcoal-grey/70">
                Clear, well-lit garment against a simple background. Entire item is visible.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="font-semibold mb-3 text-red-700">❌ Avoid This</h3>
              <div className="bg-gray-100 h-48 rounded flex items-center justify-center mb-3">
                <p className="text-gray-400 text-sm">Garment on a person</p>
              </div>
              <p className="text-sm text-charcoal-grey/70">
                Garment being worn makes it harder for AI to extract and apply accurately.
              </p>
            </div>
          </div>
        </section>

        {/* Common Mistakes */}
        <section className="mb-12 bg-warm-cream/50 p-6 rounded-lg">
          <h2 className="text-2xl font-heading font-semibold mb-4">Common Mistakes to Avoid</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-red-500 font-bold">❌</span>
              <div>
                <p className="font-semibold">Uploading images with people wearing the garment</p>
                <p className="text-sm text-charcoal-grey/70">
                  The AI needs to see the garment by itself to understand its shape and details.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-red-500 font-bold">❌</span>
              <div>
                <p className="font-semibold">Using images with busy or cluttered backgrounds</p>
                <p className="text-sm text-charcoal-grey/70">
                  Complex backgrounds can confuse the AI's garment detection.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-red-500 font-bold">❌</span>
              <div>
                <p className="font-semibold">Poor lighting or blurry images</p>
                <p className="text-sm text-charcoal-grey/70">
                  Clear, well-lit images produce the best results.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-red-500 font-bold">❌</span>
              <div>
                <p className="font-semibold">Multiple garments in one image</p>
                <p className="text-sm text-charcoal-grey/70">
                  Upload one garment at a time for accurate results.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Back to Try-On */}
        <div className="text-center mt-12">
          <Link
            href="/dress-yourself"
            className="inline-block bg-dusty-rose text-white px-8 py-3 rounded-full font-semibold hover:bg-opacity-90 transition-colors"
          >
            ← Back to Try-On
          </Link>
        </div>
      </div>
    </div>
  );
}

