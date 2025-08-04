import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import CustomError from '../errors/custom.error';

export const errorMiddleware: ErrorRequestHandler = (
  error: Error,
  _: Request,
  res: Response,
  _next: NextFunction
) => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  res
    .status(200)
    .send(
      isDevelopment
        ? { messge: error.message }
        : { message: 'Internal server error' }
    );
};
