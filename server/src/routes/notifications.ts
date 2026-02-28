import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const notificationRouter = Router();

notificationRouter.use(requireAuth);
const readParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

notificationRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { limit } = listQuerySchema.parse(req.query);
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user!.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    res.json(notifications);
  }),
);

notificationRouter.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const unread = await prisma.notification.count({
      where: {
        userId: req.user!.id,
        readAt: null,
      },
    });

    res.json({ unread });
  }),
);

notificationRouter.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: {
        userId: req.user!.id,
        readAt: null,
      },
      data: {
        readAt: now,
      },
    });

    res.json({
      message: "Notifications marked as read.",
      updated: result.count,
    });
  }),
);

notificationRouter.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notificationId = readParam(req.params.id);
    if (!notificationId) {
      return res.status(400).json({ message: "Invalid notification id." });
    }

    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId: req.user!.id,
      },
      data: {
        readAt: now,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: "Notification not found." });
    }

    res.json({
      id: notificationId,
      readAt: now.toISOString(),
    });
  }),
);
