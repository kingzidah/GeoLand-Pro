import { Request, Response } from 'express';
import { photoService } from '../services/photo.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type { UploadPhotoInput } from '../validations/photo.schema';

export const photoController = {
  upload: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const file = req.file as Express.Multer.File;
    const photo = await photoService.upload(
      userId,
      role,
      { buffer: file.buffer, mimetype: file.mimetype },
      req.body as UploadPhotoInput
    );
    res.status(201).json({ success: true, data: photo });
  }),

  listByPlot: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const photos = await photoService.listByPlot(req.params.plotId, userId, role);
    res.status(200).json({ success: true, data: photos });
  }),
};
