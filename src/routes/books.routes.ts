import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";

export const booksRouter = Router();

booksRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const books = await getMongoDb().collection("books").find({}).toArray();

    res.json({
      database: "mongodb",
      count: books.length,
      data: books,
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

booksRouter.post("/", async (req: Request, res: Response) => {
  const { title, author } = req.body as {
    title?: unknown;
    author?: unknown;
  };

  if (
    typeof title !== "string" ||
    title.trim().length === 0 ||
    typeof author !== "string" ||
    author.trim().length === 0
  ) {
    res.status(400).json({
      message: "title and author are required",
    });
    return;
  }

  try {
    const doc = {
      title: title.trim(),
      author: author.trim(),
      createdAt: new Date(),
    };
    const result = await getMongoDb().collection("books").insertOne(doc);

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
