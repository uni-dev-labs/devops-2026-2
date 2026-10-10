import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";

export const tasksRouter = Router();

// POST /api/tasks - creates a task with a title and a positive priority.
tasksRouter.post("/", async (req: Request, res: Response) => {
  const { title, priority } = req.body as { title?: string; priority?: number };

  if (!title || typeof priority !== "number" || priority <= 0) {
    res.status(400).json({
      message: "title and a positive priority are required",
    });
    return;
  }

  try {
    const task = {
      title,
      priority,
      createdAt: new Date(),
    };
    const result = await getMongoDb().collection("tasks").insertOne(task);

    res.status(201).json({
      database: "mongodb",
      data: { _id: result.insertedId, ...task },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "mongodb", message });
  }
});
