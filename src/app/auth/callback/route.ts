import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Only paths on this site, so the link can't send anyone elsewhere. */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/**
 * Where a password reset email lands. It signs the person in for the reset,
 * then sends them on to choose a new password. Handles both link styles
 * Supabase can send: `?code=` (the default; it has to be opened in the browser
 * that asked for it) and `?token_hash=&type=` (works from any device, if the
 * email template is set up that way).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let failed = true;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failed = Boolean(error);
  }

  if (failed) {
    const message =
      "That reset link has expired or was opened in a different browser from the one that asked for it. Request a new one below.";
    return NextResponse.redirect(`${origin}/login/forgot?error=${encodeURIComponent(message)}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
