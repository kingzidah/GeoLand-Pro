import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodTypeAny, ZodError } from 'zod';

// ZodTypeAny (not AnyZodObject) so that schemas wrapped in .refine() / .superRefine()
// (which produce ZodEffects, not ZodObject) are accepted.
interface ValidationTargets {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Middleware factory that validates req.body / req.query / req.params
 * against Zod schemas. Mutates the request objects with the parsed
 * (and transformed) values so downstream handlers receive clean data.
 *
 * @example
 *   router.post('/login', validate({ body: loginSchema }), authController.login)
 */
export const validate =
  (schemas: ValidationTargets): RequestHandler =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as typeof req.query;
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as typeof req.params;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Forward as a structured error; errorHandler will format it
        next(error);
      } else {
        next(error);
      }
    }
  };
