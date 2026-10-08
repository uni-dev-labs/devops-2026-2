import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { getMongoDb } from "../db/mongo.js";

export const mongoRouter = Router();

mongoRouter.get("/health", async (_req: Request, res: Response) => {
  try {
    const db = getMongoDb();
    const ping = await db.command({ ping: 1 });
    res.json({
      status: "ok",
      database: "mongodb",
      ping,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(503).json({
      status: "error",
      database: "mongodb",
      message,
    });
  }
});

mongoRouter.get("/users", async (_req: Request, res: Response) => {
  try {
    const db = getMongoDb();
    const users = await db
      .collection("users")
      .find({})
      .project({ name: 1, email: 1, createdAt: 1 })
      .toArray();

    res.json({
      database: "mongodb",
      count: users.length,
      data: users,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      status: "error",
      database: "mongodb",
      message,
    });
  }
});

mongoRouter.post("/users", async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body as { name?: string; email?: string };

    if (!name || !email) {
      res.status(400).json({ message: "name and email are required" });
      return;
    }

    const db = getMongoDb();
    const doc = {
      name,
      email,
      createdAt: new Date(),
    };

    const result = await db.collection("users").insertOne(doc);

    res.status(201).json({
      database: "mongodb",
      data: { _id: result.insertedId, ...doc },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      status: "error",
      database: "mongodb",
      message,
    });
  }
});

mongoRouter.put("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, email } = req.body as { name?: string; email?: string };

    if (!ObjectId.isValid(id)) {
      res.status(400).json({ message: "id is not a valid ObjectId" });
      return;
    }

    if (!name && !email) {
      res.status(400).json({ message: "name or email is required" });
      return;
    }

    const changes: { name?: string; email?: string } = {};
    if (name) changes.name = name;
    if (email) changes.email = email;

    const db = getMongoDb();
    const updated = await db
      .collection("users")
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: changes },
        { returnDocument: "after" }
      );

    if (!updated) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({
      database: "mongodb",
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      status: "error",
      database: "mongodb",
      message,
    });
  }
});
