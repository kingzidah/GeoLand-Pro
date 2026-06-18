/**
 * OTP SERVICE
 * ─────────────────────────────────────────────
 * WhatsApp OTP for:
 *   1. Admin 2FA login
 *   2. Tenant lease digital signing
 *   3. Password reset verification
 *
 * OTPs are:
 *   - 6 digits
 *   - Valid for 10 minutes
 *   - Stored hashed in Redis (never plaintext)
 *   - Invalidated after first use
 *   - Max 5 attempts before lockout
 * ─────────────────────────────────────────────
 */

import crypto  from 'crypto';
import twilio  from 'twilio';
import { redis } from '../config/redis';
import { brand } from '../config/brand.config';
import { logger } from '../config/logger';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const WHATSAPP_FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
const OTP_TTL_SEC   = 10 * 60;      // 10 minutes
const MAX_ATTEMPTS  = 5;
const LOCKOUT_SEC   = 30 * 60;      // 30 minutes lockout after 5 fails

// ─────────────────────────────────────────────
// REDIS KEY HELPERS
// ─────────────────────────────────────────────
const otpKey      = (purpose: string, id: string) => `otp:${purpose}:${id}`;
const attemptsKey = (purpose: string, id: string) => `otp_attempts:${purpose}:${id}`;
const lockoutKey  = (purpose: string, id: string) => `otp_lockout:${purpose}:${id}`;

// ─────────────────────────────────────────────
// GENERATE OTP
// ─────────────────────────────────────────────
function generateOtp(): string {
  // Cryptographically secure 6-digit OTP
  const bytes = crypto.randomBytes(4);
  const num   = bytes.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, '0');
}

function hashOtp(otp: string, id: string): string {
  const salt = process.env.OTP_SALT;
  if (!salt) {
    throw new Error(
      'OTP_SALT must be set in environment. ' +
      'Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return crypto.createHmac('sha256', salt).update(`${id}:${otp}`).digest('hex');
}

// ─────────────────────────────────────────────
// SEND OTP
// ─────────────────────────────────────────────
export async function sendOtp(
  purpose: 'admin_login' | 'lease_sign' | 'password_reset',
  userId:  string,
  phone:   string,        // international format: +233xxxxxxxxx
  name?:   string
): Promise<{ success: boolean; message: string }> {
  try {
    // Check lockout
    const locked = await redis.get(lockoutKey(purpose, userId));
    if (locked) {
      return {
        success: false,
        message: 'Too many failed attempts. Please wait 30 minutes.',
      };
    }

    // Generate and store OTP (hashed)
    const otp     = generateOtp();
    const hashed  = hashOtp(otp, userId);

    await redis.setex(otpKey(purpose, userId), OTP_TTL_SEC, hashed);
    await redis.del(attemptsKey(purpose, userId)); // Reset attempt counter

    // Build WhatsApp message
    const greeting = name ? `Hello ${name},` : 'Hello,';
    const purposes: Record<typeof purpose, string> = {
      admin_login:     `Your ${brand.name} admin login code is:`,
      lease_sign:      `Your ${brand.name} lease signing code is:`,
      password_reset:  `Your ${brand.name} password reset code is:`,
    };

    const body = [
      `${brand.whatsappPrefix}`,
      `${greeting}`,
      ``,
      `${purposes[purpose]}`,
      ``,
      `*${otp}*`,
      ``,
      `This code expires in 10 minutes.`,
      `Do not share it with anyone.`,
      `${brand.companyName}`,
    ].join('\n');

    // Send via WhatsApp
    await client.messages.create({
      from: WHATSAPP_FROM,
      to:   `whatsapp:${phone}`,
      body,
    });

    logger.info({ msg: 'otp_sent', purpose, userId });
    return { success: true, message: 'Verification code sent via WhatsApp' };

  } catch (err) {
    logger.error({ msg: 'otp_send_failed', purpose, userId, err });
    return { success: false, message: 'Failed to send verification code' };
  }
}

// ─────────────────────────────────────────────
// VERIFY OTP
// ─────────────────────────────────────────────
export async function verifyOtp(
  purpose: 'admin_login' | 'lease_sign' | 'password_reset',
  userId:  string,
  otp:     string
): Promise<{ valid: boolean; message: string }> {
  try {
    // Check lockout
    const locked = await redis.get(lockoutKey(purpose, userId));
    if (locked) {
      return { valid: false, message: 'Account temporarily locked. Try again in 30 minutes.' };
    }

    // Get stored hash
    const stored = await redis.get(otpKey(purpose, userId));
    if (!stored) {
      return { valid: false, message: 'Verification code expired or not found.' };
    }

    // Constant-time comparison to prevent timing attacks
    const expected = hashOtp(otp.trim(), userId);
    const match    = crypto.timingSafeEqual(
      Buffer.from(stored),
      Buffer.from(expected)
    );

    if (!match) {
      // Increment attempts
      const attempts = await redis.incr(attemptsKey(purpose, userId));
      await redis.expire(attemptsKey(purpose, userId), OTP_TTL_SEC);

      if (attempts >= MAX_ATTEMPTS) {
        await redis.setex(lockoutKey(purpose, userId), LOCKOUT_SEC, '1');
        await redis.del(otpKey(purpose, userId));
        logger.warn({ msg: 'otp_lockout', purpose, userId });
        return { valid: false, message: 'Too many failed attempts. Account locked for 30 minutes.' };
      }

      return { valid: false, message: `Invalid code. ${MAX_ATTEMPTS - attempts} attempts remaining.` };
    }

    // Valid — delete OTP immediately (single use)
    await redis.del(otpKey(purpose, userId));
    await redis.del(attemptsKey(purpose, userId));

    logger.info({ msg: 'otp_verified', purpose, userId });
    return { valid: true, message: 'Verified' };

  } catch (err) {
    logger.error({ msg: 'otp_verify_error', purpose, userId, err });
    return { valid: false, message: 'Verification error. Please try again.' };
  }
}
