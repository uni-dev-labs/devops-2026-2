import { Router, type Request, type Response } from "express";
import { getMongoDb } from "../db/mongo.js";

export const sweetMessagesRouter = Router();

type DbOrigin = "mongo" | "postgres";

const ALLOWED_ORIGINS: DbOrigin[] = ["mongo", "postgres"];

// GET /api/sweet-messages -> Lista todos los mensajitos tiernos entre usuarios
sweetMessagesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { receiver, target } = req.query as { receiver?: string; target?: string };
    const query: Record<string, unknown> = {};

    if (receiver) {
      query.receiver = receiver;
    }
    if (target && ALLOWED_ORIGINS.includes(target as DbOrigin)) {
      query.receiverTarget = target;
    }

    const messages = await getMongoDb()
      .collection("sweet_messages")
      .find(query)
      .toArray();

    res.json({
      database: "mongodb",
      channel: "cross-database-messenger",
      count: messages.length,
      data: messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "mongodb", message });
  }
});

// GET /api/sweet-messages/random -> Mensajito sorpresa para alegrar el día
sweetMessagesRouter.get("/random", async (_req: Request, res: Response) => {
  try {
    const messages = await getMongoDb()
      .collection("sweet_messages")
      .find({})
      .toArray();

    if (messages.length > 0) {
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      res.json({
        status: "ok",
        quote: randomMsg.message,
        from: `${randomMsg.sender} (${randomMsg.senderOrigin})`,
        to: `${randomMsg.receiver} (${randomMsg.receiverTarget})`,
        emoji: randomMsg.emoji,
      });
      return;
    }

    res.json({
      status: "ok",
      quote: "¡Mucho ánimo con tus proyectos y entregas de DevOps! Lo estás haciendo genial ✨💖",
      from: "DevOps Bot (sistema)",
      to: "Comunidad DevOps",
      emoji: "🌟",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "mongodb", message });
  }
});

// POST /api/sweet-messages -> Envía un mensajito tierno conectando usuarios de Postgres y Mongo
sweetMessagesRouter.post("/", async (req: Request, res: Response) => {
  const {
    sender,
    senderOrigin = "mongo",
    receiver,
    receiverTarget = "postgres",
    message,
    category = "ánimo",
    emoji = "💌",
  } = req.body as {
    sender?: string;
    senderOrigin?: string;
    receiver?: string;
    receiverTarget?: string;
    message?: string;
    category?: string;
    emoji?: string;
  };

  if (!sender || !receiver || !message) {
    res.status(400).json({
      message: "sender, receiver and message are required",
    });
    return;
  }

  if (typeof message !== "string" || message.trim().length < 3) {
    res.status(400).json({
      message: "message must be at least 3 characters long",
    });
    return;
  }

  const validSenderOrigin = ALLOWED_ORIGINS.includes(senderOrigin as DbOrigin)
    ? (senderOrigin as DbOrigin)
    : "mongo";
  const validReceiverTarget = ALLOWED_ORIGINS.includes(receiverTarget as DbOrigin)
    ? (receiverTarget as DbOrigin)
    : "postgres";

  try {
    const doc = {
      sender: sender.trim(),
      senderOrigin: validSenderOrigin,
      receiver: receiver.trim(),
      receiverTarget: validReceiverTarget,
      message: message.trim(),
      category: typeof category === "string" ? category.trim() : "ánimo",
      emoji: typeof emoji === "string" ? emoji.trim() : "💌",
      createdAt: new Date(),
    };

    const result = await getMongoDb().collection("sweet_messages").insertOne(doc);

    res.status(201).json({
      database: "mongodb",
      channel: "cross-database-messenger",
      bridge: `${validSenderOrigin} ➔ ${validReceiverTarget}`,
      data: {
        _id: result.insertedId,
        ...doc,
      },
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "mongodb", message: errMessage });
  }
});
