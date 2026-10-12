import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";

export const productsRouter = Router();

// GET /api/products → lista los productos
productsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const db = getMongoDb();
    const products = await db.collection("products").find({}).toArray();

    res.json({
      database: "mongodb",
      count: products.length,
      data: products,
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

// POST /api/products → crea un producto { name, price }
productsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { name, price } = req.body as { name?: string; price?: number };

    if (!name || typeof price !== "number" || price <= 0) {
      res.status(400).json({ message: "name and a positive price are required" });
      return;
    }

    const db = getMongoDb();
    const doc = {
      name,
      price,
      createdAt: new Date(),
    };

    const result = await db.collection("products").insertOne(doc);

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
