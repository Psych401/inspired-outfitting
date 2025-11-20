<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Inspired Outfitting - AI Fashion Try-On

**Inspired Outfitting** is an AI-powered fashion try-on platform where users can visualize how different outfits look on them before buying — bringing confidence and fun to online shopping.

## 🎯 What is Inspired Outfitting?

Inspired Outfitting revolutionizes online fashion shopping by allowing users to see themselves wearing any outfit before making a purchase. Using advanced AI technology powered by Google Gemini, the platform generates photorealistic images that show how clothing items would look on the user's body, eliminating the guesswork and uncertainty of online shopping.

## ✨ Key Features & Capabilities

### 🖼️ AI-Powered Virtual Try-On
- **Photorealistic Image Generation**: Upload a photo of yourself and any outfit image to see how it looks on you
- **Intelligent Garment Mapping**: AI accurately maps clothing onto your body, adjusting for shape, lighting, and texture
- **Multiple Garment Types**: Support for tops, bottoms, full-body outfits, and dresses with precise segmentation
- **Advanced Preprocessing Pipeline**: Background removal and garment segmentation for improved AI consistency

### 🎨 Image Preprocessing
- **Background Removal**: Automatically removes backgrounds from both person and garment images for cleaner results
- **Garment Segmentation**: Intelligently segments garments based on user selection (top, bottom, full body, complete outfit)
- **Improved Consistency**: Preprocessing ensures only relevant garment segments are sent to AI, improving generation quality

### 👔 Smart Outfit Selection
- **Garment Type Control**: Choose exactly what part of the outfit to try on (top, bottom, full body, or complete outfit)
- **Previous Outfits Gallery**: Access and reuse previously uploaded outfit images
- **Favorite System**: Save and quickly access your favorite outfit images
- **Image Management**: Organize and manage your uploaded person and outfit photos

### 📸 User Experience
- **Drag & Drop Upload**: Easy image upload with drag-and-drop functionality
- **Try-On History**: View and manage all your previous try-on results
- **Download & Share**: Download your generated try-on images in high quality
- **Regeneration**: Re-generate try-ons with different settings or improvements
- **Real-time Processing Feedback**: See preprocessing and generation progress

### 💳 Subscription & Credits
- **Flexible Pricing Plans**: Choose from Starter, Pro, or Elite subscription tiers
- **Credit-Based System**: Pay per try-on generation with monthly credit allocations
- **Add-On Credits**: Purchase additional credits when you need more
- **Free Trial**: New users get 3 free credits to try the service

### 👤 User Management
- **User Profiles**: Manage your account, subscription, and preferences
- **Authentication**: Secure login and signup system
- **Subscription Management**: View and change your subscription plan
- **Personal Gallery**: Keep track of all your uploaded images and generated results

## 🚀 How It Works

1. **Upload Your Photo**: Provide a clear, full-body photo of yourself
2. **Select an Outfit**: Upload an image of the clothing item you want to try on, or choose from your previous outfits
3. **Choose Garment Type**: Select whether you want to try on a top, bottom, full body, or complete outfit
4. **Preprocessing**: The system automatically:
   - Removes backgrounds from both images
   - Segments the garment based on your selection
   - Prepares clean, isolated images for AI processing
5. **AI Generation**: Our AI processes the preprocessed images and generates a photorealistic preview
6. **Review & Save**: View your result, download it, save it to your history, or regenerate with adjustments

## 🛠️ Tech Stack

- **Next.js 16** - React framework with App Router for server-side rendering and routing
- **TypeScript** - Type-safe development for better code quality
- **Tailwind CSS** - Utility-first CSS framework for rapid UI development
- **React 19** - Modern React with latest features and optimizations
- **Google Gemini AI** - Advanced AI image generation and processing
- **React Context API** - State management for user authentication and data
- **Image Processing Libraries** - Canvas-based image manipulation and preprocessing

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** (recommended: Node.js 20+)
- **npm**, **yarn**, or **pnpm** package manager
- **Google Gemini API Key** - Get yours from [Google AI Studio](https://makersuite.google.com/app/apikey)
- **Replicate API Token** (for background removal) - Get yours from [Replicate](https://replicate.com/account/api-tokens)

### Installation

1. **Clone the repository** (or navigate to the project directory):
   ```bash
   git clone <repository-url>
   cd inspired-outfitting
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   
   Create a `.env.local` file in the root directory:
   ```env
   # Required
   NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
   
   # Required for background removal (falls back to client-side if not provided)
   REPLICATE_API_TOKEN=your_replicate_api_token_here
   ```
   
   Replace the placeholder values with your actual API keys.

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser**:
   
   Navigate to [http://localhost:3000](http://localhost:3000) to see the application.

## 📦 Build for Production

To create an optimized production build:

```bash
npm run build
npm start
```

The production build will be available at `http://localhost:3000` (or your configured port).

## 📁 Project Structure

```
inspired-outfitting/
├── app/                    # Next.js App Router
│   ├── auth/              # Authentication page
│   ├── contact/           # Contact & FAQ page
│   ├── dress-yourself/    # Main try-on feature page
│   ├── pricing/           # Subscription & pricing page
│   ├── profile/           # User profile & history
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles & Tailwind
├── components/            # Reusable React components
│   ├── Button.tsx
│   ├── Footer.tsx
│   ├── Header.tsx
│   ├── IconComponents.tsx
│   ├── PreviousOutfits.tsx
│   ├── TestimonialCard.tsx
│   └── UploadedImagesGallery.tsx
├── lib/                   # Utility libraries
│   ├── imageProcessing.ts      # Image format conversion utilities
│   ├── backgroundRemoval.ts    # Background removal service
│   ├── garmentSegmentation.ts  # Garment segmentation logic
│   └── preprocessingPipeline.ts # Main preprocessing orchestrator
├── context/               # React Context providers
│   └── AuthContext.tsx    # Authentication & user state
├── hooks/                 # Custom React hooks
│   └── useAuth.ts         # Authentication hook
├── types.ts               # TypeScript type definitions
├── next.config.js         # Next.js configuration
├── tailwind.config.js     # Tailwind CSS configuration
└── tsconfig.json          # TypeScript configuration
```

## 🎨 Features in Detail

### AI Image Generation
- Uses Google Gemini's advanced image generation models
- Supports precise garment segmentation (top, bottom, full body)
- Handles complex scenarios like dresses over pants
- Maintains realistic lighting and texture matching

### Image Preprocessing Pipeline
- **Background Removal**: 
  - Primary: Replicate API using 851-labs/background-remover model (if API token provided)
  - Fallback: Client-side basic removal (always available)
- **Garment Segmentation**:
  - Smart detection using aspect ratio and edge density analysis
  - Avoids unnecessary cropping of single-garment images
  - Region-based segmentation when needed
  - Ensures only relevant garment segments are processed

### User Interface
- Modern, responsive design with Tailwind CSS
- Mobile-friendly interface
- Smooth animations and transitions
- Intuitive drag-and-drop file uploads
- Real-time processing feedback

### Data Management
- Client-side state management with React Context
- Persistent user sessions
- Image history and favorites
- Uploaded images gallery with pagination

## 🔒 Privacy & Security

- All image processing happens through secure API calls
- User data is stored locally in the browser session
- No images are permanently stored on external servers (in current implementation)
- Environment variables keep API keys secure
- Preprocessing can be done client-side for maximum privacy

## 📝 License

This project is private and proprietary.

## 🤝 Contributing

This is a private project. For questions or support, please contact the development team.

---

**Built with ❤️ using Next.js, TypeScript, and Google Gemini AI**
