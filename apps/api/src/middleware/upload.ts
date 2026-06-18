import multer, { FileFilterCallback, MulterError } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { ALLOWED_PHOTO_MIME_TYPES, MAX_PHOTO_SIZE_BYTES } from '../validations/photo.schema';

const photoFileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    cb(ApiError.badRequest(`Unsupported file type — accepted: ${ALLOWED_PHOTO_MIME_TYPES.join(', ')}`));
    return;
  }
  cb(null, true);
};

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_SIZE_BYTES },
  fileFilter: photoFileFilter,
}).single('photo');

/** In-memory single-file upload for geotagged photos — buffer is streamed straight to S3 */
export const uploadPhoto = (req: Request, res: Response, next: NextFunction): void => {
  photoUpload(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(ApiError.badRequest(`File too large — maximum size is ${MAX_PHOTO_SIZE_BYTES / (1024 * 1024)}MB`));
        return;
      }
      next(ApiError.badRequest(err.message));
      return;
    }
    if (err) {
      next(err);
      return;
    }
    if (!req.file) {
      next(ApiError.badRequest('No photo file provided — use the "photo" field'));
      return;
    }
    next();
  });
};
