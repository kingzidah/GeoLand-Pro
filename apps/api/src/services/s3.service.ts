import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { s3Client } from '../config/s3';
import { env } from '../config/env';

const PRESIGNED_UPLOAD_EXPIRES = 300;  // 5 minutes — window to complete upload
const PRESIGNED_DOWNLOAD_EXPIRES = 900; // 15 minutes — window to download

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// ─── Service ─────────────────────────────────────────────────────────────────

export const s3Service = {
  extensionForMime(mimeType: string): string {
    return MIME_TO_EXT[mimeType] ?? 'bin';
  },

  buildKey(folder: string, mimeType: string): string {
    const ext = MIME_TO_EXT[mimeType] ?? 'bin';
    return `${folder}/${uuidv4()}.${ext}`;
  },

  buildPublicUrl(key: string): string {
    return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
  },

  async getPresignedUploadUrl(key: string, mimeType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_UPLOAD_EXPIRES });
  },

  async getPresignedDownloadUrl(key: string, expiresIn: number = PRESIGNED_DOWNLOAD_EXPIRES): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
    });
    return getSignedUrl(s3Client, command, { expiresIn });
  },

  async uploadBuffer(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });
    await s3Client.send(command);
    return this.buildPublicUrl(key);
  },

  async downloadBuffer(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
    });
    const response = await s3Client.send(command);
    const chunks: Buffer[] = [];
    const stream = response.Body as NodeJS.ReadableStream;
    for await (const chunk of stream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
    }
    return Buffer.concat(chunks);
  },

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
    });
    await s3Client.send(command);
  },

  getUploadExpiresIn(): number {
    return PRESIGNED_UPLOAD_EXPIRES;
  },
};
