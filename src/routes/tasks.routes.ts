import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";

export const tasksRouter = Router();

// GET /api/tasks: listar tareas
tasksRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const tasks = await getMongoDb()
      .collection("tasks")
      .find({})
      .toArray();

    res.json({
      database: "mongodb",
      count: tasks.length,
      data: tasks,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    res.status(500).json({
      status: "error",
      database: "mongodb",
      message,
    });
  }
});

// POST /api/tasks: crear una tarea
tasksRouter.post("/", async (req: Request, res: Response) => {
  const { title, description } = req.body as {
    title?: string;
    description?: string;
  };

  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({
      message: "title is required",
    });
    return;
  }

  try {
    const task = {
      title: title.trim(),
      description:
        typeof description === "string" ? description.trim() : "",
      completed: false,
      createdAt: new Date(),
    };

    const result = await getMongoDb()
      .collection("tasks")
      .insertOne(task);

    res.status(201).json({
      database: "mongodb",
      data: { _id: result.insertedId, ...task },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    res.status(500).json({
      status: "error",
      database: "mongodb",
      message,
    });
  }
});

