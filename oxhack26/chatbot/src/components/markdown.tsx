import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  markdownRenderBlocks,
  rendersAsBlocks,
} from "~/lib/vendor/markdown-blocks";

const remarkPlugins = [remarkGfm];
const components = {
  a: (props: React.ComponentProps<"a">) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

/** One parse unit. Memoized, so a finished block is never re-parsed. */
const Block = memo(function Block({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {children}
    </ReactMarkdown>
  );
});

/**
 * Renders a reply block by block: while it streams only the growing tail is
 * re-parsed. A block's index is its key, so it keeps the same key when the
 * stream ends and nothing is rebuilt.
 */
export function Markdown({
  children,
  streaming = false,
}: {
  children: string;
  streaming?: boolean;
}) {
  const blocks = useMemo(
    () =>
      rendersAsBlocks(children)
        ? markdownRenderBlocks(children, streaming)
        : [children],
    [children, streaming]
  );
  return (
    <div className="markdown">
      {blocks.map((block, i) => (
        <Block key={i}>{block}</Block>
      ))}
    </div>
  );
}
