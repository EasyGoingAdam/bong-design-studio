import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { email, role = 'designer' } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Invite user via Supabase Auth (sends invite email)
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { role },
      redirectTo: `${request.nextUrl.origin}/`,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // The trigger will auto-create the profile, but update the role if needed
    if (data?.user?.id && role !== 'designer') {
      await supabaseAdmin
        .from('profiles')
        .update({ role })
        .eq('id', data.user.id);
    }

    return NextResponse.json({ success: true, userId: data?.user?.id });
  } catch {
    return NextResponse.json({ error: 'Failed to invite user' }, { status: 500 });
  }
}
