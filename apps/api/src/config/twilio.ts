import { Twilio } from 'twilio';
import { env } from './env';

export const twilioClient = new Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
