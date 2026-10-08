import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getRedisClient } from "../db/redis.js";

export const redisRouter = Router();

redisRouter.get("/health", async (_req: Request, res: Response) => {
  try {
    const ping = await getRedisClient().ping();
    res.json({
      status: "ok",
      database: "redis",
      ping,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(503).json({
      status: "error",
      database: "redis",
      message,
    });
  }
});

redisRouter.get("/users", async (_req: Request, res: Response) => {
  try {
    const usersById = await getRedisClient().hGetAll("users");
    const users = Object.values(usersById).map((user) =>
      JSON.parse(user) as { id: string; name: string; email: string; createdAt: string }
    );

    res.json({
      database: "redis",
      count: users.length,
      data: users,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      status: "error",
      database: "redis",
      message,
    });
  }
});

redisRouter.post("/users", async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body as { name?: string; email?: string };

    if (!name || !email) {
      res.status(400).json({ message: "name and email are required" });
      return;
    }

    const user = {
      id: randomUUID(),
      name,
      email,
      createdAt: new Date().toISOString(),
    };

    await getRedisClient().hSet("users", user.id, JSON.stringify(user));

    res.status(201).json({
      database: "redis",
      data: user,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      status: "error",
      database: "redis",
      message,
    });
  }
});
