<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Inspired Outfitting - AI Fashion Try-On

A Next.js application for AI-powered virtual fashion try-on experiences.

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **React 19** - UI library
- **Google Gemini AI** - AI image generation

## Getting Started

**Prerequisites:** Node.js 18+ and npm/yarn/pnpm

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build for Production

```bash
npm run build
npm start
```

## Project Structure

- `app/` - Next.js App Router pages and layouts
- `components/` - Reusable React components
- `context/` - React context providers
- `hooks/` - Custom React hooks
- `types.ts` - TypeScript type definitions
