// src/routes/books.routes.ts
import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { getMongoDb } from "../db/mongo.js";

export const booksRouter = Router();

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BookIdParams {
  id: string;
}

interface BookBody {
  title?: string;
  author?: string;
  year?: number;
}

// ─── Helpers de validación ────────────────────────────────────────────────────
// Extraídos para evitar duplicación (DRY) y facilitar testing unitario

function isValidBookId(id: string): boolean {
  return ObjectId.isValid(id);
}

function validateBookBody(body: BookBody): string | null {
  const { title, author, year } = body;

  if (!title || !author) {
    return "title and author are required";
  }

  if (year !== undefined && (!Number.isInteger(year) || year < 0)) {
    return "year must be a valid positive integer";
  }

  return null; // sin errores
}

// ─── Rutas ────────────────────────────────────────────────────────────────────

/**
 * GET /api/books
 * Lista todos los libros
 */
booksRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const books = await getMongoDb().collection("books").find({}).toArray();

    res.json({
      database: "mongodb",
      count: books.length,
      data: books,
    });
  } catch (error) {
    res.status(500).json(buildErrorResponse(error));
  }
});

/**
 * GET /api/books/:id
 * Obtiene un libro por ID
 */
booksRouter.get("/:id", async (req: Request<BookIdParams>, res: Response) => {
  try {
    const { id } = req.params;

    if (!isValidBookId(id)) {
      res.status(400).json({ message: "Invalid book id" });
      return;
    }

    const book = await getMongoDb()
      .collection("books")
      .findOne({ _id: new ObjectId(id) });

    if (!book) {
      res.status(404).json({ message: "Book not found" });
      return;
    }

    res.json({ database: "mongodb", data: book });
  } catch (error) {
    res.status(500).json(buildErrorResponse(error));
  }
});

/**
 * POST /api/books
 * Crea un nuevo libro
 */
booksRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as BookBody;
    const validationError = validateBookBody(body);

    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    const { title, author, year } = body;

    const newBook = {
      title: title!,
      author: author!,
      ...(year !== undefined && { year }),
      createdAt: new Date(),
    };

    const result = await getMongoDb().collection("books").insertOne(newBook);

    res.status(201).json({
      database: "mongodb",
      data: { _id: result.insertedId, ...newBook },
    });
  } catch (error) {
    res.status(500).json(buildErrorResponse(error));
  }
});

/**
 * PUT /api/books/:id
 * Actualiza un libro completo
 */
booksRouter.put("/:id", async (req: Request<BookIdParams>, res: Response) => {
  try {
    const { id } = req.params;

    if (!isValidBookId(id)) {
      res.status(400).json({ message: "Invalid book id" });
      return;
    }

    const body = req.body as BookBody;
    const validationError = validateBookBody(body);

    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    const { title, author, year } = body;

    const updatedBook = await getMongoDb()
      .collection("books")
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { title, author, year, updatedAt: new Date() } },
        { returnDocument: "after" }
      );

    if (!updatedBook) {
      res.status(404).json({ message: "Book not found" });
      return;
    }

    res.json({ database: "mongodb", data: updatedBook });
  } catch (error) {
    res.status(500).json(buildErrorResponse(error));
  }
});

/**
 * DELETE /api/books/:id
 * Elimina un libro
 */
booksRouter.delete(
  "/:id",
  async (req: Request<BookIdParams>, res: Response) => {
    try {
      const { id } = req.params;

      if (!isValidBookId(id)) {
        res.status(400).json({ message: "Invalid book id" });
        return;
      }

      const result = await getMongoDb()
        .collection("books")
        .deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        res.status(404).json({ message: "Book not found" });
        return;
      }

      res.json({ message: "Book deleted successfully" });
    } catch (error) {
      res.status(500).json(buildErrorResponse(error));
    }
  }
);

// ─── Utilidad interna ─────────────────────────────────────────────────────────
// Centraliza la forma del error para que todas las rutas sean consistentes

function buildErrorResponse(error: unknown) {
  return {
    status: "error",
    database: "mongodb",
    message: error instanceof Error ? error.message : "Unknown error",
  };
}