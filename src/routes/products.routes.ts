import { Router, type Request, type Response } from "express";

export const productsRouter = Router();

const products: Array<{
  id: number;
  name: string;
  price: number;
}> = [];

productsRouter.get("/", (_req: Request, res: Response) => {
  res.json({
    count: products.length,
    data: products,
  });
});

productsRouter.post("/", (req: Request, res: Response) => {
  const { name, price } = req.body;

  if (!name || price === undefined) {
    res.status(400).json({
      message: "name and price are required",
    });
    return;
  }

  const product = {
    id: products.length + 1,
    name,
    price,
  };

  products.push(product);

  res.status(201).json(product);
});