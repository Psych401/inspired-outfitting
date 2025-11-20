import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

export async function POST(request: NextRequest) {
  try {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    
    if (!apiToken) {
      return NextResponse.json(
        { error: 'Replicate API token not configured' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const imageFile = formData.get('image') as File;

    if (!imageFile) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Convert file to base64 data URL
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = imageFile.type;
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Initialize Replicate
    const replicate = new Replicate({
      auth: apiToken,
    });

    // Run the background removal model
    // Using 851-labs/background-remover for better quality and cost efficiency
    const output = await replicate.run(
      "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc",
      {
        input: {
          image: dataUrl,
        },
      }
    ) as string;

    // Fetch the processed image
    const imageResponse = await fetch(output);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch processed image: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // Return the processed image
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
      },
    });
  } catch (error: any) {
    console.error('Background removal error:', error);
    return NextResponse.json(
      { error: error.message || 'Background removal failed' },
      { status: 500 }
    );
  }
}

