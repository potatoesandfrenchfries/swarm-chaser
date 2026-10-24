import { generateReply } from "../ai";
import { getMember, listMessages, listNotes, listTasks } from "../db";
import type { GraphState } from "./graph";

export async function companionAgent(state: GraphState) {
  const member = getMember();
  // Both personas read the member's thread: it is the context. The overseer's
  // own questions are a separate thread and never reach the member's prompts.
  const history = listMessages("member", 8)
    .map((m) => `${m.role === "user" ? m.speaker : "assistant"}: ${m.text}`)
    .join("\n");

  // Same agent, two personas. The member gets a warm companion; the overseer
  // gets a briefing built from the live data.
  if (state.role === "overseer") {
    const open = listNotes().filter((n) => !n.resolved);
    const tasks = listTasks();
    return {
      reply: await generateReply({
        system: `You assist the person overseeing ${member.name}'s care. Be brief and factual. Use only the data given; say so if something is not recorded.`,
        prompt: `Profile: ${member.profile}
Open notes:\n${open.map((n) => `- [${n.severity}] ${n.text}`).join("\n") || "(none)"}
To-do list:\n${tasks.map((t) => `- ${t.title}${t.done ? " (done)" : ""}`).join("\n") || "(empty)"}
Recent conversation:\n${history || "(none)"}

Question: ${state.input}`,
      }),
    };
  }

  return {
    reply: await generateReply({
      system: `You are a calm, warm companion for ${member.name}. Use short sentences and plain words. Never correct or quiz them. If you don't know something, say so gently. Do not give medical advice.`,
      prompt: `About ${member.name}: ${member.profile}
Recent conversation:\n${history || "(none)"}

${member.name} says: ${state.input}`,
    }),
  };
}
