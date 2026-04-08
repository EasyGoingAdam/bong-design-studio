import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// POST /api/upload-image  — upload base64 image to Supabase Storage
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { base64, folder, filename } = body;

    if (!base64 || !folder || !filename) {
      return NextResponse.json(
        { error: 'base64, folder, and filename are required' },
        { status: 400 }
      );
    }

    const url = await uploadImage(base64, folder, filename);

    return NextResponse.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
