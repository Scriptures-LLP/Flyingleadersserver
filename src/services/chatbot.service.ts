import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/index.js";

import { env } from "../config/env.js";
import { Booking } from "../models/Booking.js";
import { ChatConversation } from "../models/ChatConversation.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { Tour } from "../models/Tour.js";
import { ApiError } from "../utils/ApiError.js";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!env.LLM_API_KEY) throw ApiError.badRequest("The chat assistant isn't configured on this server yet");
  if (!client) client = new OpenAI({ apiKey: env.LLM_API_KEY });
  return client;
}

const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are the in-app assistant for Flying Leader, a group-tour travel company. Tours are
pre-designed, fixed packages — customers browse and book them as-is; you cannot customize hotels, sightseeing,
or vehicles for anyone. Answer questions about how booking and payment work (browse a tour, pick travelers and a
date, pay in full or a partial "token" amount via Razorpay, get a confirmation), general trip FAQs, and — using
the get_booking_status tool — the status of a customer's own specific booking when they give you a booking
reference (it looks like "FL" followed by letters/numbers). Never invent a booking status; always call the tool.
Keep answers short and friendly. If you don't know something or the customer needs a human (a refund request,
a complaint, a custom itinerary), call escalate_to_human instead of guessing.`;

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_booking_status",
      description: "Look up the current status and details of the customer's own booking by its reference code.",
      parameters: {
        type: "object",
        properties: { bookingRef: { type: "string", description: "e.g. FLMU0OMML6FCD5" } },
        required: ["bookingRef"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description: "Hand off to the Flying Leader team when you can't help or the customer needs a human.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
      },
    },
  },
];

async function runTool(name: string, args: Record<string, unknown>, customerId: string): Promise<string> {
  if (name === "get_booking_status") {
    const booking = await Booking.findOne({ bookingRef: args.bookingRef, customerId });
    if (!booking) return JSON.stringify({ found: false });
    const tour = await Tour.findById(booking.tourId).select("title");
    return JSON.stringify({
      found: true,
      tour: tour?.title,
      travelDate: booking.travelDate,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      amountPaid: booking.amountPaid,
      totalPayable: booking.pricing.finalAmount,
    });
  }
  if (name === "escalate_to_human") {
    return JSON.stringify({ escalated: true });
  }
  return JSON.stringify({ error: "unknown tool" });
}

export async function sendMessage(customerId: string, content: string) {
  let conversation = await ChatConversation.findOne({ customerId, status: { $ne: "closed" } }).sort({
    createdAt: -1,
  });
  if (!conversation) conversation = await ChatConversation.create({ customerId });

  await ChatMessage.create({ conversationId: conversation._id, role: "user", content });

  const history = await ChatMessage.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
  ];

  const openai = getClient();
  let escalated = false;

  for (let round = 0; round < 3; round++) {
    const completion = await openai.chat.completions.create({ model: MODEL, messages, tools });
    const choice = completion.choices[0]!.message;

    if (!choice.tool_calls?.length) {
      const reply = choice.content ?? "Sorry, I couldn't come up with a response — please try rephrasing.";
      await ChatMessage.create({ conversationId: conversation._id, role: "assistant", content: reply });
      conversation.lastMessageAt = new Date();
      if (escalated) conversation.status = "escalated";
      await conversation.save();
      return { reply, escalated: conversation.status === "escalated" };
    }

    messages.push(choice);
    for (const call of choice.tool_calls) {
      if (call.type !== "function") continue;
      if (call.function.name === "escalate_to_human") escalated = true;
      const args = JSON.parse(call.function.arguments || "{}");
      const result = await runTool(call.function.name, args, customerId);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  throw ApiError.badRequest("The assistant is having trouble responding right now — please try again.");
}

/**
 * Called when the customer opens the assistant — closes whatever
 * conversation is currently open so the next message starts clean, with no
 * old context carried into the AI's prompt and nothing to display as
 * "history." Idempotent: no-op if there's nothing open.
 */
export async function startNewConversation(customerId: string): Promise<void> {
  await ChatConversation.updateMany({ customerId, status: { $ne: "closed" } }, { status: "closed" });
}

export async function getHistory(customerId: string) {
  const conversation = await ChatConversation.findOne({ customerId, status: { $ne: "closed" } }).sort({
    createdAt: -1,
  });
  if (!conversation) return [];
  return ChatMessage.find({ conversationId: conversation._id, role: { $ne: "system" } }).sort({ createdAt: 1 });
}
