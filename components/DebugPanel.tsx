'use client';

import React, { useState } from 'react';
import { PreprocessingDebugInfo } from '@/lib/preprocessingPipeline';
import { BackgroundRemovalDebugInfo } from '@/lib/backgroundRemoval';
import { SegmentationDebugInfo } from '@/lib/garmentSegmentation';

interface DebugPanelProps {
  debugInfo: PreprocessingDebugInfo;
  isOpen: boolean;
  onClose: () => void;
}

const ImageComparison: React.FC<{
  title: string;
  originalUrl?: string;
  processedUrl: string;
  dimensions?: { width: number; height: number };
}> = ({ title, originalUrl, processedUrl, dimensions }) => {
  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <h4 className="font-semibold mb-3">{title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {originalUrl && (
          <div>
            <p className="text-sm text-gray-600 mb-2">Original</p>
            <img src={originalUrl} alt="Original" className="w-full border rounded" />
            <button
              onClick={() => handleDownload(originalUrl, 'original.png')}
              className="mt-2 text-xs text-dusty-rose hover:underline"
            >
              Download Original
            </button>
          </div>
        )}
        <div>
          <p className="text-sm text-gray-600 mb-2">
            Processed {dimensions && `(${dimensions.width}×${dimensions.height})`}
          </p>
          <img src={processedUrl} alt="Processed" className="w-full border rounded bg-gray-100" />
          <button
            onClick={() => handleDownload(processedUrl, 'processed.png')}
            className="mt-2 text-xs text-dusty-rose hover:underline"
          >
            Download Processed
          </button>
        </div>
      </div>
    </div>
  );
};

