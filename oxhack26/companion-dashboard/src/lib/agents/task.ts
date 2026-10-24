import { z } from "zod";
import { generateObject } from "../ai";
import { addTask, listTasks, removeTask, setTaskDone } from "../db";
import type { GraphState } from "./graph";

const actionSchema = z.object({
  action: z.enum(["add", "complete", "remove", "list"]),
  // For add: the new item. For complete/remove: words from the existing item.
  title: z.string().nullable(),
});

export async function taskAgent(state: GraphState) {
  const tasks = listTasks();
  const action = await generateObject({
    schema: actionSchema,
    system: "You turn a message about a to-do list into one action.",
    prompt: `To-do list:\n${tasks.map((t) => `- ${t.title}${t.done ? " (done)" : ""}`).join("\n") || "(empty)"}\n\nMessage: "${state.input}"`,
  });

  const title = action.title?.trim() ?? "";
  const match = () => tasks.find((t) => t.title.toLowerCase().includes(title.toLowerCase()));

  // Every reply below is built from what happened, not from model text.
  switch (action.action) {
    case "add": {
      if (!title) return { reply: "What would you like me to add?" };
      addTask(title, state.role);
      return { reply: `Added “${title}” to the list.` };
    }
    case "complete": {
      const task = title ? match() : undefined;
      if (!task) return { reply: "I couldn't find that on the list." };
      setTaskDone(task.id, true);
      return { reply: `Marked “${task.title}” as done. Well done!` };
    }
    case "remove": {
      const task = title ? match() : undefined;
      if (!task) return { reply: "I couldn't find that on the list." };
      removeTask(task.id);
      return { reply: `Removed “${task.title}” from the list.` };
    }
    case "list": {
      const open = tasks.filter((t) => !t.done);
      return {
        reply: open.length
          ? `Still to do: ${open.map((t) => t.title).join(", ")}.`
          : "Nothing left on the list today.",
      };
    }
  }
}
