import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";


export const universitiesRouter = Router();

// GET /api/universities -> Lista todas las universidades
universitiesRouter.get("/", async (_req: Request, res: Response) => {
    try {
        const universities = await getMongoDb().collection("universities").find({}).toArray();
        res.json({ database: "mongodb", count: universities.length, data: universities });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ status: "error", database: "mongodb", message });
    }
});

    // POST /api/universities -> Crea una nueva universidad
universitiesRouter.post("/", async (req: Request, res: Response) => {
    const { name, students } = req.body as { name?: string; students?: number };
    
    // Aquí está la validación que pide el profesor
    if (!name || typeof students !== "number" || students <= 0) {
        res.status(400).json({ message: "name and a positive students count are required" });
        return;
    }
    
    try {
        const doc = { name, students, createdAt: new Date() };
        const result = await getMongoDb().collection("universities").insertOne(doc);
        res.status(201).json({ database: "mongodb", data: { id: result.insertedId, ...doc } });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ status: "error", database: "mongodb", message });
    }
});