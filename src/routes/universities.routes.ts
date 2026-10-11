import { Router, type Request, type Response } from "express";
import {
  createUniversity,
  listUniversities,
  ValidationError,
} from "../services/universities.service.js";

export const universitiesRouter = Router();

// GET /api/universities → lista las universidades
universitiesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const universities = await listUniversities();
    res.json({ database: "postgresql", count: universities.length, data: universities });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "postgresql", message });
  }
});

// POST /api/universities → crea una universidad { name, city }
universitiesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const university = await createUniversity(req.body);
    res.status(201).json({ database: "postgresql", data: university });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "postgresql", message });
  }
});