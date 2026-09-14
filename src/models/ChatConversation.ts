import { Schema, model } from "mongoose";

const chatConversationSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    status: { type: String, enum: ["open", "escalated", "closed"], default: "open" },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const ChatConversation = model("ChatConversation", chatConversationSchema);
