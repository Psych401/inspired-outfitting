import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/Button';
import { UploadIcon, SparklesIcon, DownloadIcon } from '../components/IconComponents';
import { NavigationProps } from '../types';
import PreviousOutfits from '../components/PreviousOutfits';

interface DressYourselfPageProps extends NavigationProps {}

const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
};

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type });
};

const ImageUploader: React.FC<{
    onFileSelect: (file: File) => void;
    preview: string | null;
    title: string;
    description: string;
}> = ({ onFileSelect, preview, title, description }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            onFileSelect(event.target.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                onFileSelect(file);
            }
        }
    };

    return (
        <div className="w-full">
            <h3 className="text-2xl font-heading font-semibold mb-2">{title}</h3>
            <p className="text-charcoal-grey/70 mb-4">{description}</p>
            <label 
                className={`relative cursor-pointer w-full h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-colors overflow-hidden ${
                    isDragging 
                        ? 'border-dusty-rose bg-dusty-rose/20' 
                        : 'border-dusty-rose/50 bg-soft-blush/30 hover:bg-soft-blush/60'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {preview ? (
                    <>
                        <img src={preview} alt="Preview" className="w-full h-full object-contain rounded-lg" />
                        {isDragging && (
                            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                <p className="text-dusty-rose font-semibold text-lg">Drop to replace</p>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center text-dusty-rose">
                        <UploadIcon className="mx-auto" />
                        <p className="mt-2">{isDragging ? 'Drop image here' : 'Click or drag & drop to upload'}</p>
                    </div>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            </label>
        </div>
    );
};

const GarmentTypeSelector: React.FC<{
    selection: { top: boolean; bottom: boolean; fullBody: boolean };
    onSelectType: (type: 'top' | 'bottom' | 'fullBody') => void;
}> = ({ selection, onSelectType }) => {
    const types = [
        { id: 'top', label: 'Top' },
        { id: 'bottom', label: 'Bottom' },
        { id: 'fullBody', label: 'Full Body' },
    ] as const;

    return (
        <div className="w-full">
            <h3 className="text-2xl font-heading font-semibold mb-2">3. Select Garment Type(s)</h3>
            <p className="text-charcoal-grey/70 mb-4">Help our AI understand what to replace. Select 'Top' and/or 'Bottom', or 'Full Body'.</p>
            <div className="grid grid-cols-3 gap-4">
                {types.map(({ id, label }) => (
                    <button
                        key={id}
                        onClick={() => onSelectType(id)}
                        className={`p-4 rounded-lg border-2 font-medium text-center transition-all duration-200 ${
                            selection[id]
                                ? 'bg-dusty-rose text-white border-dusty-rose shadow-md scale-105'
                                : 'bg-warm-cream/50 border-gray-200 hover:border-dusty-rose/50 hover:bg-soft-blush/50'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
};


const DressYourselfPage: React.FC<DressYourselfPageProps> = ({ navigate }) => {
  const { 
    isAuthenticated, 
    user, 
    addHistoryItem, 
    imagesToRegenerate, 
    clearRegenerate, 
    uploadedOutfitImages,
    addUploadedOutfitImage,
    deleteUploadedOutfitImage,
    favoriteOutfitImages,
    toggleFavoriteOutfit
  } = useAuth();
  const [personImage, setPersonImage] = useState<File | null>(null);
  const [outfitImage, setOutfitImage] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [outfitPreview, setOutfitPreview] = useState<string | null>(null);
  const [personImageBase64, setPersonImageBase64] = useState<string | null>(null);
  const [outfitImageBase64, setOutfitImageBase64] = useState<string | null>(null);
  const [garmentSelection, setGarmentSelection] = useState({
    top: false,
    bottom: false,
    fullBody: false,
  });
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const initFromRegenerate = async () => {
      if (imagesToRegenerate) {
        setPersonPreview(imagesToRegenerate.personImg);
        setOutfitPreview(imagesToRegenerate.outfitImg);
        setPersonImageBase64(imagesToRegenerate.personImg);
        setOutfitImageBase64(imagesToRegenerate.outfitImg);

        const personFile = await dataUrlToFile(imagesToRegenerate.personImg, 'person.png');
        const outfitFile = await dataUrlToFile(imagesToRegenerate.outfitImg, 'outfit.png');
        setPersonImage(personFile);
        setOutfitImage(outfitFile);
        
        clearRegenerate();
        window.scrollTo(0, 0);
      }
    };
    initFromRegenerate();
  }, [imagesToRegenerate, clearRegenerate]);

  const handlePersonImageSelect = async (file: File) => {
    setPersonImage(file);
    setPersonPreview(URL.createObjectURL(file));
    const base64 = await fileToBase64(file);
    setPersonImageBase64(base64);
  };

  const handleOutfitImageSelect = async (file: File) => {
    setOutfitImage(file);
    setOutfitPreview(URL.createObjectURL(file));
    const base64 = await fileToBase64(file);
    setOutfitImageBase64(base64);
    addUploadedOutfitImage(base64);
    setGarmentSelection({ top: false, bottom: false, fullBody: false });
  };

  const handleSelectPreviousOutfit = async (imageBase64: string) => {
    setOutfitPreview(imageBase64);
    setOutfitImageBase64(imageBase64);
    const outfitFile = await dataUrlToFile(imageBase64, 'previous-outfit.png');
    setOutfitImage(outfitFile);
    setGarmentSelection({ top: false, bottom: false, fullBody: false });
  };
  
  const handleGarmentSelect = (type: 'top' | 'bottom' | 'fullBody') => {
    setGarmentSelection(prev => {
        if (type === 'fullBody') {
            const isBecomingActive = !prev.fullBody;
            return {
                top: false,
                bottom: false,
                fullBody: isBecomingActive,
            };
        }
        // for top or bottom
        return {
            ...prev,
            [type]: !prev[type],
            fullBody: false,
        };
    });
  };
  
  const handleGenerate = useCallback(async () => {
    if (!personImage || !outfitImage) {
      setError('Please upload both a person and an outfit image.');
      return;
    }
    
    const isGarmentSelected = garmentSelection.top || garmentSelection.bottom || garmentSelection.fullBody;
    if (!isGarmentSelected) {
        setError('Please select the garment type.');
        return;
    }

    if (!isAuthenticated || user?.subscription === 'Free') {
        setError('Please subscribe to generate unlimited try-ons.');
        setTimeout(()=>navigate('pricing'), 2000);
        return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);
    setIsSaved(false);

    try {
      if (!process.env.API_KEY) {
        throw new Error("API key not found.");
      }
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const personPart = await fileToGenerativePart(personImage);
      const outfitPart = await fileToGenerativePart(outfitImage);

      const getSelectionString = () => {
        if (garmentSelection.fullBody) {
            return 'FULL BODY';
        }
        if (garmentSelection.top && garmentSelection.bottom) {
            return 'FULL-OUTFIT (top + bottom)';
        }
        if (garmentSelection.top) {
            return 'TOP';
        }
        if (garmentSelection.bottom) {
            return 'BOTTOM';
        }
        return ''; // Should not be reached
      };

      const selection = getSelectionString();

      const basePrompt = `
You are an expert AI photo editor for virtual try-on. 
You receive two images:

• IMAGE 1 = the person  
• IMAGE 2 = the uploaded garment

Your job is to make the person wear the garment from Image 2 with the highest possible accuracy and consistency.

You MUST output only:  
1. A single photorealistic edited image  
2. (If possible) a binary replacement mask  
3. (If possible) a tiny JSON summary

No other text is allowed.

====================================================
ABSOLUTE RULE: CHECKBOX SELECTION (OVERRIDES EVERYTHING)
====================================================

User selection: ${selection}

This selection *must* override all garment detection, hem detection, segmentation, or inferred interpretations.

Apply segmentation masks EXACTLY based on these rules:

• If “TOP” is selected:  
  - Target mask = shoulders → waist.  
  - Remove **all** original top pixels in this region.  
  - Ignore any bottom clothing in Image 2.

• If “BOTTOM” is selected:  
  - Target mask = waist → ankles.  
  - Remove **all** pants/shorts/skirts currently worn.  
  - Ignore any top clothing in Image 2.

• If “FULL-OUTFIT (top + bottom)” is selected:  
  - Target mask = shoulders → ankles.  
  - Remove **all** clothing in both top & bottom zones.

• If “FULL BODY” is selected:  
  - Target mask = all clothing on torso and legs.  
  - Remove everything except exposed skin, face and hands.

====================================================
CHECKBOX → MASK OVERRIDE DIRECTIVE (MANDATORY)
====================================================

Your segmentation MUST follow the checkbox even if Image 2 appears incomplete or confusing.

• Override Image-1 clothing segmentation using the checkbox.  
• Override Image-2 garment detection using the checkbox.  
• If checkbox picks a larger zone than Image-2 shows, extend the garment realistically only inside that zone and ONLY using visible design cues from Image 2.  
• Never reduce, reinterpret, or ignore the checkbox region.

====================================================
DRESS / ONE-PIECE DETECTION (FIX FOR JEANS UNDER DRESS)
====================================================

If Image 2 contains ANY continuous torso→skirt shape (dress, corset-dress, lace dress, mini-dress, jumpsuit, etc.):

You MUST:

1. Treat it as a full-body garment (top + bottom)
2. Generate a bottom-removal mask extending fully from waist → hemline
3. Remove ALL pants/jeans/shorts beneath the hemline
4. Inpaint realistic legs beneath exposed skirt areas
5. Apply the actual hemline length EXACTLY as shown in Image 2  
   (NEVER extend it longer and NEVER crop it shorter)

This rule ALWAYS applies even if the checkbox selects only “Top”.  
A dress can NEVER be applied as a top-only item.

====================================================
HEMLINE ENFORCEMENT (CRITICAL)
====================================================

• The final skirt/dress length MUST match Image 2 exactly.  
• Never extend a mini dress downward.  
• Never guess unknown skirt length.  
• Remove all underlying clothing pixels under the final hemline + a small safety margin so no jeans/shorts remain visible.

====================================================
TRUE REMOVAL & INPAINTING PIPELINE
====================================================

You MUST follow this sequence:

1. Produce segmentation for body + original clothing  
2. Produce segmentation for garment in Image 2  
3. Create a replacement mask based SOLELY on checkbox rules  
4. Remove all original-clothing pixels in that mask  
5. Inpaint skin/body realistically (color, lighting, muscle shadows)  
6. Fit the garment from Image 2 onto the cleaned area  
7. Apply proper occlusion (arms, hair, etc.)

Do NOT overlay garments over existing clothing.  
Do NOT leave clothing fragments.  
Do NOT output partial removal.

====================================================
FAILURE POLICY
====================================================

If you cannot confidently:
• remove jeans completely  
• reconstruct legs properly  
• apply the correct hemline  
• maintain dress proportions  
→ return an error JSON instead of producing a corrupted image.

====================================================
OUTPUT
====================================================
• 1 photorealistic edited image  
• (Optional) a binary replacement mask  
• (Optional) JSON summary: 
  { "checkboxUsed": "${selection}", "removalSucceeded": true/false }

Follow every instruction exactly and prioritize hemline accuracy, segmentation override, and true clothing removal.
`;

      const checkboxOverrideRule = `
CHECKBOX OVERRIDE RULE:
The user selected: ${selection}.

You MUST follow the checkbox selection exactly.
The checkbox selection overrides ALL other garment-classification rules.

• If "TOP" is selected: Replace ONLY the person’s top.
• If "BOTTOM" is selected: Replace ONLY the person’s bottom.
• If "FULL-OUTFIT (top + bottom)" is selected: Replace BOTH the top and bottom.
• If "FULL BODY" is selected: Replace the entire outfit.
You must not deviate from the selected option.
`;

      const prompt = basePrompt + checkboxOverrideRule;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            personPart,
            outfitPart,
            { text: prompt },
          ],
        },
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) {
          const base64ImageBytes = part.inlineData.data;
          const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
          setGeneratedImage(imageUrl);
          foundImage = true;
          break;
        }
      }
      if (!foundImage) {
        throw new Error('No image was generated. Please try again.');
      }

    } catch (e: any) {
      setError(e.message || 'An error occurred while generating the image.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [personImage, outfitImage, isAuthenticated, user, navigate, garmentSelection]);

  const handleSaveToHistory = useCallback(() => {
    if (generatedImage && personImageBase64 && outfitImageBase64 && !isSaved) {
        addHistoryItem({
            personImg: personImageBase64,
            outfitImg: outfitImageBase64,
            resultImg: generatedImage,
        });
        setIsSaved(true);
    }
  }, [generatedImage, personImageBase64, outfitImageBase64, isSaved, addHistoryItem]);

  const handleDownload = useCallback(() => {
    if (generatedImage) {
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `inspired-outfitting-try-on-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  }, [generatedImage]);


  return (
    <div className="container mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-heading font-bold">Dress Yourself</h1>
        <p className="text-lg text-charcoal-grey/70 mt-2">Bring your fashion ideas to life.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
        {/* Input Section */}
        <div className="space-y-8 bg-white p-8 rounded-lg shadow-lg">
          <ImageUploader 
            title="1. Upload Your Photo"
            description="Choose a clear, full-body photo of yourself."
            preview={personPreview}
            onFileSelect={handlePersonImageSelect}
          />
          <div>
            <ImageUploader 
              title="2. Upload an Outfit Image"
              description="Select an image of the clothing you want to try on."
              preview={outfitPreview}
              onFileSelect={handleOutfitImageSelect}
            />
            <PreviousOutfits 
              images={uploadedOutfitImages} 
              favorites={favoriteOutfitImages}
              onSelect={handleSelectPreviousOutfit}
              onDelete={deleteUploadedOutfitImage}
              onToggleFavorite={toggleFavoriteOutfit}
            />
          </div>
           {outfitImage && (
              <GarmentTypeSelector selection={garmentSelection} onSelectType={handleGarmentSelect} />
            )}
          <Button onClick={handleGenerate} disabled={isLoading || !personImage || !outfitImage || !(garmentSelection.top || garmentSelection.bottom || garmentSelection.fullBody)} className="w-full flex items-center justify-center gap-2">
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Generating...
              </>
            ) : (
                <>
                <SparklesIcon />
                Generate My Look
                </>
            )}
          </Button>
          {error && <p className="text-red-500 text-center mt-4">{error}</p>}
        </div>

        {/* Output Section */}
        <div className="bg-white p-8 rounded-lg shadow-lg h-full flex flex-col items-center justify-center min-h-[500px]">
          <h2 className="text-3xl font-heading font-semibold mb-4 text-center">Your AI Preview</h2>
          <div className="w-full aspect-w-3 aspect-h-4 bg-soft-blush/30 rounded-lg flex items-center justify-center">
            {isLoading ? (
                <div className="text-center text-dusty-rose">
                    <p>Creating your new look...</p>
                    <p className="text-sm mt-2">This may take a moment.</p>
                </div>
            ) : generatedImage ? (
                <img src={generatedImage} alt="AI Generated Try-On" className="w-full h-full object-contain rounded-lg" />
            ) : (
                <p className="text-charcoal-grey/60 text-center p-4">Your generated image will appear here.</p>
            )}
          </div>
           {generatedImage && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                <Button onClick={handleSaveToHistory} disabled={isSaved} variant="secondary" className="text-sm md:text-base py-2 px-2">
                    {isSaved ? 'Saved ✓' : 'Save'}
                </Button>
                 <Button onClick={handleDownload} variant="secondary" className="text-sm md:text-base py-2 px-2 flex items-center justify-center gap-2">
                    <DownloadIcon className="w-4 h-4" />
                    Download
                </Button>
                <Button onClick={handleGenerate} disabled={isLoading} className="text-sm md:text-base py-2 px-2">
                    Retry
                </Button>
            </div>
          )}
        </div>
      </div>
      
       {!isAuthenticated && (
        <div className="mt-12 bg-soft-blush p-8 rounded-lg text-center">
          <h3 className="text-2xl font-heading mb-2">Unlock Unlimited Try-Ons</h3>
          <p className="mb-4">Sign up or log in to start generating your styles.</p>
          <Button onClick={() => navigate('auth')} variant="secondary">
            Login / Sign Up
          </Button>
        </div>
      )}
    </div>
  );
};

export default DressYourselfPage;