import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";

export const productsRouter = Router();

productsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const db = getMongoDb();

    const products = await db
      .collection("products")
      .find({})
      .toArray();

    res.json({
      database: "mongodb",
      count: products.length,
      data: products,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    res.status(500).json({
      status: "error",
      message,
    });
  }
});

productsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { name, price } = req.body as {
      name?: string;
      price?: number;
    };

    if (!name || !price) {
      res.status(400).json({
        message: "name and price are required",
      });
      return;
    }

    const db = getMongoDb();

    const product = {
      name,
      price,
      createdAt: new Date(),
    };

    const result = await db.collection("products").insertOne(product);

    res.status(201).json({
      data: {
        _id: result.insertedId,
        ...product,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    res.status(500).json({
      status: "error",
      message,
    });
  }
});