import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyError(rawMsg: string): string {
  const m = rawMsg.toLowerCase();
  if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
    return 'A user with this email already exists.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Email rate limit reached. Use the manual invite link below.';
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'Invalid email address.';
  }
  return rawMsg;
}

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, role = 'designer' } = await request.json();

    // Normalize email
    const email = (rawEmail || '').toString().trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    if (!['designer', 'reviewer', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Use the public app URL so email links work. Falls back to request origin.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    });
    const existing = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email
    );

    if (existing) {
      // User exists — just ensure profile has correct role, return friendly message
      await supabaseAdmin
        .from('profiles')
        .update({ role })
        .eq('id', existing.id);
      return NextResponse.json({
        success: true,
        userId: existing.id,
        message: 'User already exists. Role updated.',
        existed: true,
      });
    }

    // Try the full email invite first (Supabase sends the email)
    let inviteLink: string | null = null;
    let emailSent = false;

    try {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { role },
        redirectTo: `${appUrl}/`,
      });

      if (error) {
        // Email rate-limited or other — fall through to generate manual link
        const friendlyMsg = friendlyError(error.message);

        // If user actually exists (race condition), treat as already-exists
        if (friendlyMsg.includes('already exists')) {
          return NextResponse.json({
            success: true,
            message: 'User already exists.',
            existed: true,
          });
        }

        // Otherwise try to generate a manual invite link as fallback
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { redirectTo: `${appUrl}/`, data: { role } },
        });

        if (linkErr) {
          return NextResponse.json({ error: friendlyError(linkErr.message) }, { status: 400 });
        }

        inviteLink = linkData?.properties?.action_link || null;

        // Update role on the newly-created profile (trigger creates with role=designer by default)
        const userId = linkData?.user?.id;
        if (userId && role !== 'designer') {
          await supabaseAdmin.from('profiles').update({ role }).eq('id', userId);
        }

        return NextResponse.json({
          success: true,
          userId,
          inviteLink,
          emailSent: false,
          warning: friendlyMsg,
        });
      }

      emailSent = true;
      const userId = data?.user?.id;

      // Update role on the newly-created profile
      if (userId && role !== 'designer') {
        await supabaseAdmin.from('profiles').update({ role }).eq('id', userId);
      }

      return NextResponse.json({ success: true, userId, emailSent });
    } catch (err) {
      console.error('Invite error:', err);
      return NextResponse.json(
        { error: 'Failed to send invite. Please try again.' },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error('Invite route error:', err);
    return NextResponse.json({ error: 'Failed to process invite' }, { status: 500 });
  }
}
