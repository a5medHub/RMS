import { Router } from "express";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import { pantrySchema } from "./schemas.js";

export const pantryRouter = Router();

pantryRouter.use(requireAuth);

const readParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

pantryRouter.get("/", asyncHandler(async (req, res) => {
  const pantry = await prisma.pantryItem.findMany({
    where: {
      userId: req.user!.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  res.json(pantry);
}));

pantryRouter.post("/", asyncHandler(async (req, res) => {
  const data = pantrySchema.parse(req.body);

  const pantryItem = await prisma.pantryItem.create({
    data: {
      userId: req.user!.id,
      name: data.name,
      quantity: data.quantity ?? null,
      unit: data.unit ?? null,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
    },
  });

  res.status(201).json(pantryItem);
}));

pantryRouter.put("/:id", asyncHandler(async (req, res) => {
  const pantryId = readParam(req.params.id);
  if (!pantryId) {
    return res.status(400).json({ message: "Invalid pantry item id." });
  }

  const data = pantrySchema.parse(req.body);

  const existing = await prisma.pantryItem.findFirst({
    where: {
      id: pantryId,
      userId: req.user!.id,
    },
  });

  if (!existing) {
    return res.status(404).json({ message: "Pantry item not found." });
  }

  const pantryItem = await prisma.pantryItem.update({
    where: {
      id: pantryId,
    },
    data: {
      name: data.name,
      quantity: data.quantity ?? null,
      unit: data.unit ?? null,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
    },
  });

  res.json(pantryItem);
}));

pantryRouter.delete("/:id", asyncHandler(async (req, res) => {
  const pantryId = readParam(req.params.id);
  if (!pantryId) {
    return res.status(400).json({ message: "Invalid pantry item id." });
  }

  const existing = await prisma.pantryItem.findFirst({
    where: {
      id: pantryId,
      userId: req.user!.id,
    },
  });

  if (!existing) {
    return res.status(404).json({ message: "Pantry item not found." });
  }

  await prisma.pantryItem.delete({ where: { id: pantryId } });
  res.status(204).send();
}));

