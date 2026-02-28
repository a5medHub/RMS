import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export const notFound = (_req: Request, res: Response) => {
  res.status(404).json({ message: "Resource not found." });
};

export const errorHandler = (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  void next;
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed.",
      issues: error.issues,
    });
  }

  if (error instanceof Error) {
    return res.status(500).json({ message: error.message });
  }

  res.status(500).json({ message: "Unexpected server error." });
};

