import type { Question } from "./protocol";

// Swap these for your own. `answer` is an index into `options`.
export const QUESTIONS: Question[] = [
  {
    prompt: "What does this log?",
    code: `const arr = [1, 2, 3];
arr.push(4);
arr.unshift(0);
console.log(arr);`,
    options: ["[0, 1, 2, 3, 4]", "[4, 3, 2, 1, 0]", "[1, 2, 3, 4, 0]", "[0, 4, 1, 2, 3]"],
    answer: 0,
    explanation: "push adds to the end, unshift adds to the start: [1,2,3] → [1,2,3,4] → [0,1,2,3,4].",
    seconds: 20,
  },
  {
    prompt: "What does this log?",
    code: `Promise.resolve(1)
  .then((x) => x + 1)
  .then((x) => x * 2)
  .then(console.log);`,
    options: ["1", "2", "4", "undefined"],
    answer: 2,
    explanation: "Each then receives the previous result: 1 → 2 → 4.",
    seconds: 20,
  },
  {
    prompt: "Which HTTP status means “the thing you asked for does not exist”?",
    options: ["301", "403", "404", "500"],
    answer: 2,
    explanation: "404 Not Found. 403 is forbidden, 301 a redirect, 500 a server error.",
    seconds: 15,
  },
  {
    prompt: "Which structure gives O(1) average lookup by key?",
    options: ["Linked list", "Hash map", "Sorted array", "Binary heap"],
    answer: 1,
    explanation: "A hash map jumps to a bucket by hashing the key, so lookup is O(1) on average.",
    seconds: 15,
  },
];
