import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";
import { parsePagination } from "../services/pagination.service.js";

export const booksRouter = Router();

// GET /api/books → lista los libros (acepta ?page y ?limit)
booksRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { limit, offset } = parsePagination(req.query);

    const db = getMongoDb();
    const books = await db.collection("books").find({}).skip(offset).limit(limit).toArray();

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

// POST /api/books → crea un libro { title, author }
booksRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { title, author } = req.body as { title?: string; author?: string };

    if (!title || !author) {
      res.status(400).json({ message: "title and author are required" });
      return;
    }

    const db = getMongoDb();
    const doc = {
      title,
      author,
      createdAt: new Date(),
    };

    const result = await db.collection("books").insertOne(doc);

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
