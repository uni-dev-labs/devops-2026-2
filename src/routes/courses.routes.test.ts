import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMongoDb } from "../db/mongo.js";
import { coursesRouter } from "./courses.routes.js";

vi.mock("../db/mongo.js", () => ({
  getMongoDb: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use("/api/courses", coursesRouter);

describe("courses routes", () => {
  beforeEach(() => {
    vi.mocked(getMongoDb).mockReset();
  });

  it("rejects course creation when name or a positive price is missing", async () => {
    const response = await request(app)
      .post("/api/courses")
      .send({ name: "TypeScript" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: "name and a positive price are required",
    });
    expect(getMongoDb).not.toHaveBeenCalled();
  });

  it("returns a database error when listing courses fails", async () => {
    vi.mocked(getMongoDb).mockImplementation(() => {
      throw new Error("MongoDB is not connected");
    });

    const response = await request(app).get("/api/courses");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      status: "error",
      database: "mongodb",
      message: "MongoDB is not connected",
    });
  });
});
