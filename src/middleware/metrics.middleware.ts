import type {Request, Response, NextFunction} from "express";
import {recordSample} from "../services/metrics.service.js";
import { nextTick } from "node:process";

export function metricsMiddleware(_requ: Request, res: Response, next: NextFunction): void{
    const start = performance.now();
    res.on("finish", () => {
        recordSample("api", performance.now() - start, res.statusCode < 500);
    });
    next();
}