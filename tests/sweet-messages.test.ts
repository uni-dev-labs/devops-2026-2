import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { mongoInsertOne, mongoFind } = vi.hoisted(() => ({
  mongoInsertOne: vi.fn(),
  mongoFind: vi.fn(),
}));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: vi.fn() },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({
    collection: () => ({
      insertOne: mongoInsertOne,
      find: () => ({
        toArray: mongoFind,
      }),
    }),
  }),
}));

import { createApp } from "../src/app.js";

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Sweet Messages endpoints (Cross-database bridge)", () => {
  it("POST /api/sweet-messages conecta usuarios de Postgres y Mongo y responde 201", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: "sweet-msg-01" });

    const payload = {
      sender: "Daniel Esteban",
      senderOrigin: "postgres",
      receiver: "Compañeros DevOps",
      receiverTarget: "mongo",
      message: "¡Mucho éxito en la entrega de DevOps, quedó genial!",
      category: "ánimo",
      emoji: "💖",
    };

    const res = await request(app).post("/api/sweet-messages").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.channel).toBe("cross-database-messenger");
    expect(res.body.bridge).toBe("postgres ➔ mongo");
    expect(res.body.data).toMatchObject({
      _id: "sweet-msg-01",
      sender: "Daniel Esteban",
      senderOrigin: "postgres",
      receiver: "Compañeros DevOps",
      receiverTarget: "mongo",
      message: "¡Mucho éxito en la entrega de DevOps, quedó genial!",
      emoji: "💖",
    });
    expect(mongoInsertOne).toHaveBeenCalledOnce();
  });

  it("POST /api/sweet-messages sin destinatario o mensaje responde 400", async () => {
    const res = await request(app)
      .post("/api/sweet-messages")
      .send({ sender: "Daniel Esteban" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "sender, receiver and message are required",
    });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });

  it("POST /api/sweet-messages con mensaje menor a 3 caracteres responde 400", async () => {
    const res = await request(app)
      .post("/api/sweet-messages")
      .send({ sender: "Daniel Esteban", receiver: "Ana", message: "hi" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "message must be at least 3 characters long",
    });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });

  it("GET /api/sweet-messages devuelve la lista de mensajes y conteo", async () => {
    const dummyMessages = [
      {
        _id: "msg-1",
        sender: "Daniel Esteban",
        senderOrigin: "postgres",
        receiver: "Esteban",
        receiverTarget: "mongo",
        message: "¡Excelente trabajo en equipo! 🌸",
        createdAt: new Date().toISOString(),
      },
    ];
    mongoFind.mockResolvedValueOnce(dummyMessages);

    const res = await request(app).get("/api/sweet-messages");

    expect(res.status).toBe(200);
    expect(res.body.channel).toBe("cross-database-messenger");
    expect(res.body.count).toBe(1);
    expect(res.body.data).toEqual(dummyMessages);
  });

  it("GET /api/sweet-messages/random responde 200 con un mensaje de aliento", async () => {
    mongoFind.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/sweet-messages/random");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.quote).toBeDefined();
    expect(res.body.emoji).toBeDefined();
  });
});
