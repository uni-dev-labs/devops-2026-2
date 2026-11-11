import {Router, type Request, type Response} from "express";
import { getAllStats } from "../services/metrics.service.js";

export const metricsRouter = Router();

metricsRouter.get("/", (_requ: Request, res: Response) => {
    res.json({generatedAt: new Date().toISOString(),services: getAllStats()});
    
})