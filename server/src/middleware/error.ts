import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { isProduction } from "../config/env.js";

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
    console.error(error);
    return res.status(500).json({
      message: isProduction ? "Unexpected server error." : error.message,
    });
  }

  console.error(error);
  res.status(500).json({ message: "Unexpected server error." });
};

