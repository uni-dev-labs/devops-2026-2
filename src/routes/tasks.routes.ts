import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";

export const tasksRouter = Router();

// GET /api/tasks → lista las tareas
tasksRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const tasks = await getMongoDb().collection("tasks").find({}).toArray();
    res.json({ database: "mongodb", count: tasks.length, data: tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "mongodb", message });
  }
});

// POST /api/tasks → crea una tarea { title, priority }
tasksRouter.post("/", async (req: Request, res: Response) => {
  const { title, priority } = req.body as { title?: string; priority?: number };

  if (!title || typeof priority !== "number" || priority <= 0) {
    res.status(400).json({ message: "title and a positive priority are required" });
    return;
  }

  try {
    const doc = { title, priority, createdAt: new Date() };
    const result = await getMongoDb().collection("tasks").insertOne(doc);
    res.status(201).json({
      database: "mongodb",
      data: { _id: result.insertedId, ...doc },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "mongodb", message });
  }
});
