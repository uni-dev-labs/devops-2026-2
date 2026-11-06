import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";

export const productsRouter = Router();

productsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const products = await getMongoDb().collection("products").find({}).toArray();

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

productsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { name, price } = req.body as { name?: string; price?: number };
    const productName = typeof name === "string" ? name.trim() : "";

    if (!productName || typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      res.status(400).json({ message: "name and a positive price are required" });
      return;
    }

    const doc = {
      name: productName,
      price,
      createdAt: new Date(),
    };
    const result = await getMongoDb().collection("products").insertOne(doc);

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
