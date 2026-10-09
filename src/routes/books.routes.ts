import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";

export const booksRouter = Router();

// GET /api/books → lista los libros
booksRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const books = await getMongoDb().collection("books").find({}).toArray();
    res.json({ database: "mongodb", count: books.length, data: books });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "mongodb", message });
  }
});

// POST /api/books → crea un libro { title, author, pages }
booksRouter.post("/", async (req: Request, res: Response) => {
  const { title, author, pages } = req.body as {
    title?: string;
    author?: string;
    pages?: number;
  };

  if (!title || !author || typeof pages !== "number" || pages <= 0) {
    res
      .status(400)
      .json({ message: "title, author and a positive pages number are required" });
    return;
  }

  try {
    const doc = { title, author, pages, createdAt: new Date() };
    const result = await getMongoDb().collection("books").insertOne(doc);
    res.status(201).json({ database: "mongodb", data: { _id: result.insertedId, ...doc } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "mongodb", message });
  }
});