const BackgroundRemovalDebug: React.FC<{ debug: BackgroundRemovalDebugInfo }> = ({ debug }) => {
  return (
    <div className="bg-soft-blush/30 p-4 rounded-lg border border-dusty-rose/20">
      <h4 className="font-semibold mb-3 flex items-center gap-2">
        Background Removal
        <span className={`text-xs px-2 py-1 rounded ${
          debug.method === 'replicate' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {debug.method === 'replicate' ? '✅ Replicate API' : '⚠️ Client-side'}
        </span>
      </h4>
      
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-600">Processing Time</p>
            <p className="font-mono">{debug.processingTimeMs}ms</p>
          </div>
          <div>
            <p className="text-gray-600">Dimensions</p>
            <p className="font-mono">
              {debug.originalDimensions.width}×{debug.originalDimensions.height} →{' '}
              {debug.processedDimensions.width}×{debug.processedDimensions.height}
            </p>
          </div>
        </div>
        
        {debug.warnings && debug.warnings.length > 0 && (
          <div className="mt-3">
            <p className="text-yellow-700 font-semibold">Warnings:</p>
            <ul className="list-disc list-inside text-yellow-600">
              {debug.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

    </div>
  );
};

const SegmentationDebug: React.FC<{ debug: SegmentationDebugInfo }> = ({ debug }) => {
  return (
    <div className="bg-gold-beige/20 p-4 rounded-lg border border-gold-beige/40">
      <h4 className="font-semibold mb-3">Garment Segmentation</h4>
      
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-gray-600">Selected Type</p>
          <p className="font-semibold capitalize">{debug.selectedGarmentType}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-600">Aspect Ratio</p>
            <p className="font-mono">{debug.aspectRatio}</p>
            <p className="text-xs text-gray-500 capitalize">{debug.aspectRatioAnalysis}</p>
          </div>
          <div>
            <p className="text-gray-600">Confidence</p>
            <p className="font-mono">
              {debug.detectionConfidence}
              {debug.isSingleGarment && ' ✅'}
            </p>
          </div>
        </div>

        <div>
          <p className="text-gray-600">Edge Density</p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <p className="text-xs">Top: {debug.edgeDensity.topEdgeDensity}</p>
            </div>
            <div>
              <p className="text-xs">Bottom: {debug.edgeDensity.bottomEdgeDensity}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-gray-600">Decision</p>
          <p className={`font-semibold ${
            debug.decision === 'using-full-image' ? 'text-green-700' : 'text-blue-700'
          }`}>
            {debug.decision === 'using-full-image' 
              ? '✅ Using full image (no cropping)' 
              : '✂️ Using region cropping'}
          </p>
        </div>

        {debug.regionCoordinates && (
          <div>
            <p className="text-gray-600">Region Coordinates</p>
            <p className="font-mono text-xs">
              x: {debug.regionCoordinates.x}, y: {debug.regionCoordinates.y}, 
              w: {debug.regionCoordinates.width}, h: {debug.regionCoordinates.height}
            </p>
          </div>
        )}

        <div>
          <p className="text-gray-600">Dimensions</p>
          <p className="font-mono text-xs">
            Original: {debug.originalDimensions.width}×{debug.originalDimensions.height} → 
            Processed: {debug.processedDimensions.width}×{debug.processedDimensions.height}
          </p>
        </div>
      </div>

      {debug.originalImageDataUrl && (
        <div className="mt-4">
          <ImageComparison
            title="Segmentation Result"
            originalUrl={debug.originalImageDataUrl}
            processedUrl={debug.segmentedImageDataUrl || debug.originalImageDataUrl}
            dimensions={debug.processedDimensions}
          />
        </div>
      )}
    </div>
  );
};

export const DebugPanel: React.FC<DebugPanelProps> = ({ debugInfo, isOpen, onClose }) => {
  // Add console log to verify component is being called
  React.useEffect(() => {
    if (isOpen) {
      console.log('🔍 DebugPanel is OPEN');
    }
  }, [isOpen]);

  if (!isOpen) {
    console.log('🔍 DebugPanel is CLOSED (isOpen:', isOpen, ')');
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      style={{ display: 'flex' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative z-[10000]"
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'block', position: 'relative' }}
      >
        <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center z-10">
          <h2 className="text-2xl font-heading font-bold">Preprocessing Debug Info</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center"
            aria-label="Close debug panel"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Processing Summary</h3>
            <p className="text-sm">
              Total Processing Time: <span className="font-mono">{debugInfo.totalProcessingTimeMs}ms</span>
            </p>
          </div>

          {/* Background Removal - Person */}
          {debugInfo.personBackgroundRemoval && (
            <div>
              <h3 className="font-semibold mb-2 text-lg">Person Image - Background Removal</h3>
              <BackgroundRemovalDebug debug={debugInfo.personBackgroundRemoval} />
              {debugInfo.personBackgroundRemoval.originalImageDataUrl && debugInfo.personBackgroundRemoval.processedImageDataUrl && (
                <div className="mt-4">
                  <ImageComparison
                    title="Person Background Removal"
                    originalUrl={debugInfo.personBackgroundRemoval.originalImageDataUrl}
                    processedUrl={debugInfo.personBackgroundRemoval.processedImageDataUrl}
                    dimensions={debugInfo.personBackgroundRemoval.processedDimensions}
                  />
                </div>
              )}
            </div>
          )}

          {/* Background Removal - Garment */}
          {debugInfo.garmentBackgroundRemoval && (
            <div>
              <h3 className="font-semibold mb-2 text-lg">Garment Image - Background Removal</h3>
              <BackgroundRemovalDebug debug={debugInfo.garmentBackgroundRemoval} />
              {debugInfo.garmentBackgroundRemoval.originalImageDataUrl && debugInfo.garmentBackgroundRemoval.processedImageDataUrl && (
                <div className="mt-4">
                  <ImageComparison
                    title="Garment Background Removal"
                    originalUrl={debugInfo.garmentBackgroundRemoval.originalImageDataUrl}
                    processedUrl={debugInfo.garmentBackgroundRemoval.processedImageDataUrl}
                    dimensions={debugInfo.garmentBackgroundRemoval.processedDimensions}
                  />
                </div>
              )}
            </div>
          )}

          {/* Segmentation */}
          {debugInfo.garmentSegmentation && (
            <div>
              <h3 className="font-semibold mb-2 text-lg">Garment Segmentation</h3>
              <SegmentationDebug debug={debugInfo.garmentSegmentation} />
              {debugInfo.garmentSegmentation.originalImageDataUrl && debugInfo.garmentSegmentation.segmentedImageDataUrl && (
                <div className="mt-4">
                  <ImageComparison
                    title="Segmentation Result"
                    originalUrl={debugInfo.garmentSegmentation.originalImageDataUrl}
                    processedUrl={debugInfo.garmentSegmentation.segmentedImageDataUrl}
                    dimensions={debugInfo.garmentSegmentation.processedDimensions}
                  />
                </div>
              )}
            </div>
          )}

          {/* Images Sent to Gemini */}
          {debugInfo.imagesSentToGemini && (
            <div>
              <h3 className="font-semibold mb-2 text-lg">Images Sent to Gemini</h3>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-600 mb-4">
                  These are the exact preprocessed images (background-removed) that were sent to the Gemini API.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-3 rounded border">
                    <h4 className="font-semibold text-sm mb-2">Person Image (Sent to Gemini)</h4>
                    <img 
                      src={debugInfo.imagesSentToGemini.personImageDataUrl} 
                      alt="Person image sent to Gemini" 
                      className="w-full border rounded bg-gray-100"
                    />
                    <button
                      onClick={() => {
                        const url = debugInfo.imagesSentToGemini?.personImageDataUrl;
                        if (!url) return;
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'person-sent-to-gemini.png';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="mt-2 text-xs text-blue-600 hover:underline"
                    >
                      Download Person Image
                    </button>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <h4 className="font-semibold text-sm mb-2">Garment Image (Sent to Gemini)</h4>
                    <img 
                      src={debugInfo.imagesSentToGemini.garmentImageDataUrl} 
                      alt="Garment image sent to Gemini" 
                      className="w-full border rounded bg-gray-100"
                    />
                    <button
                      onClick={() => {
                        const url = debugInfo.imagesSentToGemini?.garmentImageDataUrl;
                        if (!url) return;
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'garment-sent-to-gemini.png';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="mt-2 text-xs text-blue-600 hover:underline"
                    >
                      Download Garment Image
                    </button>
                  </div>
                </div>
                {debugInfo.imagesSentToGemini?.personImageBase64Preview && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono">
                    <p className="font-semibold">Base64 Preview (first 100 chars):</p>
                    <p className="break-all">{debugInfo.imagesSentToGemini.personImageBase64Preview}...</p>
                  </div>
                )}
                {debugInfo.imagesSentToGemini?.garmentImageBase64Preview && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono">
                    <p className="font-semibold">Base64 Preview (first 100 chars):</p>
                    <p className="break-all">{debugInfo.imagesSentToGemini.garmentImageBase64Preview}...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Image Received from Gemini */}
          {debugInfo.imageReceivedFromGemini && (
            <div>
              <h3 className="font-semibold mb-2 text-lg">Image Received from Gemini</h3>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-gray-600 mb-4">
                  This is the exact image that was received from the Gemini API response.
                </p>
                <div className="bg-white p-3 rounded border">
                  <img 
                    src={debugInfo.imageReceivedFromGemini} 
                    alt="Image received from Gemini" 
                    className="w-full border rounded bg-gray-100"
                  />
                  <button
                    onClick={() => {
                      const url = debugInfo.imageReceivedFromGemini;
                      if (!url) return;
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = 'image-received-from-gemini.png';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="mt-2 text-xs text-green-600 hover:underline"
                  >
                    Download Gemini Output Image
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Complete Image Pipeline Comparison */}
          <div>
            <h3 className="font-semibold mb-2 text-lg">Complete Image Pipeline Comparison</h3>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <p className="text-sm text-gray-600 mb-4">
                Compare all versions of images through the pipeline to identify where original data might leak through.
              </p>

              {/* Person Image Pipeline */}
              <div className="mb-6">
                <h4 className="font-semibold text-md mb-3">Person Image Pipeline</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {debugInfo.originalPersonImageDataUrl && (
                    <div className="bg-white p-3 rounded border">
                      <h5 className="font-semibold text-xs mb-2 text-red-700">1. Original</h5>
                      <img 
                        src={debugInfo.originalPersonImageDataUrl} 
                        alt="Original person image" 
                        className="w-full border rounded bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">Has background</p>
                    </div>
                  )}
                  {debugInfo.personImageAfterBackgroundRemoval && (
                    <div className="bg-white p-3 rounded border">
                      <h5 className="font-semibold text-xs mb-2 text-blue-700">2. After BG Removal</h5>
                      <img 
                        src={debugInfo.personImageAfterBackgroundRemoval} 
                        alt="Person after background removal" 
                        className="w-full border rounded bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">Background removed</p>
                    </div>
                  )}
                  {debugInfo.finalPersonImageDataUrl && (
                    <div className="bg-white p-3 rounded border">
                      <h5 className="font-semibold text-xs mb-2 text-green-700">3. Final (Sent to Gemini)</h5>
                      <img 
                        src={debugInfo.finalPersonImageDataUrl} 
                        alt="Final person image sent to Gemini" 
                        className="w-full border rounded bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">Should match #2</p>
                    </div>
                  )}
                </div>
                {debugInfo.imagesSentToGemini?.personImageBase64Preview && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono">
                    <p className="font-semibold">Base64 Preview (first 100 chars):</p>
                    <p className="break-all">{debugInfo.imagesSentToGemini.personImageBase64Preview}...</p>
                  </div>
                )}
              </div>

              {/* Garment Image Pipeline */}
              <div>
                <h4 className="font-semibold text-md mb-3">Garment Image Pipeline</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {debugInfo.originalGarmentImageDataUrl && (
                    <div className="bg-white p-3 rounded border">
                      <h5 className="font-semibold text-xs mb-2 text-red-700">1. Original</h5>
                      <img 
                        src={debugInfo.originalGarmentImageDataUrl} 
                        alt="Original garment image" 
                        className="w-full border rounded bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">Has background</p>
                    </div>
                  )}
                  {debugInfo.garmentImageAfterBackgroundRemoval && (
                    <div className="bg-white p-3 rounded border">
                      <h5 className="font-semibold text-xs mb-2 text-blue-700">2. After BG Removal</h5>
                      <img 
                        src={debugInfo.garmentImageAfterBackgroundRemoval} 
                        alt="Garment after background removal" 
                        className="w-full border rounded bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">Background removed</p>
                    </div>
                  )}
                  {debugInfo.garmentImageAfterSegmentation && (
                    <div className="bg-white p-3 rounded border">
                      <h5 className="font-semibold text-xs mb-2 text-yellow-700">3. After Segmentation</h5>
                      <img 
                        src={debugInfo.garmentImageAfterSegmentation} 
                        alt="Garment after segmentation" 
                        className="w-full border rounded bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">Segmented</p>
                    </div>
                  )}
                  {debugInfo.finalGarmentImageDataUrl && (
                    <div className="bg-white p-3 rounded border">
                      <h5 className="font-semibold text-xs mb-2 text-green-700">4. Final (Sent to Gemini)</h5>
                      <img 
                        src={debugInfo.finalGarmentImageDataUrl} 
                        alt="Final garment image sent to Gemini" 
                        className="w-full border rounded bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">Should match #3</p>
                    </div>
                  )}
                </div>
                {debugInfo.imagesSentToGemini?.garmentImageBase64Preview && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono">
                    <p className="font-semibold">Base64 Preview (first 100 chars):</p>
                    <p className="break-all">{debugInfo.imagesSentToGemini.garmentImageBase64Preview}...</p>
                  </div>
                )}
              </div>

              {/* Verification Notes */}
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-sm font-semibold mb-2">🔍 Verification Checklist:</p>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  <li>Original images should have backgrounds (step 1)</li>
                  <li>After BG removal should have transparent backgrounds (step 2)</li>
                  <li>Final images should match "After BG removal" (no original data)</li>
                  <li>If final images look like originals, data is leaking from cache/references</li>
                  <li>Base64 previews should be different between original and processed</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

