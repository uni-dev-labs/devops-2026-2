import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";
import { pgPool } from "../db/postgres.js";

export const booksRouter = Router();

const createBooksTableQuery = `
  CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    book_name TEXT NOT NULL,
    author TEXT NOT NULL
  )
`;

booksRouter.get("/postgres/books", async (_req: Request, res: Response) => {
  try {
    await pgPool.query(createBooksTableQuery);

    const result = await pgPool.query(
      "SELECT id, book_name, author FROM books ORDER BY id ASC"
    );

    res.json({
      database: "postgresql",
      count: result.rowCount ?? 0,
      data: result.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      status: "error",
      database: "postgresql",
      message,
    });
  }
});

booksRouter.post("/postgres/books", async (req: Request, res: Response) => {
  try {
    const { book_name, author } = req.body as {
      book_name?: string;
      author?: string;
    };

    if (!book_name || !author) {
      res.status(400).json({ message: "book_name and author are required" });
      return;
    }

    await pgPool.query(createBooksTableQuery);

    const result = await pgPool.query(
      `INSERT INTO books (book_name, author)
       VALUES ($1, $2)
       RETURNING id, book_name, author`,
      [book_name, author]
    );

    res.status(201).json({
      database: "postgresql",
      data: result.rows[0],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      status: "error",
      database: "postgresql",
      message,
    });
  }
});

booksRouter.get("/mongo/books", async (_req: Request, res: Response) => {
  try {
    const books = await getMongoDb()
      .collection("books")
      .find({})
      .project({ book_name: 1, author: 1 })
      .toArray();

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

booksRouter.post("/mongo/books", async (req: Request, res: Response) => {
  try {
    const { book_name, author } = req.body as {
      book_name?: string;
      author?: string;
    };

    if (!book_name || !author) {
      res.status(400).json({ message: "book_name and author are required" });
      return;
    }

    const book = { book_name, author };
    const result = await getMongoDb().collection("books").insertOne(book);

    res.status(201).json({
      database: "mongodb",
      data: { _id: result.insertedId, ...book },
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
