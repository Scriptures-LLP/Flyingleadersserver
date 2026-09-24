import { Schema, model } from "mongoose";

const chatConversationSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    status: { type: String, enum: ["open", "escalated", "closed"], default: "open" },
    lastMessageAt: { type: Date, default: Date.now },
    // Set when the assistant handed the conversation to the team. Kept apart from
    // `status`, which flips to "closed" as soon as the customer reopens the
    // assistant — the flag has to outlive that so it isn't lost.
    escalatedAt: { type: Date },
    escalationReason: { type: String, trim: true },
  },
  { timestamps: true },
);

export const ChatConversation = model("ChatConversation", chatConversationSchema);
