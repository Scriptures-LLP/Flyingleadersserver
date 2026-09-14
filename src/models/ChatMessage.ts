import { Schema, model } from "mongoose";

const chatMessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "ChatConversation", required: true, index: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    toolCalls: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const ChatMessage = model("ChatMessage", chatMessageSchema);
